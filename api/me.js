const auth = require('./_auth');

// Who is signed in: 200 {user}, 401 when no one is, 503 when logins are not
// set up on the server yet (no DASHBOARD_USERS).
module.exports = (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!auth.configured()) {
    res.status(503).json({ error: 'not configured', code: 'not_configured' });
    return;
  }
  const session = auth.getSession(req);
  if (!session) {
    res.status(401).json({ error: 'login required', code: 'auth' });
    return;
  }
  res.status(200).json({ user: session.user });
};
