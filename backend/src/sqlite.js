import path from 'path'
import fs from 'fs'
import bcrypt from 'bcryptjs'

let Database = null
let db = null

const DATA_DIR = process.env.DATA_DIR || 'data'
const dbPath = path.resolve(process.cwd(), DATA_DIR, 'time_tracker.db')
const fallbacks = {
  users: path.resolve(process.cwd(), DATA_DIR, 'users.sqlite.json'),
  orgs: path.resolve(process.cwd(), DATA_DIR, 'organizations.sqlite.json')
}
fs.mkdirSync(path.dirname(dbPath), { recursive: true })

try {
  // Dynamically import to allow environments without native build tools to still run (fallback to JSON)
  const mod = await import('better-sqlite3')
  Database = mod.default
  db = new Database(dbPath)
  // Initialize schema
  db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('super_admin','manager','employee')),
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS organizations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    manager_id INTEGER,
    created_at TEXT NOT NULL,
    FOREIGN KEY(manager_id) REFERENCES users(id)
  );
  `)
  console.log('[sqlite] Using better-sqlite3 at', dbPath)
} catch (e) {
  console.info('[sqlite] better-sqlite3 not available; using JSON store for dev:', e?.message || e)
  for (const p of Object.values(fallbacks)) {
    if (!fs.existsSync(p)) fs.writeFileSync(p, '[]')
  }
}

export { db }

export function getUserByEmail(email) {
  if (db) {
    const stmt = db.prepare('SELECT * FROM users WHERE email = ?')
    return stmt.get(email)
  }
  const arr = JSON.parse(fs.readFileSync(fallbacks.users, 'utf-8'))
  return arr.find(u => u.email === email)
}

export function createUser({ email, password, role }) {
  const hash = bcrypt.hashSync(password, 10)
  const now = new Date().toISOString()
  if (db) {
    const stmt = db.prepare('INSERT INTO users (email, password_hash, role, created_at) VALUES (?, ?, ?, ?)')
    const info = stmt.run(email, hash, role, now)
    return { id: info.lastInsertRowid, email, role, created_at: now }
  }
  const arr = JSON.parse(fs.readFileSync(fallbacks.users, 'utf-8'))
  const id = (arr[arr.length - 1]?.id || 0) + 1
  const record = { id, email, password_hash: hash, role, created_at: now }
  arr.push(record)
  fs.writeFileSync(fallbacks.users, JSON.stringify(arr, null, 2))
  return { id, email, role, created_at: now }
}

export function verifyPassword(user, password) {
  if (!user) return false
  return bcrypt.compareSync(password, user.password_hash)
}

export function getSuperAdmin() {
  if (db) {
    const stmt = db.prepare("SELECT * FROM users WHERE role = 'super_admin' LIMIT 1")
    return stmt.get()
  }
  const arr = JSON.parse(fs.readFileSync(fallbacks.users, 'utf-8'))
  return arr.find(u => u.role === 'super_admin')
}

export function seedDefaultSuperAdmin() {
  const existing = getSuperAdmin()
  if (existing) return existing
  const email = process.env.SUPERADMIN_EMAIL || 'admin@example.com'
  const password = process.env.SUPERADMIN_PASSWORD || 'admin123'
  return createUser({ email, password, role: 'super_admin' })
}

export function createOrganization({ name, managerId }) {
  const now = new Date().toISOString()
  if (db) {
    const stmt = db.prepare('INSERT INTO organizations (name, manager_id, created_at) VALUES (?, ?, ?)')
    const info = stmt.run(name, managerId || null, now)
    return { id: info.lastInsertRowid, name, manager_id: managerId || null, created_at: now }
  }
  const arr = JSON.parse(fs.readFileSync(fallbacks.orgs, 'utf-8'))
  const id = (arr[arr.length - 1]?.id || 0) + 1
  const record = { id, name, manager_id: managerId || null, created_at: now }
  arr.push(record)
  fs.writeFileSync(fallbacks.orgs, JSON.stringify(arr, null, 2))
  return record
}

export function getOrganizationByManagerId(managerId) {
  if (db) {
    // Prefer numeric manager_id mapping; if schema used email string, try fallback
    let stmt = db.prepare('SELECT * FROM organizations WHERE manager_id = ? LIMIT 1')
    let org = stmt.get(managerId)
    if (!org && typeof managerId === 'string') {
      try {
        stmt = db.prepare('SELECT * FROM organizations WHERE manager_id = ? LIMIT 1')
        org = stmt.get(managerId)
      } catch {}
    }
    return org
  }
  const arr = JSON.parse(fs.readFileSync(fallbacks.orgs, 'utf-8'))
  // Support both numeric id and legacy email-based manager_id
  return arr.find(o => o.manager_id === managerId || String(o.manager_id).toLowerCase() === String(managerId).toLowerCase())
}

export function listManagers() {
  if (db) {
    const stmt = db.prepare("SELECT id, email, role, created_at FROM users WHERE role = 'manager'")
    return stmt.all()
  }
  const arr = JSON.parse(fs.readFileSync(fallbacks.users, 'utf-8'))
  return arr.filter(u => u.role === 'manager').map(u => ({ id: u.id, email: u.email, role: u.role, created_at: u.created_at }))
}

// Upsert an employee's password; creates the user if missing with role 'employee'
export function upsertEmployeePassword(email, password) {
  const hash = bcrypt.hashSync(password, 10)
  const now = new Date().toISOString()
  if (db) {
    const getStmt = db.prepare('SELECT * FROM users WHERE email = ?')
    const existing = getStmt.get(email)
    if (existing) {
      const upd = db.prepare('UPDATE users SET password_hash = ? WHERE email = ?')
      upd.run(hash, email)
      return { id: existing.id, email }
    }
    const ins = db.prepare('INSERT INTO users (email, password_hash, role, created_at) VALUES (?, ?, ?, ?)')
    const info = ins.run(email, hash, 'employee', now)
    return { id: info.lastInsertRowid, email }
  }
  const arr = JSON.parse(fs.readFileSync(fallbacks.users, 'utf-8'))
  const idx = arr.findIndex(u => u.email === email)
  if (idx >= 0) {
    arr[idx].password_hash = hash
    fs.writeFileSync(fallbacks.users, JSON.stringify(arr, null, 2))
    return { id: arr[idx].id, email }
  }
  const id = (arr[arr.length - 1]?.id || 0) + 1
  const record = { id, email, password_hash: hash, role: 'employee', created_at: now }
  arr.push(record)
  fs.writeFileSync(fallbacks.users, JSON.stringify(arr, null, 2))
  return { id, email }
}

// Delete helpers
export function deleteUserById(id) {
  if (db) {
    const del = db.prepare("DELETE FROM users WHERE id = ?")
    const info = del.run(id)
    return info.changes > 0
  }
  const arr = JSON.parse(fs.readFileSync(fallbacks.users, 'utf-8'))
  const next = arr.filter(u => String(u.id) !== String(id))
  const changed = next.length !== arr.length
  if (changed) fs.writeFileSync(fallbacks.users, JSON.stringify(next, null, 2))
  return changed
}

export function deleteUserByEmail(email) {
  if (db) {
    const del = db.prepare("DELETE FROM users WHERE email = ?")
    const info = del.run(email)
    return info.changes > 0
  }
  const arr = JSON.parse(fs.readFileSync(fallbacks.users, 'utf-8'))
  const next = arr.filter(u => String(u.email).toLowerCase() !== String(email).toLowerCase())
  const changed = next.length !== arr.length
  if (changed) fs.writeFileSync(fallbacks.users, JSON.stringify(next, null, 2))
  return changed
}

export function deleteOrganizationByManagerId(managerId) {
  if (db) {
    const del = db.prepare('DELETE FROM organizations WHERE manager_id = ?')
    const info = del.run(managerId)
    return info.changes > 0
  }
  const arr = JSON.parse(fs.readFileSync(fallbacks.orgs, 'utf-8'))
  const next = arr.filter(o => String(o.manager_id) !== String(managerId))
  const changed = next.length !== arr.length
  if (changed) fs.writeFileSync(fallbacks.orgs, JSON.stringify(next, null, 2))
  return changed
}