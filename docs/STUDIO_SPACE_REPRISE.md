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
| 3 | Studio preserves source/version and business labels; Correspondence owns explicit document/destination associations, the freeze summary and immutable plan tracking | [Templates and distribution](TEMPLATES_DATA_DISTRIBUTION.md) |
| 4 | Expanded immutable-approval, unknown-outcome, revocation and concurrent durable-copy regressions | [Sensitive journeys](SECURE_DISTRIBUTION_JOURNEYS.md) |
| 5 | Canonical-session protected Belvédère, minimal navigation hint, seven views and interactive globe; protected compatibility entry remains | [Belvédère](BELVEDERE.md) |
| 6 | Four-language workspace terminology, independent route loading, documentation and exact-source acceptance | [Languages](MULTILINGUAL.md), [loading](FRONTEND_PERFORMANCE.md) |

The four original application import exceptions are removed. Business ids, canonical
routes, tenant keys, immutable documents and approval authority are preserved.
A wording change never transforms interpolated names, source content or PDFs.
Classic's accepted stored preference no longer selects a web layout.

## Verification and evidence

Local acceptance completed on `claude/studio-space-reprise`, package **1.1.19**,
at runtime source `06edca59c11f66fe1951e6ebce9122185420cb29`. The subsequent login
harness and documentation corrections left those runtime bytes unchanged.

[PR #120](https://github.com/nclsppr/guteneo/pull/120) includes the complete
Classic-retirement history from #118. Integration commit `915db399` also retains
the current `main` assistant-logo appearance correction from #119. That merge
changes theme CSS; the earlier byte-equivalence measurements below apply to
their recorded revisions, not to the integrated build. Hosted CI runs the full
integrated matrix. Its first run exposed outdated distribution-suite selectors
for the renamed Correspondence labels and account-menu navigation; their
corrections retain the existing privacy, authority and lifecycle assertions.
Both corrected distribution profiles passed locally on desktop and phone
(14 strict and two verified-account cases), with their artifact privacy guards.
The complete account-language file passed 30 cases against prerendered production
pages after making its public starting language explicit; its delayed-session
and saved-private-preference assertions remain unchanged.
The next hosted run exposed a status-cache fixture that began just before UTC
midnight: its fourteen-minute advance correctly invalidated the previous day.
The TTL test now starts at fixed UTC midday; the separate midnight regression
and all request-count expectations are unchanged.
GitHub owns current check and merge status; publication requires separate
clean-main release evidence.

Verified checks and focused evidence:

- Complete `npm test` on the consolidated candidate: 153 Vitest files,
  349 suites and 3,218 passing tests, followed by 479 passing security tests
  across 44 files. Exit 0; no failures, skips, cancellations or todos.
  Reports and rendered unit artifacts are retained separately from the earlier
  successful `d47d8027` run.
- The complete application run executed 1,005 cases: 987 passed, 17 intentionally
  skipped and one login-harness resource relay failed. The corrected login file
  passed all 39 cases over the same three profiles, including three new resource
  and drain regressions. By file, this covers 991 passing cases plus 17 skips
  (1,008 current cases) with no unresolved failure. This is complete-suite
  evidence plus a corrected-file rerun, not a claim that the full command was
  rerun after the test-only harness correction. The original failed report stays
  intact. Desktop-specific graphical editing remains qualified on desktop;
  viewport-specific tests explain their skips in the raw report.
- Lot 4: 106/106 focused tests using transient local D1/R2 with synthetic
  identity, renderer and provider transport. A later full run exposed a genuine
  approval-expiry calculation error across clock ticks; a one-line domain fix
  preserves the unchanged SQL cap and all stricter authority limits, with a
  deterministic insertion/reapproval regression and 202 passing focused tests.
- Terminology: 109/109 focused tests cover stable English/legacy keys,
  exact label revisions and interpolated proper names.
- Consolidated Correspondence handoff: 70 passed, two desktop-only cases skipped
  on mobile. This includes 42 new cases over desktop Chromium, Pixel 7 and
  iPhone WebKit, six role cases and 22 executed workspace cases. Browser Back,
  repeated/coalesced A → B → A, late preparation/postal responses, records on
  later result pages, valid special record ids and a one-PDF destination are
  explicit regressions. Static browser fixtures create no real communication.
- Long personal identities and short-screen menus: 12/12 browser cases; a further
  18/18 combined click/layout/canonical-Belvédère cases verify the account panel
  no longer blocks workspace selection. Red and green artifacts are retained.
- Full public preview on the candidate: 281 passed, five intentionally skipped,
  zero failures or flaky cases. This includes the actual pre-bootstrap film
  click regression. Full Belvédère: 46 passed, no skips, failures or flaky cases.
- Corrected targeted fixtures: locale boundaries 30/30, personal appearance 42/42,
  route-code failure/recovery 18/18. HTTP refusal recovers across all three
  profiles; an intercepted WebKit abort with no failed resource-timing entry
  retains the usable error boundary after one explicit reload. That fixture
  limit is not a physical Safari qualification.
- Public code recovery has 17 focused unit tests and six navigation regressions;
  personal entry has 12 targeted cases. Refresh is limited to failed public
  same-origin code, omits credentials/referrers, forbids redirects and aborts
  when a visit ends. No private read or business write is replayed.

The earlier full application run at `1c0fe9a5` is retained separately. Its stale
fixtures and mobile stacking failure motivated the corrections above; a failed
or partial historical run is never reported as a successful final run.

Durable raw evidence, source hashes, screenshots and reproduction helpers live
in the local handoff directory `guteneo-demo-2026-10-29`: `CODEX-FINAL`,
`CODEX-RECOVERY`, `CODEX-LOT5`, `CODEX-PERFORMANCE` and `codex-lot3-proof`.
The checked-in [loading evidence](evidence/studio-space-loading-2026-10-29.json)
retains sanitized before/after request and byte measurements. Its source revision
must be read literally; entry splitting is not a universal size or latency gain.

The actual Studio workflow records three distinct generated PDFs, exactly two
prepared associations and the third PDF excluded. A model correction appears in
new PDF bytes and rendered pages; the data correction changes Metz to Nancy
while retaining its historical template version. Original bytes/hashes and the
prepared plan are re-read unchanged. PDF.js renders the saved pdfme bytes into
page PNGs; direct inspection confirms readable, consistent output and both
corrections. Approvals and sending attempts remain zero.

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
