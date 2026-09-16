# Operations and recovery

## Environments and release

Local: `npm ci`, `npx playwright install chromium`, `npm run demo`. Uses local D1/R2/Queues through Wrangler and local Chromium. Linux fallback for this environment: `npm run browser:prepare`; browser-dependent tests use `GUTENEO_BUNDLED_CHROMIUM=1`. The bundled flags that disable web security/site isolation/single-process are explicitly removed. No remote Browser Run call occurs in local mode.

Staging/production: use separate reviewed configurations based on `wrangler.staging.json.example` / `wrangler.production.json.example`. `npm run deploy:plan -- staging` prints commands only. Never deploy the root local configuration. `node scripts/check-deployment.mjs path/to/reviewed.json` rejects placeholders, local endpoints, missing service bindings and initially enabled live sends. Verify D1 EU jurisdiction in the account after creation; an ID string cannot prove location. Set secrets via Wrangler secret, not committed vars.

The user authorized and received the public design preview at guteneo.com and a separate production-mode backend at guteneo-app.nclsppr.workers.dev. Use the actual `wrangler.live.jsonc` for that backend; root-domain migration awaits verified managed login. EU D1/R2, queues, private scanning/rendering and Telnyx credentials exist. See LIVE_RELEASE.md for exact release identities and remaining activation gates.

## Activation gates

- Auth0 region/tenant, first-party BFF and MCP third-party OAuth clients; admin MFA; scopes/audience/resource parameters; real refresh/revoke check.
- Qualified scanner binding, isolated document Worker, R2 private EU bucket; hostile-file limits proven in staging.
- Verified sender ownership, destination/country policy, exact provider costs and funding. The fax quote snapshot/resolver is implemented; actual qualified tariff rows and verified account identity are still absent, so hosted preparation remains closed. Other channels retain their production pricing gate.
- Telnyx originating number/application and public-key webhook; SES region/IAM/configuration-set/SNS allowed topic; Pingen OAuth organization/upload domains/return address and sandbox qualification.
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

Daily document limits are distinct from HTTP rate limiting and dispatch credits. Failed expensive attempts consume conservative daily allowance. After verified identity and MFA, new real organizations receive 10 imports / 20 MiB / 3 renders daily, with zero sending credits and disabled channels. Local simulated orgs:100 imports /100MiB /50renders daily;100 simulated sends per channel per month, explicit test ceilings. Tune via reviewed configuration, never frontend asserted org IDs.

## Backup and restore

Maintain independent encrypted backup of D1 export and original R2 bytes, separate account/credentials, manifest of document SHA256 and object keys, test expiration policy. Cloudflare D1 Time Travel is useful but not the independent backup. Independent remote export/copy and alerts are **not installed**; having Cloudflare access and Time Travel does not qualify those controls.

Before restoration: stop acceptance and all consumers; snapshot provider attempts/receipts and supplier facts separately. Restore into isolated resources; apply compatible migrations; verify foreign keys, documents hashes and ledger consistency. Reconcile every submitting/unknown/accepted command against supplier facts after backup timestamp. Do not release reservations or recreate a queue from statuses alone. Resume only after reviewed reconciliation; keep unknown items paused.

Executed local rehearsal is in RESTORE_PROOF.md: separate fresh D1+R2 restored exact PDF, held uncertainty and zero provider re-submissions. It does not qualify a production disaster-recovery process.

## Migration and rollback

Numbered SQL migrations are applied to the actual remote database and tracked in D1_MIGRATION.md; the migration transport verifier is part of CI. Future changes use expand/backfill/contract bounded migrations. Never edit an applied remote migration. Roll back Worker version only while schema stays backward compatible; prefer forward repair. A restore cannot safely roll back external physical events. CI validates code and dry-run only, contains no deployment key or automatic release step.
