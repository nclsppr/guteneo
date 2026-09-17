# Private Telnyx configuration inspection

## Canonical webhook audit — 17 September 2026

The Fax API application's saved webhook was changed, then reread after reloading the portal, to `https://guteneo.com/webhooks/telnyx`. Failover remains empty. Both the previous Workers address and the canonical address returned 405 for GET and 401 `WEBHOOK_REJECTED` for unsigned POST probes. These probes sent no fax and do not qualify a real signed callback. The outgoing adapter already supplies this canonical URL on each fax request; the old application callback did not explain a ChatGPT `SOURCE_NOT_ALLOWED` import refusal.

Current portal observations supersede the older concurrency observations below: the application is active with outbound channel limit **5**, and its active Default profile reports an account outbound concurrent limit of **10**. Luxembourg, France and Germany are selected, among 52 European countries plus US/Canada. The existing single National LU number is active and attached, T.38 is enabled, HD voice disabled, billing per minute. Neither application concurrency nor account concurrency was changed during this audit. Daily spend enforcement and Repeat Call Guard are disabled; ambiguous grey profile placeholders are not confirmed numerical limits.

## Initial Luxembourg operator test — migration 0025

The operator explicitly authorized Luxembourg tests without waiting for Telnyx's Local Calling response. This is recorded separately from provider qualification. Migration 0025 and the application support a private `route_qualification=operator_test` tariff with `local_calling_verified=0`, a nonempty immutable authorization reference, LU-to-LU fixed prefix **+3524**, at most 10 pages, at most seven days of validity, and an operator ceiling no higher than **EUR2 per fax**. Both the domain and the authoritative SQL quote view enforce that ceiling. Other prefixes, mobile and premium categories are not opened by this exception. A server-side operator must install the scoped tariff; no REST/MCP tool or account checkbox can grant this authority.

The reviewed installation must expire no later than the existing pilot's **24 September 2026 at 09:00:01.620 UTC**. The shared EUR50 promotional balance, per-channel quota, exact scanned PDF, human or bounded delegated approval, atomic reservations/outbox, one-attempt fencing and uncertain-outcome handling remain mandatory. `TELNYX_ALLOWED_PREFIXES` may include the country code `+352`; the immutable tariff then restricts the actual test to +3524. The current transport validator accepts country codes, not `+3524` directly.

The freshly reread profile-linked CSV has SHA-256 `ec4e3baeb5e26ba40024d99ffac022e95b22573cdbe6af008fb1c6193e0949c7`, 34,769,285 bytes and Last-Modified 8 September 2026. Its most-specific Local row for +3524 is USD0.022/minute, 60/60 seconds, plus the public fax reference USD0.007/page. This is an explicit pilot commercial estimate, not a successful route test or guaranteed final supplier invoice. Existing dated FX and conservative duration assumptions remain frozen in the quote. Any unqualified per-call or later supplier adjustments stay Guteneo's liability within the existing capped settlement model.

MCP, REST and the review page expose `routeQualification=operator_authorized_test` and a visible notice that Local Calling is unconfirmed and transmission may fail. The pending support discussion remains evidence of a question, not an affirmative answer. Enabling the route does not send a fax; a separately approved dispatch is still required.

The forward migration stages the old tariff rows, recreates the table under its original name and restores all old columns unchanged in one D1 batch with deferred foreign keys. Existing quotations retain their original hashes and incoming foreign keys. The new default retains the previous route policy. Synthetic populated-database tests cover old quotes/reservations, integrity, transaction rollback, immutable authority, revocation, bounds and actual MCP preparation. This documentation records implementation and evidence; it does not by itself claim the migration, tariff installation or real transmission has occurred.

## Luxembourg coverage extension — migration 0027 (candidate, not activation)

The operator requested the Luxembourg country code +352 rather than only the initial +3524 fixed prefix. Migration 0027 preserves the installed tariffs and immutable quotes, and permits separate LU operator-test tariffs for fixed, mobile, NGN and freephone destinations. It installs no tariff and sends nothing. Provider-qualified routes retain the existing fixed-only policy; the operator exception still records `local_calling_verified=0`. A country-wide generic Local price is not invented.

The profile-linked CSV was fetched again on 17 September with the same 34,769,285-byte content and SHA-256 `ec4e3baeb5e26ba40024d99ffac022e95b22573cdbe6af008fb1c6193e0949c7`. It contains exactly 42 distinct LU Local prefixes, all at 60/60-second intervals. The test fixture `tests/fixtures/telnyx-luxembourg-local.json` retains this public reference and is not an active production tariff.

