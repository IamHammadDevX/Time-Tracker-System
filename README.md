# Time Tracker System

A productivity monitoring platform with a web admin portal, a Python desktop client for employees, and a Node.js backend API. This repository contains initial scaffolding aligned to the SRS.

## Components

- Backend: Node.js + Express, MongoDB (Mongoose), Socket.IO for live view
- Desktop: Python (Tkinter UI), periodic screenshots via `mss`, REST/Socket.IO integration
- Docs: System Requirements Specification (SRS) and implementation notes

## Quick Start

This is a scaffold. You can explore the structure and expand features.

### Backend (development)

1. Create `.env` from `.env.example` and set values.
2. Install dependencies: `npm install` (inside `backend/`).
3. Run the server: `npm run dev`.

### Desktop (development)

1. Create a virtual environment, e.g. `python -m venv .venv` and activate it.
2. Install dependencies: `pip install -r desktop/requirements.txt`.
3. Run the app: `python desktop/app.py`.

## Live View Overview

The backend exposes a Socket.IO channel for live view signaling and frame relay. The desktop client can stream low-frequency JPEG frames when live view is active. Managers connect via the web portal (to be implemented) and can initiate/stop sessions.

## Folder Structure

```
Time_Tracker_System/
├─ backend/
│  ├─ src/
│  │  ├─ server.js
│  │  ├─ db.js
│  │  └─ models/
│  │     ├─ User.js
│  │     ├─ WorkSession.js
│  │     └─ Screenshot.js
│  ├─ package.json
│  └─ .env.example
├─ desktop/
│  ├─ app.py
│  └─ requirements.txt
└─ docs/
   └─ SRS.md
```

## Notes

- Security: Use HTTPS/WSS in production; encrypt screenshots at rest.
- Storage: For local development, screenshots are stored locally. In production, use S3 or equivalent.
- Database: This scaffold assumes MongoDB; switch to PostgreSQL if preferred.
# Time Tracker System

A productivity monitoring platform with a Python desktop client, a Node/Express backend, and a React (Vite) web admin. Managers can configure capture intervals, review screenshots, watch live view, and track daily work hours including login/logout times and active vs idle minutes per employee.

## Features
- Work Hours Tracking: per-employee sessions for today with login/logout times, total active, idle, and net active durations.
- Session Details: start/end timestamps, per-session active and idle seconds, and running status.
- Screenshot Capture: periodic screenshots saved with exact timestamp; grouped by employee and shown across Dashboard, Activity, Work Hours, and Screenshots pages.
- Live View: real-time frames streamed via Socket.IO with timestamps overlay on the latest frame and under history.
- Capture Interval Configuration: managers assign per-employee intervals (2–20 minutes supported in web UI).
- Simple Auth: JWT tokens used by web and desktop clients (dev stub).

## Project Structure
```
Time_Tracker_System/
├── backend/           # Express/Socket.IO API server
│   ├── src/server.js  # REST API, socket events, local JSON storage
│   ├── uploads/       # Saved screenshot files + index.json metadata
│   └── package.json   # scripts and deps
├── desktop/           # Python Tkinter client
│   ├── app.py         # login, tracking, live view
│   └── requirements.txt
└── web/               # React + Vite admin
    ├── src/pages/     # Dashboard, WorkHours, Activity, Screenshots, LiveView
    └── package.json
```

## Quick Start

### 1) Backend (Node/Express)
- Prerequisites: Node 18+.
- Install and run:
```
cd backend
npm install
npm run dev
```
- Default port: `4000`. Logs will show `API listening on port 4000`.

Environment variables (optional):
- `PORT` (default `4000`)
- `UPLOAD_DIR` (default `uploads`)
- `DATA_DIR` (default `data` for `users.json`, `intervals.json`, `organization.json`, `work_sessions.json`)
- `JWT_SECRET` (default `dev_secret`)
- `ALLOWED_ORIGINS` (comma-separated list, otherwise `*` in dev)

### 2) Web Admin (React + Vite)
- Prerequisites: Node 18+.
- Configure API base (recommended): create `web/.env` with:
```
VITE_API_URL=http://localhost:4000
```
- Install and run:
```
cd web
npm install
npm run dev
```
- Access the app: `http://localhost:5173/`.

### 3) Desktop Client (Python)
- Prerequisites: Python 3.11+ and Tkinter.
- Set backend URL to match your server:
  - The desktop app defaults to `BACKEND_URL=http://localhost:4001`.
  - For this project, set `BACKEND_URL=http://localhost:4000` so it can reach the backend.
