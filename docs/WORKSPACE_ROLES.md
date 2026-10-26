# Workspace roles and permissions

## Unified account and sensitive distribution — 26 October 2026 candidate

A Guteneo account may belong to no workspace. Receiving a document and acquiring
a personal copy use personal authority independent of the four roles below.
“Recipient” is not a fifth human role. The same account can read its documents
and voluntarily create or choose a workspace to use Guteneo services. Receiving
an invitation never joins the sender's workspace. After voluntary creation or
selection, the browser reloads the chosen destination and workspace session;
current rights and CSRF are read together before business operations. The browser
regression creates an administrator workspace, then selects another as operator,
with a real profile update in each local context.

Document policy is independent of role: `strong` by default, `verified_account`
only by explicit selection. The requested live profile uses a verified account
and email, an identity-linked recent Auth0 session, policy-bound recipient
association and human review. It claims neither MFA nor strong assurance.
Reading, association and approval require fifteen-minute freshness; export,
deposit and deletion require five minutes. `SENSITIVE_DOCUMENT_AUTHENTICATION`
must match `secure_document_authentication_policy(id=1, mode)` created by 0059.
Only the operator changes this D1 row; unknown values or disagreement deny access.
An ordinary approval receipt cannot replace strong evidence after returning to
`strong`. `documentAccessAllowed` and `documentAccessMode` inform the UI without
extending current server/SQL authority.

The server rechecks the following sensitive-distribution permissions at action
time. Creators see their own preparations; current workspace approvers may review
them. Other operators, supervisors without approval permission and observers
receive no sensitive content through general read access.

| Action | Administrator | Supervisor | Operator | Observer | Connected assistant |
| --- | --- | --- | --- | --- | --- |
| Prepare sharing of an accessible PDF | Yes | Yes | Yes | No | Membership, `dispatches:prepare` and current authority |
| Read a distribution and workspace audit | Yes | All with approval permission; otherwise own creations | Own creations | No | Same resource access and `dispatches:read` |
| Inspect final review pages | Browser and recent document session | Same requirement, with approval permission or own creation | Own creation, browser and recent document session | No | No recipient-page or personal-principal access |
| Give sensitive approval | Browser and recent document session | Approval permission, browser and recent document session | No | No | No; an expert mandate cannot replace approval |
| Activate an already approved distribution | Yes, with current evidence | Approval permission and current evidence | No | No | Approver role, `dispatches:send`, existing sensitive browser evidence and host confirmation |
| Confirm an independent recipient/account association | Browser, independent verification and recent document session | Same requirement and approval permission | No | No | No |
| Read a delivery’s recipient response | Own/current authorized delivery | Own/current authorized delivery | Own creation | No | Current resource rights; cannot exercise recipient preference or restore permission |
| Revoke shared access without refund | Yes | Approval permission | No | No | Approver role and `dispatches:send`; acquired personal copies remain |
| Read, export or delete another person's personal copy | No | No | No | No | No |

New `verified_email` invitations bind the matching verified address to the stable
personal account at claim; this is recipient authority, not a workspace-role
permission. Explicit `independent` and historical missing-field policies retain
the confirmation row above. The [recipient journey](SECURE_DISTRIBUTION_JOURNEYS.md)
owns entry, recovery and privacy conditions.

Any account owner, with or without a workspace role, can read their own documents
under the active document policy, then download or retain only what the sharing
policy permits. An acquired personal copy keeps its own retention/export
commitment; its original workspace cannot revoke it. Neither workspace
administrators nor assistants gain a global view of a person's personal documents.

Price, term, recipient and permissions are frozen before approval. The separate
attestation that the recipient requested this email and document is not inferred
from a general review checkbox. Activation funds the entire term; revocation
provides no refund. A personal-copy option is funded at activation even when
unused. See [journeys](SECURE_DISTRIBUTION_JOURNEYS.md).

This isolation applies to the new sensitive flow. Ordinary-document, Studio and
preparer/approver limitations remain below. The candidate establishes no general
folder isolation, retroactive migration of old links or hosted qualification.

One source cannot combine sensitive distribution with legacy sending,
password-link hosting, postal transformation, cropping or analysis. This is a
deliberate V1 incompatibility that no role, scope or mandate overrides.

| Source state or operation | Compatibility with sensitive distribution |
| --- | --- |
| Unexpired legacy `draft` or `active` hosting | Revoke the link before first sensitive preparation; all other restrictions still apply |
| Derived, reserved or generated postal preparation | Choose a dedicated source |
| Legacy send, postal preflight or provider draft already referencing the source | Choose a dedicated source, even after failure or cancellation |
| New ordinary email, fax or postal attachment after sensitive reference | Forbidden for every role |
| Legacy password/link content, postal processing, cropping or analysis after sensitive reference | Forbidden, including after sensitive failure or revocation |
| Dedicated sensitive invitation | Allowed under current rights, without the source attachment (`document_id` is null) |

