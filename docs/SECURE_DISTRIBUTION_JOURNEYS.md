# Sensitive distribution and personal documents

Contract and journeys, updated for the 26 October 2026 source candidate. This describes current implementation/limits, not publication, activation or real delivery. One account spans Guteneo; workspaces are optional memberships and personal documents do not form an artificial workspace.

## Authority and entry conditions

| Actor | Required authority | Scope |
| --- | --- | --- |
| Preparer | Current membership, preparation permission, accessible verified source | Own preparation, exact source and frozen quote |
| Approver | Administrator or supervisor with approval permission; browser and current-policy session | Workspace review, approval and recipient association |
| Recipient | Personal principal, verified address, recent session and policy-bound association | Own shared access and personal copies |
| Assistant / OAuth API client | Intersection of role, scopes and current connection | Workspace preparation/follow-up; confirmation after browser evidence, no recipient identity or personal vault |
| Platform operator | Separate configuration/publication authorization | Service activation; no authority derived from workspace role |

Account, language and sign-in are shared. Receipt creates no sender membership; plugin installation or possession of a document address creates no rights. Verified email does not establish physical identity. The server controls document policy, never a browser field. `strong` is default; `verified_account` is the explicitly requested live choice, requiring verified account/email, linked Auth0 identity and signed recent `auth_time`, without claiming MFA or certified physical identity. Unknown values or environment/D1 disagreement close access. Reading, association and approval require authentication at most fifteen minutes old; export, deposit and deletion require five minutes.

Passkey choice remains deferred by product request. `verified_account` changes no Auth0 setting and fabricates no strong proof; `strong` retains its qualified-method requirement. Session fields `documentAccessMode`/`documentAccessAllowed` explain browser access; every operation is rechecked server-side. Activation and connected journey remain separately qualified.

In the workspace, document-policy, strong-authentication, freshness or approval refusal offers **Check my access**. This voluntarily requests fresh login through `/auth/login?fresh=1`, returning to **Secure distribution** without document/invitation identifiers. No automatic redirect reuses old SSO. Find the same preparation and resume review under current rights; reauthentication approves/activates nothing.

## Prepare, review and activate sharing

1. Open the individual **Email** composer with a PDF (default **My documents**), **Secure distribution → New share**, or the same REST/MCP operation through an authorized client. Workspace navigation puts this after **Documents**, with **Overview → Assistants** first. Details retain that active entry.
2. Select a `ready` PDF up to 100 pages/10 MiB; choose one individual address and 7/30/90/365 days of shared access. Original download defaults off in the dedicated share form and on in the individual email form, where it remains an explicit editable choice. Optional personal copies retain independently for 365/1,095 days. Explicitly load source-selector pages for older documents. Copy permission explains that personal copies remain exportable even when the shared original is not.
3. Subject/message/HTML are optional. The [document email contract](PROTECTED_EMAIL.md) defines localized workspace defaults, the V2 template and `{{document_url}}`. New invitations default to matching verified-address access; independent workspace confirmation remains an explicit policy choice.
4. Keep the identifier/idempotency key. Rendering uses bounded durable jobs. `preparing` means neither activation nor sending; follow-up reads do not recreate preparation. Accessible pages/text derive from the verified immutable version; recipients receive no original-PDF fallback.
5. Approvers inspect final pages or text, recipient, permissions, message and complete tax-exclusive price. Retention/invitation transport appear separately. Two explicit choices cover review and the recipient's prior email request.
6. Approve in the browser under current document policy, then confirm activation. Assistants may confirm the exactly approved preparation under scopes and host confirmations, but never supply sensitive approval, including with expert mandates.
7. Activation atomically records commitments, consumption and outbox under domain guards. Live providers, scanner, billing and current capabilities remain mandatory in production.

Price is per PDF/recipient. Activated terms are fully due; disabling/revoking refunds neither retention nor the funded personal option. The versioned shared contract supplies the quote, never an assistant-calculated amount. Unknown provider outcomes require reconciliation, never blind retry or automatic new preparation.

## Source compatibility with legacy flows

Sensitive distribution is not a transparent upgrade of password links or postal preparations:

- Revoke unexpired legacy `draft`/`active` hosting first. `SECURE_SOURCE_LEGACY_LINK` directs this under current workspace rights.
- Any derived/reserved/generated postal-preparation row blocks conversion with `SECURE_SOURCE_LEGACY_DERIVATION`. Use a dedicated sensitive source; never erase history to bypass the restriction.
- Any legacy send, postal preflight or provider draft referencing the source also blocks preparation with `SECURE_SOURCE_LEGACY_OUTBOUND`, including after cancellation/failure. Use a dedicated source; this prevents conversion during an in-flight provider transfer.

