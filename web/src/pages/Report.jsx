import React, { useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import Nav from '../components/Nav.jsx'

const API = import.meta.env.VITE_API_URL || 'http://localhost:4000'

export default function Report() {
  const [employees, setEmployees] = useState([])
  const [selectedEmployee, setSelectedEmployee] = useState('')
  const [username, setUsername] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [files, setFiles] = useState([])
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(false)
  const headers = useMemo(() => ({ Authorization: `Bearer ${localStorage.getItem('token')}` }), [])

  useEffect(() => {
    axios.get(`${API}/api/employees`, { headers })
      .then(r => setEmployees(r.data?.users || []))
      .catch(()=> setEmployees([]))
  }, [headers])

  const search = async () => {
    setLoading(true)
    try {
      const employeeId = (username || selectedEmployee || '').trim()
      const params = {}
      if (employeeId) params.employeeId = employeeId
      if (fromDate) params.from = new Date(fromDate).toISOString()
      if (toDate) params.to = new Date(toDate).toISOString()
      const [shotsRes, sessRes] = await Promise.all([
        axios.get(`${API}/api/uploads/query`, { headers, params }),
        axios.get(`${API}/api/work/sessions/range`, { headers, params })
      ])
      setFiles(shotsRes.data?.files || [])
      const list = Array.isArray(sessRes.data?.employees) ? sessRes.data.employees : []
      const one = employeeId ? list.find(e => e.employeeId === employeeId) : null
      setSessions(one ? (one.sessions || []) : [])
    } catch (e) {
      setFiles([])
      setSessions([])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-full">
      <Nav />
      <main className="p-4 space-y-6">
        <div className="flex flex-col md:flex-row md:items-end gap-3">
          <div className="flex-1">
            <h2 className="text-lg font-semibold">Report</h2>
            <p className="text-sm text-gray-700">Filter screenshots and sessions by employee and date range.</p>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="block text-xs text-gray-600">Employee</label>
              <select className="border rounded px-3 py-2 min-w-56" value={selectedEmployee} onChange={e=>setSelectedEmployee(e.target.value)}>
                <option value="">Select employee…</option>
                {employees.map(e => (
                  <option key={e.email} value={e.email}>{e.email}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-600">User name (email)</label>
              <input className="border rounded px-3 py-2 min-w-56" placeholder="employee email" value={username} onChange={e=>setUsername(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs text-gray-600">From</label>
              <input type="date" className="border rounded px-3 py-2" value={fromDate} onChange={e=>setFromDate(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs text-gray-600">To</label>
              <input type="date" className="border rounded px-3 py-2" value={toDate} onChange={e=>setToDate(e.target.value)} />
            </div>
            <button className="px-4 py-2.5 rounded bg-blue-600 text-white" onClick={search}>Search</button>
          </div>
        </div>

        {loading && <div>Loading…</div>}

        <section className="space-y-2">
          <div className="font-semibold">Screenshots</div>
          {files.length === 0 && <div className="text-xs text-gray-600">No screenshots for the selected filters.</div>}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {files.map((f, i) => (
              <div key={i} className="text-center">
                <a href={`${API}/${f.file}`} target="_blank" rel="noreferrer">
                  <img className="w-full h-auto border rounded" src={`${API}/${f.file}`} alt="Screenshot" />
                </a>
                <div className="text-[10px] text-gray-600 mt-1">{new Date(f.ts || '').toLocaleString()}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-2">
          <div className="font-semibold">Sessions</div>
          {sessions.length === 0 && <div className="text-xs text-gray-600">No sessions for the selected filters.</div>}
          {sessions.length > 0 && (
            <div className="overflow-x-auto">
              <table className="min-w-full text-xs">
                <thead>
                  <tr className="text-left">
                    <th className="py-1 pr-3">Date</th>
                    <th className="py-1 pr-3">Start</th>
                    <th className="py-1 pr-3">End</th>
                    <th className="py-1 pr-3">Duration</th>
                    <th className="py-1 pr-3">Idle</th>
                    <th className="py-1 pr-3">Net Active</th>
                    <th className="py-1 pr-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {sessions.map((s, i) => (
                    <tr key={i} className="border-t">
                      <td className="py-1 pr-3">{s.date}</td>
                      <td className="py-1 pr-3">{new Date(s.startedAt).toLocaleString()}</td>
                      <td className="py-1 pr-3">{s.endedAt ? new Date(s.endedAt).toLocaleString() : '-'}</td>
                      <td className="py-1 pr-3">{Math.floor((s.activeSeconds || 0) / 3600).toString().padStart(2,'0') + ':' + Math.floor(((s.activeSeconds || 0) % 3600)/60).toString().padStart(2,'0') + ':' + ((s.activeSeconds || 0) % 60).toString().padStart(2,'0')}</td>
                      <td className="py-1 pr-3">{Math.floor((s.idleSeconds || 0) / 3600).toString().padStart(2,'0') + ':' + Math.floor(((s.idleSeconds || 0) % 3600)/60).toString().padStart(2,'0') + ':' + ((s.idleSeconds || 0) % 60).toString().padStart(2,'0')}</td>
                      <td className="py-1 pr-3">{Math.floor((s.netActiveSeconds || 0) / 3600).toString().padStart(2,'0') + ':' + Math.floor(((s.netActiveSeconds || 0) % 3600)/60).toString().padStart(2,'0') + ':' + ((s.netActiveSeconds || 0) % 60).toString().padStart(2,'0')}</td>
                      <td className="py-1 pr-3">{s.isActive ? 'Active' : 'Closed'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  )
}