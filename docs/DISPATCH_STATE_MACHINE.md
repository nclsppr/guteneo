# Dispatch transition contract

This contract owns the dispatch decisions and campaign-closure candidate introduced
on 8 November 2026. `packages/domain/src/dispatch-lifecycle.ts` names command
eligibility, approval expiry, recovery classification, provider-fact projection
and attempt outcomes. `DomainService` uses those decisions inside the existing
service paths. Conditional D1 writes, current authority fences, immutable hashes
and financial triggers remain the commitment boundary. This is a local candidate;
it establishes no hosted migration, activation, communication or delivery proof.

## Independent state axes

| Axis                | Representation                                                                       | Transition owner                                      |
| ------------------- | ------------------------------------------------------------------------------------ | ----------------------------------------------------- |
| Dispatch            | Existing `DispatchStatus` values                                                     | DomainService commands and guarded SQL writes         |
| Exact approval      | Row presence, fingerprint, kind, expiry and current browser/delegated evidence       | Existing approval services, views and triggers        |
| Attempt             | Started, accepted, rejected or unknown; active attempt and durable invocation marker | Consumer, provider bridge and lease reconciliation    |
| Queue               | Pending/published outbox and queue disposition                                       | Existing publisher and consumer                       |
| Financial liability | Monthly reservation and lifetime credit hold; immutable charge/usage evidence        | Existing financial SQL triggers and usage settlement  |
| Provider facts      | Durable receipt, unbound/applied event and ranked status projection                  | Signature verification, ingestion and reconciliation  |
| Campaign            | Draft/frozen/completed and immutable membership manifest                             | Approval freeze and migration 0075 closure projection |

A helper decision grants no membership, approval or provider authority. It cannot
replace a transaction fence. Public errors, preparation/approval hashes,
idempotency identities, quote bindings and cost units retain their existing
contracts. Browser, REST, native and MCP calls continue through their existing
actor/scope/session gates; this candidate adds no new dispatch surface.

## Commands and recovery

| Event             | Eligible source                       | Result and durable guard                                                                                                                   |
| ----------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Approve           | Prepared                              | Exact approval record; no approved dispatch status. Browser/delegated evidence and quote are rechecked in the write.                       |
| Accept            | Prepared                              | Queued plus reservation and outbox atomically; exact confirmation key and current approval required. Replays inspect the original receipt. |
| Claim             | Queued                                | Submitting with one attempt and a two-minute lease. A duplicate queue message does not claim a second attempt.                             |
| Cancel            | Prepared or queued                    | Cancelled under the conditional write; only eligible unsent liability is released.                                                         |
| Provider response | Exact active attempt                  | Accepted requires a remote reference. Rejected means proved no submission; missing/ambiguous response means unknown.                       |
| Lease expires     | Submitting with expired lease         | Submission unknown and attempt unknown; no fresh invocation or automatic release.                                                          |
| Provider callback | Verified, channel-allowed, bound fact | Apply once and project without regressing existing facts. Orphan ingestion is not application to a dispatch.                               |

A prepared command with submission evidence requires reconciliation, rather than
being reinterpreted as a safe replacement. Read-only dispatch validation uses this
classification without issuing approval, allocating funds or calling a provider.
Quote renewal still uses its exact existing no-attempt/no-outbox/no-reservation
transaction fence and creates a separately reviewed replacement.

Approval expiry is the minimum of fifteen minutes from its creation instant and
the applicable quote, delegated-review, secure session, browser session and strong
authentication limits. Moving that calculation into a pure decision does not
extend any deadline or enable an assistant to assert human consent.

## Provider projection is monotone, not a linear diagram

Existing channel ranks are preserved: acceptance 20, printing 30, handover 40,
delivery 50, bounce 55 and complaint 60. Failure ranks 35 for email/fax and 45 for
postal; cancellation ranks 100. Submitting and unknown rank 10. A permitted fact
can skip lower-ranked states. Delivery can supersede failure; email bounce or
complaint can supersede delivery. Lower-ranked late facts still remain durable
but cannot erase stronger projected facts.

