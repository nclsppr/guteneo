"""Real-process shutdown regressions; optional local Docker PID 1 proof."""

import http.client
import json
import os
from pathlib import Path
import signal
import socket
import subprocess
import sys
import tempfile
import threading
import time
import unittest


SERVER = Path(__file__).resolve().parent.parent / "container/server.py"
LAUNCHER = """
import importlib.util, os
from pathlib import Path
spec = importlib.util.spec_from_file_location('private_validator', os.environ['TEST_SERVER'])
server = importlib.util.module_from_spec(spec)
spec.loader.exec_module(server)
original = server.PrivateServer
class BoundServer(original):
    accepted = 0
    def server_activate(self):
        super().server_activate()
        Path(os.environ['TEST_PORT']).write_text(str(self.server_address[1]))
    def get_request(self):
        result = super().get_request()
        self.accepted += 1
        Path(os.environ['TEST_ACCEPTED']).write_text(str(self.accepted))
        return result
server.PrivateServer = BoundServer
original_handler = server.Handler
class ObservedInput:
    def __init__(self, stream):
        self.stream = stream
    def __getattr__(self, name):
        return getattr(self.stream, name)
    def read(self, size):
        Path(os.environ['TEST_REQUEST_PHASE']).write_text('body')
        return self.stream.read(size)
class ObservedHandler(original_handler):
    def setup(self):
        super().setup()
        self.rfile = ObservedInput(self.rfile)
    def parse_request(self):
        Path(os.environ['TEST_REQUEST_PHASE']).write_text('headers')
        return super().parse_request()
server.Handler = ObservedHandler
server.main(('127.0.0.1', 0))
"""
FAKE_CLI = """#!/usr/bin/env python3
import json, os, subprocess, sys, time
from pathlib import Path
mode = os.environ.get('TEST_ENGINE_MODE', 'idle')
version = '--version' in sys.argv
if version and mode != 'startup':
    print('veraPDF 1.30.2')
    sys.exit(0)
child = subprocess.Popen([sys.executable, '-c', 'import time; time.sleep(60)'], stdout=subprocess.DEVNULL)
if mode in ('closed-stdout', 'startup'):
    os.close(1)
Path(os.environ['TEST_ENGINE_MARKER']).write_text(json.dumps({
    'pid': os.getpid(), 'child': child.pid,
    'directory': None if version else str(Path(sys.argv[-1]).parent),
}))
time.sleep(60)
"""


def wait_until(predicate, seconds=5):
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        result = predicate()
        if result:
            return result
        time.sleep(0.02)
    raise AssertionError("Synthetic shutdown prerequisite did not complete")


def live_process(pid):
    result = subprocess.run(
        ["ps", "-o", "stat=", "-p", str(pid)], capture_output=True, text=True, timeout=2,
    )
    state = result.stdout.strip()
    return bool(state) and not state.startswith("Z")


