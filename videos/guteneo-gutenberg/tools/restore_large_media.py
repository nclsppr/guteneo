#!/usr/bin/env python3
"""Reassemble six large historical files offline, without recompression."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def digest(path: Path) -> str:
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def main() -> None:
    manifest = json.loads((ROOT / 'large-media.json').read_text())
    for entry in manifest['files']:
        target = ROOT / entry['path']
        if target.exists():
            if target.stat().st_size != entry['bytes'] or digest(target) != entry['sha256']:
                raise SystemExit(f'Refusing to replace a different existing file: {entry["path"]}')
            print('Already complete:', entry['path'])
            continue
        target.parent.mkdir(parents=True, exist_ok=True)
        temporary = target.with_name(target.name + '.restoring')
        checksum = hashlib.sha256()
        written = 0
        try:
            with temporary.open('xb') as output:
                for part in entry['parts']:
                    source = ROOT / part['path']
                    content = source.read_bytes()
                    if len(content) != part['bytes'] or hashlib.sha256(content).hexdigest() != part['sha256']:
                        raise ValueError('Invalid archive part: ' + part['path'])
                    output.write(content)
                    checksum.update(content)
                    written += len(content)
            if written != entry['bytes'] or checksum.hexdigest() != entry['sha256']:
                raise ValueError('Reconstructed file hash mismatch: ' + entry['path'])
            temporary.replace(target)
        except BaseException:
            temporary.unlink(missing_ok=True)
            raise
        print('Restored original bytes:', entry['path'])


if __name__ == '__main__':
    main()
