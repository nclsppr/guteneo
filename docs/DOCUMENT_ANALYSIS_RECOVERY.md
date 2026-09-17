# Recoverable PDF verification

Local candidate, 17 September 2026. Not deployed. Apply migration
`0027_document_analysis.sql` before releasing the application. Scanner diagnostics
also require a coordinated private scanner image/Worker release; the application
still safely treats the previous scanner's generic 503 as transient.

## User journey

An imported PDF keeps its exact bytes, document ID and SHA-256. `quarantined`
remains the internal safety gate until an exact clean scan and isolated PDF
validation both succeed. It is no longer the user-facing explanation.

REST and MCP document responses include `analysis`: a safe state, category,
title, message, next action and optional read interval. States are `processing`,
`ready`, `retryable` and `blocked`. A legacy quarantined document with no recovery
record truthfully asks for a first explicit check; it does not claim that work
has already been scheduled.

Transient scanner startup, load or timeout creates durable analysis work in D1.
The existing minute cron retries the same original without requiring an open
browser or another assistant call. A cycle allows at most five automatic
attempts and expires after ten minutes. This is a bound, not a promised completion
time. Exhaustion produces a clear retry action. No job is created by a status
read, and duplicate imports cannot reset the cycle. Manual restarts retain the
existing organization limit of ten per UTC day; background attempts use their
own per-cycle counter.

Security refusal and incompatible PDF are distinguished from a service outage.
Raw engine findings, content, recipients, signed URLs and exception details are
never returned as diagnostics. Missing configuration, stale signatures and
integrity failures retain the safety gate and direct the user to assistance.

The web view polls only status, stops on completion, failure, navigation or its
bounded wait, and offers a real recovery action. The MCP gives readable text
before its structured metadata. Assistant instructions require delayed read-only
checks, at most three per interaction, then continuation in the same conversation
with the retained document ID and the user's existing parameters. The direct
document link remains optional metadata for a user who wants the website; waiting
for analysis never requires opening it. Neither surface promises a notification
or automatic dispatch.

The authorized expert fax path stays in the conversation for review, delegated
acceptance and tracking. Tool descriptions and the distributed fax skill no
longer make the browser approval link a mandatory expert step. This wording does
not activate a mandate, enlarge PDF review limits, or qualify host PDF reading.
Current exceptions are recorded in `EXPERT_APPROVAL.md`.

## Safety and authority

The organization and requesting user come from authenticated membership.
Every attempt rechecks that membership and the exact private object prefix,
size and SHA-256. A document-scoped lease and token fence both manual and
background work. Promotion and the canonical hash-based scan proof are atomic;
expired work cannot write through a replacement lease. Purged documents cannot
be revived. Background proof records system activity and does not assert human
review or consent.

PDF verification never prepares, approves, accepts or sends a communication.
Provider-outcome retries are unchanged: an unknown fax outcome must never be
resubmitted automatically. No new cloud resource or recurring Codex task is
needed; this uses the application's existing scheduled handler.

## Release and proof boundary

Local validation on 17 September:

- Full Vitest suite: 49 files / 896 tests passed. After the final bounded cleanup
  adjustment, the focused document suite passed 40 tests, including the additional
  claimant-interleaving regression; the document integration suite passed 16.
- Node security suite: 130 passed, with no skipped tests.
- Scanner: 10 Worker and 13 Python tests passed; scanner type checking passed.
- Browser recovery: 33 scenarios passed across desktop Chromium, mobile Chromium
  and iPhone WebKit, with no skips or retries. Desktop and iPhone screenshots were
  visually reviewed. This is browser emulation, not a physical iPhone or ChatGPT
  mobile qualification.
- Typecheck, lint and application build/Worker dry run passed. Local migration
  transport verification found 27 equivalent migrations / 196 schema objects,
  `quick_check=ok` and no foreign-key violations.
- After the conversation-first wording changes, 69 focused tests passed across
  expert approval, MCP integrations, fax pricing and postal MCP; typecheck, lint
  and diff checks passed again. The expert suite includes a simulated exact-PDF
  fax accepted through MCP without a browser approval call. This is not proof of
  PDF reading or sending from a real ChatGPT session.

Reports are in `test-results/document-analysis-vitest.json`,
`test-results/document-analysis-playwright.json`,
`test-results/document-analysis-security.log` and
`test-results/document-analysis-build.log`. Screenshots are under
`test-results/document-analysis-screenshots/`.
The later focused reports are `test-results/document-analysis-chat-first-expert.json`
and `test-results/document-analysis-chat-first-pricing.json`.

These local tests cover scanner classifications, durable recovery,
authority and exact-byte gates, MCP output, and browser states. They do not
qualify the new release against a hosted cold ClamAV container or a real iPhone
ChatGPT client. A coordinated release must apply the migration, deploy the
qualified scanner and app, verify their exact versions, then exercise a
synthetic cold-start import through to `ready` without a manual rescan. No real
fax is required for that qualification. No production deployment or migration
was performed as part of this local change.
