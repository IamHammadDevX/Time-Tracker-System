import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import jwt from 'jsonwebtoken';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { connectMongo } from './db.js';

dotenv.config();

const PORT = process.env.PORT || 4000;
const UPLOAD_DIR = process.env.UPLOAD_DIR || 'uploads';
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret';
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '').split(',').filter(Boolean);
const DATA_DIR = process.env.DATA_DIR || 'data';

// Ensure upload directory exists (relative to current working dir)
const uploadPath = path.resolve(process.cwd(), UPLOAD_DIR);
fs.mkdirSync(uploadPath, { recursive: true });
const metaFile = path.join(uploadPath, 'index.json');
if (!fs.existsSync(metaFile)) {
  fs.writeFileSync(metaFile, '[]');
}

// Ensure data directory exists
const dataPath = path.resolve(process.cwd(), DATA_DIR);
fs.mkdirSync(dataPath, { recursive: true });
const orgFile = path.join(dataPath, 'organization.json');
const usersFile = path.join(dataPath, 'users.json');
const intervalsFile = path.join(dataPath, 'intervals.json');
const sessionsFile = path.join(dataPath, 'work_sessions.json');
if (!fs.existsSync(orgFile)) fs.writeFileSync(orgFile, JSON.stringify({ name: '', createdAt: null }, null, 2));
if (!fs.existsSync(usersFile)) fs.writeFileSync(usersFile, '[]');
if (!fs.existsSync(intervalsFile)) fs.writeFileSync(intervalsFile, '{}');
if (!fs.existsSync(sessionsFile)) fs.writeFileSync(sessionsFile, '[]');

// Multer storage
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    cb(null, `${ts}-${file.originalname}`);
  }
});
const upload = multer({ storage });

const app = express();
const httpServer = createServer(app);
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: ALLOWED_ORIGINS.length ? ALLOWED_ORIGINS : '*',
    credentials: false
  }
});

// Middlewares
// Relax CSP/CORP for cross-origin resource loading from the web dev server
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));
// Allow all origins for dev and do not set credentials to avoid the invalid '*' + credentials combination
app.use(cors({ origin: ALLOWED_ORIGINS.length ? ALLOWED_ORIGINS : '*', credentials: false }));
app.use(express.json({ limit: '2mb' }));
app.use(morgan('dev'));
// Serve uploaded images statically for the web UI
app.use('/uploads', express.static(uploadPath));
// Serve desktop client source files for download only (py + requirements)
const projectRoot = path.resolve(process.cwd(), '..');
const desktopSrcPath = path.join(projectRoot, 'desktop');
app.use('/downloads', express.static(desktopSrcPath));

// Health check
app.get('/health', (req, res) => {
  res.json({ ok: true, uptime: process.uptime() });
});

// Auth (stub)
app.post('/api/auth/login', (req, res) => {
  const { email, role = 'employee' } = req.body || {};
  // TODO: validate credentials against DB
  const token = jwt.sign({ sub: email, role }, JWT_SECRET, { expiresIn: '8h' });
  res.json({ token });
});

// Simple auth middleware
function requireRole(roles = []) {
  return (req, res, next) => {
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Unauthorized' });
    try {
      const payload = jwt.verify(token, JWT_SECRET);
      req.user = payload;
      if (roles.length && !roles.includes(payload.role)) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      next();
    } catch (e) {
      return res.status(401).json({ error: 'Invalid token' });
    }
  };
}

// Organization setup
app.post('/api/org', requireRole(['manager', 'super_admin']), (req, res) => {
  const { name } = req.body || {};
  if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required' });
  const record = { name: name.trim(), createdAt: new Date().toISOString() };
  fs.writeFileSync(orgFile, JSON.stringify(record, null, 2));
  res.json({ ok: true, organization: record });
});

app.get('/api/org', requireRole(['manager', 'super_admin']), (req, res) => {
  try {
    const org = JSON.parse(fs.readFileSync(orgFile, 'utf-8'));
    res.json({ organization: org });
  } catch {
    res.json({ organization: { name: '', createdAt: null } });
  }
});

// Employees
app.post('/api/employees', requireRole(['manager', 'super_admin']), (req, res) => {
  const { email, name } = req.body || {};
  if (!email) return res.status(400).json({ error: 'Email is required' });
  try {
    const users = JSON.parse(fs.readFileSync(usersFile, 'utf-8'));
    if (users.find(u => u.email.toLowerCase() === String(email).toLowerCase())) {
      return res.status(409).json({ error: 'User already exists' });
    }
    const record = { email, name: name || '', role: 'employee', createdAt: new Date().toISOString() };
    users.push(record);
    fs.writeFileSync(usersFile, JSON.stringify(users, null, 2));
    res.status(201).json({ user: record });
  } catch (e) {
    console.error('[employees] write error:', e);
    res.status(500).json({ error: 'Failed to save user' });
  }
});

