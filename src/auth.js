// Demo-grade auth.
// ----------------
// Passwords are hashed with scrypt (built-in, decent) + per-user salt.
// DEMO SEAMS — do NOT ship to production as-is:
//   * no email verification, no rate limiting, no password reset
//   * sessions are opaque tokens in SQLite (fine for prototype)
//   * production: bcrypt/argon2, email+OTP, refresh/access token rotation,
//     rate-limit login attempts, HTTPS-only secure cookies.

const crypto = require('crypto');
const { db, now } = require('./db');

const SESSION_DAYS = 7;

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

function createUser(name, password, gender) {
  const clean = String(name || '').trim();
  if (clean.length < 2 || clean.length > 40) throw httpError(400, 'Name must be 2–40 characters.');
  if (String(password || '').length < 6) throw httpError(400, 'Password must be at least 6 characters.');
  const salt = crypto.randomBytes(16).toString('hex');
  const password_hash = hashPassword(password, salt);
  try {
    const r = db.prepare(
      'INSERT INTO users (name, password_hash, salt, gender, created_at) VALUES (?,?,?,?,?)'
    ).run(clean, password_hash, salt, gender || null, now());
    return getUserById(r.lastInsertRowid);
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) throw httpError(409, 'That name is taken.');
    throw e;
  }
}

function verifyUser(name, password) {
  const u = db.prepare('SELECT * FROM users WHERE lower(name) = lower(?)').get(String(name || '').trim());
  if (!u) throw httpError(401, 'Invalid name or password.');
  if (hashPassword(password, u.salt) !== u.password_hash) throw httpError(401, 'Invalid name or password.');
  return publicUser(u);
}

function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex'); // 64 hex chars
  const created = new Date();
  const expires = new Date(created.getTime() + SESSION_DAYS * 24 * 3600 * 1000);
  db.prepare('INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?,?,?,?)')
    .run(token, userId, created.toISOString(), expires.toISOString());
  return token;
}

function getUserById(id) {
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  return u ? publicUser(u) : null;
}

// Never leak hashes/salts to clients.
function publicUser(u) {
  if (!u) return null;
  return {
    id: u.id,
    name: u.name,
    gender: u.gender,
    verified_airport: !!u.verified_airport,
    verified_concert: !!u.verified_concert,
    created_at: u.created_at,
  };
}

function getUserByToken(token) {
  if (!token) return null;
  const s = db.prepare('SELECT * FROM sessions WHERE token = ?').get(token);
  if (!s || new Date(s.expires_at) < new Date()) return null;
  return getUserById(s.user_id);
}

// Express middleware: attaches req.user or 401s.
function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  const user = getUserByToken(token);
  if (!user) return res.status(401).json({ error: 'Not authenticated. Send Authorization: Bearer <token>.' });
  req.user = user;
  req.token = token;
  next();
}

function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

module.exports = { createUser, verifyUser, createSession, getUserById, getUserByToken, publicUser, requireAuth, httpError };
