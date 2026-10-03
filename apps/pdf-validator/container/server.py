"""Private, bounded veraPDF CLI service; never log documents or raw reports."""

import hashlib
import json
import os
from pathlib import Path
import selectors
import signal
import subprocess
import tempfile
import threading
import time
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlsplit

VERSION = "1.30.2"
JAVA_OPTIONS = "-Xms32m -Xmx384m -XX:ActiveProcessorCount=1 -XX:+UseSerialGC -XX:TieredStopAtLevel=1 -Djava.awt.headless=true"
CLI = os.environ.get("VERAPDF_CLI", "/opt/verapdf/verapdf")
MAX_BYTES = 10 * 1024 * 1024
MAX_REPORT_BYTES = 2 * 1024 * 1024
MAX_FINDINGS = 100
PROCESS_SECONDS = 40
BODY_SECONDS = 5
PROFILE_NAMES = {
    "ua1": "PDF/UA-1 validation profile",
    "ua2": "PDF/UA-2 + Tagged PDF validation profile",
    "1b": "PDF/A-1b validation profile",
    "2b": "PDF/A-2b validation profile",
    "3b": "PDF/A-3b validation profile",
    "4": "PDF/A-4 validation profile",
}
RULES = {
    profile: frozenset(tuple(rule) for rule in rules)
    for profile, rules in json.loads(
        Path(__file__).with_name("rules.json").read_text(encoding="utf-8")
    ).items()
}
VALIDATION_LOCK = threading.Lock()
ENGINE_READY = False


class ValidationError(Exception):
    """Only constant error codes may leave this process."""


def integer(value, minimum=0):
    if type(value) is not int or not minimum <= value <= 1_000_000:
        raise ValidationError("VALIDATION_INCOMPLETE")
    return value


def object_value(value):
    if type(value) is not dict:
        raise ValidationError("VALIDATION_INCOMPLETE")
    return value


def one(value):
    if type(value) is not list or len(value) != 1:
        raise ValidationError("VALIDATION_INCOMPLETE")
    return object_value(value[0])


def unique_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValidationError("VALIDATION_INCOMPLETE")
        result[key] = value
    return result


def reject_constant(_value):
    raise ValidationError("VALIDATION_INCOMPLETE")


def normalize_report(raw, data, profile, returncode):
    """Consume the actual 1.30.2 JSON schema, returning only fixed rule IDs."""
    if profile not in PROFILE_NAMES or len(raw) > MAX_REPORT_BYTES:
        raise ValidationError("VALIDATION_INCOMPLETE")
    try:
        root = json.loads(raw, object_pairs_hook=unique_object, parse_constant=reject_constant)
        report = object_value(object_value(root)["report"])
        releases = object_value(report["buildInformation"])["releaseDetails"]
        if type(releases) is not list or len(releases) != 3:
            raise ValidationError("VALIDATION_INCOMPLETE")
        identities = [(object_value(release)["id"], release["version"]) for release in releases]
        if set(identities) != {(name, VERSION) for name in ("core", "validation-model", "apps")}:
            raise ValidationError("VALIDATION_INCOMPLETE")
        job = one(report["jobs"])
        if object_value(job["itemDetails"])["size"] != len(data):
            raise ValidationError("VALIDATION_INCOMPLETE")
        result = one(job["validationResult"])
        if result["jobEndStatus"] != "normal" or result["profileName"] != PROFILE_NAMES[profile]:
            raise ValidationError("VALIDATION_INCOMPLETE")
        compliant = result["compliant"]
        if type(compliant) is not bool or returncode != (0 if compliant else 1):
            raise ValidationError("VALIDATION_INCOMPLETE")
        details = object_value(result["details"])
        passed_rules = integer(details["passedRules"])
        failed_rules = integer(details["failedRules"])
        failed_checks = integer(details["failedChecks"])
        integer(details["passedChecks"])
        if passed_rules + failed_rules != len(RULES[profile]):
            raise ValidationError("VALIDATION_INCOMPLETE")
        if compliant != (failed_rules == 0 and failed_checks == 0) or failed_checks < failed_rules:
            raise ValidationError("VALIDATION_INCOMPLETE")
        summaries = details["ruleSummaries"]
        if type(summaries) is not list or len(summaries) != failed_rules:
            raise ValidationError("VALIDATION_INCOMPLETE")
        findings = []
        seen = set()
        for rule in summaries:
            rule = object_value(rule)
            identity = (rule["specification"], rule["clause"], integer(rule["testNumber"], 1))
            if identity not in RULES[profile] or identity in seen:
                raise ValidationError("VALIDATION_INCOMPLETE")
            if rule["ruleStatus"] != "FAILED" or rule["status"] != "failed":
                raise ValidationError("VALIDATION_INCOMPLETE")
            count = integer(rule["failedChecks"], 1)
            seen.add(identity)
            findings.append({
                "specification": identity[0], "clause": identity[1],
                "testNumber": identity[2], "failedChecks": count,
            })
        if sum(finding["failedChecks"] for finding in findings) != failed_checks:
            raise ValidationError("VALIDATION_INCOMPLETE")
        batch = object_value(report["batchSummary"])
        if integer(batch["totalJobs"]) != 1 or batch["multiJob"] is not False:
            raise ValidationError("VALIDATION_INCOMPLETE")
        for field in ("outOfMemory", "veraExceptions", "failedEncryptedJobs", "failedParsingJobs"):
            if integer(batch[field]) != 0:
                raise ValidationError("VALIDATION_INCOMPLETE")
        for field in ("featuresSummary", "repairSummary"):
            summary = object_value(batch[field])
            if any(integer(summary[key]) != 0 for key in ("failedJobCount", "totalJobCount", "successfulJobCount")):
                raise ValidationError("VALIDATION_INCOMPLETE")
        summary = object_value(batch["validationSummary"])
        expected = {
            "failedJobCount": 0, "totalJobCount": 1, "successfulJobCount": 1,
            "compliantPdfaCount": int(compliant), "nonCompliantPdfaCount": int(not compliant),
        }
        if any(integer(summary[key]) != value for key, value in expected.items()):
            raise ValidationError("VALIDATION_INCOMPLETE")
        return {
            "sha256": hashlib.sha256(data).hexdigest(), "profile": profile,
            "engine": {"name": "veraPDF", "version": VERSION}, "compliant": compliant,
            "passedRules": passed_rules, "failedRules": failed_rules, "failedChecks": failed_checks,
            "truncated": failed_rules > MAX_FINDINGS, "findings": findings[:MAX_FINDINGS],
        }
    except ValidationError:
        raise
    except (KeyError, ValueError, TypeError, UnicodeError, OverflowError, RecursionError):
        raise ValidationError("VALIDATION_INCOMPLETE") from None