app.get('/api/employees', requireRole(['manager', 'super_admin']), (req, res) => {
  try {
    const users = JSON.parse(fs.readFileSync(usersFile, 'utf-8'));
    res.json({ users });
  } catch {
    res.json({ users: [] });
  }
});

// Screen capture interval configuration
const allowedMinutes = [2, 3, 4, 5];
app.get('/api/capture-interval', requireRole(['employee', 'manager', 'super_admin']), (req, res) => {
  try {
    const intervals = JSON.parse(fs.readFileSync(intervalsFile, 'utf-8'));
    const requesterRole = req.user?.role;
    const targetId = (requesterRole === 'employee') ? req.user?.sub : (req.query.employeeId || req.user?.sub);
    const secs = intervals[targetId];
    if (!secs) return res.json({ assigned: false, intervalSeconds: null });
    res.json({ assigned: true, intervalSeconds: secs });
  } catch (e) {
    console.error('[interval:get] error:', e);
    res.status(500).json({ error: 'Failed to read interval' });
  }
});

app.post('/api/capture-interval', requireRole(['manager', 'super_admin']), (req, res) => {
  try {
    const { employeeId, intervalMinutes } = req.body || {};
    if (!employeeId) return res.status(400).json({ error: 'employeeId is required' });
    const mins = Number(intervalMinutes);
    if (!allowedMinutes.includes(mins)) return res.status(400).json({ error: `intervalMinutes must be one of ${allowedMinutes.join(', ')}` });
    const secs = mins * 60;
    const intervals = JSON.parse(fs.readFileSync(intervalsFile, 'utf-8'));
    intervals[employeeId] = secs;
    fs.writeFileSync(intervalsFile, JSON.stringify(intervals, null, 2));
    // Notify the employee in real-time via Socket.IO so their desktop reflects and starts tracking
    try {
      io.to(userRoom(employeeId)).emit('interval:assigned', { employeeId, intervalSeconds: secs });
    } catch (emitErr) {
      console.warn('[interval:set] emit failed:', emitErr?.message || emitErr);
    }
    res.json({ ok: true, employeeId, intervalSeconds: secs });
  } catch (e) {
    console.error('[interval:set] error:', e);
    res.status(500).json({ error: 'Failed to save interval' });
  }
});

// ---- Work Hours Tracking ----
function readSessions(){
  try { return JSON.parse(fs.readFileSync(sessionsFile, 'utf-8')); } catch { return []; }
}
function writeSessions(arr){
  fs.writeFileSync(sessionsFile, JSON.stringify(arr, null, 2));
}
function todayStr(){ return new Date().toISOString().slice(0,10); }

// Employee starts a work session
app.post('/api/work/start', requireRole(['employee']), (req, res) => {
  try {
    const employeeId = req.user?.sub;
    const sessions = readSessions();
    // If an active session exists, return it
    const active = sessions.find(s => s.employeeId === employeeId && s.isActive);
    if (active) return res.json({ ok: true, session: active });
    const now = new Date().toISOString();
    const record = { id: `${employeeId}-${Date.now()}`, employeeId, startedAt: now, endedAt: null, isActive: true, idleSeconds: 0, lastHeartbeatAt: now, date: todayStr() };
    sessions.push(record);
    writeSessions(sessions);
    res.status(201).json({ ok: true, session: record });
  } catch (e) {
    console.error('[work:start] error:', e);
    res.status(500).json({ error: 'Failed to start work session' });
  }
});

// Employee heartbeat with idle delta seconds
app.post('/api/work/heartbeat', requireRole(['employee']), (req, res) => {
  try {
    const employeeId = req.user?.sub;
    const { idleDeltaSeconds = 0 } = req.body || {};
    const sessions = readSessions();
    const active = sessions.find(s => s.employeeId === employeeId && s.isActive);
    if (!active) return res.status(404).json({ error: 'No active session' });
    const delta = Math.max(0, Number(idleDeltaSeconds) || 0);
    active.idleSeconds = (active.idleSeconds || 0) + delta;
    active.lastHeartbeatAt = new Date().toISOString();
    writeSessions(sessions);
    res.json({ ok: true, idleSeconds: active.idleSeconds });
  } catch (e) {
    console.error('[work:heartbeat] error:', e);
    res.status(500).json({ error: 'Heartbeat failed' });
  }
});

// Employee stops the work session
app.post('/api/work/stop', requireRole(['employee']), (req, res) => {
  try {
    const employeeId = req.user?.sub;
    const sessions = readSessions();
    const active = sessions.find(s => s.employeeId === employeeId && s.isActive);
    if (!active) return res.status(404).json({ error: 'No active session' });
    active.endedAt = new Date().toISOString();
    active.isActive = false;
    writeSessions(sessions);
    res.json({ ok: true, session: active });
  } catch (e) {
    console.error('[work:stop] error:', e);
    res.status(500).json({ error: 'Failed to stop work session' });
  }
});

