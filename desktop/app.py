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
        self.color_error = '#DC2626'

        # Button styles
        self.style.configure('Primary.TButton', padding=8, foreground='white', background=self.color_primary)
        self.style.map('Primary.TButton', background=[('active', '#1E40AF'), ('pressed', '#1D4ED8')])
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
        self._stop_event = threading.Event()

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
        ttk.Label(track_tab, textvariable=self.live_indicator, style='Muted.TLabel').pack(anchor='w')

        self.last_upload_var = tk.StringVar(value='Last upload: -')
        ttk.Label(track_tab, textvariable=self.last_upload_var, style='Muted.TLabel').pack(anchor='w', pady=(6, 0))

        self.progress_var = tk.IntVar(value=0)
        self.progress = ttk.Progressbar(track_tab, orient=tk.HORIZONTAL, length=420, mode='determinate')
        self.progress.configure(maximum=SCREENSHOT_INTERVAL_SECONDS, variable=self.progress_var)
        self.progress.pack(fill=tk.X, pady=(12, 8))
        self.countdown_var = tk.StringVar(value=f'Next capture in {SCREENSHOT_INTERVAL_SECONDS}s')
        ttk.Label(track_tab, textvariable=self.countdown_var, style='Muted.TLabel').pack(anchor='w')

        controls = ttk.Frame(track_tab)
        controls.pack(fill=tk.X, pady=(16, 0))
        self.start_btn = ttk.Button(controls, text='Start Tracking', style='Primary.TButton', state=tk.DISABLED, command=self.start_tracking)
        self.start_btn.pack(side=tk.LEFT)
        self.stop_btn = ttk.Button(controls, text='Stop Tracking', style='Danger.TButton', state=tk.DISABLED, command=self.stop_tracking)
        self.stop_btn.pack(side=tk.LEFT, padx=8)

        # Live View tab (placeholder)
        live_tab = ttk.Frame(notebook, padding=16)
        notebook.add(live_tab, text='Live View')
        ttk.Label(live_tab, text='Live view coming soon', style='Muted.TLabel').pack(anchor='w')

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
        self.start_btn.configure(state=tk.NORMAL)
        # Connect Socket.IO for live view signaling
        self._connect_socket(email)

    def _connect_socket(self, email):
        try:
            self.sio = socketio.Client()
            # Register event handlers
            self.sio.on('live_view:initiate', self._on_live_view_start)
            self.sio.on('live_view:terminate', self._on_live_view_stop)
            self.sio.on('live_view:frame', lambda data: None)  # managers receive frames; employee ignores
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

    def _on_live_view_start(self, data=None):
        self.live_view_active = True
        self._set_live_indicator(True)

    def _on_live_view_stop(self, data=None):
        self.live_view_active = False
        self._set_live_indicator(False)

    def _set_live_indicator(self, active: bool):
        self.live_indicator.set(f'Live View: {"active" if active else "inactive"}')

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

    def stop_tracking(self):
        if not self.tracking:
            return
        self._stop_event.set()
        self.tracking = False
        self.status_var.set('Tracking stopped')
        self.header_status.configure(text='Tracking stopped')
        self.start_btn.configure(state=tk.NORMAL)
        self.stop_btn.configure(state=tk.DISABLED)
        self.countdown_var.set(f'Next capture in {SCREENSHOT_INTERVAL_SECONDS}s')
        self.progress_var.set(0)

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
        except Exception as e:
            print('[live] emit error:', e)

    def _tracking_loop(self):
        next_capture = time.time()
        while not self._stop_event.is_set():
            now = time.time()
            if now >= next_capture:
                try:
                    full_jpeg, small_jpeg = self._capture_screenshot()
                    self._upload_screenshot(full_jpeg)
                    self._send_live_frame(small_jpeg)
                except Exception as e:
                    print('[tracking] capture error:', e)
                next_capture = now + SCREENSHOT_INTERVAL_SECONDS
                # restart countdown
                self._schedule_countdown_update(SCREENSHOT_INTERVAL_SECONDS)
            time.sleep(0.5)

    def _schedule_countdown_update(self, seconds: int):
        # Update progress and countdown label every second
        def tick(remaining):
            if self._stop_event.is_set():
                self.countdown_var.set(f'Next capture in {SCREENSHOT_INTERVAL_SECONDS}s')
                self.progress_var.set(0)
                return
            self.progress_var.set(SCREENSHOT_INTERVAL_SECONDS - remaining)
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