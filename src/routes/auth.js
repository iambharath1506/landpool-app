const express = require('express');
const { createUser, verifyUser, createSession, requireAuth } = require('../auth');

const router = express.Router();

router.post('/signup', (req, res, next) => {
  try {
    const { name, password, gender } = req.body;
    const user = createUser(name, password, gender);
    const token = createSession(user.id);
    res.json({ token, user });
  } catch (e) { next(e); }
});

router.post('/login', (req, res, next) => {
  try {
    const { name, password } = req.body;
    const user = verifyUser(name, password);
    const token = createSession(user.id);
    res.json({ token, user });
  } catch (e) { next(e); }
});

router.get('/me', requireAuth, (req, res) => res.json({ user: req.user }));

// Simple user search (for inviting travelers). Only id + name exposed.
router.get('/users/search', requireAuth, (req, res) => {
  const q = '%' + String(req.query.q || '').trim().toLowerCase() + '%';
  const { db } = require('../db');
  const { publicUser } = require('../auth');
  const rows = db.prepare(
    'SELECT * FROM users WHERE lower(name) LIKE ? AND id != ? LIMIT 10'
  ).all(q, req.user.id).map(publicUser);
  res.json({ users: rows });
});

module.exports = router;
