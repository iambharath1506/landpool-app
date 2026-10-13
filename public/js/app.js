// Landpool SPA — vanilla JS, no build step.
// Hash routes: #/ #/login #/signup #/verify #/pool/:id #/invites #/dm #/dm/:id #/call/:id #/share/:token

const App = {
  user: JSON.parse(localStorage.getItem('lp_user') || 'null'),
  token: localStorage.getItem('lp_token'),
  mode: 'airport',
};

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
  if (!res.ok) throw new Error(data.error || 'Request failed.');
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

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtT = (iso) => new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const firstName = (n) => String(n || '').split(/[\s_]+/)[0];
const vBadge = (u) => (u.verified_airport || u.verified_concert) ? '<span class="badge verified">✓ verified traveler</span>' : '';

function nav() {
  const el = document.getElementById('nav');
  el.innerHTML = App.user
    ? `<span class="me small">${esc(App.user.name)}</span>
       <a href="#/">Pools</a><a href="#/verify">Verify</a><a href="#/invites">Invites</a>
       <a href="#/dm">Messages</a><a href="#" id="logout">Log out</a>`
    : `<a href="#/login">Log in</a><a href="#/signup">Sign up</a>`;
  const lo = document.getElementById('logout');
  if (lo) lo.onclick = (e) => { e.preventDefault(); logout(); };
}

function errBox(app, e) { app.insertAdjacentHTML('afterbegin', `<div class="err">${esc(e.message)}</div>`); }

/* ---------------- views ---------------- */

async function LoginView(app) {
  app.innerHTML = `<div class="card"><h1>Welcome back</h1>
    <form id="f"><label>Name</label><input id="name" required>
    <label>Password</label><input id="pw" type="password" required>
    <button>Log in</button></form>
    <p class="mut small">Demo logins — priya / arjun / meera / dev / sam · password <b>demo1234</b></p>
    <p class="small">New here? <a href="#/signup">Create an account</a></p></div>`;
  app.querySelector('#f').onsubmit = async (e) => {
    e.preventDefault();
    try {
      const { token, user } = await api('/auth/login', { method: 'POST',
        body: { name: app.querySelector('#name').value, password: app.querySelector('#pw').value } });
      setSession(token, user); location.hash = '#/';
    } catch (err) { errBox(app, err); }
  };
}

async function SignupView(app) {
  app.innerHTML = `<div class="card"><h1>Create your account</h1>
    <form id="f"><label>Display name</label><input id="name" required minlength="2">
    <label>Password (min 6 chars)</label><input id="pw" type="password" required minlength="6">
    <label>Gender <span class="mut">(for women-only pools)</span></label>
    <select id="g"><option value="">Prefer not to say</option><option value="F">Woman</option><option value="M">Man</option><option value="X">Nonbinary</option></select>
    <button>Sign up</button></form>
    <p class="small">Have an account? <a href="#/login">Log in</a></p></div>`;
  app.querySelector('#f').onsubmit = async (e) => {
    e.preventDefault();
    try {
      const { token, user } = await api('/auth/signup', { method: 'POST', body: {
        name: app.querySelector('#name').value,
        password: app.querySelector('#pw').value,
        gender: app.querySelector('#g').value || null } });
      setSession(token, user); location.hash = '#/verify';
    } catch (err) { errBox(app, err); }
  };
}

