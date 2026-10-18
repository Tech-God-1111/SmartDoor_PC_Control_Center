"""Local SmartDoor web control center. Start: py smartdoor_pc.py"""
import json
import threading
import time
from collections import deque
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

try:
    import serial
    from serial.tools import list_ports
except ImportError:
    serial = list_ports = None

ROOT = Path(__file__).resolve().parent
HOST, PORT = "127.0.0.1", 8765
# Only requests that really come from this dashboard are accepted. Without this, any web
# page open in your browser could POST to http://127.0.0.1:8765/api/command and move the servo.
ALLOWED_HOSTS = {f"127.0.0.1:{PORT}", f"localhost:{PORT}"}
ALLOWED_ORIGINS = {f"http://127.0.0.1:{PORT}", f"http://localhost:{PORT}"}
MAX_BODY = 4096
devices = {"PIR": {"name": "Arduino #1 · PIR", "port": "COM10", "status": "offline", "worker": None},
           "SERVO": {"name": "Arduino #2 · Servo", "port": "COM11", "status": "offline", "worker": None}}
events = deque(maxlen=250)
motion = "Waiting for Arduino #1"
mutex = threading.RLock()
_ports_cache = (0.0, [])


def set_motion(value):
    global motion
    with mutex:
        motion = value


def com_ports():
    """Listing COM ports is slow on Windows, so cache it for a few seconds."""
    global _ports_cache
    now = time.time()
    if now - _ports_cache[0] > 3 and list_ports:
        _ports_cache = (now, [p.device for p in list_ports.comports()])
    return _ports_cache[1]


def log(message):
    with mutex:
        events.appendleft({"time": datetime.now().strftime("%H:%M:%S"), "message": message})


class Worker:
    def __init__(self, key, port):
        self.key, self.port, self.stop_event = key, port, threading.Event()
        self.commands, self.ser = deque(), None

    def send(self, command):
        with mutex:
            self.commands.append(command)

    def stop(self):
        self.stop_event.set()
        try:
            if self.ser:
                self.ser.close()
        except Exception:
            pass

    def run(self):
        try:
            self.ser = serial.Serial(self.port, 115200, timeout=.2, write_timeout=.5)
            time.sleep(2)
            with mutex:
                if devices[self.key]["worker"] is not self:
                    return
                devices[self.key]["status"] = "online"
            log(f"{self.key}: connected on {self.port}")
            while not self.stop_event.is_set():
                with mutex:
                    commands = list(self.commands)
                    self.commands.clear()
                for command in commands:
                    self.ser.write((command + "\n").encode())
                    log(f"{self.key}: sent {command}")
                line = self.ser.readline().decode(errors="replace").strip()
                if line:
                    log(f"{self.key}: {line}")
                    if self.key == "PIR":
                        upper = line.upper()
                        if "MOTION DETECTED" in upper:
                            set_motion("Motion detected")
                        elif "NO MOTION" in upper:
                            set_motion("No motion")
                        elif "WARMING" in upper:
                            set_motion("Sensor warming up")
        except Exception as exc:
            if not self.stop_event.is_set():
                log(f"{self.key}: {exc}")
                with mutex:
                    if devices[self.key]["worker"] is self:
                        devices[self.key]["status"] = "error"
        finally:
            try:
                if self.ser:
                    self.ser.close()
            except Exception:
                pass
            with mutex:
                if devices[self.key]["worker"] is self:
                    devices[self.key]["worker"] = None
                    # keep "error" visible instead of instantly overwriting it with "offline"
                    if devices[self.key]["status"] != "error":
                        devices[self.key]["status"] = "offline"
            if self.key == "PIR":
                set_motion("Waiting for Arduino #1")  # don't leave a stale "Motion detected"
            log(f"{self.key}: disconnected")


