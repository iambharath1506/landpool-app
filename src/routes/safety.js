// Safety: block users, file reports (persisted for moderators), and create
// view-only trip-share links (safe to send to family: no chat, no identities
// beyond first names, no auth required).

const express = require('express');
const { db, now } = require('../db');
const { requireAuth, getUserById, httpError } = require('../auth');
const { getPool, serializePool } = require('../helpers');

const router = express.Router();

router.post('/block', requireAuth, (req, res, next) => {
  try {
    const target = getUserById(Number(req.body.user_id));
    if (!target) throw httpError(404, 'User not found.');
    if (target.id === req.user.id) throw httpError(400, "You can't block yourself.");
    db.prepare('INSERT OR IGNORE INTO blocks (blocker_id, blocked_id, created_at) VALUES (?,?,?)')
      .run(req.user.id, target.id, now());
    res.json({ ok: true, blocked: target.name });
  } catch (e) { next(e); }
});

router.post('/report', requireAuth, (req, res, next) => {
  try {
    const target = getUserById(Number(req.body.user_id));
    if (!target) throw httpError(404, 'User not found.');
    const reason = String(req.body.reason || '').trim();
    if (reason.length < 5) throw httpError(400, 'Please describe what happened (min 5 chars).');
    db.prepare('INSERT INTO reports (reporter_id, target_id, reason, created_at) VALUES (?,?,?,?)')
      .run(req.user.id, target.id, reason.slice(0, 500), now());
    res.json({ ok: true, message: 'Report saved. Our safety team reviews every report.' });
  } catch (e) { next(e); }
});

// NOTE: share-link creation lives on the pools router as POST /api/pools/:id/share.

router.get('/share/:token', (req, res, next) => {
  try {
    const s = db.prepare('SELECT * FROM shares WHERE token = ?').get(req.params.token);
    if (!s) throw httpError(404, 'Share link not found or expired.');
    const pool = serializePool(getPool(s.pool_id), null);
    const fare = db.prepare('SELECT * FROM fares WHERE pool_id = ?').get(pool.id);
    res.json({
      pool: {
        mode: pool.mode, destination_zone: pool.destination_zone,
        airport_code: pool.airport_code, terminal: pool.terminal,
        event_name: pool.event_name, venue: pool.venue,
        meetup_point: pool.meetup_point, window_start: pool.window_start,
        window_end: pool.window_end, status: pool.status,
        riders: pool.members.map((m) => String(m.name).split(/[\s_]+/)[0]),
        fare: fare ? { total: fare.total,
          per_person: +(fare.total / Math.max(pool.member_count, 1)).toFixed(2) } : null,
      },
    });
  } catch (e) { next(e); }
});

module.exports = router;
