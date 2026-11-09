# State-machine follow-up — 9 November 2026

Started from freshly fetched main `979f01a586c975c83372ee3dbcb60474f8e6895b`,
which includes PR #155. The original dirty checkout and earlier worktrees were
preserved. This follow-up verifies the existing
[113-group inventory](IMPLICIT_STATE_MACHINES.md) and
[execution ledger](STATE_MACHINE_EXECUTION.md); it does not count local helper
types as new independent product lifecycles.

## Decision

Retain the existing persisted machines and small integrated decision models.
Authority, immutable receipts, financial effects and irreversible invocation
remain owned by conditional D1 writes and constraints. Introduce no second state
store or statechart dependency. Improve the concrete transition boundaries that
can lose a user's current intent or reopen frozen work.

The coverage review includes dispatch/approval/money, identity and memberships,
documents and secure access, Studio, postal/provider maintenance, billing,
private runtime and erasure, web/native/MCP Apps, preview and public status.
The inventory's schema appendix remains a pinned historical discovery snapshot;
migration 0077's deletion checkpoints and migration 0076's resolution effects
are covered by the current execution ledger and their authoritative contracts.
Third-party internal graphs and every dynamically reachable combination are not
claimed exhaustively enumerated.

All 77 migrations replay successfully into 139 current tables. Relative to the
original 74-migration/134-table discovery, `account_deletion_plans`,
`account_deletion_plan_checks`, `account_deletion_steps`,
`account_deletion_identity_tombstones` and
`account_deletion_notification_receipts` refine AUTH-12; the audited dead-letter
resolution fields refine D5. These are nested lifecycle carriers, not additional
independent top-level groups. The deletion and diagnostic contracts retain their
separate operator/browser authority and no-replay boundaries.

## Confirmed transition gaps

| Groups | Reproduced boundary | Correction and consequence |
| --- | --- | --- |
| C01–C02 | An uncancellable old request returns 401 after a new session has been installed | Bind session-expiry announcements to the request's session revision. A stale request still fails to its caller but cannot expire the newer session. |
| C28 | A billing-portal response arrives after leaving its view | Require current identity, location and visit before navigation or publishing customer-creation feedback. The stable portal retry key remains while the view is mounted, until a current response is consumed. |
| C14 | A password reveal or revoke completes after changing the reviewed dispatch | Fence secret publication and local revoke/copy feedback to the current dispatch and view; discard stale results and clear transient state when management authority changes. |
| T04–T05 | Failed records are requeued, distribution freezes the still-partial job, then a separate write reopens generation | Requeue eligible records and promote the job in one atomic D1 batch, under one current-authority instant. Promotion depends on the actual requeue effect; a frozen or cancelled batch cannot resume. |
| C34 | Native fields/key change during preparation, or two tasks begin before the disabled button renders | Give the submitted draft one preparation owner and stable retry key, lock authoring during the request and refuse a second begin. Prepared tracking remains separate from browser approval. |

These changes improve UX by preserving current intent and predictable recovery,
DX by putting each guard at its effect boundary, and AX by preserving one
unambiguous operation and immutable distribution history. They grant no new
membership, OAuth scope, human consent, expert mandate or provider authority.
REST/MCP/native wire formats and the MCP tool catalogue remain unchanged.

## Qualification

The freeze-after-requeue regression fails against the original service and
passes with the atomic retry. The full Studio suite passed 88 cases before the
additional membership-revocation case; the final focused run passed five cases,
including both freeze orderings, revoked authority, cancellation and exact-byte
recovery. These overlapping runs are not summed as a unique total.

The complete final `npm test` command exits successfully: Vitest passes **202
files and 3,950 tests**, followed by **696/696 Node security cases**, with no
failures or skips. The initial preliminary run was deliberately interrupted when
implementation changed; only this stable-source complete run is aggregate proof.

The broader application browser run passes **111/111**, without skips, retries
or flakes, in 127.169 seconds across desktop Chromium, Pixel 7 Chromium and
iPhone WebKit. It covers complete billing/account, protected-email and resource
navigation suites plus the new billing continuation suite. Responses are
intercepted synthetic fixtures where those suites declare them; no Stripe
customer/portal or real communication is created. Earlier focused browser checks
pass 12/12 and focused client units pass 14/14. Loading observations and their
limits are recorded in [frontend performance](FRONTEND_PERFORMANCE.md).

Typecheck, lint, the application build/Worker dry-run, feature generation and
documentation checks pass. The engineering build contains 418 static assets;
its type/doc/security checks and all 30 Chromium/WebKit browser cases pass.
The 1.1.34 package has the same 83 MCP tools, 332
explicit annotation booleans and 258 checked source references. Both standalone
and web-build ZIPs match SHA-256
`43d4aa710f2dc8699b2839188d7abf05bb1042d4878ca9764686ae0dfa1a08c0`.
This is local package parity, not marketplace or hosted-client qualification.

Native Debug simulator application compilation and complete `build-for-testing`
pass. The two exact state XCTest methods pass on macOS; the added delayed
sign-out regression compiles. iOS test execution remains unqualified: the normal
script exits 69 for incomplete Xcode setup and a direct run exits 70 because
installed CoreSimulator 1174.9.2 is older than required 1174.21.0. No component or
global setting was changed. This is distinct from iOS runtime, physical-device,
TestFlight and App Store proof.

The [structured evidence](evidence/state-machine-followup-2026-11-09.json)
preserves scopes, measurements, source digests and failed/interrupted attempts.
Independent backend/client/native and documentation review found no blocking
issue; review narrowed the portal-key claim to a mounted view and distinguished
the in-memory native reference from durable server state. No merge, deployment,
provider activation, real communication, paid provisioning or external erasure
occurred.
