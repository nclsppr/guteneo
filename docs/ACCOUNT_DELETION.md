# Account deletion: implementation boundary and required operating process

Status: design and read-only repository audit, 22 September 2026. This document
applies the existing published retention criteria; it does not create a new
policy or certify a completed erasure. No account, identity, communication,
document or provider resource was deleted for this audit.

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

## What exists

The native API accepts an authenticated, explicit deletion request at
`POST /api/mobile/v1/account/deletion-request` with `{ "confirmed": true }`.
It persists a unique receipt for the user in `account_deletion_requests`, returns
HTTP 202 and exposes the receipt to that user. The iOS interface calls this a
request. It must not describe acceptance of the request as completed deletion.

Migration `0037_native_sessions.sql` includes `requested`, `processing` and
`completed` states, timestamps and an operator processing reference. Those fields
are storage for a future process; they do not perform erasure. There is currently
no deletion processor, provider erasure integration, completion workflow or
qualified operator runbook implemented in the repository.

The `completed` exclusion in native authentication does not by itself revoke
browser or MCP authority. Existing browser authentication, Auth0 callback and MCP
authentication must all be considered in a real deletion implementation. In
particular, deleting a local `auth_identities` mapping while leaving the Auth0
identity active can cause the next callback to provision a new user and workspace.
Deleting a row or blocking one client is not evidence of account deletion.

## Schema and ownership constraints

The account is a person; its workspaces and communications are tenant resources.
`account_deletion_requests` records the workspace from which the request began,
but its uniqueness is per user. Processing must enumerate every current membership
for that user. It must not limit erasure to the first recorded workspace or erase
a shared workspace merely because one member requests account deletion.

The existing schema prevents a broad `DELETE users` operation:

- `0001_core.sql` links memberships and approvals to users. Dispatch payloads,
  recipients, sender snapshots and fingerprints are immutable.
- `0002_auth.sql` links browser sessions, identity mappings and authorized
  connections to users and memberships.
- `0011_account.sql` prevents removal or demotion of the last administrator.
- `0020_postal_preflights.sql` links immutable postal reviews and transfer
  consents to their user.
- `0024_expert_approvals.sql` links expert policies and reviews to users.
  Immutable expert acceptance evidence retains its policy reference and has an
  unconditional delete protection.
- Financial reservations, entries, frozen quotes and settlement proofs have
  their own retention and immutability constraints. Removing these to make a
  foreign-key check pass would destroy business evidence.
- `0037_native_sessions.sql` makes native credentials depend on the browser
  session and membership. Its deletion receipt itself still references the user.

The current document maintenance code implements the published 90-day PDF
eligibility criterion while retaining document metadata. It avoids purging
content attached to dispatches with unresolved outcomes. That bounded file
maintenance is not a full account erasure process or proof that every provider
copy and backup is gone. A request still requires the published necessity review;
the routine maintenance cutoff alone does not decide its outcome.

## Operating responsibilities and decisions still required

The remaining work applies the existing policy to real requests. The service
owner must establish these responsibilities and resolve actual ownership or
retention exceptions before claiming a completed erasure service. This audit
does not invent legal bases, durations or exceptions.

1. Apply the published necessity review to each category in a request: erase what
   is no longer needed, distinguish resources belonging to other members, and
   document the actual obligation, operation or dispute for retained items.
   Record how each exception ends, with a date where established or a review
   criterion where the outcome is unresolved. Financial evidence does not
   automatically justify retaining full message bodies, recipients or PDFs.
2. Define the treatment of shared workspaces, a sole administrator, a workspace
   with only the requesting user, outstanding liabilities and unused balances.
   Choosing a successor administrator requires an explicit authorized human
   decision. Closing a workspace and deleting a personal account are distinct.
3. Establish the required handling of Auth0 identity and grants, document
   storage, Cloudflare backups and D1 Time Travel, technical logs, and relevant
   Telnyx, Pingen and email-provider copies. Record each actual provider's erasure
   or retention capabilities and evidence requirements.
4. Appoint a monitored operator and escalation path able to meet the existing
   response commitment. Establish a completion-notification channel and give a
   truthful account of progress and justified exceptions. Do not substitute an
   invented global completion period for the published response deadline.
5. Reconcile the public description with the actual iOS request route and the
   completion process when implemented. The existing statement that complete
   account deletion is not self-service remains accurate for a receipt-only
   endpoint. Describe any added device-specific handling truthfully; the public
   policy already covers the real authenticated service.

## Proposed implementation, not yet present

