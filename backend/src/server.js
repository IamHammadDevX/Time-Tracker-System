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
import { db, getUserByEmail, createUser, verifyPassword, seedDefaultSuperAdmin, createOrganization, listManagers, getOrganizationByManagerId, upsertEmployeePassword, deleteUserById, deleteUserByEmail, deleteOrganizationByManagerId } from './sqlite.js';
import bcrypt from 'bcryptjs';

dotenv.config();

const PORT = process.env.PORT || 4000;
const HOST = process.env.HOST || '127.0.0.1';
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
const auditFile = path.join(dataPath, 'audit_logs.json');
if (!fs.existsSync(orgFile)) fs.writeFileSync(orgFile, JSON.stringify({ name: '', createdAt: null }, null, 2));
if (!fs.existsSync(usersFile)) fs.writeFileSync(usersFile, '[]');
if (!fs.existsSync(intervalsFile)) fs.writeFileSync(intervalsFile, '{}');
if (!fs.existsSync(sessionsFile)) fs.writeFileSync(sessionsFile, '[]');
if (!fs.existsSync(auditFile)) fs.writeFileSync(auditFile, '[]');

// Users/team helpers
function readUsers(){
  try { return JSON.parse(fs.readFileSync(usersFile, 'utf-8')); } catch { return []; }
}
function writeUsers(arr){ fs.writeFileSync(usersFile, JSON.stringify(arr, null, 2)); }
function getTeamEmailsForManager(managerKey){
  const users = readUsers();
  // Accept either manager numeric id or email; resolve both forms
  const keys = new Set();
  const keyStr = String(managerKey || '').trim();
  if (keyStr) keys.add(keyStr);
  try {
    const managers = listManagers();
    const m = managers.find(x => String(x.id) === keyStr || String(x.email).toLowerCase() === keyStr.toLowerCase());
    if (m) {
      keys.add(String(m.id));
      keys.add(String(m.email));
    }
  } catch {}
  return users
    .filter(u => u.role === 'employee' && keys.has(String(u.managerId)))
    .map(u => u.email);
}
function appendAudit(type, details){
  try {
    const arr = JSON.parse(fs.readFileSync(auditFile, 'utf-8'));
    arr.push({ type, details, ts: new Date().toISOString() });
    fs.writeFileSync(auditFile, JSON.stringify(arr, null, 2));
  } catch (e) {
    console.error('[audit] append failed:', e);
  }
}

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
// Socket.IO: allow all origins because desktop clients are non-browser
// and rely on JWT for authorization. Express CORS remains restricted.
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: '*',
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

// Startup warnings for production hardening
if (JWT_SECRET === 'dev_secret') {
  console.warn('[security] Using default JWT_SECRET. Set a strong JWT_SECRET for production.');
}
if (!ALLOWED_ORIGINS.length) {
  console.warn('[cors] ALLOWED_ORIGINS not set. CORS is wide open (*) for development.');
}

// Seed default Super Admin on startup
seedDefaultSuperAdmin();

// Auth
app.post('/api/auth/login', (req, res) => {
  try {
    const { email, password, role } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });
    const user = getUserByEmail(email);
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    // If role provided, enforce role match
    if (role && user.role !== role) return res.status(403).json({ error: 'Forbidden: role mismatch' });
    const ok = verifyPassword(user, password);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
    const token = jwt.sign({ sub: user.email, email: user.email, role: user.role, uid: user.id }, JWT_SECRET, { expiresIn: '8h' });
    res.json({ token });
  } catch (e) {
    console.error('[auth:login] error:', e);
    res.status(500).json({ error: 'Login failed' });
  }
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

