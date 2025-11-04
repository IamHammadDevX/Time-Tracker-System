import React from 'react'
import { useEffect, useRef, useState } from 'react'
import Nav from '../components/Nav.jsx'
import { io } from 'socket.io-client'

const API = import.meta.env.VITE_API_URL

export default function LiveView() {
  const [employeeId, setEmployeeId] = useState('employee@example.com')
  const [frames, setFrames] = useState([])
  const socketRef = useRef(null)

  useEffect(() => {
    const token = localStorage.getItem('token')
    const s = io(API, { query: { role: 'manager', userId: 'manager@example.com' }, extraHeaders: { Authorization: `Bearer ${token}` } })
    socketRef.current = s
    s.on('live_view:frame', (payload) => {
      if (payload?.employeeId === employeeId) {
        setFrames(prev => [payload.frameBase64, ...prev].slice(0, 30))
      }
    })
    return () => { s.disconnect() }
  }, [employeeId])

  const start = () => socketRef.current?.emit('live_view:start', { employeeId })
  const stop = () => socketRef.current?.emit('live_view:stop', { employeeId })

  return (
    <div className="min-h-full">
      <Nav />
      <main className="p-4 space-y-4">
        <h2 className="text-lg font-semibold">Live View</h2>
        <div className="flex items-end gap-2">
          <div>
            <label className="block text-sm">Employee ID (email)</label>
            <input className="border rounded px-3 py-2" value={employeeId} onChange={e=>setEmployeeId(e.target.value)} />
          </div>
          <button className="bg-green-600 text-white px-3 py-2 rounded" onClick={start}>Start</button>
          <button className="bg-gray-600 text-white px-3 py-2 rounded" onClick={stop}>Stop</button>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {frames.map((b64, i) => (
            <img key={i} className="w-full h-auto border rounded" src={`data:image/jpeg;base64,${b64}`} />
          ))}
        </div>
      </main>
    </div>
  )
}