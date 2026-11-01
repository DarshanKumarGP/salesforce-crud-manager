(() => {
  const $ = s => document.querySelector(s);
  const st = { name: '', meta: null, rows: [], cursor: null, hasMore: false, loading: false, token: 0, search: '', total: null };
  const wrap = $('#table-wrap'), tbody = $('tbody'), modal = $('#modal');

  const el = (tag, props = {}, ...kids) => {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === 'class') e.className = v;
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else if (v !== false && v != null) e.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat()) if (kid != null) e.append(kid);
    return e;
  };

  async function api(path, { method = 'GET', body } = {}) {
    const res = await fetch(path, {
      method, credentials: 'same-origin',
      headers: { 'X-Requested-With': 'fetch', ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined
    });
    const data = await res.json().catch(() => null);
    if (res.status === 401) { showLogin('Your session expired. Please log in again.'); throw new Error('Session expired'); }
    if (!res.ok) throw new Error((data && data.error) || `Request failed (${res.status})`);
    return data;
  }

  function toast(msg, err) {
    const t = el('div', { class: 'toast' + (err ? ' err' : '') }, msg);
    $('#toasts').append(t);
    setTimeout(() => t.remove(), 3500);
  }

  const fmt = (f, v) => {
    if (v == null || v === '') return '—';
    if (f.type === 'boolean') return v ? 'Yes' : 'No';
    if (['double', 'currency', 'int', 'percent'].includes(f.type)) return Number(v).toLocaleString(undefined, { maximumFractionDigits: 2 });
    if (f.type === 'datetime') return new Date(v).toLocaleString();
    return String(v);
  };
  const title = rec => st.meta.title.map(n => rec[n]).filter(Boolean).join(' ') || rec.Id;

  // ---------- screens ----------
  function showLogin(msg) {
    $('#app').classList.add('hidden'); $('#login').classList.remove('hidden');
    const box = $('#login-error'); box.textContent = msg || ''; box.classList.toggle('hidden', !msg);
    if (modal.open) modal.close();
  }
  async function showApp(me) {
    $('#login').classList.add('hidden'); $('#app').classList.remove('hidden');
    $('#user').textContent = (me.user && (me.user.name || me.user.username)) || '';
    if ($('#object').options.length === 1) {
      const names = await api('/api/objects');
      for (const n of names) $('#object').append(el('option', { value: n }, n));
    }
  }

  // ---------- list + infinite scroll ----------
  const nearBottom = () => wrap.scrollHeight - wrap.scrollTop - wrap.clientHeight < 120;
  const setStatus = (t, err) => { const s = $('#status'); s.textContent = t; s.classList.toggle('err', !!err); };
  const updateCount = () => { $('#count').textContent = st.total != null ? `${st.rows.length} of ${st.total} records` : ''; };

  function renderHead() {
    $('thead').replaceChildren(el('tr', {}, ...st.meta.fields.map(f => el('th', {}, f.label)), el('th', {}, 'Actions')));
  }
  function renderRow(rec) {
    return el('tr', { 'data-id': rec.Id },
      ...st.meta.fields.map(f => el('td', { title: fmt(f, rec[f.name]) }, fmt(f, rec[f.name]))),
      el('td', { class: 'actions' },
        el('button', { class: 'btn sm', onclick: () => viewRecord(rec.Id) }, 'View'),
        el('button', { class: 'btn sm', disabled: !st.meta.canUpdate, onclick: () => editRecord(rec.Id) }, 'Edit'),
        el('button', { class: 'btn sm danger', disabled: !st.meta.canDelete, onclick: () => confirmDelete(rec) }, 'Delete')));
  }

  async function load(reset) {
    if (!st.name) return;
    if (reset) {
      st.token++; st.rows = []; st.cursor = null; st.hasMore = false; st.loading = false; st.total = null;
      tbody.replaceChildren(); wrap.scrollTop = 0; updateCount();
    }
    if (st.loading || (!reset && !st.hasMore)) return;
    const my = st.token; st.loading = true; setStatus('Loading…');
    try {
      const p = new URLSearchParams();
      if (st.cursor) p.set('cursor', st.cursor);
      if (st.search) p.set('search', st.search);
      const d = await api(`/api/objects/${st.name}/records?${p}`);
      if (my !== st.token) return;
      st.rows.push(...d.records); st.cursor = d.nextCursor; st.hasMore = d.hasMore;
      if (d.total !== undefined) st.total = d.total;
      tbody.append(...d.records.map(renderRow));
      updateCount();
      setStatus(!st.rows.length ? 'No records found.' : st.hasMore ? 'Scroll down to load more…' : 'All records loaded.');
    } catch (e) {
      if (my === st.token) setStatus(e.message, true);
      return;
    } finally { if (my === st.token) st.loading = false; }
    if (st.hasMore && nearBottom()) load(false);
  }
  wrap.addEventListener('scroll', () => { if (st.hasMore && nearBottom()) load(false); });

  async function selectObject(name) {
    st.name = name; st.meta = null; st.search = ''; $('#search').value = '';
    st.token++; tbody.replaceChildren(); $('thead').replaceChildren(); st.rows = []; st.total = null; updateCount();
    $('#new').disabled = true; $('#search').disabled = !name;
    if (!name) return setStatus('Choose an object to get started.');
    setStatus('Loading…');
    try {
      const meta = await api(`/api/objects/${name}/meta`);
      if (st.name !== name) return;
      st.meta = meta; renderHead();
      $('#new').disabled = !meta.canCreate;
      load(true);
    } catch (e) { setStatus(e.message, true); }
  }

  // ---------- modal helpers ----------
  function openModal(heading, body, foot) {
    modal.replaceChildren(el('div', { class: 'm-head' }, heading), el('div', { class: 'm-body' }, body), el('div', { class: 'm-foot' }, foot));
    if (!modal.open) modal.showModal();
  }
  const closeBtn = () => el('button', { class: 'btn', type: 'button', onclick: () => modal.close() }, 'Close');
  modal.addEventListener('click', e => { if (e.target === modal) modal.close(); });

  async function viewRecord(id) {
    try {
      const rec = await api(`/api/objects/${st.name}/records/${id}`);
      const rows = [...st.meta.fields.map(f => [f.label, fmt(f, rec[f.name])]),
        ['Record Id', rec.Id], ['Created', new Date(rec.CreatedDate).toLocaleString()], ['Last Modified', new Date(rec.LastModifiedDate).toLocaleString()]];
      openModal(`${st.meta.label}: ${title(rec)}`, el('dl', {}, rows.flatMap(([k, v]) => [el('dt', {}, k), el('dd', {}, v)])), [
        el('button', { class: 'btn', disabled: !st.meta.canUpdate, onclick: () => showForm('edit', rec) }, 'Edit'),
        el('button', { class: 'btn danger', disabled: !st.meta.canDelete, onclick: () => confirmDelete(rec) }, 'Delete'),
        closeBtn()]);
    } catch (e) { toast(e.message, true); }
  }
  async function editRecord(id) {
    try { showForm('edit', await api(`/api/objects/${st.name}/records/${id}`)); } catch (e) { toast(e.message, true); }
  }

  const INPUT_TYPES = { email: 'email', phone: 'tel', date: 'date', double: 'number', currency: 'number', int: 'number', percent: 'number' };
  function buildInput(f, val) {
    const c = { name: f.name, id: 'f_' + f.name, required: f.required };
    if (f.type === 'picklist') {
      const s = el('select', c, el('option', { value: '' }, '— None —'), ...f.options.map(o => el('option', { value: o.value }, o.label)));
      s.value = val ?? ''; return s;
    }
    if (f.type === 'textarea') return el('textarea', { ...c, rows: 4 }, val ?? '');
    if (f.type === 'boolean') return el('input', { ...c, type: 'checkbox', checked: !!val });
    const i = el('input', { ...c, type: INPUT_TYPES[f.type] || 'text', step: INPUT_TYPES[f.type] === 'number' ? 'any' : null });
    i.value = val ?? ''; return i;
  }

  function showForm(mode, rec) {
    const fields = st.meta.fields.filter(f => (mode === 'create' ? f.createable : f.updateable));
    const err = el('div', { class: 'alert hidden' });
    const form = el('form', {}, err,
      ...fields.map(f => el('div', { class: 'field' },
        el('label', { for: 'f_' + f.name }, f.label, f.required ? el('span', { class: 'req' }, ' *') : null),
        buildInput(f, rec && rec[f.name]))));
    const save = el('button', { class: 'btn primary', type: 'submit', form: 'rec-form' }, mode === 'create' ? 'Create' : 'Save');
    form.id = 'rec-form';
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const body = {};
      for (const f of fields) { const i = form.elements[f.name]; body[f.name] = f.type === 'boolean' ? i.checked : i.value; }
      save.disabled = true; err.classList.add('hidden');
      try {
        if (mode === 'create') {
          await api(`/api/objects/${st.name}/records`, { method: 'POST', body });
          modal.close(); toast(`${st.meta.label} created`); load(true);
        } else {
          await api(`/api/objects/${st.name}/records/${rec.Id}`, { method: 'PATCH', body });
          const fresh = await api(`/api/objects/${st.name}/records/${rec.Id}`);
          const idx = st.rows.findIndex(r => r.Id === rec.Id);
          if (idx > -1) { st.rows[idx] = fresh; tbody.children[idx].replaceWith(renderRow(fresh)); }
          modal.close(); toast(`${st.meta.label} updated`);
        }
      } catch (ex) { err.textContent = ex.message; err.classList.remove('hidden'); }
      finally { save.disabled = false; }
    });
    openModal(mode === 'create' ? `New ${st.meta.label}` : `Edit ${st.meta.label}: ${title(rec)}`, form,
      [el('button', { class: 'btn', type: 'button', onclick: () => modal.close() }, 'Cancel'), save]);
  }

  function confirmDelete(rec) {
    const err = el('div', { class: 'alert hidden' });
    const del = el('button', { class: 'btn danger' }, 'Delete');
    del.addEventListener('click', async () => {
      del.disabled = true;
      try {
        await api(`/api/objects/${st.name}/records/${rec.Id}`, { method: 'DELETE' });
        const idx = st.rows.findIndex(r => r.Id === rec.Id);
        if (idx > -1) { st.rows.splice(idx, 1); tbody.children[idx].remove(); }
        if (st.total != null) st.total--;
        updateCount(); modal.close(); toast(`${st.meta.label} deleted`);
        if (!st.rows.length && !st.hasMore) setStatus('No records found.');
        else if (st.hasMore && nearBottom()) load(false);
      } catch (e) { err.textContent = e.message; err.classList.remove('hidden'); del.disabled = false; }
    });
    openModal('Delete ' + st.meta.label, [err, el('p', {}, `Are you sure you want to delete "${title(rec)}"? This cannot be undone.`)],
      [el('button', { class: 'btn', onclick: () => modal.close() }, 'Cancel'), del]);
  }

  // ---------- wiring ----------
  $('#object').addEventListener('change', e => selectObject(e.target.value));
  $('#new').addEventListener('click', () => showForm('create'));
  let timer;
  $('#search').addEventListener('input', e => { clearTimeout(timer); timer = setTimeout(() => { st.search = e.target.value.trim(); load(true); }, 400); });
  $('#logout').addEventListener('click', async () => { try { await api('/auth/logout', { method: 'POST' }); } catch {} showLogin(); });

  (async () => {
    const q = new URLSearchParams(location.search), error = q.get('error');
    if (error) history.replaceState({}, '', '/');
    try {
      const me = await (await fetch('/auth/me', { credentials: 'same-origin' })).json();
      me.authenticated ? await showApp(me) : showLogin(error);
    } catch { showLogin(error || 'Could not reach the server.'); }
  })();
})();