// Team info for the authenticated manager (maps to organization by manager)
app.get('/api/team', requireRole(['manager', 'super_admin']), (req, res) => {
  try {
    if (req.user?.role === 'manager') {
      const mgrId = req.user?.uid;
      const mgrEmail = req.user?.sub;
      let org = null;
      try { org = getOrganizationByManagerId(mgrId); } catch {}
      if (!org) {
        try { org = getOrganizationByManagerId(mgrEmail); } catch {}
      }
      if (org) return res.json({ team: { id: org.id, name: org.name } });
      return res.json({ team: null });
    }
    // super_admin has no single team context
    return res.json({ team: null });
  } catch {
    return res.json({ team: null });
  }
});

// Employees
app.post('/api/employees', requireRole(['manager', 'super_admin']), (req, res) => {
  const { email, name, managerId: bodyManagerId, password } = req.body || {};
  if (!email) return res.status(400).json({ error: 'Email is required' });
  try {
    const users = readUsers();
    if (users.find(u => u.email.toLowerCase() === String(email).toLowerCase())) {
      return res.status(409).json({ error: 'User already exists' });
    }
    // Also prevent duplicate login user in sqlite
    const existingLogin = getUserByEmail(email);
    if (existingLogin) {
      return res.status(409).json({ error: 'Login user already exists' });
    }
    const requesterRole = req.user?.role;
    const requesterUid = req.user?.uid || req.user?.sub; // prefer uid; fallback to email
    const managerId = (requesterRole === 'manager') ? requesterUid : (bodyManagerId || requesterUid || null);

    // Generate a temporary password if not provided
    const tempPassword = password && String(password).trim()
      ? String(password).trim()
      : Math.random().toString(36).slice(2, 10);

    // Create login user in sqlite (or JSON fallback)
    const loginUser = createUser({ email, password: tempPassword, role: 'employee' });

    // Store team mapping and display name in simple JSON store
    const record = { email, name: name || '', role: 'employee', managerId, createdAt: new Date().toISOString() };
    users.push(record);
    writeUsers(users);

    res.status(201).json({
      user: record,
      login: { id: loginUser.id, email: loginUser.email, tempPassword }
    });
  } catch (e) {
    console.error('[employees] write error:', e);
    res.status(500).json({ error: 'Failed to save user' });
  }
});

// ---- Super Admin: Manager creation ----
app.post('/api/admin/managers', requireRole(['super_admin']), (req, res) => {
  try {
    const { email, password, orgName } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });
    if (!orgName || !String(orgName).trim()) return res.status(400).json({ error: 'Team name is required' });
    const existing = getUserByEmail(email);
    if (existing) return res.status(409).json({ error: 'User already exists' });
    const manager = createUser({ email, password, role: 'manager' });
    const org = createOrganization({ name: orgName.trim(), managerId: manager.id });
    res.status(201).json({ ok: true, manager: { id: manager.id, email: manager.email, role: manager.role }, organization: org });
  } catch (e) {
    console.error('[admin:create_manager] error:', e);
    res.status(500).json({ error: 'Failed to create manager' });
  }
});

// ---- Super Admin: Managers list with employee counts ----
app.get('/api/admin/managers', requireRole(['super_admin']), (req, res) => {
  try {
    const managers = listManagers();
    const employees = readUsers().filter(u => u.role === 'employee');
    const enriched = managers.map(m => {
      const org = getOrganizationByManagerId(m.id) || null;
      const count = employees.filter(e => e.managerId === m.id || e.managerId === m.email).length;
      return { id: m.id, email: m.email, employeeCount: count, organization: org ? { id: org.id, name: org.name } : null };
    });
    res.json({ managers: enriched });
  } catch (e) {
    console.error('[admin:list_managers] error:', e);
    res.status(500).json({ error: 'Failed to list managers' });
  }
});

