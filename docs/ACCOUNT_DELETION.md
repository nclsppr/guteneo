# Account deletion: implementation boundary and required operating process

Status: design and read-only repository audit, 22 September 2026. This document
does not establish a retention policy or certify a completed erasure. No account,
identity, communication, document or provider resource was deleted for this audit.

## What exists

The native API accepts an authenticated, explicit deletion request at
`POST /api/mobile/v1/account/deletion-request` with `{ "confirmed": true }`.
It persists a unique receipt for the user in `account_deletion_requests`, returns
HTTP 202 and exposes the receipt to that user. The iOS interface calls this a
request. It must not describe acceptance of the request as completed deletion.

Migration `0033_native_sessions.sql` includes `requested`, `processing` and
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
- `0033_native_sessions.sql` makes native credentials depend on the browser
  session and membership. Its deletion receipt itself still references the user.

The current document maintenance code removes eligible R2 content after its
configured 90-day operational cutoff, while retaining document metadata. It
avoids purging content attached to dispatches with unresolved outcomes. This is
an implementation fact, not an approved legal retention period, a full account
erasure process, or proof that every provider copy and backup is gone.

## Decisions required from the service owner

These decisions must be recorded before enabling and describing a completed
erasure service. This audit does not invent legal bases, durations or exceptions.

1. Define the data categories that are erased, retained for a specific lawful
   purpose, or owned by another workspace member. State the basis and duration
   for each retained category, including how retention ends. Financial evidence
   does not automatically justify keeping message bodies, full recipients or
   original PDFs indefinitely.
2. Define the treatment of shared workspaces, a sole administrator, a workspace
   with only the requesting user, outstanding liabilities and unused balances.
   Choosing a successor administrator requires an explicit authorized human
   decision. Closing a workspace and deleting a personal account are distinct.
3. Establish the required handling of Auth0 identity and grants, document
   storage, Cloudflare backups and D1 Time Travel, technical logs, and relevant
   Telnyx, Pingen and email-provider copies. Record each actual provider's erasure
   or retention capabilities and evidence requirements.
4. Appoint an operator and establish a real processing period and a completion
   notification channel. Publish only the period and service that the operator
   can deliver. A pending request must have a monitored owner and an escalation
   process.
5. Approve an updated public privacy policy for the real authenticated service
   and iOS app. The existing legal page's demonstration and Cloudflare explanation
   is not a full description of authenticated account and communication data.

## Proposed implementation, not yet present

The minimal implementation should add a dedicated deletion service, an explicit
schema migration for deletion state and retained evidence, an operator tool and
tests. Suggested locations are `apps/api/src/account-deletion.ts`,
`scripts/process-account-deletion.mjs` and a subsequent numbered migration.
These names describe future work; this document does not make them executable.

The service should build an idempotent plan for the complete user, record a hash
of that plan, classify every workspace and retained category, and persist progress
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
Do not disable foreign keys or drop immutability protections as an erasure shortcut.

## Proposed operator runbook, not an available procedure

1. Retrieve the authenticated request, establish operator authority and enumerate
   all memberships. Produce the read-only plan and identify shared-workspace,
   last-administrator, retention, provider and unresolved-delivery blockers.
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
evidence, the actual notification and the published truthful processing period.
Deterministic tests establish code behavior; they do not prove live provider
erasure, a legal retention basis or operational readiness.

An authenticated request button is useful preparation but is not sufficient
evidence of a complete account deletion service. Until the real completion path
is implemented and qualified, account deletion readiness remains a submission
blocker, and the application must not be described as ready for publication.
