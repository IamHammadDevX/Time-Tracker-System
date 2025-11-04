import React from 'react'
import { Link } from 'react-router-dom'

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white text-gray-900">
      {/* Hero */}
      <header className="px-6 md:px-10 py-8 md:py-14">
        <div className="max-w-6xl mx-auto grid md:grid-cols-2 gap-8 items-center">
          <div>
            <h1 className="text-3xl md:text-5xl font-extrabold tracking-tight">
              Time Tracker System
            </h1>
            <p className="mt-4 text-lg md:text-xl text-gray-700">
              A productivity monitoring platform for managers and teams.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link to="/login" className="px-5 py-2.5 rounded bg-blue-600 text-white hover:bg-blue-700">Get Started</Link>
              <Link to="/downloads" className="px-5 py-2.5 rounded border border-gray-300 hover:bg-gray-100">Download Desktop App</Link>
            </div>
          </div>
          <div className="hidden md:block">
            <div className="relative rounded-xl border bg-white shadow p-6">
              <div className="text-sm text-gray-600">Live View Preview</div>
              <div className="mt-3 grid grid-cols-3 gap-2">
                {[1,2,3,4,5,6].map(i => (
                  <div key={i} className="aspect-video rounded-lg bg-gray-100 border" />
                ))}
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Features */}
      <section className="px-6 md:px-10 py-8 md:py-12">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-2xl md:text-3xl font-bold">Platform Features</h2>
          <p className="mt-2 text-gray-700">Modern, secure, and responsive tools for monitoring productivity.</p>
          <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((f) => (
              <div key={f.title} className="group rounded-xl border bg-white p-5 shadow hover:shadow-md transition">
                <div className="flex items-center gap-3">
                  <span className="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-blue-50 text-blue-700">
                    {f.icon}
                  </span>
                  <div className="font-semibold">{f.title}</div>
                </div>
                <p className="mt-3 text-sm text-gray-700">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="px-6 md:px-10 py-10">
        <div className="max-w-6xl mx-auto rounded-2xl bg-blue-600 text-white p-8 md:p-10 flex flex-col md:flex-row items-center gap-6">
          <div className="flex-1">
            <h3 className="text-2xl font-bold">Ready to monitor your team effectively?</h3>
            <p className="mt-2 text-blue-100">Log in to set up your organization, invite employees, and start tracking.</p>
          </div>
          <div className="flex gap-3">
            <Link to="/login" className="px-5 py-2.5 rounded bg-white text-blue-700 font-semibold hover:bg-blue-50">Login</Link>
            <Link to="/setup" className="px-5 py-2.5 rounded border border-white/40 hover:bg-blue-500">Organization Setup</Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="px-6 md:px-10 py-8 border-t bg-white">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center gap-3 justify-between">
          <div className="font-semibold">Time Tracker System</div>
          <div className="text-sm text-gray-600">© {new Date().getFullYear()} All rights reserved.</div>
        </div>
      </footer>
    </div>
  )
}

const features = [
  {
    title: 'Real-time Live View',
    desc: 'Observe employee screens in real-time for coaching and support.',
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
        <path d="M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H9l-3 3v-3H5a2 2 0 0 1-2-2V5z" />
      </svg>
    )
  },
  {
    title: 'Automated Screenshots',
    desc: 'Periodic captures with metadata to visualize activity over time.',
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
        <path d="M4 7a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V7zm7 2a5 5 0 1 0 0 10 5 5 0 0 0 0-10z" />
      </svg>
    )
  },
  {
    title: 'Activity Dashboard',
    desc: 'Recent activity grouped by employee for quick oversight.',
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
        <path d="M3 13h6v8H3v-8zm12-6h6v14h-6V7zM9 3h6v18H9V3z" />
      </svg>
    )
  },
  {
    title: 'Easy Setup',
    desc: 'Configure organization and invite employees in minutes.',
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
        <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm1 5h-2v6h6v-2h-4V7z" />
      </svg>
    )
  },
  {
    title: 'Secure JWT Auth',
    desc: 'Role-based access via JWT tokens for managers and employees.',
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
        <path d="M12 1l9 4v6c0 5.25-3.5 10.06-9 11-5.5-.94-9-5.75-9-11V5l9-4zm0 6a3 3 0 1 1 0 6 3 3 0 0 1 0-6z" />
      </svg>
    )
  },
  {
    title: 'Cross-platform Desktop',
    desc: 'Python desktop app integrates via REST and Socket.IO.',
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
        <path d="M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-5l1 3H10l1-3H6a2 2 0 0 1-2-2V6z" />
      </svg>
    )
  }
]