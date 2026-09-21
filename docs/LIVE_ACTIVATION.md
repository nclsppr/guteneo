# Live adapter bridge and activation boundary

Candidat du 21 septembre 2026 : envoi Resend sans document, avec PDF, ou par lien protégé à 1 € par document hébergé. Même contrat REST/MCP, mot de passe navigateur uniquement, acceptation atomique et facturation unique. Voir [PROTECTED_EMAIL.md](PROTECTED_EMAIL.md) pour le contrat courant et [RESEND_PROOF.md](RESEND_PROOF.md) pour la preuve de publication. Les sections datées antérieures restent historiques.

The real Telnyx, Amazon SES and Pingen clients are connected to a `ProviderHook` adapter in `apps/api/src/live-providers.ts`. This is executable integration code, not an authorization to send. **Real fax preparation requires qualified account-specific quote snapshots.** Migration 0013 introduced the historical fixed-price resolver; migration 0023 now adds the published fax v3 estimate, approved cap and separately verified usage settlement. No active production tariff or verified Guteneo sender has been installed, and live sending remains closed for all channels. Credentials or `LIVE_SENDS_ENABLED=true` cannot replace a trusted quote. See [LIVE_FAX_QUOTES.md](LIVE_FAX_QUOTES.md) and [LIVE_RELEASE.md](LIVE_RELEASE.md) for current deployment and separate provider qualification evidence.

No real provider calls, document transfers, paid resources or physical deliveries were made while implementing this bridge. The tests use Cloudflare D1/R2 emulation and intercepted provider requests.

## Integration surface

```ts
createLiveProviderHook(env, channel, { fetcher?, now? }): ProviderHook
serveProviderMedia(env, request, opaqueToken, { now? }): Promise<Response>
preparePostalDraft(env, domain, actorContext, input, { fetcher?, now? })
```

Apply all migrations, including `0007_live_drafts.sql`. The API queue consumer passes the selected live hook to `DomainService.processDispatch` only in production mode with explicit activation; it does not call provider clients directly or recreate a dispatch after a failed attempt. The media handler is wired to `GET /media/:token` outside browser-session middleware; possession of the scoped opaque token is its authorization. Route integration and environment types live in the API entry point. The separate DLQ consumer durably records exhausted messages without replaying them.

The bridge independently verifies production mode, an allowed deployed environment, explicit live activation, an HTTPS application origin, a persisted active attempt, matching historical approval, a reserved ceiling, enabled channel and the original verified sender. It recomputes the frozen fingerprint. It reads R2 and compares the actual bytes with immutable size/hash and a matching `document.scan_verified` audit record. This repeats critical checks immediately before handing content to a provider.

`attempts.bridge_claimed_at` is a conditional one-time claim. Concurrent calls cannot both invoke transport for that attempt. Repeated claimed attempts return `submission_unknown`; uncertainty is never treated as permission to spend again. Exceptions after a provider call starts remain uncertain. This is not a universal exactly-once guarantee and does not supersede provider reconciliation after a crash or restoration.

## Required configuration

All values below must refer to the intended environment and be supplied through secret/configuration management. No real resource identifiers are included in examples.

| Setting                                                                    | Requirement                                                                                                    |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `ENVIRONMENT`                                                              | `staging` or `production`; local live use is rejected.                                                         |
| `MODE`                                                                     | `production`; simulation records cannot reach live providers.                                                  |
| `LIVE_SENDS_ENABLED`                                                       | Exactly `true`, only following authorization and qualification; otherwise blocked.                             |
| `APP_ORIGIN`                                                               | HTTPS origin with no path, URL credentials, query or fragment.                                                 |
| `TELNYX_API_KEY`, `TELNYX_CONNECTION_ID`, `TELNYX_FROM`                    | Authorized fax application and emitter; emitter must equal the frozen verified sender.                         |
| `TELNYX_ALLOWED_PREFIXES`                                                  | Explicit comma-separated subset of `+33,+352,+49`; actual country enablement must first be qualified.          |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, optional `AWS_SESSION_TOKEN` | Restricted SES identity; see provider documentation for account/IAM prerequisites.                             |
| `AWS_REGION`, `SES_CONFIGURATION_SET`                                      | Qualified EU region and event configuration; the bridge does not infer account readiness.                      |
| `SES_SANDBOX`                                                              | Must reflect the actual AWS account: explicit `true` or `false`. Sandbox sends are real emails and require an exact recipient in `SES_VERIFIED_RECIPIENTS`, including on the production-mode application. Never change this flag to bypass AWS review. |
| `SES_ACCOUNT_ID`, `SES_SNS_TOPIC_ARN`, `SES_VERIFIED_RECIPIENTS`             | Qualified AWS account and matching EU-region SNS topic. In sandbox, recipients must be individually verified and explicitly listed with their exact casing; no wildcard or case normalization grants access. |
| `PINGEN_CLIENT_ID`, `PINGEN_CLIENT_SECRET`, `PINGEN_ORGANIZATION_ID`       | Independent Pingen account with agreed data processing and postal coverage.                                    |
| `PINGEN_SANDBOX`                                                           | Explicit `true` or `false`; sandbox mode is forbidden in production.                                           |
| `PINGEN_UPLOAD_ORIGINS`                                                    | Exact comma-separated HTTPS origins from the qualified provider upload contract. No wildcard or arbitrary URL. |

Webhook keys, topic/account checks, scanner bindings, identity settings, channel limits and deployment approval remain required separately. Do not treat a configured secret as evidence that those prerequisites passed.

The SES transport policy above is implemented by `sesTransportSandbox` and the shared account/region limiter. A verified recipient permits a bounded test while AWS reviews production access; it does not open email to arbitrary recipients or bypass quotes, human approval, funding, the application send gate or the configuration-set send gate. See [SES_STATUS.md](SES_STATUS.md) and [SES_SEND_LIMITS.md](SES_SEND_LIMITS.md) for the separately observed account state and quota proof.

