const OBJECTS = require('./objects');
const API = process.env.SF_API_VERSION || '62.0';
const port = process.env.PORT || 3000;
const base = (process.env.BASE_URL || process.env.RENDER_EXTERNAL_URL || `http://localhost:${port}`).replace(/\/$/, '');
const config = {
  clientId: process.env.SF_CLIENT_ID,
  clientSecret: process.env.SF_CLIENT_SECRET,
  loginUrl: (process.env.SF_LOGIN_URL || 'https://login.salesforce.com').replace(/\/$/, ''),
  redirectUri: process.env.SF_CALLBACK_URL || `${base}/oauth/callback`
};

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

async function tokenRequest(params) {
  const body = new URLSearchParams({ client_id: config.clientId, ...(config.clientSecret ? { client_secret: config.clientSecret } : {}), ...params });
  let res;
  try {
    res = await fetch(`${config.loginUrl}/services/oauth2/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  } catch { throw new HttpError(502, 'Could not reach Salesforce login'); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new HttpError(400, data.error_description || data.error || 'Token request failed');
  return data;
}

const destroy = req => new Promise(r => req.session.destroy(() => r()));

// Calls the Salesforce REST API with the user's OAuth access token.
// On 401 it silently uses the refresh token once, then retries.
async function call(req, path, opts = {}, retried = false) {
  const s = req.session.sf;
  if (!s) throw new HttpError(401, 'Not logged in');
  let res;
  try {
    res = await fetch(s.instanceUrl + path, {
      method: opts.method || 'GET',
      headers: { Authorization: 'Bearer ' + s.accessToken, Accept: 'application/json', ...(opts.body ? { 'Content-Type': 'application/json' } : {}) },
      body: opts.body ? JSON.stringify(opts.body) : undefined
    });
  } catch { throw new HttpError(502, 'Could not reach Salesforce'); }
  if (res.status === 401) {
    if (!retried && s.refreshToken) {
      try {
        const d = await tokenRequest({ grant_type: 'refresh_token', refresh_token: s.refreshToken });
        s.accessToken = d.access_token;
        if (d.instance_url) s.instanceUrl = d.instance_url;
        req.session.sf = s;
      } catch { await destroy(req); throw new HttpError(401, 'Session expired'); }
      return call(req, path, opts, true);
    }
    await destroy(req);
    throw new HttpError(401, 'Session expired');
  }
  const text = await res.text();
  let data = null;
  if (text) { try { data = JSON.parse(text); } catch { data = text; } }
  if (!res.ok) {
    const msg = Array.isArray(data) ? data.map(e => e.message).join('; ') : (data && data.error_description) || 'Salesforce request failed';
    throw new HttpError(res.status >= 500 ? 502 : res.status, msg);
  }
  return data;
}

async function getMeta(req, obj) {
  const cache = (req.session.meta = req.session.meta || {});
  const hit = cache[obj];
  if (hit && Date.now() - hit.at < 600000) return hit.data;
  const d = await call(req, `/services/data/v${API}/sobjects/${obj}/describe`);
  const by = Object.fromEntries(d.fields.map(f => [f.name, f]));
  const def = OBJECTS[obj];
  const fields = def.fields.filter(n => by[n]).map(n => {
    const f = by[n];
    return {
      name: n, label: f.label, type: f.type,
      required: !f.nillable && f.createable && !f.defaultedOnCreate && f.type !== 'boolean',
      createable: f.createable, updateable: f.updateable,
      options: f.type === 'picklist' ? f.picklistValues.filter(p => p.active).map(p => ({ value: p.value, label: p.label })) : undefined
    };
  });
  const data = { name: obj, label: d.label, title: def.title, search: def.search, fields, canCreate: d.createable, canUpdate: d.updateable, canDelete: d.deletable };
  cache[obj] = { at: Date.now(), data };
  return data;
}

module.exports = { config, HttpError, tokenRequest, call, getMeta, API };
