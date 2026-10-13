// Landpool database layer — SQLite via better-sqlite3.
// One file DB at data/landpool.db. Synchronous API keeps the code readable;
// fine for a prototype (production would use Postgres + a connection pool).

const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'landpool.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  gender TEXT,                       -- 'F' | 'M' | 'X' | NULL (used for women-only pools)
  verified_airport INTEGER DEFAULT 0, -- PNR / boarding-pass verified (demo: any well-formed PNR)
  verified_concert INTEGER DEFAULT 0, -- event-ticket verified (demo: any code)
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  venue TEXT NOT NULL,
  city TEXT,
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS pools (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mode TEXT NOT NULL CHECK (mode IN ('airport','concert')),
  -- airport mode fields
  airport_code TEXT,                 -- e.g. JFK
  terminal TEXT,                     -- e.g. T4
  destination_zone TEXT,             -- e.g. "Midtown Manhattan"
  -- concert mode fields
  event_id INTEGER REFERENCES events(id),
  event_name TEXT,
  venue TEXT,
  pickup_zone TEXT,                  -- venue pickup point, e.g. "Gate B, 7th Ave exit"
  -- shared fields
  window_start TEXT NOT NULL,        -- arrival / event-end window start (ISO)
  window_end TEXT NOT NULL,          -- arrival / event-end window end (ISO)
  ends_at TEXT NOT NULL,             -- pool closes; chat locks after this (trip-scoped)
  meetup_point TEXT NOT NULL,        -- designated meet point, e.g. "T4 arrivals, Pillar 4"
  max_riders INTEGER DEFAULT 4,
  women_only INTEGER DEFAULT 0,
  status TEXT DEFAULT 'open' CHECK (status IN ('open','locked','closed')),
  organizer_id INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS pool_members (
  pool_id INTEGER NOT NULL REFERENCES pools(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'confirmed' CHECK (status IN ('confirmed','left')),
  joined_at TEXT NOT NULL,
  PRIMARY KEY (pool_id, user_id)
);

CREATE TABLE IF NOT EXISTS invites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pool_id INTEGER NOT NULL REFERENCES pools(id) ON DELETE CASCADE,
  from_user_id INTEGER NOT NULL REFERENCES users(id),
  to_user_id INTEGER NOT NULL REFERENCES users(id),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined')),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pool_id INTEGER REFERENCES pools(id) ON DELETE CASCADE,  -- group chat
  dm_key TEXT,                                             -- 1-on-1 chat: "smallerId:largerId"
  sender_id INTEGER NOT NULL REFERENCES users(id),
  body TEXT NOT NULL,
  created_at TEXT NOT NULL,
  CHECK (pool_id IS NOT NULL OR dm_key IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_msg_pool ON messages(pool_id, id);
CREATE INDEX IF NOT EXISTS idx_msg_dm ON messages(dm_key, id);

CREATE TABLE IF NOT EXISTS fares (
  pool_id INTEGER PRIMARY KEY REFERENCES pools(id) ON DELETE CASCADE,
  total REAL NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS blocks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  blocker_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  UNIQUE (blocker_id, blocked_id)
);

CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reporter_id INTEGER NOT NULL REFERENCES users(id),
  target_id INTEGER NOT NULL REFERENCES users(id),
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS shares (
  token TEXT PRIMARY KEY,            -- unguessable trip-share link token
  pool_id INTEGER NOT NULL REFERENCES pools(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL
);
`);

const now = () => new Date().toISOString();

module.exports = { db, now };