## Telnyx PDF access

For an authorized active attempt, the bridge creates a random 256-bit capability expiring after **45 minutes**. Only its SHA-256 is stored. The grant binds organization, immutable document/hash, dispatch, provider and active attempt. The handler accepts no document ID from the requester and returns only the exact validated PDF with `private, no-store`, `no-referrer` and `nosniff` headers.

The handler checks the grant's expiry and joins its active attempt to the dispatch. It permits `submitting`, `submission_unknown` and `accepted`; terminal or revoked states deny access. Changed bytes, removed scan evidence, a purged document, disabled live mode, unsupported HTTP method or an invalid token receive the same 404 response. Multiple legitimate reads inside the validity window are allowed because provider fetch behavior is not assumed single-use.

The application logger omits request URLs. Before activation, ensure Cloudflare request logs, traces, analytics, exception capture and downstream logging also exclude these capability paths and provider request bodies. The bridge never logs a capability URL. Cron deletes expired grants in indexed batches of 100. The 45-minute allowance must be tested against actual provider fetch latency; expiration never authorizes a blind fax retry.

## SES frozen email

The hook sends one recipient per dispatch using the original sender, subject, HTML and text. With the current domain model, there is zero or one PDF attachment, loaded from the same immutable document store. The underlying provider contract supports an array for later expansion. It does not add recipients, rewrite content, add tracking or silently change purpose.

Marketing remains blocked by both the domain and this bridge until the unsubscribe/suppression/reputation workflow is qualified. Transactional suppressions are rechecked by organization immediately before submission. SES API acceptance remains acceptance, not reading or delivery; callbacks supply later facts.

## Pingen preparation occurs before dispatch approval

Pingen reads the address printed in the exact original PDF. A missing or incorrect address requires an explicitly regenerated document or corrected recipient followed by a new approval. The bridge never overlays an address, recreates an original or uploads a replacement after approval.

`preparePostalDraft` requires an authenticated, authorized **browser** actor and the live-transfer gate. A future route/UI must announce that this action transfers the reviewed document to Pingen even though it does not send it, and enforce the existing browser CSRF protections. MCP cannot approve this transfer with a boolean. This action has not been exposed as a self-approving assistant tool.

Inputs include `documentId`, `senderId`, the normalized recipient, `ceilingMinor`, an organization-scoped idempotency key and all four explicit print settings: `addressPosition`, `deliveryProduct`, `printMode`, `printSpectrum`. The document is scanned and verified before the provider receives exact bytes. Pingen draft creation uses `auto_send=false`.

The database records a `preparing` draft before the external call and then persists its provider ID/status. A lost response or failed persistence becomes `unknown`; the same key blocks automatic re-creation pending reconciliation. A reused key with different content is a conflict. The draft table fixes organization, document/hash, sender, recipient, expected printed address, print settings and ceiling.

Only returned and persisted values can subsequently appear in approved dispatch options:

```ts
options: {
  (addressPosition,
    deliveryProduct,
    printMode,
    printSpectrum,
    providerDraftId,
    preparedLetterId,
    expectedAddress);
}
```

At submission the bridge matches these values against the tenant-bound draft, immutable document, approved recipient and ceiling. A model-supplied provider letter ID alone is insufficient. One draft can be claimed by only one dispatch. Re-expedition requires a new authorized command and a new draft. The provider client rereads Pingen's parsed address/country and readiness, obtains a price, enforces the approved EUR ceiling and only then calls its documented send action.

The bridge does not yet verify the PDF's return address or envelope window through a provider preview. That is a qualification and UI-preflight requirement. Pingen-side orphan-draft cleanup, document retention and reconciliation of unknown draft creation must be completed against the contracted account before activation; do not delete or resend uncertain physical jobs automatically.

## Executed evidence

The original bridge validation on 2026-09-16 passed **14 tests** against real local D1/R2. They exercise gate rejection with no external request; real approval/reservation/outbox SQL before transport; Telnyx request fields and capability serving/expiry; missing scan and changed-byte rejection; sender and in-memory payload tampering; concurrent one-time claims and retained uncertain reservations; SES individual destination and exact attachment bytes; Pingen persisted non-sending draft, idempotent replay, matching submission, reused-draft rejection, and rejection of forged IDs/changed options/recipient. A test explicitly proves that normal production preparation still fails with `LIVE_PRICING_REQUIRED`.

Test dispatches and scan records are synthetic fixture data. Fixture setup inserts a prepared production-mode row because the live-pricing gate is intentionally closed; this bypass exists only in the test fixture. It does not demonstrate an approved live tariff flow or a real scanner verdict. Provider HTTP requests are intercepted in every test. No live account, fax, SES sandbox message or Pingen sandbox letter was tested.

Full-project type checking and targeted linting are recorded with central validation. Remaining release blocks: authorized account access and costs, verified tariff resolution, qualified scanner and identity, live client file-transfer/authentication tests, provider country/sender/concurrency qualification, live callbacks and reconciliation, privacy/retention/return-address checks, infrastructure observability redaction, staging evidence and explicit production approval. Existing provider contracts and official-source verification are documented in [PROVIDERS.md](PROVIDERS.md) and [VERIFICATION.md](VERIFICATION.md).

The v0.2 continuation now constructs intercepted fax fixtures through the real qualified-tariff → immutable quote → browser approval → queued path. Expiry is rechecked after asynchronous media preparation immediately before the external call. Final counts and the rescan-to-live-preflight regression are recorded in TEST_RESULTS.md; these remain controlled fixtures, not a real fax.