async function VerifyView(app) {
  const me = (await api('/auth/me')).user; App.user = me;
  localStorage.setItem('lp_user', JSON.stringify(me));
  const { events } = await api('/verify/events');
  app.innerHTML = `<h1>Get verified</h1>
    <p class="mut">Verification unlocks pooling. <span class="small">Demo: any well-formed PNR / ticket code is accepted.</span></p>
    <div class="grid2">
    <div class="card"><h2>✈️ Flight (PNR)</h2>
      ${me.verified_airport ? '<div class="okmsg">✓ Airport-verified</div>' : `
      <form id="fpnr"><label>PNR — 6 chars, e.g. ABC123</label><input id="pnr" maxlength="6" required>
      <label>Last name on booking</label><input id="ln" required>
      <label>Flight number, e.g. AA100</label><input id="fl" required>
      <button>Verify flight</button></form>`}
    </div>
    <div class="card"><h2>🎵 Concert ticket</h2>
      ${me.verified_concert ? '<div class="okmsg">✓ Ticket-verified</div>' : `
      <form id="ftk"><label>Event</label><select id="ev">${events.map((e) => `<option value="${e.id}">${esc(e.name)} — ${esc(e.venue)}</option>`).join('')}</select>
      <label>Ticket / order code</label><input id="code" required minlength="4">
      <button>Verify ticket</button></form>`}
    </div></div>
    <p><a class="btn ghost" href="#/">Browse pools →</a></p>`;
  const fpnr = app.querySelector('#fpnr');
  if (fpnr) fpnr.onsubmit = async (e) => {
    e.preventDefault();
    try {
      const r = await api('/verify/pnr', { method: 'POST', body: {
        pnr: app.querySelector('#pnr').value, last_name: app.querySelector('#ln').value,
        flight_no: app.querySelector('#fl').value } });
      App.user = r.user; localStorage.setItem('lp_user', JSON.stringify(r.user));
      VerifyView(app);
    } catch (err) { errBox(app, err); }
  };
  const ftk = app.querySelector('#ftk');
  if (ftk) ftk.onsubmit = async (e) => {
    e.preventDefault();
    try {
      const r = await api('/verify/ticket', { method: 'POST', body: {
        code: app.querySelector('#code').value, event_id: app.querySelector('#ev').value } });
      App.user = r.user; localStorage.setItem('lp_user', JSON.stringify(r.user));
      VerifyView(app);
    } catch (err) { errBox(app, err); }
  };
}

function poolCard(p) {
  const route = p.mode === 'airport'
    ? `${esc(p.airport_code)} ${esc(p.terminal || '')} → ${esc(p.destination_zone)}`
    : `${esc(p.event_name)} → ${esc(p.destination_zone)}`;
  return `<div class="card pool" data-id="${p.id}">
    <div class="route">${route}</div>
    <div class="small mut">📍 ${esc(p.meetup_point)} · 🕐 ${fmtT(p.window_start)} – ${fmtT(p.window_end)}</div>
    <div style="margin-top:8px">
      <span class="badge mode">${p.mode === 'airport' ? '✈️ airport' : '🎵 concert'}</span>
      ${p.women_only ? '<span class="badge women">women only</span>' : ''}
      <span class="badge mode">👥 ${p.member_count}/${p.max_riders}</span>
      ${p.status !== 'open' ? `<span class="badge locked">${esc(p.status)}</span>` : ''}
    </div></div>`;
}

