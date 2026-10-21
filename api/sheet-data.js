const { JWT } = require('google-auth-library');

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

module.exports = async (req, res) => {
  try {
    const { spreadsheetId, sheet } = req.query;
    if (!spreadsheetId || !sheet) {
      res.status(400).json({ error: 'Missing spreadsheetId or sheet query param' });
      return;
    }
    if (!ALLOWED_SPREADSHEETS.has(spreadsheetId)) {
      res.status(403).json({ error: 'This spreadsheet is not in the allowed list' });
      return;
    }

    const client = getClient();
    const range = encodeURIComponent(`${sheet}!A:Z`);
    // UNFORMATTED_VALUE returns the cell's real number instead of the text the
    // sheet happens to display: a Cost column formatted as scientific ("1.48E+08")
    // or rounded for width would otherwise reach the dashboard already mangled.
    // Dates still come through as their displayed string rather than a serial
    // number, which is what the front-end parses.
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}`
      + `?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING`;
    const response = await client.request({ url });
    const values = response.data.values || [];

    if (!values.length) {
      res.status(200).json({ data: [] });
      return;
    }

    // Rows go out as arrays under one header list rather than as objects that
    // repeat every column name, which roughly halves what the browser has to
    // download and parse; the front-end turns them back into objects. Rows
    // with nothing in them (pre-formatted blank lines at the bottom of a
    // sheet) are dropped here.
    const [headers, ...rows] = values;
    const filled = rows
      .filter(row => row.some(v => v !== '' && v !== null && v !== undefined))
      .map(row => headers.map((h, i) => row[i] !== undefined ? row[i] : ''));

    // The edge serves a copy for 5 minutes and, after that, keeps answering
    // with it while it fetches a fresh one, so a visit rarely waits on Google.
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=1800');
    res.status(200).json({ headers, rows: filled });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Unknown error' });
  }
};
