import React from 'react'
import { useEffect, useRef, useState } from 'react'
import Nav from '../components/Nav.jsx'
import { io } from 'socket.io-client'
// presence is driven via Socket.IO events from backend

const API = import.meta.env.VITE_API_URL

export default function LiveView() {
  const [employeeId, setEmployeeId] = useState('employee@example.com')
  const [onlineEmployees, setOnlineEmployees] = useState([])
  const [status, setStatus] = useState('idle') // idle | active | offline
  const [frames, setFrames] = useState([])
  const socketRef = useRef(null)

  useEffect(() => {
    const token = localStorage.getItem('token')
    const s = io(API, { query: { role: 'manager', userId: 'manager@example.com' }, extraHeaders: { Authorization: `Bearer ${token}` } })
    socketRef.current = s
    s.on('live_view:frame', (payload) => {
      if (payload?.employeeId === employeeId) {
        setFrames(prev => [payload.frameBase64, ...prev].slice(0, 50))
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
      setOnlineEmployees(users || [])
      if (!employeeId && users?.length) setEmployeeId(users[0])
    })
    s.on('presence:online', ({ userId }) => {
      setOnlineEmployees(prev => Array.from(new Set([userId, ...prev])))
    })
    s.on('presence:offline', ({ userId }) => {
      setOnlineEmployees(prev => prev.filter(u => u !== userId))
      if (employeeId === userId) setStatus('idle')
    })
    return () => { s.disconnect() }
  }, [employeeId])

  // Auto-start live view when selecting an employee
  useEffect(() => {
    if (employeeId) {
      setFrames([])
      setStatus('idle')
      socketRef.current?.emit('live_view:start', { employeeId })
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
          <div className="flex items-end gap-2">
            <div>
              <label className="block text-sm">Online Employees</label>
              <select className="border rounded px-3 py-2 min-w-64"
                value={employeeId}
                onChange={e=>setEmployeeId(e.target.value)}>
                <option value="">Select employee…</option>
                {onlineEmployees.map(email => (
                  <option key={email} value={email}>{email}</option>
                ))}
              </select>
            </div>
            <button className="px-4 py-2.5 rounded bg-green-600 text-white hover:bg-green-700" onClick={start}>Start</button>
            <button className="px-4 py-2.5 rounded bg-gray-700 text-white hover:bg-gray-800" onClick={stop}>Stop</button>
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
                  <img className="w-full h-full object-contain" src={`data:image/jpeg;base64,${latest}`} alt="Live frame" />
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
                {frames.slice(0, 12).map((b64, i) => (
                  <img key={i} className="w-full h-auto border rounded" src={`data:image/jpeg;base64,${b64}`} />
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