async function DashboardView(app) {
  const { pools } = await api(`/pools?mode=${App.mode}`);
  const mine = App.user && (App.user.verified_airport || App.user.verified_concert);
  app.innerHTML = `<h1>${App.mode === 'airport' ? '✈️ Airport pools' : '🎵 Concert pools'}</h1>
    <div class="tabs">
      <button id="tA" class="${App.mode === 'airport' ? 'active' : ''}">✈️ Airport</button>
      <button id="tC" class="${App.mode === 'concert' ? 'active' : ''}">🎵 Concert</button>
    </div>
    ${mine ? '' : `<div class="card"><b>You're not verified yet.</b> <a href="#/verify">Verify your flight or ticket</a> to create or join pools.</div>`}
    <div class="row" style="margin-bottom:12px">
      <button id="create">+ Create pool</button>
      <span class="mut small">Matching spans <b>all flights</b> landing in the same window — never one flight.</span>
    </div>
    <div id="list">${pools.length ? pools.map(poolCard).join('') : '<p class="mut">No open pools in this mode yet — create one!</p>'}</div>
    <div id="cform"></div>`;
  app.querySelector('#tA').onclick = () => { App.mode = 'airport'; DashboardView(app); };
  app.querySelector('#tC').onclick = () => { App.mode = 'concert'; DashboardView(app); };
  app.querySelectorAll('.pool').forEach((el) => el.onclick = () => location.hash = '#/pool/' + el.dataset.id);
  app.querySelector('#create').onclick = () => CreatePoolForm(app.querySelector('#cform'));
}

async function CreatePoolForm(el) {
  const { events } = App.mode === 'concert' ? await api('/verify/events') : { events: [] };
  const def = (mins) => new Date(Date.now() + mins * 60000).toISOString().slice(0, 16);
  el.innerHTML = `<div class="card"><h2>New ${App.mode} pool</h2><form id="cf">
    ${App.mode === 'airport' ? `
      <label>Airport code</label><input id="ap" value="JFK" maxlength="4">
      <label>Terminal</label><input id="tm" value="T4">
      <label>Destination zone</label><input id="dz" required placeholder="Midtown Manhattan">`
    : `
      <label>Event</label><select id="ev">${events.map((e) => `<option value="${e.id}|${esc(e.name)}|${esc(e.venue)}">${esc(e.name)} — ${esc(e.venue)}</option>`).join('')}</select>
      <label>Destination zone</label><input id="dz" value="Downtown" required>
      <label>Venue pickup zone</label><input id="pz" placeholder="Gate B, 7th Ave exit">`}
    <div class="grid2">
      <div><label>Window start</label><input id="ws" type="datetime-local" value="${def(60)}" required></div>
      <div><label>Window end</label><input id="we" type="datetime-local" value="${def(120)}" required></div>
    </div>
    <label>Meetup point (required)</label><input id="mp" required placeholder="T4 arrivals hall, Pillar 4">
    <div class="grid2">
      <div><label>Max riders</label><input id="mr" type="number" value="4" min="2" max="8"></div>
      <div><label>&nbsp;</label><label><input id="wo" type="checkbox" style="width:auto"> Women-only pool</label></div>
    </div>
    <button>Create pool</button></form></div>`;
  el.querySelector('#cf').onsubmit = async (e) => {
    e.preventDefault();
    const g = (id) => el.querySelector('#' + id)?.value;
    try {
      const body = { mode: App.mode, meetup_point: g('mp'), max_riders: g('mr'),
        women_only: el.querySelector('#wo').checked,
        window_start: new Date(g('ws')).toISOString(), window_end: new Date(g('we')).toISOString() };
      if (App.mode === 'airport') Object.assign(body, { airport_code: g('ap'), terminal: g('tm'), destination_zone: g('dz') });
      else { const [event_id, event_name, venue] = g('ev').split('|');
        Object.assign(body, { event_id, event_name, venue, destination_zone: g('dz'), pickup_zone: g('pz') }); }
      const { pool } = await api('/pools', { method: 'POST', body });
      location.hash = '#/pool/' + pool.id;
    } catch (err) { errBox(el, err); }
  };
  el.scrollIntoView();
}

let currentPoolRoom = null;

async function PoolView(app, id) {
  const { pool } = await api('/pools/' + id);
  const me = App.user;
  const locked = pool.status !== 'open';
  const msgHtml = (m) => `<div class="msg ${m.sender_id === me.id ? 'mine' : ''}">
    <div class="who">${m.sender_id === me.id ? 'you' : esc(firstName(m.sender_name || 'traveler'))}</div>
    <span class="bubble">${esc(m.body)}</span><span class="time">${fmtT(m.created_at)}</span></div>`;

  app.innerHTML = `
    <p><a href="#/">← pools</a></p>
    <div class="card">
      <h1>${pool.mode === 'airport' ? `${esc(pool.airport_code)} ${esc(pool.terminal || '')} → ${esc(pool.destination_zone)}` : `${esc(pool.event_name)} → ${esc(pool.destination_zone)}`}</h1>
      <div>
        <span class="badge mode">${pool.mode === 'airport' ? '✈️ airport' : '🎵 concert'}</span>
        ${pool.women_only ? '<span class="badge women">women only</span>' : ''}
        ${locked ? `<span class="badge locked">${esc(pool.status)} — chat locked</span>` : ''}
      </div>
      <div class="kv"><span class="mut">📍 Meetup point</span><b>${esc(pool.meetup_point)}</b></div>
      <div class="kv"><span class="mut">🕐 Window</span><span>${fmtT(pool.window_start)} – ${fmtT(pool.window_end)}</span></div>
      ${pool.venue ? `<div class="kv"><span class="mut">🏟️ Venue</span><span>${esc(pool.venue)}</span></div>` : ''}
      ${pool.is_member ? '' : `<p><button id="join" ${locked ? 'disabled' : ''}>Join this pool</button></p>`}
    </div>

    <div class="card"><h2>👥 Riders (${pool.member_count}/${pool.max_riders})</h2>
      <div id="members">${pool.members.map((m) => `
        <div class="member"><span>${esc(firstName(m.name))} ${vBadge(m)} ${m.id === pool.organizer_id ? '<span class="badge mode">organizer</span>' : ''}</span>
        ${m.id === me.id ? '<span class="mut small">you</span>' : `
          <span class="row">
            <button class="ghost small" data-call="${m.id}" data-nm="${esc(m.name)}">📞 Call</button>
            <button class="ghost small" data-dm="${m.id}">💬 DM</button>
            <button class="ghost small" data-block="${m.id}">🚫</button>
            <button class="ghost small" data-report="${m.id}">⚠️</button>
          </span>`}</div>`).join('')}</div>
      ${pool.is_member ? `<h3>Invite a traveler</h3>
        <div class="row"><input id="usearch" placeholder="Search by name…" style="flex:1"><button class="ghost" id="ugo">Search</button></div>
        <div id="uresults"></div>` : ''}
    </div>

    <div class="card"><h2>💵 Fare split</h2><div id="fare"></div>
      ${pool.is_organizer ? `<div class="row"><input id="ftotal" type="number" step="0.01" min="1" placeholder="Total fare, e.g. 72.00" style="flex:1"><button id="fset">Set fare</button></div>
      <p class="mut small">Enter what the Uber/Lyft actually cost — it auto-splits across confirmed riders.</p>` : ''}
    </div>

    <div class="card"><h2>💬 Group chat ${locked ? '<span class="mut small">(locked — trip ended)</span>' : ''}</h2>
      <div class="chatbox" id="chat"></div>
      ${!locked && pool.is_member ? `<form id="chatform" class="row"><input id="chatinput" placeholder="Message the pool…" style="flex:1" maxlength="2000"><button>Send</button></form>`
        : `<p class="mut small">${pool.is_member ? '' : 'Join the pool to chat.'}</p>`}
    </div>

    <div class="card"><h2>🛡️ Safety</h2>
      <div class="row"><button class="ghost" id="sharebtn">🔗 Create trip-share link</button></div>
      <p class="mut small">Share the link with family — it shows route, meetup point and riders, but no chat or contact info.</p>
      <div id="shareout"></div>
    </div>`;

  // --- wire up ---
  if (!pool.is_member && !locked) app.querySelector('#join').onclick = async () => {
    try { await api(`/pools/${id}/join`, { method: 'POST' }); PoolView(app, id); }
    catch (e) { errBox(app, e); }
  };

  // chat
  const chat = app.querySelector('#chat');
  const render = (m) => { chat.insertAdjacentHTML('beforeend', msgHtml(m)); chat.scrollTop = chat.scrollHeight; };
  if (pool.is_member) {
    try {
      const { messages } = await api(`/pools/${id}/messages`);
      messages.forEach((m) => render({ ...m, sender_name: m.sender_name }));
    } catch {}
    RT.joinPool(pool.id); currentPoolRoom = pool.id;
  }
  const cf = app.querySelector('#chatform');
  if (cf) cf.onsubmit = (e) => {
    e.preventDefault();
    const inp = app.querySelector('#chatinput');
    if (inp.value.trim()) RT.poolMsg(pool.id, inp.value.trim());
    inp.value = '';
  };

  // members: call / dm / block / report
  app.querySelectorAll('[data-call]').forEach((b) => b.onclick = () =>
    location.hash = `#/call/${b.dataset.call}?name=${encodeURIComponent(b.dataset.nm)}`);
  app.querySelectorAll('[data-dm]').forEach((b) => b.onclick = () => location.hash = '#/dm/' + b.dataset.dm);
  app.querySelectorAll('[data-block]').forEach((b) => b.onclick = async () => {
    if (!confirm('Block this traveler? You will not see each other anymore.')) return;
    await api('/safety/block', { method: 'POST', body: { user_id: b.dataset.block } });
    PoolView(app, id);
  });
  app.querySelectorAll('[data-report]').forEach((b) => b.onclick = async () => {
    const reason = prompt('What happened? (saved for the safety team)');
    if (!reason) return;
    try { await api('/safety/report', { method: 'POST', body: { user_id: b.dataset.report, reason } });
      alert('Report saved. Thank you.'); } catch (e) { alert(e.message); }
  });

  // invite search
  const ugo = app.querySelector('#ugo');
  if (ugo) ugo.onclick = async () => {
    const q = app.querySelector('#usearch').value.trim();
    if (!q) return;
    const { users } = await api('/auth/users/search?q=' + encodeURIComponent(q));
    app.querySelector('#uresults').innerHTML = users.length ? users.map((u) => `
      <div class="invite"><b>${esc(u.name)}</b> ${vBadge(u)}
      <button class="ghost small" data-inv="${u.id}">Send invite</button></div>`).join('')
      : '<p class="mut small">No travelers found.</p>';
    app.querySelectorAll('[data-inv]').forEach((b) => b.onclick = async () => {
      try { await api('/invites', { method: 'POST', body: { pool_id: pool.id, to_user_id: b.dataset.inv } });
        b.outerHTML = '<span class="okmsg small">Invite sent ✓</span>'; }
      catch (e) { alert(e.message); }
    });
  };

  // fare
  const fareEl = app.querySelector('#fare');
  const loadFare = async () => {
    const { fare } = await api(`/pools/${id}/fare`);
    fareEl.innerHTML = fare
      ? `<div class="fare-big">$${fare.per_person.toFixed(2)} <span class="small mut">per person</span></div>
         <div class="small mut">Total $${fare.total.toFixed(2)} ÷ ${fare.rider_count} riders (${fare.riders.map(esc).join(', ')})</div>`
      : '<p class="mut">No fare set yet.</p>';
  };
  await loadFare();
  const fset = app.querySelector('#fset');
  if (fset) fset.onclick = async () => {
    try { await api(`/pools/${id}/fare`, { method: 'POST', body: { total: app.querySelector('#ftotal').value } });
      loadFare(); } catch (e) { alert(e.message); }
  };

  // trip share
  app.querySelector('#sharebtn').onclick = async () => {
    const { url } = await api(`/pools/${id}/share`, { method: 'POST' });
    const full = location.origin + url;
    app.querySelector('#shareout').innerHTML = `<div class="okmsg">Share link (view-only):<br><a href="${url}">${esc(full)}</a></div>`;
  };
}

