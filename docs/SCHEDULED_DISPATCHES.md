# Scheduled dispatches

This candidate adds a separate, revocable human approval for one future dispatch.
It does not extend an ordinary approval or an assistant mandate. Migration
`0080_dispatch_schedules.sql` must precede the runtime. Deployment, production
activation and a real scheduled communication remain separately unqualified.

## User contract

Start with an exact prepared fax or message-only email. Choose an instant at
least one minute and at most thirty days ahead, and an integer EUR-cent maximum
total customer charge. The browser shows local/UTC time, the fifteen-minute
release window, recipient, sender, message or exact PDF, and the cap. Tax treatment
continues to follow the qualified quote's existing fiscal disclosure.

Creating a schedule creates a draft and locks immediate acceptance of that
original command. It reserves no quota or credit and grants no spending authority.
Ordinary approval is also refused, with a final SQL race guard, and the existing
source detail read projects its active schedule for recovery.
Dispatch-list rows project the same bounded metadata without per-row queries.
Held originals belong to the in-progress list/count rather than ordinary approval
or done; eligible draft-schedule attention links open their distinct review.
A current browser administrator or supervisor with approval permission must
separately review and explicitly approve the immutable snapshot. Email also
requires the recipient-request attestation. The approver may differ from the
preparer. Ordinary members can prepare a schedule but cannot approve it.
Approval must commit before the release window ends. Explicit current-human
approval within that window is allowed; an expired draft records no grant and
does not cancel its source, including if expiry wins at the final database write.

Approval records `approval_kind='future_browser'` in
`dispatch_schedule_approvals`, with the approving principal, actual browser
credential hash, snapshot hash, time and recipient attestation. No fresh browser
or expert record is fabricated in the existing `approvals` table. Approval makes
the original prepared command cancelled so that immediate and future sending
cannot both accept it. The schedule is the place to revoke future authority;
ordinary cancellation of a held original refuses with `SCHEDULE_SOURCE_LOCKED`,
including when that original already reads cancelled. Read its `activeSchedule`
and cancel the schedule itself. The original status cannot prove grant revocation.

The release window bounds **acceptance into the ordinary dispatch queue**. It is
not a guaranteed provider invocation or delivery time. The queue and provider
still apply their own current quote, configuration and submission guards.

PDF email, protected links, secure distribution and postal delivery are refused
with `SCHEDULE_CHANNEL_UNSUPPORTED`. Their document/session/identity/transfer
freshness and distinct consent gates remain in their existing journeys. A review-
only fax cannot become sendable through scheduling.

## Authority and atomic execution

Preparation checks the creator's direct source-document access and ready status
before holding the original, and repeats these conditions in the insertion
transaction. Permission to review another member's private dispatch does not
grant permission to prepare that private document for a scheduled release.

The source command is immutable. The schedule hash binds that exact source and
fingerprint, preparer, instant, release deadline and cap. Changing any of these
requires a new draft and new explicit human approval. A schedule has one stable
release preparation key, `schedule:<id>`, and at most one immutable release
receipt. Every command using such a key requires valid future-release evidence,
including a preparation left unattached after an interrupted response.

The existing minute scheduler considers at most five due schedules per call
(hard maximum twenty). It claims `approved -> releasing` once, prepares a fresh
quote with the same recipient, PDF, sender, options and final message, and checks
that its charge and ceiling fit the approved cap. An incompatible message or
sender configuration blocks release rather than silently changing the snapshot.

At the acceptance transaction, `valid_future_dispatch_releases` checks the real
database clock, current preparer and approver membership, deletion state, exact
source/release fields, source ownership/readiness, allowed workflow, cap and
unrevoked evidence. Role/removal changes permanently invalidate pending grants;
restoring membership cannot revive them. Existing sender, scan, tariff, provider,
suppression, quota and credit constraints remain mandatory.

The ordinary `prepared -> queued` transition still owns quota reservation and
outbox insertion atomically. Its same transaction records the schedule as
released and retains the acceptance audit. Provider bridges accept the separate
future receipt only through `accepted_scheduled_dispatches`, together with the
normal active attempt, invocation fuse, financial reservation, exact bytes,
fingerprint, qualified quote and provider gates. Telnyx, SES and Resend do not
receive a synthesized human approval. Unknown provider outcomes retain their
existing reconciliation and no-resend behavior.

