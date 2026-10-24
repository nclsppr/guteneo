#!/bin/bash
set -euo pipefail
source "$(dirname "$0")/common.sh"

printf 'Selected Xcode: %s\n' "$DEVELOPER_DIR"
"$GUTENEO_XCODEBUILD" -version
if ! "$GUTENEO_XCODEBUILD" -checkFirstLaunchStatus; then
  printf '%s\n' 'Initial Xcode setup is incomplete.' \
    'Open /Applications/Xcode.app and finish installing the official components.' \
    'This script does not run runFirstLaunch, replace system frameworks or change xcode-select.' >&2
  exit 69
fi
"$GUTENEO_XCODEBUILD" -list -project "$GUTENEO_PROJECT"
"$GUTENEO_XCODEBUILD" -showdestinations -project "$GUTENEO_PROJECT" -scheme Guteneo
