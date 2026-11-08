# Queue incident resolution

Local implementation candidate from the state-machine audit. Publication and real
provider qualification remain separate. Migrations 0075 and 0076 precede runtime
use of this new browser-only operation.

## Meaning and authority

A dead-letter row records queue processing failure, not permission to transmit
again. A current browser administrator may inspect its original dispatch in
Administration → Settings, then explicitly resolve the diagnostic when the
command is operationally and financially closed. Supervisor, operator, observer,
OAuth/MCP and native actors have no resolution authority. No extra membership
role, assistant mandate or provider capability is introduced.

`POST /api/admin/dead-letters/:id/resolution` accepts only `{ "confirmed": true }`.
The existing browser middleware checks Origin and CSRF. The service checks the
current workspace/mode and fences the actual unexpired browser credential and
current administrator membership at the atomic batch's first mutation. Its state
update requires that newly inserted receipt; a second wall-clock gate cannot
split the pair when a session expires during the batch. Identifiers never select
a different tenant. Unlinked/global malformed queue records are not exposed as
workspace incidents or resolvable through this route.

## States, effects and recovery

The lifecycle is unresolved → resolved. The shared `operationally_closed_dispatches`
view owns the prerequisite used by both campaign completion and incident closure:
channel-appropriate closed execution, no live lease, no reserved monthly/customer
hold and no unresolved attempt without matching final provider evidence. Postal
handover is an execution boundary, not a final-recipient receipt claim.

One D1 batch inserts an idempotent `dead_letter.resolved` audit receipt and records
its timestamp on the diagnostic. It changes no dispatch, reservation, credit,
outbox or attempt and invokes no provider. The SQL guards require closed original
work and its matching audit receipt, retain diagnostic identity and prohibit
clearing/replacing the first resolution timestamp.

- `INCIDENT_STILL_OPEN` (409): inspect/reconcile the original command and its holds;
  resolution cannot hide an unknown outcome or release funding.
- `NOT_FOUND` (404): missing, unlinked, inaccessible or cross-workspace incident.
- `ADMIN_REQUIRED` (403): a current browser administrator credential is required.
- `INCIDENT_RESOLUTION_CHANGED` (409): authority/eligibility changed before the
  transaction; refresh the same incident under current authority.
- After a lost response, reread the diagnostic. Repeating the same confirmed ID
  returns its original receipt; it does not send or create another resolution.

The preview does not mutate queue work. Existing unresolved-dispatch attention
views remain independent of the diagnostic list and its resolution timestamp.

## Implementation and evidence

- `apps/api/src/dead-letters.ts`: typed service and atomic authority/closure fence.
- `migrations/0075_campaign_completion.sql`: shared execution/financial closure.
- `migrations/0076_dead_letter_resolution.sql`: retained identity and resolution guards.
- `apps/api/src/index.ts`: browser-authorized route; no MCP tool is added.
- `apps/web/src/administration-operations.tsx`: explicit inspection/confirmation,
  resolved date and four-language copy in the existing Administration chunk.
- `tests/integration/dead-letter-resolution.test.ts`: real migrated-D1 concurrent
  resolution, no-send/no-financial effects, unfinished command, cross-tenant/actor
  refusal, credential revocation between read/write, SQL bypass and rollback.
- `tests/e2e/workspace-administration.spec.ts`: four-language deliberate-action
  browser cases use intercepted synthetic API responses, not real queue writes.

The migrated-D1 suite passes 17/17, including current-credential channel-control,
expiry-within-batch atomicity and actual Hono cookie/CSRF/MCP/native boundaries.
The new incident browser
cases pass 12/12 across four languages and desktop Chromium, Pixel 7 Chromium
and iPhone WebKit. Final integrated evidence is recorded in
`STATE_MACHINE_EXECUTION.md`; neither suite establishes production
resolution, a real provider outcome or publication.
