# Production qualification accounts

Research date: 24 October 2026. **Proposed specification; not activated by this study.** This study created no account, secret, Auth0 factor, business fixture, tenant setting or authenticated workflow.

## Current launch policy and historical research

The later launch decision selects **`verified_account`**. A verified account signed
in through the normal flow may access authorized documents without an additional
passkey or MFA requirement. Current document access still requires the applicable
freshness, verified-identity, session and document-authority checks; selecting this
policy does not grant access to another person's documents.

The WebAuthn proposals below preserve the original **`strong` policy research**.
They are historical proposals, **not prerequisites for this launch** and not
instructions to activate MFA or change Auth0. References below to required UV,
strong claims, candidate Actions, strong-test fixtures and their release criteria
apply to that historical candidate. The current `verified_account` decision does
not make those proposals deployed or qualified.

Authenticated monitoring still needs authorized qualification identities,
protected CI access and preapproved synthetic fixtures. Anonymous public checks
do not qualify it. This document neither provisions those identities nor claims
that an authenticated production suite has passed.

## Historical proposed decision: the strong profile

Use real Auth0 accounts reserved for qualification, with the same issuer and web
application as customers. The researched preference was **native Auth0 WebAuthn
MFA with mandatory user verification**, followed by a separate Action attesting
the factor actually used. A virtual Chromium authenticator enrolled through the
real Auth0 journey can answer challenges. Guteneo receives the normal callback
and creates its normal session; the test fabricates no JWT, application cookie,
strong factor or human consent.

The first proposed production suite covers **sign-in and authorized reads of
synthetic fixtures already approved by a person**. It confirms no dispatch and
spends no business credit. Initial fixture creation is a separate operation
requiring authorization and traceability: real activation may incur a cost and
an associated communication. A test account removes none of these invariants.

Local authenticator generation and simulated UV/presence demonstrate protocol
operation in an automated browser. They prove neither Face ID, a physical key,
nor a person's presence or consent. A production document approval must never be
labelled human merely because CI clicked a button.

## Historical tenant observation: inspection without writes

On 24 October 2026, the existing CLI profile could read configuration for the sole
expected tenant, `pieper.eu.auth0.com`. No user identity was read. Responses that
might contain secrets and Action source stayed in memory; only booleans, selected
values and fingerprints were projected.

| Actual check                                   | Observation at inspection                                | Consequence for the historical strong proposal                                                |
| ---------------------------------------------- | -------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `Guteneo-Accounts` connection                  | Password enabled; database passkeys disabled             | No current passkey qualification; this does not exclude WebAuthn MFA, which is distinct       |
| `Guteneo - Browser` application                | Expected callback and authorization-code support present | The real web journey could be reused                                                          |
| Native passkey grant                           | Absent                                                   | This grant concerns the native API; absence does not prohibit redirected Universal Login      |
| Two deployed post-login Actions                | Neither emitted the document claim or checked WebAuthn   | The strong evidence required by the proposed strong vault was not produced at inspection      |
| Guardian factors and roaming WebAuthn settings | Read refused because privileges were insufficient        | Factors, UV policy and contractual availability were unknown; do not claim they were disabled |
| Actual strong test sign-in                     | None performed                                           | This inspection certified no authenticated production journey                                 |

The SHA-256 fingerprints of the two deployed sources read were
`7f21fc09c349ccec20a72a485882e4159b12095fbd9e5b02aa6c5e7b5c76edc7` and
`f9be402e234b4be6fef61723f92e646f118ed2ef7c20f6da8dd2cd7f9c9f3a69`. They
identify drift before review and never qualify authentication assurance alone.
This observation is dated and must be refreshed before any future activation.

The executable qualifier is `scripts/qualify-production-auth0.mjs`.
`node scripts/qualify-production-auth0.mjs --plan` exposes the plan without
network, subprocesses or secret discovery. `--inspect` performs only Management
API reads, revalidates the tenant before every request and exposes no user,
secret or Action source. It always retains `ready=false` and
`liveMethodQualified=false`: static review is not a qualified sign-in.

Minimum read privileges are `read:connections`, `read:clients`, `read:actions`
and `read:guardian_factors`. Giving the last permission to an authorized operator
would permit conclusions about factors and settings; it grants no `create:users`
and authorizes no account creation. Paid MFA availability must be checked in the
existing plan/contract separately; no purchase or upgrade is proposed
automatically.

## Evidence collected by the historical study