Once referenced by sensitive distribution, a source cannot serve legacy postal processing, cropping, analysis, old-password recovery or legacy-link content. New ordinary email/fax/postal attachments are also prohibited. Only the dedicated sensitive invitation without source attachment (`document_id` null) continues under ordinary rights. `SENSITIVE_SOURCE_LEGACY_FORBIDDEN` applies even after sensitive failure/revocation; no workspace role, OAuth scope or expert mandate reverses it.

Initial compatibility reads are insufficient. Symmetric SQL guards reject sensitive insertion when prohibited legacy hosting/preparation/send/preflight/provider draft exists, and reject concurrent legacy writes once sensitive reference exists. Guards bind authenticated workspace and exact source. This neither recalls exported files nor retroactively protects their copies.

This deliberate V1 incompatibility never converts an operation exposed to legacy flows into an isolated sensitive source.

## Receive with one account

1. The link opens **My documents**. Its invitation leaves the fragment before HTTP login navigation and stays at most ten minutes in that tab's `sessionStorage`. Auth0 gets a token-free personal return; association resumes after callback. Blocked storage offers explicit reopening after sign-in. No purchase/workspace activation is required.
2. Sign in or create the one Guteneo account. Expected-address verification and recent policy-compliant session precede association request.
3. With the new `recipientBinding=verified_email` policy, opening the document atomically binds the matching verified address to the stable account under the current session fence. No separate password or workspace confirmation is required. This authorizes address possession, not physical identity.
4. An explicit `independent` policy, or a historical policy with no binding field, remains pending until the workspace confirms the stable-account/intended-recipient link. Sensitive content stays unavailable. Approvers see only their own share's request. Verify a known relationship, independent channel or qualified identity, then explicitly confirm association; a self-entered name alone is not independent proof. Attestation binds displayed account/request; refresh with another candidate requires new attestation.
5. Recipients read prepared pages, accessible text and expiry. Each delivery rechecks authority/session. Revocation prevents future deliveries without erasing received pixels.

Wrong accounts/unavailable invitations reveal no other-account existence. Recovery is explicit; document 401 does not trigger automatic login loops. Personal routes remain separate from workspace API and reject workspace Bearer authority for personal content.

## Two categories and distinct operations

| Category | Promise and operations |
| --- | --- |
| Shared with me | Individual, workspace-revocable, term-limited access; original only if permitted; confirmed association required |
| Saved copies | Independently delivered authorized copy, own term, personal export/deletion; workspace departure/revocation cannot remove it |

**Download original PDF** is separate, explicit and requires current-policy authentication at most five minutes old. Audit distinguishes request from started transfer. Network success never proves disk saving. Later openings/copies/screenshots/printing are outside Guteneo's observation.

**Keep a copy** explains independent retention and the workspace's inability to recall an acquired copy. Deposit is one durable operation per source/owner. Small deposits can finish in-request; others progress through bounded jobs. UI follows the same share until an activated copy identifier appears. Closing the tab cannot cancel accepted work; returning/resuming creates no second copy/charge. No success appears before durable activation. Revocation before delivery prevents acquisition; afterwards the copy remains personal.

Recipients may export then delete their copy. Deletion removes personal access, not workspace source/previous exports. Cancelling confirmation retains it. Deleted/expired copies cannot be redelivered through the same invitation: UI removes deposit and direct calls reject without indefinite waiting, recreation or debit. Deletion adds no extra private event to workspace audit; later private reads are not reported to the sender. Retention is bounded; no perpetual retention or certified digital-vault claim is made.

## Find documents and discover services

**My documents** separates both categories. Server-side owner-bound filtering, bounded search and pagination cover all authorized documents rather than only the first client-filtered rows. 401/403 clears loaded lists/cursors; obsolete pagination responses after refresh cannot restore them. Account language remains shared across Guteneo.

**Use Guteneo** remains in the same session. Recipients can prepare sends/share documents, choose an existing membership or request an initial workspace. The server explicitly creates required business structures with real channels closed and administrator role for the creator. Creation/selection reloads the chosen preparation document and workspace session; identity, rights and CSRF all come from the new server session without retaining old workspace context. Failures stay visible in the personal area. Selecting the sender's workspace without membership is denied. Receipt implies no new login identity, mandatory subscription or marketing consent.

