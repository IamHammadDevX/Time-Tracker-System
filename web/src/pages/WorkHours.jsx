import React, { useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import Nav from '../components/Nav.jsx'

const API = import.meta.env.VITE_API_URL || 'http://localhost:4000'
const allowedMinutes = [2, 3, 4, 5, 6, 8, 10, 12, 15, 20]

export default function WorkHours() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [employees, setEmployees] = useState([])
  const [summaryByEmp, setSummaryByEmp] = useState({})
  const [sessionsByEmp, setSessionsByEmp] = useState({})
  const [shotsByEmp, setShotsByEmp] = useState({})
  const [intervalsByEmp, setIntervalsByEmp] = useState({})
  const [assignMinutesByEmp, setAssignMinutesByEmp] = useState({})
  const [assignMsg, setAssignMsg] = useState('')
  const [expanded, setExpanded] = useState({})

  const headers = useMemo(() => {
    const token = localStorage.getItem('token')
    return { Authorization: `Bearer ${token}` }
  }, [])

  useEffect(() => {
    // Load employees, today summary, recent screenshots
    const getEmployees = axios.get(`${API}/api/employees`, { headers })
      .then(r => setEmployees(r.data.users || []))
    const getSummary = axios.get(`${API}/api/work/summary/today`, { headers })
      .then(r => {
        const by = {}
        const list = Array.isArray(r.data?.employees) ? r.data.employees : []
        list.forEach(e => { by[e.employeeId] = e })
        setSummaryByEmp(by)
      })
    const getSessions = axios.get(`${API}/api/work/sessions/today`, { headers })
      .then(r => {
        const by = {}
        const list = Array.isArray(r.data?.employees) ? r.data.employees : []
        list.forEach(e => { by[e.employeeId] = Array.isArray(e.sessions) ? e.sessions : [] })
        setSessionsByEmp(by)
      })
    const getActivity = axios.get(`${API}/api/activity/recent`, { headers })
      .then(r => {
        const by = {}
        const list = Array.isArray(r.data?.employees) ? r.data.employees : []
        list.forEach(e => { by[e.employeeId] = e })
        setShotsByEmp(by)
      })
    Promise.allSettled([getEmployees, getSummary, getSessions, getActivity])
      .then(results => {
        const failed = results.filter(r => r.status === 'rejected')
        if (failed.length) {
          const reason = failed[0]?.reason
          setError(reason?.response?.data?.error || reason?.message || 'Failed to load some data')
        }
      })
      .finally(() => setLoading(false))
  }, [headers])

  useEffect(() => {
    // After employees loaded, fetch intervals for each
    if (!employees.length) return
    const run = async () => {
      const out = {}
      for (const emp of employees) {
        try {
          const r = await axios.get(`${API}/api/capture-interval`, { headers, params: { employeeId: emp.email } })
          out[emp.email] = r.data?.intervalSeconds || null
        } catch {
          out[emp.email] = null
        }
      }
      setIntervalsByEmp(out)
      // initialize assign minutes dropdowns based on current interval or default 3
      const mins = {}
      for (const emp of employees) {
        const sec = out[emp.email]
        mins[emp.email] = sec ? String(Math.round(sec / 60)) : '3'
      }
      setAssignMinutesByEmp(mins)
    }
    run()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employees])

  const updateInterval = async (employeeId) => {
    setAssignMsg('')
    const minutes = Number(assignMinutesByEmp[employeeId] || 3)
    try {
      await axios.post(`${API}/api/capture-interval`, { employeeId, intervalMinutes: minutes }, { headers })
      const secs = minutes * 60
      setIntervalsByEmp(prev => ({ ...prev, [employeeId]: secs }))
      setAssignMsg(`Updated interval for ${employeeId} to ${minutes} minutes.`)
      setTimeout(() => setAssignMsg(''), 3000)
    } catch (e) {
      setAssignMsg(e?.response?.data?.error || e.message)
      setTimeout(() => setAssignMsg(''), 5000)
    }
  }

  const fmtSeconds = (sec) => {
    const s = Math.max(0, Number(sec) || 0)
    const h = Math.floor(s / 3600)
    const m = Math.floor((s % 3600) / 60)
    const r = s % 60
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(r).padStart(2,'0')}`
  }
  const fmtTime = (iso) => {
    try { return new Date(iso).toLocaleString() } catch { return iso || '' }
  }
  const firstLogin = (sum) => (sum?.loginTimes || []).length ? sum.loginTimes[0] : null
  const lastLogout = (sum) => (sum?.logoutTimes || []).length ? sum.logoutTimes[sum.logoutTimes.length - 1] : null

  return (
    <div className="min-h-full bg-gradient-to-b from-slate-50 to-white">
      <Nav />
      <main className="max-w-6xl mx-auto px-6 md:px-10 py-6 md:py-10 space-y-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <h2 className="text-2xl md:text-3xl font-bold">Activity Timing &amp; Work Hours Tracking</h2>
            <p className="text-gray-700">Per-employee login/logout, active vs idle time, screenshots, and capture intervals.</p>
          </div>
        </div>

        {error && <div className="text-red-600 text-sm">{error}</div>}
        {loading && <div>Loading…</div>}
        {assignMsg && <div className="text-sm text-blue-700">{assignMsg}</div>}

        <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {employees.length === 0 && !loading && (
            <div className="text-sm text-gray-700">No employees configured. Go to Setup to add employees.</div>
          )}
          {employees.map(emp => {
            const id = emp.email
            const sum = summaryByEmp[id]
            const shots = shotsByEmp[id]
            const intervalSecs = intervalsByEmp[id]
            const totalActive = sum?.totalActiveSeconds || 0
            const totalIdle = sum?.totalIdleSeconds || 0
            const netActive = sum ? Math.max(0, sum.totalActiveSeconds - sum.totalIdleSeconds) : 0
            const sessions = sessionsByEmp[id] || []
            return (
              <div key={id} className="rounded-xl border bg-white p-4 shadow-sm space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="font-semibold">{emp.name || id}</div>
                    <div className="text-xs text-gray-600">{id}</div>
                  </div>
                  <button className="px-2 py-1 rounded text-xs border hover:bg-gray-50" onClick={() => setExpanded(prev => ({ ...prev, [id]: !prev[id] }))}>
                    {expanded[id] ? 'Hide Details' : 'Show Details'}
                  </button>
                </div>

                {/* Interval config */}
                <div className="space-y-1">
                  <div className="text-sm text-gray-700">Capture Interval: {intervalSecs ? `${Math.round(intervalSecs/60)} min` : 'Not assigned'}</div>
                  <div className="flex items-center gap-2">
                    <select className="border rounded px-2 py-1 text-sm"
                      value={assignMinutesByEmp[id] || '3'}
                      onChange={e => setAssignMinutesByEmp(prev => ({ ...prev, [id]: e.target.value }))}
                    >
                      {allowedMinutes.map(m => <option key={m} value={m}>{m} minutes</option>)}
                    </select>
                    <button className="px-3 py-1.5 rounded bg-blue-600 text-white text-sm hover:bg-blue-700" onClick={() => updateInterval(id)}>Update</button>
                  </div>
                </div>

                {/* Work hours summary */}
                <div className="space-y-1">
                  <div className="font-semibold">Today’s Work Hours</div>
                  {!sum && (
                    <div className="text-sm text-gray-600">No work sessions yet today.</div>
                  )}
                  {sum && (
                    <div className="text-sm text-gray-700">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="inline-flex items-center px-2 py-0.5 rounded bg-green-50 text-green-700 border">Active: {fmtSeconds(totalActive)}</span>
                        <span className="inline-flex items-center px-2 py-0.5 rounded bg-yellow-50 text-yellow-700 border">Idle: {fmtSeconds(totalIdle)}</span>
                        <span className="inline-flex items-center px-2 py-0.5 rounded bg-blue-50 text-blue-700 border">Net: {fmtSeconds(netActive)}</span>
                      </div>
                      <div className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <div>
                          <div className="text-xs text-gray-600">First Login</div>
                          <div className="text-xs">{firstLogin(sum) ? fmtTime(firstLogin(sum)) : '-'}</div>
                        </div>
                        <div>
                          <div className="text-xs text-gray-600">Last Logout</div>
                          <div className="text-xs">{lastLogout(sum) ? fmtTime(lastLogout(sum)) : (sessions.some(s=>s.isActive) ? 'Active' : '-')}</div>
                        </div>
                        <div>
                          <div className="text-xs text-gray-600">Sessions Today</div>
                          <div className="text-xs">{sessions.length}</div>
                        </div>
                      </div>
                      <div className="mt-2">
                        <div className="text-xs text-gray-600">Logins</div>
                        <ul className="text-xs list-disc pl-4 space-y-0.5">
                          {(sum.loginTimes || []).map((t, i) => <li key={i}>{fmtTime(t)}</li>)}
                        </ul>
                      </div>
                      <div className="mt-2">
                        <div className="text-xs text-gray-600">Logouts</div>
                        <ul className="text-xs list-disc pl-4 space-y-0.5">
                          {(sum.logoutTimes || []).map((t, i) => <li key={i}>{fmtTime(t)}</li>)}
                        </ul>
                      </div>
                    </div>
                  )}
                </div>

                {/* Per-session details */}
                {expanded[id] && (
                  <div className="space-y-2">
                    <div className="font-semibold">Session Details</div>
                    {sessions.length === 0 && (
                      <div className="text-xs text-gray-600">No sessions today.</div>
                    )}
                    {sessions.length > 0 && (
                      <div className="overflow-x-auto">
                        <table className="min-w-full text-xs">
                          <thead>
                            <tr className="text-left">
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
                                <td className="py-1 pr-3">{fmtTime(s.startedAt)}</td>
                                <td className="py-1 pr-3">{s.endedAt ? fmtTime(s.endedAt) : '-'}</td>
                                <td className="py-1 pr-3">{fmtSeconds(s.activeSeconds)}</td>
                                <td className="py-1 pr-3">{fmtSeconds(s.idleSeconds)}</td>
                                <td className="py-1 pr-3">{fmtSeconds(s.netActiveSeconds)}</td>
                                <td className="py-1 pr-3">{s.isActive ? 'Active' : 'Closed'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}

                {/* Recent screenshots with timestamps */}
                <div>
                  <div className="font-semibold">Recent Screenshots</div>
                  {!shots && <div className="text-xs text-gray-600">No screenshots yet.</div>}
                  {shots && (
                    <div className="grid grid-cols-3 gap-2 mt-2">
                      {(Array.isArray(shots?.latest) ? shots.latest : []).map((f, i) => (
                        <div key={i} className="text-center">
                          <a href={`${API}/${f.file}`} target="_blank" rel="noreferrer">
                            <img className="w-full h-24 object-cover border rounded" src={`${API}/${f.file}`} alt="Screenshot" />
                          </a>
                          <div className="text-[10px] text-gray-600 mt-1">{fmtTime(f.ts)}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </section>
      </main>
    </div>
  )
}