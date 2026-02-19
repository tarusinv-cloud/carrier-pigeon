# 🐦 Carrier Pigeon

A lightweight, installable messenger PWA built with vanilla JS, Express, Socket.io, and SQLite.

## Features

- 📧 Email registration & login (JWT auth)
- 💬 Real-time personal messages (WebSocket)
- 👥 Group chats (create, invite members, chat)
- 📱 PWA — installable on phone and desktop
- 🌙 Modern dark theme, mobile-responsive
- 🟢 Online status & typing indicators
- 🔍 User search to start new conversations

## Quick Start

```bash
cd server
cp .env.example .env
# Edit .env and set a strong JWT_SECRET
npm install
npm start
```

Open `http://localhost:3000` in your browser.

## Tech Stack

| Layer    | Tech                    |
|----------|-------------------------|
| Backend  | Node.js + Express       |
| Realtime | Socket.io               |
| Database | SQLite (better-sqlite3) |
| Auth     | JWT + bcryptjs          |
| Frontend | Vanilla JS/HTML/CSS PWA |

## Project Structure

```
carrier-pigeon/
├── server/
│   ├── index.js       — Express + Socket.io server
│   ├── auth.js        — Registration, login, JWT middleware
│   ├── db.js          — SQLite schema + queries
│   └── .env.example
├── public/
│   ├── index.html     — Single page app
│   ├── manifest.json  — PWA manifest
│   ├── sw.js          — Service worker (offline caching)
│   ├── css/style.css  — Dark theme UI
│   └── js/            — App, auth, chat, utils modules
└── README.md
```

## Install as PWA

On Chrome/Edge: click the install icon in the address bar.
On mobile: tap "Add to Home Screen" from the browser menu.

## Environment Variables

| Variable     | Description              | Default                    |
|-------------|--------------------------|----------------------------|
| `PORT`      | Server port              | 3000                       |
| `JWT_SECRET`| Secret for signing JWTs  | `dev-secret-change-me`     |
