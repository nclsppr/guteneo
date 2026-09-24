# Native iOS API v1

Local implementation candidate. Migration `0037_native_sessions.sql` and the API
must be released together before a distributed iOS application can connect.
No production migration, release, real communication or App Store publication
is implied by this document.

The native client uses SwiftUI, URLSession and PDFKit. Account authentication uses
the system `ASWebAuthenticationSession`; there is no embedded WebView. The HTML
application remains the final human review and send surface. The native client
cannot approve, confirm, transfer a postal PDF to a provider, enable expert
delegation, administer channels or access billing.

## Authentication

1. Generate a cryptographically random PKCE verifier of 43–128 RFC 7636
   characters and an independent state of 32–128 base64url characters.
2. Compute `BASE64URL(SHA256(verifier))` without padding.
3. Start `ASWebAuthenticationSession` at the canonical origin with
   `/auth/mobile/authorize?code_challenge=CHALLENGE&code_challenge_method=S256&state=STATE`.
   Use the `guteneo` callback scheme.
4. The server sends an unauthenticated user through the existing Auth0 browser
   login, preserving the exact mobile return path. A browser page explicitly
   asks to connect the app. Its POST requires the authenticated browser cookie,
   matching Origin and CSRF token. A GET does not issue a code.
5. The only return target is `guteneo://auth/callback?code=CODE&state=STATE`.
   Check scheme, host `auth`, path `/callback`, state and one nonempty code.
   The code expires after 60 seconds. No access token, cookie or PDF URL appears
   in the callback.
6. `POST /api/mobile/v1/session`, JSON `{ "code": CODE, "codeVerifier": VERIFIER }`.
   Response: `{ "token": TOKEN, "expiresAt": ISO_DATE, "session": SESSION }`.
   The code is atomically consumed with session creation; simultaneous or later
   replay fails. Incorrect PKCE cannot consume a valid client's code.
7. Store the opaque token only in the device Keychain. Subsequent requests use
   `Authorization: GuteneoNative TOKEN`. Disable URLSession cookies and caching.
   Native API requests must not contain Cookie or Origin headers. There is no
   static client secret, refresh token or native CSRF token.

SESSION is `{ organization: { id, name }, user: { id, name, role }, simulation,
verifiedAccount, mfa, expiresAt }`. Role is `admin`, `member` or `viewer`.
`GET /session` returns SESSION directly; the exchange wraps it in `session`.

Native session tokens are stored as SHA-256 hashes. Sessions live at most one
hour and never outlive the browser session that authorized them. Browser session
revocation deletes related native sessions/codes. Each native request rechecks
membership, role, organization mode, verification policy and browser expiry.
The domain actor is `native`, distinct from `browser`, `mcp` and `system`.
Native actors fail both human approval and final confirmation guards.

Login/exchange failures require a fresh system login. Never replay a write with
a new idempotency key after an uncertain result; reread its current state.

## Endpoints

All following paths are relative to `/api/mobile/v1`. Unknown paths are closed;
they do not fall through to browser or MCP authorization.

| Method | Path | Request / response |
| --- | --- | --- |
| GET | `/session` | SESSION |
| DELETE | `/session` | Revokes this native token; `{ signedOut: true }` |
| GET | `/capabilities` | `{ version: "1", mode, simulation, humanApproval: "authenticated_browser", nativeApproval: false, channels: [{ id, name, liveSending }], limits }` |
| GET | `/account` | SESSION plus `deletionRequestAvailable: true` |
| GET | `/documents?cursor=CURSOR&limit=30` | `{ items: Document[], nextCursor: string or null }` |
| POST | `/documents` | Multipart `file`; immutable PDF, at most 10 MiB; returns Document, HTTP 201 |
| GET | `/documents/:id` | Document |
| GET | `/documents/:id/content` | Authenticated PDF bytes, `X-Document-SHA256`, no-store; unavailable until ready |
| POST | `/documents/:id/rescan` | Restarts bounded analysis on the same original; Document |
| GET | `/senders` | `{ items: [{ id, channel, name, address, status, mode }] }` |
| GET | `/dispatches?cursor=CURSOR&limit=30` | `{ items: DispatchSummary[], nextCursor }`; summaries omit `html` and `text` |
| POST | `/dispatches` | PrepareInput, mandatory `Idempotency-Key`; Dispatch plus `approvalUrl`, HTTP 201 |
| GET | `/dispatches/:id` | `{ dispatch, events, attempts, approval, approvalUrl }` |
| POST | `/dispatches/:id/cancel` | Cancels only eligible prepared/queued work; Dispatch |
| POST | `/dispatches/:id/renew-quote` | `{}`; fresh fax quote and approvalUrl, HTTP 201; existing safe renewal invariants |
| POST | `/account/deletion-request` | `{ confirmed: true }`; persisted DeletionRequest, HTTP 202 |
| GET | `/account/deletion-request` | `{ request: DeletionRequest or null }` |

