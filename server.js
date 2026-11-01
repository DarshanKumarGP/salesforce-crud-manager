require('dotenv').config();
const crypto = require('crypto');
const path = require('path');
const express = require('express');
const session = require('express-session');
const MemoryStore = require('memorystore')(session);
const helmet = require('helmet');
const { config, HttpError, tokenRequest } = require('./src/sf');
const api = require('./src/api');

if (!config.clientId) { console.error('Missing SF_CLIENT_ID. Copy .env.example to .env and fill it in.'); process.exit(1); }
if (process.env.NODE_ENV === 'production' && !process.env.SESSION_SECRET) console.warn('SESSION_SECRET not set; using a random one (sessions reset on restart).');

const app = express();
const b64 = buf => buf.toString('base64url');
app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: { useDefaults: true, directives: { 'upgrade-insecure-requests': null } } }));
app.use(express.json({ limit: '100kb' }));
app.use(session({
  name: 'sfcrud.sid',
  secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
  resave: false, saveUninitialized: false,
  store: new MemoryStore({ checkPeriod: 86400000 }),
  cookie: { httpOnly: true, sameSite: 'lax', secure: 'auto', maxAge: 8 * 3600 * 1000 }
}));
// CSRF defence: every state-changing request must come from our own fetch() calls.
app.use((req, res, next) => {
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.get('X-Requested-With') !== 'fetch') return next(new HttpError(403, 'Blocked request'));
  next();
});
app.use(express.static(path.join(__dirname, 'public')));
app.get('/healthz', (req, res) => res.send('ok'));

// ---- OAuth 2.0 Authorization Code flow with PKCE ----
app.get('/auth/login', (req, res, next) => {
  const verifier = b64(crypto.randomBytes(48));
  const state = b64(crypto.randomBytes(16));
  req.session.oauth = { verifier, state };
  const params = new URLSearchParams({
    response_type: 'code', client_id: config.clientId, redirect_uri: config.redirectUri,
    scope: 'api refresh_token', state,
    code_challenge: b64(crypto.createHash('sha256').update(verifier).digest()), code_challenge_method: 'S256'
  });
  req.session.save(err => (err ? next(err) : res.redirect(`${config.loginUrl}/services/oauth2/authorize?${params}`)));
});

app.get('/oauth/callback', async (req, res, next) => {
  const fail = msg => res.redirect('/?error=' + encodeURIComponent(msg));
  try {
    const { code, state, error, error_description } = req.query;
    if (error) return fail(error_description || error);
    const o = req.session.oauth;
    if (!o || !code || state !== o.state) return fail('Login expired or invalid. Please try again.');
    const data = await tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: config.redirectUri, code_verifier: o.verifier });
    let user = {};
    try {
      const r = await fetch(data.id, { headers: { Authorization: 'Bearer ' + data.access_token } });
      if (r.ok) { const i = await r.json(); user = { name: i.display_name, username: i.username }; }
    } catch {}
    await new Promise(r => req.session.regenerate(r)); // new session id after login
    req.session.sf = { accessToken: data.access_token, refreshToken: data.refresh_token, instanceUrl: data.instance_url, user };
    req.session.save(err => (err ? next(err) : res.redirect('/')));
  } catch (e) { fail(e.message || 'Login failed'); }
});

app.get('/auth/me', (req, res) => {
  const s = req.session.sf;
  res.json(s ? { authenticated: true, user: s.user, instanceUrl: s.instanceUrl } : { authenticated: false });
});

app.post('/auth/logout', async (req, res) => {
  const s = req.session.sf;
  if (s) {
    const tok = s.refreshToken || s.accessToken;
    try { await fetch(`${config.loginUrl}/services/oauth2/revoke`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token: tok }) }); } catch {}
  }
  req.session.destroy(() => res.json({ success: true }));
});

app.use('/api', api);
app.use((req, res, next) => next(new HttpError(404, 'Not found')));
app.use((err, req, res, next) => {
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status < 500 ? err.message : 'Internal server error' });
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Listening on :${port}  (OAuth callback: ${config.redirectUri})`));
