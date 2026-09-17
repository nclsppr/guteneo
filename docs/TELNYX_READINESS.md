# Private Telnyx configuration inspection

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
