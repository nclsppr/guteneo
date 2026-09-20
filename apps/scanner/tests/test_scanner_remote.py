"""Deterministic qualification checks; no hosted scanner or customer document."""
import copy
import datetime
from email.message import Message
import hashlib
import io
import json
import unittest
from unittest.mock import Mock, patch

import qualify_scanner_remote as remote

NOW = datetime.datetime(2026, 9, 20, 12, tzinfo=datetime.timezone.utc).timestamp()
VERSION = "c753afc4-9310-4738-b3f2-5110f55f611e"
BUILD_ID = "sha-" + "a" * 40 + "-run-123456-attempt-1"
ENGINE = {"name": "ClamAV", "version": "1.5.4", "signatureVersion": 28129,
          "signatureDate": "2026-09-20T06:00:00+00:00"}


class Clock:
    def __init__(self):
        self.elapsed = 0

    def monotonic(self):
        return self.elapsed

    def sleep(self, seconds):
        self.elapsed += seconds


class Fixture:
    def __init__(self, warming=0, change=None):
        self.warming = warming
        self.calls = []
        self.change = change

    def __call__(self, path, data=None, media="application/pdf", timeout=30):
        self.calls.append((path, data, media, timeout))
        if path == "/scanner/health":
            if self.warming:
                self.warming -= 1
                status, result = 503, {"status": "unavailable"}
            else:
                status, result = 200, {"status": "ready", "engine": copy.deepcopy(ENGINE)}
        elif media != "application/pdf":
            status, result = 415, {"code": "PDF_CONTENT_TYPE_REQUIRED"}
        elif data == b"":
            status, result = 400, {"code": "EMPTY_BODY"}
        else:
            status, result = 200, {"sha256": hashlib.sha256(data).hexdigest(),
                                   "verdict": "infected" if data == remote.EICAR else "clean",
                                   "engine": copy.deepcopy(ENGINE)}
        response = (status, result, VERSION, BUILD_ID if status == 200 else None)
        return self.change(path, data, response) if self.change else response


