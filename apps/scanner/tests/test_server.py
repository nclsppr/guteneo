import datetime
import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("scanner_server", Path(__file__).parents[1] / "container/server.py")
server = importlib.util.module_from_spec(spec)
spec.loader.exec_module(server)


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


if __name__ == "__main__":
    unittest.main()
