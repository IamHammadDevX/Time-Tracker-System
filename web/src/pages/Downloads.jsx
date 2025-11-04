import Nav from '../components/Nav.jsx'

const API = import.meta.env.VITE_API_URL

export default function Downloads() {
  return (
    <div className="min-h-full">
      <Nav />
      <main className="p-4 space-y-6">
        <h2 className="text-lg font-semibold">Downloads</h2>
        <section className="bg-white border rounded p-4 space-y-3">
          <div className="font-semibold">Desktop Tracker</div>
          <p className="text-sm text-gray-700">Download the Windows installer for the desktop client.</p>
          <div>
            <a className="px-3 py-2 rounded bg-blue-600 text-white" href={`${API}/downloads/TimeTrackerClient/TimeTrackerClient.exe`} download>
              Download Windows Installer (EXE)
            </a>
          </div>
          <div className="text-sm text-gray-700">
            <div className="font-semibold mt-3">Install Steps</div>
            <ol className="list-decimal pl-5 space-y-1">
              <li>Download the installer EXE above.</li>
              <li>Run the EXE to launch the tracker client.</li>
              <li>Login with your email to start tracking.</li>
            </ol>
          </div>
        </section>
      </main>
    </div>
  )
}