const { JWT } = require('google-auth-library');
const auth = require('./_auth');

// Whitelist of spreadsheet IDs this endpoint is allowed to read, so it can't
// be used as an open proxy to any sheet the service account happens to see.
// Add a new line here whenever a new project's Google Sheet is connected.
const ALLOWED_SPREADSHEETS = new Set([
  '1r9f3Vdl6ldgQeL50tHX4TxjVP0H_UxYeYFKhGFp0yeQ', // Talaeen (formerly Yektanet)
  '1DdhvkT6gVXKoDiicgXnXHTq32yZg3aGpJx97RT4wYeU', // Blue
  '1zBI8XWTlU0huKwd-_IQYvdwxAinvJjAnD7ZPwedO5UA', // Blue Junior
  '18ohsYVwngt7UJ5BwvBBWdhpQ2IOxO4b08-D4OMm2VEQ', // Wepod
  '1EvYoVf6HYp3Nbo02N47qYtaLesJBDVi9urQvOXVs1LQ', // Bankino
  '1sjDcBvUZhJKpBzBngCWmxOXURR0MzPdjs9p8v5CyUxU', // Shahr-e Lavazem Khanegi
  '1dgyCKN89-SF-3IANYg2F9F3tySvjnr4oyn9pbkukAFI', // Snapp Pay
  '1u3kf4CxRJNghQDk-0A7hbYEVktVbprlLfByF2X9gR_c', // Snapp Cab
  '1SUcOo8o0lwtSQH-HCtm8HipVqN52abbI-Ds77ZeotFg', // Snapp Bimeh
  '1VTHX_I9LBBYc0fpVBAUZm2Nn7ihtPqbpxLay_yDlUBE', // Tochal
  '18dU5hlkIxoqF000GjgkPlJ6EbBXU0b_TzP0DAMpiJzw', // Arzplus
  '1fOn7G0qGS98KL-hU2oNZBqoacTkuasmkDZEQGXLKzD0', // Ramzarz News
  '10hRbyK0f2x7jrzZ8vYgQA8GoG_xONdL73AwXAsPPYLI', // Firouzeh
  '1OJcJVwBH2qBftWC9W1ddVgnPXfRuQdzYjYWbGWPqv5Q', // Tara
  '1Gp30Q3tpfJw0Z8NNHOcCpvptyKZnh0ABw3P5Prf5BP8', // Talasea (Talasea / Noghresea / Meschi web)
  '1oG7M3zng4jG57tbKwGyUbfsNGFb_Vu-QQT_-_KBVSck', // Agah
  '1izpnAk0BM49IMTsBv1HTuEUh5dCTT61ukMA-fklLOgk'  // Technopay
]);

let cachedClient = null;
function getClient() {
  if (cachedClient) return cachedClient;
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
  if (!email || !key) {
    throw new Error('Missing GOOGLE_SERVICE_ACCOUNT_EMAIL or GOOGLE_PRIVATE_KEY environment variables');
  }
  cachedClient = new JWT({
    email,
    key,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly']
  });
  return cachedClient;
}

// Google allows the service account 60 read requests a minute, and every
// dashboard load used to spend one per tab (about 40). Now the browser asks
// for all the tabs of a spreadsheet at once and they are read with one
// batchGet, which Google counts as a single request. On top of that each warm
// function instance keeps what it read for two minutes, and keeps it longer
// as a fallback for when Google refuses with a quota error.
const memo = new Map();             // key → { at, payload }
const FRESH_MS = 2 * 60 * 1000;
const FALLBACK_MS = 24 * 60 * 60 * 1000;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const isQuota = err => {
  const code = err && (err.code || (err.response && err.response.status));
  return Number(code) === 429 || /quota/i.test((err && err.message) || '');
};

// Rows go out as arrays under one header list rather than as objects that
// repeat every column name, which roughly halves what the browser has to
// download and parse; the front-end turns them back into objects. Rows with
// nothing in them (pre-formatted blank lines at the bottom of a sheet) are
// dropped here.
function compact(values){
  if(!values || !values.length) return { headers: [], rows: [] };
  const [headers, ...rows] = values;
  const filled = rows
    .filter(row => row.some(v => v !== '' && v !== null && v !== undefined))
    .map(row => headers.map((h, i) => row[i] !== undefined ? row[i] : ''));
  return { headers, rows: filled };
}

async function readSheets(spreadsheetId, sheets){
  const client = getClient();
  // UNFORMATTED_VALUE returns the cell's real number instead of the text the
  // sheet happens to display: a Cost column formatted as scientific
  // ("1.48E+08") or rounded for width would otherwise reach the dashboard
  // already mangled. Dates still come through as their displayed string
  // rather than a serial number, which is what the front-end parses.
  const ranges = sheets.map(sh => 'ranges=' + encodeURIComponent(`${sh}!A:Z`)).join('&');
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchGet?${ranges}`
    + `&valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING`;
  // A quota refusal is retried twice, a moment apart, before giving up.
  for(let attempt = 0; ; attempt++){
    try{
      const response = await client.request({ url });
      const out = {};
      (response.data.valueRanges || []).forEach((vr, i) => { out[sheets[i]] = compact(vr.values); });
      return out;
    }catch(err){
      if(!isQuota(err) || attempt >= 2) throw err;
      await sleep(attempt === 0 ? 1500 : 3000);
    }
  }
}

module.exports = async (req, res) => {
  // Data only for someone signed in (see _auth.js).
  if (!auth.getSession(req)) {
    res.setHeader('Cache-Control', 'no-store');
    res.status(401).json({ error: 'login required', code: 'auth' });
    return;
  }
  try {
    const { spreadsheetId } = req.query;
    const raw = req.query.sheet;
    const sheets = [...new Set([].concat(raw || []).filter(Boolean))];
    if (!spreadsheetId || !sheets.length) {
      res.status(400).json({ error: 'Missing spreadsheetId or sheet query param' });
      return;
    }
    if (!ALLOWED_SPREADSHEETS.has(spreadsheetId)) {
      res.status(403).json({ error: 'This spreadsheet is not in the allowed list' });
      return;
    }

    const key = spreadsheetId + '|' + [...sheets].sort().join('|');
    const hit = memo.get(key);
    let payload;
    if (hit && Date.now() - hit.at < FRESH_MS) {
      payload = hit.payload;
    } else {
      try {
        payload = await readSheets(spreadsheetId, sheets);
        memo.set(key, { at: Date.now(), payload });
      } catch (err) {
        if (isQuota(err) && hit && Date.now() - hit.at < FALLBACK_MS) payload = hit.payload;
        else throw err;
      }
    }

    // Private: Vercel's shared edge cache keys on the URL alone and would hand
    // this data to someone who is not signed in, so only the signed-in
    // browser keeps a copy. Google is still spared by the memo above.
    res.setHeader('Cache-Control', 'private, max-age=120');
    // One tab asked for: that tab's {headers, rows}. Several: {sheets: {name: …}}.
    res.status(200).json(sheets.length === 1 && !Array.isArray(raw) ? payload[sheets[0]] : { sheets: payload });
  } catch (err) {
    const quota = isQuota(err);
    res.status(quota ? 429 : 500).json({ error: err.message || 'Unknown error', ...(quota ? { code: 'quota' } : {}) });
  }
};
