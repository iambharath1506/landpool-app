const express = require('express');
const crypto = require('crypto');
const { db, now } = require('../db');
const { requireAuth, httpError } = require('../auth');
const { getPool, serializePool, memberCount, isMember } = require('../helpers');

const router = express.Router();

// Browse open pools. Matching spans ALL flights in the window — pools are
// keyed by (airport, window, destination), never by a single flight.
router.get('/', (req, res) => {
  const { mode, airport_code } = req.query;
  let sql = `SELECT * FROM pools WHERE status = 'open' AND datetime(ends_at) > datetime('now')`;
  const params = [];
  if (mode) { sql += ' AND mode = ?'; params.push(mode); }
  if (airport_code) { sql += ' AND airport_code = ?'; params.push(String(airport_code).toUpperCase()); }
  sql += ' ORDER BY window_start';
  const viewer = req.user?.id;
  res.json({ pools: db.prepare(sql).all(...params).map((p) => serializePool(p, viewer)) });
});

router.get('/:id', (req, res, next) => {
  try {
    res.json({ pool: serializePool(getPool(Number(req.params.id)), req.user?.id) });
  } catch (e) { next(e); }
});

// Create a pool. Airport mode needs airport verification; concert mode needs
// ticket verification (demo flags on the user).
router.post('/', requireAuth, (req, res, next) => {
  try {
    const b = req.body;
    const mode = b.mode === 'concert' ? 'concert' : 'airport';
    if (mode === 'airport' && !req.user.verified_airport)
      throw httpError(403, 'Verify your flight (PNR) first.');
    if (mode === 'concert' && !req.user.verified_concert)
      throw httpError(403, 'Verify your event ticket first.');

    const window_start = new Date(b.window_start);
    const window_end = new Date(b.window_end);
    if (isNaN(window_start) || isNaN(window_end) || window_end <= window_start)
      throw httpError(400, 'Invalid arrival window.');
    const ends_at = b.ends_at ? new Date(b.ends_at) : new Date(window_end.getTime() + 3 * 3600 * 1000);
    if (!b.meetup_point || String(b.meetup_point).trim().length < 3)
      throw httpError(400, 'A designated meetup point is required (e.g. "T4 arrivals, Pillar 4").');

    let id;
    if (mode === 'airport') {
      if (!b.destination_zone) throw httpError(400, 'destination_zone is required.');
      id = db.prepare(`
        INSERT INTO pools (mode, airport_code, terminal, destination_zone, window_start, window_end,
          ends_at, meetup_point, max_riders, women_only, organizer_id, created_at)
        VALUES ('airport',?,?,?,?,?,?,?,?,?,?,?)`).run(
          String(b.airport_code || 'JFK').toUpperCase(), b.terminal || null, b.destination_zone,
          window_start.toISOString(), window_end.toISOString(), ends_at.toISOString(),
          b.meetup_point, Math.min(Math.max(Number(b.max_riders) || 4, 2), 8),
          b.women_only ? 1 : 0, req.user.id, now()).lastInsertRowid;
    } else {
      const ev = b.event_id ? db.prepare('SELECT * FROM events WHERE id = ?').get(Number(b.event_id)) : null;
      id = db.prepare(`
        INSERT INTO pools (mode, event_id, event_name, venue, pickup_zone, destination_zone,
          window_start, window_end, ends_at, meetup_point, max_riders, women_only, organizer_id, created_at)
        VALUES ('concert',?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
          ev ? ev.id : null, b.event_name || ev?.name || 'Event', b.venue || ev?.venue || '',
          b.pickup_zone || b.meetup_point, b.destination_zone || 'Downtown',
          window_start.toISOString(), window_end.toISOString(), ends_at.toISOString(),
          b.meetup_point, Math.min(Math.max(Number(b.max_riders) || 4, 2), 8),
          b.women_only ? 1 : 0, req.user.id, now()).lastInsertRowid;
    }
    db.prepare('INSERT INTO pool_members (pool_id, user_id, status, joined_at) VALUES (?,?,?,?)')
      .run(id, req.user.id, 'confirmed', now());
    res.status(201).json({ pool: serializePool(getPool(id), req.user.id) });
  } catch (e) { next(e); }
});

router.post('/:id/join', requireAuth, (req, res, next) => {
  try {
    const pool = getPool(Number(req.params.id));
    if (pool.status !== 'open') throw httpError(400, 'This pool is no longer open.');
    if (isMember(pool.id, req.user.id)) throw httpError(400, 'Already in this pool.');
    if (memberCount(pool.id) >= pool.max_riders) throw httpError(400, 'This pool is full.');
    if (pool.women_only && req.user.gender !== 'F')
      throw httpError(403, 'This is a women-only pool.');
    if (pool.mode === 'airport' && !req.user.verified_airport)
      throw httpError(403, 'Verify your flight (PNR) first.');
    if (pool.mode === 'concert' && !req.user.verified_concert)
      throw httpError(403, 'Verify your event ticket first.');
    db.prepare('INSERT OR REPLACE INTO pool_members (pool_id, user_id, status, joined_at) VALUES (?,?,?,?)')
      .run(pool.id, req.user.id, 'confirmed', now());
    res.json({ pool: serializePool(getPool(pool.id), req.user.id) });
  } catch (e) { next(e); }
});

router.post('/:id/leave', requireAuth, (req, res, next) => {
  try {
    const pool = getPool(Number(req.params.id));
    db.prepare("UPDATE pool_members SET status = 'left' WHERE pool_id = ? AND user_id = ?")
      .run(pool.id, req.user.id);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// View-only trip-share link (safe to send to family: no chat, no contact info).
// Read side: GET /api/safety/share/:token (no auth).
router.post('/:id/share', requireAuth, (req, res, next) => {
  try {
    const pool = getPool(Number(req.params.id));
    const token = crypto.randomBytes(24).toString('hex');
    db.prepare('INSERT OR REPLACE INTO shares (token, pool_id, created_at) VALUES (?,?,?)')
      .run(token, pool.id, now());
    res.json({ token, url: `/share/${token}` });
  } catch (e) { next(e); }
});

// Pool chat history (also available live over WebSocket).
router.get('/:id/messages', requireAuth, (req, res, next) => {
  try {
    const pool = getPool(Number(req.params.id));
    if (!isMember(pool.id, req.user.id)) throw httpError(403, 'Join the pool to read its chat.');
    const msgs = db.prepare(`
      SELECT m.*, u.name AS sender_name FROM messages m
      JOIN users u ON u.id = m.sender_id
      WHERE m.pool_id = ? ORDER BY m.id DESC LIMIT 100`).all(pool.id).reverse();
    res.json({ messages: msgs });
  } catch (e) { next(e); }
});

module.exports = router;
