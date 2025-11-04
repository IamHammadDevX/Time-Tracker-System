import { useEffect, useState } from 'react'
import axios from 'axios'
import Nav from '../components/Nav.jsx'

const API = import.meta.env.VITE_API_URL

export default function Activity() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const token = localStorage.getItem('token')
    axios.get(`${API}/api/activity/recent`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => setItems(r.data.employees || []))
      .catch(e => setError(e?.response?.data?.error || e.message))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="min-h-full">
      <Nav />
      <main className="p-4 space-y-4">
        <h2 className="text-lg font-semibold">Activity</h2>
        {error && <div className="text-red-600 text-sm">{error}</div>}
        {loading && <div>Loading…</div>}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((emp) => (
            <div key={emp.employeeId} className="bg-white border rounded p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="font-semibold">{emp.employeeId}</div>
                <div className="text-sm text-gray-600">{emp.count} shots</div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {emp.latest.map((f, i) => (
                  <a key={i} href={`${API}/${f.file}`} target="_blank" rel="noreferrer">
                    <img className="w-full h-24 object-cover border rounded" src={`${API}/${f.file}`} />
                  </a>
                ))}
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  )
}