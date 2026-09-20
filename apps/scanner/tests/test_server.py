import datetime
import importlib.util
import io
from pathlib import Path
import tempfile
import unittest
from unittest.mock import Mock, patch

spec = importlib.util.spec_from_file_location("scanner_server", Path(__file__).parents[1] / "container/server.py")
server = importlib.util.module_from_spec(spec)
spec.loader.exec_module(server)


class BuildIdentityTests(unittest.TestCase):
    def test_only_exact_image_file_identity_is_accepted(self):
        identity = "sha-" + "a" * 40 + "-run-123456-attempt-1"
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "scanner-build-id"
            self.assertIsNone(server.load_build_id(path))
            for value in ("", "unqualified", identity + "\n", "private text", identity):
                path.write_text(value, encoding="ascii")
                self.assertEqual(server.load_build_id(path), identity if value == identity else None)
            path.write_bytes(b"\xff")
            self.assertIsNone(server.load_build_id(path))

    def test_successful_and_failed_responses_keep_image_identity_outside_document_contract(self):
        identity = "sha-" + "a" * 40 + "-run-123456-attempt-1"
        for status, payload in ((200, {"status": "ready"}), (503, {"code": "SCANNER_NOT_READY"})):
            for value in (identity, None):
                handler = server.Handler.__new__(server.Handler)
                handler.send_response = Mock()
                handler.send_header = Mock()
                handler.end_headers = Mock()
                handler.wfile = io.BytesIO()
                with patch.object(server, "BUILD_ID", value):
                    handler.send_json(status, payload)
                headers = dict(call.args for call in handler.send_header.call_args_list)
                self.assertEqual(headers.get("x-guteneo-scanner-build-id"), value)
                self.assertNotIn(b"build", handler.wfile.getvalue())


class LocalQualificationIdentityTests(unittest.TestCase):
    def test_health_and_both_scan_results_require_one_consistent_identity(self):
        from qualify_docker import qualification_build_id
        identity = "sha-" + "a" * 40 + "-run-123456-attempt-1"
        self.assertEqual(qualification_build_id(*[{"buildId": identity}] * 3), identity)
        # Existing manual qualification remains available without claiming CI identity.
        self.assertIsNone(qualification_build_id({}, {}, {}))
        for values in ((identity, identity, None), (identity, identity.replace("attempt-1", "attempt-2"), identity), ("private text",) * 3):
            with self.subTest(values=values), self.assertRaises(AssertionError):
                qualification_build_id(*[{"buildId": value} for value in values])


class FreshnessTests(unittest.TestCase):
    def test_recent_loaded_database_is_accepted(self):
        now = datetime.datetime(2026, 9, 16, 12, tzinfo=datetime.timezone.utc).timestamp()
        result = server.parse_version("ClamAV 1.5.4/28125/Wed Sep 16 06:00:00 2026", now)
        self.assertEqual(result["signatureVersion"], 28125)

    def test_stale_and_future_databases_fail_closed(self):
        now = datetime.datetime(2026, 9, 16, 12, tzinfo=datetime.timezone.utc).timestamp()
        for value in ["ClamAV 1.5.4/28125/Sat Sep 12 06:00:00 2026", "ClamAV 1.5.4/28125/Thu Sep 17 06:00:00 2026"]:
            with self.subTest(value=value), self.assertRaisesRegex(server.ScanError, "SIGNATURES_STALE"):
                server.parse_version(value, now)

    def test_missing_database_metadata_is_never_clean(self):
        with self.assertRaises(server.ScanError):
            server.parse_version("ClamAV 1.5.4")


class FakeSocket:
    def __enter__(self):
        return self

    def __exit__(self, *_args):
        pass

    def sendall(self, _bytes):
        pass

    def settimeout(self, _seconds):
        pass


