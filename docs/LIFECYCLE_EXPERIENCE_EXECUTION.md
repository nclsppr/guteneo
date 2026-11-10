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

| Scope                                | Recorded result                                                                     | What it establishes and limits                                                                                                                                                                                                                                       |
| ------------------------------------ | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit and integration tests           | 212 files / 4,049 tests passed across the latest sweep and affected reruns          | This is the union of the sweep and corrective reruns, not one wholly passing invocation. Includes real local migrations and injected synthetic provider transports; no live delivery.                                                                                |
| Application browser qualification | 165/165 in one final-source run, across desktop Chromium, mobile Chromium and iPhone WebKit | 105 product cases, 36 account/navigation races and 24 cold-load samples. Zero skips or flaky cases; all API responses in these fixtures are synthetic. |
| Accessibility                        | 24 locale/theme/profile cases; 216 rendered state checks                            | Four locales × two themes × three profiles × nine actual states. WCAG 2 A/AA, 2.1 A/AA and 2.2 AA axe tags, with no disabled rules. Automated checks do not replace assistive-technology or physical-device review.                                                  |
| Belvédère browser flows              | 50 cases passed                                                                     | Local intercepted fixtures across the configured browser profiles; no hosted administrator or production-data proof.                                                                                                                                                 |
| Native app                           | 56 cases passed: 46 unit and 10 UI                                                  | Full iPhone simulator run, including durable Keychain drafts, recovery and schedule-held source actions. Physical devices, distribution and App Store review remain separate.                                                                                        |
| Locale loading and session authority | Included in the 165-case run: 36 authority cases and 24 cold-load samples | Four locales, public/workspace routes and three browser profiles. No fallback-language heading, no public session request and one initial workspace session request. This is a local diagnostic sample, not a production benchmark. |
| Security checks | 697/697 on the final source | Complete serialized Node security suite; zero failures or skips. Includes API/package/OpenAPI, continuation boundaries and public release fences. |

The native result supersedes the earlier 52-case snapshot. The final 165-case
browser run supersedes earlier fixture failures, including a logout harness that
tried to inspect a document after successful navigation. The final native and
browser runs have no skips. Source and asset fingerprints bind the final locale
observations to the tested interface.

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
