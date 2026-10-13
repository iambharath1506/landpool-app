// Real-time layer: WebSocket server handling
//   1. pool group chat (trip-scoped: locked after pool.ends_at)
//   2. 1-on-1 DMs (only when dmAllowed: shared pool or accepted invite, never blocked)
//   3. WebRTC signaling relay for masked voice/video calls (offer/answer/ICE/ring/end)
//
// Clients MUST send {type:'auth', token} first. Message protocol is documented
// in README.md ("WebSocket message protocol").

const { WebSocketServer } = require('ws');
const { db, now } = require('./db');
const { getUserByToken, publicUser } = require('./auth');
const { getPool, isMember, dmAllowed, dmKey } = require('./helpers');

// userId -> Set of sockets (a user may have several tabs open)
const userSockets = new Map();
// poolId -> Set of sockets currently viewing that pool
const poolRooms = new Map();

function track(map, key, ws) {
  if (!map.has(key)) map.set(key, new Set());
  map.get(key).add(ws);
}
function untrack(map, key, ws) {
  const s = map.get(key);
  if (s) { s.delete(ws); if (!s.size) map.delete(key); }
}
function send(ws, obj) {
  if (ws.readyState === 1) ws.send(JSON.stringify(obj));
}
function sendToUser(userId, obj) {
  for (const ws of userSockets.get(userId) || []) send(ws, obj);
}
function broadcastPool(poolId, obj, exceptWs) {
  for (const ws of poolRooms.get(poolId) || []) {
    if (ws !== exceptWs) send(ws, obj);
  }
}

function savePoolMessage(poolId, senderId, body) {
  return db.prepare(
    'INSERT INTO messages (pool_id, sender_id, body, created_at) VALUES (?,?,?,?)'
  ).run(poolId, senderId, body, now()).lastInsertRowid;
}
function saveDm(a, b, senderId, body) {
  return db.prepare(
    'INSERT INTO messages (dm_key, sender_id, body, created_at) VALUES (?,?,?,?)'
  ).run(dmKey(a, b), senderId, body, now()).lastInsertRowid;
}

function attachRealtime(server) {
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws) => {
    ws.userId = null;
    ws.pools = new Set();

    ws.on('message', (raw) => {
      let msg;
      try { msg = JSON.parse(raw); } catch { return send(ws, { type: 'error', message: 'Bad JSON.' }); }

      // ---- auth gate ----
      if (msg.type === 'auth') {
        const user = getUserByToken(msg.token);
        if (!user) return send(ws, { type: 'error', message: 'Invalid token.' });
        ws.userId = user.id;
        track(userSockets, user.id, ws);
        return send(ws, { type: 'authed', user: publicUser(user) });
      }
      if (!ws.userId) return send(ws, { type: 'error', message: 'Send {type:"auth", token} first.' });
      const me = ws.userId;

      try {
        switch (msg.type) {
          // ---- pool rooms ----
          case 'join': {
            const pool = getPool(Number(msg.pool_id));
            if (!isMember(pool.id, me)) throw new Error('Join the pool via the API first.');
            track(poolRooms, pool.id, ws); ws.pools.add(pool.id);
            return send(ws, { type: 'joined', pool_id: pool.id });
          }
          case 'leave': {
            untrack(poolRooms, Number(msg.pool_id), ws); ws.pools.delete(Number(msg.pool_id));
            return send(ws, { type: 'left', pool_id: Number(msg.pool_id) });
          }

          // ---- pool group chat ----
          case 'pool_msg': {
            const pool = getPool(Number(msg.pool_id));
            const body = String(msg.body || '').trim().slice(0, 2000);
            if (!body) throw new Error('Empty message.');
            if (!isMember(pool.id, me)) throw new Error('Not a member of this pool.');
            if (new Date(pool.ends_at) < new Date() || pool.status !== 'open')
              throw new Error('This trip has ended — chat is locked.');
            const id = savePoolMessage(pool.id, me, body);
            const out = { type: 'pool_msg', pool_id: pool.id,
              message: { id, sender_id: me, body, created_at: now() } };
            broadcastPool(pool.id, out);
            return;
          }

          // ---- 1-on-1 DM ----
          case 'dm': {
            const to = Number(msg.to);
            const body = String(msg.body || '').trim().slice(0, 2000);
            if (!body) throw new Error('Empty message.');
            if (!dmAllowed(me, to)) throw new Error('You can only message travelers you share a pool or accepted invite with.');
            const id = saveDm(me, to, me, body);
            const out = { type: 'dm', from: me, to,
              message: { id, sender_id: me, body, created_at: now() } };
            sendToUser(to, out);
            return send(ws, out); // echo back to sender
          }

          // ---- WebRTC signaling relay (masked calls) ----
          // The server never sees audio/video — it only forwards SDP/ICE.
          // Identity stays masked: clients display first-name + verified badge.
          case 'call': {
            const to = Number(msg.to);
            const action = msg.action; // ring | offer | answer | ice | end
            if (!['ring', 'offer', 'answer', 'ice', 'end'].includes(action))
              throw new Error('Unknown call action.');
            if (!dmAllowed(me, to)) throw new Error('Calls are only allowed with your poolmates.');
            sendToUser(to, { type: 'call', action, from: me, payload: msg.payload || null });
            return;
          }

          default:
            return send(ws, { type: 'error', message: 'Unknown message type.' });
        }
      } catch (e) {
        send(ws, { type: 'error', message: e.message });
      }
    });

    ws.on('close', () => {
      if (ws.userId) untrack(userSockets, ws.userId, ws);
      for (const pid of ws.pools) untrack(poolRooms, pid, ws);
    });
  });

  return { sendToUser, broadcastPool };
}

module.exports = { attachRealtime };
