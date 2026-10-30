# Operations and recovery

For the current PDF verification purchase candidate, follow the
[unit-pricing and release contract](PDF_VERIFICATION_PRICING.md),
[private validator qualification guide](../apps/pdf-validator/qualification/README.md)
and [Cloudflare cost model](PDF_VERIFICATION_COSTS.md). The local resource-qualified
candidate is one `standard-1` instance, five-second idle sleep and a pinned, tuned
JVM. Startup admission and in-flight responses are protected from idle expiry;
the Worker response is bounded even if the private transport ignores abort.
The local qualification bridge requires a fresh secret, rejects browser Origin
headers before any binding and never transfers its credential to Cloudflare.
Hosted cold large-file validation and actual stop/wake remain release gates.
The [3 October opening decision](PDF_VERIFICATION_OPENING_2026_10_03.md) and
[old activation instructions](PDF_VERIFICATION_ACTIVATION_RUNBOOK.md) are historical
subscription evidence. They do not enable new recurring charges. Current merge,
production publication and any real purchase require their own authority and proof.

## Environments and release

Local: `npm ci`, `npx playwright install chromium`, `npm run demo`. Uses local D1/R2/Queues through Wrangler and local Chromium. Linux fallback for this environment: `npm run browser:prepare`; browser-dependent tests use `GUTENEO_BUNDLED_CHROMIUM=1`. The bundled flags that disable web security/site isolation/single-process are explicitly removed. No remote Browser Run call occurs in local mode.

Staging/production: use separate reviewed configurations based on `wrangler.staging.json.example` / `wrangler.production.json.example`. `npm run deploy:plan -- staging` prints commands only. Never deploy the root local configuration. `node scripts/check-deployment.mjs path/to/reviewed.json` rejects placeholders, local endpoints, missing service bindings and initially enabled live sends. Verify D1 EU jurisdiction in the account after creation; an ID string cannot prove location. Set secrets via Wrangler secret, not committed vars.

The customer application uses **https://guteneo.com**. The reviewed candidate adds **https://belvedere.guteneo.com** only for the isolated, read-only platform host; see [BELVEDERE.md](BELVEDERE.md) for its separate Auth0 and hosted qualification. Publish with `wrangler.live.jsonc`, retaining `workers_dev: false` and `preview_urls: false`; the former application hostname and application version preview URLs must then remain closed. The fictional browser-only design preview is a separate Worker at **https://guteneo-preview.nclsppr.workers.dev**, with no business bindings. Its configuration and journeys remain separate; see [PUBLIC_PREVIEW.md](PUBLIC_PREVIEW.md).

On 10 October 2026, the user explicitly accepted closing the old application hostname without migrating the dormant SES SNS subscription: SES is unused, and fresh configuration/capability evidence must confirm that business email sending remains disabled before closure. Leave the existing SNS binding untouched. Its historical endpoint will be unavailable after closure; that accepted deferral is recorded in [SES_STATUS.md](SES_STATUS.md), without claiming an AWS migration. Before any future SES activation, migrate and qualify the canonical callback, authenticated confirmation, exact topic/signature version and preserved subscription attributes through [SES_SUBSCRIPTION_CONFIRMATION.md](SES_SUBSCRIPTION_CONFIRMATION.md). Missing AWS access does not block this closure while those disabled-email conditions hold; it still blocks that future SES qualification. Identity-provider transactional email is a separate configuration.

Follow [MAIN_RELEASE.md](MAIN_RELEASE.md): publish from clean, synchronized `main` after the exact merged commit passes CI. Verify the canonical release manifest and asset bytes with:

```sh
node scripts/verify-release.mjs https://guteneo.com dist/web/release.json
```

Record the deployed version and traffic, canonical health/capabilities and read-only public browser proof. Separately verify that the former application hostname and version preview URLs no longer serve Guteneo pages, manifest, API or authentication; retain the observed responses and Cloudflare configuration. Do not compare release asset bytes on a closed origin. No additional closure command is required: the reviewed Wrangler flags persist at publication. Dated two-origin evidence in [LIVE_RELEASE.md](LIVE_RELEASE.md) remains historical.

Customer browser login and its Auth0 callback use the canonical origin. The dedicated Belvédère host uses its exact separately allowed callback; each host retains its own host-only login cookie. Callback, logout and allowed-origin configuration must exclude the closed application hostname. Public page checks do not qualify a real human account, callback/session or reconnection; those require separate authorized browser proof. Keep public release checks away from `/auth/login` and business POST actions. EU D1/R2, queues and private scanning/rendering retain their existing boundaries; domain closure does not change roles or sending authority.

## Activation gates

- Auth0 region/tenant, first-party BFF and MCP third-party OAuth clients; explicit authentication policy (`verified_email` for the Auth0 Free beta, legacy admin MFA otherwise); signed verified-account evidence; scopes/audience/resource parameters; real refresh/revoke check.
- Qualified scanner binding, isolated document Worker, R2 private EU bucket; hostile-file limits proven in staging.
- Verified sender ownership, destination/country policy, exact provider costs and funding. The fax quote snapshot/resolver is implemented; actual qualified tariff rows and verified account identity are still absent, so hosted preparation remains closed. Other channels retain their production pricing gate.
- Telnyx originating number/application and public-key webhook; before future SES activation, SES region/IAM/configuration-set/SNS allowed topic and qualified canonical callback; Pingen OAuth organization/upload domains/return address and sandbox qualification.
- Callback routes qualified, DLQ handling, external monitoring/alert destinations, rate and document credits configured. Public onboarding needs Turnstile/account risk workflow before opening.
- Real client matrix and approved real send tests with exact recipient supplied. No test account implicitly authorizes postage or email.

