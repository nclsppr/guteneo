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
      '--unsigned : archive locale inspectable, non distribuable.' \
      '--signed : exige GUTENEO_TEAM_ID et une configuration de signature existante.' \
      'Aucun profil ou certificat distant n’est créé ; aucune archive n’est envoyée.'
    exit 0
    ;;
  *) printf 'Option inconnue : %s\n' "$mode" >&2; exit 64 ;;
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
  printf '%s\n' 'Archive incomplète : Info.plist, manifeste de confidentialité ou catalogue manquant.' >&2
  exit 65
}
release_strings="$(/usr/bin/strings "$app_path/Guteneo")"
if [[ "$release_strings" == *'Atelier Horizon'* || "$release_strings" == *'Dossier de souscription'* || "$release_strings" == *'--uitesting-preview'* ]]; then
  printf '%s\n' 'Archive Release invalide : une chaîne réservée aux fixtures Debug est présente dans le binaire.' >&2
  exit 65
fi
unset release_strings
printf '%s\n' 'Contrôle Release : les trois marqueurs connus des fixtures Debug sont absents du binaire.'
if [[ "$mode" == --signed ]]; then
  /usr/bin/codesign --verify --deep --strict "$app_path"
else
  printf '%s\n' 'Archive NON SIGNÉE : inspection locale uniquement. Ce résultat ne permet pas une soumission App Store.'
fi
printf 'Archive : %s\n' "$archive_path"
