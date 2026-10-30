# iOS candidate status — 22 September 2026

The candidate is a SwiftUI iPhone/iPad application with PDFKit, system-browser
authentication and a dedicated mobile API. It reuses frontend brand assets
and palette. It displays no top-up or external-purchase invitation. Human
validation of a real dispatch remains on an authenticated browser page,
separate from the app.

## Local reconciliation on 2 October 2026

`codex/native-reconciliation-october` preserves both `codex/native-ios` and
`codex/multilingual-ios`, with the multilingual website as its base. The
adaptive welcome retains its language selector; later native work's iPad
screens, Icon Composer icon, contrast and accessibility identifiers are
preserved. New adaptive text is translated into French, English, German and
Luxembourgish: 252 bundled entries. Formatting and the review page follow the
language without changing PDFs, recipients, business amounts or approval
rights.

- Reconciled backend: 82 targeted tests passed, including 16 mobile API tests
  and review protections in all four languages; targeted lint passed.
- Simulator Debug application: Xcode 27.0 build passed. `build-for-testing`
  also passed for XCTest and UI targets.
- The official `ios/scripts/test.sh` currently refuses execution because
  `xcodebuild -checkFirstLaunchStatus` reports incomplete first-launch setup.
  No system component was replaced and the script was not changed to bypass
  that check.
- A subsequent requested direct run used the already compiled binary from
  commit `5296838`: `xcodebuild test-without-building` passed on iPhone 17 Pro
  Max, iOS 27.0 (24A5423a), with 25 unit tests and 8 UI tests, zero failures
  and zero exclusions. Its result is retained at
  `/tmp/guteneo-native-direct-xctests-20261002.xcresult`;
  `xcresulttool get test-results summary` confirms 33/33 passed. This direct
  run does not validate the official script's guard:
  `xcodebuild -checkFirstLaunchStatus` still returns 69. It runs no installer
  and establishes no physical-device or iPad evidence.
- Full TypeScript verification of the isolated candidate still depends on
  welcome-film text in web catalogs; rerun it on the combined candidate
  before publication.

The 22 September captures are historical evidence of their branches, not
captures of the reconciled candidate. Physical-device, distribution-signing,
deletion-processing and Apple-publication limits remain those listed below.

## Historical evidence from 22 September

- `codex/native-ios`, reconciled with `origin/main` at commit `22c24d5`.
  `review_prepare_only` reference preparations remain readable and offer no
  approval or dispatch in either app or browser.
- Backend: 87 targeted tests passed after integration, including 14 mobile,
  28 review-preparation, 31 authentication and 14 account tests. Typecheck,
  lint and full build passed. Worker compilation is local without deployment.
- `0037_native_sessions.sql`: 37 migrations checked locally, 241 equivalent
  schema objects, `quick_check=ok`, no foreign-key violation. No production
  migration was executed.
- Native tests, results and raw captures are documented in
  [Screenshots/README.md](Screenshots/README.md) and the [iOS guide](../README.md).
  Accounts, documents and outcomes shown there are fictional.
- The latest iPad composition batch passed all 6 UI scenarios, including
  opening the actual Documents tab, detail replacement and rotation. The
  unsigned Release archive from the same application source contains
  `AppIcon.iconstack` and the privacy manifest.
- The [Apple UI audit](APPLE_UI_AUDIT.md) covers current Liquid Glass guidance,
  2026 refinements, one brand signature, portrait transparency and catalog
  color contrast.
- The [Icon Composer icon](../Art/IconComposer/README.md) uses the official
  halftone portrait on ivory paper. Its native document, previews and compiled
  catalog integration are locally verified; signed archive and physical
  installation still require qualification.
- `https://guteneo.com/privacy/` was publicly checked: it describes the service
  and 21 September retention criteria. The app opens that page directly.

Detailed local results remain in `ios/.build/`, excluded from the repository.
The `Guteneo iOS` workflow can produce XCTest results and an unsigned archive
on the reviewed branch. A local result is not evidence of remote workflow
success; inspect the actual pull-request status.

## Remaining App Store submission blockers

| Item | Status and remaining work |
| --- | --- |
| Account deletion | The app records an authenticated request. Actual processing still needs implementation and qualification, including published criteria, shared workspaces and providers. A request is not completed deletion. See [ACCOUNT_DELETION.md](../../docs/ACCOUNT_DELETION.md). |
| Production mobile service | The mobile contract and migration are local. Authorized, verified activation compatible with the binary is required. |
| Distribution signing | Confirm the bundle's owning team. No usable Apple Distribution certificate was found during the local check. The unsigned archive cannot be submitted. |
| Physical device | None was available during the check. Real login, import, tracking, VoiceOver and the privacy overlay during app switching remain unqualified. |
| App Review and TestFlight | Dedicated authorized account, reproducible journey, signed archive, Apple validation, TestFlight installation and final-binary captures remain unqualified. No reviewer credentials are invented. |

French listing text, review notes, manifest and data inventory are prepared
in [AppStore](../AppStore/REVIEW_POLICY.md). They must match the binary and
service eventually submitted. Email remains closed in observed production
capabilities; the current listing promises fax preparation according to the
account's availability.

This folder attests neither real delivery, submission, Apple acceptance nor
publication. Do not present the candidate as ready to publish while these
mandatory conditions remain open.