Document and Dispatch preserve the HTML client's JSON field names, including
`created_at`, `recipient_json`, `document_id`, `estimated_minor`, `ceiling_minor`,
`quote_expires_at`, `fingerprint` and optional `faxPricing`.
The dispatch list omits both email content fields so a page of valid 128 KiB
messages fits the native client's bounded JSON response budget. The individual
dispatch detail retains the complete exact `html` and `text` fields; selecting
an item fetches that detail before review. Pagination and all summary metadata
are preserved.
Document analysis is the shared `DocumentAnalysis` contract with
`state: processing | ready | retryable | blocked` and explicit `nextAction`.
Do not label all non-ready states as infected or automatically re-upload.

There is no native document deletion endpoint in v1 because the delivered app
does not expose that operation. The existing server retention path remains the
owner of document tombstones, R2 purge recovery and its durable purge audit. A
future in-app delete action must qualify immediate user audit, referenced-PDF
protection and interrupted R2 deletion recovery before exposing that authority.

PrepareInput is `{ channel, recipient, documentId?, subject?, html?, text?,
senderId?, options?, campaignId?, ceilingMinor? }`. The server never accepts a
tenant or user ID from this payload. Money is integer euro minor units, except
the existing explicitly named qualified fractional quote fields.

Recipient forms: fax `{ phone: "+…" }`; email `{ email }`; postal
`{ name, line1, postalCode, city, country }`. Supported destination countries
remain FR/LU/DE and the configured live route gates still apply.

Production postal preparation returns `POSTAL_BROWSER_REQUIRED`: the existing
browser journey must first review the exact address area and separately consent
to provider draft transfer. This app does not silently bypass those steps.
An `approvalUrl` is the canonical `/auth/mobile/review/ID` route. Open the user's
browser, then refresh the native detail on return. This dedicated page has no
dashboard navigation, funding links or top-up text. It displays the immutable
PDF, final email, destination, sender, options, quote expiry and bounded cost.
The existing browser session must approve the exact fingerprint, then separately
confirm sending; both POSTs require the browser's CSRF token and explicit checked
consent. Production email approval retains its recipient-request attestation.
Native credentials cannot authenticate this page. Never treat opening this URL
or returning to the app as approval or as delivery evidence.

`dispatch.faxPricing.executionScope === "review_prepare_only"` identifies a
non-sendable reference quote. This optional field is preserved on preparation,
list summaries, detail and renewal; there is no separate `quote_purpose` field.
For that scope `approvalUrl` opens consultation only: no approval or confirmation
control is rendered, and forged browser POSTs are refused before domain approval
or confirmation. The page explains that no amount is reserved or debited. An
expired, unattempted preparation may renew through the existing domain, which
preserves this restriction and refuses fallback to a live tariff. The native UI
must label the scope and must not present an approval/send invitation; omission
of this optional field retains historical behavior, subject to all other gates.
The shared fax presentation's credit labels and route notice are not native UI
copy; the app and its dedicated browser page use wording without funding or
top-up references.

The mobile capabilities projection omits billing, funding and top-up metadata.
There are no native routes for approvals, confirmation, expert delegation,
billing, customer portal, provider transfer or administration. Role, provider,
scan, quote and delivery gates are unchanged.

## Account deletion lifecycle

DeletionRequest is `{ id, status, createdAt, updatedAt, completedAt, message }`.
Status is `requested`, `processing` or `completed`. An explicit confirmed
request is unique per user, persists across sessions and can be reread in-app.
An HTTP 202 is a receipt, not completed erasure. The API neither deletes live
communications nor discards financial or immutable delivery evidence.

The completion process must resolve all memberships (including the last
administrator), in-flight or unknown delivery outcomes, legally retained records,
private R2 content, Auth0 identity and any provider retention. The stored
`processing_at`, `completed_at` and `processing_reference` fields support that
audited process. A completion confirmation must be sent by the authorized
operator before claiming completion to the user. No message is sent by the API.

**Submission gate:** a durable request button alone is insufficient evidence of
account deletion readiness. Qualify the operator completion procedure, truthful
published processing period, user confirmation and a complete test-account
erasure before App Store submission. This local change does not claim that this
operational qualification already happened.

## Validation and release boundary

Integration tests use disposable Miniflare D1/R2 and fictional PDFs. They cover
browser CSRF, one-use S256 exchange including concurrent replay, expired codes,
native/browser/MCP separation, revocation/expiry, tenant-isolated documents and
bytes, preparation idempotency, prohibited authority, separate browser review
and confirmation, no funding links, and persisted deletion receipt. Those tests
do not qualify Auth0 on an actual device, production PDF
scanning, a live provider, or App Store acceptance.

The implementation uses the existing Cloudflare binding APIs and transactional
batch semantics: [D1 batch](https://developers.cloudflare.com/d1/worker-api/d1-database/#batch),
[Workers best practices](https://developers.cloudflare.com/workers/best-practices/workers-best-practices/).
