# Guteneo for iOS and iPadOS

Native SwiftUI application, Swift 6, minimum iOS/iPadOS 17. The shared
`Guteneo.xcodeproj` contains the app, `GuteneoTests` unit tests and
`GuteneoUITests` interface tests. It adds no third-party dependency.
Bundle: `com.guteneo.ios`, version `1.0`, build `1`.

This is a local candidate. Project, build or archive presence proves neither
production integration nor App Store publication. Deploy and qualify the
mobile contract before submission. Detailed conditions are in
[AppStore/REVIEW_POLICY.md](AppStore/REVIEW_POLICY.md).

## Open and build

Open `ios/Guteneo.xcodeproj`, choose the shared **Guteneo** scheme, then an
iPhone/iPad simulator. Groups follow the `Guteneo`, `GuteneoTests` and
`GuteneoUITests` folders: new Swift files are included automatically.
`Info.plist` is excluded from copied resources and used as app configuration.

From the repository root:

```sh
bash ios/scripts/doctor.sh
bash ios/scripts/build.sh
bash ios/scripts/build.sh --release --device
```

Scripts explicitly use
`DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer` by default and do not
change the global tool selection. Set `DEVELOPER_DIR` if Xcode is installed
elsewhere. They retain output in `ios/.build/`; `GUTENEO_BUILD_ROOT` selects
another folder.

`build.sh` builds for a simulator with local ad hoc signing and no distribution
certificate. This permits testing Keychain under simulator conditions.
`--device` builds for a physical device without signing, which does not permit
installation. `--release` uses the distributable configuration without
Debug-only fixtures.

## Tests and local demonstration

```sh
bash ios/scripts/test.sh
bash ios/scripts/test.sh --unit
bash ios/scripts/test.sh --ui
```

The default simulator is **iPhone 17 Pro** on the latest installed runtime.
Choose another explicitly with `--destination`, for example using its
identifier from `doctor.sh`:

```sh
bash ios/scripts/test.sh --destination 'platform=iOS Simulator,id=SIMULATOR_IDENTIFIER'
```

Tests run sequentially and create a new `.xcresult` each time. They do not
delete previous results.

Two launch arguments are reserved for Debug:

- `--uitesting-preview` opens local fictional data. The localized simulation/
  no-real-dispatch notice must remain visible. This demonstration qualifies
  neither server, providers nor delivery.
- `--uitesting-signed-out` opens the login journey for welcome-screen checks.

Interface tests cover login, navigation between Workspace, Documents,
Dispatches and Account, synthetic-PDF reading, opening/closing preparation
without sending, accessibility text size and absence of top-up invitations.
They attach captures to the test result. A dedicated scenario also checks
that a preparation-only reference quote offers no validation or sending.
A sixth scenario switches from a ready document to one under verification,
then from a prepared dispatch to a delivered one: detail and actions must be
replaced. On iPad it also checks selection persistence through landscape and
portrait rotations. The workspace's all-documents link must select the actual
library tab. This replaces neither review of every error/opened web page nor
physical-device and VoiceOver tests.

`bash ios/scripts/export-screenshots.sh` followed by a `.xcresult` path exports
captures and their manifest to a new `ios/.build/Screenshots/` folder.
Images are neither cropped nor edited.

## Archives and signing

```sh
bash ios/scripts/archive.sh --unsigned
```

This produces a local Release archive and checks configuration, asset catalog
and privacy manifest presence. An unsigned archive is for inspection only;
it is not an App Store package.

For a signed archive, set `GUTENEO_TEAM_ID` to the actually authorized Apple
Developer team, configure bundle signing in Xcode, then run
`bash ios/scripts/archive.sh --signed`. The script adds no
`-allowProvisioningUpdates` and creates no remote certificate or profile.

Local App Store export uses `bash ios/scripts/export.sh` followed by the
signed archive path. It requires:

- `GUTENEO_TEAM_ID`: the bundle's owning team;
- `GUTENEO_PROFILE_NAME`: installed App Store profile name/UUID for
  `com.guteneo.ios`;
- a usable **Apple Distribution** identity with its private key.

`GUTENEO_DISTRIBUTION_CERTIFICATE` can specify the chosen distribution
certificate's SHA-1 fingerprint. An Apple Development certificate does not
satisfy this prerequisite. Xcode checks actual profile/team/certificate
compatibility during export.

Export options force `destination=export`. No script uploads a build, sends
a communication, submits for review or publishes. Signing, package validation,
TestFlight installation and App Review decisions need separate evidence.

## Environment diagnosis on 22 September 2026

Xcode `27.0` (`27A266a`) is present. Project and build-setting reads pass.
System tool selection may still point to CommandLineTools; scripts avoid
that ambiguity with `DEVELOPER_DIR`.

The initial check reported installed CoreSimulator `1171.6.0`, older than
expected `1171.7.0`. Installation offered by the official Xcode interface
was started and completed. `-checkFirstLaunchStatus` now succeeds. The
unsigned physical-device Release build also passed.

Do not modify a version number, manually replace a framework, bypass signature
verification or kill a system installer to hide that state. Complete official
Xcode installation; if macOS requires authentication or completion of an
ongoing update, the user must finish it. Then rerun `doctor.sh` and tests.
An existing CoreSimulator tool's device list does not prove Xcode can execute
tests with its own SDK.

