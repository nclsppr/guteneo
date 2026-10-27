# Secure distribution and unified account

24 October 2026 candidate. This record describes local code and the requested publication configuration; it establishes no remote migration, plugin publication or production deployment. The user authorizes publication with the `verified_account` document policy. Earlier decisions and studies are dated in the [unified account plan](UNIFIED_ACCOUNT_AND_VAULT_PLAN.md); their mandatory-strong-authentication assumption does not supersede the explicit decision below.

## Quote and sign-in recovery — 27 October 2026 candidate

The [recovery contract](SECURE_DISTRIBUTION_JOURNEYS.md#recover-an-expired-invitation-quote)
owns the browser-only renewal lifecycle, authority matrix and failure handling.
Immutable distributions and invitation quotes are never edited to extend validity.
An explicit eligible renewal cancels the unsubmitted original under transaction
fences and prepares one deterministic replacement, which requires new human
review. Current source, pricing, rendering and approval gates remain mandatory.
No migration, provider setting, Auth0 configuration, mandate or automatic sending
is introduced.

Shared sign-in errors now include the sensitive browser-approval freshness fence
in all four interface languages. Explicit fresh login preserves the safe existing
share path and locale, drops query/fragment values and replays no mutation.
Local behavior checks do not qualify actual hosted Auth0 recovery, communication,
exact-source CI or publication; retain those observations separately.

Local qualification on 27 October for the recovery source committed as
`adc8f5343927`, before reconciliation with the 1.1.10 main release:

- Backend renewal and approval-boundary suites pass 77/77 cases: 60 secure-core
  and 17 approval-boundary checks, including nine new recovery cases.
- UI/authentication and MCP suites pass 65/65 cases: 40 localized UI/return-path
  checks and 25 MCP compatibility cases. Package checks pass 13/13.
- TypeScript and scoped ESLint pass. Documentation generation/checks, engineering
  build and engineering checks pass independently.
- The final three-browser recovery/V2 suite passes 18/18 in 28.954 seconds,
  starting at `2026-10-27T16:04:05.433Z`, with no skips, flaky results or
  unexpected failures. It covers Classic/V2 quote recovery, expiry at approval,
  existing-replacement navigation and light/dark V2 list/composer/review.
  [Loading measurements](FRONTEND_PERFORMANCE.md#secure-distribution-recovery-and-v2--27-october-2026)
  record the local synthetic environment and separate observation boundaries.

These checks establish neither hosted Auth0 recovery, real recipient access,
physical-device behavior, exact-source CI, production publication nor sending.
A terminal renderer failure remains failed under its existing lifecycle; renewal
resumes a known interrupted replacement and never blindly retries provider work.

## Account invitation update — 26 October 2026

The [email contract](PROTECTED_EMAIL.md) owns template/default/marker behavior;
[recipient journeys](SECURE_DISTRIBUTION_JOURNEYS.md) own the authority matrix.
New immutable policy JSON includes `recipientBinding=verified_email` unless
`independent` is explicitly requested. Missing historical fields remain independent.
Claim checks the opaque invitation, normalized verified address, stable Auth0-bound
personal identity, freshness and current access mode. One D1 batch binds the user,
records `binding_method=verified_email` and an idempotent
`recipient_verified_email_bound` event under the session fence. It creates no
membership. Expiry, revocation, changed identity and stale sessions remain closed.
No migration or reinterpretation of existing approvals is required.

`SecureDistributionService.prepare` freezes sanitized input, workspace name and
locale before asynchronous rendering; `ensureDispatch` inserts the account URL
before domain fingerprint/approval. Browser review may read final HTML; OAuth/MCP
summaries strip that capability. The legacy request hash remains replayable for
historical rows only. Source compatibility guards and browser-only approval stay
unchanged. Local evidence does not establish live activation or provider delivery.

## Account and authority

One Guteneo identity receives documents, manages its personal area, uses services and participates in workspaces. Personal registration creates no workspace, credit or quota. Entering services allows explicit, idempotent initial workspace creation. A document invitation creates no membership in the sender's workspace.

Identity binding preserves `(issuer, subject)`. Equal email addresses do not merge accounts. A recipient must own the expected address and satisfy current document policy. The frozen binding policy determines automatic verified-address claim or independent workspace confirmation, as defined above. Pending independent association exposes no sensitive title or page.

`SENSITIVE_DOCUMENT_AUTHENTICATION` selects `strong` by default when absent, or explicitly `verified_account`. Unknown values deny access. The requested live configuration selects `verified_account`: verified account/email and an Auth0 session bound to `auth_identities`, with genuinely signed recent primary `auth_time`. The server retains expiry, revocation, identity and rights checks; browser fields never supply this evidence. Account/address control proves neither a second factor nor physical identity.

Maximum freshness remains fifteen minutes for reading, association and approval, and five minutes for original export, personal deposit and personal deletion; future tolerance is five seconds. `strong` additionally requires signed evidence of the method actually used: claim `https://guteneo.com/document_authentication`, family `guteneo-sensitive-v1`, method `webauthn_uv` or `qualified_federation`, and ceremony time bounded by signed `auth_time` and `iat`. An old MFA boolean or merely registered passkey is insufficient. Method qualification is separate and is not a subscription prerequisite for the chosen `verified_account` profile.

Personal sessions expose `documentAccessMode` and `documentAccessAllowed`, calculated for the fifteen-minute window, to explain policy in the UI. Sensitive actions retain their five-minute server check. `strongAuthentication` and `mfa` remain factual evidence: ordinary sessions permitted under `verified_account` do not turn them `true`, and `authentication_policy_version` may remain null.

24 October continuation: passkey selection/integration remains explicitly deferred. Selecting document policy changes neither Auth0 nor roles and fabricates no strong evidence. Content/approval guards remain mandatory; local journeys use only synthetic identities in isolated simulation.

Distribution review and approval are exclusively human browser actions. Migrations 0057 and 0059 bind approval to document, fingerprint, approver, session and effective `secure_approval_evidence.authentication_mode`. Family `policy_version=guteneo-sensitive-v1` alone does not prove MFA. Confirmation and SQL guards recheck current policy/session, including historical receipts; ordinary receipts are insufficient after returning to `strong`. REST/MCP, expert mandates and queued work pass the same guards. An assistant can prepare and confirm an already approved preparation; it cannot approve it or confirm recipient association.

Sources used by this new distribution are restricted to their creator and current workspace approvers, with existing private restrictions. Content/review also pass current document policy. This does not retroactively qualify every old product document. Sources must be dedicated: revoke still-valid legacy protected links; a source already referenced by an ordinary dispatch, provider preparation, postal preflight or postal derivation cannot become sensitive. Sensitive sources cannot return to those legacy paths. Bidirectional application/SQL guards also close asynchronous preparation races. Migration recalls no copy previously transferred or downloaded.

## Objects and retention

Each distribution binds an immutable PDF, recipient, rendering, policy, pricing version and invitation dispatch. The analyzed PDF remains private; viewing never returns the source PDF. The private renderer prepares at most three pages per job, with an opaque watermark burned into pixels and separate accessible text. Unsupported content/budgets fail closed rather than opening the original as fallback.

Current limits: 10 MiB PDF, one hundred pages, JPEG dimensions up to 1,600 pixels, 8,000 accessible characters per page, three pages per batch and preparation expiry after twenty-four hours. Truncated text is rejected. Watermarks carry the distribution reference, never the customer's email. They neither establish a photograph's origin nor prevent screenshots.

Shared and personal objects use distinct random data keys, wrapped with AES-GCM and object-bound authorization context. Every read checks SHA-256 integrity. Service encryption keys remain available to the trusted runtime: this promises neither end-to-end encryption, an HSM nor storage inaccessible to operators.

`SECURE_DOCUMENTS_KEY_ID` selects the active wrapping key; `SECURE_DOCUMENTS_KEYS` holds the secret versioned keyring. Retain old keys for existing envelopes. `SECURE_DOCUMENTS_KEY` remains compatible with single-key configuration. Never replace an old key without rewrapping objects/invitations, checking backups and testing restoration. Simulated local development has a deterministic key restricted to that context, never production configuration.

Sharing starts at atomic command acceptance. Revocation denies new access, retains the service charge and does not erase delivered copies, received pixels or downloads.

The personal-copy option provides independent, exportable retention for one or three years from actual delivery. It can be permitted while shared-original downloading is disabled. Recipients explicitly request deposit. A durable job copies three pages per batch into its own encrypted namespace; the copy remains invisible until final transactional activation. That transaction rechecks share, policy, person, funding and fresh session. Revocation winning the transaction prevents delivery; later revocation cannot affect an acquired copy. Recovery uses the same identifier without charging again.

Closing a tab does not cancel accepted work. Queues and bounded reconciliation resume jobs whose leases expire. Expired/revoked sessions require fresh authentication before deposit completes. Expired-object deletion is bounded, resumable and independent for shared/personal copies. Orphan sweeping must never delete active objects or still-authorized pending copies.

## Audit and privacy

Final authorization for page, text or original transfer appends a durable event before returning content, after R2 waits. Revocation/session loss during reads denies the response. Audit insertion failure denies delivery.

| Event | Meaning |
| --- | --- |
| `page_access_authorized` | Server authorized an image response |
| `page_displayed` | Browser reports a loaded visible page; declarative signal |
| `accessible_text_access_authorized` | Server authorized accessible text |
| `original_download_requested` | Export requested and authorized |
| `original_transfer_started` | Server starts the original response |
| `personal_copy_delivered` | Independent personal copy activated |
| `access_revoked` | Workspace withdrew sharing |

Audit does not claim human reading, completed disk save, physical printing or screenshot detection. Workspaces see their share's events and copy acquisition; subsequent private reads belong solely to the personal area. Lists/audits are paginated. Technical logs exclude content, recipients, secrets and invitation URLs; test-report exports follow the same rule.

## API, assistants and deployment

`/api/secure-distributions` serves the price catalog and preparation/list/detail/confirmation/revocation. Access uses authenticated workspace, current rights and, for OAuth, verified connection authority through the transaction. Asynchronous preparation rechecks its initiating authorization snapshot. Personal endpoints accept only browser sessions with CSRF; workspace OAuth tokens never list personal vaults.

The five corresponding MCP tools, schemas, annotations and prompt are shared by ChatGPT, Claude, Cursor and client configurations using the common server. Packages grant no extra rights; builds prove neither host installation nor marketplace publication. Native apps can open the web journey; this candidate implements no native vault interface.

Real activation requires `SECURE_DISTRIBUTION_ENABLED=true`, a valid key, private renderer and coherent document policy. Existing send, provider quote, credit and approval gates remain. Target policy is `SENSITIVE_DOCUMENT_AUTHENTICATION=verified_account`; default `strong` remains available. See [pricing](SECURE_DISTRIBUTION_PRICING.md) and [e2e guide](../tests/distribution-e2e/README.md).

The operator's 24 October Resend observation around 17:39 UTC confirmed `nclsppr` Free, 0/3,000 monthly, 0/100 daily, 10 requests/second, paid overages disabled and `guteneo.com` verified in `eu-west-1`. The candidate enables email variables alongside fax/postal and requalifies the price reference until 23 November 2026 at 00:00 UTC. Historical fixed commercial FX 1.1537 USD/EUR is not a current rate. Prepared global policy caps Guteneo at 80 recipients/rolling 24 hours, 2,400/UTC month and 500 ms spacing, with sanitized source evidence. D1 installation, webhook and secret still require implementation/qualification; local flags establish neither these steps nor delivery. See [dated Resend evidence](RESEND_PROOF.md).

Migration `0059_document_authentication_policy.sql` creates singleton `secure_document_authentication_policy(id=1, mode)` defaulting to `strong`. The Worker never changes it. After migration the operator explicitly runs `UPDATE secure_document_authentication_policy SET mode='verified_account' WHERE id=1` on the intended business database for the authorized choice, publishes the matching environment value, then verifies agreement. Mismatch denies content/confirmation, including after R2 waits; it never silently falls back to weaker policy.

Returning to `strong` coordinates the D1 row and code configuration compatible with 0059; disagreement during transition denies access. Do not erase receipts to ease rollback. Old `verified_account` approval must be reviewed under the new requirement; no ordinary receipt becomes strong evidence. Under `verified_account`, old strong receipts still pass current account/address/identity checks. Keep service closed if the restored strict mode's evidence is unqualified.

Before connected qualification, check the actual journey and account recovery under the selected policy, PDF corpus/accessibility, key/data rotation/restoration, CPU/R2/D1/renderer metrics, contractual location and audit retention. Define/test usage budgets and abuse response for long retention; a per-minute limit alone cannot prove sustained-use profitability. Backups, expiry notifications and retention renewal require separate operational qualification. Claim no certified vault, legal archive or DRM service.

## Local evidence on 24 October

Local `verified_account` run `01a16ef7-4017-783f-80e7-80426686b572` passes 2/2 desktop/phone results: preparation, human browser approval, independent association, exportable personal copy despite disabled shared-original download, other-account isolation and retention after revocation. Ordinary sessions and associated identities are synthetic in isolated local D1; `strongAuthentication=false`, `mfa=false` and null authentication family remain asserted. It qualifies neither real Auth0 login nor provider delivery. Targeted backend passes 73/73 (22 personal authentication, 17 approval boundary, 34 document service); price qualification 31/31; UI rendering 13/13.

The `strong` profile passes 14/14 in run `01a16efd-d3c7-7c1e-b6db-7d1c647da7f1`, 105.63 seconds, without skips, flaky results or model calls; its archive is sanitized. Final build after **Check my access**, TypeScript, dry run and thirteen UI cases pass. The link explicitly requests fresh login and a secret-free distribution-list return, never automatic SSO reuse. The 355 Node checks and ESLint passed before that small addition; exact-commit CI remains pending. These local checks establish no publication.

Earlier results below qualify their recorded source and synthetic identities before migration 0059. They do not automatically qualify `verified_account`, its D1/environment alignment or a connected production account.

UI continuation passes 23 document-service and eight rendering cases, including four-language rights explanations. TesterArmy run `01a16ebe-ca29-7ebc-a2f1-7d13fc31deea` passes 14/14 in 108.73 seconds, without skips, flaky results, model calls or concurrent rebuild. Both targets exercise cancelling then confirming personal deletion, page/text/export refusal, private workspace audit, unchanged commitment and metadata removal after pagination 401/403. Application code and 190 built files remain unchanged; stdout/artifact secret guards pass. Six navigation regressions pass on desktop/mobile Chromium and iPhone WebKit; twelve desktop Chromium login-entry cases pass. Build/dry run, TypeScript, ESLint and the then-252-feature atlas pass.

The first expanded run (13/14) failed on an ambiguous menu/back-link selector; its report and privacy check remain preserved. First login suite (11/12), then isolated reproduction, failed during fixture teardown with static proxies still in flight. Bounded draining fixes it without suppressing errors/removing assertions; corrected runs remain distinct. Rendering tests do not prove interactive association-candidate replacement; they did not replace actual association in the complete lifecycle.

Candidate `d942fa9` passes full regression: 119 Vitest files, 2,305 cases and 355 Node checks, without failures/skips, including 24 new legacy-path regressions. The 58 migrations pass local transported-schema comparison, positive integrity check and no foreign-key violation. MCP catalog verifies 72 tools; build/typecheck/lint pass.

Reconciliation on `ac795d0` preserves explicit logout/public HTTP errors: 148 affected unit cases and twelve desktop browser cases pass. [PR 74](https://github.com/nclsppr/guteneo/pull/74) records final isolated e2e and exact-commit GitHub checks. Two local e2e restarts interrupted by concurrent asset rebuild remain failures, not relabeled successes. CI uses an isolated distribution job.

An actual anonymous observation passed 28 public checks without uploading a GitHub report. [Test accounts](PRODUCTION_TEST_ACCOUNTS.md) and their two proposed Auth0 Actions describe an earlier strong-mode study and remain inactive. Inspected Actions issued no strong document evidence. Passkeys remain deferred; selected `verified_account` does not depend on these Actions, but dedicated accounts/connected production journey remain unqualified. Pre-0059 results do not prove the new policy; its local 2/2 run is separately identified above. CI configures separate profiles, fourteen `strong` and two `verified_account` results, without concurrent builds; configuration does not claim GitHub success. Public observation, simulation and connected current-policy journeys remain distinct evidence.

The 1.1.11 reconciliation with `26867c8` separately passes 96 UI/authentication/MCP/personal-policy cases, 24 package checks and the same 18 browser cases across all three engines. Typecheck and documentation checks pass. These local results qualify the combined candidate; production and hosted identity remain separate.

The 1.1.12 concurrency regression pauses one renewal during exact-source verification while another completes. Recovery re-reads the current cancellation marker, authority and session before reusing the matching replacement, rather than rejecting it from earlier snapshots. Both calls return one replacement without approvals, reservations, outbox entries, charges or attempts.
