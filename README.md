# Time Tracker System

## Overview

- Full‑stack time tracking platform with web UI, backend API and optional desktop client.
- Backend: Node.js/Express with Socket.IO; primary storage is SQLite (`better-sqlite3`) with a JSON fallback for environments without native build tools.
- Frontend: React + Vite; built assets served by the backend or any static host.
- Auth: JWT‑based login with role gating (`super_admin`, `manager`, `employee`).

## Features

- Email/password login with JWT issuance and role enforcement.
- Organization setup and manager/employee management.
- Real‑time live view via WebSockets.
- Screenshot uploads and static serving of uploaded images.
- Reports, activity, work hours and audit logging.

## Architecture

- Backend API and websockets: `backend/src/server.js`.
- Storage layer: `backend/src/sqlite.js` (SQLite or JSON fallback) and optional Mongo (`backend/src/db.js`).
- Web UI: `web/` with routes protected by the presence of a JWT token.
- Static assets served at `/uploads` and desktop source distribution at `/downloads`.

## Directory Layout

- `backend/` — Express server, database adapters, uploads.
- `web/` — React/Vite application.
- `desktop/` — Optional desktop client source distributed via `/downloads`.
- `data/` — Runtime data: SQLite DB or JSON fallback files and metadata.

## Requirements

- Node.js 18+.
- For SQLite performance in production: native module `better-sqlite3`.
- Optional: MongoDB if you enable `MONGO_URI` (login/auth uses SQLite/JSON by default).

## Environment Variables

- Backend (`backend/.env`):
  - `PORT` — API port (default `4000`).
  - `HOST` — bind host (default `127.0.0.1`).
  - `JWT_SECRET` — strong secret for token signing (required in production).
  - `ALLOWED_ORIGINS` — comma‑separated origins for CORS (include your web domain).
  - `UPLOAD_DIR` — directory for uploaded files (default `uploads`).
  - `DATA_DIR` — directory for data files (default `data`).
  - `MONGO_URI` — optional Mongo connection string; if empty, Mongo is skipped.
  - `SUPERADMIN_EMAIL` / `SUPERADMIN_PASSWORD` — optional initial super admin credentials.
- Frontend (`web/.env` or `web/.env.local`):
  - `VITE_API_URL` — base URL of the backend (e.g., `https://api.example.com` or `http://127.0.0.1:4000`).

## Installation

- Backend:
  - `cd backend`
  - `npm install`
  - For production SQLite: `npm install better-sqlite3`
- Frontend:
  - `cd web`
  - `npm install`

## Development

- Backend:
  - `cd backend && npm start`
  - Health check: `GET /health` returns `{ ok: true }` (`backend/src/server.js:120–123`).
- Frontend:
  - `cd web && npm run dev`
  - Dev server runs at `http://localhost:5173`.
  - Set `VITE_API_URL` to your backend base or rely on auto base resolution.

## Build Frontend

- `cd web`
- `npm run build`
- The backend serves `web/dist` automatically (`backend/src/server.js:115–118`).

## Production Deployment

- Prepare environment:
  - Set a strong `JWT_SECRET` and restrictive `ALLOWED_ORIGINS`.
  - Install `better-sqlite3` for robust SQLite performance.
- Build and run:
  - `cd web && npm run build`
  - `cd backend && npm ci`
  - `node src/server.js`
- Process manager (example PM2):
  - `pm2 start src/server.js --name time-tracker-backend`
  - `pm2 save`
- Reverse proxy (example NGINX):
  - Proxy `https://your-domain` to backend `http://127.0.0.1:4000`.
  - Serve TLS certificates and enable gzip.
- Static hosting option:
  - Host `web/dist` on a CDN or static site and point it at the backend via `VITE_API_URL`.

## Database and Storage

- SQLite (recommended): `data/time_tracker.db` created automatically when `better-sqlite3` is installed (`backend/src/sqlite.js:16–45`).
- JSON fallback files (dev/no native build):
  - `data/users.sqlite.json`, `data/organizations.sqlite.json` (`backend/src/sqlite.js:40–45`).
- Additional JSON stores:
  - `data/users.json`, `data/organization.json`, `data/work_sessions.json`, `data/audit_logs.json` managed by `backend/src/server.js:33–45`.
- Uploads:
  - Saved under `UPLOAD_DIR` and served at `/uploads` (`backend/src/server.js:81–90`, `114`).
- Optional Mongo:
  - If `MONGO_URI` is set, backend attempts a connection (`backend/src/db.js`).

## Authentication and Roles

- Login route: `POST /api/auth/login` returns `{ token }` (`backend/src/server.js:136–153`).
- JWT payload includes `email`, `role`, `uid` and is signed with `JWT_SECRET`.
- Role middleware: `requireRole([...])` protects endpoints (`backend/src/server.js:155–172`).
- Default super admin is seeded if missing (`backend/src/sqlite.js:88–94`).

## API Endpoints

- `GET /health` — service health (`backend/src/server.js:120–123`).
- `POST /api/auth/login` — obtain JWT (`backend/src/server.js:136–153`).
- Organization:
  - `POST /api/org` — create (`backend/src/server.js:175–181`).
  - `GET /api/org` — fetch (`backend/src/server.js:183–190`).
- Employees:
  - `POST /api/employees` — create (`backend/src/server.js:193–200` and following).
  - `GET /api/employees` — list (`backend/src/server.js:313–326`).
  - `DELETE /api/employees/:email` — delete (`backend/src/server.js:329–356`).
- Managers:
  - `POST /api/admin/managers` — create (`backend/src/server.js:234–250`).
  - `GET /api/admin/managers` — list (`backend/src/server.js:253–267`).
  - `DELETE /api/admin/managers/:id` — delete (`backend/src/server.js:269–296`).
- Password management:
  - `POST /api/admin/employees/password` — upsert employee password (`backend/src/server.js:359–377`).

## Real‑Time

- Socket.IO server uses JWT for auth and allows all origins at the socket layer (`backend/src/server.js:92–101`).
- Frontend socket connects with `auth: { token }` and query parsed from JWT (`web/src/socket.js`).

## Security Hardening

- Set a long, random `JWT_SECRET` and rotate periodically.
- Restrict `ALLOWED_ORIGINS` to your exact domains.
- Serve over HTTPS behind a reverse proxy.
- Limit upload file sizes via `express.json` and multer configurations.
- Regularly back up `data/` and audit logs.

## Monitoring and Health

- Use `/health` for uptime checks and load balancer health.
- Enable process monitoring via PM2, systemd or your orchestrator.
- Aggregate logs and configure alerts on failures.

## Troubleshooting

- Login delays or freeze:
  - Ensure `VITE_API_URL` points to the correct backend base.
  - Verify backend is reachable and `/health` returns `{ ok: true }`.
- `[sqlite] better-sqlite3 not available`:
  - Install `better-sqlite3` in `backend` for production performance.
- Mongo warnings:
  - If `MONGO_URI` is unset, the server skips Mongo. This does not affect login.

