"""Harmless hosted qualification through the localhost-only remote binding bridge."""
import hashlib
import json
import time
import urllib.error
import urllib.request

from qualify_docker import clean_pdf

BASE = "http://127.0.0.1:8799"


def request(path, data=None, media="application/pdf"):
    req = urllib.request.Request(BASE + path, data=data, headers={"Content-Type": media})
    try:
        response = urllib.request.urlopen(req, timeout=40)
    except urllib.error.HTTPError as error:
        response = error
    return response.status, response.read(), response.headers.get("Content-Type", "")


def main():
    pdf = clean_pdf()
    expected = hashlib.sha256(pdf).hexdigest()
    status, raw, _ = request("/documents/validate", pdf)
    assert status == 200, ("hosted clean PDF parser", status, raw[:200])
    parsed = json.loads(raw)
    assert parsed == {"pages": 1, "sha256": expected}, parsed
    assert request("/documents/validate", b"This is not a PDF")[0] == 422
    assert request("/documents/validate", pdf[:-12])[0] == 422
    assert request("/documents/validate", clean_pdf(b"/OpenAction [3 0 R /Fit]"))[0] == 422
    print(json.dumps({"hostedPdfParser": parsed, "invalidTruncatedAndActiveRejected": True}), flush=True)

    status, rendered, content_type = request("/documents/render", json.dumps({"html": "<h1>Guteneo private qualification</h1><p>Synthetic document. No recipient and no send.</p>"}).encode(), "application/json")
    assert status == 200 and content_type.startswith("application/pdf") and rendered.startswith(b"%PDF-"), ("hosted HTML rendering", status, rendered[:200])
    status, raw, _ = request("/documents/validate", rendered)
    assert status == 200, ("rendered PDF parser", status)
    rendered_result = json.loads(raw)
    assert rendered_result["pages"] == 1 and rendered_result["sha256"] == hashlib.sha256(rendered).hexdigest(), rendered_result
    print(json.dumps({"hostedHtmlRenderer": rendered_result, "bytes": len(rendered)}), flush=True)

    started = time.monotonic()
    failures = 0
    while time.monotonic() - started < 300:
        status, raw, _ = request("/scanner/health")
        if status == 200:
            health = json.loads(raw)
            break
        failures += 1
        print(json.dumps({"scannerWarmingSeconds": round(time.monotonic() - started, 1), "status": status}), flush=True)
        time.sleep(5)
    else:
        raise AssertionError("Hosted scanner did not become healthy within five minutes")
    ready = round(time.monotonic() - started, 3)
    began = time.monotonic()
    status, raw, _ = request("/scanner/scan", pdf)
    assert status == 200, ("hosted clean scan", status, raw[:200])
    clean = json.loads(raw)
    assert clean["sha256"] == expected and clean["verdict"] == "clean", clean
    warm_seconds = round(time.monotonic() - began, 3)
    eicar = b"X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*"
    status, raw, _ = request("/scanner/scan", eicar)
    assert status == 200, ("hosted EICAR scan", status)
    infected = json.loads(raw)
    assert infected["sha256"] == hashlib.sha256(eicar).hexdigest() and infected["verdict"] == "infected", infected
    status, raw, _ = request("/scanner/scan", rendered)
    assert status == 200, ("hosted rendered PDF scan", status)
    scanned_render = json.loads(raw)
    assert scanned_render["sha256"] == rendered_result["sha256"] and scanned_render["verdict"] == "clean", scanned_render
    assert request("/scanner/scan", b"")[0] == 400
    assert request("/scanner/scan", pdf, "text/plain")[0] == 415
    print(json.dumps({"runtime": "cloudflare-private-service-bindings", "scannerReadySeconds": ready, "warmingFailures": failures, "warmScanSeconds": warm_seconds, "engine": health["engine"], "cleanPdf": clean, "eicarVerdict": infected["verdict"], "eicarSha256": infected["sha256"], "renderedPdfScanned": scanned_render, "emptyAndWrongTypeRejected": True, "customerDocuments": 0, "externalSends": 0}, indent=2), flush=True)


if __name__ == "__main__":
    main()
