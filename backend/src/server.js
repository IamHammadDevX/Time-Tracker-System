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
if (!fs.existsSync(orgFile)) fs.writeFileSync(orgFile, JSON.stringify({ name: '', createdAt: null }, null, 2));
if (!fs.existsSync(usersFile)) fs.writeFileSync(usersFile, '[]');

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
    credentials: true
  }
});

// Middlewares
// Relax CSP/CORP for cross-origin resource loading from the web dev server
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));
app.use(cors({ origin: ALLOWED_ORIGINS.length ? ALLOWED_ORIGINS : '*', credentials: true }));
app.use(express.json({ limit: '2mb' }));
app.use(morgan('dev'));
// Serve uploaded images statically for the web UI
app.use('/uploads', express.static(uploadPath));
// Serve desktop client for download
// Mount dist first (if present), then fall back to source
const projectRoot = path.resolve(process.cwd(), '..');
const desktopDistPath = path.join(projectRoot, 'desktop', 'dist');
const desktopSrcPath = path.join(projectRoot, 'desktop');
if (fs.existsSync(desktopDistPath)) {
  app.use('/downloads', express.static(desktopDistPath));
}
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
    res.json({ files: files.map(f => ({ file: `uploads/${f}` })) });
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

// Live View via Socket.IO
const userRoom = (userId) => `user:${userId}`;

io.on('connection', (socket) => {
  const { userId, role } = socket.handshake.query;
  if (userId) {
    socket.join(userRoom(userId));
  }

  socket.on('live_view:start', ({ employeeId }) => {
    if (role !== 'manager' && role !== 'super_admin') return;
    io.to(userRoom(employeeId)).emit('live_view:initiate', { by: userId });
  });

  socket.on('live_view:stop', ({ employeeId }) => {
    if (role !== 'manager' && role !== 'super_admin') return;
    io.to(userRoom(employeeId)).emit('live_view:terminate', { by: userId });
  });

  // Employee streams frames to their room; managers listen using employeeId
  socket.on('live_view:frame', ({ employeeId, frameBase64, ts }) => {
    // Relay to all managers (in future, restrict to specific viewers)
    io.emit('live_view:frame', { employeeId, frameBase64, ts });
  });

  socket.on('disconnect', () => {
    // Optional: emit presence updates
  });
});

// DB connection
connectMongo(process.env.MONGO_URI);

httpServer.listen(PORT, () => {
  console.log(`[server] API listening on port ${PORT}`);
  console.log(`[server] Upload dir: ${uploadPath}`);
});