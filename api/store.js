const { JWT } = require('google-auth-library');
const auth = require('./_auth');

// Shared storage for the slide reports (slides.html): each report's settings,
// template and edits, and the merged-report list, so every browser a person
// signs in from sees the same reports. Kept in one Google Sheet the service
// account can edit — the first tab, one row per key:
//   A key | B updated at | C who | D… the JSON value, split into pieces
// (a cell holds at most 50,000 characters; a logo can be larger).
// The sheet: STORE_SPREADSHEET_ID on Vercel, or the id written here. It must
// be shared with the service account as Editor.
const STORE_SPREADSHEET_ID = process.env.STORE_SPREADSHEET_ID || '';

const CHUNK = 45000;
const MAX_CHUNKS = 23;                  // D..Z
const KEY_RE = /^[\w\-.|]{1,200}$/;

let cachedClient = null;
function getClient(){
  if(cachedClient) return cachedClient;
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
  if(!email || !key) throw new Error('Missing GOOGLE_SERVICE_ACCOUNT_EMAIL or GOOGLE_PRIVATE_KEY environment variables');
  // Read and write, unlike sheet-data.js, which only ever reads.
  cachedClient = new JWT({ email, key, scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
  return cachedClient;
}
const base = () => `https://sheets.googleapis.com/v4/spreadsheets/${STORE_SPREADSHEET_ID}`;
const call = (opts) => getClient().request(opts).then(r => r.data);

// Every row as {row, key, updatedAt, user, value}; row is the sheet's 1-based
// row. `height` is how many rows the sheet has in use, header included.
async function readAll(){
  const data = await call({ url: `${base()}/values/${encodeURIComponent('A1:Z')}?valueRenderOption=UNFORMATTED_VALUE` });
  const values = data.values || [];
  const rows = values.map((r, i) => {
    const key = String(r[0] || '');
    if(i === 0 || !key) return null;    // the header row, or a cleared one
    let value = null;
    try{ value = JSON.parse(r.slice(3).join('')); }catch(e){ return null; }
    return { row: i + 1, key, updatedAt: Number(r[1]) || 0, user: String(r[2] || ''), value };
  }).filter(Boolean);
  return { rows, height: values.length };
}
function rowValues(key, value, user){
  const json = JSON.stringify(value);
  const pieces = [];
  for(let i = 0; i < json.length; i += CHUNK) pieces.push(json.slice(i, i + CHUNK));
  if(pieces.length > MAX_CHUNKS) throw Object.assign(new Error('value too large'), { status: 413 });
  // Padded to Z so a shorter value clears what a longer one left behind.
  return [key, Date.now(), user, ...pieces, ...Array(MAX_CHUNKS - pieces.length).fill('')];
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const session = auth.getSession(req);
  if(!session){ res.status(401).json({ error: 'login required', code: 'auth' }); return; }
  if(!STORE_SPREADSHEET_ID){ res.status(503).json({ error: 'storage sheet not set', code: 'no_store' }); return; }
  try{
    if(req.method === 'GET'){
      // Every key under a prefix ("<report>|"), so a report's settings and all
      // its periods' edits come in one read.
      const prefix = String(req.query.prefix || '');
      if(!prefix || !KEY_RE.test(prefix)){ res.status(400).json({ error: 'bad prefix' }); return; }
      const items = {};
      (await readAll()).rows.filter(r => r.key.startsWith(prefix))
        .forEach(r => { items[r.key] = { value: r.value, updatedAt: r.updatedAt, user: r.user }; });
      res.status(200).json({ items });
      return;
    }
    if(req.method === 'POST'){
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      const list = Array.isArray(body.items) ? body.items : [];
      if(!list.length || list.some(it => !it || !KEY_RE.test(String(it.key || '')))){
        res.status(400).json({ error: 'bad items' }); return;
      }
      const { rows, height } = await readAll();
      const at = new Map(rows.map(r => [r.key, r.row]));
      const updates = [], appends = [];
      list.forEach(it => {
        const row = at.get(it.key);
        // null deletes: the row is blanked and skipped from then on.
        const values = it.value === null ? Array(MAX_CHUNKS + 3).fill('') : rowValues(it.key, it.value, session.user);
        if(row) updates.push({ range: `A${row}:Z${row}`, values: [values] });
        else if(it.value !== null) appends.push(values);
      });
      if(updates.length){
        await call({ url: `${base()}/values:batchUpdate`, method: 'POST',
                     data: { valueInputOption: 'RAW', data: updates } });
      }
      if(appends.length){
        // A sheet with nothing in it gets its header row first.
        const header = height ? [] : [['key', 'updatedAt', 'user', 'value (JSON, continues to the right)']];
        await call({ url: `${base()}/values/${encodeURIComponent('A1:Z')}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
                     method: 'POST', data: { values: [...header, ...appends] } });
      }
      res.status(200).json({ saved: list.length, at: Date.now() });
      return;
    }
    res.status(405).json({ error: 'method not allowed' });
  }catch(err){
    const code = err && (err.status || err.code || (err.response && err.response.status));
    const status = Number(code) === 413 ? 413 : Number(code) === 429 ? 429 : Number(code) === 403 ? 403 : 500;
    res.status(status).json({ error: (err && err.message) || 'Unknown error',
                              ...(status === 403 ? { code: 'no_access' } : {}), ...(status === 429 ? { code: 'quota' } : {}) });
  }
};