class VerdictTests(unittest.TestCase):
    def scan(self, reply, versions=None):
        metadata = {"name": "ClamAV", "signatureVersion": 12}
        with patch.object(server, "connect", return_value=FakeSocket()), patch.object(server, "reply", return_value=reply), patch.object(server, "engine_version", side_effect=versions or [metadata, metadata]):
            return server.scan_bytes(b"exact input")

    def test_only_exact_engine_ok_response_is_clean(self):
        import hashlib
        result = self.scan("stream: OK")
        self.assertEqual(result["verdict"], "clean")
        self.assertEqual(result["sha256"], hashlib.sha256(b"exact input").hexdigest())

    def test_real_engine_findings_include_limit_heuristics_as_non_clean(self):
        for response in ["stream: Win.Test.EICAR_HDB-1 FOUND", "stream: Heuristics.Limits.Exceeded FOUND"]:
            self.assertEqual(self.scan(response)["verdict"], "infected")

    def test_errors_or_partial_responses_never_become_clean(self):
        for response in ["stream: ERROR", "OK", "stream: OK extra", "INSTREAM size limit exceeded. ERROR", ""]:
            with self.subTest(response=response), self.assertRaises(server.ScanError):
                self.scan(response)

    def test_database_change_invalidates_scan(self):
        with self.assertRaisesRegex(server.ScanError, "SIGNATURES_CHANGED"):
            self.scan("stream: OK", [{"signatureVersion": 1}, {"signatureVersion": 2}])

    def test_size_limit_checked_before_engine_access(self):
        with patch.object(server, "connect") as connect:
            for data in [b"", bytes(server.MAX_BYTES + 1)]:
                with self.assertRaises(server.ScanError):
                    server.scan_bytes(data)
            connect.assert_not_called()


class DiagnosticTests(unittest.TestCase):
    def test_missing_or_refused_engine_socket_is_not_ready(self):
        for error in [FileNotFoundError("private socket"), ConnectionRefusedError("private socket")]:
            sock = Mock()
            sock.connect.side_effect = error
            with self.subTest(error=type(error).__name__), patch.object(server.socket, "socket", return_value=sock):
                with self.assertRaises(server.ScanError) as caught:
                    server.connect()
                self.assertEqual(caught.exception.args, ("SCANNER_NOT_READY",))
                self.assertEqual(server.scan_error_code(caught.exception), "SCANNER_NOT_READY")
                sock.close.assert_called_once()

    def test_only_exact_known_engine_failures_have_specific_codes(self):
        cases = [
            (server.ScanError("SIGNATURES_STALE"), "SIGNATURES_STALE"),
            (server.ScanError("ENGINE_TIMEOUT"), "SCAN_TIMEOUT"),
            (server.socket.timeout("private timeout detail"), "SCAN_TIMEOUT"),
            (server.ScanError("SIGNATURES_STALE private detail"), "SCAN_INCOMPLETE"),
            (server.ScanError("SIGNATURES_CHANGED"), "SCAN_INCOMPLETE"),
            (server.ScanError("private finding"), "SCAN_INCOMPLETE"),
            (ValueError("private parser detail"), "SCAN_INCOMPLETE"),
            (FileNotFoundError("unrelated missing file"), "SCAN_INCOMPLETE"),
        ]
        for error, expected in cases:
            with self.subTest(expected=expected):
                self.assertEqual(server.scan_error_code(error), expected)

    def handler(self, path):
        handler = server.Handler.__new__(server.Handler)
        handler.path = path
        handler.headers = {"Content-Type": "application/pdf", "Content-Length": "5"}
        handler.connection = Mock()
        handler.rfile = io.BytesIO(b"exact")
        handler.send_json = Mock()
        return handler

    def test_scan_failures_return_sanitized_code_and_release_capacity(self):
        handler = self.handler("/scan")
        lock = Mock()
        lock.acquire.return_value = True
        with patch.object(server, "SCAN_LOCK", lock), patch.object(server, "scan_bytes", side_effect=TimeoutError("private engine detail")):
            handler.do_POST()
        handler.send_json.assert_called_once_with(503, {"verdict": "error", "code": "SCAN_TIMEOUT"})
        lock.release.assert_called_once()

    def test_busy_scan_does_not_invoke_engine_or_release_someone_elses_lock(self):
        handler = self.handler("/scan")
        lock = Mock()
        lock.acquire.return_value = False
        with patch.object(server, "SCAN_LOCK", lock), patch.object(server, "scan_bytes") as scan:
            handler.do_POST()
        handler.send_json.assert_called_once_with(503, {"verdict": "error", "code": "SCANNER_BUSY"})
        scan.assert_not_called()
        lock.release.assert_not_called()

    def test_health_failures_are_not_ready_and_do_not_expose_exception_text(self):
        handler = self.handler("/health")
        with patch.object(server, "engine_version", side_effect=server.ScanError("SIGNATURES_STALE")):
            handler.do_GET()
        handler.send_json.assert_called_once_with(503, {"status": "unavailable", "code": "SIGNATURES_STALE"})


if __name__ == "__main__":
    unittest.main()