- Install and run:
```
cd desktop
py -m pip install -r requirements.txt
BACKEND_URL=http://localhost:4000 py app.py
```

Optional desktop env vars:
- `SCREENSHOT_INTERVAL_SECONDS` (default `180` → 3 minutes)
- `LIVE_VIEW_INTERVAL_SECONDS` (default `5` seconds)
- `HEARTBEAT_INTERVAL_SECONDS` (default `60` seconds)

## Usage Flow
1. Manager logs into the web admin and opens `Setup` to configure the organization and add employees.
2. Manager opens `Work Hours` or `Live View` and assigns a capture interval to an employee.
3. Employee logs into the desktop client. Once an interval is assigned, tracking automatically starts.
4. Desktop uploads screenshots (`POST /api/uploads/screenshot`) and sends idle heartbeats while the employee is active.
5. Web admin pages display:
   - Work Hours: totals and session details for today, plus recent screenshots.
   - Activity: recent screenshots grouped by employee with timestamps and today’s hour summary.
   - Screenshots: all latest files with exact times.
   - Live View: latest frame with timestamp overlay and frame history times.
   - Dashboard: organization stats and latest screenshots with timestamps.

## Key Endpoints
- Auth:
  - `POST /api/auth/login` → `{ token }`
- Employees:
  - `POST /api/employees` (manager)
  - `GET /api/employees` (manager)
- Organization:
  - `POST /api/org` (manager)
  - `GET /api/org` (manager)
- Capture Interval:
  - `GET /api/capture-interval` (employee/manager)
  - `POST /api/capture-interval` (manager) with `{ employeeId, intervalMinutes }`
- Work Hours Tracking:
  - `POST /api/work/start` (employee)
  - `POST /api/work/heartbeat` (employee) with `{ idleDeltaSeconds }`
  - `POST /api/work/stop` (employee)
  - `GET /api/work/summary/today` (manager) → per-employee totals + login/logout times
  - `GET /api/work/sessions/today` (manager) → per-employee session details
- Screenshots:
  - `POST /api/uploads/screenshot` (desktop) → saves file and metadata `{ file, ts, employeeId }`
  - `GET /api/uploads/list` → returns `[{ file, ts }]`
- Activity:
  - `GET /api/activity/recent` → recent screenshot groups `{ employeeId, latest:[{file,ts}], count }`

## Data Storage (Dev)
- `uploads/` → saved screenshot files
- `uploads/index.json` → screenshot metadata (path and ISO timestamp)
- `data/users.json` → employees list
- `data/organization.json` → organization setup
- `data/intervals.json` → assigned capture intervals by employee
- `data/work_sessions.json` → sessions: `{ id, employeeId, startedAt, endedAt, isActive, idleSeconds, lastHeartbeatAt, date }`

## Pages Overview
- `Dashboard` → org summary, employees count, latest screenshots with timestamps.
- `Work Hours` → per-employee overview: capture interval control, totals (Active/Idle/Net), first login, last logout (or Active if running), sessions count, session table, recent screenshots with timestamps.
- `Activity` → recent screenshots grouped by employee, with each thumbnail showing its exact time; plus today’s work hour summary.
- `Screenshots` → grid of all latest screenshots with exact times.
- `Live View` → latest frame overlay with timestamp and frame history timestamps; start/stop controls handled server-side.
- `Setup` → organization configuration and employee management.
- `Downloads` → desktop client source files and Windows setup steps.

## Troubleshooting
- Blank Work Hours or Activity pages:
  - Ensure `VITE_API_URL` points to your backend (e.g., `http://localhost:4000`).
  - Confirm you’re logged in and the token is present in `localStorage`.
  - Add at least one employee in `Setup`.
- Desktop client not connecting:
  - Set `BACKEND_URL` to the backend port (default `http://localhost:4000`).
  - Verify backend is running and reachable.
- Port conflicts:
  - Backend logs an error if the port is in use. Stop other instances or change `PORT`.
- Screenshots not showing timestamps:
  - New endpoint `GET /api/uploads/list` now returns `{ ts }`. Refresh the page or clear cache.

## Notes
- This is a development-oriented implementation using local JSON files for storage. For production, replace with persistent storage (SQL/NoSQL), enforce HTTPS/WSS, and integrate a proper auth system.
- Socket.IO is used for presence and live view streaming. Employees join rooms based on their ID; managers receive frames and presence updates.
- Capture intervals are pushed in real-time to the desktop client via `interval:assigned` events.