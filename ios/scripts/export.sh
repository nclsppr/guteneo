#!/bin/bash
set -euo pipefail
source "$(dirname "$0")/common.sh"

if [[ "${1:-}" == --help ]]; then
  printf '%s\n' 'Usage: export.sh /path/Guteneo-signed.xcarchive' \
    'Requires GUTENEO_TEAM_ID, GUTENEO_PROFILE_NAME and an Apple Distribution certificate with its private key.' \
    'GUTENEO_DISTRIBUTION_CERTIFICATE can specify its SHA-1 fingerprint.' \
    'Local export only: no upload or publication.'
  exit 0
fi
[[ $# == 1 && -d "$1/Products/Applications/Guteneo.app" ]] || {
  printf '%s\n' 'Provide the path to a signed Guteneo archive.' >&2
  exit 64
}
archive_path="$(cd "$1" && pwd)"
guteneo_require_team
[[ -n "${GUTENEO_PROFILE_NAME:-}" ]] || {
  printf '%s\n' 'Set GUTENEO_PROFILE_NAME to the name or UUID of the installed App Store profile for com.guteneo.ios.' >&2
  exit 64
}
certificate="${GUTENEO_DISTRIBUTION_CERTIFICATE:-Apple Distribution}"
identities="$(/usr/bin/security find-identity -v -p codesigning)"
if [[ "$identities" != *'Apple Distribution'* ]]; then
  printf '%s\n' 'No usable Apple Distribution identity with a private key was found in the keychain. An Apple Development certificate is insufficient.' >&2
  exit 69
fi
if [[ "$certificate" != 'Apple Distribution' && "$identities" != *"$certificate"* ]]; then
  printf '%s\n' 'The requested distribution certificate was not found.' >&2
  exit 69
fi
unset identities
/usr/bin/codesign --verify --deep --strict "$archive_path/Products/Applications/Guteneo.app"

mkdir -p "$GUTENEO_BUILD_ROOT/Exports"
export_directory="$(mktemp -d "$GUTENEO_BUILD_ROOT/Exports/run-XXXXXX")"
options_path="$export_directory/ExportOptions.plist"
/usr/bin/plutil -create xml1 "$options_path"
/usr/bin/plutil -insert method -string app-store-connect "$options_path"
/usr/bin/plutil -insert destination -string export "$options_path"
/usr/bin/plutil -insert teamID -string "$GUTENEO_TEAM_ID" "$options_path"
/usr/bin/plutil -insert signingStyle -string manual "$options_path"
/usr/bin/plutil -insert signingCertificate -string "$certificate" "$options_path"
/usr/bin/plutil -insert provisioningProfiles -dictionary "$options_path"
/usr/bin/plutil -insert 'provisioningProfiles.com\.guteneo\.ios' -string "$GUTENEO_PROFILE_NAME" "$options_path"
/usr/bin/plutil -insert uploadSymbols -bool false "$options_path"
"$GUTENEO_XCODEBUILD" -exportArchive -archivePath "$archive_path" \
  -exportPath "$export_directory/Package" -exportOptionsPlist "$options_path"
printf 'Local export: %s\n' "$export_directory/Package"
printf '%s\n' 'No build was uploaded to App Store Connect. This export does not establish App Review approval.'