class QualificationTests(unittest.TestCase):
    def qualify(self, fixture=None, **options):
        clock = Clock()
        return remote.qualify(transport=fixture or Fixture(), now=lambda: NOW,
                              monotonic=clock.monotonic, sleep=clock.sleep,
                              require_worker_version=True, **options)

    def test_exact_synthetic_fixtures_and_version_are_qualified(self):
        fixture = Fixture(warming=2)
        proof = self.qualify(fixture)
        self.assertEqual(proof["status"], "passed")
        self.assertEqual(proof["workerVersionId"], VERSION)
        self.assertEqual(proof["buildId"], BUILD_ID)
        self.assertEqual(proof["engine"], ENGINE)
        self.assertEqual(proof["scannerReadySeconds"], 10)
        self.assertEqual(proof["warmingFailures"], 2)
        self.assertEqual(proof["signatureAgeSeconds"], 21600)
        self.assertEqual(proof["maximumSignatureAgeSeconds"], 172800)
        self.assertTrue(proof["emptyAndWrongTypeRejected"])
        self.assertEqual(proof["cleanPdf"]["sha256"], hashlib.sha256(remote.clean_pdf()).hexdigest())
        self.assertEqual(proof["eicar"]["verdict"], "infected")
        self.assertEqual(proof["customerDocuments"], 0)
        self.assertEqual(proof["externalSends"], 0)
        self.assertEqual({call[0] for call in fixture.calls}, {"/scanner/health", "/scanner/scan"})
        self.assertEqual({call[1] for call in fixture.calls}, {None, b"", remote.clean_pdf(), remote.EICAR})

    def test_cold_start_cannot_exceed_300_seconds_even_during_a_request(self):
        clock = Clock()
        timeouts = []
        def transport(_path, timeout):
            timeouts.append(timeout)
            clock.sleep(timeout)
            return 503, {}, None, None
        with self.assertRaisesRegex(remote.QualificationError, "SCANNER_WARMUP_TIMEOUT"):
            remote.qualify(transport=transport, now=lambda: NOW,
                           monotonic=clock.monotonic, sleep=clock.sleep)
        self.assertEqual(clock.elapsed, 300)
        self.assertEqual(timeouts[-1], 20)
        self.assertLessEqual(max(timeouts), 30)

    def test_hash_and_eicar_verdict_must_match_the_exact_inputs(self):
        for key, value in (("sha256", "0" * 64), ("verdict", "unknown")):
            def change(path, _data, response):
                status, result, version, build_id = response
                if path == "/scanner/scan":
                    result[key] = value
                return status, result, version, build_id
            with self.subTest(key=key), self.assertRaisesRegex(remote.QualificationError, "SCANNER_SCAN_MISMATCH"):
                self.qualify(Fixture(change=change))

    def test_scan_cannot_change_the_qualified_engine(self):
        def change(path, data, response):
            status, result, version, build_id = response
            if path == "/scanner/scan" and data:
                result["engine"]["signatureVersion"] += 1
            return status, result, version, build_id
        with self.assertRaisesRegex(remote.QualificationError, "SCANNER_ENGINE_CHANGED"):
            self.qualify(Fixture(change=change))

    def test_missing_or_changed_worker_version_fails_required_proof(self):
        for missing in (True, False):
            def change(path, _data, response):
                status, result, version, build_id = response
                return status, result, None if missing or path == "/scanner/scan" else version, build_id
            with self.subTest(missing=missing), self.assertRaisesRegex(remote.QualificationError, "WORKER_VERSION_(REQUIRED|CHANGED)"):
                self.qualify(Fixture(change=change))

    def test_empty_and_wrong_media_must_be_rejected(self):
        for rejection in (400, 415):
            def change(_path, _data, response):
                status, result, version, _build_id = response
                return (200 if status == rejection else status), result, version, BUILD_ID
            with self.subTest(rejection=rejection), self.assertRaisesRegex(remote.QualificationError, "SCANNER_(EMPTY|MEDIA)_NOT_REJECTED"):
                self.qualify(Fixture(change=change))

    def test_final_health_must_still_match_the_engine(self):
        fixture = Fixture()
        def change(path, _data, response):
            status, result, version, build_id = response
            if path == "/scanner/health" and len(fixture.calls) > 1:
                result["engine"]["signatureVersion"] += 1
            return status, result, version, build_id
        fixture.change = change
        with self.assertRaisesRegex(remote.QualificationError, "SCANNER_ENGINE_CHANGED"):
            self.qualify(fixture)

    def test_unknown_metadata_does_not_reach_the_proof(self):
        def change(_path, _data, response):
            status, result, _version, _build_id = response
            if "engine" in result:
                result["engine"]["debug"] = "private value"
            result["private"] = "private value"
            return response
        self.assertNotIn("private", json.dumps(self.qualify(Fixture(change=change))).replace("cloudflare-private-scanner-binding", ""))

    def test_missing_or_changed_container_identity_cannot_qualify_old_rollout(self):
        for stage in ("initial", "clean", "eicar", "final"):
            fixture = Fixture()
            def change(path, data, response):
                status, result, version, build_id = response
                if (stage == "initial" or stage == "clean" and data == remote.clean_pdf()
                        or stage == "eicar" and data == remote.EICAR
                        or stage == "final" and path == "/scanner/health" and len(fixture.calls) > 1):
                    build_id = None if stage == "initial" else BUILD_ID.replace("attempt-1", "attempt-2")
                return status, result, version, build_id
            fixture.change = change
            with self.subTest(stage=stage), self.assertRaisesRegex(remote.QualificationError, "SCANNER_BUILD_ID_(REQUIRED|CHANGED)"):
                self.qualify(fixture)

    def test_rollout_waits_for_new_image_even_with_identical_engine_signatures(self):
        fixture = Fixture()
        def change(_path, _data, response):
            status, result, version, build_id = response
            if len(fixture.calls) <= 2:
                build_id = BUILD_ID.replace("attempt-1", "attempt-2")
            return status, result, version, build_id
        fixture.change = change
        proof = self.qualify(fixture, expected_build_id=BUILD_ID)
        self.assertEqual(proof["scannerReadySeconds"], 10)
        self.assertEqual(proof["warmingFailures"], 2)
        self.assertEqual(proof["buildId"], BUILD_ID)
        self.assertTrue(all(call[0] == "/scanner/health" for call in fixture.calls[:3]))

    def test_old_image_cannot_wait_beyond_rollout_budget(self):
        fixture = Fixture()
        clock = Clock()
        with self.assertRaisesRegex(remote.QualificationError, "SCANNER_WARMUP_TIMEOUT"):
            remote.qualify(transport=fixture, now=lambda: NOW, monotonic=clock.monotonic,
                           sleep=clock.sleep, require_worker_version=True,
                           expected_build_id=BUILD_ID.replace("attempt-1", "attempt-2"))
        self.assertEqual(clock.elapsed, 300)
        self.assertTrue(all(call[0] == "/scanner/health" for call in fixture.calls))

    def test_old_worker_waits_before_qualification_but_cannot_change_during_scans(self):
        fixture = Fixture()
        def change(_path, _data, response):
            status, result, version, build_id = response
            if len(fixture.calls) == 1:
                version = "00000000-0000-4000-8000-000000000000"
            return status, result, version, build_id
        fixture.change = change
        proof = self.qualify(fixture, expected_build_id=BUILD_ID, expected_worker_version=VERSION)
        self.assertEqual(proof["warmingFailures"], 1)
        self.assertEqual(proof["workerVersionId"], VERSION)


