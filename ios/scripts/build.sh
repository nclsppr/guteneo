#!/bin/bash
set -euo pipefail
source "$(dirname "$0")/common.sh"

configuration=Debug
destination='generic/platform=iOS Simulator'
sdk=iphonesimulator
signing=(CODE_SIGNING_ALLOWED=YES CODE_SIGNING_REQUIRED=YES CODE_SIGN_IDENTITY=-)
for argument in "$@"; do
  case "$argument" in
    --release) configuration=Release ;;
    --device) destination='generic/platform=iOS'; sdk=iphoneos; signing=(CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO) ;;
    --help)
      printf '%s\n' 'Usage: build.sh [--release] [--device]' 'Signature ad hoc pour le simulateur, sans signature pour --device ; aucune publication.'
      exit 0 ;;
    *) printf 'Option inconnue : %s\n' "$argument" >&2; exit 64 ;;
  esac
done

"$GUTENEO_XCODEBUILD" -project "$GUTENEO_PROJECT" -scheme Guteneo \
  -configuration "$configuration" -sdk "$sdk" -destination "$destination" \
  -derivedDataPath "$GUTENEO_DERIVED_DATA" \
  "${signing[@]}" build
