import React from 'react'
import Nav from '../components/Nav.jsx'

export default function Dashboard() {
  return (
    <div className="min-h-full">
      <Nav />
      <main className="p-4 space-y-4">
        <h2 className="text-lg font-semibold">Welcome</h2>
        <p>Use the navigation to access Live View and Screenshots.</p>
      </main>
    </div>
  )
}