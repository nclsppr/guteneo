# Lifecycle experience implementation — 10 November 2026

Base: freshly fetched main `77a7570b9d2c463afb968eef7be2bdbf1456dc02`.
Worktree: `codex/lifecycle-experience-20261109`; the primary dirty checkout and
all earlier worktrees are preserved. This implements the user's seven feature
proposals and nine frontend improvements. Implementation does not authorize a
merge, production release, provider activation, real callback/send or paid
resource provisioning.

Implementation is complete. The local proof below combines named candidate
snapshots and focused reruns; the final browser batch exercises the complete
changed interface. Exact-head hosted CI remains a separate qualification gate.

## Publication qualification and deferred navigation

The user separately authorized merge and production publication on 10 November.
PR #158 merged as `fe4384a9ef86a1526efd72e1052c8c79a50d8dd0` after all 24
application jobs and independent native tests/unsigned archive passed at its
exact head. Its full Git tree matched the tested PR execution. Main deliberately
ran a complete suite because the CI policy changed; no older proof was substituted.

That [main run](https://github.com/nclsppr/guteneo/actions/runs/42747940371)
found an intermittent workspace/application interaction loss in desktop shard
three. The retained trace shows the new workspace and accepted `#/app` address
while the old Documents view remains inert/busy. Applications opens, then closes
when the deferred Overview commits and main receives focus. An independent local
reproduction held the actual Overview module, opened the panel after the real
hash change, then released the module: no additional hash change occurred between
opening and closure. This is a product navigation/focus race, not permission,
locale, pointer layering or evidence transport failure.

The correction binds panel ownership to accepted navigation and current authority
and prevents a deferred route-focus claim from overriding a newer interaction.
Held-module, leave-and-return, veto and same-address authority cases keep explicit
pointer, keyboard, request and write assertions. It adds no business permission,
remote read or eager module dependency. Local and hosted corrective qualification
remain distinct; the exact candidate result belongs to its PR and final GitHub
Release evidence. The failed main attempt is retained. No production migration
or runtime publication occurred before this failure was investigated.

The corrective regression also exposes native `popstate` arriving before its
fragment-change acknowledgement: both events must pass the same router veto
before the shared visit clock advances. WebKit's ordinary destination focus
retains its claim through the pending transition, then makes a single owned
render-frame attempt after native fragment handling and inert removal. Newer
interaction, route/visit or authority replacement cancels that claim. No sleep,
focus retry, forced style flush, extra data read or removed assertion substitutes
for either boundary.

Corrective local qualification passed **57/57** cases across desktop Chromium,
mobile Chromium and iPhone WebKit: twelve switcher cases, thirty-six authority
races, six code-recovery cases and three keyboard-command/focus cases. A separate
five-repeat iPhone switcher run passed **20/20**, with zero skips, retries or
flakes. All thirty-six focused foundation/API/bootstrap unit tests, typecheck,
lint, production-style build and documentation/engineering checks passed. The
[source-bound corrective evidence](evidence/workspace-navigation-2026-11-10.json)
labels the local candidate dirty build honestly; these are synthetic local
results, not production or fresh hosted qualification.

Separately, the first native UI test on that main run timed out inside Xcode's
application-launch helper before its assertions; all 46 unit and nine remaining
UI tests passed. The preceding PR run had passed all 56 tests and unsigned
archive with the exact same native tree and workflow. The failed native artifact
is retained. One unchanged complete native-job rerun passed all 46 unit and 10 UI
tests plus unsigned archive: [main native attempt 2](https://github.com/nclsppr/guteneo/actions/runs/42747940148/attempts/2).
The native tree is `a81f97703b91e49a3c833492c38ee5a8041d9f94` and workflow blob
`62e06f81d8ad6a21634dedb0fff7445d04666d78`, identical to the preceding green
PR. This supports an infrastructure assessment without treating a debugger
warning alone as proof. It establishes no signed distribution or real account use.

The original primary checkout remains untouched. Publication requires fresh
successful final-main checks, schema-first migrations 0075–0080, an immutable
remote `v1.2.0` tag and matching notes, followed by canonical served-byte/runtime
verification. The final production receipt is separate from this implementation
ledger; native App Store/TestFlight distribution and controlled feature activation
are not inferred from a web publication or unsigned archive.

## Product decisions

The user explicitly selected future spending approval within a fixed cap.
Scheduling therefore has a separate revocable `future_browser` authority record
binding exact source content, recipient, sender, options, execution time/window
and integer maximum total cost. A fresh eligible quote at release must fit that
cap. Current approver/preparer authority, source readiness, provider policy and
funding remain release conditions. Acceptance, reservation and outbox insertion
remain atomic. One immutable release command and unknown-outcome reconciliation
prevent duplicate sends. Secure/document email and postal retain their separate
contemporaneous authentication/transfer conditions; the first automatable scope
is fax and message-only email, advertised explicitly through capabilities.

Background outcomes contain only confirmed receipt identifiers, action kind and
canonical internal navigation. They are bounded, transient and discarded across
authority changes. Saved table views contain only an explicitly entered view
name and allowlisted sorting, filters and page size. They never automatically
collect rows, document text, recipient values, search text or cursors. Customer callbacks contain
minimal lifecycle metadata, require separately configured gates and protected
signing material, and never imply provider sending authority. Device-local native
drafts use non-synchronizing Keychain storage and explicit recovery.

## Implementation ledger

| ID  | Requirement                                               | Owner                     | State    |
| --- | --------------------------------------------------------- | ------------------------- | -------- |
| F01 | Workspace outcomes after abandoned views                  | Orchestrator/client lead  | Complete |
| F02 | Overview attention queue                                  | Orchestrator              | Complete |
| F03 | Signed customer lifecycle webhooks                        | Backend/document lead     | Complete |
| F04 | Tenant recipient address book                             | Backend lead/orchestrator | Complete |
| F05 | Scheduled sending with explicit capped future approval    | Backend lead/orchestrator | Complete |
| F06 | Durable device-local native drafts and recovery           | Document/native lead      | Complete |
| F07 | Command palette and saved table views                     | Orchestrator              | Complete |
| P01 | Default action continuation fencing                       | Client lead               | Complete |
| P02 | Synchronous action re-entrancy exclusion                  | Client lead               | Complete |
| P03 | Shared authority identity                                 | Client lead               | Complete |
| P04 | Shared navigation revision store                          | Client lead               | Complete |
| P05 | Per-locale translation loading with measurements          | Client lead/orchestrator  | Complete |
| P06 | Visibility-aware bounded polling/backoff                  | Client lead               | Complete |
| P07 | Bounded authority/locale-scoped collection read sharing   | Client lead               | Complete |
| P08 | Shared chart/elevation/frame tokens and design exceptions | Orchestrator              | Complete |
| P09 | Automated four-language/two-theme accessibility checks    | Orchestrator              | Complete |
| X01 | Split oversized dispatch, platform and style modules      | Client lead/orchestrator  | Complete |

## Ownership and qualification

The client lead implemented existing frontend action/resource/navigation/polling modules
and call sites. The orchestrator implemented new outcome/attention/palette/
table-view UI, shared manifests, translations, docs/feature registry and package
versioning. The backend lead owns recipients, schedules and shared API/domain/
MCP/OpenAPI integration; the document lead owns native drafts, followed by the
separate webhook service. Migrations 0078/0079/0080 are reserved respectively for
recipients, customer callbacks and schedules. New source ownership is registered
before final lint; API contracts are shared before UI integration.

Each feature is qualified at its effect boundary for authority, tenant isolation,
concurrent/interrupted writes and recovery. The [dated evidence record](evidence/lifecycle-experience-2026-11-10.json)
owns the source fingerprints, named runs and retained limitations. The
[frontend measurements](FRONTEND_PERFORMANCE.md#locale-loading-and-lifecycle-controls--10-november-2026-local-candidate)
separate transfer observations from functional browser proof.

## Recorded local proof

These results establish local behavior for the recorded snapshots. Counts from
separate invocations are explicitly identified rather than presented as one
complete green run.

| Scope                                | Recorded result                                                                             | What it establishes and limits                                                                                                                                                                                                      |
| ------------------------------------ | ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit and integration tests           | 213 files / 4,058 tests passed across the latest sweep and affected reruns                  | This is the union of the sweep and corrective reruns, not one wholly passing invocation. Includes real local migrations and injected synthetic provider transports; no live delivery.                                               |
| Application browser qualification    | 165/165 in one final-source run, across desktop Chromium, mobile Chromium and iPhone WebKit | 105 product cases, 36 account/navigation races and 24 cold-load samples. Zero skips or flaky cases; real production-style SSR HTML with synthetic API responses.                                                                    |
| Accessibility                        | 24 locale/theme/profile cases; 216 rendered state checks                                    | Four locales × two themes × three profiles × nine actual states. WCAG 2 A/AA, 2.1 A/AA and 2.2 AA axe tags, with no disabled rules. Automated checks do not replace assistive-technology or physical-device review.                 |
| Belvédère browser flows              | 50 cases passed                                                                             | Local intercepted fixtures across the configured browser profiles; no hosted administrator or production-data proof.                                                                                                                |
| Native app                           | 56 cases passed: 46 unit and 10 UI                                                          | Full iPhone simulator run, including durable Keychain drafts, recovery and schedule-held source actions. Physical devices, distribution and App Store review remain separate.                                                       |
| Locale loading and session authority | Included in the 165-case run: 36 authority cases and 24 cold-load samples                   | Four locales, public/workspace routes and three browser profiles. No fallback-language heading, no public session request and one initial workspace session request. This is a local diagnostic sample, not a production benchmark. |
| Security checks                      | 701/701 on the final source                                                                 | Complete serialized Node security suite; zero failures or skips. Includes API/package/OpenAPI, continuation boundaries, public release fences and attempt-unique CI artifact selection.                                             |

Additional qualification after the first hosted run surfaced legacy-interface
regressions:

| Scope                                               | Result                                       | Preserved checks                                                                                                                                                        |
| --------------------------------------------------- | -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Account/navigation fixtures and short-height menus  | 161 passed; 4 existing mobile geometry skips | Twelve original menu checks; expanded exact navigation lists; no-scroll/viewport assertions; strict unexpected-read/write checks.                                       |
| Login, personal entry/performance and code recovery | 84/84 passed                                 | No post-logout private reads, obsolete entry cancellation, exact saved-language recovery and explicit expiry reads.                                                     |
| Personal list pagination                            | 33/33 passed                                 | Exact cursor recovery after deleting the final page item, single deletion and authority refusal.                                                                        |
| Overview attention integration                      | 3/3 passed                                   | Four explicit queue items, full aggregate count and filtered-list navigation.                                                                                           |
| Obsolete workspace code import                      | 3/3 passed                                   | Wait for the actual menu before clicking; stale imports cannot replace the selected route or read the abandoned account.                                                |
| Secure distribution                                 | 14/14 passed                                 | Isolated local D1/renderer with synthetic PDFs; authenticated sign-in completion, consent, paid period and independent copies. Invitation artifact secret check passed. |

The first hosted run at `8fca2b5b` passed unit, security, documentation, build and
native stages but exposed browser regressions. Corrections cover initial entry
cancellation, unmounting private readers before logout publication, retained
pagination recovery and short-height menu precedence. Fixtures now model the new
attention/navigation surfaces, saved account language and deliberate code-load
holds. Final locale proof uses the actual SSR build, rather than the earlier
Vite-only HTML. The native result supersedes the earlier 52-case snapshot.
Source and asset fingerprints bind final browser observations; fresh exact-head
hosted qualification is tracked in the pull request.

All test jobs at `2c473fd4` subsequently passed, including an unchanged rerun of
a fully buffered but stalled Linux WebKit video. Final report collection exposed
the pinned downloader's duplicate-name filtering defect. Main CI now uses unique
physical names per attempt while the selector retains strict logical grouping,
creation-time selection and every provenance/inventory guard. The [CI record](CI.md#manual-reruns-and-artifact-identity)
preserves both observations and the local regression proof. Application/native
code and assertions are unchanged by that transport correction.

The inspected synthetic captures show [capped future approval](evidence/lifecycle-schedule-desktop-2026-11-10.png),
[mobile saved-recipient editing](evidence/lifecycle-recipient-mobile-2026-11-10.png)
and [mobile command search](evidence/lifecycle-command-mobile-2026-11-10.png).

## Remaining limits and release gates

Final local source checks and package/MCP fingerprints qualify the candidate.
Exact-head hosted CI must independently qualify the final committed source. The combined unit count above
must not be represented as a single full green invocation. No merge, migration
against a hosted database, deployment, callback activation, paid resource or real
communication was performed by this implementation.

Scheduled release and customer callbacks remain default-off operational
capabilities. Hosted migration ordering, current provider/transport configuration,
funding, the callback encryption key and strict public-network egress guarantee
need their own qualification before explicit activation. Synthetic transports do
not prove a live receiver, provider delivery or production authentication. Unknown
provider/callback outcomes remain non-replayable automatically.

The first scheduling scope remains ordinary fax and message-only email. Secure
distribution, PDF email and postal retain their current review/freshness gates.
Native scheduling is a read-only status and browser handoff; drafts remain bounded
to the original device/account/workspace and require explicit resume or recovery.
