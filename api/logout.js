const auth = require('./_auth');

module.exports = (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Set-Cookie', auth.sessionCookie('', 0));
  res.status(200).json({ ok: true });
};
