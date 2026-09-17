# SES sending limits and refusal handling

Implemented locally on 2026-09-17. This is not evidence of an SES production-access approval, a real send, a remote migration or an active public email beta.

## Qualified boundary

The SES sandbox is regional and permits only verified addresses/domains or the AWS mailbox simulator. Its default ceilings are 200 recipients per rolling 24 hours and one recipient per second. A Guteneo dispatch has one recipient, so one dispatch consumes one unit. Removing the sandbox and increasing a quota are separate AWS decisions. The limiter does not verify recipients and cannot bypass AWS's identity restrictions.

Sources checked 2026-09-17:

- [AWS sandbox restrictions](https://docs.aws.amazon.com/ses/latest/dg/request-production-access.html).
- [AWS rolling quotas, regional scope and recipient counting](https://docs.aws.amazon.com/ses/latest/dg/manage-sending-quotas.html).
- [AWS rejection on sending limits](https://docs.aws.amazon.com/ses/latest/dg/manage-sending-quotas-errors.html).
- [SES v2 SendEmail response and documented errors](https://docs.aws.amazon.com/ses/latest/APIReference-V2/API_SendEmail.html).
- [Cloudflare D1 atomic batches](https://developers.cloudflare.com/d1/worker-api/d1-database/).

## Durable transport guard

`submitSesWithLimits(DB, scope, send, { now })` wraps exactly one provider invocation, after the normal active-attempt, immutable approval/content/quote and bridge-claim checks. `scope` includes the qualified stable AWS account ID, region, sandbox flag and exact organization/dispatch/attempt IDs. A credential rotation cannot reset this bucket. Every Guteneo organization using that account and region shares it; there is no tenant-controlled quota parameter or public quota-management endpoint.

Migration 0017 adds `ses_send_reservations`, one immutable identity per attempt. Its foreign key binds the organization, dispatch and attempt together. A single guarded D1 insert atomically checks the active production SES attempt, all in-flight reservations, the cooldown and the rolling total. Only the request whose insert changed one row may call the provider. A duplicate attempt returns uncertainty and never calls SES again, even after the quota window or after configuration changes.

The default is 200 recipients per 24 hours. Known accepted sends count for 24 hours from the acknowledgement observed by Guteneo, deliberately no earlier than the possible acceptance at AWS. Pending and unknown outcomes remain counted without an automatic expiry. There is also one in-flight submission per account/region, followed by at least one second after its result before another submission. This is more conservative than AWS's permitted bursts and may achieve a lower throughput than one message per second. There is no sleeping Worker and no automatic send retry. A busy or full bucket produces a definite local refusal before contacting AWS; another sending command requires a fresh preparation/approval.

A provider response explicitly rejecting the message releases the daily transport reservation, but retains the one-second cooldown. Network timeout, lost response, 3xx, 408, 409, 5xx or malformed acknowledgement is uncertain and retains the reservation. Rejection of a local guard also leaves the existing domain rejection path responsible for releasing the organization's monetary reservation; this table never adjusts money.

The existing domain lease recovery marks abandoned attempts unknown. A trigger then releases the in-flight mutex, starts a new cooldown, and continues to count the unknown recipient. Positive SES acceptance/delivery/bounce/complaint/failure facts already verified and bound by the provider-event path convert the transport reservation to accepted. A bounce or later delivery failure never refunds the SES sending unit. Such positive reconciliation starts a conservative 24-hour window from receipt of the fact. Absence of a callback is never non-acceptance proof.

## Configuration and operations

A qualified AWS principal must match `SES_ACCOUNT_ID` and `AWS_REGION` used by the live quote/transport configuration. A malformed/missing identity or unavailable D1 fails closed before a provider request. The callback passed into the helper must remain the existing one-request SES adapter with SDK retries disabled. This limiter does not itself enable `LIVE_SENDS_ENABLED`, sender/channel controls, registration or any provider credential.

The empty `ses_send_limit_policies` table permits a later, explicitly qualified account/region policy: integer daily ceiling 1–100000, interval 1–60000 ms, qualification date, expiry and source reference/hash. Only a current `qualified` row is used. Missing, expired or revoked qualification falls back to 200/1000 ms. Sandbox mode additionally clamps every policy to no more than 200 and no faster than 1000 ms. The migration installs no policy, quota increase or account identifier.

Before first activation or restoration, reconcile the account's actual `SentLast24Hours` and any sends outside this ledger. Use a dedicated Guteneo sending principal/account scope and ensure all Guteneo SES sends traverse the guard. The local table cannot observe messages sent independently through the AWS console or other applications; AWS remains authoritative and its explicit quota refusals are handled safely. Restoring an older D1 snapshot must not erase known accepted/unknown activity: stop sending and reconcile first, as in the runbook. Do not delete reservations to unblock a quota. Indefinitely unknown reservations require positive provider evidence and an audited reconciliation, not an elapsed timer or a user retry.

## Safe error projection and UI

The SES adapter reads at most 16 KiB of an error body and emits an allowlisted code only. AWS error text, identity lists, access keys, request headers and arbitrary request IDs are neither returned nor logged. `TooManyRequestsException`/`ThrottlingException` become quota/rate/refusal messages; `MessageRejected` distinguishes unverified identity evidence from general content rejection without echoing the identity. Sender/configuration/access/suspension errors are also explicit. A definitively rejected request is never represented as accepted, and an uncertain transport never becomes a retryable rejection.

The dashboard translates these codes in errors and failed/unknown dispatch details. It explains verified-recipient restrictions when relevant, makes local versus AWS refusal explicit, and tells users not to recreate an uncertain send. The public API shape is unchanged; `attempts.error_code` was already returned by the dispatch detail endpoint.

## Evidence and limits

`tests/unit/ses-send-limits.test.ts` uses actual Miniflare/workerd D1 for cross-tenant concurrency, atomic acquisition, 200-recipient rolling boundaries, one-second completion cooldown, long in-flight requests, attempt identity/tenant checks, unknown outcomes, explicit refusal, conservative qualification and positive reconciliation. `tests/unit/providers.test.ts` intercepts SES transport to check its wire shape, safe refusal projection, bounded bodies, ambiguous statuses and single network invocation. The live-provider suite covers integration with durable attempts; browser UI error fixtures are separate from real AWS results. These tests perform no real email or remote D1 operation.