## States and recovery

| State | Meaning and permitted recovery |
| --- | --- |
| `draft` | No spending approval. Review, approve when activation permits, or cancel. |
| `approved` | Immutable bounded future authority; still no financial reservation. Cancel the schedule to revoke it. |
| `releasing` | One processor owns preparation/acceptance. Cancellation and acceptance race at the database boundary. |
| `released` | Accepted into the ordinary queue, with a linked dispatch. Its existing cancellation/tracking rules apply. |
| `blocked` | A known authority, source, price, funding, configuration or window refusal. No automatic release retry. |
| `unknown` | Interrupted release needs same-ID observation. No automatic release retry or replacement key. |
| `cancelled` | Future authority revoked. The original command is not restored to prepared. |

A release interrupted for more than two minutes becomes unknown, not approved.
Reads never release work. If acceptance won, its schedule receipt is committed in
the same transaction and the linked dispatch owns subsequent outcome tracking.

`canReschedule` is a server-derived recovery capability. An explicit new draft
may reuse a held cancelled source only when prior schedules are terminal blocked
or cancelled and neither the source nor any prior release has an attempt,
outbox, provider reference, accepted outcome or unknown/released schedule.
Unsubmitted orphan release preparations are cancelled atomically. A new draft
inherits no approval; time and cap are reviewed again. This path cannot bypass an
uncertain or already accepted communication.

## Surfaces, activation and privacy

Browser routes are `/app/schedules`, `/app/schedules/new?dispatch=<id>` and
`/app/schedules/<id>`. REST exposes collection/read, draft creation, browser-only
approval and explicit cancellation under `/api/dispatch-schedules`. Creation
requires a stable `Idempotency-Key`; approval binds `expectedRevision`,
`snapshotHash`, the exact acknowledgement and email attestation; cancellation
binds the current revision. Listing and direct reads use the same current
creator/approver/administrator visibility rules and source authority.

MCP exposes prepare/read/list/cancel operations under existing scopes. It exposes
no future-approval or activation tool. OAuth scopes and host confirmation do not
create browser-human consent. Native clients gain no future-approval authority.
The ordinary native browser handoff remains separate.

`SCHEDULED_DISPATCH_ENABLED` defaults off. A disabled engine permits drafts but
refuses future approval without cancelling the original. Production release also
requires the channel's actual transport activation and configuration; enabling
the schedule flag alone enables no provider or account. This implementation does
not change deployed settings.

Schedule metadata contains identifiers, a hash, time, cap and lifecycle evidence;
the immutable source already owns content and destination. The attention queue
returns only authorized metadata, without message, recipient, title or secret.
No customer content, recipient or credential is added to logs or schedule audits.

The private account-deletion processor retires pending schedules and revokes
future grants atomically when processing begins, cancels unaccepted source and
release commands, and verifies no runnable authority remains. Exact historical
source/consent evidence requires the existing explicit retention review. Accepted
or uncertain provider liabilities must close before erasure; deletion cannot
relabel them as completed. Saved-contact erasure and callback secret retirement
follow their own reviewed resource actions in the same processor.

## Qualification

The local migrated-D1 schedule suite exercises the actual future database clock,
human-versus-assistant approval, activation refusal, immutable source lock,
revocation, current authority/source, fresh-cap refusal, duplicate due processing,
atomic reservation/outbox and terminal recovery. Production-mode fixtures use the
real Telnyx usage-pricing, SES and Resend domain/provider bridges with injected
synthetic transport only. They exercise separate future evidence without an
ordinary approval row, fresh quotes, retained uncertainty and no second invocation.

The account-deletion suite verifies contact purge, schedule/grant retirement,
callback URL/secret tombstones and complete deletion with real local R2 and
synthetic external processors; a final-transaction callback-invocation race must
roll back processing. HTTP tests exercise the mounted cookie/origin/CSRF gates.
Browser schedule tests are authored separately in
`tests/e2e/dispatch-schedules.spec.ts`; their execution belongs to the final
qualification record, not an inferred result from backend tests.

These are local/synthetic implementation proofs. They establish no production
activation, actual scheduled provider send, recipient delivery, physical-device
qualification or hosted assistant journey.