// ---- Super Admin: Delete a manager ----
app.delete('/api/admin/managers/:id', requireRole(['super_admin']), (req, res) => {
  try {
    const { id } = req.params;
    // Verify manager exists
    let exists = null;
    if (db) {
      const stmt = db.prepare("SELECT * FROM users WHERE id = ? AND role = 'manager'");
      exists = stmt.get(id);
    } else {
      try {
        const arr = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), DATA_DIR, 'users.sqlite.json'), 'utf-8'));
        exists = arr.find(u => String(u.id) === String(id) && u.role === 'manager');
      } catch {}
    }
    if (!exists) return res.status(404).json({ error: 'Manager not found' });

    // Delete orgs tied to this manager
    try { deleteOrganizationByManagerId(id); } catch {}
    // Delete manager login
    const ok = deleteUserById(id);
    if (!ok) return res.status(500).json({ error: 'Failed to delete manager' });
    return res.json({ ok: true });
  } catch (e) {
    console.error('[admin:delete_manager] error:', e);
    res.status(500).json({ error: 'Delete manager failed' });
  }
});

// ---- Super Admin: Audit logs ----
app.get('/api/admin/audit-logs', requireRole(['super_admin']), (req, res) => {
  try {
    let logs = [];
    try { logs = JSON.parse(fs.readFileSync(auditFile, 'utf-8')); } catch {}
    const { managerId, employeeId } = req.query || {};
    if (managerId) logs = logs.filter(l => l.details?.actorId === managerId);
    if (employeeId) logs = logs.filter(l => l.details?.employeeId === employeeId);
    res.json({ logs });
  } catch (e) {
    console.error('[admin:audit_logs] error:', e);
    res.status(500).json({ error: 'Failed to read audit logs' });
  }
});

app.get('/api/employees', requireRole(['manager', 'super_admin']), (req, res) => {
  try {
    const users = readUsers();
    const role = req.user?.role;
    if (role === 'manager') {
      const teamEmails = getTeamEmailsForManager(req.user?.uid || req.user?.sub);
      const teamUsers = users.filter(u => u.role === 'employee' && teamEmails.includes(u.email));
      return res.json({ users: teamUsers });
    }
    res.json({ users });
  } catch {
    res.json({ users: [] });
  }
});

// ---- Admin/Manager: Delete an employee ----
app.delete('/api/employees/:email', requireRole(['manager', 'super_admin']), (req, res) => {
  try {
    const { email } = req.params;
    if (!email) return res.status(400).json({ error: 'Email is required' });
    const allUsers = readUsers();
    const employee = allUsers.find(u => u.role === 'employee' && String(u.email).toLowerCase() === String(email).toLowerCase());
    if (!employee) return res.status(404).json({ error: 'Employee not found' });
    // Managers may only remove their team
    if (req.user?.role === 'manager') {
      const teamEmails = getTeamEmailsForManager(req.user?.uid || req.user?.sub);
      if (!teamEmails.includes(employee.email)) {
        return res.status(403).json({ error: 'Not allowed' });
      }
    }
    const remaining = allUsers.filter(u => String(u.email).toLowerCase() !== String(email).toLowerCase());
    writeUsers(remaining);
    try { deleteUserByEmail(email); } catch {}
    // Terminate any ongoing live streams for this employee
    try {
      liveStreamOn.set(email, false);
      io.to(viewersRoom(email)).emit('live_view:terminate', { by: email, reason: 'deleted' });
    } catch {}
    res.json({ ok: true });
  } catch (e) {
    console.error('[employees:delete] error:', e);
    res.status(500).json({ error: 'Delete employee failed' });
  }
});

// Admin/Manager: Set or reset an employee password (provision login if missing)
app.post('/api/admin/employees/password', requireRole(['manager', 'super_admin']), (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });
    const allUsers = readUsers();
    const employee = allUsers.find(u => u.role === 'employee' && u.email.toLowerCase() === String(email).toLowerCase());
    if (!employee) return res.status(404).json({ error: 'Employee not found' });
    // Managers can only modify their team
    if (req.user?.role === 'manager') {
      const teamEmails = getTeamEmailsForManager(req.user?.uid || req.user?.sub);
      if (!teamEmails.includes(employee.email)) return res.status(403).json({ error: 'Forbidden: not your team' });
    }
    const loginUser = upsertEmployeePassword(employee.email, String(password));
    res.json({ ok: true, user: { email: employee.email }, login: { id: loginUser.id, email: loginUser.email } });
  } catch (e) {
    console.error('[admin:set_employee_password] error:', e);
    res.status(500).json({ error: 'Failed to set password' });
  }
});