| Local category | Prefixes (all begin +352) | USD/minute | Pilot maximum pages within EUR2 |
| --- | --- | ---: | ---: |
| Fixed | 22, 23, 24, 25, 26, 27, 28, 29, 3, 4, 5, 7, 802, 803, 804, 805, 806, 807, 808, 809, 81, 83, 84, 85, 86, 87, 88, 89, 908, 909, 92, 93, 94, 95, 97, 99 | 0.022 | 10 |
| NGN Service 1 | 20, 291, 801 | 0.044 | 7 |
| NGN Service 2 | 60 | 0.20 | 1 |
| Mobile | 6 | 0.08 | 4 |
| Freephone | 800 | 0 | 10 |

These page limits use the existing USD0.007/page reference, 30-second duration base, upper estimate of 180 seconds/page, FX10000/11537 and customer estimate rule. At the maximum page count, the minimum estimated ceilings are respectively 131, 177, 140, 186 and 13 cents; the next NGN1/NGN2/mobile page would require 201/246/228 cents and is not opened by this pilot. Freephone's SIP reference is zero, but the fax page component is not. A category's presence in a voice rate deck does not prove that any particular recipient can receive fax.

An immutable classification of the exact 42 observed prefix/category pairs governs runtime and SQL quote validity, independently of installed tariff rows. Unknown or misclassified operator-test prefixes are rejected by both runtime policy and the tariff SQL constraint. The longest known prefix must match the selected tariff even when its account-specific tariff is missing: +352291 takes precedence over +35229, and +35260 over +3526. A missing or revoked specific tariff blocks broader fallback, including approval of a previously prepared broad quote. A new qualified tariff at that same specific prefix may restore the route. No qualifying Local row exists for the generic +352 entry, +35212 or +352900–907; those remain explicitly unpriced/closed, with no substitution of EEA or generic rates.

The activation batch is an independent operator action after migration and release. It must preserve the existing +3524 row byte-for-byte, clone its tenant/sender/account/application/profile/FX, add only the other 41 priced prefixes, retain the shared EUR50 credit, and expire no later than 24 September 2026 09:00:01.620 UTC. The cap, scan, approval, quota, uncertain-outcome and settlement rules stay unchanged. No authority is granted by the MCP client.

## Fax pilot activation, 17 September 2026

The operator has explicitly requested real fax activation. The reviewed application configuration now opens the fax transport alone (`LIVE_SENDS_ENABLED=true`, `LIVE_SEND_CHANNELS=fax`). Email and postal transport remain closed even if their organization controls are enabled. This configuration is separate from the sender, route estimate, approval and funded reservation required for every dispatch; it does not prove successful fax delivery.

Private inspection now returns an `accountReference` derived from the canonical 32-byte Ed25519 verification public key, only after reading the configured application through its installed API credential. `telnyx-key-sha256:<digest>` is Guteneo's internal account namespace, **not a Telnyx-issued account UUID**. Authenticated application/number/profile observations establish the association; the hash alone does not establish ownership. The same reference must be installed as `TELNYX_ACCOUNT_ID` and recorded in tariff, quote and reconciliation evidence. A verification-key rotation requires a new namespace and qualification for future quotes; historical records must retain their original identity.

`inspectTelnyxReadiness({ apiKey, connectionId }, fetcher = fetch)` is a read-only provider client. It does not expose an HTTP route, read environment variables, enable sending, change an account or submit a communication. The caller supplies the existing key inside its private runtime; the result contains attached phone numbers and must stay private.

The only possible requests are GETs to the fixed `https://api.telnyx.com/v2` origin:

1. `/fax_applications/{configuredConnectionId}`.
2. `/phone_numbers` with `filter[connection_id]`, `page[number]` and `page[size]`.
3. `/outbound_voice_profiles/{profileIdReturnedByThatApplication}`, when present.

All IDs are validated digit strings and the application/profile IDs must match their requests. Every returned number is filtered again for the exact configured connection ID before projection. Provider-supplied pagination URLs are ignored. Pagination is capped at four pages of 100 rows; a cap, malformed metadata, repeated row or cross-connection record makes completeness false and returns a static error code. No account-wide listing fallback exists.

Each request rejects redirects, has an eight-second timeout, bounds the response body to 512 KiB and never retries. Errors contain only a local stage, a predefined code and optionally an HTTP status. Provider error bodies, error strings, callback URLs, names, customer references, PINs and credentials are not returned or logged.

