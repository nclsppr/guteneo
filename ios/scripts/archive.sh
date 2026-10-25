#!/bin/bash
set -euo pipefail
source "$(dirname "$0")/common.sh"

mode="${1:---unsigned}"
if [[ $# -gt 1 ]]; then
  printf '%s\n' 'Usage: archive.sh [--unsigned|--signed]' >&2
  exit 64
fi
case "$mode" in
  --unsigned)
    archive_name=Guteneo-unsigned
    signing=(CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO)
    ;;
  --signed)
    guteneo_require_team
    archive_name=Guteneo-signed
    signing=("DEVELOPMENT_TEAM=$GUTENEO_TEAM_ID" CODE_SIGN_STYLE=Automatic)
    ;;
  --help)
    printf '%s\n' 'Usage: archive.sh [--unsigned|--signed]' \
      '--unsigned: locally inspectable archive, unavailable for distribution.' \
      '--signed: requires GUTENEO_TEAM_ID and an existing signing configuration.' \
      'No remote profile or certificate is created; no archive is uploaded.'
    exit 0
    ;;
  *) printf 'Unknown option: %s\n' "$mode" >&2; exit 64 ;;
esac

mkdir -p "$GUTENEO_BUILD_ROOT/Archives"
archive_directory="$(mktemp -d "$GUTENEO_BUILD_ROOT/Archives/run-XXXXXX")"
archive_path="$archive_directory/$archive_name.xcarchive"
"$GUTENEO_XCODEBUILD" -project "$GUTENEO_PROJECT" -scheme Guteneo \
  -configuration Release -destination 'generic/platform=iOS' \
  -derivedDataPath "$GUTENEO_DERIVED_DATA" -archivePath "$archive_path" \
  "${signing[@]}" archive

app_path="$archive_path/Products/Applications/Guteneo.app"
[[ -f "$app_path/Info.plist" && -f "$app_path/PrivacyInfo.xcprivacy" && -f "$app_path/Assets.car" ]] || {
  printf '%s\n' 'Incomplete archive: Info.plist, privacy manifest or asset catalog is missing.' >&2
  exit 65
}
release_strings="$(/usr/bin/strings "$app_path/Guteneo")"
if [[ "$release_strings" == *'Atelier Exemple'* || "$release_strings" == *'Dossier de souscription'* || "$release_strings" == *'--uitesting-preview'* ]]; then
  printf '%s\n' 'Invalid Release archive: the binary contains a string reserved for Debug fixtures.' >&2
  exit 65
fi
unset release_strings
printf '%s\n' 'Release check: the three known Debug fixture markers are absent from the binary.'
if [[ "$mode" == --signed ]]; then
  /usr/bin/codesign --verify --deep --strict "$app_path"
else
  printf '%s\n' 'UNSIGNED archive: local inspection only. This result does not support App Store submission.'
fi
printf 'Archive: %s\n' "$archive_path"
