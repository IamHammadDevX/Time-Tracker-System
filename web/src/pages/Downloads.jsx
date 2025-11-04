import Nav from '../components/Nav.jsx'

const API = import.meta.env.VITE_API_URL

export default function Downloads() {
  return (
    <div className="min-h-full">
      <Nav />
      <main className="p-4 space-y-6">
        <h2 className="text-lg font-semibold">Downloads</h2>
        <section className="bg-white border rounded p-4 space-y-3">
          <div className="font-semibold">Desktop Tracker (Python)</div>
          <p className="text-sm text-gray-700">Run the desktop client directly with Python using the source files below.</p>
          <div className="flex gap-3 flex-wrap">
            <a className="px-3 py-2 rounded bg-blue-600 text-white" href={`${API}/downloads/app.py`} download>
              Download app.py
            </a>
            <a className="px-3 py-2 rounded bg-gray-800 text-white" href={`${API}/downloads/requirements.txt`} download>
              Download requirements.txt
            </a>
          </div>
          <div className="text-sm text-gray-700">
            <div className="font-semibold mt-3">Setup Instructions (Windows)</div>
            <ol className="list-decimal pl-5 space-y-1">
              <li>Install <a className="text-blue-600 underline" href="https://www.python.org/downloads/" target="_blank" rel="noreferrer">Python 3.11+</a> (check "Add python.exe to PATH").</li>
              <li>Create a folder (e.g., <span className="font-mono">C:\Users\\You\\Desktop\\TimeTracker</span>) and save <span className="font-mono">app.py</span> and <span className="font-mono">requirements.txt</span> into it.</li>
              <li>Open Command Prompt in that folder.</li>
              <li>Install dependencies: <span className="font-mono">py -m pip install -r requirements.txt</span></li>
              <li>Run the app: <span className="font-mono">py app.py</span></li>
              <li>Login with your email to start tracking.</li>
            </ol>
            <p className="mt-2 text-xs text-gray-600">Tip: To isolate dependencies, you can optionally create a virtual environment first: <span className="font-mono">py -m venv .venv &amp;&amp; .venv\\Scripts\\activate</span></p>
          </div>
        </section>
      </main>
    </div>
  )
}