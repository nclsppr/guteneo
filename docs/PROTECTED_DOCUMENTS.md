# Protected PDF delivery

Email can contain an approved plain message, the original PDF attachment, or a link to the original PDF behind a generated password. Protected delivery preserves the immutable document ID and SHA-256 in the approval and quote while attaching zero bytes to the email. The email includes the link and asks the recipient to obtain the password separately. The password is never part of the dispatch, options, approval summary, provider submission, or MCP response.

The sender chooses 1, 7 (default), or 30 days. The exact expiration starts at preparation and is included in the approved descriptor. Hosting costs 100 EUR cents once per organization and immutable document during that hosting term; email transport is quoted separately in the same approved total. Reusing an active term costs no additional hosting fee. Expired or revoked terms require a new preparation and hosting charge. The hosting service is activated and charged atomically with the first approved queue acceptance, including credit and monthly quota checks. Email cancellation, rejection, or transport refund does not refund the already activated hosting service. Concurrent approvals cannot charge the same hosting term twice.

The service uses private R2 storage. Only an authenticated browser member with write authority can reveal the generated password or revoke the link. Password reveal requires the existing browser CSRF protection. The password contains 144 random bits; a salted PBKDF2 verifier supports anonymous unlock, and AES-GCM protects the token/password recovery material at rest using `PROTECTED_DOCUMENTS_KEY`. This secret must decode to 32 random bytes. No real secret belongs in a file or proof report.

The public page needs no Guteneo account or payment. A GET from an email scanner does not consume the link. A correct password creates a 15-minute HttpOnly, Secure, SameSite=Strict session restricted to the link path; each download checks the active paid hosting, document status, scan proof, exact size and hash. Inline viewing uses the same checks and a sandboxed PDF response. Responses use no-store, no-referrer and noindex headers. Guess limits apply to each link and hashed IP window. Revocation invalidates existing sessions. Expiration clears the encrypted recovery material; public access also checks the deadline immediately, independently of scheduled cleanup. Active hosting terms prevent the existing document purge from deleting their PDF.

## Recipient route and recovery

`/share/{token}`, `/share/{token}/unlock` and `/share/{token}/content` belong to
the protected-document handler. The shared private-prefix registry excludes
`/share` from Static Assets and public-error rendering; production routes these
requests through the application Worker first, and local Wrangler includes the
same prefix in its worker-first routes. A valid existing link therefore retains
its original URL and hosting record when routing is corrected. It is never a
public asset, sitemap entry or an authentication redirect.

The handler owns missing, expired and revoked states as well as unlock, session,
origin and content checks. Invalid access stays unavailable with private headers;
a routing fix does not relax password or exact-byte verification. A recipient
can select a page language, but that choice does not establish identity, create
workspace membership or change authorization. New invitation language is
specified by the [email preparation contract](PROTECTED_EMAIL.md).

Administrator, Supervisor and Operator members with current preparation authority
and source access may reveal the password or revoke through the authenticated,
CSRF-protected browser. Observers and connected assistants cannot use these
controls. Existing native, REST and MCP preparation/tracking do not acquire a
password endpoint; recipients only use the bounded link/password session.

For a generic site 404 on an otherwise valid link, check the production Worker
and private route registry before creating or sending another dispatch. Preserve
the original hosting and send state; do not retry an uncertain provider outcome.
`tests/security/public-assets.test.mjs` exercises the actual production entry
with Static Assets, alongside the protected-document integration tests. Local
routing evidence does not establish a successful hosted unlock or PDF download.

## Prepare-only reviewer accounts

Migration `0041_prepare_only_accounts.sql` adds an operator-controlled identity restriction. It is matched by the exact OIDC issuer and subject, independent of display names, email addresses, OAuth client IDs, tenant names or membership roles. The identity can be restricted before its first login; the later `auth_identities` binding makes the restriction effective. The public API, browser dashboard and MCP expose no operation that creates, removes or relaxes it.

Before giving out any prepare-only reviewer credentials, the operator must apply migration 0041 and persist that account's exact issuer/subject with policy `prepare_only` in `restricted_delivery_identities`. Obtain those identifiers from the operator-owned identity provisioning result; never copy credentials or private identity identifiers into the repository, release notes or test fixtures. This step is required for every future reviewer account, including replacement accounts, before activating transport or sharing its credentials. Creating an Auth0 user alone does not establish the Guteneo restriction.

The email setup helper may create the verified sender and dated tariff needed for preparation but does not enable the channel for a restricted identity. More importantly, the database rejects every prepared-to-queued transition approved by that identity, for every channel and for browser or delegated expert approvals. This guard still applies if an administrator later enables the channel. Its rejection rolls back hosting activation, credit and monthly reservations, expert acceptance accounting and outbox insertion. A different unrestricted human in the same organization keeps their own authority; an identity restriction is not inferred from organization membership.

Local integration evidence is in `tests/integration/protected-documents.test.ts`, `tests/integration/email-setup.test.ts`, and `tests/integration/resend-email.test.ts`. These tests use synthetic identities, local D1/R2 and intercepted provider transport. They do not prove production delivery or send real email.
