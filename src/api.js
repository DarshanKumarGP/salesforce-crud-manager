const router = require('express').Router();
const OBJECTS = require('./objects');
const { HttpError, call, getMeta, API } = require('./sf');

const PAGE = 20;
const ID = /^[a-zA-Z0-9]{15,18}$/;
const wrap = fn => (req, res, next) => fn(req, res, next).catch(next);
const lit = s => String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n').replace(/\r/g, '\\r');

router.use((req, res, next) => (req.session.sf ? next() : next(new HttpError(401, 'Not logged in'))));
router.param('obj', (req, res, next, v) => (Object.hasOwn(OBJECTS, v) ? next() : next(new HttpError(404, 'Unsupported object'))));
router.param('id', (req, res, next, v) => (ID.test(v) ? next() : next(new HttpError(400, 'Invalid record id'))));

function buildPayload(meta, body, mode) {
  const out = {};
  for (const f of meta.fields) {
    if (!(mode === 'create' ? f.createable : f.updateable) || !(f.name in (body || {}))) continue;
    let v = body[f.name];
    if (v === '' || v === undefined) v = null;
    if (v !== null) {
      if (['double', 'currency', 'percent', 'int'].includes(f.type)) {
        v = Number(v);
        if (!Number.isFinite(v)) throw new HttpError(400, `${f.label} must be a number`);
      } else if (f.type === 'boolean') v = v === true || v === 'true';
      else v = String(v);
    }
    if (f.required && v === null) throw new HttpError(400, `${f.label} is required`);
    out[f.name] = v;
  }
  if (mode === 'create') {
    const missing = meta.fields.find(f => f.required && f.createable && out[f.name] == null);
    if (missing) throw new HttpError(400, `${missing.label} is required`);
  }
  return out;
}

router.get('/objects', (req, res) => res.json(Object.keys(OBJECTS)));

router.get('/objects/:obj/meta', wrap(async (req, res) => res.json(await getMeta(req, req.params.obj))));

// Keyset pagination (Id DESC): returns 20 rows + a cursor for the next 20.
router.get('/objects/:obj/records', wrap(async (req, res) => {
  const { obj } = req.params;
  const meta = await getMeta(req, obj);
  const cursor = req.query.cursor;
  if (cursor && !ID.test(cursor)) throw new HttpError(400, 'Invalid cursor');
  const q = String(req.query.search || '').trim().slice(0, 100);
  const base = [];
  const sf = meta.search.filter(n => meta.fields.some(f => f.name === n));
  if (q && sf.length) {
    const t = lit(q).replace(/[%_]/g, '\\$&');
    base.push('(' + sf.map(n => `${n} LIKE '%${t}%'`).join(' OR ') + ')');
  }
  const where = extra => { const c = [...base, ...extra]; return c.length ? ' WHERE ' + c.join(' AND ') : ''; };
  const cols = ['Id', ...meta.fields.map(f => f.name)].join(', ');
  const run = s => call(req, `/services/data/v${API}/query?q=${encodeURIComponent(s)}`);
  const [data, count] = await Promise.all([
    run(`SELECT ${cols} FROM ${obj}${where(cursor ? [`Id < '${cursor}'`] : [])} ORDER BY Id DESC LIMIT ${PAGE + 1}`),
    cursor ? null : run(`SELECT COUNT() FROM ${obj}${where([])}`)
  ]);
  const rows = data.records.map(({ attributes, ...r }) => r);
  const hasMore = rows.length > PAGE;
  const records = rows.slice(0, PAGE);
  res.json({ records, hasMore, nextCursor: hasMore ? records[records.length - 1].Id : null, total: count ? count.totalSize : undefined });
}));

router.get('/objects/:obj/records/:id', wrap(async (req, res) => {
  const { obj, id } = req.params;
  const meta = await getMeta(req, obj);
  const fields = ['Id', ...meta.fields.map(f => f.name), 'CreatedDate', 'LastModifiedDate'].join(',');
  const r = await call(req, `/services/data/v${API}/sobjects/${obj}/${id}?fields=${fields}`);
  delete r.attributes;
  res.json(r);
}));

router.post('/objects/:obj/records', wrap(async (req, res) => {
  const meta = await getMeta(req, req.params.obj);
  const r = await call(req, `/services/data/v${API}/sobjects/${req.params.obj}`, { method: 'POST', body: buildPayload(meta, req.body, 'create') });
  res.status(201).json({ id: r.id });
}));

router.patch('/objects/:obj/records/:id', wrap(async (req, res) => {
  const meta = await getMeta(req, req.params.obj);
  await call(req, `/services/data/v${API}/sobjects/${req.params.obj}/${req.params.id}`, { method: 'PATCH', body: buildPayload(meta, req.body, 'update') });
  res.json({ success: true });
}));

router.delete('/objects/:obj/records/:id', wrap(async (req, res) => {
  await call(req, `/services/data/v${API}/sobjects/${req.params.obj}/${req.params.id}`, { method: 'DELETE' });
  res.json({ success: true });
}));

module.exports = router;