async function InvitesView(app) {
  const { invites } = await api('/invites/inbox');
  app.innerHTML = `<h1>Invites</h1>
    ${invites.length ? invites.map((i) => `
      <div class="card"><b>${esc(i.from_name)}</b> invited you to pool #${i.pool_id}
        <div class="small mut">${i.mode === 'airport' ? '✈️' : '🎵'} → ${esc(i.destination_zone)} · 📍 ${esc(i.meetup_point)} · 🕐 ${fmtT(i.window_start)}</div>
        <div class="row" style="margin-top:8px">
          <button class="ok small" data-acc="${i.id}">Accept</button>
          <button class="ghost small" data-dec="${i.id}">Decline</button>
          <a class="btn ghost small" href="#/pool/${i.pool_id}">View pool</a>
        </div></div>`).join('')
      : '<p class="mut">No pending invites.</p>'}`;
  app.querySelectorAll('[data-acc]').forEach((b) => b.onclick = async () => {
    await api(`/invites/${b.dataset.acc}/accept`, { method: 'POST' }); InvitesView(app); });
  app.querySelectorAll('[data-dec]').forEach((b) => b.onclick = async () => {
    await api(`/invites/${b.dataset.dec}/decline`, { method: 'POST' }); InvitesView(app); });
}

async function DmListView(app) {
  const { threads } = await api('/dm');
  app.innerHTML = `<h1>Messages</h1>
    ${threads.length ? threads.map((t) => `
      <div class="card pool" data-u="${t.user.id}">
        <b>${esc(firstName(t.user.name))}</b> ${vBadge(t.user)}
        <div class="small mut">${esc(t.last_message.slice(0, 80))} · ${fmtT(t.at)}</div>
      </div>`).join('') : '<p class="mut">No conversations yet. Share a pool or accept an invite to unlock 1-on-1 chat.</p>'}`;
  app.querySelectorAll('.pool').forEach((el) => el.onclick = () => location.hash = '#/dm/' + el.dataset.u);
}

