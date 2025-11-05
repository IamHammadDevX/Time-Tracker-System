import os
import io
import time
import base64
import threading
import requests
import socketio
from urllib.parse import urlencode
from datetime import datetime

try:
    import tkinter as tk
    from tkinter import ttk, messagebox
    from tkinter import font as tkfont
except Exception:
    raise RuntimeError('Tkinter is required to run the desktop client.')

try:
    import mss
    from PIL import Image
except Exception:
    raise RuntimeError('Install dependencies from requirements.txt (mss, Pillow).')


BACKEND_URL = os.environ.get('BACKEND_URL', 'http://localhost:4001')
SCREENSHOT_INTERVAL_SECONDS = int(os.environ.get('SCREENSHOT_INTERVAL_SECONDS', '180'))  # default 3 minutes
LIVE_VIEW_INTERVAL_SECONDS = int(os.environ.get('LIVE_VIEW_INTERVAL_SECONDS', '5'))  # faster live frames
HEARTBEAT_INTERVAL_SECONDS = int(os.environ.get('HEARTBEAT_INTERVAL_SECONDS', '60'))  # send idle heartbeat every 60s


class TimeTrackerApp:
    def __init__(self, root):
        self.root = root
        root.title('Time Tracker Client')
        root.geometry('720x460')
        root.minsize(640, 420)

        # ----- Modern styling -----
        self.style = ttk.Style()
        try:
            self.style.theme_use('vista')
        except tk.TclError:
            self.style.theme_use('clam')

        self.font_body = tkfont.Font(family='Segoe UI', size=10)
        self.font_heading = tkfont.Font(family='Segoe UI', size=12, weight='bold')
        self.font_title = tkfont.Font(family='Segoe UI', size=16, weight='bold')
        self.root.option_add('*Font', self.font_body)

        # Colors
        self.color_bg = '#0F172A'
        self.color_text = '#F9FAFB'
        self.color_muted = '#94A3B8'
        self.color_primary = '#2563EB'
        self.color_success = '#16A34A'
        self.color_secondary = '#4B5563'
        self.color_error = '#DC2626'

        # Button styles
        self.style.configure('Primary.TButton', padding=8, foreground='white', background=self.color_primary)
        self.style.map('Primary.TButton', background=[('active', '#1D4ED8'), ('pressed', '#1E40AF')])
        self.style.configure('Success.TButton', padding=8, foreground='white', background=self.color_success)
        self.style.map('Success.TButton', background=[('active', '#15803D'), ('pressed', '#166534')])
        self.style.configure('Secondary.TButton', padding=8, foreground='white', background=self.color_secondary)
        self.style.map('Secondary.TButton', background=[('active', '#374151'), ('pressed', '#1F2937')])
        self.style.configure('Danger.TButton', padding=8, foreground='white', background=self.color_error)
        self.style.map('Danger.TButton', background=[('active', '#991B1B'), ('pressed', '#B91C1C')])
        self.style.configure('Header.TLabel', font=self.font_title, foreground=self.color_text)
        self.style.configure('Muted.TLabel', foreground=self.color_muted)

        self.token = None
        self.email = tk.StringVar()
        self.password = tk.StringVar()
        self.tracking = False
        self.live_view_active = False
        self.sio = None
        self.tracker_thread = None
        self.heartbeat_thread = None
        self._stop_event = threading.Event()
        self._live_stop_event = threading.Event()
        self.live_thread = None
        self.capture_interval_seconds = SCREENSHOT_INTERVAL_SECONDS

        self._build_ui()

    def _build_ui(self):
        # Header bar
        header = tk.Frame(self.root, bg=self.color_bg)
        header.pack(fill=tk.X)
        ttk.Label(header, text='Time Tracker Client', style='Header.TLabel', background=self.color_bg).pack(side=tk.LEFT, padx=16, pady=12)
        self.header_status = ttk.Label(header, text='Not logged in', style='Muted.TLabel')
        self.header_status.pack(side=tk.RIGHT, padx=16, pady=12)

        container = ttk.Frame(self.root, padding=16)
        container.pack(fill=tk.BOTH, expand=True)

        notebook = ttk.Notebook(container)
        notebook.pack(fill=tk.BOTH, expand=True)

        # Sign In tab
        login_tab = ttk.Frame(notebook, padding=16)
        notebook.add(login_tab, text='Sign In')

        ttk.Label(login_tab, text='Email').grid(row=0, column=0, sticky='w', pady=(0, 6))
        ttk.Entry(login_tab, textvariable=self.email, width=40).grid(row=0, column=1, sticky='ew', padx=8, pady=(0, 6))
        ttk.Label(login_tab, text='Password').grid(row=1, column=0, sticky='w', pady=6)
        ttk.Entry(login_tab, textvariable=self.password, width=40, show='*').grid(row=1, column=1, sticky='ew', padx=8, pady=6)
        self.login_btn = ttk.Button(login_tab, text='Login', style='Primary.TButton', command=self.login)
        self.login_btn.grid(row=0, column=2, rowspan=2, sticky='e', padx=8)

        self.status_var = tk.StringVar(value='Not logged in')
        ttk.Label(login_tab, textvariable=self.status_var, style='Muted.TLabel').grid(row=2, column=0, columnspan=3, sticky='w', pady=(12, 0))
        for i in range(3):
            login_tab.columnconfigure(i, weight=1)

        # Tracking tab
        track_tab = ttk.Frame(notebook, padding=16)
        notebook.add(track_tab, text='Tracking')

        self.live_indicator = tk.StringVar(value='Live View: inactive')
        self.live_indicator_label = ttk.Label(track_tab, textvariable=self.live_indicator, style='Muted.TLabel')
        self.live_indicator_label.pack(anchor='w')

        self.last_upload_var = tk.StringVar(value='Last upload: -')
        ttk.Label(track_tab, textvariable=self.last_upload_var, style='Muted.TLabel').pack(anchor='w', pady=(6, 0))

        self.progress_var = tk.IntVar(value=0)
        self.progress = ttk.Progressbar(track_tab, orient=tk.HORIZONTAL, length=420, mode='determinate')
        self.progress.configure(maximum=self.capture_interval_seconds, variable=self.progress_var)
        self.progress.pack(fill=tk.X, pady=(12, 8))
        self.countdown_var = tk.StringVar(value=f'Next capture in {self.capture_interval_seconds}s')
        ttk.Label(track_tab, textvariable=self.countdown_var, style='Muted.TLabel').pack(anchor='w')

        controls = ttk.Frame(track_tab)
        controls.pack(fill=tk.X, pady=(16, 0))
        self.start_btn = ttk.Button(controls, text='Start Tracking', style='Success.TButton', state=tk.DISABLED, command=self.start_tracking)
        self.start_btn.pack(side=tk.LEFT)
        self.stop_btn = ttk.Button(controls, text='Stop Tracking', style='Danger.TButton', state=tk.DISABLED, command=self.stop_tracking)
        self.stop_btn.pack(side=tk.LEFT, padx=8)

        # Live View tab (status + controls)
        live_tab = ttk.Frame(notebook, padding=16)
        notebook.add(live_tab, text='Live View')
        ttk.Label(live_tab, text='Live View status', style='Header.TLabel').pack(anchor='w')
        # Reuse live_indicator for visibility
        ttk.Label(live_tab, textvariable=self.live_indicator, style='Muted.TLabel').pack(anchor='w', pady=(6, 0))
        self.live_last_frame_var = tk.StringVar(value='Last live frame: -')
        ttk.Label(live_tab, textvariable=self.live_last_frame_var, style='Muted.TLabel').pack(anchor='w', pady=(6, 12))
        ttk.Button(live_tab, text='Disable Live View', style='Danger.TButton', command=self.disable_live_view).pack(anchor='w')

    def login(self):
        email = self.email.get().strip()
        password = self.password.get().strip()
        if not email or not password:
            messagebox.showwarning('Missing', 'Email and password are required.')
            return
        try:
            resp = requests.post(f'{BACKEND_URL}/api/auth/login', json={'email': email, 'password': password, 'role': 'employee'})
            resp.raise_for_status()
            data = resp.json()
            self.token = data.get('token')
            if not self.token:
                raise ValueError('No token received')
        except Exception as e:
            messagebox.showerror('Login failed', f'{e}')
            return

        self.status_var.set(f'Logged in as {email}')
        self.header_status.configure(text=f'Logged in as {email}')
        # Connect Socket.IO for live view signaling
        self._connect_socket(email)
        # Fetch capture interval assigned by manager
        self._fetch_capture_interval()

    def _connect_socket(self, email):
        try:
            self.sio = socketio.Client()
            # Register event handlers
            self.sio.on('live_view:initiate', self._on_live_view_start)
            self.sio.on('live_view:terminate', self._on_live_view_stop)
            self.sio.on('live_view:frame', lambda data: None)  # managers receive frames; employee ignores
            # Interval assignment push from backend
            self.sio.on('interval:assigned', self._on_interval_assigned)
            # Connect with query string to pass identity/role
            qs = urlencode({'userId': email, 'role': 'employee'})
            self.sio.connect(
                f"{BACKEND_URL}?{qs}",
                transports=['websocket'],
                headers={'Authorization': f'Bearer {self.token}'},
                socketio_path='socket.io',
                wait=True,
                wait_timeout=5,
            )
        except Exception as e:
            print('[socket] connection error:', e)

    def _fetch_capture_interval(self):
        try:
            headers = { 'Authorization': f'Bearer {self.token}' } if self.token else {}
            resp = requests.get(f'{BACKEND_URL}/api/capture-interval', headers=headers, timeout=10)
            data = resp.json()
            secs = int(data.get('intervalSeconds') or 0)
            if data.get('assigned') and secs > 0:
                self.capture_interval_seconds = secs
                self.progress.configure(maximum=self.capture_interval_seconds)
                self.countdown_var.set(f'Next capture in {self.capture_interval_seconds}s')
                # Enable tracking once interval is assigned
                self.start_btn.configure(state=tk.NORMAL)
                mins = secs // 60
                self.status_var.set(f'Interval assigned: {mins} minute(s)')
            else:
                # Disable tracking until manager assigns interval
                self.start_btn.configure(state=tk.DISABLED)
                self.status_var.set('Awaiting manager interval assignment')
        except Exception as e:
            print('[interval] fetch error:', e)
            self.start_btn.configure(state=tk.DISABLED)
            self.status_var.set('Failed to load interval; contact your manager')

    def _on_interval_assigned(self, data=None):
        try:
            secs = int((data or {}).get('intervalSeconds') or 0)
        except Exception:
            secs = 0
        if secs > 0:
            self.capture_interval_seconds = secs
            try:
                self.progress.configure(maximum=self.capture_interval_seconds)
            except Exception:
                pass
            mins = secs // 60
            self.countdown_var.set(f'Next capture in {self.capture_interval_seconds}s')
            self.start_btn.configure(state=tk.NORMAL)
            self.status_var.set(f'Interval assigned: {mins} minute(s). Starting tracking…')
            try:
                self.header_status.configure(text=f'Interval: {mins}m assigned')
            except Exception:
                pass
            # Auto-start tracking if not already running
            if not self.tracking:
                try:
                    self.start_tracking()
                except Exception:
                    pass

    def _on_live_view_start(self, data=None):
        self.live_view_active = True
        self._set_live_indicator(True)
        self._start_live_loop()

    def _on_live_view_stop(self, data=None):
        self.live_view_active = False
        self._set_live_indicator(False)
        self._stop_live_loop()

    def _set_live_indicator(self, active: bool):
        self.live_indicator.set(f'Live View: {"active" if active else "inactive"}')
        try:
            # Emphasize transparency: red text when active
            self.live_indicator_label.configure(foreground=(self.color_error if active else self.color_muted))
        except Exception:
            pass

    def start_tracking(self):
        if self.tracking:
            return
        self.tracking = True
        self._stop_event.clear()
        self.status_var.set('Tracking…')
        self.header_status.configure(text='Tracking…')
        self.start_btn.configure(state=tk.DISABLED)
        self.stop_btn.configure(state=tk.NORMAL)
        self.tracker_thread = threading.Thread(target=self._tracking_loop, daemon=True)
        self.tracker_thread.start()
        # start heartbeat loop
        self.heartbeat_thread = threading.Thread(target=self._heartbeat_loop, daemon=True)
        self.heartbeat_thread.start()
        # notify backend start
        try:
            headers = { 'Authorization': f'Bearer {self.token}' }
            requests.post(f'{BACKEND_URL}/api/work/start', headers=headers, timeout=10)
        except Exception as e:
            print('[work] start error:', e)

    def stop_tracking(self):
        if not self.tracking:
            return
        self._stop_event.set()
        self.tracking = False
        self.status_var.set('Tracking stopped')
        self.header_status.configure(text='Tracking stopped')
        self.start_btn.configure(state=tk.NORMAL)
        self.stop_btn.configure(state=tk.DISABLED)
        self.countdown_var.set(f'Next capture in {self.capture_interval_seconds}s')
        self.progress_var.set(0)
        # If live view is active, notify backend and turn off
        try:
            if self.live_view_active and self.sio:
                self.live_view_active = False
                self._set_live_indicator(False)
                self.sio.emit('live_view:terminate', {'employeeId': self.email.get()})
        except Exception:
            pass
        # Ensure live loop stops
        self._stop_live_loop()
        # notify backend stop
        try:
            headers = { 'Authorization': f'Bearer {self.token}' }
            requests.post(f'{BACKEND_URL}/api/work/stop', headers=headers, timeout=10)
        except Exception as e:
            print('[work] stop error:', e)

    def _capture_screenshot(self):
        with mss.mss() as sct:
            monitor = sct.monitors[1]
            img = sct.grab(monitor)
            # Convert to PIL Image
            pil_img = Image.frombytes('RGB', img.size, img.bgra, 'raw', 'BGRX')
            # Resize down for live view to reduce bandwidth
            pil_small = pil_img.copy()
            pil_small.thumbnail((960, 540))

            # Encode JPEG
            buf = io.BytesIO()
            pil_img.save(buf, format='JPEG', quality=70)
            full_jpeg = buf.getvalue()

            buf_small = io.BytesIO()
            pil_small.save(buf_small, format='JPEG', quality=60)
            small_jpeg = buf_small.getvalue()

            return full_jpeg, small_jpeg

    def _upload_screenshot(self, jpeg_bytes: bytes):
        try:
            files = { 'screenshot': ('screenshot.jpg', jpeg_bytes, 'image/jpeg') }
            data = { 'employeeId': self.email.get() }
            headers = { 'Authorization': f'Bearer {self.token}' } if self.token else {}
            resp = requests.post(f'{BACKEND_URL}/api/uploads/screenshot', files=files, data=data, headers=headers, timeout=30)
            resp.raise_for_status()
            # update UI on successful upload
            self.last_upload_var.set(f"Last upload: {time.strftime('%H:%M:%S')} ✅")
        except Exception as e:
            print('[upload] error:', e)
            self.last_upload_var.set(f'Last upload failed: {e}')

    def _send_live_frame(self, small_jpeg: bytes):
        if not self.sio or not self.live_view_active:
            return
        try:
            b64 = base64.b64encode(small_jpeg).decode('ascii')
            self.sio.emit('live_view:frame', {'employeeId': self.email.get(), 'frameBase64': b64, 'ts': datetime.utcnow().isoformat()})
            # update UI
            try:
                self.live_last_frame_var.set(f"Last live frame: {time.strftime('%H:%M:%S')}")
            except Exception:
                pass
        except Exception as e:
            print('[live] emit error:', e)

    def _start_live_loop(self):
        if self.live_thread and self.live_thread.is_alive():
            return
        self._live_stop_event.clear()
        self.live_thread = threading.Thread(target=self._live_view_loop, daemon=True)
        self.live_thread.start()

    def _stop_live_loop(self):
        try:
            self._live_stop_event.set()
        except Exception:
            pass

    def _live_view_loop(self):
        # Stream small frames more frequently while live view is active
        while not self._live_stop_event.is_set():
            if self.live_view_active:
                try:
                    _, small_jpeg = self._capture_screenshot()
                    self._send_live_frame(small_jpeg)
                except Exception as e:
                    print('[live] capture error:', e)
            # sleep regardless to avoid tight loop
            for _ in range(LIVE_VIEW_INTERVAL_SECONDS * 2):
                if self._live_stop_event.is_set():
                    break
                time.sleep(0.5)

    def _tracking_loop(self):
        next_capture = time.time()
        while not self._stop_event.is_set():
            now = time.time()
            if now >= next_capture:
                try:
                    full_jpeg, small_jpeg = self._capture_screenshot()
                    self._upload_screenshot(full_jpeg)
                    # Optional: also send one frame on full capture; the live loop handles frequent streaming
                    self._send_live_frame(small_jpeg)
                except Exception as e:
                    print('[tracking] capture error:', e)
                next_capture = now + self.capture_interval_seconds
                # restart countdown
                self._schedule_countdown_update(self.capture_interval_seconds)
            time.sleep(0.5)

    def _get_idle_seconds(self) -> int:
        # Windows idle time via GetLastInputInfo; fallback 0 on failure
        try:
            import ctypes
            class LASTINPUTINFO(ctypes.Structure):
                _fields_ = [("cbSize", ctypes.c_uint), ("dwTime", ctypes.c_uint)]
            lii = LASTINPUTINFO()
            lii.cbSize = ctypes.sizeof(LASTINPUTINFO)
            if not ctypes.windll.user32.GetLastInputInfo(ctypes.byref(lii)):
                return 0
            millis = ctypes.windll.kernel32.GetTickCount() - lii.dwTime
            return int(millis // 1000)
        except Exception:
            return 0

    def _heartbeat_loop(self):
        # Periodically send idle delta seconds to backend while tracking
        prev_idle = self._get_idle_seconds()
        while not self._stop_event.is_set():
            time.sleep(HEARTBEAT_INTERVAL_SECONDS)
            if self._stop_event.is_set():
                break
            try:
                current_idle = self._get_idle_seconds()
                delta = max(0, current_idle - prev_idle)
                prev_idle = current_idle
                headers = { 'Authorization': f'Bearer {self.token}' }
                requests.post(f'{BACKEND_URL}/api/work/heartbeat', json={ 'idleDeltaSeconds': delta }, headers=headers, timeout=10)
            except Exception as e:
                print('[work] heartbeat error:', e)

    def disable_live_view(self):
        # Employee-side manual termination for transparency
        if not self.live_view_active:
            return
        self.live_view_active = False
        self._set_live_indicator(False)
        self._stop_live_loop()
        try:
            if self.sio:
                self.sio.emit('live_view:terminate', {'employeeId': self.email.get()})
        except Exception:
            pass

    def _schedule_countdown_update(self, seconds: int):
        # Update progress and countdown label every second
        def tick(remaining):
            if self._stop_event.is_set():
                self.countdown_var.set(f'Next capture in {self.capture_interval_seconds}s')
                self.progress_var.set(0)
                return
            try:
                self.progress_var.set(self.capture_interval_seconds - remaining)
            except Exception:
                pass
            self.countdown_var.set(f'Next capture in {remaining}s')
            if remaining > 0:
                self.root.after(1000, lambda: tick(remaining - 1))
        tick(seconds)


def main():
    root = tk.Tk()
    app = TimeTrackerApp(root)
    root.mainloop()


if __name__ == '__main__':
    main()