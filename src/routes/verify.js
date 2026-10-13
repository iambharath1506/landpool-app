// Verification endpoints.
// ======================
// DEMO SEAM: both endpoints accept any well-formed input. Production must call
// a real source of truth:
//   * PNR  -> airline NDC API / GDS (Amadeus, Sabre, Travelport) to confirm the
//            PNR exists, matches the last name, and the flight is real.
//   * ticket -> venue/promoter ticket API (Ticketmaster, AXS) or signed QR scan.
// Never store raw PNRs longer than the verification moment; we only store a
// boolean flag on the user.

const express = require('express');
const { db, now } = require('../db');
const { requireAuth, getUserById, httpError } = require('../auth');

const router = express.Router();

const PNR_RE = /^[A-Z0-9]{6}$/i;
const FLIGHT_RE = /^[A-Z]{2}\d{1,4}[A-Z]?$/i;

router.post('/pnr', requireAuth, (req, res, next) => {
  try {
    const pnr = String(req.body.pnr || '').trim().toUpperCase();
    const last_name = String(req.body.last_name || '').trim();
    const flight_no = String(req.body.flight_no || '').trim().toUpperCase();
    if (!PNR_RE.test(pnr)) throw httpError(400, 'PNR must be 6 letters/digits (e.g. ABC123).');
    if (last_name.length < 2) throw httpError(400, 'Last name is required.');
    if (!FLIGHT_RE.test(flight_no)) throw httpError(400, 'Flight number looks wrong (e.g. AA100).');

    // DEMO: accept. Production: verify pnr+last_name+flight_no against airline API here.
    db.prepare('UPDATE users SET verified_airport = 1 WHERE id = ?').run(req.user.id);
    res.json({ verified: true, mode: 'airport', user: getUserById(req.user.id), demo: true });
  } catch (e) { next(e); }
});

router.post('/ticket', requireAuth, (req, res, next) => {
  try {
    const code = String(req.body.code || '').trim();
    const event_id = Number(req.body.event_id);
    if (code.length < 4) throw httpError(400, 'Ticket code looks too short.');
    const ev = db.prepare('SELECT * FROM events WHERE id = ?').get(event_id);
    if (!ev) throw httpError(404, 'Event not found.');

    // DEMO: accept. Production: validate the ticket code with the venue/promoter API.
    db.prepare('UPDATE users SET verified_concert = 1 WHERE id = ?').run(req.user.id);
    res.json({ verified: true, mode: 'concert', event: ev, user: getUserById(req.user.id), demo: true });
  } catch (e) { next(e); }
});

router.get('/events', (req, res) => {
  const events = db.prepare('SELECT * FROM events ORDER BY starts_at').all();
  res.json({ events });
});

module.exports = router;
