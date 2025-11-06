import React from 'react'
import { Link, useLocation } from 'react-router-dom'

export default function Nav() {
  const { pathname } = useLocation()
  const link = (to, label) => (
    <Link className={`px-3 py-2 rounded text-sm ${pathname===to? 'bg-blue-600 text-white':'hover:bg-blue-100'}`} to={to}>{label}</Link>
  )
  return (
    <nav className="sticky top-0 z-30 bg-white/90 backdrop-blur border-b">
      <div className="max-w-6xl mx-auto flex items-center gap-2 p-3">
        <div className="font-semibold">Time Tracker Admin</div>
        <div className="flex gap-2 ml-4">
          {link('/dashboard', 'Dashboard')}
          {link('/live', 'Live View')}
  {link('/report', 'Reports')}
          {link('/activity', 'Activity')}
          {link('/work-hours', 'Work Hours')}
          {link('/setup', 'Setup')}
          {link('/admin', 'Admin')}
          {link('/downloads', 'Downloads')}
        </div>
        <div className="ml-auto">
          <button className="px-3 py-2 rounded text-sm hover:bg-red-100" onClick={() => {localStorage.removeItem('token'); location.href='/login'}}>
            Logout
          </button>
        </div>
      </div>
    </nav>
  )
}