#!/bin/bash
set -euo pipefail
source "$(dirname "$0")/common.sh"

if [[ "${1:-}" == --help ]]; then
  printf '%s\n' 'Usage: export-screenshots.sh /chemin/Tests.xcresult' \
    'Exporte localement les captures XCTest et leur manifeste, sans modifier les images.'
  exit 0
fi
[[ $# == 1 && -d "$1" ]] || {
  printf '%s\n' 'Fournissez un résultat XCTest .xcresult existant.' >&2
  exit 64
}
result_path="$(cd "$1" && pwd)"
mkdir -p "$GUTENEO_BUILD_ROOT/Screenshots"
output_path="$(mktemp -d "$GUTENEO_BUILD_ROOT/Screenshots/run-XXXXXX")"
"$DEVELOPER_DIR/usr/bin/xcresulttool" export attachments \
  --path "$result_path" --output-path "$output_path" --filter '*.png'
printf 'Captures : %s\n' "$output_path"