Ordinary application entry (`/#/app`) by a verified account without a workshop
now opens **Use Guteneo** with the workspace form before service cards. Choose
**Create my workspace**, supply its name, and confirm; or choose **Join an existing
workspace** and paste the personal Guteneo invitation link. The browser accepts
only the current origin's `/invitation/#token=…` form, preserving the secret in the
fragment. The existing invitation preview, exact verified-email match and atomic
acceptance decide membership and role; this form cannot search or join an
arbitrary workspace. Invalid links preserve the form and show recovery. Creation
uses the existing idempotent personal endpoint, rotating the workshop session only
after success. No additional API read or bundle is introduced by the choice.
Explicit **My documents** entries still open received documents directly, with no
forced workspace. New accounts use V2 while existing layout choices remain saved.
See [layout defaults](DASHBOARD_V2.md#new-account-default--27-october-2026-candidate).

Service promotion is generic/voluntary. Titles, contents, senders and reading actions do not personalize offers. Promised document access never depends on commercial conversion.

## Audit and information for people

Workspace audit concerns its share: preparation, activation, association, authorized access, browser declarations, download requests, transfer start, copy delivery and revocation. Events identify provenance. Declared display proves neither full reading nor a person's certain presence. No reliable screenshot detection or physical-print proof is claimed.

When available, actor account appears by current name/stable identifier, attributing requests to an authenticated Guteneo account without certifying physical identity. Detailed access events (page/text/download/transfer-start) retain ninety days, then purge in bounded batches. Approval, billing, association and delivery receipts remain separate with their own retention; activity purge never removes those immutable records.

Audit refreshes while its active detail is visible. Preparing/deposit work uses bounded tracking; hidden tabs retain no periodic polling. Pagination reaches older events. Owners have personal history independent of workspace audit after copy delivery.

Opaque invitations, tokens, private URLs and content never enter logs. Sensitive responses are private, noncacheable and nonindexable. Revocation/account recovery never authorizes a workspace to recover a vault containing other senders' documents.

## Surfaces, errors and activation

| Surface | Current contract |
| --- | --- |
| Workspace web | `/app/secure-distributions`: preparation, final review, approval, activation, association and revocation under current rights |
| Personal web | `/app/my-documents`, `/app/services`, `/app/personal-account`: image/text reader, permitted export/copy |
| Workspace REST | `/api/secure-distributions`: bounded operations, authenticated tenant, OAuth scopes/current permissions |
| Personal REST | `/api/personal/*`: browser owner principal; no implicit personal access through workspace OAuth |
| MCP/assistant packages | Catalog, prepare, list, detail, confirmation after browser approval, revoke; no association, sensitive-approval or personal-vault-reading tool |
| Native | Existing native contract/browser opening retained; local integration/package qualifies neither real clients nor physical devices |

Scan, integrity, rendering, oversized text, funding, authorization, freshness and configuration errors close the flow. `failed` never becomes success; inspect the same identifier before deciding on a new preparation. Legacy password URLs remain a separate historical contract and gain no retroactive sensitive-flow security.

Migrations: `0055_personal_accounts.sql`, `0056_secure_distributions.sql`, `0057_secure_approval_evidence.sql`, `0058_secure_copy_jobs.sql`, `0059_document_authentication_policy.sql`. Production requires dedicated activation, valid private key, private renderer, real scanner/provider. After 0059, D1 singleton `secure_document_authentication_policy(id=1)` defaults `strong`. For the authorized profile the operator explicitly selects `mode='verified_account'` and publishes matching `SENSITIVE_DOCUMENT_AUTHENTICATION=verified_account`; the Worker never edits the row. Unknown values/mismatch deny access. Returning to `strong` coordinates both values and invalidates ordinary receipts for new confirmations without deleting history. Confirmation/SQL recheck current policy/identity, including old strong receipts. Deterministic identities remain test instruments, never connected proof.

Sources: `apps/api/src/auth.ts`, `personal-auth.ts`, `secure-distributions.ts`, `personal-documents.ts`, `secure-distribution-routes.ts`, `secure-storage.ts`; shared `packages/contracts/src/secure-distribution.ts`; web `apps/web/src/personal-*` and `secure-*`. Targeted tests: `tests/unit/personal-auth.test.ts`, `tests/unit/mcp-secure-distribution.test.ts`, `tests/integration/secure-approval-boundary.test.ts`, `tests/distribution-e2e/*.e2e.ts`. Commands, reports and framework limits are in the [e2e guide](../tests/distribution-e2e/README.md).

Test presence claims neither passing execution, exact-commit CI, service activation nor real assistant-host qualification. Local `verified_account` run `01a16ef7-4017-783f-80e7-80426686b572` on 24 October passes two desktop/phone results with ordinary synthetic sessions and no strong evidence; no real Auth0 login or communication. [Implementation](SECURE_DISTRIBUTION_IMPLEMENTATION.md) dates detailed evidence/limits. Local `strong` rerun `01a16efd-d3c7-7c1e-b6db-7d1c647da7f1` passes 14/14; final build and thirteen UI tests also pass. Exact CI/remote qualification remain separate.

## Recipient email response

The [recipient feedback lifecycle](EMAIL_RECIPIENT_FEEDBACK.md) adds unsubscribe/report receipts and a separate response status. An email refusal does not revoke the share, delete a copy or alter provider delivery evidence.
