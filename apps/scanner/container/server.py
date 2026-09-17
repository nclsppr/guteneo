"""Private ClamAV INSTREAM bridge. Document bytes and findings are never logged."""
import datetime
import hashlib
import json
import os
import re
import signal
import socket
import struct
import subprocess
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

MAX_BYTES = 10 * 1024 * 1024
MAX_SIGNATURE_AGE = 72 * 60 * 60
SOCKET_PATH = "/tmp/clamav/clamd.sock"
SCAN_SECONDS = 18
SCAN_LOCK = threading.BoundedSemaphore(1)


class ScanError(Exception):
    pass


def scan_error_code(error):
    """Expose only fixed operational categories, never exception or finding text."""
    if isinstance(error, (TimeoutError, socket.timeout)):
        return "SCAN_TIMEOUT"
    if isinstance(error, ScanError):
        if error.args == ("ENGINE_TIMEOUT",):
            return "SCAN_TIMEOUT"
        if error.args == ("SCANNER_NOT_READY",):
            return "SCANNER_NOT_READY"
        if error.args == ("SIGNATURES_STALE",):
            return "SIGNATURES_STALE"
    return "SCAN_INCOMPLETE"


def reply(sock):
    result = bytearray()
    while len(result) <= 4096:
        chunk = sock.recv(4096 - len(result) + 1)
        if not chunk:
            break
        result.extend(chunk)
        if b"\0" in chunk or b"\n" in chunk:
            break
    if len(result) > 4096:
        raise ScanError("INVALID_ENGINE_RESPONSE")
    return bytes(result).rstrip(b"\0\n").decode("utf-8", errors="strict")


def connect():
    sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    sock.settimeout(SCAN_SECONDS)
    try:
        sock.connect(SOCKET_PATH)
        return sock
    except (FileNotFoundError, ConnectionRefusedError) as error:
        sock.close()
        raise ScanError("SCANNER_NOT_READY") from error
    except BaseException:
        sock.close()
        raise


def parse_version(raw, now=None):
    match = re.fullmatch(r"ClamAV ([0-9.]+)/([0-9]+)/(.+)", raw)
    if not match:
        raise ScanError("INVALID_ENGINE_VERSION")
    try:
        built = datetime.datetime.strptime(match[3], "%a %b %d %H:%M:%S %Y").replace(tzinfo=datetime.timezone.utc)
    except ValueError as error:
        raise ScanError("INVALID_SIGNATURE_DATE") from error
    age = (time.time() if now is None else now) - built.timestamp()
    if age < -300 or age > MAX_SIGNATURE_AGE:
        raise ScanError("SIGNATURES_STALE")
    return {"name": "ClamAV", "version": match[1], "signatureVersion": int(match[2]), "signatureDate": built.isoformat()}


def engine_version():
    with connect() as sock:
        sock.sendall(b"zVERSION\0")
        return parse_version(reply(sock))


def scan_bytes(data):
    if not data or len(data) > MAX_BYTES:
        raise ScanError("INVALID_SIZE")
    engine = engine_version()
    deadline = time.monotonic() + SCAN_SECONDS
    with connect() as sock:
        sock.sendall(b"zINSTREAM\0")
        for offset in range(0, len(data), 65536):
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise ScanError("ENGINE_TIMEOUT")
            sock.settimeout(remaining)
            chunk = data[offset:offset + 65536]
            sock.sendall(struct.pack(">I", len(chunk)) + chunk)
        sock.sendall(struct.pack(">I", 0))
        sock.settimeout(max(0.1, deadline - time.monotonic()))
        result = reply(sock)
    if result == "stream: OK":
        verdict = "clean"
    elif result.startswith("stream: ") and result.endswith(" FOUND"):
        verdict = "infected"
    else:
        raise ScanError("ENGINE_SCAN_FAILED")
    # A changed signature database must not make provenance ambiguous.
    if engine_version() != engine:
        raise ScanError("SIGNATURES_CHANGED")
    return {"sha256": hashlib.sha256(data).hexdigest(), "verdict": verdict, "engine": engine}


class Handler(BaseHTTPRequestHandler):
    server_version = "GuteneoScanner"
    sys_version = ""

    def log_message(self, _format, *_args):
        pass

    def send_json(self, status, payload):
        encoded = json.dumps(payload, separators=(",", ":")).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(encoded)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("Connection", "close")
        self.end_headers()
        try:
            self.wfile.write(encoded)
        except (BrokenPipeError, ConnectionResetError):
            pass
        self.close_connection = True

    def do_GET(self):
        if self.path != "/health":
            return self.send_json(404, {"verdict": "error", "code": "NOT_FOUND"})
        try:
            return self.send_json(200, {"status": "ready", "engine": engine_version()})
        except Exception as error:
            return self.send_json(503, {"status": "unavailable", "code": scan_error_code(error)})

    def do_POST(self):
        if self.path != "/scan":
            return self.send_json(404, {"verdict": "error", "code": "NOT_FOUND"})
        if self.headers.get("Transfer-Encoding") or self.headers.get("Content-Type", "").split(";")[0].strip() != "application/pdf":
            return self.send_json(415, {"verdict": "error", "code": "PDF_CONTENT_TYPE_REQUIRED"})
        length = self.headers.get("Content-Length", "")
        if not length.isdigit() or not 0 < int(length) <= MAX_BYTES:
            return self.send_json(413, {"verdict": "error", "code": "INVALID_SIZE"})
        if not SCAN_LOCK.acquire(blocking=False):
            return self.send_json(503, {"verdict": "error", "code": "SCANNER_BUSY"})
        try:
            self.connection.settimeout(10)
            data = self.rfile.read(int(length))
            if len(data) != int(length):
                raise ScanError("INCOMPLETE_BODY")
            self.send_json(200, scan_bytes(data))
        except Exception as error:
            self.send_json(503, {"verdict": "error", "code": scan_error_code(error)})
        finally:
            SCAN_LOCK.release()


class Server(ThreadingHTTPServer):
    daemon_threads = True
    request_queue_size = 8

    def handle_error(self, _request, _address):
        # Never dump request data or client metadata through tracebacks.
        pass


def main():
    os.makedirs("/tmp/clamav", mode=0o700, exist_ok=True)
    daemon = subprocess.Popen(["clamd", "--config-file=/etc/clamav/clamd.conf"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    def stop(_signum, _frame):
        daemon.terminate()
        raise SystemExit(0)
    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    try:
        Server(("0.0.0.0", 8080), Handler).serve_forever(poll_interval=0.25)
    finally:
        daemon.terminate()
        try:
            daemon.wait(timeout=5)
        except subprocess.TimeoutExpired:
            daemon.kill()
            daemon.wait()


if __name__ == "__main__":
    main()
