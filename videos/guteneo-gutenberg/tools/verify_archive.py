#!/usr/bin/env python3
"""Verify archived bytes and handoff references offline; never generate media."""
from __future__ import annotations

import ast
import hashlib
import json
from pathlib import Path
import re
import sys
import zipfile

from archive_workspace import sanitize, TEXT

ROOT = Path(__file__).resolve().parents[1]
MEDIA = {'.mp4', '.mp3', '.wav', '.png', '.jpg', '.webp', '.zip'}
SECRET = re.compile(r'(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|Bearer [A-Za-z0-9._-]{30,})')


def main() -> int:
    manifest = json.loads((ROOT / 'inventory.json').read_text())
    failures = []
    large_manifest = json.loads((ROOT / 'large-media.json').read_text())
    parts_count = 0
    for entry in large_manifest['files']:
        checksum = hashlib.sha256()
        assembled_bytes = 0
        for part in entry['parts']:
            source = ROOT / part['path']
            if not source.is_file():
                failures.append('Missing binary part: ' + part['path'])
                continue
            content = source.read_bytes()
            if len(content) != part['bytes'] or hashlib.sha256(content).hexdigest() != part['sha256']:
                failures.append('Invalid binary part: ' + part['path'])
            checksum.update(content)
            assembled_bytes += len(content)
            parts_count += 1
        if assembled_bytes != entry['bytes'] or checksum.hexdigest() != entry['sha256']:
            failures.append('Lossless reassembly hash mismatch: ' + entry['path'])
    media_count = 0
    json_count = 0
    python_count = 0
    total_bytes = 0
    for entry in manifest['files']:
        relative = entry['archive_path']
        path = ROOT / relative
        if not path.is_file():
            failures.append(f'Missing file: {relative}')
            continue
        total_bytes += path.stat().st_size
        with path.open('rb') as stream:
            checksum = hashlib.file_digest(stream, 'sha256').hexdigest()
        if checksum != entry['archive_sha256'] or path.stat().st_size != entry['archive_bytes']:
            failures.append(f'Hash/size mismatch or incomplete file: {relative}')
        if path.suffix in MEDIA:
            media_count += 1
            if checksum != entry['source_sha256']:
                failures.append(f'Media differs from original source: {relative}')
        if path.suffix in TEXT:
            content = path.read_text()
            if sanitize(content)[1] or SECRET.search(content):
                failures.append(f'Unremoved access material: {relative}')
            if path.suffix == '.json':
                json.loads(content)
                json_count += 1
            if path.suffix == '.py':
                ast.parse(content, filename=relative)
                python_count += 1
        if path.suffix == '.zip':
            with zipfile.ZipFile(path) as archive:
                invalid_member = archive.testzip()
                if invalid_member:
                    failures.append(f'Corrupt ZIP member: {relative}')
                for member in archive.infolist():
                    if Path(member.filename).suffix in TEXT:
                        content = archive.read(member).decode('utf-8')
                        if sanitize(content)[1] or SECRET.search(content):
                            failures.append(f'Unremoved access material in ZIP: {member.filename}')
    handoff = json.loads((ROOT / 'handoff.json').read_text())
    for key in ('character_reference', 'latest_preview'):
        if not (ROOT / handoff[key]).is_file():
            failures.append(f'Missing handoff asset: {key}')
    historical = json.loads((ROOT / 'archive/production/final-production.json').read_text())
    if handoff['scripts'] != historical['script']:
        failures.append('Narration differs from the final approved script.')
    for i in range(1, 9):
        if not (ROOT / f'archive/production/audio/{i:02d}-voix.mp3').is_file():
            failures.append(f'Missing approved voice {i}')
    for path in (ROOT / 'tools').glob('*.py'):
        ast.parse(path.read_text(), filename=str(path.relative_to(ROOT)))
        python_count += 1
    report = {'passed': not failures, 'archived_files_checked': len(manifest['files']),
              'media_files_unchanged': media_count, 'archive_bytes': total_bytes,
              'json_files_parsed': json_count, 'python_files_parsed': python_count,
              'large_media_files_checked': len(large_manifest['files']),
              'binary_parts_checked': parts_count,
              'zip_crc_checked': True, 'approved_scripts_unchanged': handoff['scripts'] == historical['script'],
              'signed_url_and_known_secret_patterns_checked': True,
              'scope': 'Offline integrity and metadata verification; not a fresh audiovisual approval.',
              'failures': failures}
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if not failures else 1


if __name__ == '__main__':
    sys.exit(main())
