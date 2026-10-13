# Landpool 🛬🤝 — the real working app

**Split the airport ride with people on your flight. Or the concert ride with fellow fans.**

Landpool is a functional prototype of a PNR-verified ride-pooling platform.
Travelers verify their flight (or concert ticket), get matched into pools with
people arriving in the **same time window** (across *all* flights — never one
flight), coordinate in a privacy-first group chat, meet at one designated
point, and split one Uber/Lyft fare. **No drivers in the loop** — the platform
arranges the people; the group books the ride together.

> ⚠️ **Prototype, not production.** Demo-grade auth, demo verification
> (any well-formed PNR/ticket is accepted), no payments, no real airline data.
> Every integration seam is marked `DEMO SEAM` in the code. See
> [Roadmap to production](#-roadmap-to-production).

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/iambharath1506/landpool-app)

---

## ✨ What actually works

| Feature | Status |
|---|---|
| Signup / login (token sessions) | ✅ working |
| PNR + flight verification → verified badge | ✅ working (demo: any well-formed PNR) |
| Concert ticket verification | ✅ working (demo: any code) |
| Pool browse / create (airport + concert modes) | ✅ working |
| Arrival-window matching across all flights | ✅ working |
| Join / leave pools, women-only enforcement | ✅ working |
| Invites: send → inbox → accept / decline | ✅ working |
| Group chat, real-time (WebSocket) | ✅ working, tested |
| 1-on-1 chat, real-time (poolmates / accepted invites only) | ✅ working, tested |
| Masked voice/video calls (real WebRTC P2P, no phone numbers) | ✅ working (signaling tested; needs TURN for strict NATs) |
| Trip-scoped chat (locks after `ends_at`) | ✅ working, tested |
| Meetup point per pool | ✅ working |
| Fare split (organizer sets total → auto per-person) | ✅ working, tested |
| Block user, report (persisted), women-only pools | ✅ working, tested |
| View-only trip-share link (no auth, no chat) | ✅ working, tested |

## 🗂️ Project structure

```
landpool-app/
├── server.js              # entrypoint: Express + static SPA + WebSocket
├── render.yaml            # Render Blueprint (free deploy)
├── package.json           # npm start -> node server.js
├── src/
│   ├── db.js              # SQLite schema (better-sqlite3)
│   ├── auth.js            # demo-grade auth: scrypt + token sessions
│   ├── helpers.js         # pool serialization, dmAllowed, masked identity
│   ├── seed.js            # demo data (JFK flights, concerts, travelers, pools)
│   ├── ws.js              # WebSocket: pool chat, DMs, WebRTC signaling relay
│   └── routes/
│       ├── auth.js        # signup, login, me, user search
│       ├── verify.js      # PNR + ticket verification (DEMO SEAM)
│       ├── pools.js       # browse/create/join/leave/messages/share
│       ├── invites.js     # invite inbox, accept/decline
│       ├── dm.js          # 1-on-1 conversation list + history
│       ├── fare.js        # fare split (DEMO SEAM: manual total)
│       └── safety.js      # block, report, trip-share read
└── public/
    ├── index.html         # SPA shell
    ├── css/styles.css
    └── js/
        ├── app.js         # hash router + all views
        ├── realtime.js    # WebSocket client
        └── call.js        # WebRTC masked-call manager (DEMO SEAM: STUN only)
```

## 🏗️ Architecture

```
                    ┌─────────────────────────────┐
                    │        Browser (SPA)        │
                    │  vanilla JS, no build step  │
                    └──────┬──────────────┬───────┘
                           │ REST         │ WebSocket /ws
                           ▼              ▼
┌──────────────────────────────────────────────────────────┐
│                    Node.js + Express                     │
│  /api/* routes ──► src/routes/* ──► better-sqlite3        │
│  /ws ──► src/ws.js: rooms, chat persist, signal relay    │
│  /* ──► public/ static SPA                               │
└──────────────────────────┬───────────────────────────────┘
                           ▼
                 data/landpool.db (SQLite)
```

One service = one free deploy, no CORS pain. WebRTC media is peer-to-peer;
the server only relays signaling.

## 🚀 Run locally

```bash
npm install
npm start        # -> http://localhost:3000
```

First boot seeds demo data automatically (only when the DB is empty).

### Demo logins (password for all: `demo1234`)

