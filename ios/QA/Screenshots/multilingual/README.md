# Integrated multilingual candidate — 22 September 2026

These four XCTest captures were renewed after recovering native changes
`24bbe2a`, `c7542dc` and `fea555d` into `codex/multilingual-ios`.
They come from application sources at commit `ec8fe77`, executed on
**iPhone 17 Pro Max, iOS 27.0 (24A5423a)**. The batch
`ios/.build/TestResults/run-QUTBZd/Tests.xcresult` passed **23 unit tests
and 7 interface tests**, without failures or skipped tests.

| Capture | Verification |
| --- | --- |
| [English welcome](iphone-welcome-en.png) | Immediate selection and choice retained after relaunch. |
| [German profile](iphone-account-de.png) | Language, navigation and shared-preference explanation. |
| [Luxembourgish profile](iphone-account-lb.png) | Change in the same profile, then translated delivery state. |
| [Reference quote](iphone-reference-fr.png) | Read-only inspection without approval or send action. |

Images are original PNGs exported from the XCTest result, without editing
or cropping. They were inspected; the profile list and quote detail remain
scrollable beneath the native bar. `manifest.json` retains their origin,
test and SHA-256 fingerprint. All names, documents, recipients and states
on authenticated screens come from fictional Debug fixtures.

The parent folder's iPad captures remain evidence of the initial native
candidate; they were not regenerated for this multilingual integration.
These captures claim no physical-device test, real Auth0 login, real
transmission, TestFlight or App Review qualification.
