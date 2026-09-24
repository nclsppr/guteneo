#!/bin/bash
set -euo pipefail
source "$(dirname "$0")/common.sh"

printf 'Xcode utilisé : %s\n' "$DEVELOPER_DIR"
"$GUTENEO_XCODEBUILD" -version
if ! "$GUTENEO_XCODEBUILD" -checkFirstLaunchStatus; then
  printf '%s\n' 'Configuration initiale Xcode incomplète.' \
    'Ouvrez /Applications/Xcode.app et terminez l’installation des composants officiels.' \
    'Le script ne lance pas runFirstLaunch, ne remplace aucun framework système et ne modifie pas xcode-select.' >&2
  exit 69
fi
"$GUTENEO_XCODEBUILD" -list -project "$GUTENEO_PROJECT"
"$GUTENEO_XCODEBUILD" -showdestinations -project "$GUTENEO_PROJECT" -scheme Guteneo
