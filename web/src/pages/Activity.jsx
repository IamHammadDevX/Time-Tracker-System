import React from 'react'
import { useEffect, useState } from 'react'
import axios from 'axios'
import Nav from '../components/Nav.jsx'
import { resolveApiBase } from '../api.js'
import { getSocket } from '../socket.js'

let API = import.meta.env.VITE_API_URL || 'http://localhost:4000'

export default function Activity() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [hours, setHours] = useState([])

  useEffect(() => {
    const token = localStorage.getItem('token')
    const headers = { Authorization: `Bearer ${token}` }
    resolveApiBase().then((BASE)=>{
      API = BASE
      const getShots = axios.get(`${BASE}/api/activity/recent`, { headers })
        .then(r => setItems(r.data.employees || []))
      const getHours = axios.get(`${BASE}/api/work/summary/today`, { headers })
        .then(r => setHours(r.data.employees || []))
      Promise.allSettled([getShots, getHours])
        .catch(e => setError(e?.response?.data?.error || e.message))
        .finally(() => setLoading(false))
    })
  }, [])

  useEffect(() => {
    const s = getSocket()
    const token = localStorage.getItem('token')
    const headers = { Authorization: `Bearer ${token}` }
    const refresh = () => {
      resolveApiBase().then((BASE)=>{
        axios.get(`${BASE}/api/activity/recent`, { headers }).then(r => setItems(r.data.employees || [])).catch(()=>{})
      })
    }
    s.on('uploads:cleanup_done', refresh)
    return () => { s.off('uploads:cleanup_done', refresh) }
  }, [])

  return (
    <div className="min-h-full">
      <Nav />
      <main className="p-4 space-y-4">
        <h2 className="text-lg font-semibold">Activity</h2>
        {error && <div className="text-red-600 text-sm">{error}</div>}
        {loading && <div>Loading…</div>}
        {/* Today’s Work Hours */}
        <section className="bg-white border rounded p-3">
          <div className="font-semibold mb-2">Today’s Work Hours</div>
          {hours.length === 0 && (
            <div className="text-sm text-gray-600">No work sessions yet today.</div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {hours.map((h) => (
              <div key={h.employeeId} className="border rounded p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="font-semibold">{h.employeeId}</div>
                </div>
                <div className="text-sm text-gray-700">Login: {formatTime((h.loginTimes||[])[0]) || '-'}</div>
                <div className="text-sm text-gray-700">Logout: {formatTime((h.logoutTimes||[])[(h.logoutTimes||[]).length-1]) || '-'}</div>
                <div className="text-sm mt-2">
                  <span className="inline-block mr-2 px-2 py-1 rounded bg-blue-50 text-blue-700">Active: {fmtDuration(h.totalActiveSeconds)}</span>
                  <span className="inline-block mr-2 px-2 py-1 rounded bg-yellow-50 text-yellow-700">Idle: {fmtDuration(h.totalIdleSeconds)}</span>
                  <span className="inline-block px-2 py-1 rounded bg-green-50 text-green-700">Net: {fmtDuration(h.netActiveSeconds)}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((emp) => (
            <div key={emp.employeeId} className="bg-white border rounded p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="font-semibold">{emp.employeeId}</div>
                <div className="text-sm text-gray-600">{emp.count} shots</div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {(Array.isArray(emp.latest) ? emp.latest : []).map((f, i) => (
                  <div key={i} className="text-center">
                    <a href={`${API}/${f.file}`} target="_blank" rel="noreferrer">
                      <img className="w-full h-24 object-cover border rounded" src={`${API}/${f.file}`} alt="Screenshot" />
                    </a>
                    <div className="text-[10px] text-gray-600 mt-1">{new Date(f.ts || '').toLocaleString()}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  )
}

function fmtDuration(totalSeconds = 0){
  const s = Math.max(0, Math.floor(totalSeconds))
  const h = Math.floor(s/3600)
  const m = Math.floor((s%3600)/60)
  return `${h}h ${m}m`
}
function formatTime(iso){
  if (!iso) return ''
  try {
    const d = new Date(iso)
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  } catch { return '' }
}
