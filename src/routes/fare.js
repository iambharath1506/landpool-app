// Fare splitting. The organizer enters the TOTAL fare (e.g. what the Uber/Lyft
// cost); it auto-splits across confirmed riders. Production seam: replace the
// manual total with a live quote from the Uber/Lyft price API.

const express = require('express');
const { db, now } = require('../db');
const { requireAuth, httpError } = require('../auth');
const { getPool, poolMembers } = require('../helpers');

const router = express.Router();

router.get('/pools/:id/fare', requireAuth, (req, res, next) => {
  try {
    const pool = getPool(Number(req.params.id));
    const fare = db.prepare('SELECT * FROM fares WHERE pool_id = ?').get(pool.id);
    const riders = poolMembers(pool.id);
    const per_person = fare && riders.length ? +(fare.total / riders.length).toFixed(2) : null;
    res.json({
      fare: fare ? { total: fare.total, per_person, rider_count: riders.length,
                     riders: riders.map((r) => r.name) } : null,
    });
  } catch (e) { next(e); }
});

router.post('/pools/:id/fare', requireAuth, (req, res, next) => {
  try {
    const pool = getPool(Number(req.params.id));
    if (pool.organizer_id !== req.user.id) throw httpError(403, 'Only the organizer sets the fare.');
    const total = Number(req.body.total);
    if (!total || total <= 0 || total > 10000) throw httpError(400, 'Enter a valid total fare.');
    db.prepare('INSERT OR REPLACE INTO fares (pool_id, total, updated_at) VALUES (?,?,?)')
      .run(pool.id, +total.toFixed(2), now());
    const riders = poolMembers(pool.id);
    res.json({ total: +total.toFixed(2), per_person: +(total / riders.length).toFixed(2),
               rider_count: riders.length });
  } catch (e) { next(e); }
});

module.exports = router;
