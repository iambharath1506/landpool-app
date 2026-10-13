// 1-on-1 conversations: list threads and read history.
// Sending happens over WebSocket ({type:'dm'}); history is REST.

const express = require('express');
const { db } = require('../db');
const { requireAuth, getUserById, httpError } = require('../auth');
const { dmAllowed, dmKey } = require('../helpers');

const router = express.Router();

router.get('/', requireAuth, (req, res) => {
  const keys = db.prepare('SELECT DISTINCT dm_key FROM messages WHERE dm_key IS NOT NULL').all();
  const threads = [];
  for (const { dm_key } of keys) {
    const [a, b] = dm_key.split(':').map(Number);
    if (a !== req.user.id && b !== req.user.id) continue;
    const otherId = a === req.user.id ? b : a;
    const last = db.prepare(
      'SELECT * FROM messages WHERE dm_key = ? ORDER BY id DESC LIMIT 1').get(dm_key);
    const other = getUserById(otherId);
    if (other) threads.push({ user: other, last_message: last.body, at: last.created_at });
  }
  threads.sort((x, y) => (x.at < y.at ? 1 : -1));
  res.json({ threads });
});

router.get('/:userId', requireAuth, (req, res, next) => {
  try {
    const other = getUserById(Number(req.params.userId));
    if (!other) throw httpError(404, 'User not found.');
    if (!dmAllowed(req.user.id, other.id))
      throw httpError(403, 'You can only message travelers you share a pool or accepted invite with.');
    const msgs = db.prepare(
      'SELECT * FROM messages WHERE dm_key = ? ORDER BY id ASC LIMIT 200'
    ).all(dmKey(req.user.id, other.id));
    res.json({ user: other, messages: msgs });
  } catch (e) { next(e); }
});

module.exports = router;
