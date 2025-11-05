import React, { useEffect, useState } from 'react'
import axios from 'axios'
import Nav from '../components/Nav.jsx'

const API = import.meta.env.VITE_API_URL || 'http://localhost:4000'

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

  const submit = async (e) => {
    e.preventDefault()
    setMsg(''); setError('')
    try {
      const token = localStorage.getItem('token')
      const headers = { Authorization: `Bearer ${token}` }
      const r = await axios.post(`${API}/api/admin/managers`, { email, password, orgName }, { headers })
      setMsg(`Manager ${r.data?.manager?.email} created${r.data?.organization ? ' with org '+r.data.organization.name : ''}.`)
      setEmail(''); setPassword(''); setOrgName('')
      // refresh managers
      loadManagers()
    } catch (e) {
      setError(e?.response?.data?.error || e.message)
    }
  }

  const loadManagers = async () => {
    try {
      const token = localStorage.getItem('token')
      const headers = { Authorization: `Bearer ${token}` }
      const r = await axios.get(`${API}/api/admin/managers`, { headers })
      setManagers(r.data?.managers || [])
    } catch {}
  }

  const loadLogs = async () => {
    try {
      const token = localStorage.getItem('token')
      const headers = { Authorization: `Bearer ${token}` }
      const params = {}
      if (filterManagerId) params.managerId = filterManagerId
      if (filterEmployeeId) params.employeeId = filterEmployeeId
      const r = await axios.get(`${API}/api/admin/audit-logs`, { headers, params })
      setLogs(r.data?.logs || [])
    } catch {}
  }

  useEffect(() => {
    loadManagers()
    loadLogs()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    loadLogs()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterManagerId, filterEmployeeId])

  return (
    <div className="min-h-full">
      <Nav />
      <main className="p-4 space-y-6">
        <h2 className="text-lg font-semibold">Super Admin</h2>
        <p className="text-sm text-gray-700">Create manager accounts and assign organizations.</p>
        {error && <div className="text-red-600 text-sm">{error}</div>}
        {msg && <div className="text-blue-700 text-sm">{msg}</div>}

        <section className="bg-white border rounded p-4">
          <div className="font-semibold mb-2">Create Manager</div>
          <form className="space-y-3" onSubmit={submit}>
            <div className="flex gap-3">
              <input className="border rounded px-3 py-2 flex-1" placeholder="Manager email" value={email} onChange={e=>setEmail(e.target.value)} />
              <input className="border rounded px-3 py-2 flex-1" type="password" placeholder="Password" value={password} onChange={e=>setPassword(e.target.value)} />
            </div>
            <div>
              <input className="border rounded px-3 py-2 w-full" placeholder="Organization name (optional)" value={orgName} onChange={e=>setOrgName(e.target.value)} />
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
                  <th className="py-2 px-2">Organization</th>
                  <th className="py-2 px-2">Employees</th>
                </tr>
              </thead>
              <tbody>
                {managers.map(m => (
                  <tr key={m.id} className="border-b">
                    <td className="py-2 px-2">{m.email}</td>
                    <td className="py-2 px-2">{m.organization?.name || '-'}</td>
                    <td className="py-2 px-2">{m.employeeCount}</td>
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