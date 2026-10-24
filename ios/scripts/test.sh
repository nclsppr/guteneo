#!/bin/bash
set -euo pipefail
source "$(dirname "$0")/common.sh"

destination="${GUTENEO_TEST_DESTINATION:-platform=iOS Simulator,name=iPhone 17 Pro,OS=latest}"
test_selection=all
while [[ $# -gt 0 ]]; do
  case "$1" in
    --destination)
      [[ $# -ge 2 ]] || { printf '%s\n' '--destination requires a value.' >&2; exit 64; }
      destination="$2"; shift 2 ;;
    --unit) test_selection=GuteneoTests; shift ;;
    --ui) test_selection=GuteneoUITests; shift ;;
    --help)
      printf '%s\n' 'Usage: test.sh [--destination "platform=iOS Simulator,id=UDID"] [--unit|--ui]' 'Runs Debug tests. UI fixtures remain local and send no communications.'
      exit 0 ;;
    *) printf 'Unknown option: %s\n' "$1" >&2; exit 64 ;;
  esac
done

case "$destination" in
  'platform=iOS Simulator,'*) ;;
  *) printf '%s\n' 'This script is limited to iOS simulators. Use Xcode to qualify a physical device.' >&2; exit 64 ;;
esac

if ! "$GUTENEO_XCODEBUILD" -checkFirstLaunchStatus; then
  printf '%s\n' 'Initial Xcode setup must finish before testing.' \
    'Open Xcode, install the offered official components, then run doctor.sh.' >&2
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
printf 'Results: %s\n' "$result_directory/Tests.xcresult"
