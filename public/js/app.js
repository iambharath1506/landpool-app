// Landpool SPA — vanilla JS, no build step. Mobile-first.
// Tabs: #/pools #/messages #/invites #/profile
// Views: #/login #/signup #/onboarding #/pools/new #/pool/:id #/dm/:id #/call/:id #/share/:token

const App = {
  user: JSON.parse(localStorage.getItem('lp_user') || 'null'),
  token: localStorage.getItem('lp_token'),
  mode: localStorage.getItem('lp_mode') || 'airport',
  inviteCount: 0,
};

/* ---------------- api + session ---------------- */

async function api(path, opts = {}) {
  const res = await fetch('/api' + path, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(App.token ? { Authorization: 'Bearer ' + App.token } : {}),
      ...(opts.headers || {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Something went wrong.');
  return data;
}

function setSession(token, user) {
  App.token = token; App.user = user;
  localStorage.setItem('lp_token', token);
  localStorage.setItem('lp_user', JSON.stringify(user));
  RT.connect(token);
}
function logout() {
  App.token = null; App.user = null;
  localStorage.removeItem('lp_token'); localStorage.removeItem('lp_user');
  RT.disconnect();
  location.hash = '#/login';
}

/* ---------------- utils ---------------- */

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtT = (iso) => new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const firstName = (n) => String(n || 'traveler').split(/[\s_]+/)[0];
const initials = (n) => firstName(n).slice(0, 2).toUpperCase();
function avColor(n) {
  let h = 0; for (const c of String(n)) h = (h * 31 + c.charCodeAt(0)) % 360;
  return `hsl(${h}, 65%, 62%)`;
}
const avatar = (n, extra = '') =>
  `<span class="av ${extra}" style="background:${avColor(n)}" title="${esc(n)}">${esc(initials(n))}</span>`;
const vBadge = (u) => (u && (u.verified_airport || u.verified_concert))
  ? '<span class="badge verified">✓ verified</span>' : '';
function timeAgo(iso) {
  const s = (Date.now() - new Date(iso)) / 1000;
  if (s < 60) return 'now';
  if (s < 3600) return Math.floor(s / 60) + 'm';
  if (s < 86400) return Math.floor(s / 3600) + 'h';
  return Math.floor(s / 86400) + 'd';
}
const skel = (h = 92) => `<div class="skel" style="height:${h}px"></div>`;
const emptyState = (emoji, title, sub, btn) => `
  <div class="empty"><div class="e">${emoji}</div>
  <b style="color:var(--ink);font-size:16px">${title}</b>
  <p class="small">${sub}</p>${btn || ''}</div>`;
function errBox(el, e) {
  el.insertAdjacentHTML('afterbegin', `<div class="err">${esc(e.message)}</div>`);
}
function toast(msg) {
  const box = document.getElementById('toasts');
  const t = document.createElement('div');
  t.className = 'toast'; t.textContent = msg;
  box.appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .3s'; }, 2400);
  setTimeout(() => t.remove(), 2800);
}

/* unread tracking: localStorage read timestamps + in-memory sets */
const readTs = JSON.parse(localStorage.getItem('lp_read') || '{}');
const unreadPools = new Set(), unreadDms = new Set();
function markRead(kind, id) {
  readTs[kind] = readTs[kind] || {};
  readTs[kind][id] = new Date().toISOString();
  localStorage.setItem('lp_read', JSON.stringify(readTs));
  (kind === 'pool' ? unreadPools : unreadDms).delete(Number(id) || id);
  updateTabs();
}

/* ---------------- tabs ---------------- */

function showTabs(active) {
  const tabs = document.getElementById('tabs');
  const app = document.getElementById('app');
  if (!active) { tabs.classList.add('hidden'); app.classList.add('no-tabs'); return; }
  tabs.classList.remove('hidden'); app.classList.remove('no-tabs');
  tabs.querySelectorAll('a').forEach((a) =>
    a.classList.toggle('active', a.dataset.tab === active));
  updateTabs();
}
async function updateTabs() {
  try {
    const { invites } = await api('/invites/inbox');
    App.inviteCount = invites.length;
  } catch { /* logged out or offline */ }
  const bi = document.getElementById('badge-inv');
  bi.textContent = App.inviteCount > 9 ? '9+' : App.inviteCount;
  bi.classList.toggle('hidden', !App.inviteCount);
  const bm = document.getElementById('badge-msg');
  const n = unreadPools.size + unreadDms.size;
  bm.textContent = n > 9 ? '9+' : n;
  bm.classList.toggle('hidden', !n);
}
/* ---------------- auth views ---------------- */

async function LoginView(app) {
  app.innerHTML = `
    <div class="login-logo">🛬</div>
    <div class="login-title"><h1>Landpool</h1>
      <p class="mut">Split the ride with people on your flight.</p></div>
    <div class="card"><form id="f">
      <label>Display name</label><input id="name" autocomplete="username" required>
      <label>Password</label><input id="pw" type="password" autocomplete="current-password" required>
      <button class="block" style="margin-top:12px">Log in</button>
    </form></div>
    <p style="text-align:center" class="small">New here? <a href="#/signup">Create an account</a></p>
    <a class="demo-link" href="#" id="demo">Trying it out? → use the demo account</a>`;
  app.querySelector('#demo').onclick = (e) => {
    e.preventDefault();
    app.querySelector('#name').value = 'priya';
    app.querySelector('#pw').value = 'demo1234';
    app.querySelector('#f').requestSubmit();
  };
  app.querySelector('#f').onsubmit = async (e) => {
    e.preventDefault();
    try {
      const { token, user } = await api('/auth/login', { method: 'POST', body: {
        name: app.querySelector('#name').value.trim(),
        password: app.querySelector('#pw').value } });
      setSession(token, user);
      afterAuth();
    } catch (err) { errBox(app, err); }
  };
}

async function SignupView(app) {
  app.innerHTML = `
    <div class="login-logo">🛬</div>
    <div class="login-title"><h1>Create your account</h1>
      <p class="mut">Verified travelers only. No phone numbers, ever.</p></div>
    <div class="card"><form id="f">
      <label>Display name</label><input id="name" required minlength="2" autocomplete="username">
      <label>Password <span class="dim">(min 6 characters)</span></label>
      <input id="pw" type="password" required minlength="6" autocomplete="new-password">
      <label>Gender <span class="dim">(only used for women-only pools)</span></label>
      <select id="g"><option value="">Prefer not to say</option><option value="F">Woman</option>
      <option value="M">Man</option><option value="X">Nonbinary</option></select>
      <button class="block" style="margin-top:12px">Create account</button>
    </form></div>
    <p style="text-align:center" class="small">Have an account? <a href="#/login">Log in</a></p>`;
  app.querySelector('#f').onsubmit = async (e) => {
    e.preventDefault();
    try {
      const { token, user } = await api('/auth/signup', { method: 'POST', body: {
        name: app.querySelector('#name').value.trim(),
        password: app.querySelector('#pw').value,
        gender: app.querySelector('#g').value || null } });
      setSession(token, user);
      toast('Account created — welcome aboard ✈️');
      location.hash = '#/onboarding';
    } catch (err) { errBox(app, err); }
  };
}

async function afterAuth() {
  const { user } = await api('/auth/me');
  App.user = user; localStorage.setItem('lp_user', JSON.stringify(user));
  location.hash = (user.verified_airport || user.verified_concert) ? '#/pools' : '#/onboarding';
}

/* ---------------- onboarding ---------------- */

const ob = { step: 1, mode: 'airport' };

async function OnboardingView(app) {
  const me = (await api('/auth/me')).user;
  App.user = me; localStorage.setItem('lp_user', JSON.stringify(me));
  if (me.verified_airport && me.verified_concert) { location.hash = '#/pools'; return; }
  ob.step = 1;
  if (!me.verified_airport) ob.mode = 'airport';
  else if (!me.verified_concert) ob.mode = 'concert';
  renderOb(app);
}

function obDots() {
  return `<div class="dots">${[1, 2, 3].map((i) => `<i class="${ob.step === i ? 'on' : ''}"></i>`).join('')}</div>`;
}

function renderOb(app) {
  if (ob.step === 1) {
    app.innerHTML = `<div class="onb">
      <div class="logo">🛬</div>
      <h1>Split the ride,<br>not the cost.</h1>
      <p class="mut">Landpool groups you with verified travelers heading your way — at the airport or after the show.</p>
      <div class="card feat">
        <div><span>🪪</span><span><b>Verified travelers only.</b> Everyone is PNR or ticket verified.</span></div>
        <div><span>🔒</span><span><b>Private by design.</b> In-app chat &amp; masked calls — no phone numbers, ever.</span></div>
        <div><span>💵</span><span><b>Automatic fare split.</b> One Uber/Lyft for the group, split fairly.</span></div>
      </div>
      ${obDots()}
      <button class="block" id="ob1">Get verified →</button></div>`;
    app.querySelector('#ob1').onclick = () => { ob.step = 2; renderOb(app); };
  } else if (ob.step === 2) {
    renderObVerify(app);
  } else {
    renderObPools(app);
  }
}

async function renderObVerify(app) {
  const me = App.user;
  const { events } = await api('/verify/events');
  app.innerHTML = `<div class="onb" style="text-align:left">
    <h1 style="text-align:center">Get verified</h1>
    <p class="mut" style="text-align:center">Verification unlocks pooling. It takes 20 seconds.</p>
    <div class="seg">
      <button id="mA" class="${ob.mode === 'airport' ? 'active' : ''}" ${me.verified_airport ? 'disabled' : ''}>✈️ Flight</button>
      <button id="mC" class="${ob.mode === 'concert' ? 'active' : ''}" ${me.verified_concert ? 'disabled' : ''}>🎵 Concert</button>
    </div>
    ${ob.mode === 'airport' ? `
    <div class="bpass"><div class="stub">
      <div class="fld">Booking reference · PNR</div>
      <form id="fpnr"><input id="pnr" class="mono" maxlength="6" placeholder="ABC123" required autocomplete="off">
      <div class="fld">Last name on booking</div>
      <input id="ln" placeholder="As on your ticket" required autocomplete="off">
      <div class="fld">Flight number</div>
      <input id="fl" class="mono" placeholder="AA100" required autocomplete="off">
      <button class="block" style="margin-top:14px">Verify flight</button></form>
    </div></div>` : `
    <div class="card"><form id="ftk">
      <label>Your event</label>
      <select id="ev">${events.map((e) => `<option value="${e.id}">${esc(e.name)} — ${esc(e.venue)}</option>`).join('')}</select>
      <label>Ticket / order code</label>
      <input id="code" class="mono" placeholder="As on your confirmation" required minlength="4" autocomplete="off">
      <button class="block" style="margin-top:12px">Verify ticket</button>
    </form></div>`}
    ${obDots()}
    <p style="text-align:center"><a href="#" id="skip" class="small mut">I'll verify later →</a></p></div>`;
  app.querySelector('#mA').onclick = () => { ob.mode = 'airport'; renderObVerify(app); };
  app.querySelector('#mC').onclick = () => { ob.mode = 'concert'; renderObVerify(app); };
  app.querySelector('#skip').onclick = (e) => { e.preventDefault(); ob.step = 3; renderOb(app); };
  const fpnr = app.querySelector('#fpnr');
  if (fpnr) fpnr.onsubmit = async (e) => {
    e.preventDefault();
    try {
      const r = await api('/verify/pnr', { method: 'POST', body: {
        pnr: app.querySelector('#pnr').value, last_name: app.querySelector('#ln').value,
        flight_no: app.querySelector('#fl').value } });
      App.user = r.user; localStorage.setItem('lp_user', JSON.stringify(r.user));
      toast('Flight verified ✓'); ob.step = 3; renderOb(app);
    } catch (err) { errBox(app, err); }
  };
  const ftk = app.querySelector('#ftk');
  if (ftk) ftk.onsubmit = async (e) => {
    e.preventDefault();
    try {
      const r = await api('/verify/ticket', { method: 'POST', body: {
        code: app.querySelector('#code').value, event_id: app.querySelector('#ev').value } });
      App.user = r.user; localStorage.setItem('lp_user', JSON.stringify(r.user));
      toast('Ticket verified ✓'); ob.step = 3; renderOb(app);
    } catch (err) { errBox(app, err); }
  };
}

async function renderObPools(app) {
  app.innerHTML = `<div class="onb" style="text-align:left">
    <h1 style="text-align:center">Travelers near you</h1>
    <p class="mut" style="text-align:center">Open pools matching your verification. Join one to start.</p>
    <div id="list">${skel()}${skel()}${skel()}</div>
    ${obDots()}
    <button class="block ghost" id="done">Done → browse all pools</button></div>`;
  app.querySelector('#done').onclick = () => { location.hash = '#/pools'; };
  try {
    const modes = [];
    if (App.user.verified_airport) modes.push('airport');
    if (App.user.verified_concert) modes.push('concert');
    let pools = [];
    for (const m of modes) {
      const r = await api('/pools?mode=' + m);
      pools = pools.concat(r.pools.map((p) => ({ ...p, _m: m })));
    }
    pools = pools.filter((p) => p.status === 'open').slice(0, 3);
    const list = app.querySelector('#list');
    list.innerHTML = pools.length ? pools.map((p) => miniPoolCard(p)).join('')
      : emptyState('🌊', 'No pools open right now', 'Be the first — create one when you land.');
    list.querySelectorAll('[data-join]').forEach((b) => b.onclick = async () => {
      try {
        await api(`/pools/${b.dataset.join}/join`, { method: 'POST' });
        toast('You joined the pool 🎉');
        location.hash = '#/pool/' + b.dataset.join;
      } catch (e) { toast(e.message); }
    });
    list.querySelectorAll('[data-open]').forEach((el) =>
      el.onclick = (e) => { if (!e.target.dataset.join) location.hash = '#/pool/' + el.dataset.open; });
  } catch (e) { app.querySelector('#list').innerHTML = `<div class="err">${esc(e.message)}</div>`; }
}

function miniPoolCard(p) {
  return `<div class="card pool" data-open="${p.id}">
    <div class="row between">
      <div><div class="route" style="font-size:15px">${esc(poolTitle(p))}</div>
      <div class="small mut">🕐 ${fmtT(p.window_start)}</div></div>
      <button class="small" data-join="${p.id}">Join</button>
    </div>
    <div style="margin-top:8px"><span class="badge mode">${p.mode === 'airport' ? '✈️' : '🎵'} ${p.mode}</span>
    ${p.women_only ? '<span class="badge women">women only</span>' : ''}
    <span class="badge mode">👥 ${p.member_count}/${p.max_riders}</span></div></div>`;
}

/* ---------------- pools ---------------- */

function poolTitle(p) {
  return p.mode === 'airport'
    ? `${p.airport_code}${p.terminal ? ' ' + p.terminal : ''} → ${p.destination_zone}`
    : `${p.event_name} → ${p.destination_zone}`;
}
function poolSub(p) {
  return p.mode === 'airport'
    ? `📍 ${p.meetup_point}`
    : `🏟️ ${p.venue}${p.pickup_zone ? ' · ' + p.pickup_zone : ''}`;
}

function poolCard(p) {
  const pct = Math.round((p.member_count / Math.max(p.max_riders, 1)) * 100);
  const chips = p.members.slice(0, 4).map((m) => avatar(m.name)).join('')
    + (p.members.length > 4 ? `<span class="av more">+${p.members.length - 4}</span>` : '');
  return `<div class="card pool" data-id="${p.id}">
    <div class="row between" style="align-items:flex-start">
      <div style="flex:1;min-width:0"><div class="route">${esc(poolTitle(p))}</div>
      <div class="meta">${esc(poolSub(p))}</div>
      <div class="meta">🕐 ${fmtT(p.window_start)} – ${fmtT(p.window_end)}</div></div>
      <span data-fare-for="${p.id}"><small class="mut">fare…</small></span>
    </div>
    <div class="avatars">${chips || '<span class="small mut">Be the first to join</span>'}</div>
    <div class="seats"><div class="bar"><i style="width:${pct}%"></i></div>
      <div class="lbl"><span>${p.member_count}/${p.max_riders} seats filled</span>
      ${p.women_only ? '<span class="badge women">women only</span>' : ''}</div></div>
    <div style="margin-top:6px"><span class="badge mode">${p.mode === 'airport' ? '✈️ airport' : '🎵 concert'}</span>
    ${p.status !== 'open' ? `<span class="badge locked">${esc(p.status)}</span>` : ''}</div>
  </div>`;
}

async function fillFares(pools) {
  await Promise.all(pools.map(async (p) => {
    try {
      const { fare } = await api(`/pools/${p.id}/fare`);
      const el = document.querySelector(`[data-fare-for="${p.id}"]`);
      if (el) el.innerHTML = fare
        ? `<span class="price">$${fare.per_person.toFixed(2)} <small>/ person</small></span>`
        : `<small class="mut">fare TBA</small>`;
    } catch { /* leave placeholder */ }
  }));
}

async function PoolsView(app) {
  const verified = App.user.verified_airport || App.user.verified_concert;
  const wopref = localStorage.getItem('lp_wopref') === '1';
  app.innerHTML = `
    <div class="page-head"><h1 style="margin:0">🛬 Landpool</h1></div>
    <div class="seg" role="tablist">
      <button id="tA" class="${App.mode === 'airport' ? 'active' : ''}">✈️ Airport</button>
      <button id="tC" class="${App.mode === 'concert' ? 'active' : ''}">🎵 Concert</button>
    </div>
    ${verified ? '' : `<div class="card"><b>You're not verified yet.</b><br>
      <span class="small mut">Verify your flight or ticket to join pools.</span><br>
      <a class="btn small" style="margin-top:8px" href="#/onboarding">Verify now →</a></div>`}
    <h3>Open pools ${wopref ? '<span class="badge women">women-first</span>' : ''}</h3>
    <div id="list">${skel()}${skel()}${skel()}</div>
    <button class="fab" id="fab" aria-label="Create pool">＋</button>`;
  const load = async () => {
    try {
      const { pools } = await api(`/pools?mode=${App.mode}`);
      let list = pools.filter((p) => p.status === 'open');
      if (wopref) list = [...list.filter((p) => p.women_only), ...list.filter((p) => !p.women_only)];
      const el = app.querySelector('#list');
      el.innerHTML = list.length ? list.map(poolCard).join('')
        : emptyState('🌊', 'No pools in your window yet',
            'Flights land every few minutes — create a pool and travelers will find you.',
            '<a class="btn" style="margin-top:10px" href="#/pools/new">＋ Create a pool</a>');
      el.querySelectorAll('.pool').forEach((c) => c.onclick = () => location.hash = '#/pool/' + c.dataset.id);
      fillFares(list);
    } catch (e) { app.querySelector('#list').innerHTML = `<div class="err">${esc(e.message)}</div>`; }
  };
  app.querySelector('#tA').onclick = () => { App.mode = 'airport'; localStorage.setItem('lp_mode', 'airport'); PoolsView(app); };
  app.querySelector('#tC').onclick = () => { App.mode = 'concert'; localStorage.setItem('lp_mode', 'concert'); PoolsView(app); };
  app.querySelector('#fab').onclick = () => location.hash = '#/pools/new';
  await load();
}

async function PoolNewView(app) {
  const { events } = App.mode === 'concert' ? await api('/verify/events') : { events: [] };
  const def = (mins) => new Date(Date.now() + mins * 60000).toISOString().slice(0, 16);
  app.innerHTML = `
    <a class="back" href="#/pools">← Pools</a>
    <h1>Create a pool</h1>
    <div class="seg">
      <button id="mA" class="${App.mode === 'airport' ? 'active' : ''}">✈️ Airport</button>
      <button id="mC" class="${App.mode === 'concert' ? 'active' : ''}">🎵 Concert</button>
    </div>
    <div class="card"><form id="cf">
      ${App.mode === 'airport' ? `
        <label>Airport code</label><input id="ap" value="JFK" maxlength="4" style="text-transform:uppercase">
        <label>Terminal</label><input id="tm" value="T4">
        <label>Where is everyone headed?</label><input id="dz" required placeholder="Midtown Manhattan">`
      : `
        <label>Event</label><select id="ev">${events.map((e) => `<option value="${e.id}|${esc(e.name)}|${esc(e.venue)}">${esc(e.name)} — ${esc(e.venue)}</option>`).join('')}</select>
        <label>Where is everyone headed after?</label><input id="dz" value="Downtown" required>
        <label>Venue pickup zone</label><input id="pz" placeholder="Gate B, 7th Ave exit">`}
      <div class="grid2">
        <div><label>Window start</label><input id="ws" type="datetime-local" value="${def(60)}" required></div>
        <div><label>Window end</label><input id="we" type="datetime-local" value="${def(120)}" required></div>
      </div>
      <label>Meetup point <span class="dim">(be specific — travelers will walk here)</span></label>
      <input id="mp" required placeholder="${App.mode === 'airport' ? 'T4 arrivals hall, Pillar 4' : 'Main gate, north exit'}">
      <div class="grid2">
        <div><label>Max riders</label><input id="mr" type="number" value="4" min="2" max="8"></div>
        <div><label>&nbsp;</label>
          <div class="pref-row" style="border:0;padding:6px 0"><span class="small">Women-only pool</span>
          <label class="toggle"><input id="wo" type="checkbox"><span class="tr"></span></label></div>
        </div>
      </div>
      <button class="block" style="margin-top:14px">Create pool</button>
    </form></div>`;
  app.querySelector('#mA').onclick = () => { App.mode = 'airport'; localStorage.setItem('lp_mode', 'airport'); PoolNewView(app); };
  app.querySelector('#mC').onclick = () => { App.mode = 'concert'; localStorage.setItem('lp_mode', 'concert'); PoolNewView(app); };
  app.querySelector('#cf').onsubmit = async (e) => {
    e.preventDefault();
    const g = (id) => app.querySelector('#' + id)?.value;
    try {
      const body = { mode: App.mode, meetup_point: g('mp'), max_riders: g('mr'),
        women_only: app.querySelector('#wo').checked,
        window_start: new Date(g('ws')).toISOString(), window_end: new Date(g('we')).toISOString() };
      if (App.mode === 'airport') Object.assign(body, {
        airport_code: (g('ap') || 'JFK').toUpperCase(), terminal: g('tm'), destination_zone: g('dz') });
      else {
        const [event_id, event_name, venue] = g('ev').split('|');
        Object.assign(body, { event_id, event_name, venue, destination_zone: g('dz'), pickup_zone: g('pz') });
      }
      const { pool } = await api('/pools', { method: 'POST', body });
      toast('Pool created 🎉');
      location.hash = '#/pool/' + pool.id;
    } catch (err) { errBox(app, err); }
  };
}

/* ---------------- pool detail ---------------- */

let currentPoolRoom = null;

function tripEndpoints(pool) {
  const pickup = pool.mode === 'airport'
    ? `${pool.meetup_point}, ${pool.airport_code} Airport`
    : `${pool.pickup_zone || pool.meetup_point}, ${pool.venue}`;
  return { pickup, dropoff: pool.destination_zone };
}
const uberLink = (pickup, dropoff) =>
  'https://m.uber.com/ul/?action=setPickup' +
  '&pickup[formatted_address]=' + encodeURIComponent(pickup) +
  '&dropoff[formatted_address]=' + encodeURIComponent(dropoff);
const LYFT_LINK = 'https://lyft.com/ride-with-lyft';

const msgHtml = (m, meId) => `<div class="msg ${m.sender_id === meId ? 'mine' : ''}">
  ${m.sender_id === meId ? '' : `<div class="who">${esc(firstName(m.sender_name || 'traveler'))}</div>`}
  <span class="bubble">${esc(m.body)}</span><span class="time">${timeAgo(m.created_at)}</span></div>`;

async function PoolDetailView(app, id) {
  const { pool } = await api('/pools/' + id);
  const me = App.user;
  const locked = pool.status !== 'open';
  const { pickup, dropoff } = tripEndpoints(pool);

  app.innerHTML = `
    <a class="back" href="#/pools">← Pools</a>
    <div class="card">
      <div class="route" style="font-size:19px;font-weight:800">${esc(poolTitle(pool))}</div>
      <div style="margin:8px 0">
        <span class="badge mode">${pool.mode === 'airport' ? '✈️ airport' : '🎵 concert'}</span>
        ${pool.women_only ? '<span class="badge women">women only</span>' : ''}
        ${locked ? `<span class="badge locked">${esc(pool.status)} — chat locked</span>`
                 : `<span class="badge open">${pool.member_count}/${pool.max_riders} riders</span>`}
      </div>
      <div class="kv"><span class="k">📍 Where to meet</span><b style="text-align:right">${esc(pool.meetup_point)}</b></div>
      <div class="kv"><span class="k">🕐 ${pool.mode === 'airport' ? 'Landing window' : 'End-time window'}</span>
        <span style="text-align:right">${fmtT(pool.window_start)}<br>${fmtT(pool.window_end)}</span></div>
      ${pool.venue ? `<div class="kv"><span class="k">🏟️ Venue</span><span>${esc(pool.venue)}</span></div>` : ''}
      ${!pool.is_member && !locked
        ? `<button class="block" id="join" style="margin-top:10px">Join this pool</button>`
        : pool.is_member && !locked
        ? `<button class="block ghost" id="leave" style="margin-top:10px">Leave pool</button>` : ''}
    </div>

    <div class="card"><h2>👥 Riders · ${pool.member_count}/${pool.max_riders}</h2>
      <div class="avatars" style="margin:2px 0 6px">${pool.members.map((m) => avatar(m.name)).join('')}</div>
      ${pool.members.map((m) => `
        <div class="member">
          <div class="who"><div class="nm">${esc(firstName(m.name))} ${m.id === me.id ? '<span class="dim small">· you</span>' : ''}</div>
            <div>${vBadge(m)} ${m.id === pool.organizer_id ? '<span class="badge mode">organizer</span>' : ''}</div></div>
          ${m.id === me.id ? '' : `<div class="acts">
            <button class="ghost iconbtn" data-dm="${m.id}" aria-label="Message">💬</button>
            <button class="ghost iconbtn" data-call="${m.id}" data-nm="${esc(m.name)}" aria-label="Call">📞</button>
            <button class="ghost iconbtn" data-block="${m.id}" aria-label="Block">🚫</button>
          </div>`}
        </div>`).join('')}
      ${pool.is_member ? `
        <h3>Invite a traveler</h3>
        <div class="chat-form"><input id="usearch" placeholder="Search by name…" autocomplete="off">
        <button class="ghost" id="ugo" type="button">Search</button></div>
        <div id="uresults" style="margin-top:8px"></div>` : ''}
    </div>

    <div class="card"><h2>💵 Fare split</h2><div id="fare">${skel(64)}</div>
      ${pool.is_organizer && !locked ? `
        <div class="chat-form" style="margin-top:10px">
          <input id="ftotal" type="number" step="0.01" min="1" inputmode="decimal" placeholder="Total fare, e.g. 72.00">
          <button id="fset" type="button">Set</button></div>
        <p class="small mut">Enter what the Uber/Lyft actually cost — it splits across confirmed riders.</p>` : ''}
    </div>

    ${pool.is_member ? `
    <div class="card"><h2>🚕 Book the ride</h2>
      <p class="small mut" style="margin-top:0">One car for the whole group — book it together, then split the fare above.</p>
      <div class="trip-line">📍 <b>Pickup:</b> ${esc(pickup)}</div>
      <div class="trip-line">🏁 <b>Dropoff:</b> ${esc(dropoff)}</div>
      <div class="ride-btns">
        <a class="btn block" href="${uberLink(pickup, dropoff)}" target="_blank" rel="noopener">Book with Uber</a>
        <a class="btn block ghost" href="${LYFT_LINK}" target="_blank" rel="noopener">Book with Lyft</a>
        <button class="ghost block small" id="copytrip" type="button">📋 Copy trip details</button>
      </div></div>` : ''}

    <div class="card"><h2>💬 Group chat ${locked ? '<span class="small mut">· locked — trip ended</span>' : ''}</h2>
      <div class="chatbox" id="chat"></div>
      ${!locked && pool.is_member
        ? `<form id="chatform" class="chat-form"><input id="chatinput" placeholder="Message the pool…" maxlength="2000" autocomplete="off"><button>Send</button></form>`
        : `<p class="small mut">${pool.is_member ? '' : 'Join the pool to chat with riders.'}</p>`}
    </div>

    <div class="card"><h2>🛡️ Safety</h2>
      <div class="row">
        <button class="ghost small" id="sharebtn" type="button">🔗 Trip-share link</button>
        <button class="ghost small" id="reportpool" type="button">⚠️ Report pool</button>
      </div>
      <p class="small mut">The share link is view-only for family — route and riders, no chat or contact info.</p>
      <div id="shareout"></div>
      <div id="reportbox"></div>
    </div>`;

  markRead('pool', pool.id);

  /* join / leave */
  const joinBtn = app.querySelector('#join');
  if (joinBtn) joinBtn.onclick = async () => {
    try { await api(`/pools/${id}/join`, { method: 'POST' }); toast('You joined the pool 🎉'); PoolDetailView(app, id); }
    catch (e) { toast(e.message); }
  };
  const leaveBtn = app.querySelector('#leave');
  if (leaveBtn) leaveBtn.onclick = async () => {
    await api(`/pools/${id}/leave`, { method: 'POST' });
    toast('You left the pool'); location.hash = '#/pools';
  };

  /* chat */
  const chat = app.querySelector('#chat');
  const render = (m) => { chat.insertAdjacentHTML('beforeend', msgHtml(m, me.id)); chat.scrollTop = chat.scrollHeight; };
  if (pool.is_member) {
    try {
      const { messages } = await api(`/pools/${id}/messages`);
      if (!messages.length) chat.innerHTML = '<p class="small mut" style="text-align:center;margin-top:100px">No messages yet — say hi 👋</p>';
      messages.forEach(render);
    } catch (e) { chat.innerHTML = `<div class="err">${esc(e.message)}</div>`; }
    RT.joinPool(pool.id); currentPoolRoom = pool.id;
  } else {
    chat.innerHTML = '<p class="small mut" style="text-align:center;margin-top:100px">Join the pool to see the conversation.</p>';
  }
  const cf = app.querySelector('#chatform');
  if (cf) cf.onsubmit = (e) => {
    e.preventDefault();
    const inp = app.querySelector('#chatinput');
    if (inp.value.trim()) RT.poolMsg(pool.id, inp.value.trim());
    inp.value = '';
  };

  /* member actions */
  app.querySelectorAll('[data-dm]').forEach((b) => b.onclick = () => location.hash = '#/dm/' + b.dataset.dm);
  app.querySelectorAll('[data-call]').forEach((b) => b.onclick = () =>
    location.hash = `#/call/${b.dataset.call}?name=${encodeURIComponent(b.dataset.nm)}`);
  app.querySelectorAll('[data-block]').forEach((b) => {
    let armed = false, timer = null;
    b.onclick = async () => {
      if (!armed) {
        armed = true; b.textContent = '❓'; b.title = 'Tap again to confirm block';
        timer = setTimeout(() => { armed = false; b.textContent = '🚫'; }, 3000);
        return;
      }
      clearTimeout(timer);
      try {
        await api('/safety/block', { method: 'POST', body: { user_id: Number(b.dataset.block) } });
        toast('Traveler blocked');
        PoolDetailView(app, id);
      } catch (e) { toast(e.message); }
    };
  });

  /* invite search */
  const ugo = app.querySelector('#ugo');
  if (ugo) ugo.onclick = async () => {
    const q = app.querySelector('#usearch').value.trim();
    if (!q) return;
    try {
      const { users } = await api('/auth/users/search?q=' + encodeURIComponent(q));
      const box = app.querySelector('#uresults');
      box.innerHTML = users.length ? users.map((u) => `
        <div class="member"><div class="who"><div class="nm">${esc(firstName(u.name))}</div><div>${vBadge(u)}</div></div>
        <button class="ghost small" data-inv="${u.id}" type="button">Invite</button></div>`).join('')
        : emptyState('🔍', 'No travelers found', 'Try another name.');
      box.querySelectorAll('[data-inv]').forEach((x) => x.onclick = async () => {
        try {
          await api('/invites', { method: 'POST', body: { pool_id: pool.id, to_user_id: Number(x.dataset.inv) } });
          x.outerHTML = '<span class="okmsg small" style="margin:0">Invite sent ✓</span>';
          toast('Invite sent ✉️'); updateTabs();
        } catch (e) { toast(e.message); }
      });
    } catch (e) { toast(e.message); }
  };

  /* fare */
  const fareEl = app.querySelector('#fare');
  const loadFare = async () => {
    try {
      const { fare } = await api(`/pools/${id}/fare`);
      fareEl.innerHTML = fare
        ? `<div class="fare-big">$${fare.per_person.toFixed(2)} <small>per person</small></div>
           <div class="fare-rows">
             <div class="kv"><span class="k">Total fare</span><span>$${fare.total.toFixed(2)}</span></div>
             ${fare.riders.map((r) => `<div class="kv"><span class="k">${esc(firstName(r))}</span><span>$${fare.per_person.toFixed(2)}</span></div>`).join('')}
           </div>`
        : `<p class="mut">${pool.is_organizer ? 'Set the total once you know the fare.' : 'Waiting for the organizer to set the fare.'}</p>`;
    } catch (e) { fareEl.innerHTML = `<div class="err">${esc(e.message)}</div>`; }
  };
  await loadFare();
  const fset = app.querySelector('#fset');
  if (fset) fset.onclick = async () => {
    const v = app.querySelector('#ftotal').value;
    try {
      await api(`/pools/${id}/fare`, { method: 'POST', body: { total: v } });
      toast('Fare updated 💵'); loadFare();
    } catch (e) { toast(e.message); }
  };

  /* book ride */
  const copyBtn = app.querySelector('#copytrip');
  if (copyBtn) copyBtn.onclick = async () => {
    const txt = `Landpool trip\nPickup: ${pickup}\nDropoff: ${dropoff}`;
    try { await navigator.clipboard.writeText(txt); toast('Trip details copied 📋'); }
    catch { toast('Copy not available on this browser'); }
  };

  /* safety */
  app.querySelector('#sharebtn').onclick = async () => {
    try {
      const { url } = await api(`/pools/${id}/share`, { method: 'POST' });
      const full = location.origin + url;
      app.querySelector('#shareout').innerHTML =
        `<div class="okmsg">View-only link:<br><a href="${url}">${esc(full)}</a></div>`;
      toast('Share link created 🔗');
    } catch (e) { toast(e.message); }
  };
  app.querySelector('#reportpool').onclick = () => {
    const box = app.querySelector('#reportbox');
    if (box.innerHTML) { box.innerHTML = ''; return; }
    box.innerHTML = `<div style="margin-top:10px"><label>What happened in this pool?</label>
      <textarea id="rreason" placeholder="Describe the issue…"></textarea>
      <div class="row" style="margin-top:8px"><button class="small danger" id="rsend" type="button">Send report</button>
      <button class="small ghost" id="rcancel" type="button">Cancel</button></div></div>`;
    box.querySelector('#rcancel').onclick = () => box.innerHTML = '';
    box.querySelector('#rsend').onclick = async () => {
      const reason = box.querySelector('#rreason').value.trim();
      if (reason.length < 5) { toast('Please describe what happened (min 5 chars)'); return; }
      try {
        await api('/safety/report', { method: 'POST',
          body: { user_id: pool.organizer_id, reason: `[pool ${pool.id}] ${reason}` } });
        box.innerHTML = '<div class="okmsg">Report saved. Our safety team reviews every report.</div>';
      } catch (e) { toast(e.message); }
    };
  };
}

/* ---------------- messages ---------------- */

async function MessagesView(app) {
  app.innerHTML = `<div class="page-head"><h1 style="margin:0">Messages</h1></div>
    <h3>Pools</h3><div id="pools">${skel()}${skel()}</div>
    <h3>Direct</h3><div id="dms">${skel()}${skel()}</div>`;
  try {
    const [{ pools }, { threads }] = await Promise.all([api('/pools'), api('/dm')]);
    const mine = pools.filter((p) => p.is_member)
      .sort((a, b) => new Date(b.window_start) - new Date(a.window_start));
    const pEl = app.querySelector('#pools');
    if (!mine.length) {
      pEl.innerHTML = emptyState('💬', 'No pool chats yet', 'Join a pool and the group chat shows up here.');
    } else {
      const rows = await Promise.all(mine.map(async (p) => {
        let last = null;
        try { const r = await api(`/pools/${p.id}/messages`); last = r.messages[r.messages.length - 1]; } catch {}
        const unread = last && (!readTs.pool?.[p.id] || new Date(last.created_at) > new Date(readTs.pool[p.id]));
        if (unread) unreadPools.add(p.id); else unreadPools.delete(p.id);
        return { p, last, unread };
      }));
      pEl.innerHTML = rows.map(({ p, last, unread }) => `
        <div class="thread" data-pool="${p.id}">
          ${unread ? '<span class="dot"></span>' : '<span style="width:10px;flex-shrink:0"></span>'}
          <div class="body"><div class="nm">${esc(poolTitle(p))}</div>
            <div class="prev">${last ? esc(firstName(last.sender_name) + ': ' + last.body) : 'No messages yet'}</div></div>
          <span class="time">${last ? timeAgo(last.created_at) : ''}</span>
        </div>`).join('');
      pEl.querySelectorAll('[data-pool]').forEach((el) =>
        el.onclick = () => location.hash = '#/pool/' + el.dataset.pool);
    }
    const dEl = app.querySelector('#dms');
    if (!threads.length) {
      dEl.innerHTML = emptyState('👋', 'No direct messages', 'Share a pool with someone to unlock 1-on-1 chat.');
    } else {
      dEl.innerHTML = threads.map((t) => {
        const unread = !readTs.dm?.[t.user.id] || new Date(t.at) > new Date(readTs.dm[t.user.id]);
        if (unread) unreadDms.add(t.user.id); else unreadDms.delete(t.user.id);
        return `<div class="thread" data-u="${t.user.id}">
          ${unread ? '<span class="dot"></span>' : '<span style="width:10px;flex-shrink:0"></span>'}
          ${avatar(t.user.name)}
          <div class="body"><div class="nm">${esc(firstName(t.user.name))} ${vBadge(t.user)}</div>
            <div class="prev">${esc(String(t.last_message).slice(0, 80))}</div></div>
          <span class="time">${timeAgo(t.at)}</span></div>`;
      }).join('');
      dEl.querySelectorAll('[data-u]').forEach((el) =>
        el.onclick = () => location.hash = '#/dm/' + el.dataset.u);
    }
    updateTabs();
  } catch (e) {
    app.querySelector('#pools').innerHTML = `<div class="err">${esc(e.message)}</div>`;
  }
}

async function DmView(app, userId) {
  const { user, messages } = await api('/dm/' + userId);
  app.innerHTML = `<a class="back" href="#/messages">← Messages</a>
    <div class="card tight"><div class="row between">
      <div class="row" style="gap:10px">${avatar(user.name)}
        <div><b>${esc(firstName(user.name))}</b><div>${vBadge(user)}</div></div></div>
      <div class="row" style="gap:6px">
        <button class="ghost iconbtn" id="callbtn" aria-label="Voice call">📞</button>
        <button class="ghost iconbtn" id="vidbtn" aria-label="Video call">🎥</button>
      </div></div>
      <p class="small mut" style="margin:8px 0 0">Masked call — no phone numbers. They see only your first name + verified badge.</p>
    </div>
    <div class="card"><div class="chatbox" id="chat" style="height:380px"></div>
      <form id="f" class="chat-form"><input id="inp" maxlength="2000" placeholder="Message ${esc(firstName(user.name))}…" autocomplete="off"><button>Send</button></form></div>`;
  markRead('dm', user.id);
  const chat = app.querySelector('#chat');
  const render = (m) => {
    chat.insertAdjacentHTML('beforeend', msgHtml({ ...m, sender_name: user.name }, App.user.id));
    chat.scrollTop = chat.scrollHeight;
  };
  if (!messages.length) chat.innerHTML = '<p class="small mut" style="text-align:center;margin-top:120px">No messages yet — say hi 👋</p>';
  messages.forEach(render);
  app.querySelector('#f').onsubmit = (e) => {
    e.preventDefault();
    const inp = app.querySelector('#inp');
    if (inp.value.trim()) RT.dm(Number(userId), inp.value.trim());
    inp.value = '';
  };
  app.querySelector('#callbtn').onclick = () => location.hash = `#/call/${userId}?name=${encodeURIComponent(user.name)}&video=0`;
  app.querySelector('#vidbtn').onclick = () => location.hash = `#/call/${userId}?name=${encodeURIComponent(user.name)}&video=1`;
}

/* ---------------- invites ---------------- */

async function InvitesView(app) {
  app.innerHTML = `<div class="page-head"><h1 style="margin:0">Invites</h1></div>
    <h3>Received</h3><div id="inbox">${skel()}${skel()}</div>
    <h3>Sent</h3><div id="sent">${skel()}</div>`;
  const load = async () => {
    try {
      const [{ invites }, sent] = await Promise.all([api('/invites/inbox'), api('/invites/sent')]);
      App.inviteCount = invites.length; updateTabs();
      const ix = app.querySelector('#inbox');
      ix.innerHTML = invites.length ? invites.map((i) => `
        <div class="card tight">
          <div class="row between">
            <div style="flex:1;min-width:0"><b>${esc(firstName(i.from_name))}</b>
              <span class="small mut">invited you</span>
              <div class="small mut">${i.mode === 'airport' ? '✈️' : '🎵'} ${esc(i.destination_zone)} · 📍 ${esc(i.meetup_point)}</div>
              <div class="small dim">🕐 ${fmtT(i.window_start)}</div></div>
          </div>
          <div class="row" style="margin-top:10px">
            <button class="ok small" data-acc="${i.id}" type="button">Accept</button>
            <button class="ghost small" data-dec="${i.id}" type="button">Decline</button>
            <a class="btn ghost small" href="#/pool/${i.pool_id}">View pool</a>
          </div></div>`).join('')
        : emptyState('✉️', 'No pending invites', 'When a traveler invites you, it lands here.');
      ix.querySelectorAll('[data-acc]').forEach((b) => b.onclick = async () => {
        try { await api(`/invites/${b.dataset.acc}/accept`, { method: 'POST' });
          toast('Invite accepted 🎉'); load(); }
        catch (e) { toast(e.message); }
      });
      ix.querySelectorAll('[data-dec]').forEach((b) => b.onclick = async () => {
        await api(`/invites/${b.dataset.dec}/decline`, { method: 'POST' });
        toast('Invite declined'); load();
      });
      const sx = app.querySelector('#sent');
      sx.innerHTML = sent.invites.length ? sent.invites.map((i) => `
        <div class="card tight"><div class="row between">
          <div><b>${esc(firstName(i.to_name))}</b> <span class="small mut">· pending</span>
          <div class="small mut">${i.mode === 'airport' ? '✈️' : '🎵'} ${esc(i.destination_zone)} · 🕐 ${fmtT(i.window_start)}</div></div>
          <a class="btn ghost small" href="#/pool/${i.pool_id}">View pool</a>
        </div></div>`).join('')
        : '<p class="small mut" style="padding:0 4px">You haven\'t sent any invites yet.</p>';
    } catch (e) { app.querySelector('#inbox').innerHTML = `<div class="err">${esc(e.message)}</div>`; }
  };
  await load();
}

/* ---------------- profile ---------------- */

async function ProfileView(app) {
  const me = App.user;
  const wopref = localStorage.getItem('lp_wopref') === '1';
  app.innerHTML = `<div class="page-head"><h1 style="margin:0">Profile</h1></div>
    <div class="card"><div class="row" style="gap:14px">
      <span class="av" style="background:${avColor(me.name)};width:56px;height:56px;font-size:19px">${esc(initials(me.name))}</span>
      <div><div style="font-size:19px;font-weight:800">${esc(firstName(me.name))}</div>
        <div style="margin-top:4px">
          ${me.verified_airport ? '<span class="badge verified">✈️ airport verified</span>'
            : '<a class="badge mode" href="#/onboarding">✈️ verify flight →</a>'}
          ${me.verified_concert ? '<span class="badge verified">🎵 ticket verified</span>'
            : '<a class="badge mode" href="#/onboarding">🎵 verify ticket →</a>'}
        </div></div></div></div>

    <h3>My upcoming trips</h3><div id="trips">${skel()}${skel()}</div>

    <h3>Preferences</h3>
    <div class="card tight"><div class="pref-row">
      <div><b>Women-first pools</b><div class="small mut">Show women-only pools at the top of the list.</div></div>
      <label class="toggle"><input id="wopref" type="checkbox" ${wopref ? 'checked' : ''}><span class="tr"></span></label>
    </div></div>

    <h3>Blocked travelers</h3><div id="blocks">${skel(52)}</div>

    <button class="ghost block" id="logout" style="margin-top:16px">Log out</button>`;
  app.querySelector('#wopref').onchange = (e) => {
    localStorage.setItem('lp_wopref', e.target.checked ? '1' : '0');
    toast(e.target.checked ? 'Women-only pools will show first' : 'Preference off');
  };
  app.querySelector('#logout').onclick = logout;
  try {
    const [{ pools }, { blocks }] = await Promise.all([api('/pools'), api('/safety/blocks')]);
    const trips = pools.filter((p) => p.is_member && new Date(p.ends_at) > new Date())
      .sort((a, b) => new Date(a.window_start) - new Date(b.window_start));
    app.querySelector('#trips').innerHTML = trips.length ? trips.map((p) => `
      <div class="card tight pool" data-id="${p.id}">
        <div class="row between"><div style="flex:1;min-width:0">
          <div style="font-weight:700;font-size:14.5px">${esc(poolTitle(p))}</div>
          <div class="small mut">🕐 ${fmtT(p.window_start)} · 📍 ${esc(p.meetup_point)}</div></div>
          <span class="badge mode">${p.mode === 'airport' ? '✈️' : '🎵'}</span></div></div>`).join('')
      : emptyState('🧳', 'No upcoming trips', 'Join a pool and it shows up here.');
    app.querySelectorAll('#trips .pool').forEach((el) =>
      el.onclick = () => location.hash = '#/pool/' + el.dataset.id);
    const bEl = app.querySelector('#blocks');
    bEl.innerHTML = blocks.length ? blocks.map((u) => `
      <div class="member"><div class="who"><div class="nm">${esc(firstName(u.name))}</div></div>
        <button class="ghost small" data-unblock="${u.id}" type="button">Unblock</button></div>`).join('')
      : '<p class="small mut" style="padding:0 4px">Nobody blocked.</p>';
    bEl.querySelectorAll('[data-unblock]').forEach((b) => b.onclick = async () => {
      await api('/safety/block/' + b.dataset.unblock, { method: 'DELETE' });
      toast('Traveler unblocked'); ProfileView(app);
    });
  } catch (e) { app.querySelector('#trips').innerHTML = `<div class="err">${esc(e.message)}</div>`; }
}

/* ---------------- call ---------------- */

async function CallView(app, userId) {
  const q = new URLSearchParams(location.hash.split('?')[1] || '');
  const peerName = q.get('name') || 'traveler';
  const video = q.get('video') === '1';
  app.innerHTML = `<div class="card" style="text-align:center;margin-top:20px">
    <span class="av" style="width:84px;height:84px;font-size:28px;margin:0 auto">${esc(initials(peerName))}</span>
    <h1 style="margin-top:10px">${esc(firstName(peerName))} ${'<span class="badge verified">✓ verified</span>'}</h1>
    <p class="mut small">Masked ${video ? 'video' : 'voice'} call — no phone numbers</p>
    <div class="videos">
      <video id="local-video" muted playsinline ${video ? '' : 'style="display:none"'}></video>
      <video id="remote-video" playsinline ${video ? '' : 'style="display:none"'}></video>
    </div>
    <p id="cstate" class="mut">requesting microphone…</p>
    <div class="call-ctl">
      <button id="ans" class="ok hidden" type="button">Accept</button>
      <button id="rej" class="danger hidden" type="button">Decline</button>
      <button id="hang" class="danger iconbtn" type="button" aria-label="Hang up" style="width:60px;height:60px;font-size:24px">📞</button>
    </div></div>`;
  const state = (s) => app.querySelector('#cstate').textContent = 'status: ' + s;
  CALL.onState = (s) => {
    state(s);
    const incoming = s === 'incoming';
    app.querySelector('#ans').classList.toggle('hidden', !incoming);
    app.querySelector('#rej').classList.toggle('hidden', !incoming);
    if (s === 'ended') location.hash = '#/dm/' + userId;
  };
  const isCaller = !CALL.peerId || CALL.peerId !== Number(userId);
  try { if (isCaller) await CALL.start(Number(userId), peerName, video); }
  catch (e) { state('mic/camera blocked: ' + e.message); }
  app.querySelector('#ans').onclick = async () => {
    try { await CALL.answer(CALL._pendingOffer, video); } catch (e) { state('failed: ' + e.message); }
  };
  app.querySelector('#rej').onclick = () => { CALL.hangup(); location.hash = '#/dm/' + userId; };
  app.querySelector('#hang').onclick = () => { CALL.hangup(); location.hash = '#/dm/' + userId; };
}

/* ---------------- share ---------------- */

async function ShareView(app, token) {
  const res = await fetch('/api/safety/share/' + token);
  if (!res.ok) { app.innerHTML = '<div class="err">Share link not found.</div>'; return; }
  const { pool } = await res.json();
  app.innerHTML = `<div class="login-logo">🚕</div>
    <div class="login-title"><h1>Live trip share</h1><p class="mut">View-only — shared by a Landpool traveler.</p></div>
    <div class="card">
      <div class="route" style="font-weight:800;font-size:17px">${pool.mode === 'airport'
        ? `${esc(pool.airport_code)} ${esc(pool.terminal || '')} → ${esc(pool.destination_zone)}`
        : `${esc(pool.event_name)} → ${esc(pool.destination_zone)}`}</div>
      <div class="kv"><span class="k">📍 Meetup</span><span>${esc(pool.meetup_point)}</span></div>
      <div class="kv"><span class="k">🕐 Window</span><span>${fmtT(pool.window_start)}</span></div>
      <div class="kv"><span class="k">Status</span><span>${esc(pool.status)}</span></div>
      <div class="kv"><span class="k">👥 Riders</span><span>${pool.riders.map(esc).join(', ')}</span></div>
      ${pool.fare ? `<div class="kv"><span class="k">💵 Fare</span><span>$${pool.fare.total.toFixed(2)} total · $${pool.fare.per_person.toFixed(2)}/person</span></div>` : ''}
    </div>`;
}

/* ---------------- realtime wiring ---------------- */

function wireRealtime() {
  RT.on('pool_msg', ({ pool_id, message }) => {
    const m = message;
    const here = String(location.hash).split('?')[0] === '#/pool/' + pool_id;
    if (here) {
      const chat = document.getElementById('chat');
      if (chat) {
        const empty = chat.querySelector('.mut[style]');
        if (empty) empty.remove();
        chat.insertAdjacentHTML('beforeend', msgHtml({ ...m, sender_name: m.sender_name }, App.user?.id));
        chat.scrollTop = chat.scrollHeight;
        markRead('pool', pool_id);
      }
    } else {
      unreadPools.add(pool_id); updateTabs();
    }
  });
  RT.on('dm', ({ from, message }) => {
    const m = (location.hash.match(/^#\/dm\/(\d+)/) || [])[1];
    if (m && Number(m) === from) {
      const chat = document.getElementById('chat');
      if (chat) {
        const empty = chat.querySelector('.mut[style]');
        if (empty) empty.remove();
        chat.insertAdjacentHTML('beforeend', msgHtml(message, App.user?.id));
        chat.scrollTop = chat.scrollHeight;
        markRead('dm', from);
      }
    } else {
      unreadDms.add(from); updateTabs();
      showBanner(`💬 New message from ${esc(firstName('traveler'))}`, `#/dm/${from}`);
    }
  });
  RT.on('call', async ({ action, from, payload }) => {
    if (action === 'ring') {
      CALL._pendingOffer = null;
      showBanner(`📞 Incoming ${payload?.video ? 'video' : 'voice'} call from ${esc(firstName(payload?.from_name || 'traveler'))} (masked)`,
        `#/call/${from}?name=${encodeURIComponent(payload?.from_name || 'traveler')}&video=${payload?.video ? 1 : 0}&incoming=1`);
      CALL.peerId = from; CALL.peerName = payload?.from_name || 'traveler'; CALL.isVideo = !!(payload && payload.video);
      CALL._awaitOffer = true;
    } else if (action === 'offer' && CALL._awaitOffer) {
      CALL._pendingOffer = payload; CALL._awaitOffer = false;
      CALL.onState('incoming');
    } else {
      CALL.onSignal(action, from, payload);
    }
  });
  RT.on('error', ({ message }) => console.warn('[ws]', message));
}

let bannerTimer = null;
function showBanner(html, href) {
  const b = document.getElementById('call-banner');
  b.innerHTML = `<span style="flex:1">${html}</span><a class="btn small" href="${href}">Open</a>
    <button class="ghost iconbtn" id="bclose" aria-label="Dismiss">✕</button>`;
  b.classList.remove('hidden');
  document.getElementById('bclose').onclick = () => b.classList.add('hidden');
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => b.classList.add('hidden'), 30000);
}

/* ---------------- router ---------------- */

const routes = [
  [/^#\/login$/, LoginView, null],
  [/^#\/signup$/, SignupView, null],
  [/^#\/onboarding$/, OnboardingView, null],
  [/^#\/pools\/new$/, PoolNewView, 'pools'],
  [/^#\/pools$/, PoolsView, 'pools'],
  [/^#\/pool\/(\d+)$/, PoolDetailView, 'pools'],
  [/^#\/messages$/, MessagesView, 'messages'],
  [/^#\/dm\/(\d+)$/, DmView, 'messages'],
  [/^#\/invites$/, InvitesView, 'invites'],
  [/^#\/profile$/, ProfileView, 'profile'],
  [/^#\/call\/(\d+)/, CallView, null],
];

async function router() {
  const app = document.getElementById('app');
  const hash = location.hash || '#/';
  if (currentPoolRoom) { RT.leavePool(currentPoolRoom); currentPoolRoom = null; }

  const shareM = hash.match(/^#\/share\/([a-f0-9]+)$/);
  if (shareM) { showTabs(null); return ShareView(app, shareM[1]); }

  if (!App.token) {
    showTabs(null);
    if (hash.startsWith('#/signup')) return SignupView(app);
    if (!hash.startsWith('#/login')) { location.hash = '#/login'; return; }
    return LoginView(app);
  }

  try {
    const { user } = await api('/auth/me');
    App.user = user; localStorage.setItem('lp_user', JSON.stringify(user));
  } catch { logout(); return; }

  if (hash === '#/' || hash === '') {
    location.hash = (App.user.verified_airport || App.user.verified_concert) ? '#/pools' : '#/onboarding';
    return;
  }
  for (const [re, view, tab] of routes) {
    const m = hash.match(re);
    if (m) {
      showTabs(tab);
      try { await view(app, ...m.slice(1)); }
      catch (e) { app.innerHTML = `<div class="err">${esc(e.message)}</div>`; }
      return;
    }
  }
  showTabs('pools');
  app.innerHTML = '<div class="err">Page not found.</div>';
}

window.addEventListener('hashchange', router);
wireRealtime();
if (App.token) RT.connect(App.token);
router();
