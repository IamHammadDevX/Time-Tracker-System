import React, { useState } from 'react'
import Nav from '../components/Nav.jsx'
let API = import.meta.env.VITE_API_URL || 'http://localhost:4000'

// Guided install flow with tooltips and checkmarks

export default function Downloads() {
  const [done, setDone] = useState({ py:false, deps:false, files:false, run:false })
  const copy = async (text) => { try { await navigator.clipboard.writeText(text) } catch {} }
  return (
    <div className="min-h-full">
      <Nav />
      <main className="p-4 space-y-6">
        <h2 className="text-lg font-semibold">Downloads</h2>
        <section className="bg-white border rounded p-4 space-y-4">
          <div className="font-semibold">Desktop Tracker (Python)</div>
          <p className="text-sm text-gray-700">Follow these steps to install and run the desktop client. Hover over each step for guidance.</p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="border rounded p-3" title="Download and install Python 3.11+ for Windows. During setup, check the option to add Python to PATH.">
              <div className="flex items-center justify-between">
                <div className="font-semibold">1) Install Python 3.11+</div>
                {done.py && <span className="text-green-600">✔</span>}
              </div>
              <div className="mt-2 flex gap-2">
                <a className="px-3 py-2 rounded bg-blue-600 text-white" href="https://www.python.org/downloads/windows/" target="_blank" rel="noreferrer">Get Python</a>
                <button className="px-3 py-2 rounded border" onClick={()=>setDone(prev=>({ ...prev, py:true }))}>Mark Done</button>
              </div>
            </div>

            <div className="border rounded p-3" title="Install required libraries using pip. Run this in Command Prompt from the folder where requirements.txt is saved.">
              <div className="flex items-center justify-between">
                <div className="font-semibold">2) Install Dependencies</div>
                {done.deps && <span className="text-green-600">✔</span>}
              </div>
              <div className="mt-2 flex gap-2 flex-wrap">
                <a className="px-3 py-2 rounded bg-gray-800 text-white" href={`${API}/downloads/requirements.txt`} download>Download requirements.txt</a>
                <button className="px-3 py-2 rounded border" onClick={()=>copy('py -m pip install -r requirements.txt')}>Copy pip command</button>
                <button className="px-3 py-2 rounded border" onClick={()=>setDone(prev=>({ ...prev, deps:true }))}>Mark Done</button>
              </div>
              <div className="mt-2 font-mono bg-gray-100 rounded px-2 py-1 text-sm">py -m pip install -r requirements.txt</div>
            </div>

            <div className="border rounded p-3" title="Save the app file to a folder (e.g., C:\\Users\\You\\Desktop\\TimeTracker).">
              <div className="flex items-center justify-between">
                <div className="font-semibold">3) Download Client Files</div>
                {done.files && <span className="text-green-600">✔</span>}
              </div>
              <div className="mt-2 flex gap-2 flex-wrap">
                <a className="px-3 py-2 rounded bg-blue-600 text-white" href={`${API}/downloads/app.py`} download>Download app.py</a>
                <button className="px-3 py-2 rounded border" onClick={()=>setDone(prev=>({ ...prev, files:true }))}>Mark Done</button>
              </div>
              <div className="text-xs text-gray-600 mt-2">Optional: create a virtual environment: <span className="font-mono">py -m venv .venv &amp;&amp; .venv\\Scripts\\activate</span></div>
            </div>

            <div className="border rounded p-3" title="Open Command Prompt in the folder and run the app. You can also create a .bat file that runs the command.">
              <div className="flex items-center justify-between">
                <div className="font-semibold">4) Run the App</div>
                {done.run && <span className="text-green-600">✔</span>}
              </div>
              <div className="mt-2 flex gap-2 flex-wrap">
                <button className="px-3 py-2 rounded border" onClick={()=>copy('py app.py')}>Copy run command</button>
                <button className="px-3 py-2 rounded border" onClick={()=>setDone(prev=>({ ...prev, run:true }))}>Mark Done</button>
              </div>
              <div className="mt-2 font-mono bg-gray-100 rounded px-2 py-1 text-sm">py app.py</div>
              <div className="text-xs text-gray-600 mt-2">Optional .bat content:
                <span className="font-mono"> @echo off &amp; py app.py</span>
              </div>
            </div>
          </div>

          <div className="text-sm text-gray-700">
            <div className="font-semibold mt-2">Tips</div>
            <ul className="list-disc pl-5 space-y-1">
              <li>If login fails, ensure backend is running on port 4000 and your email is provisioned.</li>
              <li>Use Command Prompt or PowerShell; run commands in the folder containing <span className="font-mono">app.py</span>.</li>
            </ul>
          </div>
        </section>
      </main>
    </div>
  )
}