class FreshnessTests(unittest.TestCase):
    def test_signature_age_boundary_is_48_hours(self):
        for age in (0, 172800):
            engine = {**ENGINE, "signatureDate": datetime.datetime.fromtimestamp(NOW-age, datetime.timezone.utc).isoformat()}
            self.assertEqual(remote.engine_metadata({"engine": engine}, NOW)[1], age)
        for age in (172801, -301):
            engine = {**ENGINE, "signatureDate": datetime.datetime.fromtimestamp(NOW-age, datetime.timezone.utc).isoformat()}
            with self.assertRaisesRegex(remote.QualificationError, "SCANNER_SIGNATURES_NOT_FRESH"):
                remote.engine_metadata({"engine": engine}, NOW)

    def test_missing_or_ambiguous_signature_metadata_fails(self):
        for engine in ({}, {**ENGINE, "signatureVersion": True}, {**ENGINE, "signatureDate": "2026-09-20T06:00:00"}, {**ENGINE, "signatureDate": "private text"}):
            with self.subTest(engine=engine), self.assertRaises(remote.QualificationError):
                remote.engine_metadata({"engine": engine}, NOW)


class HttpTests(unittest.TestCase):
    def response(self, body, media="application/json", version=VERSION, build_id=BUILD_ID):
        result = io.BytesIO(body)
        result.status = 200
        result.headers = Message()
        result.headers["Content-Type"] = media
        if version is not None:
            result.headers[remote.VERSION_HEADER] = version
        if build_id is not None:
            result.headers[remote.BUILD_HEADER] = build_id
        return result

    def test_response_read_is_bounded_and_json_typed(self):
        for body, media, code in ((b"x" * 4097, "application/json", "TOO_LARGE"),
                                 (b"{}", "text/plain", "INVALID"),
                                 (b"private invalid json", "application/json", "INVALID"),
                                 (b"[]", "application/json", "INVALID")):
            opener = Mock()
            opener.open.return_value = self.response(body, media)
            with patch.object(remote.urllib.request, "build_opener", return_value=opener), self.assertRaisesRegex(remote.QualificationError, code):
                remote.request("/scanner/health")

    def test_redirect_and_arbitrary_path_are_rejected(self):
        with self.assertRaisesRegex(remote.QualificationError, "REDIRECT_REJECTED"):
            remote.NoRedirect().redirect_request(None, None, 302, "", {}, "https://elsewhere.invalid")
        with patch.object(remote.urllib.request, "build_opener") as opener:
            with self.assertRaisesRegex(remote.QualificationError, "PATH_REJECTED"):
                remote.request("/documents/validate")
            opener.assert_not_called()

    def test_worker_header_is_validated_and_environment_proxies_are_disabled(self):
        opener = Mock()
        opener.open.return_value = self.response(b"{}", version="private header")
        with patch.object(remote.urllib.request, "build_opener", return_value=opener) as build:
            with self.assertRaisesRegex(remote.QualificationError, "WORKER_VERSION_INVALID"):
                remote.request("/scanner/health")
        self.assertEqual(build.call_args.args[0].proxies, {})

    def test_build_header_is_exact_and_cannot_contain_diagnostic_details(self):
        opener = Mock()
        opener.open.return_value = self.response(b"{}", build_id="private header")
        with patch.object(remote.urllib.request, "build_opener", return_value=opener), self.assertRaisesRegex(remote.QualificationError, "SCANNER_BUILD_ID_INVALID"):
            remote.request("/scanner/health")


class OutputTests(unittest.TestCase):
    def test_unexpected_errors_emit_only_one_sanitized_json_record(self):
        stdout = io.StringIO()
        with patch.object(remote, "qualify", side_effect=RuntimeError("token private detail")), patch("sys.stdout", stdout):
            code = remote.main(["--require-worker-version"])
        self.assertEqual(code, 1)
        self.assertEqual(len(stdout.getvalue().splitlines()), 1)
        self.assertNotIn("private", stdout.getvalue())
        self.assertEqual(json.loads(stdout.getvalue())["code"], "SCANNER_QUALIFICATION_FAILED")

    def test_success_outputs_the_proof_and_invalid_arguments_do_not_scan(self):
        for arguments, passed in (([], True), (["--require-worker-version"], True),
                                  (["--require-worker-version", "--expected-build-id", BUILD_ID], True),
                                  (["--require-worker-version", "--expected-build-id", BUILD_ID, "--expected-worker-version", VERSION], True),
                                  (["--require-worker-version", "--expected-build-id", "invalid"], False),
                                  (["--require-worker-version", "--require-worker-version"], False),
                                  (["--require-worker-version", "--expected-worker-version", "invalid"], False),
                                  (["--expected-build-id", BUILD_ID], False),
                                  (["https://elsewhere.invalid"], False)):
            stdout = io.StringIO()
            with patch.object(remote, "qualify", return_value={"status": "passed"}) as qualify, patch("sys.stdout", stdout):
                code = remote.main(arguments)
            self.assertEqual(code, 0 if passed else 1)
            if passed:
                qualify.assert_called_once_with(require_worker_version=bool(arguments),
                                                expected_build_id=BUILD_ID if "--expected-build-id" in arguments else None,
                                                expected_worker_version=VERSION if "--expected-worker-version" in arguments else None)
            else:
                qualify.assert_not_called()
            self.assertEqual(len(stdout.getvalue().splitlines()), 1)


if __name__ == "__main__":
    unittest.main()
