# Workspace roles and permissions

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
