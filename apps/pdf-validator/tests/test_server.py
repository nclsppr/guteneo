import copy
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import Mock, patch

BASE = Path(__file__).parent
spec = importlib.util.spec_from_file_location("validator_server", BASE.parent / "container/server.py")
server = importlib.util.module_from_spec(spec)
spec.loader.exec_module(server)
REPORTS = json.loads((BASE / "fixtures/reports.json").read_text())
DATA = (BASE / "fixtures/synthetic.pdf").read_bytes()


class ReportTests(unittest.TestCase):
    def run_report(self, profile="ua1", report=None, data=DATA, code=1):
        return server.normalize_report(json.dumps(report or REPORTS[profile]).encode(), data, profile, code)

    def test_actual_reports_for_every_offered_profile(self):
        for profile, report in REPORTS.items():
            with self.subTest(profile=profile):
                result = self.run_report(profile, report)
                self.assertFalse(result["compliant"])
                self.assertEqual(result["sha256"], hashlib.sha256(DATA).hexdigest())
                self.assertEqual(result["passedRules"] + result["failedRules"], len(server.RULES[profile]))
                self.assertEqual(sum(x["failedChecks"] for x in result["findings"]), result["failedChecks"])

    def test_real_compliant_pdf_a_report(self):
        report = json.loads((BASE / "fixtures/compliant-2b.json").read_text())
        data = (BASE / "fixtures/compliant-2b.pdf").read_bytes()
        result = self.run_report("2b", report, data, 0)
        self.assertTrue(result["compliant"])
        self.assertEqual(result["findings"], [])
        self.assertFalse(result["truncated"])

    def test_no_document_text_raw_errors_or_locations_leave_parser(self):
        report = copy.deepcopy(REPORTS["ua1"])
        job = report["report"]["jobs"][0]
        job["itemDetails"]["name"] = "private-document.pdf"
        rule = job["validationResult"][0]["details"]["ruleSummaries"][0]
        rule.update(description="private content", context="private location", errorMessage="private error")
        self.assertNotIn("private", json.dumps(self.run_report(report=report)))

    def test_incomplete_multiple_or_wrong_profile_jobs_fail_closed(self):
        mutations = [
            lambda r: r["report"]["jobs"].append(copy.deepcopy(r["report"]["jobs"][0])),
            lambda r: r["report"]["jobs"][0]["validationResult"].append(copy.deepcopy(r["report"]["jobs"][0]["validationResult"][0])),
            lambda r: r["report"]["jobs"][0]["validationResult"][0].update(jobEndStatus="maxFailures"),
            lambda r: r["report"]["jobs"][0]["validationResult"][0].update(profileName="PDF/A-1b validation profile"),
            lambda r: r["report"]["batchSummary"].update(failedParsingJobs=1),
            lambda r: r["report"]["batchSummary"].update(outOfMemory=1),
            lambda r: r["report"]["batchSummary"].update(veraExceptions=1),
            lambda r: r["report"]["batchSummary"].update(failedEncryptedJobs=1),
            lambda r: r["report"]["batchSummary"]["validationSummary"].update(successfulJobCount=0),
            lambda r: r["report"]["buildInformation"]["releaseDetails"][0].update(version="1.31.0"),
            lambda r: r["report"]["jobs"][0]["itemDetails"].update(size=999),
        ]
        for mutation in mutations:
            report = copy.deepcopy(REPORTS["ua1"])
            mutation(report)
            with self.subTest(mutation=mutation), self.assertRaises(server.ValidationError):
                self.run_report(report=report)

    def test_counts_and_exit_status_cannot_assert_success(self):
        for change in [
            {"failedRules": 0, "failedChecks": 0}, {"passedRules": 0},
            {"failedRules": True}, {"failedChecks": 1}, {"passedChecks": -1},
        ]:
            report = copy.deepcopy(REPORTS["ua1"])
            report["report"]["jobs"][0]["validationResult"][0]["details"].update(change)
            with self.subTest(change=change), self.assertRaises(server.ValidationError):
                self.run_report(report=report)
        for code in [0, 2, -9]:
            with self.subTest(code=code), self.assertRaises(server.ValidationError):
                self.run_report(code=code)

    def test_only_exact_official_rule_ids_are_reported(self):
        for field, value in [("specification", "private content"), ("clause", "7.1 private content"), ("clause", "9999"), ("testNumber", 9999)]:
            report = copy.deepcopy(REPORTS["ua1"])
            report["report"]["jobs"][0]["validationResult"][0]["details"]["ruleSummaries"][0][field] = value
            with self.subTest(field=field), self.assertRaises(server.ValidationError):
                self.run_report(report=report)

    def test_known_iso32005_tables_and_truncation_keep_full_totals(self):
        report = copy.deepcopy(REPORTS["ua2"])
        result = report["report"]["jobs"][0]["validationResult"][0]
        rules = sorted(server.RULES["ua2"])[:101]
        result["details"].update(
            passedRules=len(server.RULES["ua2"]) - len(rules), failedRules=len(rules), failedChecks=len(rules),
            ruleSummaries=[{"specification": spec, "clause": clause, "testNumber": test, "ruleStatus": "FAILED", "status": "failed", "failedChecks": 1} for spec, clause, test in rules],
        )
        normalized = self.run_report("ua2", report)
        self.assertTrue(normalized["truncated"])
        self.assertEqual(len(normalized["findings"]), 100)
        self.assertEqual(normalized["failedRules"], 101)
        self.assertTrue(any(clause.startswith("Table ") for spec, clause, _ in server.RULES["ua2"] if spec == "ISO 32005:2023"))

    def test_duplicates_oversized_or_invalid_json_fail_closed(self):
        for raw in [b'{"report":{},"report":{}}', b'{"report":NaN}', b'{}', b'{' , b' ' * (server.MAX_REPORT_BYTES + 1)]:
            with self.subTest(size=len(raw)), self.assertRaises(server.ValidationError):
                server.normalize_report(raw, DATA, "ua1", 1)
        report = copy.deepcopy(REPORTS["ua1"])
        rules = report["report"]["jobs"][0]["validationResult"][0]["details"]["ruleSummaries"]
        rules[-1] = copy.deepcopy(rules[0])
        with self.assertRaises(server.ValidationError):
            self.run_report(report=report)