// Screen capture interval configuration
// Align with web UI options (include 1 minute)
const allowedMinutes = [1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20];
app.get('/api/capture-interval', requireRole(['employee', 'manager', 'super_admin']), (req, res) => {
  try {
    const intervals = JSON.parse(fs.readFileSync(intervalsFile, 'utf-8'));
    const requesterRole = req.user?.role;
    let targetId = (requesterRole === 'employee') ? req.user?.sub : (req.query.employeeId || req.user?.sub);
    if (requesterRole === 'manager' && targetId) {
      const teamEmails = getTeamEmailsForManager(req.user?.uid || req.user?.sub);
      if (!teamEmails.includes(targetId)) return res.status(403).json({ error: 'Forbidden: not your team' });
    }
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
    if (req.user?.role === 'manager') {
      const teamEmails = getTeamEmailsForManager(req.user?.uid || req.user?.sub);
      if (!teamEmails.includes(employeeId)) return res.status(403).json({ error: 'Forbidden: not your team' });
    }
  const secs = mins * 60;
  const intervals = JSON.parse(fs.readFileSync(intervalsFile, 'utf-8'));
  intervals[employeeId] = secs;
  fs.writeFileSync(intervalsFile, JSON.stringify(intervals, null, 2));
  // Audit
  appendAudit('interval_set', { actorId: req.user?.uid || req.user?.sub, employeeId, intervalMinutes: mins });
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
    // Terminate any ongoing live streams for this employee
    try {
      liveStreamOn.set(employeeId, false);
      io.to(viewersRoom(employeeId)).emit('live_view:terminate', { by: employeeId, reason: 'work_stop' });
    } catch {}
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
    let entries = Object.entries(byEmp);
    if (req.user?.role === 'manager') {
      const teamEmails = getTeamEmailsForManager(req.user?.uid || req.user?.sub);
      entries = entries.filter(([employeeId]) => teamEmails.includes(employeeId));
    }
    const result = entries.map(([employeeId, arr]) => {
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
    let entries = Object.entries(byEmp);
    if (req.user?.role === 'manager') {
      const teamEmails = getTeamEmailsForManager(req.user?.uid || req.user?.sub);
      entries = entries.filter(([employeeId]) => teamEmails.includes(employeeId));
    }
    const result = entries.map(([employeeId, sessions]) => ({ employeeId, sessions }));
    res.json({ today, employees: result });
  } catch (e) {
    console.error('[work:sessions] error:', e);
    res.status(500).json({ error: 'Sessions fetch failed' });
  }
});

// Screenshot upload
app.post('/api/uploads/screenshot', requireRole(['employee']), upload.single('screenshot'), async (req, res) => {
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
    try { io.emit('uploads:new', { employeeId, file: record.file, ts: record.ts }); } catch {}

    // Mark employee as online upon receiving a screenshot (helps Live View selection)
    if (employeeId && employeeId !== 'unknown') {
      onlineEmployees.add(employeeId);
      io.emit('presence:online', { userId: employeeId });
    }

    // If a manager has started live view for this employee, relay the frame to viewers
    try {
      const absFile = path.resolve(req.file.path);
      const frameBase64 = fs.readFileSync(absFile, { encoding: 'base64' });
      if (liveStreamOn.get(employeeId)) {
        io.to(viewersRoom(employeeId)).emit('live_view:frame', { employeeId, frameBase64, ts: record.ts });
      }
    } catch (e) {
      console.warn('[live_view] relay failed:', e?.message || e);
    }

    res.status(201).json({ file: record.file });
  } catch (err) {
    console.error('[upload] error:', err);
    res.status(500).json({ error: 'Upload failed' });
  }
});

app.post('/api/uploads/cleanup', requireRole(['super_admin']), (req, res) => {
  try {
    const { from, to } = req.body || {};
    const toStartISO = (ds) => {
      if (!ds) return null;
      const base = new Date(ds);
      const d = new Date(`${base.toISOString().slice(0,10)}T00:00:00`);
      return d.toISOString();
    };
    const toEndISO = (ds) => {
      if (!ds) return null;
      const base = new Date(ds);
      const d = new Date(`${base.toISOString().slice(0,10)}T00:00:00`);
      return new Date(d.getTime() + 24*60*60*1000 - 1).toISOString();
    };
    const fromIso = from ? toStartISO(from) : null;
    const toIso = to ? toEndISO(to) : null;
    const fromMs = fromIso ? new Date(fromIso).getTime() : null;
    const toMs = toIso ? new Date(toIso).getTime() : null;
    let meta = [];
    try { meta = JSON.parse(fs.readFileSync(metaFile, 'utf-8')); } catch {}
    const inRange = (ts) => {
      const t = new Date(ts).getTime();
      if (fromMs && t < fromMs) return false;
      if (toMs && t > toMs) return false;
      return true;
    };
    const targets = meta.filter(m => m.ts && inRange(m.ts));
    let removed = 0;
    let bytesFreed = 0;
    for (const m of targets) {
      try {
        const fname = path.basename(String(m.file || ''));
        const abs = path.join(uploadPath, fname);
        try { bytesFreed += fs.statSync(abs).size; } catch {}
        if (fs.existsSync(abs)) fs.unlinkSync(abs);
        removed += 1;
      } catch {}
    }
    const keep = meta.filter(m => !(m.ts && inRange(m.ts)));
    try { fs.writeFileSync(metaFile, JSON.stringify(keep, null, 2)); } catch {}
    try { io.emit('uploads:cleanup_done', { removed, bytesFreed, from: fromIso, to: toIso }); } catch {}
    res.json({ ok: true, removed, bytesFreed });
  } catch (err) {
    console.error('[uploads:cleanup] error:', err);
    res.status(500).json({ error: 'Cleanup failed' });
  }
});

// List uploaded screenshots (development helper)
app.get('/api/uploads/list', requireRole(['manager', 'super_admin']), async (req, res) => {
  try {
    const files = fs.readdirSync(uploadPath).filter(f => /\.(jpg|jpeg|png)$/i.test(f)).sort();
    let meta = [];
    try { meta = JSON.parse(fs.readFileSync(metaFile, 'utf-8')); } catch {}
    let items = files.map(f => {
      const rel = `uploads/${f}`;
      const m = meta.find(x => x.file === rel);
      let ts = m?.ts;
      if (!ts) {
        try { ts = fs.statSync(path.join(uploadPath, f)).mtime.toISOString(); } catch {}
      }
      return { file: rel, ts, employeeId: m?.employeeId };
    });
    if (req.user?.role === 'manager') {
      const teamEmails = getTeamEmailsForManager(req.user?.uid || req.user?.sub);
      items = items.filter(it => it.employeeId && teamEmails.includes(it.employeeId));
    }
    res.json({ files: items });
  } catch (err) {
    console.error('[upload:list] error:', err);
    res.status(500).json({ error: 'List failed' });
  }
});

// Query uploaded screenshots by employee and date range
app.get('/api/uploads/query', requireRole(['manager', 'super_admin']), async (req, res) => {
  try {
    const { employeeId, from, to } = req.query || {};
    let meta = [];
    try { meta = JSON.parse(fs.readFileSync(metaFile, 'utf-8')); } catch {}
    // Manager scoping to team
    if (req.user?.role === 'manager') {
      const teamEmails = getTeamEmailsForManager(req.user?.uid || req.user?.sub);
      meta = meta.filter(m => m.employeeId && teamEmails.includes(m.employeeId));
    }
    // Filter by employee
    if (employeeId) {
      meta = meta.filter(m => String(m.employeeId).toLowerCase() === String(employeeId).toLowerCase());
    }
    // Filter by date range (ISO)
    const fromMs = from ? new Date(from).getTime() : null;
    const toMs = to ? new Date(to).getTime() : null;
    if (fromMs) meta = meta.filter(m => new Date(m.ts).getTime() >= fromMs);
    if (toMs) meta = meta.filter(m => new Date(m.ts).getTime() <= toMs);
    // Sort by time ascending
    meta.sort((a, b) => (a.ts > b.ts ? 1 : -1));
    res.json({ files: meta });
  } catch (err) {
    console.error('[upload:query] error:', err);
    res.status(500).json({ error: 'Query failed' });
  }
});

// Sessions by date range with per-session details
app.get('/api/work/sessions/range', requireRole(['manager', 'super_admin']), (req, res) => {
  try {
    const { employeeId, from, to } = req.query || {};
    const sessions = readSessions();
    const fromStr = from ? String(from).slice(0,10) : null;
    const toStr = to ? String(to).slice(0,10) : null;
    const inRange = sessions.filter(s => {
      const d = s.date;
      if (fromStr && d < fromStr) return false;
      if (toStr && d > toStr) return false;
      return true;
    });
    const byEmp = {};
    for (const s of inRange) {
      const k = s.employeeId;
      if (employeeId && String(k).toLowerCase() !== String(employeeId).toLowerCase()) continue;
      if (!byEmp[k]) byEmp[k] = [];
      const startMs = new Date(s.startedAt).getTime();
      const endMs = s.endedAt ? new Date(s.endedAt).getTime() : Date.now();
      const activeSeconds = Math.max(0, Math.floor((endMs - startMs) / 1000));
      const idleSeconds = s.idleSeconds || 0;
      const netActiveSeconds = Math.max(0, activeSeconds - idleSeconds);
      byEmp[k].push({
        id: s.id,
        date: s.date,
        startedAt: s.startedAt,
        endedAt: s.endedAt,
        isActive: !!s.isActive,
        activeSeconds,
        idleSeconds,
        netActiveSeconds,
      });
    }
    let entries = Object.entries(byEmp);
    if (req.user?.role === 'manager') {
      const teamEmails = getTeamEmailsForManager(req.user?.uid || req.user?.sub);
      entries = entries.filter(([eid]) => teamEmails.includes(eid));
    }
    const result = entries.map(([employeeId, sessions]) => ({ employeeId, sessions }));
    res.json({ employees: result, from: fromStr, to: toStr });
  } catch (e) {
    console.error('[work:sessions_range] error:', e);
    res.status(500).json({ error: 'Sessions range failed' });
  }
});

// Activity: recent screenshots grouped by employee (dev helper)
app.get('/api/activity/recent', requireRole(['manager', 'super_admin']), (req, res) => {
  try {
    const arr = JSON.parse(fs.readFileSync(metaFile, 'utf-8'));
    // group by employeeId
    const byEmp = {};
    for (const r of arr) {
      const k = r.employeeId || 'unknown';
      if (!byEmp[k]) byEmp[k] = [];
      byEmp[k].push(r);
    }
    let entries = Object.entries(byEmp);
    if (req.user?.role === 'manager') {
      const teamEmails = getTeamEmailsForManager(req.user?.uid || req.user?.sub);
      entries = entries.filter(([employeeId]) => teamEmails.includes(employeeId));
    }
    const result = entries.map(([employeeId, records]) => {
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
// Track live streaming enablement per employee; frames are relayed only when true
const liveStreamOn = new Map(); // employeeId -> boolean

io.use((socket, next) => {
  try {
    // Accept token from Authorization header or Socket.IO auth payload
    const authHeader = socket.handshake.headers?.authorization || '';
    const headerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    const authToken = socket.handshake.auth?.token || null;
    const qpToken = socket.handshake.query?.token || null; // fallback if needed
    const token = headerToken || authToken || qpToken;
    if (!token) return next();
    const payload = jwt.verify(token, JWT_SECRET);
    // attach to socket for downstream usage (production: trust only verified token)
    socket.data.userId = payload?.email || payload?.userId; // email identifier (employees/managers)
    socket.data.uid = payload?.uid || null; // numeric/uuid id (managers)
    socket.data.role = payload?.role || 'employee';
    next();
  } catch (err) {
    console.warn('[socket] auth failed:', err.message);
    next();
  }
});

io.on('connection', (socket) => {
  const qpUserId = socket.handshake.query?.userId;
  const qpUid = socket.handshake.query?.uid;
  const userId = socket.data.userId || qpUserId;
  // Production: role must come from verified token. Ignore query role.
  const role = socket.data.role || 'employee';
  const managerUid = socket.data.uid || qpUid || null;

  if (userId) {
    socket.join(userRoom(userId));
  }

  // Track presence: employees
  if (role === 'employee' && userId) {
    onlineEmployees.add(userId);
    io.emit('presence:online', { userId });
  }

  // On manager connection, send current online employees list (scoped to team)
  if (role === 'manager' || role === 'super_admin') {
    let users = Array.from(onlineEmployees);
    if (role === 'manager') {
      const teamEmails = getTeamEmailsForManager(managerUid || socket.data.uid || socket.data.userId || userId);
      users = users.filter(u => teamEmails.includes(u));
    }
    socket.emit('presence:list', { users });
  }

  // Manager can start live view: join the viewer room and signal employee
  socket.on('live_view:start', ({ employeeId }) => {
    // Only allow verified manager/super_admin via JWT
    if (role !== 'manager' && role !== 'super_admin') return;
    if (role === 'manager') {
      const teamEmails = getTeamEmailsForManager(managerUid || socket.data.uid || socket.data.userId || userId);
      if (!teamEmails.includes(employeeId)) return; // ignore if not in team
    }
    socket.join(viewersRoom(employeeId));
    liveStreamOn.set(employeeId, true);
    io.to(userRoom(employeeId)).emit('live_view:initiate', { by: userId });
    appendAudit('live_view_start', { actorId: socket.data.userId || userId, employeeId });
  });

  // Manager can stop live view: leave the viewer room and signal employee
  socket.on('live_view:stop', ({ employeeId }) => {
    if (role !== 'manager' && role !== 'super_admin') return;
    if (role === 'manager') {
      const teamEmails = getTeamEmailsForManager(managerUid || socket.data.uid || socket.data.userId || userId);
      if (!teamEmails.includes(employeeId)) return; // ignore if not in team
    }
    socket.leave(viewersRoom(employeeId));
    liveStreamOn.set(employeeId, false);
    io.to(userRoom(employeeId)).emit('live_view:terminate', { by: userId, reason: 'manager_stop' });
    io.to(viewersRoom(employeeId)).emit('live_view:terminate', { by: userId, reason: 'manager_stop' });
  });

  // Employee can notify termination (e.g., tracking stopped)
  socket.on('live_view:terminate', ({ employeeId }) => {
    if (role !== 'employee') return;
    liveStreamOn.set(employeeId, false);
    io.to(viewersRoom(employeeId)).emit('live_view:terminate', { by: userId, reason: 'employee_terminate' });
  });

// Employee streams frames; server always relays to viewers of that employee
socket.on('live_view:frame', ({ employeeId, frameBase64, ts }) => {
  io.to(viewersRoom(employeeId)).emit('live_view:frame', { employeeId, frameBase64, ts });
});

  socket.on('disconnect', () => {
    // If an employee disconnects, proactively terminate any viewer sessions
    if (role === 'employee' && userId) {
      onlineEmployees.delete(userId);
      io.emit('presence:offline', { userId });
      liveStreamOn.set(userId, false);
      io.to(viewersRoom(userId)).emit('live_view:terminate', { by: userId, reason: 'offline' });
    }
  });
});

// DB connection
connectMongo(process.env.MONGO_URI);

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

// Serve built frontend (SPA) in production if available
try {
  const webDistPath = path.join(projectRoot, 'web', 'dist');
  if (fs.existsSync(webDistPath)) {
    app.use(express.static(webDistPath));
    // SPA fallback: send index.html for non-API routes
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api') || req.path.startsWith('/uploads') || req.path.startsWith('/downloads')) return next();
      res.sendFile(path.join(webDistPath, 'index.html'));
    });
    console.log('[server] Serving static frontend from', webDistPath);
  }
} catch (e) {
  console.warn('[server] Unable to configure static frontend serving:', e?.message || e);
}


// ---------- BEGIN: compatibility proxy to support hardcoded :4000 frontend ----------
// If the backend starts on a different port than 4000, create a tiny proxy
// that listens on 4000 and forwards requests to the real server port.
// This helps dev setups where the frontend expects http://localhost:4000.
import http from 'http';

const ACTUAL_PORT = Number(PORT) || 4000;
const LEGACY_PORT = 4000;

// start the main server (this is already in your file):
httpServer.listen(PORT, () => {
  const base = `http://localhost:${PORT}`;
  console.log(`[server] API listening at ${base}`);
  console.log(`[server] Upload dir: ${uploadPath}`);

  // only create proxy when needed and when LEGACY_PORT !== ACTUAL_PORT
  if (Number(ACTUAL_PORT) !== Number(LEGACY_PORT)) {
    try {
      const proxy = http.createServer((req, res) => {
        // forward request to actual server
        const options = {
          hostname: HOST,
          port: ACTUAL_PORT,
          path: req.url,
          method: req.method,
          headers: req.headers
        };

        const proxied = http.request(options, proxRes => {
          res.writeHead(proxRes.statusCode, proxRes.headers);
          proxRes.pipe(res, { end: true });
        });

        proxied.on('error', err => {
          console.error('[proxy] Forward error:', err.message);
          res.writeHead(502, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Proxy forward error' }));
        });

        // pipe request body
        req.pipe(proxied, { end: true });
      });

      proxy.on('error', (err) => {
        if (err && err.code === 'EADDRINUSE') {
          console.warn(`[proxy] Port ${LEGACY_PORT} already in use. Skipping compatibility proxy.`);
        } else {
          console.warn('[proxy] Error starting compatibility proxy:', err);
        }
      });

      proxy.listen(LEGACY_PORT, '127.0.0.1', () => {
        console.log(`[proxy] Compatibility proxy listening on http://127.0.0.1:${LEGACY_PORT} -> http://${HOST}:${ACTUAL_PORT}`);
      });
    } catch (e) {
      console.warn('[proxy] Failed to start compatibility proxy:', e?.message || e);
    }
  }
});
// ---------- END: compatibility proxy ----------
// Query current online employees (role-scoped)
app.get('/api/presence/online', requireRole(['manager', 'super_admin']), (req, res) => {
  try {
    let users = Array.from(onlineEmployees);
    if (req.user?.role === 'manager') {
      const teamEmails = getTeamEmailsForManager(req.user?.uid || req.user?.sub);
      users = users.filter(u => teamEmails.includes(u));
    }
    res.json({ users });
  } catch (e) {
    console.error('[presence:online] error:', e);
    res.status(500).json({ error: 'Failed to read presence' });
  }
});
