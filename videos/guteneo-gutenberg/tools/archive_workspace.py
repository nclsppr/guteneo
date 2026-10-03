#!/usr/bin/env python3
"""Archive a local media workspace without publishing temporary access URLs.

No generation, download, upload or credential access. Media bytes are preserved.
Run from any directory: python3 tools/archive_workspace.py /path/to/guteneo
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import re
import shutil
from urllib.parse import parse_qsl

ROOT = Path(__file__).resolve().parents[1]
TEXT = {'.json', '.csv', '.md', '.txt', '.py', '.js', '.html', '.vtt'}
URL = re.compile(r'https?://[^\s<>"\'\\]+')
SENSITIVE = re.compile(r'^(?:x-goog-.*|x-amz-.*|signature|sig|token|access_token|id_token|refresh_token|oobcode|googleaccessid|awsaccesskeyid|key-pair-id|policy)$', re.I)


def digest(path: Path) -> str:
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def sanitize(text: str) -> tuple[str, int]:
    count = 0

    def clean(match: re.Match) -> str:
        nonlocal count
        value = match.group(0)
        base, separator, query = value.partition('?')
        if separator and any(SENSITIVE.match(key) for key, _ in parse_qsl(query)):
            count += 1
            return base
        return value

    return URL.sub(clean, text), count


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path)
    args = parser.parse_args()
    source = args.source.resolve()
    destination = ROOT / 'archive'
    if destination.exists():
        raise SystemExit('Refusing to overwrite an existing archive.')
    entries = []
    omitted = []
    for path in sorted(source.rglob('*')):
        if path.is_symlink():
            raise SystemExit(f'Unexpected symlink: {path.relative_to(source)}')
        if not path.is_file():
            continue
        relative = path.relative_to(source)
        original_hash = digest(path)
        if '__pycache__' in path.parts or path.suffix in {'.cache', '.pyc'}:
            omitted.append({'source_path': str(relative), 'bytes': path.stat().st_size,
                            'sha256': original_hash, 'reason': 'Rebuildable execution cache; no source media.'})
            continue
        target = destination / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        replacements = 0
        portability_change = False
        if path.suffix.lower() in TEXT:
            content, replacements = sanitize(path.read_text())
            if str(relative) == 'production/product/capture.py':
                old = "out=Path('/workspace/guteneo/production/product')"
                if old in content:
                    content = content.replace(old, 'out=Path(__file__).resolve().parent')
                    portability_change = True
            target.write_text(content)
            shutil.copystat(path, target)
        else:
            shutil.copy2(path, target)
        entries.append({'source_path': str(relative), 'archive_path': str(target.relative_to(ROOT)),
                        'source_bytes': path.stat().st_size, 'archive_bytes': target.stat().st_size,
                        'source_sha256': original_hash, 'archive_sha256': digest(target),
                        'removed_signed_url_queries': replacements,
                        'portable_capture_output_path': portability_change})
    manifest = {'schema_version': 1, 'snapshot_date': '2026-10-03',
                'source_workspace': str(source), 'all_media_preserved_without_reencoding': True,
                'archived_file_count': len(entries), 'source_file_count': len(entries) + len(omitted),
                'source_bytes': sum(x['source_bytes'] for x in entries) + sum(x['bytes'] for x in omitted),
                'archive_bytes': sum(x['archive_bytes'] for x in entries),
                'signed_url_queries_removed': sum(x['removed_signed_url_queries'] for x in entries),
                'files': entries, 'omitted_rebuildable_caches': omitted}
    (ROOT / 'inventory.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({k: v for k, v in manifest.items() if k not in {'files', 'omitted_rebuildable_caches'}}, indent=2))


if __name__ == '__main__':
    main()
