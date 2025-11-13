import React, { useEffect, useState } from 'react'
import axios from 'axios'
import { Link } from 'react-router-dom'
import Nav from '../components/Nav.jsx'
import { resolveApiBase } from '../api.js'

let API = import.meta.env.VITE_API_URL || 'http://localhost:4000'

export default function Dashboard() {
  const [team, setTeam] = useState(null)
  const [role, setRole] = useState('')
  const [employeesCount, setEmployeesCount] = useState(0)
  const [employees, setEmployees] = useState([])
  const [recentFiles, setRecentFiles] = useState([])
  const [loading, setLoading] = useState(true)
  const [managers, setManagers] = useState([])
  const [selectedManager, setSelectedManager] = useState('')

  useEffect(() => {
    const token = localStorage.getItem('token')
    const headers = { Authorization: `Bearer ${token}` }
    resolveApiBase().then((BASE)=>{
      API = BASE
      let role = ''
      try { const payload = JSON.parse(atob((token || '').split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))); role = payload?.role } catch {}
      setRole(role || '')
      const getTeamReq = role === 'manager'
        ? axios.get(`${BASE}/api/team`, { headers }).then(r => setTeam(r.data?.team || null)).catch(()=>{})
        : axios.get(`${BASE}/api/org`, { headers }).then(r => setTeam(r.data?.organization || null)).catch(()=>{})
      const getUsers = axios.get(`${BASE}/api/employees`, { headers }).then(r => { const list = r.data.users || []; setEmployees(list); setEmployeesCount(list.length) }).catch(()=> { setEmployees([]); setEmployeesCount(0) })
      const getFiles = axios.get(`${BASE}/api/uploads/list`, { headers }).then(r => setRecentFiles((r.data.files || []).slice(-6).reverse())).catch(()=>{})
      Promise.allSettled([getTeamReq, getUsers, getFiles]).finally(() => setLoading(false))
    })
  }, [])

  // Load managers for super admin team switcher
  useEffect(() => {
    try {
      const token = localStorage.getItem('token')
      const payload = JSON.parse(atob((token || '').split('.')[1].replace(/-/g,'+').replace(/_/g,'/')))
      if (payload?.role === 'super_admin') {
        const headers = { Authorization: `Bearer ${localStorage.getItem('token')}` }
        resolveApiBase().then((BASE)=>{
          axios.get(`${BASE}/api/admin/managers`, { headers }).then(r => setManagers(r.data?.managers || []))
        })
      }
    } catch {}
  }, [])

  // Apply manager filter to employees and recent files
  const filteredEmployees = selectedManager ? employees.filter(e => String(e.managerId || '') === String(selectedManager)) : employees
  const filteredFiles = selectedManager ? recentFiles.filter(f => filteredEmployees.map(e=>e.email).includes(f.employeeId)) : recentFiles

  const Stat = ({label, value}) => (
    <div className="rounded-xl border bg-white p-5 shadow-sm">
      <div className="text-sm text-gray-600">{label}</div>
      <div className="mt-1 text-2xl font-bold">{value}</div>
    </div>
  )

  const Quick = ({to, title, desc, icon}) => (
    <Link to={to} className="group rounded-xl border bg-white p-5 shadow-sm hover:shadow-md transition block">
      <div className="flex items-center gap-3">
        <span className="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-blue-50 text-blue-700">
          {icon}
        </span>
        <div className="font-semibold">{title}</div>
      </div>
      <div className="mt-2 text-sm text-gray-700">{desc}</div>
    </Link>
  )

  return (
    <div className="min-h-full bg-gradient-to-b from-slate-50 to-white">
      <Nav />
      <main className="max-w-6xl mx-auto px-6 md:px-10 py-6 md:py-10 space-y-8">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <h2 className="text-2xl md:text-3xl font-bold">Dashboard</h2>
            <p className="text-gray-700">Overview of your team and recent activity.</p>
          </div>
          {role === 'super_admin' && (
            <div>
              <Link to="/setup" className="px-4 py-2.5 rounded bg-blue-600 text-white hover:bg-blue-700">Team Setup</Link>
            </div>
          )}
        </div>

        {managers.length > 0 && (
          <div className="flex items-end gap-2">
            <div>
              <label className="block text-sm">Team Switcher (Super Admin)</label>
              <select className="border rounded px-3 py-2 min-w-64" value={selectedManager} onChange={e=>setSelectedManager(e.target.value)}>
                <option value="">All Managers</option>
                {managers.map(m => (
                  <option key={m.id} value={m.id}>{m.email} ({m.organization?.name || '-'})</option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* Stats */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <Stat label="Team" value={team?.name || 'Not configured'} />
          <Stat label="Employees" value={filteredEmployees.length} />
          <Stat label="Recent Screenshots" value={filteredFiles.length} />
          <Stat label="Status" value={loading ? 'Loading…' : 'Healthy'} />
        </section>

        {/* Quick actions */}
        <section>
          <h3 className="text-lg font-semibold">Quick Actions</h3>
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            <Quick to="/live" title="Live View" desc="See employee screens in real-time." icon={<SvgLive/>} />
            <Quick to="/report" title="Report" desc="Filter screenshots and sessions by date." icon={<SvgCamera/>} />
            <Quick to="/activity" title="Activity" desc="Review recent activity by employee." icon={<SvgChart/>} />
            <Quick to="/setup" title="Setup" desc="Configure team and invite users." icon={<SvgCog/>} />
            <Quick to="/downloads" title="Downloads" desc="Get the desktop tracker client." icon={<SvgDownload/>} />
          </div>
        </section>

        {/* Recent screenshots */}
        <section>
          <h3 className="text-lg font-semibold">Latest Screenshots</h3>
          {recentFiles.length === 0 && (
            <div className="mt-3 text-sm text-gray-600">No screenshots yet. Once employees start tracking, screenshots will appear here.</div>
          )}
          <div className="mt-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {filteredFiles.map((f, i) => (
              <div key={i} className="text-center">
                <img className="w-full h-auto border rounded" src={`${API}/${f.file}`} alt="Screenshot" />
                <div className="text-[10px] text-gray-600 mt-1">{new Date(f.ts || '').toLocaleString()}</div>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  )
}

function SvgLive(){
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6"><path d="M3 5a2 2 0 012-2h14a2 2 0 012 2v11a2 2 0 01-2 2H9l-3 3v-3H5a2 2 0 01-2-2V5z"/></svg>
  )
}
function SvgCamera(){
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6"><path d="M4 7a3 3 0 013-3h10a3 3 0 013 3v10a3 3 0 01-3 3H7a3 3 0 01-3-3V7zm7 2a5 5 0 100 10 5 5 0 000-10z"/></svg>
  )
}
function SvgChart(){
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6"><path d="M3 13h6v8H3v-8zm12-6h6v14h-6V7zM9 3h6v18H9V3z"/></svg>
  )
}
function SvgCog(){
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6"><path d="M12 8a4 4 0 110 8 4 4 0 010-8zm9 4a8.96 8.96 0 01-.6 3.2l2.1 1.6-2 3.4-2.6-1A9.08 9.08 0 0115 21.6l-.4 2.7h-3.2l-.4-2.7a9.08 9.08 0 01-3.9-1.4l-2.6 1-2-3.4 2.1-1.6A8.96 8.96 0 013 12c0-1.1.2-2.2.6-3.2L2 7.2l2-3.4 2.6 1A9.08 9.08 0 019 2.4l.4-2.7h3.2l.4 2.7a9.08 9.08 0 013.9 1.4l2.6-1 2 3.4-2.1 1.6c.4 1 .6 2.1.6 3.2z"/></svg>
  )
}
function SvgDownload(){
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6"><path d="M12 3a1 1 0 011 1v8.59l2.3-2.3a1 1 0 111.4 1.42l-4 4a1 1 0 01-1.4 0l-4-4a1 1 0 011.4-1.42L11 12.59V4a1 1 0 011-1zm-7 16a2 2 0 002 2h10a2 2 0 002-2v-1a1 1 0 112 0v1a4 4 0 01-4 4H7a4 4 0 01-4-4v-1a1 1 0 112 0v1z"/></svg>
  )
}
