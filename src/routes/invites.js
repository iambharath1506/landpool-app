const express = require('express');
const { db, now } = require('../db');
const { requireAuth, getUserById, publicUser, httpError } = require('../auth');
const { getPool, isMember, memberCount } = require('../helpers');

const router = express.Router();

// Invite a traveler to your pool. The invitee accepts -> becomes a member,
// which also unlocks 1-on-1 chat with the inviter.
router.post('/', requireAuth, (req, res, next) => {
  try {
    const pool = getPool(Number(req.body.pool_id));
    if (!isMember(pool.id, req.user.id)) throw httpError(403, 'Only pool members can invite.');
    const toUser = getUserById(Number(req.body.to_user_id));
    if (!toUser) throw httpError(404, 'Traveler not found.');
    if (toUser.id === req.user.id) throw httpError(400, "You can't invite yourself.");
    if (isMember(pool.id, toUser.id)) throw httpError(400, 'They are already in this pool.');
    const dup = db.prepare(
      "SELECT 1 FROM invites WHERE pool_id = ? AND to_user_id = ? AND status = 'pending'"
    ).get(pool.id, toUser.id);
    if (dup) throw httpError(400, 'Invite already pending.');
    const id = db.prepare(
      'INSERT INTO invites (pool_id, from_user_id, to_user_id, status, created_at) VALUES (?,?,?,?,?)'
    ).run(pool.id, req.user.id, toUser.id, 'pending', now()).lastInsertRowid;
    res.status(201).json({ invite: { id, pool_id: pool.id, to: publicUser(toUser), status: 'pending' } });
  } catch (e) { next(e); }
});

router.get('/inbox', requireAuth, (req, res) => {
  const rows = db.prepare(`
    SELECT i.*, p.mode, p.destination_zone, p.meetup_point, p.window_start, p.window_end,
           u.name AS from_name
    FROM invites i
    JOIN pools p ON p.id = i.pool_id
    JOIN users u ON u.id = i.from_user_id
    WHERE i.to_user_id = ? AND i.status = 'pending' ORDER BY i.id DESC`).all(req.user.id);
  res.json({ invites: rows });
});

function decide(req, res, next, status) {
  try {
    const inv = db.prepare('SELECT * FROM invites WHERE id = ?').get(Number(req.params.id));
    if (!inv || inv.to_user_id !== req.user.id) throw httpError(404, 'Invite not found.');
    if (inv.status !== 'pending') throw httpError(400, 'Invite already decided.');
    db.prepare('UPDATE invites SET status = ? WHERE id = ?').run(status, inv.id);
    if (status === 'accepted') {
      const pool = getPool(inv.pool_id);
      if (pool.status === 'open' && memberCount(pool.id) < pool.max_riders &&
          !(pool.women_only && req.user.gender !== 'F')) {
        db.prepare('INSERT OR REPLACE INTO pool_members (pool_id, user_id, status, joined_at) VALUES (?,?,?,?)')
          .run(pool.id, req.user.id, 'confirmed', now());
      }
    }
    res.json({ ok: true, status });
  } catch (e) { next(e); }
}

router.post('/:id/accept', requireAuth, (req, res, next) => decide(req, res, next, 'accepted'));
router.post('/:id/decline', requireAuth, (req, res, next) => decide(req, res, next, 'declined'));

module.exports = router;
