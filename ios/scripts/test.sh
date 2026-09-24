#!/bin/bash
set -euo pipefail
source "$(dirname "$0")/common.sh"

destination="${GUTENEO_TEST_DESTINATION:-platform=iOS Simulator,name=iPhone 17 Pro,OS=latest}"
test_selection=all
while [[ $# -gt 0 ]]; do
  case "$1" in
    --destination)
      [[ $# -ge 2 ]] || { printf '%s\n' '--destination requiert une valeur.' >&2; exit 64; }
      destination="$2"; shift 2 ;;
    --unit) test_selection=GuteneoTests; shift ;;
    --ui) test_selection=GuteneoUITests; shift ;;
    --help)
      printf '%s\n' 'Usage: test.sh [--destination "platform=iOS Simulator,id=UDID"] [--unit|--ui]' 'Exécute les tests en Debug. Les fixtures UI restent locales et sans envoi.'
      exit 0 ;;
    *) printf 'Option inconnue : %s\n' "$1" >&2; exit 64 ;;
  esac
done

case "$destination" in
  'platform=iOS Simulator,'*) ;;
  *) printf '%s\n' 'Ce script est limité aux simulateurs iOS. Utilisez Xcode pour qualifier un appareil physique.' >&2; exit 64 ;;
esac

if ! "$GUTENEO_XCODEBUILD" -checkFirstLaunchStatus; then
  printf '%s\n' 'La configuration initiale de Xcode doit être terminée avant les tests.' \
    'Ouvrez Xcode et installez les composants officiels proposés, puis exécutez doctor.sh.' >&2
  exit 69
fi

mkdir -p "$GUTENEO_BUILD_ROOT/TestResults"
result_directory="$(mktemp -d "$GUTENEO_BUILD_ROOT/TestResults/run-XXXXXX")"
arguments=(-project "$GUTENEO_PROJECT" -scheme Guteneo \
  -configuration Debug -destination "$destination" -destination-timeout 30 \
  -derivedDataPath "$GUTENEO_DERIVED_DATA" -resultBundlePath "$result_directory/Tests.xcresult" \
  -parallel-testing-enabled NO -maximum-concurrent-test-simulator-destinations 1)
if [[ "$test_selection" != all ]]; then
  arguments+=("-only-testing:$test_selection")
fi
"$GUTENEO_XCODEBUILD" "${arguments[@]}" \
  CODE_SIGNING_ALLOWED=YES CODE_SIGNING_REQUIRED=YES CODE_SIGN_IDENTITY=- test
printf 'Résultats : %s\n' "$result_directory/Tests.xcresult"
