import React, { useEffect, useState } from 'react'
import axios from 'axios'
import Nav from '../components/Nav.jsx'
import { resolveApiBase } from '../api.js'

const DEFAULT_API = import.meta.env.VITE_API_URL || 'http://localhost:4000'

export default function Admin() {
  const [email, setEmail] = useState('manager@example.com')
  const [password, setPassword] = useState('secret')
  const [orgName, setOrgName] = useState('')
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')
  const [managers, setManagers] = useState([])
  const [logs, setLogs] = useState([])
  const [filterManagerId, setFilterManagerId] = useState('')
  const [filterEmployeeId, setFilterEmployeeId] = useState('')
  const [employees, setEmployees] = useState([])
  const [cleanupFrom, setCleanupFrom] = useState('')
  const [cleanupTo, setCleanupTo] = useState('')
  const [cleanupMsg, setCleanupMsg] = useState('')
  const [cleanupErr, setCleanupErr] = useState('')

  const submit = async (e) => {
    e.preventDefault()
    setMsg(''); setError('')
    try {
      const token = localStorage.getItem('token')
      const headers = { Authorization: `Bearer ${token}` }
      const BASE = await resolveApiBase()
      if (!orgName || !orgName.trim()) { setError('Team name is required'); return }
      const r = await axios.post(`${BASE}/api/admin/managers`, { email, password, orgName }, { headers })
      setMsg(`Manager ${r.data?.manager?.email} created${r.data?.organization ? ' with team '+r.data.organization.name : ''}.`)
      setEmail(''); setPassword(''); setOrgName('')
      // refresh managers
      loadManagers()
    } catch (e) {
      setError(e?.response?.data?.error || e.message)
    }
  }

  const cleanupScreenshots = async () => {
    setCleanupMsg(''); setCleanupErr('')
    try {
      const token = localStorage.getItem('token')
      const headers = { Authorization: `Bearer ${token}` }
      const toStartISO = (ds) => {
        if (!ds) return null
        const base = new Date(`${ds}T00:00:00`)
        return new Date(base).toISOString()
      }
      const toEndISO = (ds) => {
        if (!ds) return null
        const base = new Date(`${ds}T00:00:00`)
        const end = new Date(base.getTime() + 24*60*60*1000 - 1)
        return end.toISOString()
      }
      const body = { from: cleanupFrom ? toStartISO(cleanupFrom) : null, to: cleanupTo ? toEndISO(cleanupTo) : null }
      const BASE = await resolveApiBase()
      const r = await axios.post(`${BASE}/api/uploads/cleanup`, body, { headers })
      const removed = r.data?.removed || 0
      const bytes = r.data?.bytesFreed || 0
      setCleanupMsg(`Deleted ${removed} file(s), freed ${(bytes/1024/1024).toFixed(2)} MB`)
      setTimeout(() => setCleanupMsg(''), 5000)
    } catch (e) {
      setCleanupErr(e?.response?.data?.error || e.message)
      setTimeout(() => setCleanupErr(''), 5000)
    }
  }

  const loadManagers = async () => {
    try {
      const token = localStorage.getItem('token')
      const headers = { Authorization: `Bearer ${token}` }
      const BASE = await resolveApiBase()
      const r = await axios.get(`${BASE}/api/admin/managers`, { headers })
      setManagers(r.data?.managers || [])
    } catch {}
  }

  const loadEmployees = async () => {
    try {
      const token = localStorage.getItem('token')
      const headers = { Authorization: `Bearer ${token}` }
      const BASE = await resolveApiBase()
      const r = await axios.get(`${BASE}/api/employees`, { headers })
      setEmployees(r.data?.users || [])
    } catch {}
  }

  const loadLogs = async () => {
    try {
      const token = localStorage.getItem('token')
      const headers = { Authorization: `Bearer ${token}` }
      const params = {}
      if (filterManagerId) params.managerId = filterManagerId
      if (filterEmployeeId) params.employeeId = filterEmployeeId
      const BASE = await resolveApiBase()
      const r = await axios.get(`${BASE}/api/admin/audit-logs`, { headers, params })
      setLogs(r.data?.logs || [])
    } catch {}
  }

  useEffect(() => {
    loadManagers()
    loadLogs()
    loadEmployees()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    loadLogs()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterManagerId, filterEmployeeId])

  const removeManager = async (id) => {
    setMsg(''); setError('')
    try {
      const token = localStorage.getItem('token')
      const headers = { Authorization: `Bearer ${token}` }
      const BASE = await resolveApiBase()
      await axios.delete(`${BASE}/api/admin/managers/${id}`, { headers })
      setMsg('Manager removed')
      loadManagers()
    } catch (e) {
      setError(e?.response?.data?.error || e.message)
    }
  }

  const removeEmployee = async (email) => {
    setMsg(''); setError('')
    try {
      const token = localStorage.getItem('token')
      const headers = { Authorization: `Bearer ${token}` }
      const BASE = await resolveApiBase()
      await axios.delete(`${BASE}/api/employees/${encodeURIComponent(email)}`, { headers })
      setMsg('Employee removed')
      loadEmployees()
    } catch (e) {
      setError(e?.response?.data?.error || e.message)
    }
  }

  return (
    <div className="min-h-full">
      <Nav />
      <main className="p-4 space-y-6">
        <h2 className="text-lg font-semibold">Super Admin</h2>
        <p className="text-sm text-gray-700">Create manager accounts and assign teams.</p>
        {error && <div className="text-red-600 text-sm">{error}</div>}
        {msg && <div className="text-blue-700 text-sm">{msg}</div>}

        <section className="bg-white border rounded p-4">
          <div className="font-semibold mb-2">Storage Cleanup</div>
          <div className="text-sm text-gray-700 mb-2">Delete screenshots between dates. User records and sessions are not affected.</div>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="block text-xs text-gray-600">From</label>
              <input type="date" className="border rounded px-3 py-2" value={cleanupFrom} onChange={e=>setCleanupFrom(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs text-gray-600">To</label>
              <input type="date" className="border rounded px-3 py-2" value={cleanupTo} onChange={e=>setCleanupTo(e.target.value)} />
            </div>
            <button className="px-3 py-2 rounded bg-red-600 text-white" onClick={cleanupScreenshots}>Delete Screenshots</button>
          </div>
          {cleanupErr && <div className="text-red-600 text-sm mt-2">{cleanupErr}</div>}
          {cleanupMsg && <div className="text-green-700 text-sm mt-2">{cleanupMsg}</div>}
        </section>

        <section className="bg-white border rounded p-4">
          <div className="font-semibold mb-2">Create Manager</div>
          <form className="space-y-3" onSubmit={submit}>
            <div className="flex gap-3">
              <input className="border rounded px-3 py-2 flex-1" placeholder="Manager email" value={email} onChange={e=>setEmail(e.target.value)} />
              <input className="border rounded px-3 py-2 flex-1" type="password" placeholder="Password" value={password} onChange={e=>setPassword(e.target.value)} />
            </div>
            <div>
              <input className="border rounded px-3 py-2 w-full" placeholder="Team name" value={orgName} onChange={e=>setOrgName(e.target.value)} />
            </div>
            <div>
              <button className="px-3 py-2 rounded bg-blue-600 text-white" type="submit">Create Manager</button>
            </div>
          </form>
        </section>

        <section className="bg-white border rounded p-4">
          <div className="font-semibold mb-2">Managers Overview</div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left border-b">
                  <th className="py-2 px-2">Manager</th>
                  <th className="py-2 px-2">Team</th>
                  <th className="py-2 px-2">Employees</th>
                  <th className="py-2 px-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {managers.map(m => (
                  <tr key={m.id} className="border-b">
                    <td className="py-2 px-2">{m.email}</td>
                    <td className="py-2 px-2">{m.organization?.name || '-'}</td>
                    <td className="py-2 px-2">{m.employeeCount}</td>
                    <td className="py-2 px-2">
                      <button className="px-2 py-1 rounded bg-red-600 text-white" onClick={()=>removeManager(m.id)}>Remove</button>
                    </td>
                  </tr>
                ))}
                {managers.length === 0 && (
                  <tr><td className="py-2 px-2 text-gray-600" colSpan="3">No managers yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="bg-white border rounded p-4">
          <div className="font-semibold mb-2">Employees</div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left border-b">
                  <th className="py-2 px-2">Email</th>
                  <th className="py-2 px-2">Name</th>
                  <th className="py-2 px-2">Manager</th>
                  <th className="py-2 px-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {employees.map((u, i) => (
                  <tr key={i} className="border-b">
                    <td className="py-2 px-2">{u.email}</td>
                    <td className="py-2 px-2">{u.name || '-'}</td>
                    <td className="py-2 px-2">{u.managerId || '-'}</td>
                    <td className="py-2 px-2">
                      <button className="px-2 py-1 rounded bg-red-600 text-white" onClick={()=>removeEmployee(u.email)}>Remove</button>
                    </td>
                  </tr>
                ))}
                {employees.length === 0 && (
                  <tr><td className="py-2 px-2 text-gray-600" colSpan="4">No employees.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="bg-white border rounded p-4">
          <div className="font-semibold mb-2">Audit Logs</div>
          <div className="flex items-end gap-3 mb-3">
            <div>
              <label className="block text-xs text-gray-600">Filter by Manager ID</label>
              <input className="border rounded px-3 py-2" placeholder="manager id/email" value={filterManagerId} onChange={e=>setFilterManagerId(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs text-gray-600">Filter by Employee</label>
              <input className="border rounded px-3 py-2" placeholder="employee email" value={filterEmployeeId} onChange={e=>setFilterEmployeeId(e.target.value)} />
            </div>
            <button className="px-3 py-2 rounded bg-gray-700 text-white" onClick={loadLogs}>Refresh</button>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead>
                <tr className="text-left border-b">
                  <th className="py-2 px-2">Time</th>
                  <th className="py-2 px-2">Actor</th>
                  <th className="py-2 px-2">Type</th>
                  <th className="py-2 px-2">Employee</th>
                  <th className="py-2 px-2">Details</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((l, i) => (
                  <tr key={i} className="border-b">
                    <td className="py-2 px-2">{new Date(l.ts || l.time || Date.now()).toLocaleString()}</td>
                    <td className="py-2 px-2">{l.details?.actorId || '-'}</td>
                    <td className="py-2 px-2">{l.type}</td>
                    <td className="py-2 px-2">{l.details?.employeeId || '-'}</td>
                    <td className="py-2 px-2">{l.details?.intervalMinutes ? `${l.details.intervalMinutes}m` : '-'}</td>
                  </tr>
                ))}
                {logs.length === 0 && (
                  <tr><td className="py-2 px-2 text-gray-600" colSpan="5">No logs.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  )
}
