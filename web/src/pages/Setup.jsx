import { useEffect, useState } from 'react'
import axios from 'axios'
import Nav from '../components/Nav.jsx'

const API = import.meta.env.VITE_API_URL

export default function Setup() {
  const [orgName, setOrgName] = useState('')
  const [org, setOrg] = useState(null)
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [users, setUsers] = useState([])
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')

  const token = localStorage.getItem('token')
  const headers = { Authorization: `Bearer ${token}` }

  useEffect(() => {
    axios.get(`${API}/api/org`, { headers }).then(r => setOrg(r.data.organization)).catch(()=>{})
    axios.get(`${API}/api/employees`, { headers }).then(r => setUsers(r.data.users || [])).catch(()=>{})
  }, [])

  const saveOrg = async () => {
    setMsg(''); setError('')
    try {
      const r = await axios.post(`${API}/api/org`, { name: orgName }, { headers })
      setOrg(r.data.organization)
      setMsg('Organization saved')
    } catch (e) {
      setError(e?.response?.data?.error || e.message)
    }
  }

  const addEmp = async () => {
    setMsg(''); setError('')
    try {
      const r = await axios.post(`${API}/api/employees`, { email, name }, { headers })
      setUsers(prev => [r.data.user, ...prev])
      setEmail(''); setName('')
      setMsg('Employee added')
    } catch (e) {
      setError(e?.response?.data?.error || e.message)
    }
  }

  return (
    <div className="min-h-full">
      <Nav />
      <main className="p-4 space-y-6">
        <h2 className="text-lg font-semibold">Setup</h2>
        {error && <div className="text-red-600 text-sm">{error}</div>}
        {msg && <div className="text-green-700 text-sm">{msg}</div>}

        <section className="bg-white border rounded p-4 space-y-3">
          <div className="font-semibold">Organization</div>
          <div className="text-sm text-gray-600">Current: {org?.name || 'Not set'}</div>
          <div className="flex gap-2">
            <input className="border rounded px-3 py-2 flex-1" placeholder="Organization name" value={orgName} onChange={e=>setOrgName(e.target.value)} />
            <button className="px-3 py-2 rounded bg-blue-600 text-white" onClick={saveOrg}>Save</button>
          </div>
        </section>

        <section className="bg-white border rounded p-4 space-y-3">
          <div className="font-semibold">Employees</div>
          <div className="flex gap-2">
            <input className="border rounded px-3 py-2" placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)} />
            <input className="border rounded px-3 py-2" placeholder="Name (optional)" value={name} onChange={e=>setName(e.target.value)} />
            <button className="px-3 py-2 rounded bg-blue-600 text-white" onClick={addEmp}>Add</button>
          </div>
          <ul className="text-sm list-disc pl-5">
            {users.map((u, i) => (
              <li key={i}>{u.email} {u.name? `— ${u.name}`:''}</li>
            ))}
          </ul>
        </section>
      </main>
    </div>
  )
}