Bidirectional service and SQL guards protect sensitive insertion and concurrent
legacy writes for the same workspace/source. A legacy operation already under
way cannot become sensitive during provider transfer. This exclusion cannot
recall files already exported.

2 October 2026 local candidate contract/migration, not production-publication
proof. The customer guide at `/roles/` is localized in French, English, German and
Luxembourgish; account/member management link to it.

## Choosing a role

Roles belong to **one workspace**; the same person may have another role elsewhere.
Four roles separate preparation, approval and administration:

| Permission | Administrator | Supervisor | Operator | Observer |
| --- | --- | --- | --- | --- |
| Read ordinary workspace documents, recipients, dispatches | Yes | Yes | Yes | Yes |
| Dry-run an accessible existing dispatch | Subject to dispatch access | Subject to dispatch access | Subject to dispatch access | Subject to dispatch access |
| Import documents; prepare dispatches/campaigns | Yes | Yes | Yes | No |
| Approve, confirm, reject, cancel eligible dispatches | Yes | Approval option | No | No |
| Authorize postal document transfer for review | Yes | Approval option | No | No |
| Read aggregate reports/usage | Yes | Reporting option | No | No |
| Manage workspace, members, permissions | Yes | No | No | No |
| Manage billing, senders, channels | Yes | No | No | No |
| Grant/renew assistant delegation | Yes, browser only | No | No | No |
| Set own language and Classic/V2 appearance | Personal browser setting | Personal browser setting | Personal browser setting | Personal browser setting |

Administrators own workspace access; at least one must remain. Supervisors prepare
and independently receive approval/reporting options, both initially off unless
explicitly selected. Operators prepare for authorized review and cannot confirm
already-approved sends, reject or cancel. Observers read operational content;
the role is not restricted to anonymous statistics.

A reviewer may receive approval without reporting, a monitoring lead reporting
without approval, or a team lead both. None gains members, billing or delegation
management. Dispatch price/status remains visible to anyone who can read that
item; reporting gates aggregate summaries/usage rather than every individual amount.

## MCP App original selection — 26 October 2026