class ProcessTests(unittest.TestCase):
    def test_timeout_kills_child_group(self):
        with self.assertRaisesRegex(server.ValidationError, "VALIDATION_TIMEOUT"):
            server.bounded_process([sys.executable, "-c", "import time;time.sleep(60)"], 0.2, 4096)

    def test_stdout_overflow_is_incomplete_and_stderr_is_discarded(self):
        with self.assertRaisesRegex(server.ValidationError, "VALIDATION_INCOMPLETE"):
            server.bounded_process([sys.executable, "-c", "import sys;sys.stdout.write('x'*65536)"], 5, 1024)
        raw, code = server.bounded_process([sys.executable, "-c", "import sys;sys.stderr.write('private error');sys.stdout.write('safe')"], 5, 1024)
        self.assertEqual((raw, code), (b"safe", 0))

    def test_exact_bytes_and_temporary_file_cleanup_on_success_and_failure(self):
        captured = []
        def engine(arguments, _seconds, _maximum, _env):
            path = Path(arguments[-1]); captured.append(path)
            self.assertEqual(path.read_bytes(), DATA)
            self.assertEqual(path.stat().st_mode & 0o777, 0o600)
            self.assertIn("-Xmx384m", _env["JAVA_OPTS"])
            self.assertIn("-XX:+UseSerialGC", _env["JAVA_OPTS"])
            self.assertIn("-XX:TieredStopAtLevel=1", _env["JAVA_OPTS"])
            return json.dumps(REPORTS["ua1"]).encode(), 1
        with patch.object(server, "bounded_process", side_effect=engine):
            server.validate_bytes(DATA, "ua1")
        self.assertTrue(all(not path.parent.exists() for path in captured))
        def failed_engine(arguments, *_args):
            captured.append(Path(arguments[-1]))
            raise server.ValidationError("VALIDATION_TIMEOUT")
        with patch.object(server, "bounded_process", side_effect=failed_engine), self.assertRaises(server.ValidationError):
            server.validate_bytes(DATA, "ua1")
        self.assertTrue(all(not path.parent.exists() for path in captured))

    def test_missing_engine_invalid_input_and_version_fail_closed(self):
        with self.assertRaisesRegex(server.ValidationError, "VALIDATOR_UNAVAILABLE"):
            server.bounded_process(["/nonexistent/private-engine"], 5, 1024)
        for data in [b"", b"private content", b"%PDF-" + bytes(server.MAX_BYTES)]:
            with self.assertRaises(server.ValidationError):
                server.validate_bytes(data, "ua1")
        for raw in [b"", b"veraPDF 1.31.0\n", b"private error\n"]:
            with patch.object(server, "bounded_process", return_value=(raw, 0)), self.assertRaises(server.ValidationError):
                server.check_engine()


