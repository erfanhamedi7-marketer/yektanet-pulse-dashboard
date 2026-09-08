const { JWT } = require('google-auth-library');

// Whitelist of spreadsheet IDs this endpoint is allowed to read, so it can't
// be used as an open proxy to any sheet the service account happens to see.
// Add a new line here whenever a new project's Google Sheet is connected.
const ALLOWED_SPREADSHEETS = new Set([
  '1r9f3Vdl6ldgQeL50tHX4TxjVP0H_UxYeYFKhGFp0yeQ', // Yektanet
  '1DdhvkT6gVXKoDiicgXnXHTq32yZg3aGpJx97RT4wYeU', // Blue
  '18ohsYVwngt7UJ5BwvBBWdhpQ2IOxO4b08-D4OMm2VEQ', // Wepod
  '1EvYoVf6HYp3Nbo02N47qYtaLesJBDVi9urQvOXVs1LQ'  // Bankino
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
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}`;
    const response = await client.request({ url });
    const values = response.data.values || [];

    if (!values.length) {
      res.status(200).json({ data: [] });
      return;
    }

    const [headers, ...rows] = values;
    const data = rows.map(row => {
      const obj = {};
      headers.forEach((h, i) => { obj[h] = row[i] !== undefined ? row[i] : ''; });
      return obj;
    });

    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
    res.status(200).json({ data });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Unknown error' });
  }
};