async function DmView(app, userId) {
  const { user, messages } = await api('/dm/' + userId);
  app.innerHTML = `<p><a href="#/dm">← messages</a></p>
    <div class="card"><h2>${esc(firstName(user.name))} ${vBadge(user)}</h2>
      <div class="row"><button class="ghost small" id="callbtn">📞 Voice call</button>
      <button class="ghost small" id="vidbtn">🎥 Video call</button></div>
      <p class="mut small">Masked call — no phone numbers. They see only your first name + verified badge.</p></div>
    <div class="card"><div class="chatbox" id="chat"></div>
      <form id="f" class="row"><input id="inp" style="flex:1" maxlength="2000" placeholder="Message ${esc(firstName(user.name))}…"><button>Send</button></form></div>`;
  const chat = app.querySelector('#chat');
  const render = (m) => chat.insertAdjacentHTML('beforeend',
    `<div class="msg ${m.sender_id === App.user.id ? 'mine' : ''}"><span class="bubble">${esc(m.body)}</span><span class="time">${fmtT(m.created_at)}</span></div>`);
  messages.forEach(render); chat.scrollTop = chat.scrollHeight;
  app.querySelector('#f').onsubmit = (e) => {
    e.preventDefault();
    const inp = app.querySelector('#inp');
    if (inp.value.trim()) RT.dm(Number(userId), inp.value.trim());
    inp.value = '';
  };
  app.querySelector('#callbtn').onclick = () => location.hash = `#/call/${userId}?name=${encodeURIComponent(user.name)}&video=0`;
  app.querySelector('#vidbtn').onclick = () => location.hash = `#/call/${userId}?name=${encodeURIComponent(user.name)}&video=1`;
}

