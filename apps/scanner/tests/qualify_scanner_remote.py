"""Synthetic scanner-only qualification through a localhost remote binding bridge.

Run from apps/scanner after starting tests/wrangler.scanner-remote.jsonc.
Stdout contains one bounded JSON result; no response body or exception is logged.
"""
import contextlib
import datetime
import hashlib
import json
import re
import signal
import sys
import time
import urllib.error
import urllib.request

from qualify_docker import BUILD_ID, clean_pdf

BASE = "http://127.0.0.1:8799"
MAX_RESPONSE_BYTES = 4096
MAX_SIGNATURE_AGE_SECONDS = 48 * 60 * 60
WARMUP_SECONDS = 300
REQUEST_SECONDS = 30
VERSION_HEADER = "x-guteneo-worker-version"
BUILD_HEADER = "x-guteneo-scanner-build-id"
UUID = re.compile(r"[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}", re.I)
EICAR = b"X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*"


class QualificationError(Exception):
    """Only fixed internal codes reach the JSON report."""


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, _req, _fp, _code, _msg, _headers, _newurl):
        raise QualificationError("BRIDGE_REDIRECT_REJECTED")


@contextlib.contextmanager
def request_deadline(seconds):
    # CI runs on Linux. An alarm bounds even a response that trickles bytes below
    # the socket inactivity timeout; no request can extend the cold-start budget.
    def expired(_signum, _frame):
        raise TimeoutError("REQUEST_TIMEOUT")
    previous_handler = signal.signal(signal.SIGALRM, expired)
    previous_timer = signal.setitimer(signal.ITIMER_REAL, seconds)
    try:
        yield
    finally:
        signal.setitimer(signal.ITIMER_REAL, *previous_timer)
        signal.signal(signal.SIGALRM, previous_handler)


def request(path, data=None, media="application/pdf", timeout=REQUEST_SECONDS):
    if path not in ("/scanner/health", "/scanner/scan"):
        raise QualificationError("BRIDGE_PATH_REJECTED")
    req = urllib.request.Request(BASE + path, data=data,
                                 headers={"Content-Type": media})
    # Ignore HTTP_PROXY/HTTPS_PROXY: these fixtures can target only loopback.
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
    with request_deadline(timeout):
        try:
            response = opener.open(req, timeout=timeout)
        except urllib.error.HTTPError as error:
            response = error
        with response:
            raw = response.read(MAX_RESPONSE_BYTES + 1)
            if len(raw) > MAX_RESPONSE_BYTES:
                raise QualificationError("SCANNER_RESPONSE_TOO_LARGE")
            if response.headers.get_content_type() != "application/json":
                raise QualificationError("SCANNER_RESPONSE_INVALID")
            try:
                payload = json.loads(raw)
            except (ValueError, UnicodeError):
                raise QualificationError("SCANNER_RESPONSE_INVALID") from None
            if not isinstance(payload, dict):
                raise QualificationError("SCANNER_RESPONSE_INVALID")
            version = response.headers.get(VERSION_HEADER)
            if version is not None and not UUID.fullmatch(version):
                raise QualificationError("WORKER_VERSION_INVALID")
            build_id = response.headers.get(BUILD_HEADER)
            if build_id is not None and not BUILD_ID.fullmatch(build_id):
                raise QualificationError("SCANNER_BUILD_ID_INVALID")
            return response.status, payload, version.lower() if version else None, build_id


def engine_metadata(payload, now):
    engine = payload.get("engine")
    if (not isinstance(engine, dict) or engine.get("name") != "ClamAV"
            or not isinstance(engine.get("version"), str)
            or not re.fullmatch(r"[0-9]+(?:\.[0-9]+){1,3}", engine["version"])
            or type(engine.get("signatureVersion")) is not int
            or engine["signatureVersion"] < 1
            or not isinstance(engine.get("signatureDate"), str)):
        raise QualificationError("SCANNER_ENGINE_INVALID")
    try:
        built = datetime.datetime.fromisoformat(engine["signatureDate"])
        if built.utcoffset() is None:
            raise ValueError()
    except ValueError:
        raise QualificationError("SCANNER_SIGNATURE_DATE_INVALID") from None
    age = now - built.timestamp()
    if age < -300 or age > MAX_SIGNATURE_AGE_SECONDS:
        raise QualificationError("SCANNER_SIGNATURES_NOT_FRESH")
    # Project only known fields: unexpected provider diagnostics are not proof.
    return {key: engine[key] for key in (
        "name", "version", "signatureVersion", "signatureDate")}, max(0, round(age, 3))