The result reports the application's active flag, attached numbers/status/country and the documented T.38/HD-voice configuration flags. The phone-number listing schema has no generic `features` list; T.38 being enabled is not proof that a fax will succeed. The outbound profile projection includes enabled state, destination whitelist, concurrent limit, maximum destination rate, daily spend limit and its enabled flag. Explicit `null` concurrency means unlimited according to Telnyx; absent concurrency is `"unknown"`. Missing booleans and monetary configuration are `null`, never inferred as false or zero. The daily spend amount is a provider decimal string in USD; no conversion, tariff quote or customer-price computation occurs.

`status: "ok"` means the bounded inspection completed, not that the account is approved for production. An inactive application, empty number set, missing profile or unavailable fields remain visible. `liveSendingVerified` is always false. Identity, allowed destinations, supplier tariff qualification, human approval, funding and Guteneo's existing live-send gates remain independent.

## Official schemas checked on 17 September 2026

- [Retrieve a Fax Application](https://developers.telnyx.com/api-reference/programmable-fax-applications/retrieve-a-fax-application)
- [List phone numbers](https://developers.telnyx.com/api-reference/phone-number-configurations/list-phone-numbers)
- [Retrieve an outbound voice profile](https://developers.telnyx.com/api-reference/outbound-voice-profiles/retrieve-an-outbound-voice-profile)

## Local evidence

Eleven deterministic unit cases verify the fixed GET routes, projections, credentials confined to authorization headers, cross-connection filtering, bounded pagination, ID mismatches, malformed configuration, raw-error suppression, unknown/false/zero/unlimited distinctions, response size limits and malformed records. Typecheck and scoped lint pass. These tests use fictional fixtures and make no real Telnyx request; any actual inspection must be recorded separately by its private caller.

## Private operator invocation

The live Worker exports `ProviderInspection` as a named service entrypoint. It has no public inspection HTTP route: its `fetch` returns404. `node scripts/provider-readiness.mjs telnyx` uses Wrangler's authenticated same-account remote binding to that entrypoint and keeps the installed API key inside Cloudflare. The local helper configuration must never be deployed. The script exposes no application HTTP handler and prints only the bounded projection; Wrangler internally runs a temporary local proxy for the authenticated service binding.

`node scripts/provider-readiness.mjs ses` independently checks the installed sender's identity with AWS STS `GetCallerIdentity`. It must match the exact configured AWS account, sender IAM user and Paris region. No email is sent, no permission is widened and this identity check is not delivery qualification. Neither inspection accepts a URL, key, recipient or mutation argument.

## Private account observations — 2026-09-17

The installed credentials read the exact active fax application and its single active Luxembourg number; the sender was installed as `TELNYX_FROM` without publishing it in documentation. T.38 is enabled, HD voice disabled, and the application's outbound channel limit is one.

The current profile allows 54 country codes: US/CA plus 52 European destinations, including LU/FR/DE. Earlier in the session only US/CA were selected; the agent did not widen this list. A Luxembourg sender is therefore not limited to Luxembourg by the observed profile. The profile is enabled; concurrent limit is explicit null, maximum destination rate null, daily spend enforcement false. The unsupported daily-spend value remains null with a fixed field-name warning, rather than hiding independently verified destination restrictions or inventing an amount. The portal separately displays an account outbound concurrency cap of two. No live send or final account tariff is qualified by these observations.

The fax application's callback was corrected to `https://guteneo-app.nclsppr.workers.dev/webhooks/telnyx`; the portal confirmed the save. An unsigned probe returned 401 on the deployed backend. Exact configured POST callbacks can reach Ed25519 verification without Auth0; invalid signatures, stale timestamps and wrong application IDs remain rejected. The public design-preview origin cannot receive these notifications.

## Profile binding recorded — 17 September 2026

A fresh private inspection completed successfully with Wrangler 4.133.0. The exact outbound profile ID returned by the configured fax application was installed privately as `TELNYX_OUTBOUND_VOICE_PROFILE_ID`; no ID value is published here. This updated only Guteneo's binding, not the Telnyx profile, destination rules, rates or sending controls.

The configuration-only update created application version `258c95dd-8238-4a7b-beaa-751ba1d18d59` at 03:29 UTC, with source `118ce087` unchanged, 100% traffic and `/api/health` HTTP 200 with `liveSending:false`. It was later superseded by the application release `5b91ad3`; see [LIVE_RELEASE.md](LIVE_RELEASE.md). The binding closes one configuration prerequisite for fax v3; account/route tariff qualification, usage-cost correlation, human approval and a bounded real send remain unqualified.
