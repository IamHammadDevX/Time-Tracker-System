import React from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import './index.css'
import Login from './pages/Login.jsx'
import Dashboard from './pages/Dashboard.jsx'
import LiveView from './pages/LiveView.jsx'
import Screenshots from './pages/Screenshots.jsx'
import Activity from './pages/Activity.jsx'
import WorkHours from './pages/WorkHours.jsx'
import Setup from './pages/Setup.jsx'
import Downloads from './pages/Downloads.jsx'
import Home from './pages/Home.jsx'
import Admin from './pages/Admin.jsx'

function AppRoutes() {
  const token = localStorage.getItem('token')
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<Home />} />
      <Route path="/dashboard" element={token ? <Dashboard /> : <Navigate to="/login" replace />} />
      <Route path="/live" element={token ? <LiveView /> : <Navigate to="/login" replace />} />
      <Route path="/screenshots" element={token ? <Screenshots /> : <Navigate to="/login" replace />} />
      <Route path="/activity" element={token ? <Activity /> : <Navigate to="/login" replace />} />
      <Route path="/work-hours" element={token ? <WorkHours /> : <Navigate to="/login" replace />} />
      <Route path="/setup" element={token ? <Setup /> : <Navigate to="/login" replace />} />
      <Route path="/downloads" element={token ? <Downloads /> : <Navigate to="/login" replace />} />
      <Route path="/admin" element={token ? <Admin /> : <Navigate to="/login" replace />} />
    </Routes>
  )
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  </React.StrictMode>
)
