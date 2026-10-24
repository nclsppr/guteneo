# Signed-in account and workspace contacts

## Unified account and received documents — 24 October 2026 candidate

A Guteneo account is personal and independent of workspaces. The same identity
receives documents, keeps permitted copies, explores services and works in its
workspaces. Receiving a document adds no membership in the sender's workspace.
There is no separate “recipient account” to merge later and no artificial
workspace holding personal documents.

Ordinary registration creates an identity without a workspace. Existing identities
and memberships are retained. **My documents** contains **Shared with me** and
**Saved copies**; **Use Guteneo** opens services with the same account. Choosing or
creating a workspace occurs during explicit service use. Initial creation is
idempotent for the person; entry rechecks membership and rotates the session.
Creating a workspace activates no live channel.

`GET /api/personal/session` exposes the personal principal, preferences and
accessible workspaces. It does not replace `GET /api/session`, whose workspace
requirement remains. Personal routes have their own guard, browser cookie and
session-bound CSRF; a workspace Bearer token grants no personal-vault access.
`POST /api/personal/workspace` creates the requested workspace;
`/api/personal/workspace/select` enters a current membership. The server derives
rights and accepts no browser-asserted tenant.

Identity remains bound to the signed issuer/subject pair. Equal email addresses
never merge accounts or transfer old documents to a recycled address. Profile
language and name are shared across contexts. `PATCH /api/personal/account`
updates the personal profile; the address remains read-only. Personal sessions
can be inspected and revoked without a workspace. Personal logout also revokes
the linked workspace session.

Sensitive content requires recent server-attested authentication under the active
document policy: `strong` by default or explicitly selected `verified_account`.
The latter requires a verified account/email, an identity-linked Auth0 session
and signed recent `auth_time`; it does not claim MFA. In `strong` mode the signed
`https://guteneo.com/document_authentication` evidence must additionally contain
policy `guteneo-sensitive-v1`, a qualified method and the matching `auth_time`.
An `mfa` value, a registered factor or mailbox control alone is not strong proof.
Reading, association and approval have a fifteen-minute freshness window; original
export, personal deposit and deletion require five minutes. Qualified Auth0
Actions, user-verified passkeys, federation and recovery remain activation gates
for strong mode; the passkey choice is deferred. Local strong fixtures are
explicitly synthetic. See the current policy and rollback contract in
[implementation](SECURE_DISTRIBUTION_IMPLEMENTATION.md).

Document invitations return to the intended journey after Auth0. The token is
removed from the fragment before login navigation and never enters an HTTP
`returnTo`. A ten-minute handoff in the same tab's `sessionStorage` resumes after
callback and is cleared after association, abandonment or logout. If storage is
unavailable, the UI explains signing in and reopening the invitation; the token
can remain in memory only while that tab is retained.

An invitation delivers no content. The verified address must match, then the
workspace independently confirms association with the account through a known
relationship or separate evidence. Waiting exposes neither sensitive title nor
pages. The token is exchanged only in the association request body and never
appears in a workspace journal, MCP response or public evidence.

A document-service 401 closes that access and offers explicit recovery; it does
not restart session bootstrap automatically. Other personal navigation remains
available. Returning to a tab rechecks the session; a changed principal remounts
pages without the previous principal's state. Auth0 errors offer explicit
recovery without a loop.

Service discovery is voluntary. It adds no purchase requirement, automatic
workspace, commercial content analysis or marketing registration. Reads of an
acquired personal copy are no longer reported to its original workspace. See
[distribution and recipient journeys](SECURE_DISTRIBUTION_JOURNEYS.md) for the
surface matrix and detailed terms.

The initial candidate required migrations 0055–0058; the subsequent policy
contract also requires 0059 and aligned private configuration. These requirements
establish no Auth0 activation, remote migration, publication or human production
browser qualification. Dated records below describe earlier journeys and no
longer imply that every account must have a workspace.