// Manager summary: today per employee
app.get('/api/work/summary/today', requireRole(['manager', 'super_admin']), (req, res) => {
  try {
    const sessions = readSessions();
    const today = todayStr();
    const byEmp = {};
    for (const s of sessions.filter(x => x.date === today)) {
      const k = s.employeeId;
      if (!byEmp[k]) byEmp[k] = [];
      byEmp[k].push(s);
    }
    const result = Object.entries(byEmp).map(([employeeId, arr]) => {
      // Active duration sums across sessions
      let totalActiveSeconds = 0;
      let totalIdleSeconds = 0;
      let loginTimes = [];
      let logoutTimes = [];
      for (const s of arr) {
        const start = new Date(s.startedAt).getTime();
        const end = s.endedAt ? new Date(s.endedAt).getTime() : Date.now();
        totalActiveSeconds += Math.max(0, Math.floor((end - start) / 1000));
        totalIdleSeconds += s.idleSeconds || 0;
        loginTimes.push(s.startedAt);
        if (s.endedAt) logoutTimes.push(s.endedAt);
      }
      const netActiveSeconds = Math.max(0, totalActiveSeconds - totalIdleSeconds);
      return { employeeId, loginTimes, logoutTimes, totalActiveSeconds, totalIdleSeconds, netActiveSeconds };
    });
    res.json({ today: today, employees: result });
  } catch (e) {
    console.error('[work:summary] error:', e);
    res.status(500).json({ error: 'Summary failed' });
  }
});

// Manager endpoint: today sessions per employee with per-session details
app.get('/api/work/sessions/today', requireRole(['manager', 'super_admin']), (req, res) => {
  try {
    const sessions = readSessions();
    const today = todayStr();
    const byEmp = {};
    for (const s of sessions.filter(x => x.date === today)) {
      const k = s.employeeId;
      if (!byEmp[k]) byEmp[k] = [];
      const startMs = new Date(s.startedAt).getTime();
      const endMs = s.endedAt ? new Date(s.endedAt).getTime() : Date.now();
      const activeSeconds = Math.max(0, Math.floor((endMs - startMs) / 1000));
      const idleSeconds = s.idleSeconds || 0;
      const netActiveSeconds = Math.max(0, activeSeconds - idleSeconds);
      byEmp[k].push({
        id: s.id,
        startedAt: s.startedAt,
        endedAt: s.endedAt,
        isActive: !!s.isActive,
        activeSeconds,
        idleSeconds,
        netActiveSeconds,
      });
    }
    const result = Object.entries(byEmp).map(([employeeId, sessions]) => ({ employeeId, sessions }));
    res.json({ today, employees: result });
  } catch (e) {
    console.error('[work:sessions] error:', e);
    res.status(500).json({ error: 'Sessions fetch failed' });
  }
});

// Screenshot upload
app.post('/api/uploads/screenshot', upload.single('screenshot'), async (req, res) => {
  try {
    const fileRelPath = path.relative(process.cwd(), req.file.path);
    const employeeId = (req.body && (req.body.employeeId || req.body.email)) || 'unknown';
    const record = { file: fileRelPath.replace(/\\/g, '/'), employeeId, ts: new Date().toISOString() };
    // Append metadata to uploads/index.json (simple dev store)
    try {
      const arr = JSON.parse(fs.readFileSync(metaFile, 'utf-8'));
      arr.push(record);
      fs.writeFileSync(metaFile, JSON.stringify(arr, null, 2));
    } catch (e) {
      console.error('[meta] write failed:', e);
    }
    res.status(201).json({ file: record.file });
  } catch (err) {
    console.error('[upload] error:', err);
    res.status(500).json({ error: 'Upload failed' });
  }
});

// List uploaded screenshots (development helper)
app.get('/api/uploads/list', async (req, res) => {
  try {
    const files = fs.readdirSync(uploadPath).filter(f => /\.(jpg|jpeg|png)$/i.test(f)).sort();
    let meta = [];
    try { meta = JSON.parse(fs.readFileSync(metaFile, 'utf-8')); } catch {}
    const items = files.map(f => {
      const rel = `uploads/${f}`;
      const m = meta.find(x => x.file === rel);
      let ts = m?.ts;
      if (!ts) {
        try { ts = fs.statSync(path.join(uploadPath, f)).mtime.toISOString(); } catch {}
      }
      return { file: rel, ts };
    });
    res.json({ files: items });
  } catch (err) {
    console.error('[upload:list] error:', err);
    res.status(500).json({ error: 'List failed' });
  }
});