| user | gender | verified | in pools |
|---|---|---|---|
| `priya` | F | ✈️🎵 | JFK→Midtown (#1, organizer), MSG concert (#3) |
| `arjun` | M | ✈️ | JFK→Midtown (#1) |
| `meera` | F | ✈️🎵 | JFK→Brooklyn women-only (#2, organizer) |
| `dev`   | M | 🎵 | MSG concert (#3, organizer) |
| `sam`   | X | ✈️ | — (great for testing invites) |

Try it: log in as `priya` → open pool #1 → chat in real time (open a second
browser as `arjun` to see it live) → set a fare → create a trip-share link.

## 🌍 Deploy free (Render)

1. Click **Deploy to Render** above (or: New → Blueprint → paste this repo URL).
2. Render reads `render.yaml`, builds with `npm install`, starts with `npm start`.
3. Free URL: `https://landpool-app.onrender.com`.

> **Data note:** Render's free tier has no persistent disk — the SQLite file
> resets on redeploy/restart. Fine for demos; for a pilot, attach a Render Disk
> or migrate to Postgres (see roadmap).

## 🔌 API reference

Auth: `Authorization: Bearer <token>` (from signup/login).

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/auth/signup` | `{name, password, gender?}` → `{token, user}` |
| POST | `/api/auth/login` | `{name, password}` → `{token, user}` |
| GET | `/api/auth/me` | current user |
| GET | `/api/auth/users/search?q=` | find travelers to invite |
| POST | `/api/verify/pnr` | `{pnr, last_name, flight_no}` → verified badge (demo) |
| POST | `/api/verify/ticket` | `{code, event_id}` → verified badge (demo) |
| GET | `/api/verify/events` | list demo concerts |
| GET | `/api/pools?mode=airport\|concert&airport_code=` | browse open pools |
| GET | `/api/pools/:id` | pool detail + members |
| POST | `/api/pools` | create pool (mode-specific fields, meetup required) |
| POST | `/api/pools/:id/join` | join (women-only + verification enforced) |
| POST | `/api/pools/:id/leave` | leave |
| GET | `/api/pools/:id/messages` | pool chat history (members only) |
| POST | `/api/pools/:id/share` | create view-only trip-share link |
| POST | `/api/invites` | `{pool_id, to_user_id}` invite a traveler |
| GET | `/api/invites/inbox` | my pending invites |
| POST | `/api/invites/:id/accept` | accept → join pool, unlock DM |
| POST | `/api/invites/:id/decline` | decline |
| GET | `/api/dm` | my 1-on-1 threads |
| GET | `/api/dm/:userId` | thread history |
| GET | `/api/pools/:id/fare` | current split |
| POST | `/api/pools/:id/fare` | organizer sets `{total}` → per-person math |
| POST | `/api/safety/block` | `{user_id}` |
| POST | `/api/safety/report` | `{user_id, reason}` persisted |
| GET | `/api/safety/share/:token` | view-only trip JSON (no auth) |
| GET | `/share/:token` | redirects to SPA share view |

## 📡 WebSocket message protocol

Connect to `/ws`, then **must** send first:

```json
{ "type": "auth", "token": "<bearer token>" }   → { "type": "authed", "user": {...} }
```

| Client → server | Server → client |
|---|---|
| `{type:"join", pool_id}` | `{type:"joined", pool_id}` |
| `{type:"leave", pool_id}` | `{type:"left", pool_id}` |
| `{type:"pool_msg", pool_id, body}` | `{type:"pool_msg", pool_id, message}` broadcast to room |
| `{type:"dm", to, body}` | `{type:"dm", from, to, message}` to recipient (+echo) |
| `{type:"call", to, action, payload}` | `{type:"call", action, from, payload}` relayed |
| | `{type:"error", message}` |

Call `action`s: `ring` → `offer` → `answer` → `ice` (many) → `end`.
Server rules: pool chat requires membership and rejects after `ends_at`
("This trip has ended — chat is locked."); DMs/calls require shared pool or
accepted invite and are denied if either side blocked the other.

## 🗺️ Roadmap to production

Every stub is marked `DEMO SEAM` in code. To go live:

1. **Real verification** — PNR via airline NDC API / GDS (Amadeus, Sabre);
   tickets via promoter API or signed QR. Never store raw PNRs.
2. **Real auth** — bcrypt/argon2, email + OTP, refresh/access rotation,
   login rate-limiting, HTTPS-only cookies.
3. **Real-time flights** — flight-status API (FlightAware, AviationStack) to
   auto-adjust arrival windows on delays.
4. **TURN server** — coturn / Twilio / Cloudflare for WebRTC behind symmetric
   NATs; push notifications for incoming calls.
5. **Live fare quotes** — Uber/Lyft price APIs instead of manual total;
   in-app payments (Stripe) for the split.
6. **Database** — Postgres (Supabase/Neon free tier) instead of SQLite file.
7. **Moderation** — review queue for `reports`, automated abuse detection.
8. **Legal** — terms, privacy policy, and immigration counsel before monetizing
   (founders on student visas: talk to an attorney first).

## 📄 License

MIT — see [LICENSE](LICENSE).
