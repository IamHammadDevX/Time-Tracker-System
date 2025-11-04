import { useEffect, useState } from 'react'
import axios from 'axios'
import Nav from '../components/Nav.jsx'

const API = import.meta.env.VITE_API_URL

export default function Screenshots() {
  const [files, setFiles] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem('token')
    axios.get(`${API}/api/uploads/list`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => setFiles(r.data.files || []))
      .catch(e => console.error(e))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="min-h-full">
      <Nav />
      <main className="p-4 space-y-4">
        <h2 className="text-lg font-semibold">Screenshots</h2>
        {loading && <div>Loading…</div>}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {files.map((f, i) => (
            <img key={i} className="w-full h-auto border rounded" src={`${API}/${f.file}`} />
          ))}
        </div>
      </main>
    </div>
  )
}