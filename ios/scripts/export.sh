#!/bin/bash
set -euo pipefail
source "$(dirname "$0")/common.sh"

if [[ "${1:-}" == --help ]]; then
  printf '%s\n' 'Usage: export.sh /chemin/Guteneo-signed.xcarchive' \
    'Exige GUTENEO_TEAM_ID, GUTENEO_PROFILE_NAME et un certificat Apple Distribution avec clé privée.' \
    'GUTENEO_DISTRIBUTION_CERTIFICATE peut préciser son empreinte SHA-1.' \
    'Export local uniquement : aucun téléversement ni publication.'
  exit 0
fi
[[ $# == 1 && -d "$1/Products/Applications/Guteneo.app" ]] || {
  printf '%s\n' 'Fournissez le chemin d’une archive Guteneo signée.' >&2
  exit 64
}
archive_path="$(cd "$1" && pwd)"
guteneo_require_team
[[ -n "${GUTENEO_PROFILE_NAME:-}" ]] || {
  printf '%s\n' 'Définissez GUTENEO_PROFILE_NAME avec le nom ou UUID du profil App Store installé pour com.guteneo.ios.' >&2
  exit 64
}
certificate="${GUTENEO_DISTRIBUTION_CERTIFICATE:-Apple Distribution}"
identities="$(/usr/bin/security find-identity -v -p codesigning)"
if [[ "$identities" != *'Apple Distribution'* ]]; then
  printf '%s\n' 'Aucune identité Apple Distribution utilisable avec clé privée dans le trousseau. Un certificat Apple Development ne suffit pas.' >&2
  exit 69
fi
if [[ "$certificate" != 'Apple Distribution' && "$identities" != *"$certificate"* ]]; then
  printf '%s\n' 'Le certificat de distribution demandé est introuvable.' >&2
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
printf 'Export local : %s\n' "$export_directory/Package"
printf '%s\n' 'Aucun build envoyé à App Store Connect. Cet export ne vaut pas validation App Review.'