@unittest.skipUnless(os.name == "posix", "POSIX signals and process groups required")
class ShutdownTests(unittest.TestCase):
    def setUp(self):
        self.fixture = tempfile.TemporaryDirectory(prefix="guteneo-shutdown-test-")
        self.addCleanup(self.fixture.cleanup)
        self.root = Path(self.fixture.name)
        self.runtime = self.root / "runtime"
        self.runtime.mkdir()
        self.port_file = self.root / "port"
        self.marker = self.root / "engine"
        self.accepted = self.root / "accepted"
        self.request_phase = self.root / "request-phase"
        self.process_count = 0
        self.cli = self.root / "fake-verapdf"
        self.cli.write_text(FAKE_CLI)
        self.cli.chmod(0o700)

    def start(self, mode="idle"):
        self.process_count += 1
        self.port_file = self.root / f"port-{self.process_count}"
        self.marker = self.root / f"engine-{self.process_count}"
        process = subprocess.Popen(
            [sys.executable, "-B", "-c", LAUNCHER], stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            env={**os.environ, "TEST_SERVER": str(SERVER), "TEST_PORT": str(self.port_file),
                 "TEST_ACCEPTED": str(self.accepted),
                 "TEST_REQUEST_PHASE": str(self.request_phase),
                 "TEST_ENGINE_MODE": mode, "TEST_ENGINE_MARKER": str(self.marker),
                 "VERAPDF_CLI": str(self.cli), "TMPDIR": str(self.runtime)},
        )
        self.addCleanup(self.cleanup_process, process, self.marker)
        return process

    def cleanup_process(self, process, marker_path):
        if process.poll() is None:
            process.kill()
        process.communicate(timeout=5)
        if marker_path.exists():
            marker = json.loads(marker_path.read_text())
            try:
                os.killpg(marker["pid"], signal.SIGKILL)
            except ProcessLookupError:
                pass

    def port(self):
        def read():
            try:
                return int(self.port_file.read_text())
            except (OSError, ValueError):
                return None
        return wait_until(read)

    def engine_marker(self):
        def read():
            try:
                return json.loads(self.marker.read_text())
            except (OSError, ValueError):
                return None
        return wait_until(read)

    def health(self):
        connection = http.client.HTTPConnection("127.0.0.1", self.port(), timeout=2)
        connection.request("GET", "/health")
        response = connection.getresponse()
        self.assertEqual(response.status, 200)
        self.assertEqual(json.loads(response.read()), {
            "status": "ready", "engine": {"name": "veraPDF", "version": "1.30.2"},
        })
        connection.close()

    def stop_cleanly(self, process, number=signal.SIGTERM, seconds=12):
        started = time.monotonic()
        process.send_signal(number)
        stdout, stderr = process.communicate(timeout=seconds)
        self.assertEqual(process.returncode, 0)
        self.assertEqual((stdout, stderr), (b"", b""))
        self.assertLess(time.monotonic() - started, seconds)

    def test_idle_sigterm_exits_cleanly_without_default_signal_termination(self):
        process = self.start()
        self.health()
        self.stop_cleanly(process)

    def test_startup_sigterm_kills_version_probe_even_after_stdout_closes(self):
        process = self.start("startup")
        marker = self.engine_marker()
        self.stop_cleanly(process)
        for pid in (marker["pid"], marker["child"]):
            wait_until(lambda: not live_process(pid))
        self.assertFalse(self.port_file.exists())

    def test_active_sigterm_cleans_private_file_and_entire_engine_group(self):
        for mode in ("active", "closed-stdout"):
            with self.subTest(mode=mode):
                self.port_file.unlink(missing_ok=True)
                self.marker.unlink(missing_ok=True)
                process = self.start(mode)
                self.health()
                connection = http.client.HTTPConnection("127.0.0.1", self.port(), timeout=12)
                connection.request("POST", "/validate?profile=ua1", b"%PDF-synthetic",
                                   {"Content-Type": "application/pdf"})
                marker = self.engine_marker()
                directory = Path(marker["directory"])
                self.assertTrue((directory / "input.pdf").is_file())
                self.stop_cleanly(process)
                response = connection.getresponse()
                self.assertEqual(response.status, 503)
                self.assertEqual(json.loads(response.read()), {"code": "VALIDATOR_UNAVAILABLE"})
                connection.close()
                self.assertFalse(directory.exists())
                self.assertEqual(list(self.runtime.glob("guteneo-pdf-*")), [])
                for pid in (marker["pid"], marker["child"]):
                    wait_until(lambda: not live_process(pid))

    def test_stalled_headers_cannot_hold_shutdown_workers_indefinitely(self):
        process = self.start()
        self.health()
        connection = socket.create_connection(("127.0.0.1", self.port()), timeout=2)
        self.addCleanup(connection.close)
        connection.sendall(b"GET /health HTTP/1.1\r\nHost: localhost\r\n")
        wait_until(lambda: self.accepted.exists() and self.accepted.read_text() == "2")
        # A complete health response above proves the real server is serving;
        # this request then deliberately withholds the end of its headers.
        self.stop_cleanly(process)

    def test_trickled_headers_and_body_cannot_extend_sigterm_shutdown(self):
        for phase in ("headers", "body"):
            with self.subTest(phase=phase):
                process = self.start()
                self.health()
                self.request_phase.unlink(missing_ok=True)
                connection = socket.create_connection(("127.0.0.1", self.port()), timeout=2)
                stop = threading.Event()

                def trickle():
                    while not stop.wait(0.1):
                        try:
                            connection.sendall(b"x")
                        except OSError:
                            return

                writer = threading.Thread(target=trickle)
                try:
                    if phase == "headers":
                        connection.sendall(b"GET /health HTTP/1.1\r\nHost: localhost\r\nX-Trickle: ")
                    else:
                        connection.sendall(
                            b"POST /validate?profile=ua1 HTTP/1.1\r\nHost: localhost\r\n"
                            b"Content-Type: application/pdf\r\nContent-Length: 65536\r\n\r\n%PDF-"
                        )
                    writer.start()
                    wait_until(lambda: self.request_phase.exists() and self.request_phase.read_text() == phase)
                    # The peer keeps sending more often than the existing 5s
                    # inactivity timeout throughout SIGTERM and communicate().
                    self.stop_cleanly(process, seconds=6)
                    self.assertFalse(self.marker.exists())
                finally:
                    stop.set()
                    connection.close()
                    if writer.ident is not None:
                        writer.join(timeout=3)
                        self.assertFalse(writer.is_alive())


@unittest.skipUnless(os.environ.get("PDF_VALIDATOR_PID1_IMAGE"), "Operator-only local Docker PID 1 proof")
class DockerPidOneTests(unittest.TestCase):
    def test_actual_server_pid_one_handles_sigterm_and_exits_zero(self):
        image = os.environ["PDF_VALIDATOR_PID1_IMAGE"]
        own_id = None

        def docker(*arguments, timeout=15):
            return subprocess.run(["docker", *arguments], capture_output=True, text=True,
                                  check=True, timeout=timeout).stdout.strip()

        with tempfile.TemporaryDirectory(prefix="guteneo-pid1-test-") as root:
            fixture = Path(root)
            fixture.chmod(0o755)
            cli = fixture / "fake-verapdf"
            cli.write_text(FAKE_CLI)
            cli.chmod(0o755)
            try:
                own_id = docker(
                    "run", "--pull=never", "-d", "--network", "none", "--read-only",
                    "--tmpfs", "/tmp:rw,noexec,nosuid,size=64m", "--cap-drop", "ALL",
                    "--security-opt", "no-new-privileges",
                    "--mount", f"type=bind,src={SERVER},dst=/app/server.py,readonly",
                    "--mount", f"type=bind,src={fixture},dst=/fixture,readonly",
                    "--env", "VERAPDF_CLI=/fixture/fake-verapdf", image,
                )

                def healthy():
                    try:
                        return docker("exec", own_id, "python3", "-c",
                                      "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8080/health',timeout=1)") == ""
                    except subprocess.SubprocessError:
                        return False

                wait_until(healthy, 15)
                self.assertIn("python", docker("exec", own_id, "cat", "/proc/1/comm"))
                docker("kill", "--signal", "SIGTERM", own_id)
                self.assertEqual(docker("wait", own_id, timeout=12), "0")
                self.assertEqual(docker("logs", own_id), "")
            finally:
                if own_id:
                    docker("rm", "--force", own_id)


if __name__ == "__main__":
    unittest.main()
