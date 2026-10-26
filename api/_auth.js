// Login for the dashboard. Not an endpoint itself: Vercel does not turn files
// whose names start with "_" into functions; the API files require it.
//
// Accounts live in one environment variable on Vercel, DASHBOARD_USERS:
//   erfan:some-password,ali:another-password
// (a username, a colon, the password; accounts separated by commas or new
// lines). Usernames are matched case-insensitively. Adding, removing or
// re-passwording someone is an edit to that variable and a redeploy.
//
// A successful login sets a signed, HttpOnly cookie that lasts 30 days. The
// signature also covers a fingerprint of that user's password, so changing a
// password or removing the account logs that person out everywhere.
// The signing key is AUTH_SECRET if set, otherwise derived from the Google
// private key the site already keeps secret.
const crypto = require('crypto');

const COOKIE = 'md_session';
const MAX_AGE_S = 30 * 24 * 60 * 60;

function users(){
  const map = new Map();
  String(process.env.DASHBOARD_USERS || '').split(/[,\n]/).forEach(entry => {
    const i = entry.indexOf(':');
    if(i <= 0) return;
    const name = entry.slice(0, i).trim();
    const pass = entry.slice(i + 1).trim();
    if(name && pass) map.set(name.toLowerCase(), { name, pass });
  });
  return map;
}

function secret(){
  const s = process.env.AUTH_SECRET || process.env.GOOGLE_PRIVATE_KEY || '';
  return s ? crypto.createHash('sha256').update('md-session|' + s).digest() : null;
}

// Login is possible only when there are accounts and a key to sign with.
function configured(){ return users().size > 0 && !!secret(); }

const b64url = buf => Buffer.from(buf).toString('base64')
  .replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
const hmac = data => b64url(crypto.createHmac('sha256', secret()).update(data).digest());
const passPrint = pass => hmac('pw|' + pass).slice(0, 16);

function sameText(a, b){
  const x = crypto.createHash('sha256').update(String(a)).digest();
  const y = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(x, y);
}

function checkPassword(username, password){
  if(!configured()) return null;
  const u = users().get(String(username || '').trim().toLowerCase());
  // Compared even when the user does not exist, so timing says nothing.
  const ok = sameText(password || '', u ? u.pass : crypto.randomBytes(16).toString('hex'));
  return u && ok ? u : null;
}

function makeToken(user){
  const body = b64url(JSON.stringify({
    u: user.name.toLowerCase(),
    p: passPrint(user.pass),
    e: Math.floor(Date.now() / 1000) + MAX_AGE_S
  }));
  return body + '.' + hmac(body);
}

function readCookie(req, name){
  const header = (req.headers && req.headers.cookie) || '';
  for(const part of header.split(';')){
    const i = part.indexOf('=');
    if(i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

// The signed-in user for this request, or null.
function getSession(req){
  if(!configured()) return null;
  const token = readCookie(req, COOKIE);
  if(!token) return null;
  const [body, sig] = token.split('.');
  if(!body || !sig || !sameText(sig, hmac(body))) return null;
  let data;
  try{ data = JSON.parse(Buffer.from(body.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')); }
  catch(e){ return null; }
  if(!data || !data.e || data.e < Date.now() / 1000) return null;
  const u = users().get(String(data.u || ''));
  if(!u || !sameText(data.p || '', passPrint(u.pass))) return null;
  return { user: u.name };
}

function sessionCookie(token, maxAge){
  return `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

module.exports = { configured, checkPassword, makeToken, getSession, sessionCookie, MAX_AGE_S };