async function CallView(app, userId) {
  const q = new URLSearchParams(location.hash.split('?')[1] || '');
  const peerName = q.get('name') || 'traveler';
  const video = q.get('video') === '1';
  app.innerHTML = `<div class="card" style="text-align:center">
    <h1>📞 ${esc(firstName(peerName))}</h1>
    <p class="mut">masked ${video ? 'video' : 'voice'} call — no phone numbers</p>
    <div class="videos">
      <video id="local-video" muted playsinline ${video ? '' : 'style="display:none"'}></video>
      <video id="remote-video" playsinline ${video ? '' : 'style="display:none"'}></video>
    </div>
    <p id="cstate" class="mut">requesting microphone…</p>
    <div class="row" style="justify-content:center">
      <button id="ans" class="ok hidden">Accept</button>
      <button id="rej" class="danger hidden">Decline</button>
      <button id="hang" class="danger">Hang up</button>
    </div></div>
    <p class="small mut">Demo note: media is peer-to-peer via WebRTC. If you're behind a strict NAT, production needs a TURN server.</p>`;
  const state = (s) => app.querySelector('#cstate').textContent = 'status: ' + s;
  CALL.onState = (s) => {
    state(s);
    const incoming = s === 'incoming';
    app.querySelector('#ans').classList.toggle('hidden', !incoming);
    app.querySelector('#rej').classList.toggle('hidden', !incoming);
    if (s === 'ended') location.hash = '#/dm/' + userId;
  };
  // callee auto-answers from here only via Accept button; caller starts immediately
  const isCaller = !CALL.peerId || CALL.peerId !== Number(userId);
  try {
    if (isCaller) { await CALL.start(Number(userId), peerName, video); }
  } catch (e) { state('mic/camera blocked: ' + e.message); }
  app.querySelector('#ans').onclick = async () => {
    try { await CALL.answer(CALL._pendingOffer, video); } catch (e) { state('failed: ' + e.message); }
  };
  app.querySelector('#rej').onclick = () => { CALL.hangup(); location.hash = '#/dm/' + userId; };
  app.querySelector('#hang').onclick = () => { CALL.hangup(); location.hash = '#/dm/' + userId; };
}