Candidate 1.0.0 ignores responses from cancelled web reads, including a 401
received during account/workspace changes. They must neither replace current
content nor expire the new session. The shared hook immediately hides data
from an old path and retains only the identical resource during refresh.
Fixture regressions cover campaign tracking and account switching; editors
already remounted by identifier retain their existing protections.

Account contract extended on 9 and 11 October 2026; the 14 October V2 shell
simplification is undergoing qualification. This page describes implementation;
CI, Auth0 configuration and publication are qualified separately. Historical
and current-candidate evidence is in [DASHBOARD_V2.md](DASHBOARD_V2.md).

The current production contract reserves the application and browser login
for `https://guteneo.com`. The former `workers.dev` application host and
application preview URLs are closed; they are not fallback login paths.
Browser Auth0 callback, logout and allowed origins must be canonical. The
separate fictional mockup is out of scope. See [MAIN_RELEASE.md](MAIN_RELEASE.md).
This contract and fixture tests imply no actual human Auth0 login, returned
identity or reconnection.

## Journey and authority

Every browser member finds their name, login email and current role in
navigation, including mobile. This block links to the personal profile;
Classic also retains its Account entry. The dashboard explains effective
rights, including the supervisor's independent approval/reporting options.
Role depends on the active workspace and cannot be edited in the personal
profile. On tab return, the session is reread to reconcile account/workspace
changes elsewhere, including saved account language. Since 10 October,
authenticated views expose its only selector in account configuration; the
choice also applies to Belvédère. Accounts without a preference use browser
language.

People can edit their display name, language and workspace appearance.
Email is read-only, comes from login identity and cannot be changed by
`PATCH /api/account`. A new verified login updates email without overwriting
personal name, saved language or appearance. Simulation identity remains
explicitly identified local fictional data.

Switch account opens Auth0 with an explicit reauthentication request. Normal
login retains SSO. Auth0/social providers may retain their own account choice;
the interface therefore shows the identity actually returned by the callback,
without promising a universal picker. State, PKCE, verification policy and
local return remain verified.

## Explicit logout — local fix dated 24 October

After successful `POST /api/logout`, the browser fully leaves the private route
for the public homepage. It does not remount login entry, which automatically
continues to Auth0 when a private route has no session. This prevents valid
SSO from immediately recreating a session after logout. Server error retains
the view and displays failure without claiming session termination. Client
CSRF context is cleared after success.

This ends only the current Guteneo session under the existing contract;
it revokes neither Auth0 SSO nor OAuth connections. Intentional new private
entry retains direct Auth0 continuation; **Switch account** retains explicit
reauthentication. No client, scope, role or provider setting changes. The
hosted-entry browser test covers refusal, success, public reload and renewed
private entry on a fully intercepted reserved host. Fixtures remain separate
from CI, publication and actual observed logout after publication.

## Personal workspace appearance

The account block sits at the bottom of left navigation on desktop, with
name, email, role, profile and account switching. In My profile,
**Workspace version** sits beside language and offers **Classic** or **V2**.
The choice persists only after **Save changes** and successful existing
`PATCH /api/account`. Labels exist in French, English, German and
Luxembourgish. Actual V2 is not labeled experimental; simulated sessions
retain their simulation banner.

In the 14 October V2 candidate, workspace name stays in navigation and
personal identity in the account block; the dashboard keeps effective rights
without repeating either identity. The redundant footer is removed and
public **Service status** joins **Switch account** in identity utilities.
That block/link remains accessible with the mobile menu closed. Browser
timezone accompanies relevant dates without a new profile setting or formatting
change. Classic retains its shell. These moves change neither login email,
contacts, role nor profile saving, and add no business read.

Strict optional `preferredDashboardAppearance: "classic" | "v2"` is personal.
Every browser role can edit its own preference without changing rights or
another member's settings. It is stored in `users.preferred_dashboard_appearance`,
added by migration `0053` with default `classic`, `NOT NULL` and `CHECK`
constraints. After session reread it follows the same person across sessions,
devices and memberships. It does not belong to the workspace; business content
and authority remain subject to the current workspace.

