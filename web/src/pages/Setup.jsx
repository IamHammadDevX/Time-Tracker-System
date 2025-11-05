import React from 'react'
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
  const [tempPwdMsg, setTempPwdMsg] = useState('')
  const [error, setError] = useState('')
  const [managers, setManagers] = useState([])
  const [assignManagerId, setAssignManagerId] = useState('')
  const [role, setRole] = useState('')

  const token = localStorage.getItem('token')
  const headers = { Authorization: `Bearer ${token}` }

  useEffect(() => {
    axios.get(`${API}/api/org`, { headers }).then(r => setOrg(r.data.organization)).catch(()=>{})
    axios.get(`${API}/api/employees`, { headers }).then(r => setUsers(r.data.users || [])).catch(()=>{})
    // decode role from JWT for conditional UI
    try {
      const payload = JSON.parse(atob((token || '').split('.')[1].replace(/-/g,'+').replace(/_/g,'/')))
      setRole(payload?.role || '')
      if (payload?.role === 'super_admin') {
        axios.get(`${API}/api/admin/managers`, { headers }).then(r => setManagers(r.data?.managers || [])).catch(()=>{})
      }
    } catch {}
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
      const body = role === 'super_admin' && assignManagerId ? { email, name, managerId: assignManagerId } : { email, name }
      const r = await axios.post(`${API}/api/employees`, body, { headers })
      setUsers(prev => [r.data.user, ...prev])
      const temp = r?.data?.login?.tempPassword
      setEmail(''); setName('')
      setAssignManagerId('')
      setMsg('Employee added')
      setTempPwdMsg(temp ? `Temp password for ${email}: ${temp}` : '')
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
        {tempPwdMsg && <div className="text-blue-700 text-sm">{tempPwdMsg}</div>}

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
            {role === 'super_admin' && (
              <select className="border rounded px-3 py-2" value={assignManagerId} onChange={e=>setAssignManagerId(e.target.value)}>
                <option value="">Assign manager…</option>
                {managers.map(m => (
                  <option key={m.id} value={m.id}>{m.email} ({m.organization?.name || '-'})</option>
                ))}
              </select>
            )}
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