def qualify(*, transport=request, monotonic=time.monotonic, sleep=time.sleep,
            now=time.time, require_worker_version=False, expected_build_id=None,
            expected_worker_version=None):
    started = monotonic()
    deadline = started + WARMUP_SECONDS
    failures = 0
    while monotonic() < deadline:
        try:
            status, health, worker_version, build_id = transport(
                "/scanner/health", timeout=min(REQUEST_SECONDS, deadline - monotonic()))
        except (TimeoutError, urllib.error.URLError, ConnectionError):
            status = 503
        if monotonic() >= deadline:
            raise QualificationError("SCANNER_WARMUP_TIMEOUT")
        if status == 200:
            if health.get("status") != "ready":
                raise QualificationError("SCANNER_HEALTH_INVALID")
            if ((expected_build_id is None or build_id == expected_build_id)
                    and (expected_worker_version is None or worker_version == expected_worker_version)):
                break
            # Container rollouts are asynchronous: only the newly built image
            # may begin qualification, even when old signatures are identical.
            status = 503
        if status != 503:
            raise QualificationError("SCANNER_HEALTH_STATUS_INVALID")
        failures += 1
        sleep(min(5, max(0, deadline - monotonic())))
    else:
        raise QualificationError("SCANNER_WARMUP_TIMEOUT")
    ready = round(monotonic() - started, 3)
    engine, _age = engine_metadata(health, now())
    if require_worker_version and not worker_version:
        raise QualificationError("WORKER_VERSION_REQUIRED")
    if require_worker_version and not build_id:
        raise QualificationError("SCANNER_BUILD_ID_REQUIRED")

    def checked(path, data=None, media="application/pdf"):
        status, result, version, observed_build = transport(path, data, media)
        if version != worker_version:
            raise QualificationError("WORKER_VERSION_CHANGED")
        # Empty/media requests are refused by the Worker before any container call.
        if status == 200 and observed_build != build_id:
            raise QualificationError("SCANNER_BUILD_ID_CHANGED")
        return status, result

    pdf = clean_pdf()
    began = monotonic()
    checks = {}
    for label, data, verdict in (("cleanPdf", pdf, "clean"), ("eicar", EICAR, "infected")):
        status, result = checked("/scanner/scan", data)
        if status != 200:
            raise QualificationError("SCANNER_SCAN_FAILED")
        expected_hash = hashlib.sha256(data).hexdigest()
        if result.get("sha256") != expected_hash or result.get("verdict") != verdict:
            raise QualificationError("SCANNER_SCAN_MISMATCH")
        observed_engine, _age = engine_metadata(result, now())
        if observed_engine != engine:
            raise QualificationError("SCANNER_ENGINE_CHANGED")
        checks[label] = {"sha256": expected_hash, "verdict": verdict}
        if label == "cleanPdf":
            warm_seconds = round(monotonic() - began, 3)
    if checked("/scanner/scan", b"")[0] != 400:
        raise QualificationError("SCANNER_EMPTY_NOT_REJECTED")
    if checked("/scanner/scan", pdf, "text/plain")[0] != 415:
        raise QualificationError("SCANNER_MEDIA_NOT_REJECTED")
    status, final_health = checked("/scanner/health")
    if status != 200 or final_health.get("status") != "ready":
        raise QualificationError("SCANNER_FINAL_HEALTH_INVALID")
    final_engine, age = engine_metadata(final_health, now())
    if final_engine != engine:
        raise QualificationError("SCANNER_ENGINE_CHANGED")
    return {
        "schemaVersion": 1, "status": "passed",
        "runtime": "cloudflare-private-scanner-binding",
        "checkedAt": datetime.datetime.fromtimestamp(now(), datetime.timezone.utc).isoformat(),
        "workerVersionId": worker_version, "buildId": build_id,
        "scannerReadySeconds": ready, "warmingFailures": failures,
        "warmScanSeconds": warm_seconds, "engine": engine,
        "signatureAgeSeconds": age,
        "maximumSignatureAgeSeconds": MAX_SIGNATURE_AGE_SECONDS,
        **checks, "emptyAndWrongTypeRejected": True,
        "customerDocuments": 0, "externalSends": 0,
    }


def main(argv=None):
    arguments = sys.argv[1:] if argv is None else argv
    try:
        options = {}
        index = 0
        while index < len(arguments):
            option = arguments[index]
            if option in options or option not in (
                    "--require-worker-version", "--expected-build-id", "--expected-worker-version"):
                raise QualificationError("QUALIFICATION_ARGUMENTS_INVALID")
            if option == "--require-worker-version":
                options[option] = True
                index += 1
                continue
            if index + 1 >= len(arguments):
                raise QualificationError("QUALIFICATION_ARGUMENTS_INVALID")
            value = arguments[index + 1]
            pattern = BUILD_ID if option == "--expected-build-id" else UUID
            if not pattern.fullmatch(value):
                raise QualificationError("QUALIFICATION_ARGUMENTS_INVALID")
            options[option] = value.lower()
            index += 2
        required = options.get("--require-worker-version", False)
        if options and not required:
            raise QualificationError("QUALIFICATION_ARGUMENTS_INVALID")
        result = qualify(require_worker_version=required,
                         expected_build_id=options.get("--expected-build-id"),
                         expected_worker_version=options.get("--expected-worker-version"))
    except QualificationError as error:
        result = {"schemaVersion": 1, "status": "failed", "code": str(error),
                  "customerDocuments": 0, "externalSends": 0}
    except Exception:
        result = {"schemaVersion": 1, "status": "failed", "code": "SCANNER_QUALIFICATION_FAILED",
                  "customerDocuments": 0, "externalSends": 0}
    print(json.dumps(result, sort_keys=True), flush=True)
    return 0 if result["status"] == "passed" else 1


if __name__ == "__main__":
    sys.exit(main())
