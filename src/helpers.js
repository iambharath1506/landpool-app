// Shared pool helpers used by routes and the WebSocket layer.

const { db, now } = require('./db');
const { publicUser, httpError } = require('./auth');

function getPool(id) {
  const p = db.prepare('SELECT * FROM pools WHERE id = ?').get(id);
  if (!p) throw httpError(404, 'Pool not found.');
  return p;
}

// Auto-lock pools whose trip window has passed (trip-scoped).
function refreshPoolStatus(p) {
  if (p.status === 'open' && new Date(p.ends_at) < new Date()) {
    db.prepare("UPDATE pools SET status = 'locked' WHERE id = ?").run(p.id);
    p.status = 'locked';
  }
  return p;
}

function poolMembers(poolId) {
  return db.prepare(`
    SELECT u.* FROM users u
    JOIN pool_members m ON m.user_id = u.id
    WHERE m.pool_id = ? AND m.status = 'confirmed'`).all(poolId).map(publicUser);
}

function memberCount(poolId) {
  return db.prepare(
    "SELECT COUNT(*) c FROM pool_members WHERE pool_id = ? AND status = 'confirmed'"
  ).get(poolId).c;
}

function isMember(poolId, userId) {
  return !!db.prepare(
    "SELECT 1 FROM pool_members WHERE pool_id = ? AND user_id = ? AND status = 'confirmed'"
  ).get(poolId, userId);
}

function serializePool(p, viewerId) {
  p = refreshPoolStatus({ ...p });
  const members = poolMembers(p.id);
  return {
    id: p.id,
    mode: p.mode,
    airport_code: p.airport_code,
    terminal: p.terminal,
    destination_zone: p.destination_zone,
    event_id: p.event_id,
    event_name: p.event_name,
    venue: p.venue,
    pickup_zone: p.pickup_zone,
    window_start: p.window_start,
    window_end: p.window_end,
    ends_at: p.ends_at,
    meetup_point: p.meetup_point,
    max_riders: p.max_riders,
    women_only: !!p.women_only,
    status: p.status,
    organizer_id: p.organizer_id,
    member_count: members.length,
    members,
    is_member: viewerId ? isMember(p.id, viewerId) : false,
    is_organizer: viewerId ? p.organizer_id === viewerId : false,
    created_at: p.created_at,
  };
}

// 1-on-1 chat / calls allowed when: shared pool membership OR an accepted
// invite between the two users. Blocked either way => denied.
function dmAllowed(aId, bId) {
  if (aId === bId) return false;
  const blocked = db.prepare(
    'SELECT 1 FROM blocks WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)'
  ).get(aId, bId, bId, aId);
  if (blocked) return false;
  const shared = db.prepare(`
    SELECT 1 FROM pool_members m1
    JOIN pool_members m2 ON m1.pool_id = m2.pool_id
    WHERE m1.user_id = ? AND m2.user_id = ?
      AND m1.status = 'confirmed' AND m2.status = 'confirmed'`).get(aId, bId);
  if (shared) return true;
  const invite = db.prepare(`
    SELECT 1 FROM invites
    WHERE ((from_user_id = ? AND to_user_id = ?) OR (from_user_id = ? AND to_user_id = ?))
      AND status = 'accepted'`).get(aId, bId, bId, aId);
  return !!invite;
}

const dmKey = (a, b) => [Math.min(a, b), Math.max(a, b)].join(':');

// Masked identity: only first name + verified badge — never phone/email.
function maskedName(user) {
  const first = String(user.name).split(/[\s_]+/)[0] || user.name;
  return { name: first, verified: user.verified_airport || user.verified_concert };
}

module.exports = { getPool, refreshPoolStatus, poolMembers, memberCount, isMember, serializePool, dmAllowed, dmKey, maskedName, now };
