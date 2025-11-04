import React from 'react'
import { Link, useLocation } from 'react-router-dom'

export default function Nav() {
  const { pathname } = useLocation()
  const link = (to, label) => (
    <Link className={`px-3 py-2 rounded ${pathname===to? 'bg-blue-600 text-white':'hover:bg-blue-100'}`} to={to}>{label}</Link>
  )
  return (
    <nav className="flex items-center gap-2 p-3 border-b bg-white">
      <div className="font-semibold">Time Tracker Admin</div>
      <div className="flex gap-2 ml-4">
        {link('/', 'Dashboard')}
        {link('/live', 'Live View')}
        {link('/screenshots', 'Screenshots')}
        {link('/activity', 'Activity')}
        {link('/setup', 'Setup')}
        {link('/downloads', 'Downloads')}
      </div>
      <div className="ml-auto">
        <button className="px-3 py-2 rounded hover:bg-red-100" onClick={() => {localStorage.removeItem('token'); location.href='/login'}}>
          Logout
        </button>
      </div>
    </nav>
  )
}