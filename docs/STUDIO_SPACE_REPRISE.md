# Studio reprise and local acceptance — 29 October 2026

This record continues the preserved local `claude/studio-space-reprise` work at
`1e013dbc`. It distinguishes application implementation, synthetic browser tests,
real local persistence/rendering, CI, hosted identity and provider delivery.
Nothing in this reprise authorizes pushing, merging, paid infrastructure,
provider activation, a real communication or deployment.

## Delivered scope

| Lot | Local result | Authoritative contract |
| --- | --- | --- |
| 1 | Current workspace comes from the active session; identity-bound membership lists, stale-response fences and draft navigation veto remain | [Layout](DASHBOARD_V2.md) |
| 2 | Separate application/workspace switchers; shared account utilities also in My documents; personal authority needs no membership | [Account](ACCOUNT_IDENTITY.md), [applications](WEB_APPLICATIONS.md) |
| 3 | Explicit document/destination associations and freeze summary; business labels, compatible import/replacement and source-preserving corrections | [Templates and distribution](TEMPLATES_DATA_DISTRIBUTION.md) |
| 4 | Expanded immutable-approval, unknown-outcome, revocation and concurrent durable-copy regressions | [Sensitive journeys](SECURE_DISTRIBUTION_JOURNEYS.md) |
| 5 | Canonical-session protected Belvédère, minimal navigation hint, seven views and interactive globe; protected compatibility entry remains | [Belvédère](BELVEDERE.md) |
| 6 | Four-language workspace terminology, independent route loading, documentation and exact-source acceptance | [Languages](MULTILINGUAL.md), [loading](FRONTEND_PERFORMANCE.md) |

The four original application import exceptions are removed. Business ids, canonical
routes, tenant keys, immutable documents and approval authority are preserved.
A wording change never transforms interpolated names, source content or PDFs.
Classic's accepted stored preference no longer selects a web layout.

## Verification and evidence

Acceptance is in progress while the implementation is assembled. Final counts,
tested source, commands, environments and remaining failures must be recorded
here before the local handoff is called complete.

Executed intermediate checks:

- Lot 4: 106/106 focused tests using real transient local D1/R2 with synthetic
  identity, renderer and provider transport; no backend change was required.
- Terminology: 109/109 focused tests, including stable English/legacy keys,
  exact label revisions and preservation of interpolated proper names.
- Personal menu/loading: 66/66 Chromium desktop, Pixel 7 and iPhone WebKit
  browser-fixture scenarios against static assets, without a business database.
  Independent review then identified private return-query and hidden-entry
  prefetch races; those receive explicit regression tests in final acceptance.

The original demo database is never the target of resettable browser fixtures.
Full application acceptance uses an isolated checkout, its own local D1/R2 state,
locked dependencies and deterministic simulation. Local browser fixtures do not
claim authenticated Auth0 SSO; actual pdfme rendering is recorded separately
from renderer doubles and from displayed prebuilt PDFs.

## Qualification boundaries

Local fixture or simulated-provider success establishes no new CI run, hosted
callback, physical iPhone/Safari result, real recipient login or actual delivery.
The human novice usability exercise remains unperformed. Belvédère still requires
current membership and signed privileged browser evidence; the case without any
membership is a separate product/authority decision. Platform observation does
not grant operational administration. Failed, unavailable or unexecuted checks
must remain visible in this record.

## Continue safely

Use the reprise worktree explicitly and preserve unrelated reports/files. Keep one
writer per checkout; review/test tasks use isolated state. Do not run the ordinary
resetting e2e fixtures against the existing demonstration database. Keep secrets,
recipient data and access-bearing addresses out of evidence and logs. The old
[design plan](STUDIO_SPACE_PLAN.md) remains a dated reference; the current
application contract is [WEB_APPLICATIONS.md](WEB_APPLICATIONS.md).
