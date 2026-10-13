// Seed data — runs once on first boot (when the users table is empty).
// All demo content is clearly labeled. Windows are relative to "now" so the
// demo always works, whenever you start the server.
//
// DEMO LOGINS (password for all: demo1234):
//   priya / arjun / meera / dev / sam

const { db, now } = require('./db');
const { createUser, createSession } = require('./auth');

const DEMO_PASSWORD = 'demo1234';

function seed() {
  const count = db.prepare('SELECT COUNT(*) c FROM users').get().c;
  if (count > 0) return; // already seeded

  const t = (mins) => new Date(Date.now() + mins * 60000).toISOString();
  const iso = (d) => new Date(d).toISOString();

  // ---- demo travelers ----
  const travelers = [
    { name: 'priya', gender: 'F', airport: 1, concert: 1 },
    { name: 'arjun', gender: 'M', airport: 1, concert: 0 },
    { name: 'meera', gender: 'F', airport: 1, concert: 1 },
    { name: 'dev',   gender: 'M', airport: 0, concert: 1 },
    { name: 'sam',   gender: 'X', airport: 1, concert: 0 },
  ];
  const ids = {};
  for (const tr of travelers) {
    const u = createUser(tr.name, DEMO_PASSWORD, tr.gender);
    db.prepare('UPDATE users SET verified_airport = ?, verified_concert = ? WHERE id = ?')
      .run(tr.airport ? 1 : 0, tr.concert ? 1 : 0, u.id);
    ids[tr.name] = u.id;
  }

  // ---- demo flights landing in OVERLAPPING windows (matching spans all of them) ----
  // (flight_no, origin, terminal, lands_in_minutes)
  const flights = [
    ['AA100', 'London',     'T8',  70],
    ['DL205', 'Atlanta',    'T4',  85],
    ['UA88',  'Chicago',    'T7',  95],
    ['B6120', 'Los Angeles','T5', 110],
  ];
  // Flights are informational context for the demo; pools key on the window, not the flight.

  // ---- airport pools ----
  const mkPool = (p) => db.prepare(`
    INSERT INTO pools (mode, airport_code, terminal, destination_zone, window_start, window_end,
      ends_at, meetup_point, max_riders, women_only, organizer_id, created_at)
    VALUES ('airport',?,?,?,?,?,?,?,?,?,?,?)`).run(
      p.airport_code, p.terminal, p.destination_zone, p.window_start, p.window_end,
      p.ends_at, p.meetup_point, p.max_riders, p.women_only ? 1 : 0, p.organizer_id, now()
    ).lastInsertRowid;

  const addMember = (poolId, userId) =>
    db.prepare('INSERT OR IGNORE INTO pool_members (pool_id, user_id, status, joined_at) VALUES (?,?,?,?)')
      .run(poolId, userId, 'confirmed', now());

  // Pool 1: JFK → Midtown Manhattan, window covers AA100 + DL205 + UA88 landings
  const pool1 = mkPool({
    airport_code: 'JFK', terminal: 'T4', destination_zone: 'Midtown Manhattan',
    window_start: t(60), window_end: t(120), ends_at: t(300),
    meetup_point: 'T4 arrivals hall, Pillar 4', max_riders: 4,
    women_only: 0, organizer_id: ids.priya,
  });
  addMember(pool1, ids.priya); addMember(pool1, ids.arjun);

  // Pool 2: JFK → Brooklyn, overlapping window, women-only
  const pool2 = mkPool({
    airport_code: 'JFK', terminal: 'T5', destination_zone: 'Brooklyn',
    window_start: t(90), window_end: t(150), ends_at: t(330),
    meetup_point: 'T5 arrivals curb, Zone C', max_riders: 4,
    women_only: 1, organizer_id: ids.meera,
  });
  addMember(pool2, ids.meera);

  // ---- demo concerts ----
  const ev1 = db.prepare(
    'INSERT INTO events (name, venue, city, starts_at, ends_at) VALUES (?,?,?,?,?)'
  ).run('Neon Dreams Live', 'Madison Square Garden', 'New York', t(300), t(480)).lastInsertRowid;
  const ev2 = db.prepare(
    'INSERT INTO events (name, venue, city, starts_at, ends_at) VALUES (?,?,?,?,?)'
  ).run('DJ Nova @ Brooklyn Mirage', 'Brooklyn Mirage', 'Brooklyn', t(420), t(660)).lastInsertRowid;

  const mkConcertPool = (p) => db.prepare(`
    INSERT INTO pools (mode, event_id, event_name, venue, pickup_zone, destination_zone,
      window_start, window_end, ends_at, meetup_point, max_riders, women_only, organizer_id, created_at)
    VALUES ('concert',?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      p.event_id, p.event_name, p.venue, p.pickup_zone, p.destination_zone,
      p.window_start, p.window_end, p.ends_at, p.meetup_point, p.max_riders,
      p.women_only ? 1 : 0, p.organizer_id, now()
    ).lastInsertRowid;

  // Pool 3: MSG concert → Midtown, end-time window
  const pool3 = mkConcertPool({
    event_id: ev1, event_name: 'Neon Dreams Live', venue: 'Madison Square Garden',
    pickup_zone: 'Gate B, 7th Ave exit', destination_zone: 'Midtown Manhattan',
    window_start: t(470), window_end: t(530), ends_at: t(700),
    meetup_point: 'MSG Gate B, 7th Ave exit', max_riders: 4,
    women_only: 0, organizer_id: ids.dev,
  });
  addMember(pool3, ids.dev); addMember(pool3, ids.priya);

  console.log('[seed] demo data created: 5 travelers, 2 flights-worth of windows, 3 pools, 2 concerts');
  console.log('[seed] demo logins — priya / arjun / meera / dev / sam — password: demo1234');
  return { flights };
}

module.exports = { seed };
