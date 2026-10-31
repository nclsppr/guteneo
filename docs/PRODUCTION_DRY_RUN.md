# Dry-run validation of an existing dispatch

Deployed **10 October 2026 at 02:30:52 UTC**, application
`c953596dc0650961a7294da622703f5edc3a764d`; 262 public assets verified. Anonymous
`GET /api/dispatches/status-probe/dry-run` returned **401, Cache-Control:no-store**.
This proves anonymous access refusal, not execution of business guards.

**Authenticated production remains unqualified:** no authenticated dry run on a
production dispatch or delivery was executed for this qualification.

Validation rereads an existing prepared dispatch and recorded evidence. It creates,
renews or consumes no quote; no approval, credit reservation, outbox or provider
attempt. It contacts no business provider, scanner or renderer. A favorable result
remains **partial** because atomic acceptance/delivery are not executed. Missing
proof never becomes success.

## Entry, access and surfaces

Input is an existing dispatch ID. Authentication supplies workspace; a client ID
cannot prove access. Current rights/document privacy match `getDispatch`, including
only the existing exact-dispatch approver exception for another creator's private PDF.

| Surface | Contract | Authority |
| --- | --- | --- |
| REST | `GET /api/dispatches/:id/dry-run`, no body/idempotency key | Existing authentication; OAuth `dispatches:read` |
| MCP | `dry_run_dispatch({dispatchId})` | Valid connection, scope and current membership |
| Web | No new dashboard button/journey | No added authority |
| Native | No screen/dedicated mobile route | Existing contracts unchanged |

All four roles may read accessible dispatches. Supervisor approval is unnecessary
except where it grants private-PDF review access. Observers gain no preparation/
approval/confirmation. Assistants assert no human consent or mandate.

Read-only describes **business operations**: domain uses reads, while HTTP/auth/MCP
may record rate counters/connection observations. Hints are
`readOnlyHint:true`, `idempotentHint:true`, `destructiveHint:false`,
`openWorldHint:false`, without business-write/send authority. Ordinary resources
are consumed; zero infrastructure cost is not promised. Authentication may fetch
Auth0 public keys, so no business-provider contact is not zero network activity.

## Result and guard scope

REST and MCP return the same domain schema, whose example values are not proof:

```ts
{
  schema: 1,
  execution: "validation_only",
  dispatchId: string,
  fingerprint: string,
  dispatchMode: "production" | "simulation",
  checkedAt: string,
  status: "partial" | "blocked",
  checks: Array<{
    id: string,
    status: "passed" | "blocked" | "not_checked",
    code?: string
  }>
}
```

| Check | Evidence | Limit |
| --- | --- | --- |
| `prepared_state` | Still `prepared` | Other states block; never reset preparation. |
| `submission_not_started` | No incompatible attempt/provider reference | Never resumes existing/unknown submission. |
| `quote` | Stored production quote valid for exact dispatch | Expiry/revocation/review-only purpose block; no new price. |
| `protected_document` | Stored protected-hosting guards where applicable | No download, new link, hosting or render. |
| `recipient_suppression` | No recorded email suppression where applicable | No recipient contact/mailbox qualification. |
| `acceptance` | `not_checked`, `NOT_EXECUTED` | No atomic quota/reservation/acceptance exercise. |
| `provider_delivery` | `not_checked`, `NOT_EXECUTED` | No submission/callback/delivery test. |

`partial` means executed guards found no blocker, never ready-to-send or full
end-to-end qualification. `blocked` means at least one blocker. Inapplicable checks
stay `not_checked`/`NOT_APPLICABLE`, never default-passed. Simulation quote checks
stay `not_checked`/`SIMULATION_NOT_PRODUCTION_PROOF`. Wrong state returns
`INVALID_STATE`; unexecuted preparation guards use `DISPATCH_NOT_PREPARED`.
An existing attempt/reference returns `SUBMISSION_ALREADY_STARTED`.

Output omits recipient/content/secrets/signed URLs. ID/hash associate exact private
workspace evidence; never publish them in anonymous monitoring/content logs.

## Journey and automation

