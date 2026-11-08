# Account deletion: implementation boundary and required operating process

Status: executable bounded operator workflow, local qualification candidate,
8 November 2026. This document applies the existing published retention criteria;
it does not create a new policy or certify a real completed erasure. The earlier
22 September audit established the policy and schema constraints below. The new
implementation has only been exercised with disposable local D1/R2 data and
synthetic processor responses. No production account, identity, communication,
document or provider resource was changed.

## Existing published commitments

The real authenticated service already has a
[public privacy policy](https://guteneo.com/confidentialite/), implemented in
`apps/web/src/information-page.tsx`. Its public availability and current content
were verified on 22 September 2026 with an HTTP 200 response. The 21 September
update in `docs/CHATGPT_PRIVACY_DRAFT.md` records the editor's authorization to
prepare and publish these pages. Its older 17 September observations do not
supersede that update or the published policy. The legal page no longer describes
only a demonstration.

The existing policy provides the basis for the deletion implementation:

- Requested account and communication functions rely on execution of the
  service. Security, abuse prevention, incident diagnosis and necessary dispute
  evidence rely on legitimate interest. Rights requests and applicable legal
  duties rely on those obligations. Approval of an individual dispatch is not
  blanket consent to reuse its data.
- Stored PDFs become eligible for automatic deletion 90 days after creation,
  during maintenance and only when no associated dispatch remains open or
  unresolved. This is not a guarantee of deletion on the exact 90th day.
- File deletion does not automatically delete metadata or dispatch history.
  Necessity of references, statuses, approvals, financial movements and audit
  evidence is reviewed on each deletion or closure request. Unnecessary items
  are deleted or anonymized; an applicable obligation, unresolved operation or
  dispute permits retention only of the relevant items for the necessary period.
- Account data remains during account use, then only for the same residual
  needs. Support requests remain until resolved and afterwards only when follow-up
  or a dispute requires it. Expired sessions and temporary authorizations are
  cleaned by maintenance; daily content-access counters are cleaned beyond
  31 days. Copies already transmitted to recipients, assistants or providers
  also follow their own retention rules; erasure does not recall a communication.
- Requests use the published contact. Additional identity evidence is requested
  only when there is reasonable doubt and must be proportionate. A response is
  due within one month; complexity or numerous requests can require an extension
  of at most two months, explained during the first month. This response
  commitment is not a promise that every erasure finishes within one month.

These criteria are already selected; a new arbitrary retention period or a fresh
approval of all legal bases is not needed to start implementing them. Publication
does not prove a working erasure process, provider qualification or backup handling.

## Implemented boundary

The native API accepts an authenticated, explicit request at
`POST /api/mobile/v1/account/deletion-request` with `{ "confirmed": true }`.
It persists a unique receipt per user, returns HTTP 202 and exposes that receipt
to the owner. Acceptance remains a request, not completed deletion. There is no
separate browser account-deletion request interface in this change.

`AccountDeletionOperator` in `apps/api/src/worker.ts` is a separate private
same-account service-binding entrypoint. Its HTTP handler returns 404. It is not
an MCP tool, public API, Belvedere read authority or an assistant grant. The
operator can inspect a bounded plan; mutations additionally require
`ACCOUNT_DELETION_ENABLED=true`, a configured secret of at least 32 characters,
an exact reviewed plan hash and an HMAC capability expiring within 15 minutes.
An operator name or evidence-reference string is not authority. Production
processing remains disabled unless an authorized operator configures that gate
and the private binding. This work did not enable it.

Migration `0077_account_deletion.sql` adds frozen plans, exact snapshot assertions,
four durable checkpoints, identity tombstones and unique notification receipts.
The existing public request states stay `requested → processing → completed`.
The implementation is in `apps/api/src/account-deletion.ts`; fixed-origin bounded
Auth0 and receipt reads are in `account-deletion-auth0.ts`.

| Phase        | Required evidence and effect                                                                                                                                                                                                                                                                                         |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Plan         | Enumerate all memberships and user references, including every direct foreign key to `users` and known semantic actor columns. Classify each resource; unknown tables default to blocked. Record each retention decision separately. Return opaque references, counts and safe blocker codes.                        |
| Begin        | Rebuild the exact plan, compare every resource row and scope count again in the status-changing D1 transaction, freeze the plan and encrypted notice recipient, write issuer/subject tombstones, revoke browser/personal/native credentials and OAuth connections. Any failed assertion rolls the entire batch back. |
| Objects      | Delete the exact reviewed R2 keys, including bounded remnants in the account-exclusive personal namespace, and verify absence. Shared-workspace storage is never swept by account prefix.                                                                                                                            |
| Auth0        | Inspect the exact issuer/subject, revoke its listed grants and legacy refresh-token device credentials, delete that user, then verify user 404 and empty grant/device lists. Enterprise user-session endpoints are not used. An unknown response leaves processing; resume inspects the same target.                 |
| Local        | Remove reviewed temporary/active identity records and all memberships; purge eligible owned document metadata and bytes; replace the profile name/email/preferences with a minimal historical skeleton. Preserve only individually reviewed historical evidence and other members' resources.                        |
| Verification | Recheck D1 absence/minimization, foreign keys and scoped integrity, R2 keys and personal namespace, and Auth0 absence. Only then record data verification and allow the canonical completion notice to be prepared.                                                                                                  |
| Complete     | Independently repeat checks and inspect a separately authorized Resend delivery receipt for the exact recipient, subject, plain text, request and plan. The final D1 batch asserts the current resource snapshot again, stores a unique receipt and changes status to completed.                                     |

The profile skeleton and issuer/subject tombstones are pseudonymous retained
records with their own reviewed necessity, not anonymization or universal
erasure. Keeping an unchanged disabled profile does not satisfy this workflow.
No foreign key or immutable delivery/financial evidence protection is disabled.
A document's `purged` metadata remains distinct from physical storage proof.

## Bounded eligibility and honest blockers

The account is a person; a workspace and its communications are tenant resources.
The request's original workspace does not limit the plan to that membership.
Shared workspaces and their remaining members are preserved. A last
administrator, sole-member workspace or unsupported authored-resource ownership
blocks processing until a human arranges a live successor or a separate safe
workspace closure. There is no automatic ownership transfer or workspace erasure.
An administrator already processing deletion cannot count as a successor, and
ordinary membership changes cannot leave a workspace supported only by a closing
account's retained administrator row.

The current executable scope deliberately blocks unsupported Studio ownership,
secure-distribution authorship, unsupported provider-content retention, unresolved
funding or delivery liability, accepted delegated evidence dependencies, active
copy preparation, in-flight uploads and unresolved multipart storage debt. A
cancelled/expired/rejected multipart label alone is insufficient: its outstanding
R2 writes must have drained and canonical cleanup must have settled storage debt.
Unsupported schema references, oversized plans or missing processor proof remain
blockers. These outcomes preserve a real pending request; they do not invent a
completed state.

Limits are explicit: at most 300 inventoried rows/2 MiB of transient snapshots;
execution requires at most 60 resources, 20 exact R2 keys and two Auth0 identities.
An identity with more than 20 listed grants or refresh credentials also refuses
processing rather than applying a partial unbounded plan. Provider reads have
fixed origins, ten-second request deadlines and bounded response bodies. Redirects
are refused with native Worker-compatible manual handling.

Each retained resource needs its own opaque `resourceRef`, recorded `basis`,
`evidenceReference` and ending `reviewCriterion`. The plan also requires reviewed
treatment for profile evidence, the rights-request record, identity tombstones,
backups/Time Travel and the completion-notice processor. A generic policy label
is not proof that a particular obligation exists. The operator must establish
those actual grounds, periods or review criteria in the referenced private case.
The code cannot independently establish legal necessity or processor backup
expiry. Missing or unsupported evidence must not be represented as reviewed.

Historical transport/provider records, recipient copies, backups and logs are
not claimed universally erased. The supported plan either retains an individually
reviewed necessary record or blocks an unsupported resource. A historical private
document already submitted to a provider is blocked by the current scope; an
ordinary PDF with an unresolved dispatch is also blocked. File eligibility under
the published 90-day maintenance policy is a separate lifecycle, not an erasure
exception invented by this operator.

## Race and interruption handling

During processing and after completion, browser, personal, native, development
MCP and signed OAuth access are refused. Exact issuer/subject tombstones prevent
an already-issued Auth0 callback or old OAuth token from silently creating a new
account after local identity removal. D1 insertion guards cover identities,
sessions, memberships, private uploads and other supported owned-resource writes;
domain and Studio mutations also recheck current closing-account authority.
Existing secure preparation refuses a closing actor. An unfinished personal
copy or upload blocks beginning erasure until its writes are settled.

An advance claim has a 60-second lease. Each bounded storage/identity operation
checks the current capability and lease; every checkpoint and final proof write
has an exact token/deadline SQL guard. The local mutation batch establishes its
live lease in its first atomic assertion. A stale worker cannot publish progress,
minimize a profile or clear a replacement worker's lease. Verified checkpoints
are retained across interrupted calls, and final verification still repeats.
Repeated exact object deletes and exact-target identity verification are bounded
recovery steps; this service has no communication send or blind replay operation.

The notification recipient is encrypted before profile minimization and is never
printed by the CLI. No notice is available before all required erasure checkpoints
are verified. A separately authorized operator sends the exact exported plain-text
notice, then supplies its provider receipt. The service only performs a GET:
`last_event=delivered`, exact singleton `to`, empty/null `cc` and `bcc`, exact
subject/text, no alternative HTML body, and creation after data verification are
mandatory. Accepted/sent, missing, malformed, redirected or unknown evidence
leaves the request processing. A receipt cannot be reused for another request.
After completion the encrypted recipient is cleared; necessary receipt and
processor-retention evidence remains. A final-write interruption can resume
against the same receipt without sending another notice.

## Private operator runbook

Apple permits a manual process but requires a real path from the in-app request,
a truthful expected duration and completion confirmation. The ordinary user must
not be required to contact support to finish the request. See
[Apple's account deletion guidance](https://developer.apple.com/support/offering-account-deletion-in-your-app/).
Track the published one-month response commitment and any justified extension
separately from an actual completion estimate. The monitored operator and case
handling must be qualified before enabling production processing.

1. Retrieve the authenticated request and establish the private operator
   authority. Use a directory outside every Git checkout with mode 0700; every
   JSON input/output is mode 0600 and must not be a symlink. Keep secrets, profile
   details and provider receipts out of logs, shell arguments and repository files.
2. Run `node scripts/process-account-deletion.mjs plan /absolute/private/plan.json`
   with `{ "requestId": "<receipt>" }`. The result contains only opaque references,
   classifications, counts and blocker codes. Resolve ownership, liabilities and
   each actual retention/processor exception in the private case. Supply the
   resulting `retentions` array to a second plan call and review its exact hash.
3. Prepare a private authorization input containing `requestId`, `planHash`,
   integer millisecond `expiresAt`, the configured `operatorSecret` and, for
   begin, the reviewed `retentions`. Run the CLI's offline `authorize` action with
   a new private output path. It creates the HMAC command without contacting a
   service or copying the secret into its output. A new bounded capability is
   required when the prior one expires.
4. Run `begin` with that command file. Resource changes require a new review;
   transactional mismatch leaves the request requested, with no tombstone or
   partial session revocation. For subsequent commands use the same exact plan
   and a capability command without the begin-only `retentions` field.
5. Run `advance` until it returns `nextAction: verify_completion_notice`. Failures
   remain processing; inspect private safe-code/checkpoint evidence. Do not force
   a checkpoint or unknown provider outcome to completed. Shared-workspace
   closure, unsupported ownership and provider retention require their own safe
   process, not SQL bypasses of this workflow.
6. Run `notice` with a fresh private output path. It writes the canonical
   recipient/subject/plain text only to that file. Obtain separate real-send
   authorization and send exactly once through the authorized operating process.
   This CLI and service do not send. Inspect the original receipt if the send
   outcome is unknown; do not resend speculatively.
7. Add the original `notificationReceiptId` to a fresh command file and run
   `complete`. Only verified delivery and repeated erasure checks can close the
   request. Retain the minimal case proof and apply each retained resource's
   actual ending date or review criterion. Securely dispose of temporary secret
   and notice files according to the reviewed operating policy.

All remote actions use the explicitly configured same-account private binding;
the included JSONC helper has no routes or public preview. The ability to create
a private binding is not itself a legal retention determination. This runbook
must not be executed against production without the user's separate authorization.

## Qualification and remaining proof

`tests/integration/account-deletion.test.ts` exercises the complete eligible path
on all migrated disposable D1/R2 data with synthetic Auth0/Resend responses. It
covers all memberships/shared workspaces, invalid authority, exact plan and
retention requirements, interrupted identity erasure, current authentication and
callback recreation denial, final-read races, stale lease ownership, multipart
storage debt, active-successor preservation and receipt timing. It also runs the
processor adapter in actual local workerd to verify redirect handling.
`tests/security/account-deletion-operator.test.mjs` covers private capability files,
bounded expiry and refusal to print a completion notice to the terminal.
These tests establish implementation behavior, not live erasure or a legal basis.

Before production enablement, qualify a dedicated real account end to end with
reviewed actual provider scopes/capabilities, delivery evidence, backup/Time Travel
and log retention, preserved accounting evidence, monitored response timing and a
truthful completion notification. Auth0 grant/device credential and user deletion
must use the exact supported tenant; see the official
[refresh-token revocation guidance](https://auth0.com/docs/secure/tokens/refresh-tokens/revoke-refresh-tokens).
Resend receipt inspection follows its
[retrieve-email API](https://resend.com/docs/api-reference/emails/retrieve-email),
including the official SDK's
[nullable empty-recipient fields](https://github.com/resend/resend-node/blob/main/src/emails/interfaces/get-email-options.interface.ts).

No production processor, real notice delivery, native device or App Store
qualification was performed here. Local synthetic evidence does not establish
publication readiness. Unsupported or unresolved real cases remain legitimate
blockers until their required safe process and evidence exist.
