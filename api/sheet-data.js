const { JWT } = require('google-auth-library');

const SHEET_ID = '1r9f3Vdl6ldgQeL50tHX4TxjVP0H_UxYeYFKhGFp0yeQ';

// Maps the ?sheet= query param to the actual tab name in the spreadsheet.
// Using tab names (not gid) because the Sheets API v4 values.get endpoint
// addresses ranges by sheet name, e.g. "Adtrace!A:G".
const SHEET_NAMES = {
  adtrace: 'Adtrace',
  cost: 'Cost - Yektanet'
};

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
    const sheetKey = req.query.sheet;
    const sheetName = SHEET_NAMES[sheetKey];
    if (!sheetName) {
      res.status(400).json({ error: `Unknown sheet "${sheetKey}". Expected one of: ${Object.keys(SHEET_NAMES).join(', ')}` });
      return;
    }

    const client = getClient();
    const range = encodeURIComponent(`${sheetName}!A:Z`);
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${range}`;
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
