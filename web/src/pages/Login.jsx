import { useState } from 'react'
import axios from 'axios'

const API = import.meta.env.VITE_API_URL

export default function Login() {
  const [email, setEmail] = useState('manager@example.com')
  const [password, setPassword] = useState('secret')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const resp = await axios.post(`${API}/api/auth/login`, { email, password, role: 'manager' })
      localStorage.setItem('token', resp.data.token)
      location.href = '/'
    } catch (err) {
      setError(err?.response?.data?.error || err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="h-full grid place-items-center">
      <form onSubmit={submit} className="bg-white shadow p-6 rounded w-[360px] space-y-3">
        <h1 className="text-xl font-semibold">Login</h1>
        {error && <div className="text-red-600 text-sm">{error}</div>}
        <div>
          <label className="block text-sm">Email</label>
          <input className="mt-1 w-full border rounded px-3 py-2" value={email} onChange={e=>setEmail(e.target.value)} />
        </div>
        <div>
          <label className="block text-sm">Password</label>
          <input type="password" className="mt-1 w-full border rounded px-3 py-2" value={password} onChange={e=>setPassword(e.target.value)} />
        </div>
        <button disabled={loading} className="w-full bg-blue-600 text-white rounded py-2 hover:bg-blue-700">
          {loading? 'Signing in…':'Login'}
        </button>
      </form>
    </div>
  )
}