`GET /api/session` and `GET /api/account` expose
`user.preferredDashboardAppearance`. Existing name/language PATCH requests
omitting it preserve the field. Mutation uses existing Origin, CSRF and
transactional authority revalidation. Foreign targets/unknown values are
rejected; membership revoked before write produces no partial change.
`account.updated` audits field names without values.

`?appearance=v2` or `?appearance=classic` forces presentation only for that entry;
the link performs no server write. Legacy `atelier` links remain accepted inbound. Successful saving after explicit appearance
selection and detected identity changes discard an old override. Saving only
name/language neither persists nor removes it. The selector shows the saved
account choice, not temporary presentation. Browser cache is best-effort
bootstrap, not authenticated account authority. Save errors remain visible
and do not confirm preference persistence.

## Who to contact

`GET /api/account/contacts` is browser-session only. The server derives the
workspace from authenticated membership. It exposes at most 50 current
administrators/supervisors other than the requester: ID, name, email and
permissions. `hasMore` indicates the limit; no other-workspace, session or
connection list is included. Email supports a user-chosen mailto link;
neither Guteneo nor an assistant sends a communication.

Administrators handle access/billing. Supervisors appear as approvers only
when their approval option is active. A supervisor without it remains
identifiable without that authority. Missing contacts/email and network errors
have explicit states/manual recovery; reads refresh on tab return. Permission
refusals direct users to profile/contacts. The profile never permits
self-promotion.

Directory-read errors preserve focus in the control already in use. They
remain announced through `role=alert` with **Retry**, without stealing profile
input focus or granting rights. This applies only to the background-loaded
directory; action errors retain normal focus behavior. No endpoint, content,
recipient or membership rule changes.

The administrative member list includes email to distinguish namesakes.
Only administrators edit roles, invite or disconnect members. Last-admin
protection and session/connection/mandate revocation on rights changes remain.

## Surfaces and privacy

Web supports French, English, German and Luxembourgish. Existing identity
endpoints remain browser endpoints: no MCP directory, OAuth privilege or
expert mandate is added. Native retains existing settings; session/account
reads add `preferredDashboardAppearance` without a new native control/mutation.
Contacts remain a web enhancement. Emails are neither publicly indexed nor
added to logs/public evidence. Private responses use `Cache-Control: no-store`.

Belvédère remains separate read-only platform authority. A workspace
administrator does not become Watcher. Its additive migration is
`0052_belvedere.sql`, after published migrations 0044–0051; private configuration
and hosted qualification remain necessary before activation.

## Evidence

Executed commands, results and candidate limits are in
[DASHBOARD_IDENTITY_PROOF.md](DASHBOARD_IDENTITY_PROOF.md). Older Belvédère
evidence remains historical and does not qualify this integration.

### V2 simplification — 14 October 2026 candidate

Desktop/mobile account visibility, closed menu, status link and permission-bound
actions pass the candidate's 18 browser cases with persistence/consent preserved.
Fifteen root routes are traversed in Classic/V2 at each of three projects'
viewports and then 320 px; no physical-device qualification is inferred.
Typecheck, lint, web build, feature map and 40 locale/appearance tests pass.
Exact-commit CI and authenticated postpublication verification remain separate
and unqualified; see [DASHBOARD_V2.md](DASHBOARD_V2.md). This simplification
requires no account/session-contract change, migration, Auth0 identity, right
or native/REST/MCP surface change.

### Appearance preference — local qualification on 11 October 2026

The account extension passed 91 targeted backend tests: 27 account, 47
authentication and 17 mobile. The final journey adds 7 appearance tests and
29 local browser cases, including 14 isolated-mockup and 15 local-application
cases. The latter distinguishes D1/queue simulation from intercepted sessions
by scenario. A manual My account journey verified saving French/V2, displayed
confirmation, temporary-parameter removal and retained route.