## Incident actions

Queued/outbox aged >60s: inspect organization administration and outbox age. Cron republishes pending outbox in bounded batches. Duplicate publications are safe at conditional job claim. Never edit queued→prepared manually.

`submission_unknown`: leave reservation held. Freeze the relevant organization/channel, inspect provider attempt ID, client reference and provider facts. Poll known references only; callbacks can resolve orphans. Unknown fax/SES acceptance cannot be inferred from absence of a webhook. Do not press retry, change provider or switch channel. An intentional new send is a new reviewed command linked operationally to the original.

Queued cancellation uses a conditional transition and releases a reservation once. After submitting it is conservatively too late in the core. Provider cancellation APIs return requested/confirmed/too_late separately; real cancellation reconciliation is not automated by the dashboard yet.

Global emergency: disable consumers using reviewed Wrangler configuration; set `LIVE_SENDS_ENABLED=false`; organization admin can pause each channel. Never log keys, HTML, addresses, raw documents or access URLs. Technical logs carry correlation IDs/method/status/duration; audit events retain business actions.

Invalid callback signature: reject before receipt. Valid signature + D1 unavailable: return failure for supplier retry. Valid durable receipt with projection failure: leave pending and replay through reconciliation cron. Orphans stay for later reference binding. SNS SubscriptionConfirmation URLs are never followed automatically; use documented topic-checked operator procedure in PROVIDERS.md.

## Retention

Initial content retention90 days; active, prepared, submitting, unknown and nonterminal referenced documents remain. Cron processes25 metadata rows and50 R2 orphan candidates per run with durable cursors. It marks a tombstone before deleting R2, so an interrupted delete can retry. Orphans older24h are deleted. Metadata/audit retention still requires a approved operational policy before production; recipient/content fields in dispatch records are not claimed fully anonymized by this content purge.

Daily document limits are distinct from HTTP rate limiting and dispatch credits. Failed expensive attempts consume conservative daily allowance. After the configured identity policy has been satisfied (verified email and signed verified-account evidence for the Auth0 Free beta), new real organizations receive 10 imports / 20 MiB / 3 renders daily, with a one-time EUR50 promotional balance shared across channels and disabled provider channels. The balance never renews monthly; monthly channel limits are separate safety ceilings. Unknown supplier outcomes retain their ceiling and must not be refunded or retried without reconciliation. Top-up remains disabled. See WELCOME_CREDIT.md. Local simulated orgs:100 imports /100MiB /50renders daily;100 simulated sends per channel per month, explicit test ceilings. Tune via reviewed configuration, never frontend asserted org IDs.

## Backup and restore

Maintain independent encrypted backup of D1 export and original R2 bytes, separate account/credentials, manifest of document SHA256 and object keys, test expiration policy. Cloudflare D1 Time Travel is useful but not the independent backup. Independent remote export/copy and alerts are **not installed**; having Cloudflare access and Time Travel does not qualify those controls.

Secure distributions also require every retained shared/personal encrypted object, page/text object and R2 custom metadata, plus separately protected recovery of the versioned envelope key ring. Copying original PDFs or ciphertext bytes alone is insufficient. The local restoration rehearsal below does not qualify that hosted encrypted-object/key recovery procedure.

Before restoration: stop acceptance and all consumers; snapshot provider attempts/receipts and supplier facts separately. Restore into isolated resources; verify foreign keys, document hashes and ledger consistency. Reconcile every submitting/unknown/accepted command against supplier facts after backup timestamp. Do not release reservations or recreate a queue from statuses alone. Resume only after reviewed reconciliation; keep unknown items paused.

Choose the restore format explicitly. A [full D1 SQL export](https://developers.cloudflare.com/d1/best-practices/import-export-data/) contains schema and rows: import it into an empty isolated target, then inspect the restored migration ledger and apply only reviewed missing compatible migrations. Do not initialize that target with every migration before importing the same schema and its seed data. A data-only restore onto an already migrated schema needs a separately reviewed reconstruction with business triggers controlled so replay cannot reserve credit or synthesize events. Replace only identified migration seeds with their backed-up values, retain strict inserts for business rows, and verify exact counts and financial state; blanket `INSERT OR IGNORE` or generic upserts can conceal an incomplete restore. No hosted data-only reconstruction script is installed or qualified here.

Include `secure_document_authentication_policy` in the backup. Migration 0059's default `strong` is only initialization; restoration must retain the saved operator choice, including `verified_account`, and exactly one row with `id=1`. Verify agreement with `SENSITIVE_DOCUMENT_AUTHENTICATION` in the reviewed Worker configuration before reopening; disagreement must keep access closed. A [Time Travel restore](https://developers.cloudflare.com/d1/reference/time-travel/) replaces the database at its selected point in time; it does not justify replaying all migrations or treating a restored queue state as evidence that a physical send did not occur.

Executed local rehearsal is in RESTORE_PROOF.md: separate fresh D1+R2 restored exact PDF, held uncertainty and zero provider re-submissions. It does not qualify a production disaster-recovery process.

## Migration and rollback

Numbered SQL migrations are applied to the actual remote database and tracked in D1_MIGRATION.md; the migration transport verifier is part of CI. Future changes use expand/backfill/contract bounded migrations. Never edit an applied remote migration. Roll back Worker version only while schema stays backward compatible; prefer forward repair. A restore cannot safely roll back external physical events. CI validates code and dry-run only, contains no deployment key or automatic release step.
