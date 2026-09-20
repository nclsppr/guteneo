"""Run harmless clean-PDF/EICAR qualification against the real local ClamAV image."""
import hashlib
import json
import re
import subprocess
import time
import uuid

NAME = "guteneo-scanner-qa-" + uuid.uuid4().hex[:10]
IMAGE = "guteneo-scanner:local"
BUILD_ID = re.compile(r"sha-[a-f0-9]{40}-run-[1-9][0-9]{0,19}-attempt-[1-9][0-9]{0,9}")


def clean_pdf(catalog_extra=b""):
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R" + (b" " + catalog_extra if catalog_extra else b"") + b" >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 100 100] /Contents 4 0 R >>",
        b"<< /Length 0 >>\nstream\n\nendstream",
    ]
    data = bytearray(b"%PDF-1.4\n")
    offsets = [0]
    for i, body in enumerate(objects, 1):
        offsets.append(len(data))
        data.extend(f"{i} 0 obj\n".encode() + body + b"\nendobj\n")
    xref = len(data)
    data.extend(b"xref\n0 5\n0000000000 65535 f \n")
    for offset in offsets[1:]:
        data.extend(f"{offset:010} 00000 n \n".encode())
    data.extend(f"trailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode())
    return bytes(data)


def request(path, body=None, length=None):
    script = """
import http.client, json, sys
body = sys.stdin.buffer.read()
client = http.client.HTTPConnection('127.0.0.1', 8080, timeout=25)
headers = {'Content-Type': 'application/pdf'}
if sys.argv[3] != 'none': headers['Content-Length'] = sys.argv[3]
client.request(sys.argv[1], sys.argv[2], body if sys.argv[1] == 'POST' else None, headers)
response = client.getresponse()
print(json.dumps({'status': response.status, 'body': json.loads(response.read()), 'buildId': response.getheader('x-guteneo-scanner-build-id')}))
"""
    result = subprocess.run(["docker", "exec", "-i", NAME, "python3", "-B", "-c", script, "GET" if body is None else "POST", path, "none" if length is None else str(length)], input=body or b"", capture_output=True, timeout=30)
    if result.returncode:
        raise RuntimeError("Local scanner request unavailable")
    return json.loads(result.stdout)


def qualification_build_id(*responses):
    values = [response.get("buildId") for response in responses]
    if not values or any(value != values[0] for value in values):
        raise AssertionError("Local scanner image identity changed")
    value = values[0]
    if value is not None and (not isinstance(value, str) or not BUILD_ID.fullmatch(value)):
        raise AssertionError("Local scanner image identity invalid")
    return value


def main():
    subprocess.run(["docker", "run", "--rm", "-d", "--platform", "linux/amd64", "--name", NAME, "--network", "none", "--memory", "4g", "--cpus", "0.5", "--read-only", "--tmpfs", "/tmp:rw,noexec,nosuid,size=128m", "--cap-drop", "ALL", "--security-opt", "no-new-privileges", IMAGE], check=True, capture_output=True)
    started = time.monotonic()
    try:
        health = None
        for _ in range(120):
            try:
                health = request("/health")
                if health["status"] == 200:
                    break
            except RuntimeError:
                pass
            time.sleep(1)
        if not health or health["status"] != 200:
            raise AssertionError("Real ClamAV never became ready with current signatures")
        cold = round(time.monotonic() - started, 3)
        pdf = clean_pdf()
        began = time.monotonic()
        clean = request("/scan", pdf)
        duration = round(time.monotonic() - began, 3)
        assert clean["status"] == 200 and clean["body"]["verdict"] == "clean", clean
        assert clean["body"]["sha256"] == hashlib.sha256(pdf).hexdigest()
        # Standard harmless antivirus test string; never real malware.
        eicar = b"X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*"
        positive = request("/scan", eicar)
        assert positive["status"] == 200 and positive["body"]["verdict"] == "infected", positive
        assert positive["body"]["sha256"] == hashlib.sha256(eicar).hexdigest()
        build_id = qualification_build_id(health, clean, positive)
        assert request("/scan", b"")["status"] == 413
        assert request("/scan", b"x", 10 * 1024 * 1024 + 1)["status"] == 413
        logs = subprocess.run(["docker", "logs", NAME], check=True, capture_output=True)
        assert not logs.stdout and not logs.stderr, "Container emitted logs"
        files = subprocess.run(["docker", "exec", NAME, "find", "/tmp/clamav", "-type", "f"], check=True, capture_output=True)
        assert not files.stdout.strip(), "Temporary scanner files remain"
        print(json.dumps({"runtime": "local-docker-linux-amd64", "buildId": build_id, "limits": {"memory": "4 GiB", "cpu": 0.5, "internet": False}, "coldReadySeconds": cold, "cleanScanSeconds": duration, "engine": health["body"]["engine"], "cleanPdf": clean["body"], "eicarVerdict": positive["body"]["verdict"], "eicarSha256": positive["body"]["sha256"], "oversizeRejected": True, "emptyRejected": True, "documentLogs": 0, "temporaryFilesRemaining": 0}, indent=2))
    finally:
        subprocess.run(["docker", "rm", "-f", NAME], capture_output=True)


if __name__ == "__main__":
    main()
