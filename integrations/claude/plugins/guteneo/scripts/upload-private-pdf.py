"""Explicit exact-byte transport only; never discovers OAuth credentials or retries."""
import hashlib
import json
import os
from pathlib import Path
import re
import signal
import stat
import sys
import urllib.request

MAX_BYTES = 10 * 1024 * 1024


class UploadError(Exception):
    pass


def original(root, relative):
    root = Path(root)
    if not root.is_absolute() or root.is_symlink():
        raise UploadError("UPLOAD_FILE_DENIED")
    root = root.resolve(strict=True)
    if root == Path(root.anchor) or root == Path.home():
        raise UploadError("UPLOAD_FILE_DENIED")
    parts = relative.split("/")
    if not parts or any(part in ("", ".", "..") or re.search(r"[\\\x00-\x1f\x7f:]", part) for part in parts):
        raise UploadError("UPLOAD_FILE_DENIED")
    path = root
    for part in parts:
        path = path / part
        if path.is_symlink():
            raise UploadError("UPLOAD_FILE_DENIED")
    if not path.is_relative_to(root) or path.resolve(strict=True) != path:
        raise UploadError("UPLOAD_FILE_DENIED")
    descriptor = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    try:
        before = os.fstat(descriptor)
        if not stat.S_ISREG(before.st_mode) or before.st_nlink != 1 or not 20 <= before.st_size <= MAX_BYTES:
            raise UploadError("UPLOAD_FILE_DENIED")
        # Claude's computing environment is Linux: pin the opened descriptor,
        # including parent-directory races, before reading any bytes.
        if sys.platform.startswith("linux") and Path(f"/proc/self/fd/{descriptor}").resolve() != path:
            raise UploadError("UPLOAD_FILE_CHANGED")
        with os.fdopen(descriptor, "rb", closefd=False) as file:
            data = file.read(MAX_BYTES + 1)
        after, current = os.fstat(descriptor), os.stat(path, follow_symlinks=False)
        checked = root
        for part in parts:
            checked = checked / part
            if checked.is_symlink():
                raise UploadError("UPLOAD_FILE_CHANGED")
        if root.resolve(strict=True) != root or path.resolve(strict=True) != path:
            raise UploadError("UPLOAD_FILE_CHANGED")
        fields = ("st_dev", "st_ino", "st_size", "st_mtime_ns", "st_ctime_ns")
        if any(getattr(before, key) != getattr(after, key) or getattr(after, key) != getattr(current, key) for key in fields):
            raise UploadError("UPLOAD_FILE_CHANGED")
        if len(data) != before.st_size or not data.startswith(b"%PDF-"):
            raise UploadError("UPLOAD_FILE_DENIED")
        return data, {"fileName": path.name, "size": len(data), "sha256": hashlib.sha256(data).hexdigest()}
    finally:
        os.close(descriptor)


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise UploadError("UPLOAD_UNCONFIRMED")


def upload(data, metadata, reservation, opener=None):
    reservation = reservation.get("structuredContent", reservation)
    view = reservation.get("data", reservation)
    grant = view.get("upload", {})
    upload_id = view.get("uploadId", "")
    expected_url = "https://guteneo.com/api/document-uploads/" + upload_id + "/content"
    if (not re.fullmatch(r"upl_[a-f0-9-]{36}", upload_id)
            or view.get("status") != "reserved" or grant.get("method") != "PUT"
            or grant.get("url") != expected_url
            or grant.get("capabilityHeader") != "X-Guteneo-Upload-Capability"
            or not re.fullmatch(r"[a-f0-9]{64}", grant.get("capability", ""))):
        raise UploadError("UPLOAD_RESERVATION_INVALID")
    # The caller supplies the exact inspected metadata from this original.
    if hashlib.sha256(data).hexdigest() != metadata["sha256"] or len(data) != metadata["size"]:
        raise UploadError("UPLOAD_FILE_CHANGED")
    request = urllib.request.Request(expected_url, method="PUT", data=data, headers={
        "Content-Type": "application/pdf", "Content-Length": str(len(data)),
        "X-Guteneo-Upload-Capability": grant["capability"], "Accept": "application/json",
    })
    # No cookie jar or auth handler. Preserve the host's normal network proxy
    # and egress controls; this client never chooses or bypasses those policies.
    opener = opener or urllib.request.build_opener(NoRedirect())
    try:
        with opener.open(request, timeout=30) as response:
            body = response.read(16 * 1024 + 1)
            if len(body) > 16 * 1024 or response.status != 202:
                raise UploadError("UPLOAD_UNCONFIRMED")
            receipt = json.loads(body)
            if receipt != {"uploadId": upload_id, "status": "received"}:
                raise UploadError("UPLOAD_UNCONFIRMED")
        return {"uploadId": upload_id, "binaryAccepted": True, "sha256": metadata["sha256"], "size": len(data), "nextAction": "get_document_upload"}
    except Exception:
        # Even a timeout may follow acceptance. Never make another PUT here.
        raise UploadError("UPLOAD_UNCONFIRMED") from None


def main():
    if len(sys.argv) != 4 or sys.argv[1] not in ("inspect", "upload"):
        raise UploadError("UPLOAD_ARGUMENTS_INVALID")
    if not all(hasattr(os, name) for name in ("O_NOFOLLOW", "O_NONBLOCK")) or not hasattr(signal, "setitimer"):
        raise UploadError("UPLOAD_HOST_UNSUPPORTED")
    data, metadata = original(sys.argv[2], sys.argv[3])
    if sys.argv[1] == "inspect":
        return metadata
    if not hasattr(signal, "setitimer"):
        raise UploadError("UPLOAD_HOST_UNSUPPORTED")
    raw = sys.stdin.buffer.read(32 * 1024 + 1)
    if len(raw) > 32 * 1024:
        raise UploadError("UPLOAD_RESERVATION_INVALID")
    reservation = json.loads(raw)
    signal.signal(signal.SIGALRM, lambda *_: (_ for _ in ()).throw(UploadError("UPLOAD_UNCONFIRMED")))
    signal.setitimer(signal.ITIMER_REAL, 35)
    try:
        return upload(data, metadata, reservation)
    finally:
        signal.setitimer(signal.ITIMER_REAL, 0)


if __name__ == "__main__":
    try:
        print(json.dumps(main(), separators=(",", ":")))
    except Exception as error:
        print(json.dumps({"errorCode": str(error) if isinstance(error, UploadError) else "UPLOAD_FILE_OR_INPUT_INVALID", "nextAction": "get_document_upload_or_stop"}))
        sys.exit(1)
