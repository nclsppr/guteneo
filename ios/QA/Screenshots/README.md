# Local visual evidence — 22 September 2026

The thirteen selected captures come from the SwiftUI application run by
XCTest, without editing, cropping or montage. Authenticated screens use only
local Debug fixtures: names, documents, recipients and states are fictional.
No real communication was sent.

These are local review evidence, not final App Store listing images. Release
configuration excludes this simulation mode. Submission captures must match
the qualified binary/service, with an authorized reviewer account and
identified fictional data.

## Adaptive composition and icon — latest campaign

- Application source: `b7e0d4d0865b635ec53a056d668d3d69ade9122e`.
  Tested app/icon files were identical before their commit; documentation
  was added later. UI tests come from
  `d2ccf4321ff60fcb18ed244f0a9b7218c7966868`.
- `run-BaJ3lc/Tests.xcresult`: **6 of 6 iPad UI tests passed** on iPadOS 27.0,
  with the Icon Composer document integrated into the Debug binary. “All
  documents” selects the actual native Documents tab; selection survives
  rotation. Previous-campaign diagnosis found that an identifier on the
  container overwrote child-button identifiers; it was removed before this
  complete batch.
- `run-4MIZfU/Tests.xcresult`: **22 unit tests and 6 iPhone UI tests passed**
  on iOS 26.5, application source `8b7dc0f`. Later changes affect the workspace
  link, its touch targets, an iPad accessibility identifier and the icon;
  the new iPad result covers navigation, while the remote workflow needs
  separate inspection at the PR head.

| Retained raw capture | What it qualifies |
| --- | --- |
| [iPad welcome](ipad-accueil-redesign.png) | Two useful areas, press illustration matching logo blue, one signature. |
| [iPad workspace](ipad-atelier-redesign.png) | Side-by-side dispatches/documents, actual fixture content, visible primary action. |
| [Landscape iPad Documents](ipad-documents-paysage.png) | Full-screen `XCUIScreen` capture after landscape geometry confirmation; list/detail fully visible. |
| [iPhone welcome](iphone-accueil-redesign.png) | Copy/login first, more compact illustration afterward. |
| [iPhone workspace](iphone-atelier-redesign.png) | Compact vertical scrolling with the brand displayed once. |

Both iPhone captures come from the first composition batch. Three iPad
captures come from the latest complete batch. All five files are byte copies
of XCTest attachments. The manifest records their fingerprint, timestamp,
device, test and provenance. The postrotation `app.screenshot()` detail capture
retains a black strip and incorrect framing; diagnosis confirms actual
landscape geometry, and only the complete `XCUIScreen` capture is retained
as visual evidence. An actual narrow resized iPad window and physical device
remain untested. The landscape PNG retains raw 2064 × 2752 pixels and EXIF
orientation 8; no file rotation was applied.

## Previous brand campaign sources

- Application sources: `f39eae14198665fcb4340d209add29ff25f5cb3a`.
- Background-test-only adjustment:
  `d6e194256a735a1037781a26b0a7b377f8edc508`, without app-binary changes.
- Xcode 27.0, iOS 27.0 SDK, Swift 6, simulator ad hoc signing.
- iPhone 17e, iOS 26.5, portrait, French, light mode.
- iPad Pro 13-inch M5 “Guteneo iPad QA”, iPadOS 27.0, portrait, French,
  dark mode. Light mode was restored and the simulator stopped afterward.

The manifest associates each image with its fingerprint, timestamp, device,
XCTest result and app/test revisions. An image from a successful scenario
in a partially failed batch is identified accordingly.

## Brand campaign results

| Local batch under `ios/.build/TestResults/` | Result |
| --- | --- |
| `run-RY2IZq/Tests.xcresult` — compact iPhone | **22 unit tests and 5 UI tests passed**, first run. |
| `run-D0MUvN/Tests.xcresult` — dark iPad | **4 of 5 UI tests passed**. PDF opens; waiting for exact `runningBackground` after Home then fails. |
| `brand-ipad-pdf-state.xcresult` — dark iPad | **1 targeted test passed**: PDF, background/return, then form closed without sending. |
| `brand-ipad-navigation.xcresult` — dark iPad | **2 follow-up tests passed**: navigation/About and welcome. |

The background test now accepts exactly Apple's two documented states,
`runningBackground` and `runningBackgroundSuspended`, with the same five-second
timeout. It rejects unknown, stopped or foreground states. The successful
run's attached observation reports `afterHome=4` (foreground), then
`afterWait=3` (background). **It therefore does not demonstrate that suspension
caused the first batch's failure. That cause remains undetermined.** No
automatic retry or application-behavior change was added.

Five distinct scenarios are covered on each format: welcome without purchase,
navigation, XXXL text, PDF/form and reference quote without approval. Brand
tests count one signature on welcome, workspace and About, and none in other
tabs, PDF or form. Unit tests verify compiled-portrait transparent pixels and
contrast from catalog-loaded colors in light/dark and normal/high-contrast
modes.

## Inspected selection

| Capture | Observation |
| --- | --- |
| [iPhone welcome](iphone-accueil.png) | One transparent signature, no second symbol or Keychain error. |
| [iPhone workspace](iphone-atelier.png) | Single brand and native Liquid Glass bar. |
| [iPhone Account XXXL](iphone-compte-texte-accessibilite.png) | Scrolling-list text, accessible selected Account tab. |
| [Dark iPad welcome](ipad-accueil-sombre.png) | Portrait without opaque panel, readable wordmark/button. |
| [Dark iPad workspace](ipad-atelier-sombre.png) | One brand signature, native primary action/floating bar. |
| [Dark iPad About](ipad-a-propos-sombre.png) | One signature on the content surface. |
| [Dark iPad PDF](ipad-pdf-natif-sombre.png) | Synthetic document in PDFKit after foreground return. |
| [Dark iPad preparation](ipad-preparation-sombre.png) | Scrolled form, quote disabled without recipient, no added logo. |

Other captures remain in raw results. The iPhone About capture shows an Apple
Intelligence system notification; it was not edited and is not in this selection.
Captures preceding the brand correction are superseded here while remaining
in Git history and previous local results.

## Limits

XCTest counting concerns the accessible tree; visual review complements it.
Backgrounding the PDF does not prove the exact image iOS captures for the app
switcher. Masking at that instant and actual authentication still need
physical-device verification. The remote Auth0 page retains an old opaque
logo, separate from the native binary; see
[IOS_PASSKEYS.md](../../../docs/IOS_PASSKEYS.md).

VoiceOver, all transparency/motion preferences, physical device, actual
authentication, browser approval, production mobile service, TestFlight and
App Review are not qualified by these fixtures. Captures attest no delivery,
submission or publication.

Design details and Apple sources are in the [Apple UI audit](../APPLE_UI_AUDIT.md).
Complete results remain in `ios/.build/`, ignored by Git.

## Reconciliation on 2 October 2026

These captures remain tied to their historical batches. The
[multilingual](multilingual/README.md) folder retains language-candidate
evidence. No new reconciled-source capture is claimed; its build and XCTest
script block are described in [READINESS.md](../READINESS.md).