class HttpTests(unittest.TestCase):
    def setUp(self):
        # Qualification counts every matching directory in its private runtime.
        # Node security tests run concurrently and may create guteneo-pdf-release-*
        # fixtures in the host temp root; those are not this validator's leftovers.
        self.runtime_directory = tempfile.TemporaryDirectory(prefix="guteneo-validator-test-")
        self.addCleanup(self.runtime_directory.cleanup)
        runtime = patch.object(server.tempfile, "tempdir", self.runtime_directory.name)
        runtime.start()
        self.addCleanup(runtime.stop)

    def handler(self, path="/validate?profile=ua1"):
        handler = server.Handler.__new__(server.Handler)
        handler.path = path
        handler.headers = {"Content-Type": "application/pdf", "Content-Length": str(len(DATA))}
        handler.connection = Mock()
        handler.rfile = io.BytesIO(DATA)
        handler.send_json = Mock()
        return handler

    def test_busy_does_not_run_or_release_another_request_lock(self):
        handler = self.handler(); lock = Mock(); lock.acquire.return_value = False
        with patch.object(server, "ENGINE_READY", True), patch.object(server, "VALIDATION_LOCK", lock), patch.object(server, "validate_bytes") as validate:
            handler.do_POST()
        handler.send_json.assert_called_once_with(503, {"code": "VALIDATOR_BUSY"})
        validate.assert_not_called(); lock.release.assert_not_called()

    def test_error_is_sanitized_and_lock_released(self):
        handler = self.handler(); lock = Mock(); lock.acquire.return_value = True
        with patch.object(server, "ENGINE_READY", True), patch.object(server, "VALIDATION_LOCK", lock), patch.object(server, "validate_bytes", side_effect=ValueError("private content")):
            handler.do_POST()
        handler.send_json.assert_called_once_with(503, {"code": "VALIDATION_INCOMPLETE"})
        lock.release.assert_called_once()

    def test_unknown_or_duplicate_parameters_do_not_reach_engine(self):
        for query in ["profile=unknown", "profile=ua1&profile=ua2", "profile=ua1&url=https://example.org"]:
            handler = self.handler("/validate?" + query)
            with patch.object(server, "validate_bytes") as validate:
                handler.do_POST()
            handler.send_json.assert_called_once_with(400, {"code": "INVALID_PROFILE"})
            validate.assert_not_called()

    def test_qualification_inspection_is_unavailable_without_explicit_mode(self):
        for path in ["/qualification/privacy", "/qualification/process-deadline"]:
            handler = self.handler(path)
            with patch.dict(server.os.environ, {"QUALIFICATION_ENABLED": "false"}), patch.object(server, "bounded_process") as process:
                handler.do_GET()
            handler.send_json.assert_called_once_with(404, {"code": "NOT_FOUND"})
            process.assert_not_called()

    def test_private_deadline_self_test_kills_real_process_and_cleans_temporary_directory(self):
        handler = self.handler("/qualification/process-deadline")
        with patch.dict(server.os.environ, {"QUALIFICATION_ENABLED": "true"}):
            handler.do_GET()
        handler.send_json.assert_called_once_with(200, {"code": "VALIDATION_TIMEOUT", "temporaryDirectories": 0})
        self.assertFalse(server.VALIDATION_LOCK.locked())

    def test_qualification_still_reports_leftovers_inside_its_runtime(self):
        leftover = Path(self.runtime_directory.name) / "guteneo-pdf-leftover"
        leftover.mkdir()
        for path in ["/qualification/privacy", "/qualification/process-deadline"]:
            with self.subTest(path=path):
                handler = self.handler(path)
                with patch.dict(server.os.environ, {"QUALIFICATION_ENABLED": "true"}):
                    handler.do_GET()
                expected = {"temporaryDirectories": 1}
                if path.endswith("process-deadline"):
                    expected["code"] = "VALIDATION_TIMEOUT"
                handler.send_json.assert_called_once_with(200, expected)
                self.assertTrue(leftover.exists())
                self.assertFalse(server.VALIDATION_LOCK.locked())


if __name__ == "__main__":
    unittest.main()