The default-off [MCP App selected-original transport](PRIVATE_DOCUMENT_UPLOAD.md#selected-local-originals-through-mcp-apps--disabled-candidate)
requires a current administrator, supervisor or operator connection with
`documents:write` for the opener and every App-only operation. Observers are
denied. Explicit device-file selection and Import grant only that bounded
creator-private import; they create no human send approval or mandate. The
activation setting (bounded qualification or reviewed general rollout) belongs
to a separately authorized operator, not to any
workshop role or assistant. Web/native/REST upload permissions remain unchanged,
and a chooser grants no access to an earlier conversation attachment.
One active App session is bounded per user within the current workspace;
switching workspace creates no cross-workspace document or session access. The
separate database-wide App-finalizer lease is capacity admission, not a new role,
document right or total Worker memory guarantee. Potential cleanup of this
attempt's unregistered object is disclosed by the five App-only tools' destructive annotation;
status recovery creates no authority to delete a registered original.
The post-registration Use in conversation control shares only the current App's
four-field document receipt after an explicit UI gesture. It creates no role,
scope, approval or provider communication; importing never sends that chat
message automatically. Host message availability and model receipt remain
separately qualified.

## MCP annotations — 20 October 2026 candidate

[Annotation remediation](MCP_ANNOTATION_REMEDIATION.md) preserves roles/scopes/resource
access. Hints describe effects for host confirmation, never grant authority or
replace mandates. `review_dispatch` is destructive because completed review replaces
the same connection/dispatch's previous token. It still requires review scopes and
expert authority. `prepare_distribution` is destructive because creating a plan
freezes the batch and prevents failed-record retries, including records outside
selection. Finish desired retries first; later regeneration needs a new batch.
Plan access and approval authority remain separate.

Observed business reads retain `readOnlyHint:false`/`idempotentHint:false` because
production success may record visible connection activity, without role/scope or
approval changes. Local evidence on 20 October: nine focused suites, 260 tests,
three connection-observation tests, full typecheck/lint, and 67-tool/268-boolean/
216-reference annotation audit passed. Exact-commit CI, deployed server, portal
catalog and OpenAI approval remain separate.

## V2 presentation

14 October V2 simplification preserves the matrix. No import/preparation/generation
for observers; no approval for operators or supervisors lacking that option.
Global New dispatch is secondary navigation for authorized preparers only.
Visual emphasis bypasses no server guard. All roles retain account/role access
with mobile menu closed. Service status near account adds no authority. Home
explains effective rights without repeating personal/workspace identity. Removing
redundant V2 section headings/footer removes no consent summary, detail return or
date timezone. Classic/native/REST/MCP contracts remain unchanged; [V2 evidence](DASHBOARD_V2.md)
is separate from hosted use/publication.

## Assigning access

Workspace creators become administrators. In Members, an administrator selects a
role and independent supervisor options. Forms explain roles and that changes
sign the affected member out; account shows effective permissions.

Changes are workspace-scoped, audited, and revoke affected web/native sessions,
native codes, development access and OAuth connections. Former-access mandates
are disabled; reconnect with new rights. Other-workspace memberships remain.
Account → Change workspace lists only current memberships; switching creates a
new session and invalidates the old one. Assistant connections stay bound to their
authorized workspace.

Roles never replace exact content/recipient/options/cost review. Removing approval
rights invalidates pending approvals; restoring rights does not revive them.
Accepted work retains history and continues by state: role changes cannot retract
provider-submitted communication. Reject uses prepared-dispatch cancellation;
post-acceptance cancellation retains existing limits, with no automatic retry of
unknown provider outcomes. Structured rejection reasons/multiple-approver workflows
are not implemented.

## Invitations and group import

Browser administrators enter an email or import comma/semicolon CSV with `email`.
Maximum 1 MB and 100 distinct addresses/batch. Preview removes duplicates, displays
all addresses and shared role/supervisor options. Send invitations explicitly
confirms that exact batch; CSV reading sends nothing.

Personal links last seven days and are single-use. Invitees sign up or log into an
existing account with matching verified email. They join with recorded role/options
without an extra personal workspace; existing memberships remain. Link possession
alone neither signs in nor proves email ownership. Pending invitations are visible
and revocable by administrators. Change role by revoking/recreating. Changing the
issuing administrator's role revokes their pending invitations; restoring it never
revives links. Accepted invitations retain history.

The whole batch is refused if an address is already a workspace member or has a
pending invitation. Daily limit: 500/workspace. Expired invitations may be explicitly
replaced. Unconfirmed email outcomes never automatically retry, including list
refresh. Local simulation sends no email and says Simulated send. Production stays
closed until dedicated activation. Provider acceptance proves neither inbox receipt
nor invitation acceptance. Authored invitation emails use English; stored recipient
locale metadata does not change this authority or delivery boundary.

## Scope and limits

Ordinary documents, recipients and history are shared within a workspace. Studio
PDFs remain creator-private. After dispatch preparation, a currently authorized
administrator/supervisor approver may read its exact PDF only in that context.
This does not expose it in the general library or to other operators/observers.
Withdrawing approval cuts this access even for historical requests. No general
folder/team partitioning or restricted-document guest role exists; do not present
Observer as an ordinary-document privacy restriction.

Supervisors may approve their own preparation. Mandatory preparer/approver
separation, dual approval, individual ceilings and custom roles are separate
future work. A financial-only accountant role may eventually help; current
reporting option does not grant billing.

Assistants receive the intersection of OAuth scopes/current membership and cannot
assert human consent. Default-off expert delegation is administrator-only, bounded
and expiring; supervisors cannot create it. Native clients prepare by role but
final validation uses authenticated web review. Native UI uses server permissions,
shows role and hides unauthorized preparation/approval, without member/invitation
management. Web-session changes may require native reconnection. Provider/file/
financial gates apply to every role.

## Technical contract and migrations

Stable API IDs: `admin`, `supervisor`, `member`, `viewer`. Historical `member`/`viewer`
remain for compatibility; English display labels are Operator/Observer. Shared
contract: `packages/contracts/src/roles.ts`.
`PATCH /api/admin/members/:userId` accepts:

```json
{
  "role": "supervisor",
  "supervisorCanApprove": true,
  "supervisorCanReport": false
}
```

Only current authenticated workspace administrators can mutate members. Options
cannot be enabled for other roles. Session/account `permissions` drive UI; server
checks remain authoritative and recheck in D1 transactions.
`GET /api/account/workspaces` lists current memberships; CSRF-protected browser
`POST /api/account/workspace` selects one. An ID alone proves no access.

Additive `0042_workspace_roles.sql` rebuilds membership with supervisor and
`supervisor_can_approve`/`supervisor_can_report`, preserving members/relations,
including native sessions/codes despite cascades, and extends document-recovery
remembered roles. Constraints prevent non-supervisor options and last-admin removal.

Intentional existing-workspace change: former `member` becomes Operator without
approval/reporting; `viewer` keeps operational reading without reports. Administrators
must explicitly assign Supervisor/options; no automatic extra rights. Old member
approvals cannot accept pending requests; a current approver must review again.
Accepted history remains.

SQL guards check current authority at approval insertion and atomic queue entry.
Domain rechecks role/options per access; stale client/session contexts are
insufficient. `usage`/`dispatchOverview` use reporting guards; admin routes retain
their own restrictions.

`0043_workspace_invitations.sql` adds invitations, acceptance proof and invitation
hash binding to PKCE login. Raw tokens are never stored; links carry them in the
fragment. One transaction installs identity if needed, role/options and acceptance
proof after Auth0 email verification, rechecking expiry/link state/issuer authority.

Invitation routes: `GET/POST /api/admin/invitations`,
`POST /api/admin/invitations/:id/revoke`, `POST /api/invitations/preview`.
Public preview masks email and needs the personal token. Creation requires browser
admin/CSRF; accepts CSV-extracted `emails`, `role`, `supervisorCanApprove`,
`supervisorCanReport`.

Dedicated delivery needs `INVITATION_EMAILS_ENABLED=true`, verified-guteneo.com
`INVITATION_EMAIL_FROM` and existing Resend configuration. Migration activates none.
The batch is persisted/claimed before provider calls; interruption stays unknown
without automatic repetition or token-backed retry.

## Evidence and publication

- `tests/integration/workspace-roles.test.ts`: real local D1 rights across browser/MCP/native, independent options, cross-workspace access, forged/stale authority, approval/confirmation races and revocation.
- `workspace-roles-migration.test.ts`: populated D1 migration, before/after sessions/connections/recovery documents/approvals/send proof, integrity/foreign keys and removed old-approval authority.
- `workspace-invitations.test.ts`: individual/group creation, bounds/duplicates/current rights/races/revocation, preview, atomic single acceptance, email matching and simulated Resend outcomes.

Only deterministic simulation/synthetic data qualifies here. Code/remote migration
needs explicit authorization, backup and usual release gates. No real send/provider
activation is needed for this change.

## Identity and contacts — 9 October 2026 candidate

Navigation/profile show name, login email and current role. Browser members can
read a bounded projection of workspace administrators/supervisors without sessions/
connections. Real supervisor options determine approval. Admin-list emails distinguish
namesakes; personal names alter no rights. Refusals direct to contacts. No MCP
directory/authority is added; see [ACCOUNT_IDENTITY.md](ACCOUNT_IDENTITY.md).

## Dry run — 10 October 2026 candidate

`GET /api/dispatches/:id/dry-run` and MCP `dry_run_dispatch` use the same authority
as dispatch detail: current membership, linked-document access, OAuth
`dispatches:read`. All four roles can read without approval/reporting, except the
existing review authority needed for another creator's private PDF. Lost authority
is never restored. Choose an accessible prepared dispatch, run checks, inspect
passed/blocked/not-executed gates, then resolve through existing journeys.
Operators/observers still cannot approve/confirm; assistants create no mandate/consent.

Result is `partial|blocked`, never executed acceptance/delivery. It creates/renews
no quote/expiry and consumes no quote/credit; no approval, reservation, outbox or
provider attempt. HTTP counters/connection observation remain separate and explain
why hints do not promise zero writes. Expired quotes/engaged dispatches remain
blocked; network failures/omitted proof remain unknown without automatic renewal/send.
No new web/native screen, approval permission or role is introduced. Candidate was
not deployed; [PRODUCTION_DRY_RUN.md](PRODUCTION_DRY_RUN.md) owns limits.

## Independent public status

`status.guteneo.com` exposes the same anonymous state, aggregate history and
redacted local qualification to all roles/visitors. It grants no workspace,
document, approval or collector-administration authority and starts no tests from
public routes. Its Worker has no business binding and accepts no client identity
or dispatch ID. Decorative effects are page-local. See [STATUS_SERVICE.md](STATUS_SERVICE.md)
and atlas journey J20.

Journey J30 adds anonymous browser reports. Only the authorized GitHub main
workflow can submit its OIDC-bound report; no human role or assistant acquires
this authority through membership. Driver diagnostics are restricted to public
paths/hashes and allowed publication codes. A local artifact or failed ingestion
cannot establish stored-report success or qualified business coverage.

Public HTML integrity adds `no-transform` to application responses for canonical
public documents only. It grants no visitor, role or assistant authority and
broadens no API, session or private cache. Size/SHA comparisons remain complete.
Direct-job OIDC can carry `job_workflow_ref` and `job_workflow_sha`; the server
accepts only their joint legacy absence or exact equality with the canonical
main workflow and runner commit. This adds no authorized workflow, branch, role
or assistant. It requires status publication and separate ingestion evidence.

Mailbox-link unsubscribe/report authority is scoped separately in [recipient feedback](EMAIL_RECIPIENT_FEEDBACK.md); it creates no role or document-access right.

## CI evidence authority

Current-run artifact metadata is read by the scoped GitHub jobs described in
[the CI contract](CI.md#manual-reruns-and-artifact-identity). A manual rerun grants
no workspace role, personal-document access, assistant scope or release authority.
Web/native/REST/MCP permissions remain unchanged; publication still requires the
explicitly authorized operator and complete exact-source checks in journey J15.