After updating components, adaptive-composition qualification passed 22 unit
and 6 UI tests on iPhone 17e/iOS 26.5, then 6 UI tests in dark mode on iPadOS 27.
The latest iPad batch also passed all six scenarios in light mode with the
Icon Composer icon integrated. Checks include reference-quote scope, catalog
color contrast and compiled-portrait transparency. They use ad hoc signing
and a real Keychain write/read/delete cycle. Early unsigned simulator builds
prevented session deletion and displayed an error; simulator build/test
signing was corrected without hiding the interface error.

The six interface scenarios cover XXXL text, one brand signature, PDF,
preparation without sending and selected-detail replacement. iPad rotation
checks selection persistence. An initially misframed landscape capture remains
separate from the functional result. Diagnosis confirms actual landscape
geometry and a correct raw `XCUIScreen` capture while `app.screenshot()`
remains misframed in this context. Only the full-screen capture is retained
as landscape evidence. Actual narrow iPad window resizing remains unqualified.
Batch details, limits and captures are in
[QA/Screenshots/README.md](QA/Screenshots/README.md). Liquid Glass decisions
and 2026 sources are in the [Apple UI audit](QA/APPLE_UI_AUDIT.md).

The unsigned Release archive contains the universal iPhone/iPad app, manifest,
assets and diagnostic symbols. No usable Apple Distribution identity was
present in Keychain during inspection; an Apple Development identity was
present. Distribution export therefore remains unqualified.

Report build, execution, capture and distribution results separately with
the relevant build. Tool repair success is not application validation.

## Latest inspected archive

On 22 September 2026, local archive
`ios/.build/Archives/run-HJxTTP/Guteneo-unsigned.xcarchive` was produced after
adaptive composition and Icon Composer integration, from application sources
at commit `b7e0d4d0865b635ec53a056d668d3d69ade9122e`.
Inspection confirms bundle `com.guteneo.ios`, version `1.0` (build `1`), minimum
iOS 17, iPhone/iPad families, assets, privacy manifest and symbols. The validated
catalog contains three-plane `AppIcon.iconstack`, referenced as the primary
iPhone/iPad icon. It is explicitly unsigned. SDK: iOS 27.0, Xcode 27.0.
Binary SHA-256:
`13aaafb9f4175f536bdbcda2daa9f0fc348bf0b9f2e0bc74db8a774bc29c237c`.

## Languages — 22 September 2026 candidate

French, English, German and Luxembourgish are offered on welcome and then
Account. `Guteneo/Resources/Localizable.xcstrings` contains 234 entries in all
four languages, including errors, states and accessibility text. The welcome
choice stays on this device; profile preference is saved for the same user
as on the website and reread at login and app return. An unconfirmed save
restores the previous displayed choice. Profile preference does not replace
the anonymous welcome choice, restored on logout. Documents, messages and
recipients retain their original language. Dates, file sizes and amounts
follow the selected language; iOS governs keyboards and system panels.

Changes use the SwiftUI environment and preserve navigation and draft fields.
Browser app-authorization and dispatch-validation journeys have a separate
explicit four-language catalog. Migration instructions and contract are in
`docs/IOS_API.md`.

Validation renewed after recovering native changes `24bbe2a`–`fea555d`:
simulator build, 23 unit tests and 7 interface tests passed on iPhone 17 Pro
Max/iOS 27.0 (`run-QUTBZd/Tests.xcresult`). Tests cover actual bundled catalogs,
profile precedence, local persistence, restoration after server failure,
English welcome and retained navigation in German/Luxembourgish. Unedited
captures: [`QA/Screenshots/multilingual/`](QA/Screenshots/multilingual/README.md).
This proves neither production Auth0, physical-device use nor TestFlight/
App Store submission.

## Archive inspected on the initial native candidate

On 22 September 2026, local archive
`ios/.build/Archives/run-ekw9rF/Guteneo-unsigned.xcarchive` was produced after
the dark-contrast correction from application sources at commit `24bbe2a`.
Inspection confirms bundle `com.guteneo.ios`, version `1.0` (build `1`), minimum
iOS 17, iPhone/iPad families, assets, privacy manifest and symbols. It is
explicitly unsigned.

Fixture markers `Atelier Horizon`, `Dossier de souscription` and
`--uitesting-preview` are absent from the Release binary. The archive script
checks that exclusion on subsequent runs. This is neither device installation
nor App Store validation.

## Integrated multilingual archive

Local archive `ios/.build/Archives/run-b967tj/Guteneo-unsigned.xcarchive` was
regenerated on 22 September 2026 from application sources at commit `ec8fe77`,
after integrating the latest native changes. Release compilation, asset/
manifest presence and exclusion of all three Debug fixture markers passed.
The bundled manifest also declares UserDefaults reason `CA92.1` for device
language choice. The archive remains unsigned and nondistributable; signing,
physical-device and publication evidence remain separate.

## Reconciliation on 2 October 2026

Native/multilingual branches are combined in local candidate
`codex/native-reconciliation-october`. Recent iPad composition and icon coexist
with personal preferences; 252 catalog entries also cover new empty states
and workspace steps. Backend tests pass (82/82). App/test targets compile for
simulator with Xcode 27.0. The official XCTest execution script remains
stopped by Xcode's incomplete first-launch configuration.
See [QA/READINESS.md](QA/READINESS.md) for exact evidence scope.

An additional direct `xcodebuild test-without-building` run passes on the
commit `5296838` binary: 25 unit tests and 8 UI scenarios on iPhone 17 Pro Max/
iOS 27.0, zero failures. It is distinguished from the official script, whose
initial Xcode check still returns 69. Exact result:
`/tmp/guteneo-native-direct-xctests-20261002.xcresult`.
