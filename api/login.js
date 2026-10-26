const auth = require('./_auth');

const sleep = ms => new Promise(r => setTimeout(r, ms));

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'POST only' });
    return;
  }
  if (!auth.configured()) {
    res.status(503).json({ error: 'not configured', code: 'not_configured' });
    return;
  }
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  const { username, password } = body || {};
  const user = auth.checkPassword(username, password);
  if (!user) {
    // A wrong guess costs a second, which makes trying passwords slow.
    await sleep(1000);
    res.status(401).json({ error: 'wrong username or password', code: 'bad_login' });
    return;
  }
  res.setHeader('Set-Cookie', auth.sessionCookie(auth.makeToken(user), auth.MAX_AGE_S));
  res.status(200).json({ user: user.name });
};