def bounded_process(arguments, seconds, maximum, env=None):
    """Kill the complete child process group on deadline or oversized stdout."""
    try:
        process = subprocess.Popen(
            arguments, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL, close_fds=True, start_new_session=True, env=env,
        )
    except (OSError, ValueError):
        raise ValidationError("VALIDATOR_UNAVAILABLE") from None
    output = bytearray()
    deadline = time.monotonic() + seconds
    try:
        with selectors.DefaultSelector() as selector:
            selector.register(process.stdout, selectors.EVENT_READ)
            while selector.get_map():
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    raise ValidationError("VALIDATION_TIMEOUT")
                for key, _events in selector.select(min(remaining, 0.1)):
                    chunk = os.read(key.fileobj.fileno(), 65536)
                    if not chunk:
                        selector.unregister(key.fileobj)
                        continue
                    if len(output) + len(chunk) > maximum:
                        raise ValidationError("VALIDATION_INCOMPLETE")
                    output.extend(chunk)
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise ValidationError("VALIDATION_TIMEOUT")
            try:
                returncode = process.wait(timeout=remaining)
            except subprocess.TimeoutExpired:
                raise ValidationError("VALIDATION_TIMEOUT") from None
            return bytes(output), returncode
    finally:
        # Also kill descendants after a parent exits; none may retain private files.
        try:
            os.killpg(process.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
        process.wait()
        process.stdout.close()


def check_engine():
    raw, code = bounded_process([CLI, "--version"], 20, 4096, {**os.environ, "JAVA_OPTS": JAVA_OPTIONS})
    if code != 0 or raw.splitlines()[:1] != [("veraPDF " + VERSION).encode("ascii")]:
        raise ValidationError("VALIDATOR_UNAVAILABLE")


def validate_bytes(data, profile):
    if profile not in PROFILE_NAMES:
        raise ValidationError("INVALID_PROFILE")
    if not data or len(data) > MAX_BYTES or not data.startswith(b"%PDF-"):
        raise ValidationError("INVALID_PDF")
    with tempfile.TemporaryDirectory(prefix="guteneo-pdf-") as directory:
        path = Path(directory) / "input.pdf"
        with path.open("xb") as stream:
            os.chmod(path, 0o600)
            stream.write(data)
        arguments = [
            CLI, "--flavour", profile, "--format", "json", "--loglevel", "0",
            "--maxfailures", "-1", "--maxfailuresdisplayed", "1",
            "--disableerrormessages", str(path),
        ]
        env = {**os.environ, "JAVA_OPTS": JAVA_OPTIONS + " -Djava.io.tmpdir=" + directory}
        raw, code = bounded_process(arguments, PROCESS_SECONDS, MAX_REPORT_BYTES, env)
        return normalize_report(raw, data, profile, code)


class Handler(BaseHTTPRequestHandler):
    server_version = "GuteneoPrivateValidator"

    def log_message(self, _format, *_args):
        pass

    def send_json(self, status, payload):
        body = json.dumps(payload, separators=(",", ":")).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("Connection", "close")
        self.end_headers()
        self.close_connection = True
        self.wfile.write(body)

    def do_GET(self):
        if self.path.startswith("/qualification/") and os.environ.get("QUALIFICATION_ENABLED") == "true":
            if self.path == "/qualification/privacy":
                return self.send_json(200, {"temporaryDirectories": len(list(Path(tempfile.gettempdir()).glob("guteneo-pdf-*")))})
            if self.path == "/qualification/process-deadline":
                if not VALIDATION_LOCK.acquire(blocking=False):
                    return self.send_json(503, {"code": "VALIDATOR_BUSY"})
                try:
                    # Exercise the real process-group deadline on harmless synthetic work.
                    # This is explicitly not a claim that a Java PDF timed out.
                    with tempfile.TemporaryDirectory(prefix="guteneo-pdf-"):
                        try:
                            bounded_process([sys.executable, "-c", "import time; time.sleep(1)"], 0.05, 1024)
                        except ValidationError as error:
                            if error.args == ("VALIDATION_TIMEOUT",):
                                result = {"code": "VALIDATION_TIMEOUT"}
                            else:
                                return self.send_json(503, {"code": "VALIDATION_INCOMPLETE"})
                        else:
                            return self.send_json(503, {"code": "VALIDATION_INCOMPLETE"})
                    result["temporaryDirectories"] = len(list(Path(tempfile.gettempdir()).glob("guteneo-pdf-*")))
                    return self.send_json(200, result)
                finally:
                    VALIDATION_LOCK.release()
        if self.path != "/health":
            return self.send_json(404, {"code": "NOT_FOUND"})
        if not ENGINE_READY:
            return self.send_json(503, {"code": "VALIDATOR_UNAVAILABLE"})
        self.send_json(200, {"status": "ready", "engine": {"name": "veraPDF", "version": VERSION}})

    def do_POST(self):
        parsed = urlsplit(self.path)
        query = parse_qs(parsed.query, keep_blank_values=True)
        if parsed.path != "/validate" or parsed.fragment:
            return self.send_json(404, {"code": "NOT_FOUND"})
        if set(query) != {"profile"} or len(query["profile"]) != 1 or query["profile"][0] not in PROFILE_NAMES:
            return self.send_json(400, {"code": "INVALID_PROFILE"})
        if self.headers.get("Content-Type", "").split(";")[0].strip().lower() != "application/pdf":
            return self.send_json(415, {"code": "PDF_CONTENT_TYPE_REQUIRED"})
        length = self.headers.get("Content-Length", "")
        if self.headers.get("Transfer-Encoding") or not length.isdecimal() or not 0 < int(length) <= MAX_BYTES:
            return self.send_json(413, {"code": "BODY_TOO_LARGE"})
        if not ENGINE_READY:
            return self.send_json(503, {"code": "VALIDATOR_UNAVAILABLE"})
        if not VALIDATION_LOCK.acquire(blocking=False):
            return self.send_json(503, {"code": "VALIDATOR_BUSY"})
        try:
            deadline = time.monotonic() + BODY_SECONDS
            data = bytearray()
            while len(data) < int(length):
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    raise ValidationError("VALIDATION_TIMEOUT")
                self.connection.settimeout(remaining)
                chunk = self.rfile.read(min(65536, int(length) - len(data)))
                if not chunk:
                    raise ValidationError("INVALID_PDF")
                data.extend(chunk)
            self.send_json(200, validate_bytes(bytes(data), query["profile"][0]))
        except (TimeoutError, ConnectionError):
            self.send_json(503, {"code": "VALIDATION_TIMEOUT"})
        except ValidationError as error:
            code = error.args[0] if error.args and error.args[0] in (
                "INVALID_PDF", "VALIDATOR_UNAVAILABLE", "VALIDATION_TIMEOUT", "VALIDATION_INCOMPLETE",
            ) else "VALIDATION_INCOMPLETE"
            self.send_json(400 if code == "INVALID_PDF" else 503, {"code": code})
        except Exception:
            self.send_json(503, {"code": "VALIDATION_INCOMPLETE"})
        finally:
            VALIDATION_LOCK.release()


class PrivateServer(ThreadingHTTPServer):
    daemon_threads = True

    def handle_error(self, _request, _client_address):
        # The standard implementation emits raw exception details to stderr.
        pass


if __name__ == "__main__":
    try:
        check_engine()
        ENGINE_READY = True
    except Exception:
        ENGINE_READY = False
    PrivateServer(("0.0.0.0", 8080), Handler).serve_forever()