The SQL update rechecks eligible predecessor states and the immutable provider
reference after awaits. A pure projection calculated from an earlier read is
never enough to authorize a write. Unknown attempts retain their financial
liability and cannot return to the send queue automatically.

## Campaign completion is operational and financial closure

Migration `0075_campaign_completion.sql` introduces
`operationally_closed_dispatches(organization_id,dispatch_id)` and
`completable_campaigns(organization_id,campaign_id)`. The first view is also a
read-only closure predicate for recovery consumers; it never authorizes a resend
or refunds a charge.

A frozen campaign completes only when it has a recorded manifest, at least one
member, and every member is operationally closed:

- The member is delivered, failed, cancelled, bounced or complained. Postal
  `handed_to_post` also closes operational work; it does not establish receipt.
  Prepared, queued, submitting, unknown, accepted and printed remain open.
- No execution lease or reserved monthly/customer-credit hold remains. Work that
  entered execution must retain closed monthly funding evidence and, in
  production, a settled or released customer-credit receipt. A missing record is
  not proof that executed work incurred no liability.
- A started/unknown attempt remains unresolved unless it is the exact active
  attempt and an applied final provider fact matches its provider/reference.
  Acceptance or printing alone cannot resolve that uncertainty. Historical
  attempt status is retained; the new view does not rewrite it.

Delivery alone therefore does not complete an actual-usage fax campaign. Qualified
usage settlement must close both holds first, even when the fax was delivered.
Conversely a campaign can complete with failures or cancellations: completion is
not a success count and creates no charge, approval, retry or communication.

Guarded triggers reevaluate closure when the last prerequisite arrives: manifest,
dispatch state/lease/reference, attempt outcome, applied provider event or funding
closure. The migration also projects already eligible frozen campaigns. It does
not turn an empty draft into a completed campaign. Frozen/completed membership,
recorded manifest and completed campaign status cannot be reopened or altered
through the guarded writes. Later ranked provider facts can still advance a
member's outcome without reopening membership or settlement.

No new permission is granted. Current workspace authority still gates campaign
creation/reads and dispatch preparation/approval/cancellation. Provider facts and
financial settlements retain their existing trusted entry points. There is no
new assistant completion command or browser claim of consent.

## Verification and remaining limits

Meaningful characterization uses migrated local Workers SQLite with the actual
DomainService, provider-call counters and synthetic provider/operator evidence:

- `tests/integration/domain-invariants.test.ts`: concurrent confirmation, quota
  rollback, duplicated publication/consumption, early/orphan/reordered callbacks,
  immutable membership, approval expiry and unknown lease recovery.
- `tests/integration/campaign-lifecycle.test.ts`: empty/open refusal, final member
  closure, immutable completed membership, duplicate confirmation/invocation,
  reordered/late facts, unknown attempts, null-ownership refusal, tenant isolation
  and postal handover without a delivery claim.
- `tests/integration/fax-usage-pricing.test.ts`: delivered-but-unsettled campaign,
  exact duplicate settlement and closure of a previously unknown attempt without
  another invocation; existing tests retain credit/quote/usage invariants.
- `tests/integration/expert-approval.test.ts`,
  `tests/integration/dispatch-validation.test.ts` and
  `tests/unit/domain-async.test.ts`: authority, bounded review, observational
  validation and readiness-read ordering across the extraction.

Focused local results and the final combined validation must be reported with the
exact source snapshot. They do not qualify production deployment, every provider,
real delivery or a physical native device. No generic statechart dependency,
parallel runtime state store or replacement acceptance path is introduced.

The broader inventory and remaining implementation scope live in
[the state-machine audit](IMPLICIT_STATE_MACHINES.md). The curated public map is
[the engineering state-machine guide](../apps/engineering/src/content/docs/architecture/state-machines.mdx).