1. Select an accessible existing prepared test dispatch. Earlier preparation is separate and may have stored data or required authorized postal transfer.
2. Call REST/MCP on that ID without creating replacement dispatch/quote.
3. Retain checked time, mode, hash, global status and each result; separate passed, blocked and unexecuted guards.
4. Resolve blocker codes through existing journeys. `partial` authorizes no automatic approval/confirmation.
5. Reread the same ID if needed; quotes expire normally with no extension/future-validity reservation.

Scheduled use needs authorized least-privilege access and preexisting test IDs,
never quote creation by a probe. Bound frequency/concurrency/count and honor rate
limits. Dispatch/rights/quote/time can change results. Sequential guards take no
lock/reservation, so concurrent changes may stale observations; only actual
acceptance guards authorize commitment. No scheduler/production secret is installed.
Access failures remain errors, not passed guards. Reauthenticate explicitly; do
not switch workspace/document to bypass refusal. Network failure means unknown;
reread without prepare/renew/send. Expired quotes require the existing distinct
renewal journey; prior approval never silently transfers.

## Production runner

`scripts/production-dry-run.ts` performs only canonical reads. Accepts 1–10 distinct
existing IDs through repeated `--dispatch`; no arbitrary domain/redirect. Sequential
requests are bounded by ten seconds/64 KiB. Prerequisites: compatible published
version, valid `dispatches:read` bearer/current membership, access to chosen dispatches
and unexpired quotes. Inject `GUTENEO_DRY_RUN_TOKEN` through process secret handling,
never arguments/logs. Replace the illustrative ID:

```sh
npm run test:prod:dry-run -- --dispatch dsp_EXAMPLE
```

Runner checks schema/requested ID/production mode/exact seven unique consistent
guards. Refuses observations older than 120 seconds or over 30 seconds in the
future. Acceptance/delivery must remain `not_checked`/`NOT_EXECUTED`; simulation
never qualifies production.

| Result | Exit | Meaning |
| --- | --- | --- |
| `validation_passed`, `qualification:partial` | 0 | Executed guards pass for all chosen dispatches; no acceptance/delivery. |
| `attention` | 1 | Blocked or unusable evidence: HTTP/network/time/schema/mode/freshness. |
| Invalid prerequisites/arguments | 2 | Reads did not start. |

JSON numbers scenarios and retains codes/times, removing dispatch IDs, hashes,
content, recipients and tokens. CI must read partial qualification, not exit 0
alone. IDs remain private inputs, not published command transcripts. Runner
installs no cron. Scheduled operation still needs bounded-access qualification
and must never renew/replace expired work for green results. Token/quote expiry
remain independent.

## Evidence and remaining qualification

Shared implementation: `DomainService.validateDispatch` in
`packages/domain/src/index.ts`; schema
`packages/contracts/src/dispatch-validation.ts`; transports `apps/api/src/index.ts`
and `mcp.ts`. Dedicated tests: `tests/integration/dispatch-validation.test.ts`,
`tests/unit/mcp-dispatch-validation.test.ts`, `tests/unit/production-dry-run.test.ts`.

10 October local integration proof: **31/31** on migrated local D1 covering fax-v3,
postal/Resend quotes, protected links, expiry/revocation/configuration, four roles,
tenant/document isolation, engaged states and no business mutation after repeated
reads. Real local HTTP checks authorized observer, anonymous refusal/no-store;
only permitted HTTP counters change. Production-mode data is still local fixture
evidence. Postal fixture contains preflight/consent/quote; repeated reads leave
business tables untouched without resolver/provider calls. MCP/runner proof remains
separate.

Production authenticated qualification needs a real test account and explicitly
chosen existing dispatch. This validates neither new Auth0 login, actual stored
bytes, scanner freshness, actual analysis/rendering, SQL reservation, available
balance/quota nor a provider. Real delivery always needs separate authorization/proof.
See [roles](WORKSPACE_ROLES.md), [invariants](ARCHITECTURE.md),
[credits](WELCOME_CREDIT.md), [delivery quotes](LIVE_DELIVERY_QUOTES.md).
