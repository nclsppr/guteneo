# Trusted live fax quotes

Implemented 2026-09-16; migration `0013_trusted_fax_quotes.sql`. This is server-side quote infrastructure with isolated automated proof. No production tariff, credits, sender, or communication was created by this work. Telnyx account tariffs and commercial terms remain unqualified; live fax preparation therefore remains closed in the deployed configuration.

A production fax can be prepared only when the runtime identifies the Telnyx account and Fax API application and an operator has supplied a currently qualified tariff for that exact organization, verified sender, account, application, normalized destination prefix and exact canonical options. There is no browser, assistant, or public API that can supply or edit a trusted price. Other production channels retain `LIVE_PRICING_REQUIRED`.

## Qualification and cost meaning

`trusted_fax_tariffs` stores immutable revisions: integer EUR minor-unit base/per-page amounts, maximum PDF pages, 30–900-second quote lifetime, validity dates, destination prefix, exact options, source reference and SHA-256 of the supporting qualification evidence. `cost_basis=qualified_upper_bound` means the operator has qualified the amount for the customer-facing reservation policy. It is **not** evidence that Telnyx guarantees that total or enforces a spending cap. Telnyx fax page pricing can exclude destination-dependent SIP duration, number rental and tax. The operator must document what the customer amount covers, who bears differences, and whether the actual supplier contract provides any cost guarantee. No advertised tariff or application ID alone establishes that qualification.

The source reference should identify a reviewed internal contract/tariff record, without credentials, document contents or a signed URL. Store the evidence in an appropriately restricted system, not in a public asset. Runtime account identity must be verified from the actual independent Guteneo provider account; do not invent an ID or reuse another project's credentials. All times are UTC ISO strings. The supported currency is EUR; no currency conversion is implemented.

Revisions cannot be edited or reactivated after revocation. Revoke the previous revision and insert a replacement transactionally. More-specific matching prefixes supersede broader prefixes and invalidate their prepared quotes, including conservatively when the narrower policy is not yet current. A missing, expired, revoked, differently scoped or unsupported-options policy fails closed. Existing approvals do not silently adopt a replacement price.

## Persisted approval and execution contract

Preparation resolves the tariff on the server and atomically persists a dispatch and immutable quote. The quote includes the normalized complete dispatch input, document ID/hash, sender ID/address, recipient, options, campaign, cost/ceiling/currency, organization, provider/account/application, source evidence and expiry. Its hash is included in the immutable dispatch fingerprint shown to the approval flow. Concurrent requests with the same idempotency key create one dispatch and one quote; a loser cannot leave a quote for an uncreated dispatch.

Application validation recomputes the input, quote and dispatch hashes and requires the configured provider identity to match. SQL guards independently recheck the current tariff and exact material inputs in the same transaction as preparation, human approval, acceptance/reservation/outbox and the queued-to-submitting claim. NULL or unexpected provider names fail the claim. Expiry, disabled or modified material dependencies, revocation and a more-specific policy invalidate the quote. Quotes cannot be edited; dispatches cannot switch quote fingerprints.

Approval still requires a current browser membership. MCP cannot self-approve. The approved ceiling must cover the qualified integer amount and cannot exceed 1,000,000 minor units. Acceptance continues to reserve the ceiling and create the outbox entry atomically; it does not collect a payment. An idempotent confirmation of an already queued dispatch returns that existing acceptance even if the quote has since expired, but preflight prevents a new supplier call with the expired quote and releases an unsubmitted reservation as failed. It never reopens or retries an unknown supplier outcome.

The domain checks the actual `ProviderHook.liveFaxIdentity`; the live bridge revalidates immediately before its fenced first invocation, after document loading/validation. A policy can still be revoked after the final database check while a network call is in progress: no local transaction can roll back an already accepted external fax. Unknown outcomes retain the existing no-automatic-retry rule. An operator must stop the channel and reconcile in-flight attempts when changing supplier policy.

## Runtime integration

`DomainService` accepts `liveFaxIdentity?: { accountId, connectionId }`; `ProviderHook` has the same optional field. The API constructs this only when `TELNYX_ACCOUNT_ID` and `TELNYX_CONNECTION_ID` are both configured. `validateLiveFaxQuote(db, dispatch, identity, nowISOString)` is exported for the final bridge preflight. The live bridge includes `quoteFingerprint` when reconstructing the frozen input. Missing identity or trusted rows never falls back to illustrative simulation pricing.

There is deliberately no tariff creation command or production seed in this change. Before activation: qualify the actual account identity and complete supplier/customer tariff policy, obtain an owned fax sender, enable only authorized destinations, fund an explicitly approved bounded quota, finish real identity/scanner/operational checks, and obtain authorization for a concrete test document and destination. Installing an API key alone does not authorize an external communication.

## Evidence

`tests/integration/trusted-fax-quotes.test.ts` uses real local D1/Workers SQLite with explicitly fictional EUR amounts and a nonexistent external account. It proves concurrent preparation/acceptance, one reservation/outbox, missing and changed account/application, unsupported destination/options, ceilings, immutable input/quote/tariff, expiry at approval/confirmation/preflight, SQL revocation guards, NULL provider, cross-organization rejection, and stable already-queued idempotency. Provider callbacks are never invoked in its failure tests; the valid path stops at queued.

`tests/unit/live-providers.test.ts` now creates fax commands through the actual quote preparation and approval path using isolated qualified tariff fixtures. Its external requests remain intercepted. Existing non-fax bridge fixture commands are still synthetic and do not imply a live postal/email quote resolver. Test totals are recorded in `TEST_RESULTS.md` after the final integrated run; automated local results are not live account qualification.
