// Landpool server entrypoint.
// One service serves everything: REST API + static SPA + WebSocket.
//   npm install && node server.js   ->  http://localhost:3000

const express = require('express');
const http = require('http');
const path = require('path');

require('./src/db');            // creates schema
const { seed } = require('./src/seed');
seed();                     // demo data on first boot only

const { attachRealtime } = require('./src/ws');

const app = express();
app.use(express.json({ limit: '1mb' }));

// Optional auth on pool browsing (lets logged-out visitors see open pools).
app.use((req, res, next) => {
  const h = req.headers.authorization || '';
  if (h.startsWith('Bearer ')) {
    const { getUserByToken } = require('./src/auth');
    req.user = getUserByToken(h.slice(7)) || undefined;
  }
  next();
});

app.use('/api/auth', require('./src/routes/auth'));
app.use('/api/verify', require('./src/routes/verify'));
app.use('/api/pools', require('./src/routes/pools'));
app.use('/api/invites', require('./src/routes/invites'));
app.use('/api/dm', require('./src/routes/dm'));
app.use('/api', require('./src/routes/fare'));    // /api/pools/:id/fare
app.use('/api/safety', require('./src/routes/safety'));

app.get('/api/health', (req, res) => res.json({ ok: true, app: 'landpool', time: new Date().toISOString() }));

// Static SPA
app.use(express.static(path.join(__dirname, 'public')));
// Human-friendly share links redirect into the SPA's #/share/:token route.
app.get('/share/:token', (req, res) => res.redirect('/#/share/' + req.params.token));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/ws')) return next();
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// JSON error handler
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const status = err.status || 500;
  res.status(status).json({ error: err.message || 'Server error.' });
});

const server = http.createServer(app);
attachRealtime(server);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`[landpool] listening on http://localhost:${PORT}`);
});
