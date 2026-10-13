// Seed data — runs once on first boot (when the users table is empty).
// Windows are relative to "now" so the data is always fresh.
// Every pool below has a consistent member list: unique names, and the
// rider count always matches max_riders on the card.

const { db, now } = require('./db');
const { createUser } = require('./auth');

const DEMO_PASSWORD = 'demo1234';

function seed() {
  const count = db.prepare('SELECT COUNT(*) c FROM users').get().c;
  if (count > 0) return; // already seeded

  const t = (mins) => new Date(Date.now() + mins * 60000).toISOString();

  // ---- travelers ----
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

  const mkPool = (cols, vals) => db.prepare(
    `INSERT INTO pools (${cols}) VALUES (${vals.map(() => '?').join(', ')})`
  ).run(...vals).lastInsertRowid;

  const addMember = (poolId, userId) =>
    db.prepare(`INSERT OR IGNORE INTO pool_members (pool_id, user_id, status, joined_at)
      VALUES (?, ?, 'confirmed', ?)`).run(poolId, userId, now());

  const AIRPORT_COLS = 'mode, airport_code, terminal, destination_zone, window_start, window_end, ends_at, meetup_point, max_riders, women_only, organizer_id, created_at';
  const CONCERT_COLS = 'mode, event_id, event_name, venue, pickup_zone, destination_zone, window_start, window_end, ends_at, meetup_point, max_riders, women_only, organizer_id, created_at';

  // Pool 1 — JFK T4 → Midtown Manhattan: priya (organizer) + arjun = 2/4
  const p1 = mkPool(AIRPORT_COLS,
    ['airport', 'JFK', 'T4', 'Midtown Manhattan', t(60), t(120), t(300),
     'T4 arrivals hall, Pillar 4', 4, 0, ids.priya, now()]);
  addMember(p1, ids.priya);
  addMember(p1, ids.arjun);

  // Pool 2 — JFK T5 → Brooklyn, women-only: meera = 1/4
  const p2 = mkPool(AIRPORT_COLS,
    ['airport', 'JFK', 'T5', 'Brooklyn', t(90), t(150), t(330),
     'T5 arrivals curb, Zone C', 4, 1, ids.meera, now()]);
  addMember(p2, ids.meera);

  // ---- events ----
  const ev1 = db.prepare(
    'INSERT INTO events (name, venue, city, starts_at, ends_at) VALUES (?,?,?,?,?)'
  ).run('Neon Dreams Live', 'Madison Square Garden', 'New York', t(300), t(480)).lastInsertRowid;
  const ev2 = db.prepare(
    'INSERT INTO events (name, venue, city, starts_at, ends_at) VALUES (?,?,?,?,?)'
  ).run('DJ Nova @ Brooklyn Mirage', 'Brooklyn Mirage', 'Brooklyn', t(420), t(660)).lastInsertRowid;

  // Pool 3 — Neon Dreams Live → Midtown Manhattan: dev (organizer) + priya = 2/4
  const p3 = mkPool(CONCERT_COLS,
    ['concert', ev1, 'Neon Dreams Live', 'Madison Square Garden', 'Gate B, 7th Ave exit',
     'Midtown Manhattan', t(470), t(530), t(700), 'MSG Gate B, 7th Ave exit', 4, 0, ids.dev, now()]);
  addMember(p3, ids.dev);
  addMember(p3, ids.priya);

  // Pool 4 — DJ Nova → Downtown Brooklyn: meera (organizer) + dev = 2/6
  const p4 = mkPool(CONCERT_COLS,
    ['concert', ev2, 'DJ Nova @ Brooklyn Mirage', 'Brooklyn Mirage', 'Main gate, Lewis Ave',
     'Downtown Brooklyn', t(650), t(710), t(880), 'Brooklyn Mirage main gate, Lewis Ave', 6, 0, ids.meera, now()]);
  addMember(p4, ids.meera);
  addMember(p4, ids.dev);

  // Fare on pool 1: $72 across 2 riders = $36/person
  db.prepare('INSERT INTO fares (pool_id, total, updated_at) VALUES (?, ?, ?)')
    .run(p1, 72.00, now());

  // A little chat history in pool 1 so the thread feels alive
  const msg = (poolId, senderId, body, minsAgo) =>
    db.prepare('INSERT INTO messages (pool_id, sender_id, body, created_at) VALUES (?, ?, ?, ?)')
      .run(poolId, senderId, body, new Date(Date.now() - minsAgo * 60000).toISOString());
  msg(p1, ids.arjun, 'Just landed — heading to arrivals now', 12);
  msg(p1, ids.priya, "I'm at Pillar 4, black backpack", 8);

  // One pending invite so the Invites tab has something real: priya → sam (pool 1)
  db.prepare(`INSERT INTO invites (pool_id, from_user_id, to_user_id, status, created_at)
    VALUES (?, ?, ?, 'pending', ?)`).run(p1, ids.priya, ids.sam, now());

  console.log('[seed] 5 travelers, 2 events, 4 pools (2 airport + 2 concert), 1 fare, 1 invite, 2 messages');
  console.log('[seed] logins — priya / arjun / meera / dev / sam — password: demo1234');
}

module.exports = { seed };