Typecheck, final lint, preview/live builds and feature-map checks passed.
Reports, scopes and earlier results are detailed in
[DASHBOARD_V2.md](DASHBOARD_V2.md). They qualify neither commit CI, remote
migration 0053, publication nor cross-device persistence for actual users
on the hosted service. No real communication occurred.

### Human production session — 10 October 2026

Human Auth0 login on `https://guteneo.com` was verified with the operator's
account on the public version from
`4ce1bdd467f9aa35f98e525986db888eff3bf977`. Profile shows identity, login email,
Administrator role, four effective rights, and name/workspace/language settings.
Existing identity/values remain after reload. Dashboard also shows identity,
role and administrative access; contacts load without error and explicitly
state when no other responsible contact is available. Bounded results and
private capture remain outside the repository without exposing contact details.
No profile, role, mandate or dispatch changed. This qualifies that Administrator
account/session, not other-role fixtures or actual iOS use. It predates the
11 October appearance preference and proves neither remote migration nor
hosted saving of that preference.

## Browser entry and Auth0 continuity — 24 October 2026 candidate

Public sign-in links open Auth0 directly with active language/requested
destination. `auth-navigation.ts` also serves static rendering: homepage,
journal, assistant guides, direct preparation and Horizon share URL construction.
Auth0 retains its native login/signup/password-recovery forms. No Guteneo
choice screen precedes authentication. A private route without a session
automatically continues to Auth0 after initial session checking; startup is
bounded to one navigation and replaces the history entry. Normal links remain
usable in a new tab.

Visual hierarchy follows the observed public Stripe form: one login action,
forgotten password beside its native field and signup as a secondary link.
Prepared copy names Guteneo in the title and explains finding documents and
tracking dispatches. First-visit/create-access and existing-user/sign-in links
guide form switching. The password step announces return to the requested
page. This adds no social login, field, step or right.
Reference: https://dashboard.stripe.com/login.

The Guteneo screen is reserved for login errors. It offers explicit recovery
with one title, short description, Auth0 transition announcement and privacy,
terms/support links. Return to the site remains available. The official portrait
and black wordmark stay. No large artwork or repeated promise. An error never
automatically retries the provider. Returning from navigation cache restores
links. Secondary signup appears only when server capabilities advertise it.
Local demonstration/mockup retain fictional organizations and simulation cues.

Initial session checking overwrites neither visitor language on failure nor
a selection made during the read. Valid sessions still apply saved account
language. Recovery resumes transaction route/language only after validating
and consuming browser-bound state. Callback parameters provide no context.
Recovery copies neither tokens, invitations, recipients nor private URLs;
only allowed navigation parameters survive. Expired/invalid state returns
to a safe generic entry. PKCE, nonce, Origin/CSRF, membership, MFA, consent
and mandates are unchanged. Native, business REST and MCP gain no rights.

`scripts/setup-auth0-branding.mjs` prepares a compact ivory/cobalt presentation
with the official portrait and French/English/German copy. Auth0 does not
support Luxembourgish: Guteneo retains `lb`, while `ui_locales` requests `de`.
The script does not modify `enabled_locales`; if `de` is disabled, Auth0 may
use tenant default language. The theme preserves optional existing fields,
text dictionaries and identity policies.

Preparation/local tests do not publish this experience. Merge, web publication,
Auth0 theme application and hosted verification remain separate and require
authorization. No credential was entered or Auth0 setting written during
visual inspection.

Switching to `auth.guteneo.com` is separate work. Public links use `/auth/login`
and server endpoints follow the configured issuer; this journey hardcodes no
new domain. The switch must independently qualify identity/connection
continuity, whose keys include the exact issuer. The branding script's
Management tenant remains the original Auth0 tenant even when the interface
uses a custom domain.