| Item                 | Available evidence                                                                            | Limit                                                                                           |
| -------------------- | --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Guteneo policy       | `apps/api/src/auth.ts`, `documentAuthenticationEvidence`                                      | Strong evidence comes from the signed Auth0 JWT; real-tenant qualification remained outstanding |
| Freshness            | Session code and document guards                                                              | 15 minutes for reading; 5 minutes for export and sensitive personal operations                  |
| Installed TesterArmy | `e2e` 0.21.3; public `surfaceOf(engine)` export in `@e2e-dev/web`                             | Context access requires the same engine instance and a started attempt                          |
| Local Chromium/CDP   | Ephemeral probe successfully ran `WebAuthn.enable`, added and removed a virtual authenticator | No Auth0 call or demonstrated production authentication                                         |
| Anonymous production | `e2e.production.config.ts`, `tests/production-e2e/public-pages.e2e.ts`                        | Anonymous results certify no authenticated journey                                              |
| Sending restriction  | Migration `0041_prepare_only_accounts.sql`                                                    | Bound to `(issuer, subject)`; prevents dispatch acceptance, not every account modification      |

## Historical Auth0 qualification question: passkeys and UV

Auth0 documents detecting a passkey sign-in in an Action through
`event.authentication.methods` and the name `passkey`. This establishes the method
used; it is not, by itself, a field attesting the UV result of that transaction.
Factors merely registered in `enrolledFactors` do not prove their use.
[Official passkey detection](https://support.auth0.com/center/s/article/detecting-passkey-usage-in-auth0-post-login-actions),
[event reference](https://auth0.com/docs/actions/reference/post-login/post-login-event-object).

Auth0 passkey API documentation includes `userVerification: "preferred"`. That
does not establish effective Universal Login configuration for this tenant. It
does prevent inferring a universal mandatory-UV guarantee from the word passkey.
Configuration documentation describes prerequisites and RP ID; changing RP ID
can invalidate existing passkeys. Do not change the domain to simplify testing.
[Passkey APIs](https://auth0.com/docs/authenticate/database-connections/passkeys/passkey-apis),
[passkey configuration](https://auth0.com/docs/authenticate/database-connections/passkeys/configure-passkey-policy).

The contract researched for the `strong` profile is:

```json
{
  "auth_time": 1792800000,
  "iat": 1792800004,
  "https://guteneo.com/document_authentication": {
    "policy": "guteneo-sensitive-v1",
    "method": "webauthn_uv",
    "factor": "webauthn-platform",
    "authenticated_at": 1792800003
  }
}
```

This example describes a contract shape, not a usable token. `authenticated_at`
is the actual MFA time, computed from Auth0's ISO timestamp. The parser requires
positive integer seconds and **`auth_time ≤ authenticated_at ≤ iat`**; initial
authentication and MFA times may therefore differ. The session retains
`auth_time` as the origin of its 15/5-minute freshness windows, conservatively.
An Action never replaces a ceremony time with `Date.now()` or grants assurance
to a test identifier, email address, CI client or merely enrolled factor. The
server validates the JWT and dates; Auth0 reserves `auth_time`.
[Custom-claim restrictions](https://auth0.com/docs/secure/tokens/json-web-tokens/create-custom-claims).

### Historical preferred candidate: native WebAuthn MFA and sequenced Actions

Auth0 documents two ways to obtain UV through MFA: Device Biometrics
(`webauthn-platform`) always performs it; Security Keys (`webauthn-roaming`)
has a FIDO2-compatible **Required** setting that enforces verification. The
Security Keys default of Never does not satisfy `webauthn_uv`. Availability
depends on the plan/contract and remained unestablished for Guteneo.
[WebAuthn as MFA](https://auth0.com/docs/secure/multi-factor-authentication/webauthn-as-mfa),
[security-key policy](https://auth0.com/docs/secure/multi-factor-authentication/fido-authentication-with-webauthn/configure-webauthn-security-keys-for-mfa).

The official SDK exposes
`GET /api/v2/guardian/factors/webauthn-roaming/settings` and JSON field
**`userVerification`** (`required`, `preferred`, `discouraged`). This Guardian MFA
setting is separate from database-connection passkey options. Do not put the
Terraform name `user_verification` in an HTTP request, invent a connection
property or enable the native passkey grant for this journey. No setting was
changed. [Auth0 Management SDK](https://github.com/auth0/go-auth0/blob/v1/management/guardian.go).

The review candidate contains a challenge Action followed by an evidence Action.
The first requires the qualified WebAuthn factor. The second examines
`event.authentication.methods`: an object with `name: "mfa"`,
`type: "webauthn-platform"` or `"webauthn-roaming"`, and the time of the factor
actually completed. Auth0 states that methods update only at the start of the
next Action; checking immediately after `challengeWith` in the same Action would
produce incorrect evidence.
[MFA selection and sequencing](https://auth0.com/docs/secure/multi-factor-authentication/customize-mfa/customize-mfa-selection-universal-login).

Evidence must reject OTP, recovery, mere enrollment and an old method. The Action
must not promote a different factor offered by the UI. For roaming, UV assurance
rests on a verified and monitored Required setting plus the successfully
validated challenge; the factor name alone contains no UV result. A key without
UV might represent another phishing-resistant MFA policy but cannot be renamed
`webauthn_uv`. Adding `phishing_resistant_mfa` would require an explicit policy
evolution; it is neither necessary for the Required-UV candidate nor implemented
here.

The MFA timestamp is documented as ISO in `event.authentication.methods`. The
candidate converts it to seconds with `floor(Date.parse(timestamp)/1000)`; the
Worker independently validates its relationship to signed reserved claims.
Enterprise access to `event.session.authenticated_at` is unnecessary. Real
qualification must confirm this shape, precision and time order for the tenant;
a missing method date or invalid relationship fails closed.
[Official MFA timestamp example](https://support.auth0.com/center/s/article/Configure-number-of-days-to-remember-a-device).

This candidate avoids hosting a custom WebAuthn verifier and requires no database
passkey activation. Sign-in passkeys could be qualified later to reduce friction,
with the same UV-evidence and safe-recovery requirements. None of this changes
the current `verified_account` launch policy.

### Historical source candidate and activation impact

`scripts/auth0-document-authentication-actions.mjs` produces two standalone
sources for review. It performs no I/O, has no apply mode and does not integrate
with the existing configuration script. Parameters require the exact Browser
client and database connection. Platform is the default; roaming requires an
operator read that actually established `userVerification=required`.
`tests/security/auth0-document-authentication-actions.test.mjs` executes these
sources offline with fictional events and does not qualify Auth0.

The first Action writes a transaction marker, then calls only `challengeWith`
with the selected factor. The second requires that marker and fresh, non-future
MFA using the same factor after the marker; it emits only the ID-token claim.
`Date.now()` measures the window and challenge start, never the MFA itself.
Evidence predating that challenge is insufficient. This candidate must precede
another Action that might complete the same MFA. Actual metadata behavior and
Action order remain mandatory integration checks.

**This candidate challenges every eligible Browser sign-in, even without a
specific ACR request.** Deploying it unchanged would also affect existing
customers: a user without an enrolled factor could fail the challenge and be
blocked. Other OAuth clients remain unchanged. Do not consider it ready for
broad activation before defining initial enrollment, support for existing users,
strong recovery, device compatibility and rollback that preserves denial of
sensitive documents under the strong policy. The candidate automates no
enrollment; TOTP/email-only recovery never receives the strong claim.

A variant restricted to the personal/strong journey requested through
`acr_values` could reduce disruption. During the original strong-policy
research, the server requested multi-factor ACR and `max_age=0` for
`context=personal`; ordinary `fresh=1` requested only `max_age=0`. The current
server chooses these requirements according to its active policy. Such a
strong-only variant would still require a product decision and qualification of
all reauthentication entry points before activation. A request hint might trigger
or avoid a challenge but must never grant content without actual signed evidence
under the strong policy. This study adds no route or variant.

### Historical qualification of the selected strong mechanism

Before any future activation, the operator records the connection, deployed
Actions and versions. Applicable official documentation or Auth0 confirmation,
combined with negative checks, must establish how the server attests UV for
**this transaction**. If the available mechanism cannot distinguish UV, it must
not emit `webauthn_uv`.

Qualification requires:

1. Real sign-in with the selected WebAuthn factor and positive UV: signed strong
   evidence, exact method/date and access only to authorized documents.
2. An attempt with negative UV or a non-UV authenticator: failed strong login or
   absent strong evidence, followed by content refusal. The positive case alone
   is insufficient.
3. Password alone, password plus TOTP, merely enrolled passkey, recovery and SSO
   reuse must never be automatically promoted to the strong policy.
4. New challenge, wrong origin/RP ID, old assertion and wrong account: refusal.
   Server WebAuthn verification owns signature, challenge, origin and UV checks.
   [Normative verification](https://www.w3.org/TR/webauthn-3/#sctn-verifying-assertion).
5. Fresh reauthentication and SSO reauthentication: verify actual time. Use the
   normal `max_age=0` journey and check `auth_time`; `prompt=login` alone does not
   prove freshness.
   [Auth0 reauthentication](https://auth0.com/docs/authenticate/login/max-age-reauthentication).

Do not assume `event.session.authenticated_at` is available: the reference
reserves some session fields for Enterprise plans. Do not invent availability or
buy a plan before auditing. Demonstrate the Action-date/final-`auth_time` mapping
through the real flow.

### Historical fallback if Auth0 cannot supply the required attestation

A fallback would be a **real product WebAuthn UV step**, available under the same
policy to customers and internal accounts, integrated with sign-in by a redirect
Action. Auth0 documents this mechanism, signed-result verification and
`recordMethod` after login resumes; it is not a browserless password exchange.
[Auth0 Action redirects](https://auth0.com/docs/customize/actions/redirect-with-actions).

This needs separate implementation and security review: one-shot D1 challenge
bound to Auth0 subject and transaction, a public key already enrolled under
admissible identity evidence, server verification of signature/origin/RP/UV, a
short signed result with audience/nonce, then normal Auth0 continuation/callback.
The result-attestation key stays on the server/Action, never in CI. Enrollment
and recovery have the same requirements for every user.

UV time remains distinct from initial `auth_time`. A fallback must preserve their
relationship with `iat` and conservative freshness without rewriting a reserved
claim. This alternative is neither implemented nor preferred here. Qualified
federation could be another option after its assurance is defined; renaming a
password/TOTP login to `qualified_federation` is no qualification.

## Proposed accounts and fixture scope

Keep an operator list of exact subjects; never recognize internal accounts by an
email suffix or browser header.

| Proposed persona   | Guteneo authority                                        | Automatable journeys                                                                                                                        |
| ------------------ | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Recipient A        | Personal account without a workspace                     | Sign-in, vault and an already associated/authorized synthetic document, accessible text, personal history and preauthorized original export |
| Recipient B        | Separate personal account without a workspace            | Absence of A's documents and refusal of A's fixture identifiers                                                                             |
| Workspace observer | Existing `viewer` role in a dedicated internal workspace | Identity, navigation and reads allowed to the role; refusal of reserved commands                                                            |
| Fixture owner      | Human administrator of the internal workspace            | Manual initial preparation/approval; credential stays outside CI                                                                            |

The `viewer` gains no approval/reporting rights to make assertions pass. Screens
reserved to a creator/approver are not promised to that role. Document invitations
never make recipients members of the workspace.

Automated identities may additionally receive the operator `prepare_only`
restriction, created for these new subjects before first use. This is an extra
sending safeguard, not a fully read-only role. Do not touch the marketplace
review account or its restrictions. A future general read-only server restriction
would need its own contract; this document does not create one.

The internal workspace contains no customer, address list or real data. Fixtures
are recognizable synthetic PDFs with no personal association, identified by exact
manifest and hashes. The manifest records expected identifiers, read/export
permissions, authorized subjects and deadlines; no invitation token, signed URL
or secret. Documents and associations are already established through the
authorized human journey. An expired fixture means fixture unavailable, never
permission to recreate, extend or reactivate it automatically.

Forbidden automated business actions are approval, confirmation/activation,
recipient binding, invitation claiming, depositing/deleting a copy, creating a
workspace, modifying a profile/permissions, payment, top-up, delegation
activation, sending or causing a refund. Technical session writes and access
events produced by a real read are expected and remain audited.

## Operator setup, once separately authorized

1. Verify the actually served release/migrations, canonical issuer,
   authorization domain, web client, callback, RP ID and active policies. Reuse
   the same Auth0 application. A dedicated new connection, if chosen, must be
   identified as a different scope from ordinary customer authentication.
2. Create the dedicated new identities in the real tenant with controlled
   mailboxes. Establish actual, traceable email verification. Runs send no
   automatic SMS/email request; creation and initial verification are separate
   operations, not performed by this study.
3. Complete their first real Auth0 login and record stable
   `(issuer, subject) → userId`. Never link identity by matching email, insert a
   session directly into D1 or inject an arbitrary cookie.
4. **Only for the historical strong/WebAuthn candidate:** enroll the automation
   credential through real Auth0 MFA in a controlled browser. Auth0 retains the
   public key; only the test authenticator holds the private key. Export no
   personal physical key. For password plus WebAuthn MFA, the test account's own
   password is also a necessary bootstrap secret. These are not requirements of
   the current `verified_account` launch.
5. Qualify the active policy's signed evidence, freshness and negative cases.
   The historical strong candidate additionally requires the UV checks above.
   Record versions/results without publishing a token, key or challenge detail.
6. Store dedicated credentials in the approved private channel, establish subject
   restrictions/manual fixtures and authorize the first authenticated read-only
   run. Routine test execution needs no tenant or secret mutation.

For the historical WebAuthn candidate, proposed persona-specific secrets are the
credential ID, user handle and PKCS#8 private key exported from the virtual
authenticator, plus the test account password only if the real flow requires it.
Expected issuer, RP ID and fixture identifiers are controlled parameters, never
assurance grants. Any unnecessary TOTP/recovery credential stays outside the
recurring job.

The test follows every factor actually required by the tenant. It disables
neither MFA nor attack protection for a CI subject. If a second factor follows a
passkey, qualify its automation and protect its secret; TOTP alone does not become
`webauthn_uv`. A non-automatable challenge produces an explicit result and
operator intervention, without retry loops or hidden exemptions.

## TesterArmy and browser integration

`browser.evaluate` executes JavaScript in the page. It grants no CDP or Node
context access and must not replace `navigator.credentials` or fabricate a server
response.

The installed package exposes `surfaceOf(engine).context()` and `.page()`. A
qualification adapter called after the attempt starts and before sign-in may
create `context.newCDPSession(page)` and enable Chromium's WebAuthn domain. It
must use exactly the target's engine instance; a new `web()` in the test is not
the current browser. Verify worker/config integration before publishing a hook.
[Playwright CDP session](https://playwright.dev/docs/api/class-browsercontext#browser-context-new-cdp-session),
[Chromium WebAuthn protocol](https://chromedevtools.github.io/devtools-protocol/tot/WebAuthn/).

For the historical strong candidate, qualify `protocol=ctap2`, matching factor
transport (`internal` for platform, `usb` for roaming), UV support, positive UV
for the positive case and automatic presence. A resident credential is needed
only if the journey requires it. Import only the persona's registered credential
with the exact RP ID; switch to negative UV for the negative check. Auth0 supplies
the challenge and verifies its signature. A phone viewport in Chromium proves
mobile web layout, not iOS Safari or a hardware key.

The local probe demonstrated CDP access through TesterArmy's public surface,
creation/removal of an empty authenticator and reading zero credentials. It
contacted neither Auth0 nor Guteneo. Another verified installed-driver limit:
`@e2e-dev/web` starts Chromium without exposing `chromiumSandbox`/`launchOptions`.
The existing CI helper protects the PDF renderer, not the test browser sandbox.
Before introducing real credentials, use a bootstrap/provider explicitly launching
sandboxed Chrome and CDP, or demonstrate an equivalent control. The anonymous
public job is not automatically suitable for this authenticated job.

Credential counters require qualification. Never repeatedly import an obsolete
counter and disable clone detection to hide failures. Permit one concurrent run.
If the server checks a nonzero counter, the adapter must use a bounded monotonic
sequence for that CI credential, including new attempts, and reject overflow or
rollback. Initial counter/approved strategy belong in the private enrollment
manifest. Never reset the Auth0 credential during a run.

Prefer a real login in each isolated context: the same tab through callback,
server-created session only, personal bootstrap, then verification of `userId`,
expected workspaces and public assurance. For export, reauthenticate before the
five-minute freshness limit rather than waiting for the one-hour cookie to expire.

Playwright `storageState` is an acceptable fallback if the adapter cannot use the
engine directly. It must originate in a real Auth0 login during that same run,
enter only the intended context and remain ephemeral. Import never extends
`auth_time` or expiry. Do not restore days-old cookies. This state permits account
impersonation: no cache, repository or artifact may contain it.
[Authenticated-state handling](https://playwright.dev/docs/auth).

## GitHub execution and privacy

Plan a separate job, initially `workflow_dispatch`, with a proposed
`production-auth-readonly` environment. Effective protection depends on the plan
and repository visibility; not every approval rule is available to every private
repository. Verify availability before claiming enforced approval. Otherwise
start with a controlled local operator run or an already approved secret channel,
without purchasing or bypassing protection.
[GitHub environments and secrets](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments).

Future-job rules: approved branch/release and exact SHA, no untrusted PR/fork code,
pinned third-party Actions, minimum `contents: read`, private environment,
concurrency 1, zero automatic retries and disabled cloud telemetry/reporting.
Only the login process accesses the private key. No traces, video, HAR, automatic
screenshots, response bodies, cookie dumps or vault snapshots. Output filtering
remains necessary; GitHub masking does not guarantee protection against secret
transformations.
[Workflow security](https://docs.github.com/en/actions/reference/security/secure-use).

Keep secret fields separate rather than one large JSON whose transformations
escape masking. Any essential temporary file is private to the job and removed
in `finally`; it is never an uploaded output. Prefer an ephemeral GitHub runner
to prevent profile reuse. Hosted runners use a new VM per job, destroyed afterward.
[Hosted runners](https://docs.github.com/en/actions/how-tos/manage-runners/github-hosted-runners/use-github-hosted-runners).

GitHub OIDC may sign report provenance bound to the hash and exact environment.
It neither authenticates a Guteneo user nor replaces Auth0. Verify issuer,
audience, repository, environment, workflow/ref and SHA; do not assume a historical
subject format for a repository using newer immutable subjects.
[OIDC reference](https://docs.github.com/en/actions/reference/security/oidc).

The future authenticated report must remain distinct from anonymous evidence:
`suite=authenticated_readonly`, schema version, served SHA, run, browser,
per-check result, presence of qualified assurance and maximum observed age.
Sensitive details stay private; publish only controlled states/codes. Anonymous
success or local evidence cannot change authenticated status to success. For the
historical strong candidate, retain
`DEDICATED_STRONG_AUTH_FIXTURES_NOT_CONFIGURED` until accounts, UV and fixtures
are qualified; that historical code does not impose UV on `verified_account`.

Proposed files are `e2e.production-auth.config.ts`, the private Node bootstrap
`scripts/production-auth-bootstrap.ts` with no sensitive output, and
`tests/production-auth-readonly/`. The authenticated job references only approved
code from those files. No `/dev/login`, test-session creation endpoint or special
JWT-validation branch is added to the Worker. This study does not implement
these files.

## Proposed V1 suite checks

| Check                        | Required result                                                                                                                                                                                |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Real identity                | Normal Auth0 callback; stable subject/persona; no development login                                                                                                                            |
| One account                  | Recipients without a workspace; services visible without implicit workspace creation                                                                                                           |
| Isolation                    | B cannot list, read or export A's documents; refusal without disclosure                                                                                                                        |
| Active authentication policy | Verified account, valid signed identity and required freshness for the launch policy; historical strong tests additionally require qualified positive UV and negative/missing-evidence refusal |
| Content                      | Fixture pages/text have expected hashes; private/no-store caching                                                                                                                              |
| Preauthorized export         | Exact synthetic bytes and transfer event, without claiming saving to disk                                                                                                                      |
| CSRF                         | Export without CSRF is refused before any bytes are delivered                                                                                                                                  |
| Session                      | Logout then read refusal; new sign-in restores only intended authority                                                                                                                         |
| Financial non-regression     | No approve/confirm/activation; no new communication call, reservation or debit                                                                                                                 |
| Honest evidence              | Chromium mobile web/software authenticator identified; no hardware or human-consent qualification                                                                                              |

Each scenario binds an exact route/document. The browser additionally blocks
forbidden business mutations as defense in depth; that filter never replaces
server roles/restrictions. If a persona lacks a screen's authority, test refusal
or reduce scope without granting rights.

## Proposed budget, activation and completion criteria

Initial proposed budget: one worker, one on-demand run, at most six minutes,
eight Auth0 sign-ins, two viewports and one bounded synthetic export. No automatic
schedule before measurement. Record startup, active/idle browser time, runner
CPU/memory, Auth0/Workers/D1/R2 requests and object-read volume. Adjust limits after
a representative first measurement. No business credit consumed by the suite
does not mean no Auth0, GitHub or Cloudflare usage; claim no zero cost without
measurements.

Completion requires a validated private identity/enrollment dossier; positive
and negative evidence for the active policy's signed identity/time mapping;
accessible, unexpired, human-established fixtures; a successful first
authenticated run on the exact release; inspection of reports/traces for secrets;
and unchanged financial counters/external communication calls. The historical
strong candidate additionally requires qualified UV/Action-date evidence.
Scheduling is a later, separate activation.

Full cycles of preparation, fictional approval, simulated activation, deposit,
revocation and financial races remain in the isolated local suite. Future
automated production writes would require explicit test authority distinct from
human consent, bounded to synthetic tenants and zero external providers. That
changes an invariant and does not follow from creating the accounts described
here.
