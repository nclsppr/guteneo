#!/bin/bash
# Shared local build settings. Sourcing this file never changes xcode-select.
set -euo pipefail

GUTENEO_IOS_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export DEVELOPER_DIR="${DEVELOPER_DIR:-/Applications/Xcode.app/Contents/Developer}"
GUTENEO_XCODEBUILD="$DEVELOPER_DIR/usr/bin/xcodebuild"
GUTENEO_PROJECT="$GUTENEO_IOS_ROOT/Guteneo.xcodeproj"
GUTENEO_BUILD_ROOT="${GUTENEO_BUILD_ROOT:-$GUTENEO_IOS_ROOT/.build}"
GUTENEO_DERIVED_DATA="$GUTENEO_BUILD_ROOT/DerivedData"

if [[ ! -x "$GUTENEO_XCODEBUILD" ]]; then
  printf '%s\n' 'Full Xcode is required. Set DEVELOPER_DIR to its Contents/Developer directory.' >&2
  exit 69
fi

guteneo_require_team() {
  if [[ ! "${GUTENEO_TEAM_ID:-}" =~ ^[A-Z0-9]{10}$ ]]; then
    printf '%s\n' 'Set GUTENEO_TEAM_ID to your 10-character Apple Developer team identifier.' >&2
    exit 64
  fi
}