Apple accepts a manual deletion process; full automation across the database and
every provider is not required. The in-app request must nevertheless reach a real
operating process, disclose its expected completion time and confirm completion.
The user must not be required to contact support to complete the request.
See [Apple's account deletion guidance](https://developer.apple.com/support/offering-account-deletion-in-your-app/).

One implementation option is a dedicated deletion service, the schema changes
required for safe erasure, an operator tool and tests. Suggested locations are
`apps/api/src/account-deletion.ts`, `scripts/process-account-deletion.mjs` and a
subsequent numbered migration. These are design suggestions, not an architecture
mandated by Apple. A qualified manual procedure may use existing administrative
tools, but must actually remove the account and eligible personal data, preserve
only justified evidence, handle interruptions safely and verify completion. No
such complete procedure is currently qualified in this repository.

If that operator tool is implemented, it should build an idempotent plan for the
complete user, record a hash of that plan, classify every workspace and retained
category, and persist progress
for each database, object-storage and external-provider step. A read-only dry run
should print opaque request references, counts and safe reason codes, never names,
recipients, content, credentials or signed URLs. Applying a plan should require
its exact hash and authorized operator identity. There must be no command that
simply marks a request completed without verifying the deletion steps.

Schema changes need to separate active personal identity from historical evidence
that genuinely must be retained. An appropriate design can remove the profile,
login identity and personal authentication data while retaining only justified,
minimized historical evidence with no active membership or login capability.
Keeping a disabled profile unchanged and calling it deleted is insufficient.
An opaque historical identifier that can still be linked to a person is
pseudonymized evidence, not proof of anonymization; the retained data and its
linkability must be considered together.
Do not disable foreign keys or drop immutability protections as an erasure shortcut.

## Proposed operator runbook, not an available procedure

1. Retrieve the authenticated request, establish operator authority and enumerate
   all memberships. Produce the read-only plan and identify shared-workspace,
   last-administrator, retention, provider and unresolved-delivery blockers.
   Track the published response deadline and any justified extension separately
   from completion; request extra identity evidence only on the published basis.
2. Resolve the ownership choices with the appropriate human. Preserve shared
   workspace resources and other members' access. A dedicated closure lifecycle
   is required for a sole-member workspace; no such lifecycle is implemented by
   the current request endpoint.
3. Record the approved plan and enter processing. Revoke every relevant browser
   session, native session/code, MCP connection and delegated mandate. Ensure
   that browser, native and MCP authentication and callbacks fail closed during
   the required closure state. Handle simultaneous token exchange, callback and
   ongoing operations with transactional guards.
4. Stop new work for a workspace authorized for closure. Cancel only dispatches
   whose current state permits cancellation through existing domain operations.
   Do not force an unknown provider outcome to failure, release its reservation
   speculatively, or retry its send. Reconcile outstanding outcomes before
   removing necessary delivery and accounting evidence.
5. Perform the approved erasure and minimization across D1, R2, Auth0 and relevant
   processors. Preserve only approved retained categories. Persist a checkpoint
   and safe evidence reference for each completed step; an external failure
   leaves the request processing and resumable, not completed.
6. Independently verify that the identity cannot authenticate or silently
   reappear, eligible private content is absent, shared tenants remain intact,
   financial totals and evidence are coherent, and database integrity holds.
   Check each provider's evidence and the applicable backup/retention treatment.
7. Mark completion only after these checks and the approved exceptions are
   accounted for. Send the truthful completion notification through the
   authorized operating process and retain its minimal evidence. Neither the
   current native request endpoint nor this document sends a message.

## Required qualification before App Store submission

Exercise a dedicated test account through the complete process. Tests must cover
multiple memberships, a shared tenant, last-administrator handling, simultaneous
authentication and revocation, expired and replayed credentials, Auth0 callback
recreation, an unknown provider result, and a failure after only one of D1/R2/Auth0
has completed. The interrupted case must resume safely and remain visibly pending
until the remaining required steps succeed.

Record database foreign-key and integrity checks, preserved financial totals,
absence of the targeted personal data and eligible content, independent provider
evidence, the actual notification and compliance with the published response
commitment. Describe the actual completed work and remaining justified retention
without promising an unqualified universal erasure deadline.
Deterministic tests establish code behavior; they do not prove live provider
erasure, a legal retention basis or operational readiness.

An authenticated request button is useful preparation but is not sufficient
evidence of a complete account deletion service. Until the real completion path
is implemented and qualified, account deletion readiness remains a submission
blocker, and the application must not be described as ready for publication.
