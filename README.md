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