class AppHandler(BaseHTTPRequestHandler):
    def reply(self, code, body, content_type="application/json; charset=utf-8"):
        data = body if isinstance(body, bytes) else body.encode()
        self.send_response(code)
        self.send_header("Content-Type", content_type)
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def allowed(self):
        """Reject spoofed Host headers (DNS rebinding) and requests from other websites."""
        if self.headers.get("Host", "") not in ALLOWED_HOSTS:
            return False
        origin = self.headers.get("Origin")
        return origin is None or origin in ALLOWED_ORIGINS

    def do_GET(self):
        if not self.allowed():
            return self.reply(403, json.dumps({"error": "Forbidden."}))
        route = urlparse(self.path).path
        if route == "/api/state":
            with mutex:
                payload = {key: {field: value for field, value in item.items() if field != "worker"}
                           for key, item in devices.items()}
                payload.update(motion=motion, events=list(events),
                               ports=com_ports(),
                               serial_available=serial is not None)
            return self.reply(200, json.dumps(payload))
        assets = {"/": ("index.html", "text/html; charset=utf-8"),
                  "/index.html": ("index.html", "text/html; charset=utf-8"),
                  "/dashboard.html": ("dashboard.html", "text/html; charset=utf-8"),
                  "/styles.css": ("styles.css", "text/css; charset=utf-8"),
                  "/dashboard.js": ("dashboard.js", "text/javascript; charset=utf-8")}
        if route not in assets:
            return self.send_error(404)
        filename, mime = assets[route]
        self.reply(200, (ROOT / filename).read_bytes(), mime)

    def do_POST(self):
        if not self.allowed():
            return self.reply(403, json.dumps({"error": "Forbidden."}))
        # Browsers only send application/json cross-site after a CORS preflight, which this server refuses.
        if not self.headers.get("Content-Type", "").lower().startswith("application/json"):
            return self.reply(415, json.dumps({"error": "Content-Type must be application/json."}))
        try:
            length = int(self.headers.get("Content-Length", 0))
            if length > MAX_BODY:
                return self.reply(413, json.dumps({"error": "Request too large."}))
            data = json.loads(self.rfile.read(length) or b"{}")
            if not isinstance(data, dict):
                raise ValueError
        except (ValueError, json.JSONDecodeError):
            return self.reply(400, json.dumps({"error": "Send valid JSON."}))
        key = data.get("key")
        if key not in devices:
            return self.reply(400, json.dumps({"error": "Unknown device."}))
        route = urlparse(self.path).path
        if route == "/api/connect":
            if serial is None:
                return self.reply(503, json.dumps({"error": "Install pyserial: py -m pip install pyserial"}))
            port = str(data.get("port", "")).strip()
            if not port:
                return self.reply(400, json.dumps({"error": "Select a COM port."}))
            with mutex:
                current = devices[key]
                if current["worker"]:
                    current["worker"].stop()
                worker = Worker(key, port)
                current.update(port=port, status="connecting", worker=worker)
            threading.Thread(target=worker.run, daemon=True).start()
            log(f"{key}: opening {port}")
            return self.reply(200, '{"ok":true}')
        if route == "/api/disconnect":
            with mutex:
                worker = devices[key]["worker"]
                devices[key].update(worker=None, status="offline")
            if worker:
                worker.stop()
            log(f"{key}: disconnect requested")
            return self.reply(200, '{"ok":true}')
        if route == "/api/command":
            command = data.get("command")
            with mutex:
                worker = devices[key]["worker"]
                online = devices[key]["status"] == "online"
            if key != "SERVO" or command not in ("LOCK", "UNLOCK"):
                return self.reply(400, json.dumps({"error": "Servo accepts LOCK or UNLOCK only."}))
            if not worker or not online:
                return self.reply(409, json.dumps({"error": "Connect the servo Arduino first."}))
            worker.send(command)
            return self.reply(200, '{"ok":true}')
        self.send_error(404)

    def log_message(self, fmt, *args):
        pass


def main():
    try:
        server = ThreadingHTTPServer((HOST, PORT), AppHandler)
    except OSError as exc:
        raise SystemExit(f"Could not start on port {PORT}: {exc}\nIs another copy already running?")
    print(f"SmartDoor Control Center: http://{HOST}:{PORT}/")
    print("Press Ctrl+C to stop.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        with mutex:
            workers = [d["worker"] for d in devices.values() if d["worker"]]
            for d in devices.values():
                d.update(worker=None, status="offline")
        for worker in workers:
            worker.stop()
        server.server_close()


if __name__ == "__main__":
    main()