// Activity: recent screenshots grouped by employee (dev helper)
app.get('/api/activity/recent', (req, res) => {
  try {
    const arr = JSON.parse(fs.readFileSync(metaFile, 'utf-8'));
    // group by employeeId
    const byEmp = {};
    for (const r of arr) {
      const k = r.employeeId || 'unknown';
      if (!byEmp[k]) byEmp[k] = [];
      byEmp[k].push(r);
    }
    const result = Object.entries(byEmp).map(([employeeId, records]) => {
      const sorted = records.sort((a, b) => (a.ts < b.ts ? 1 : -1));
      return {
        employeeId,
        latest: sorted.slice(0, 3).map(r => ({ file: r.file, ts: r.ts })),
        count: records.length
      };
    });
    res.json({ employees: result });
  } catch (e) {
    console.error('[activity] error:', e);
    res.status(500).json({ error: 'Activity failed' });
  }
});

// Live View via Socket.IO with auth and viewer rooms
const userRoom = (userId) => `user:${userId}`;
const viewersRoom = (employeeId) => `live:viewers:${employeeId}`;
const onlineEmployees = new Set();

io.use((socket, next) => {
  try {
    const authHeader = socket.handshake.headers?.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) return next(); // allow dev usage without auth
    const payload = jwt.verify(token, JWT_SECRET);
    // attach to socket for downstream usage
    socket.data.userId = payload?.email || payload?.userId;
    socket.data.role = payload?.role || 'employee';
    next();
  } catch (err) {
    console.warn('[socket] auth failed:', err.message);
    next();
  }
});

io.on('connection', (socket) => {
  const qpUserId = socket.handshake.query?.userId;
  const qpRole = socket.handshake.query?.role;
  const userId = socket.data.userId || qpUserId;
  const role = socket.data.role || qpRole || 'employee';

  if (userId) {
    socket.join(userRoom(userId));
  }

  // Track presence: employees
  if (role === 'employee' && userId) {
    onlineEmployees.add(userId);
    io.emit('presence:online', { userId });
  }

  // On manager connection, send current online employees list
  if (role === 'manager' || role === 'super_admin') {
    socket.emit('presence:list', { users: Array.from(onlineEmployees) });
  }

  // Manager can start live view: join the viewer room and signal employee
  socket.on('live_view:start', ({ employeeId }) => {
    if (role !== 'manager' && role !== 'super_admin') return;
    socket.join(viewersRoom(employeeId));
    io.to(userRoom(employeeId)).emit('live_view:initiate', { by: userId });
  });

  // Manager can stop live view: leave the viewer room and signal employee
  socket.on('live_view:stop', ({ employeeId }) => {
    if (role !== 'manager' && role !== 'super_admin') return;
    socket.leave(viewersRoom(employeeId));
    io.to(userRoom(employeeId)).emit('live_view:terminate', { by: userId });
  });

  // Employee can notify termination (e.g., tracking stopped)
  socket.on('live_view:terminate', ({ employeeId }) => {
    if (role !== 'employee') return;
    io.to(viewersRoom(employeeId)).emit('live_view:terminate', { by: userId });
  });

  // Employee streams frames; server relays only to viewers of that employee
  socket.on('live_view:frame', ({ employeeId, frameBase64, ts }) => {
    io.to(viewersRoom(employeeId)).emit('live_view:frame', { employeeId, frameBase64, ts });
  });

  socket.on('disconnect', () => {
    // If an employee disconnects, proactively terminate any viewer sessions
    if (role === 'employee' && userId) {
      onlineEmployees.delete(userId);
      io.emit('presence:offline', { userId });
      io.to(viewersRoom(userId)).emit('live_view:terminate', { by: userId, reason: 'offline' });
    }
  });
});

// DB connection
connectMongo(process.env.MONGO_URI);

httpServer.listen(PORT, () => {
  console.log(`[server] API listening on port ${PORT}`);
  console.log(`[server] Upload dir: ${uploadPath}`);
});

httpServer.on('error', (err) => {
  if (err && err.code === 'EADDRINUSE') {
    console.error(`[server] Port ${PORT} is already in use. Is another instance running?`);
    process.exit(1);
  } else {
    console.error('[server] Server error:', err);
  }
});

const shutdown = () => {
  try { io.disconnectSockets(true); } catch {}
  try { io.close(); } catch {}
  try {
    httpServer.close(() => process.exit(0));
  } catch {
    process.exit(0);
  }
  setTimeout(() => process.exit(0), 3000);
};

['SIGINT', 'SIGTERM', 'SIGHUP'].forEach((sig) => {
  try { process.on(sig, shutdown); } catch {}
});

process.on('uncaughtException', (err) => {
  console.error('[server] Uncaught exception:', err);
});

process.on('unhandledRejection', (err) => {
  console.error('[server] Unhandled rejection:', err);
});