async function ShareView(app, token) {
  const res = await fetch('/api/safety/share/' + token);
  if (!res.ok) { app.innerHTML = '<div class="err">Share link not found.</div>'; return; }
  const { pool } = await res.json();
  app.innerHTML = `<div class="card"><h1>🚕 Live trip share <span class="small mut">(view-only)</span></h1>
    <div class="kv"><span class="mut">Route</span><b>${pool.mode === 'airport' ? `${esc(pool.airport_code)} ${esc(pool.terminal || '')} → ${esc(pool.destination_zone)}` : `${esc(pool.event_name)} → ${esc(pool.destination_zone)}`}</b></div>
    <div class="kv"><span class="mut">📍 Meetup</span><span>${esc(pool.meetup_point)}</span></div>
    <div class="kv"><span class="mut">🕐 Window</span><span>${fmtT(pool.window_start)} – ${fmtT(pool.window_end)}</span></div>
    <div class="kv"><span class="mut">Status</span><span>${esc(pool.status)}</span></div>
    <div class="kv"><span class="mut">👥 Riders</span><span>${pool.riders.map(esc).join(', ')}</span></div>
    ${pool.fare ? `<div class="kv"><span class="mut">💵 Fare</span><span>$${pool.fare.total.toFixed(2)} total · $${pool.fare.per_person.toFixed(2)}/person</span></div>` : ''}
  </div>`;
}

/* ---------------- realtime wiring ---------------- */

function wireRealtime() {
  RT.on('pool_msg', ({ pool_id, message }) => {
    const m = message;
    if (String(location.hash) === '#/pool/' + pool_id) {
      const chat = document.getElementById('chat');
      if (chat) {
        const who = m.sender_id === App.user.id ? 'you' : 'traveler';
        chat.insertAdjacentHTML('beforeend',
          `<div class="msg ${m.sender_id === App.user.id ? 'mine' : ''}"><div class="who">${esc(who)}</div><span class="bubble">${esc(m.body)}</span></div>`);
        chat.scrollTop = chat.scrollHeight;
      }
    }
  });
  RT.on('dm', ({ from, message }) => {
    const m = location.hash.match(/^#\/dm\/(\d+)/);
    if (m && Number(m[1]) === from) {
      const chat = document.getElementById('chat');
      if (chat) { chat.insertAdjacentHTML('beforeend',
        `<div class="msg"><span class="bubble">${esc(message.body)}</span></div>`); chat.scrollTop = chat.scrollHeight; }
    } else {
      showCallBanner(`💬 New message from ${esc(firstName('traveler'))}`, `#/dm/${from}`);
    }
  });
  RT.on('call', async ({ action, from, payload }) => {
    if (action === 'ring') {
      CALL._pendingOffer = null;
      showCallBanner(`📞 Incoming ${payload?.video ? 'video' : 'voice'} call from ${esc(firstName(payload?.from_name || 'traveler'))} (masked)`,
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
function showCallBanner(html, href) {
  const b = document.getElementById('call-banner');
  b.innerHTML = `${html} <a class="btn" href="${href}">Open</a> <button class="ghost" id="bclose">✕</button>`;
  b.classList.remove('hidden');
  document.getElementById('bclose').onclick = () => b.classList.add('hidden');
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => b.classList.add('hidden'), 30000);
}

/* ---------------- router ---------------- */

const routes = [
  [/^#\/login$/, LoginView],
  [/^#\/signup$/, SignupView],
  [/^#\/verify$/, VerifyView],
  [/^#\/pool\/(\d+)$/, PoolView],
  [/^#\/invites$/, InvitesView],
  [/^#\/dm$/, DmListView],
  [/^#\/dm\/(\d+)$/, DmView],
  [/^#\/call\/(\d+)/, CallView],
  [/^#\/share\/([a-f0-9]+)$/, ShareView],
  [/^#\/?$/, DashboardView],
];

async function router() {
  nav();
  const app = document.getElementById('app');
  const hash = location.hash || '#/';
  if (currentPoolRoom) { RT.leavePool(currentPoolRoom); currentPoolRoom = null; }

  // share links work logged-out
  const shareM = hash.match(/^#\/share\/([a-f0-9]+)$/);
  if (shareM) return ShareView(app, shareM[1]);

  if (!App.token && !hash.startsWith('#/login') && !hash.startsWith('#/signup')) {
    location.hash = '#/login'; return;
  }
  for (const [re, view] of routes) {
    const m = hash.match(re);
    if (m) { try { await view(app, ...m.slice(1)); } catch (e) { errBox(app, e); } return; }
  }
  app.innerHTML = '<div class="err">Page not found.</div>';
}

window.addEventListener('hashchange', router);
wireRealtime();
if (App.token) RT.connect(App.token);
router();
