import React from 'react'
import { useEffect, useRef, useState } from 'react'
import axios from 'axios'
import { resolveApiBase } from '../api.js'
import Nav from '../components/Nav.jsx'
import { getSocket } from '../socket.js'
// presence is driven via Socket.IO events from backend

let API = import.meta.env.VITE_API_URL || 'http://localhost:4000'

export default function LiveView() {
  const [employeeId, setEmployeeId] = useState('')
  const [onlineEmployees, setOnlineEmployees] = useState([])
  const [filteredOnline, setFilteredOnline] = useState([])
  const [allEmployees, setAllEmployees] = useState([])
  const [managers, setManagers] = useState([])
  const [selectedManager, setSelectedManager] = useState('')
  const [status, setStatus] = useState('idle') // idle | active | offline
  const [frames, setFrames] = useState([]) // [{b64, ts}]
  const [assignedIntervalSec, setAssignedIntervalSec] = useState(null)
  const [assignMinutes, setAssignMinutes] = useState('3')
  const [assignMsg, setAssignMsg] = useState('')
  const [assignErr, setAssignErr] = useState('')
  const socketRef = useRef(null)

  // Rehydrate previously selected employee so streaming persists across tabs
  useEffect(() => {
    const saved = localStorage.getItem('liveview_employee')
    if (saved) setEmployeeId(saved)
  }, [])

  useEffect(() => {
    resolveApiBase().then(base => { API = base })
    // Use shared socket instance so connection persists across route changes
    const s = getSocket()
    socketRef.current = s
    s.on('live_view:frame', (payload) => {
      if (payload?.employeeId === employeeId) {
        const item = { b64: payload.frameBase64, ts: payload.ts || new Date().toISOString() }
        setFrames(prev => [item, ...prev].slice(0, 50))
        setStatus('active')
      }
    })
    s.on('live_view:terminate', (payload) => {
      if (payload?.by === employeeId || status === 'active') {
        setStatus('idle')
      }
    })
    // Presence events
    s.on('presence:list', ({ users }) => {
      const list = Array.isArray(users) ? users : []
      setOnlineEmployees(list)
      if (!employeeId && list.length) setEmployeeId(list[0])
    })
    s.on('presence:online', ({ userId }) => {
      setOnlineEmployees(prev => Array.from(new Set([userId, ...prev])))
    })
    s.on('presence:offline', ({ userId }) => {
      setOnlineEmployees(prev => prev.filter(u => u !== userId))
      if (employeeId === userId) setStatus('idle')
    })
    // Do NOT disconnect on unmount; only remove listeners
    return () => {
      s.off('live_view:frame')
      s.off('live_view:terminate')
      s.off('presence:list')
      s.off('presence:online')
      s.off('presence:offline')
    }
  }, [employeeId])

  // Load employees and managers for super admin team switcher
  useEffect(() => {
    const token = localStorage.getItem('token')
    const headers = { Authorization: `Bearer ${token}` }
    resolveApiBase().then((BASE)=>{
      axios.get(`${BASE}/api/employees`, { headers }).then(r => setAllEmployees(r.data?.users || [])).catch(()=>{})
    })
    let role = ''
    try { const payload = JSON.parse(atob((token || '').split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))); role = payload?.role } catch {}
    if (role === 'super_admin') {
      resolveApiBase().then((BASE)=>{
        axios.get(`${BASE}/api/admin/managers`, { headers }).then(r => setManagers(r.data?.managers || [])).catch(()=>{})
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Apply filter to online employees when manager selected
  useEffect(() => {
    if (!selectedManager) { setFilteredOnline(onlineEmployees); return }
    const team = allEmployees.filter(e => String(e.managerId || '') === String(selectedManager))
      .map(e => e.email)
    const filtered = onlineEmployees.filter(e => team.includes(e))
    setFilteredOnline(filtered)
  }, [selectedManager, onlineEmployees, allEmployees, managers])

  // Auto-start live view when selecting an employee
  useEffect(() => {
    if (employeeId) {
      // persist selection across navigation
      localStorage.setItem('liveview_employee', employeeId)
      setFrames([])
      setStatus('idle')
      // Keep viewer room joined even if route changes; emit start idempotently
      socketRef.current?.emit('live_view:start', { employeeId })
      // Fetch current assigned interval for selected employee
      const token = localStorage.getItem('token')
      const headers = { Authorization: `Bearer ${token}` }
      resolveApiBase().then((BASE)=>axios.get(`${BASE}/api/capture-interval`, { headers, params: { employeeId } }))
        .then(r => {
          if (r.data?.assigned) {
            setAssignedIntervalSec(r.data.intervalSeconds || null)
          } else {
            setAssignedIntervalSec(null)
          }
        })
        .catch(() => setAssignedIntervalSec(null))
    }
  }, [employeeId])

  const start = () => {
    setStatus('idle')
    setFrames([])
    socketRef.current?.emit('live_view:start', { employeeId })
  }
  const stop = () => {
    socketRef.current?.emit('live_view:stop', { employeeId })
    setStatus('idle')
  }

  const assignInterval = async () => {
    if (!employeeId) return
    setAssignMsg(''); setAssignErr('')
    try {
      const token = localStorage.getItem('token')
      const headers = { Authorization: `Bearer ${token}` }
      const mins = Number(assignMinutes)
      const BASE = await resolveApiBase()
      const r = await axios.post(`${BASE}/api/capture-interval`, { employeeId, intervalMinutes: mins }, { headers })
      const secs = r.data?.intervalSeconds
      setAssignedIntervalSec(secs || null)
      setAssignMsg(`Assigned ${mins} minute(s) to ${employeeId}`)
    } catch (e) {
      setAssignErr(e?.response?.data?.error || e.message)
    }
  }

  const latest = frames[0]

  return (
    <div className="min-h-full bg-gradient-to-b from-slate-50 to-white">
      <Nav />
      <main className="max-w-6xl mx-auto px-6 md:px-10 py-6 md:py-10 space-y-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <h2 className="text-2xl md:text-3xl font-bold">Live View</h2>
            <p className="text-gray-700">Monitor an employee’s current activity in real-time.</p>
          </div>
          <div className="flex items-end gap-2 flex-wrap">
            {managers.length > 0 && (
              <div>
                <label className="block text-sm">Team Switcher (Super Admin)</label>
                <select className="border rounded px-3 py-2 min-w-64" value={selectedManager} onChange={e=>setSelectedManager(e.target.value)}>
                  <option value="">All Managers</option>
                  {managers.map(m => (
                    <option key={m.id} value={m.id}>{m.email} ({m.organization?.name || '-'})</option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label className="block text-sm">Employees</label>
              <select className="border rounded px-3 py-2 min-w-64"
                value={employeeId}
                onChange={e=>setEmployeeId(e.target.value)}>
                <option value="">Select employee…</option>
                {(() => {
                  const online = filteredOnline.length ? filteredOnline : onlineEmployees;
                  const options = online.length ? online : allEmployees.map(e => e.email);
                  return options.map(email => (
                    <option key={email} value={email}>{email}</option>
                  ))
                })()}
              </select>
              {selectedManager && filteredOnline.length === 0 && onlineEmployees.length > 0 && (
                <div className="text-xs text-gray-600 mt-1">No online employees for this manager yet.</div>
              )}
              {!selectedManager && onlineEmployees.length === 0 && (
                <div className="text-xs text-gray-600 mt-1">No one is online. You can still select an employee; frames will appear as screenshots arrive.</div>
              )}
            </div>
            <button className="px-4 py-2.5 rounded bg-green-600 text-white hover:bg-green-700" onClick={start}>Start</button>
            <button className="px-4 py-2.5 rounded bg-gray-700 text-white hover:bg-gray-800" onClick={stop}>Stop</button>
            <div className="ml-4">
              <label className="block text-sm">Assign Capture Interval</label>
              <div className="flex items-center gap-2">
                <select className="border rounded px-3 py-2"
                  value={assignMinutes}
                  onChange={e=>setAssignMinutes(e.target.value)}>
                  <option value="1">1 minutes</option>
                  <option value="2">2 minutes</option>
                  <option value="3">3 minutes</option>
                  <option value="4">4 minutes</option>
                  <option value="5">5 minutes</option>
                  <option value="8">8 minutes</option>
                  <option value="10">10 minutes</option>
                  <option value="15">15 minutes</option>
                  <option value="20">20 minutes</option>
                </select>
                <button className="px-3 py-2 rounded bg-blue-600 text-white hover:bg-blue-700" onClick={assignInterval} disabled={!employeeId}>Assign</button>
              </div>
              <div className="text-xs mt-1 text-gray-600">
                {assignedIntervalSec ? (
                  <span>Current: {Math.round(assignedIntervalSec/60)} minute(s)</span>
                ) : (
                  <span>No interval assigned</span>
                )}
              </div>
              {assignMsg && <div className="text-xs text-green-700 mt-1">{assignMsg}</div>}
              {assignErr && <div className="text-xs text-red-600 mt-1">{assignErr}</div>}
            </div>
          </div>
        </div>

        {/* Status + Viewer */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          <div className="lg:col-span-2">
            <div className="rounded-xl border bg-white overflow-hidden">
              <div className="flex items-center justify-between p-3 border-b">
                <div className="text-sm text-gray-700">Session Status: {status === 'active' ? 'Active' : 'Idle'}</div>
                <div className={`text-xs px-2 py-1 rounded ${status==='active'?'bg-green-100 text-green-700':'bg-gray-100 text-gray-700'}`}>{status==='active'?'Streaming':'Not streaming'}</div>
              </div>
              <div className="aspect-video bg-gray-100 grid place-items-center">
                {latest ? (
                  <div className="relative w-full h-full">
                    <img className="w-full h-full object-contain" src={`data:image/jpeg;base64,${latest.b64}`} alt="Live frame" />
                    <div className="absolute bottom-2 right-2 text-xs bg-black/60 text-white px-2 py-1 rounded">{new Date(latest.ts).toLocaleString()}</div>
                  </div>
                ) : (
                  <div className="text-sm text-gray-600">No live frames yet. Click Start to initiate.</div>
                )}
              </div>
            </div>
          </div>
          <div>
            <div className="rounded-xl border bg-white p-3">
              <div className="font-semibold">Frame History</div>
              <div className="mt-3 grid grid-cols-3 gap-2">
                {frames.slice(0, 12).map((f, i) => (
                  <div key={i} className="text-center">
                    <img className="w-full h-auto border rounded" src={`data:image/jpeg;base64,${f.b64}`} />
                    <div className="text-[10px] text-gray-600 mt-1">{new Date(f.ts).toLocaleString()}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-6 text-xs text-gray-600">
              Streaming is authenticated via JWT. For production, use HTTPS/WSS to ensure encryption in transit.
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}