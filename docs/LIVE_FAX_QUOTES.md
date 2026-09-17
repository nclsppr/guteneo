# Trusted live fax quotes

## Published fax v3 implementation: range, firm cap and verified usage

Published on 17 September 2026 from clean source `118ce087c3fe5a1ad63bd4c562adb8e26aa8af21`, **with live sending still disabled and no active fax v3 tariff**. Migration `0023_fax_usage_pricing.sql` was applied before deployment and adds immutable `trusted_fax_usage_tariffs`, `live_fax_quotes_v3` and `fax_usage_settlements`; all three tables were empty at verification. All 23 migrations are recorded remotely. Exact runtime, CI and public proof are in [LIVE_RELEASE.md](LIVE_RELEASE.md). This implementation replaces the requirement to know a future final Telnyx cost before preparing a v3 fax. Existing v2 quotations, prices and history retain their own contract.

A qualified v3 tariff binds the organization, verified fax sender, actual Telnyx account/application/outbound profile, normalized longest destination prefix, origin class, allowed route, source SHA-256/date, canonical options, page/minute/call components in nanoUSD and dated rational EUR/USD FX. More specific exclusions prevent broader routes from authorizing special numbers. The initial implementation limits a document to ten pages, fixed-number routes, qualified 60/60-second billing and a 30–900-second quote lifetime. A Luxembourg local route requires explicit Local Calling qualification. Nothing infers destination eligibility or a free surcharge from an empty rate-deck field. The actual evidence and unresolved provider semantics are in [TELNYX_RATE_QUALIFICATION.md](TELNYX_RATE_QUALIFICATION.md).

The quote freezes a low/high duration estimate, customer range in nanoEUR, and approved firm ceiling in EUR centimes. The range is an estimate; the cap is the customer’s binding maximum. The private commercial calculation uses twice the qualified usage cost converted at the frozen FX, bounded by that cap. Supplier costs above the customer cap remain Guteneo’s responsibility. Customer responses expose only the range, cap, public FX and customer settlement. Neither the internal multiplier nor supplier accounting is published.

Browser approval binds the complete immutable document, recipient, options and quote fingerprint. Confirmation atomically reserves the ceiling and creates the outbox. Supplier acceptance, final delivery and financial settlement are separate states. Accepted or delivered fax v3 commands retain their reservation until verified usage. Unknown submissions never retry automatically and cannot settle merely from an alleged cost. A known unsubmitted failure or cancellation releases its unused reserve. Historical v2 and email/postal settlement rules remain distinct.

The internal `settleFaxUsage(db, proof, now?)` operation accepts a typed `operator_reconciled_usage` proof, not a browser/MCP price. It binds organization, dispatch, existing terminal attempt/provider reference, exact quote, account/application, current administrator, observed date and evidence reference/hash. The proof and cumulative fractional charge are committed atomically; equal repeated proofs are idempotent and a conflicting proof is refused. A Telnyx signed callback containing pages/duration is not by itself a finalized supplier-cost proof. Automatic fax-record/cost correlation remains unqualified, so no automatic fetcher or public settlement route has been invented.

The public optional `faxPricing` projection is shared by REST, MCP and the dashboard. It separates `not_reserved`, `reserved`, `settled` and `released`. Final `customerNanoeur` is the verified consumption; `chargedMinor` is the change in the cumulative centime ledger, so a small positive consumption can produce a zero incremental debit. Null means unknown, not free. The dashboard preserves sub-cent precision, requires explicit approval of the cap, resets consent when the fingerprint changes, and can show accounting pending after delivery. This is beta credit consumption, not a payment or invoice.

Runtime v3 qualification additionally requires `TELNYX_OUTBOUND_VOICE_PROFILE_ID`; the existing account and connection bindings remain required. The initial `118ce087` publication installed no new provider binding, qualified production row or sender. At 03:29 UTC on 17 September, the profile ID returned by a fresh private read of the configured application was installed in Guteneo, without changing any Telnyx profile, destination rule or tariff. This configuration-only version was later superseded by `5b91ad3`; see [TELNYX_READINESS.md](TELNYX_READINESS.md). Tests use local D1 and invented provider identities, or intercepted browser/MCP fixtures. Completed integrated and public results are recorded in [TEST_RESULTS.md](TEST_RESULTS.md). Real account/sender and route qualification, a bounded authorized test, and verified outcome/cost evidence remain open. Publication and this binding do not qualify or activate the fax transport.

## Historical v2 fixed-price contract

The sections below describe the existing v2 implementation and its original evidence. References to unsupported SES pricing or missing fractional charging are historical: current SES/postal behavior is documented in [LIVE_DELIVERY_QUOTES.md](LIVE_DELIVERY_QUOTES.md) and [SES_TEXT_ONLY_QUOTE.md](SES_TEXT_ONLY_QUOTE.md). The final-cost prerequisite below applies to v2 only.

Initial infrastructure: migration `0013_trusted_fax_quotes.sql`. Exact supplier pricing v2: migration `0015_exact_supplier_fax_pricing.sql`, implemented locally on 2026-09-17. This is server-side quote infrastructure with isolated automated proof. No production tariff, credits, sender, or communication was created by this work. Telnyx account tariffs and commercial terms remain unqualified; this code does not establish a real supplier cost or activate sending.

A production fax can be prepared only when the runtime identifies the Telnyx account and Fax API application and an operator has supplied a currently qualified tariff for that exact organization, verified sender, account, application, normalized destination prefix and exact canonical options. There is no browser, assistant, or public API that can supply or edit a trusted price. Other production channels retain `LIVE_PRICING_REQUIRED`.

## Qualification and cost meaning

`trusted_fax_supplier_costs` stores immutable, operator-qualified final supplier cost revisions. The exact supplier amount in EUR cents is `(supplier_base_numerator + supplier_per_page_numerator × pages) / supplier_denominator`. Every input is a bounded integer, intermediate arithmetic uses `BigInt`, and the resulting supplier amount must be a whole cent. The customer amount is exactly **2 × that supplier amount**, bounded to 1,000,000 cents. The reservation ceiling is separate and does not change this customer price.

The supported policy is `guaranteed_final_supplier_total`, `fiscal_basis=tax_inclusive_totals`, `currency_basis=same_currency_no_fx`. Qualification evidence must establish a final supplier total, including applicable supplier charges and taxes, and the corresponding doubled final customer total. These amounts are both EUR; there is no exchange-rate assumption, net/gross substitution, extra surcharge or hidden per-send rounding. This basis is bound into the quote; it does not implement VAT calculation, invoice issuance or establish a net profit margin. Other fiscal or currency policies remain unsupported.

The operator must qualify that final cost **before** sending for the exact account, application, sender, destination and options. Telnyx's public page fee additionally charges SIP transmission; the public rate alone cannot establish a guaranteed final total. Variable duration, other supplier charges or taxes not covered by a binding exact-cost agreement keep preparation closed. Actual post-send supplier-cost reconciliation is not implemented. [Telnyx pricing](https://telnyx.com/pricing/fax).

Revisions also bind maximum PDF pages, 30–900-second quote lifetime, validity dates, source reference and SHA-256 of the supporting qualification evidence. The earlier `trusted_fax_tariffs` rows represent `qualified_upper_bound`, not exact supplier costs. Migration 0015 revokes their qualified status and prevents new qualification in that legacy table. It preserves every historical `live_fax_quotes` row and approval without changing prices or hashes. Only new `live_fax_quotes_v2` rows can satisfy approval, acceptance or preflight guards. Existing queued legacy commands fail before a new supplier invocation; unknown or already-submitted commands are never automatically retried or repriced. Repreparation and fresh human approval are required.

### Fractions of a cent

`FRACTIONAL_PRICING_UNSUPPORTED` rejects a rational supplier total that is not a whole EUR cent, even if doubling alone would produce a whole customer cent. No row, reservation or outbox is created. Rates may contain fractional coefficients when the complete document's supplier total is exactly representable. SES business preparation remains closed: its per-message and data charges require an exact fractional ledger, qualified currency/fiscal basis and aggregation before invoice rounding. Rounding each email to one cent would violate the ×2 rule. This aggregation and actual supplier account qualification remain explicit future work; SES resources or credentials do not supply a trusted email price. [AWS SES pricing](https://aws.amazon.com/ses/pricing/).

The source reference should identify a reviewed internal contract/tariff record, without credentials, document contents or a signed URL. Store the evidence in an appropriately restricted system, not in a public asset. Runtime account identity must be verified from the actual independent Guteneo provider account; do not invent an ID or reuse another project's credentials. All times are UTC ISO strings. The supported currency is EUR; no currency conversion is implemented.

Revisions cannot be edited or reactivated after revocation. Revoke the previous revision and insert a replacement transactionally. More-specific matching prefixes supersede broader prefixes and invalidate their prepared quotes, including conservatively when the narrower policy is not yet current. A missing, expired, revoked, differently scoped or unsupported-options policy fails closed. Existing approvals do not silently adopt a replacement price.

## Persisted approval and execution contract

Preparation resolves the tariff on the server and atomically persists a dispatch and immutable quote. The quote includes the normalized complete dispatch input, document ID/hash, sender ID/address, recipient, options, campaign, supplier amount/currency, customer amount/currency, ceiling, pricing version, ×2 rule, fiscal/currency/cost basis, organization, provider/account/application, source evidence and expiry. Its hash is included in the immutable dispatch fingerprint shown to the approval flow. Concurrent requests with the same idempotency key create one dispatch and one quote; a loser cannot leave a quote for an uncreated dispatch.

Application validation recomputes the input, quote and dispatch hashes and requires the configured provider identity to match. SQL guards independently recheck the current tariff and exact material inputs in the same transaction as preparation, human approval, acceptance/reservation/outbox and the queued-to-submitting claim. NULL or unexpected provider names fail the claim. Expiry, disabled or modified material dependencies, revocation and a more-specific policy invalidate the quote. Quotes cannot be edited; dispatches cannot switch quote fingerprints.

Approval still requires a current browser membership. MCP cannot self-approve. The approved ceiling must cover the qualified integer amount and cannot exceed 1,000,000 minor units. Acceptance continues to reserve the ceiling and create the outbox entry atomically; it does not collect a payment. An idempotent confirmation of an already queued dispatch returns that existing acceptance even if the quote has since expired, but preflight prevents a new supplier call with the expired quote and releases an unsubmitted reservation as failed. It never reopens or retries an unknown supplier outcome.

The domain checks the actual `ProviderHook.liveFaxIdentity`; the live bridge revalidates immediately before its fenced first invocation, after document loading/validation. A policy can still be revoked after the final database check while a network call is in progress: no local transaction can roll back an already accepted external fax. Unknown outcomes retain the existing no-automatic-retry rule. An operator must stop the channel and reconcile in-flight attempts when changing supplier policy.

## Runtime integration

`DomainService` accepts `liveFaxIdentity?: { accountId, connectionId }`; `ProviderHook` has the same optional field. The API constructs this only when `TELNYX_ACCOUNT_ID` and `TELNYX_CONNECTION_ID` are both configured. `validateLiveFaxQuote(db, dispatch, identity, nowISOString)` is exported for the final bridge preflight. The live bridge includes `quoteFingerprint` when reconstructing the frozen input. Missing identity or trusted rows never falls back to illustrative simulation pricing.

There is deliberately no tariff creation command or production seed in this change. Before activation: qualify the actual account identity and complete supplier/customer tariff policy, obtain an owned fax sender, enable only authorized destinations, fund an explicitly approved bounded quota, finish real identity/scanner/operational checks, and obtain authorization for a concrete test document and destination. Installing an API key alone does not authorize an external communication.

## Evidence

`tests/integration/trusted-fax-quotes.test.ts` uses real local D1/Workers SQLite with explicitly fictional EUR amounts and a nonexistent external account. It proves concurrent preparation/acceptance, one reservation/outbox, missing and changed account/application, unsupported destination/options, ceilings, immutable input/quote/tariff, expiry at approval/confirmation/preflight, SQL revocation guards, NULL provider, cross-organization rejection, and stable already-queued idempotency. Provider callbacks are never invoked in its failure tests; the valid path stops at queued.

`tests/unit/live-providers.test.ts` now creates fax commands through the actual quote preparation and approval path using isolated qualified tariff fixtures. Its external requests remain intercepted. Existing non-fax bridge fixture commands are still synthetic and do not imply a live postal/email quote resolver. Test totals are recorded in `TEST_RESULTS.md` after the final integrated run; automated local results are not live account qualification.

The v2 tests additionally check exact doubling, rational fractions and overflow refusal, supplier/fiscal/currency material in the hash, and a populated pre-v2 migration using original SQL approval/acceptance guards. Historical quotes remain byte-for-byte unchanged while legacy approval/acceptance/claim fail and an unsubmitted queued reservation is released without a supplier call. No new qualified supplier costs are inserted by the migration. `tests/unit/exact-fax-pricing.test.ts` uses only synthetic amounts.

## Customer quote presentation (17 September 2026)

Fax v3 already returns the estimated low/high range. Its compatibility field
`estimated_minor` (REST) / `estimatedMinor` (MCP) is **the high estimate rounded up
to a whole EUR cent**, not a fixed price or a debit. Presenting that field first as
“the quote” and then repeating the range is ambiguous. Current ChatGPT observation
included both 17 cents and the range; the range was not missing from the response.

`faxPricing.display` supplies the preferred presentation for REST, MCP summaries,
and expert review. Present `estimate.label` and `estimate.creditLabel`, then the
separate `ceiling` labels and `explanation`. `creditUnit=EUR_balance` means the
existing monetary credit balance, not a new token conversion. `lowEur` and
`highEur` are exact decimal strings retaining all nine nanoEUR decimal places;
labels round to four decimal places and say “Environ”. Tiny positive amounts that
would round to zero retain their exact precision. These strings are derived
read-only and never enter tariff, fingerprint, reservation or settlement arithmetic.

For the observed range 50,273,036–164,687,528 nanoEUR, presentation is
“Environ 0,0503 à 0,1647 € HT”, with the same amount in euros of credit. The exact
values are `0.050273036` and `0.164687528`. The historical integer remains 17;
a separate 200-cent ceiling is “2,00 €”, reserved only at confirmation. The range
is for the whole fax, including its estimated transmission. Actual duration is
not guaranteed; final consumption may differ within the approved firm ceiling.
Delivery and settlement remain separate, and `settlement` remains authoritative
for current reservation/charge state. No tariff, commercial multiplier, authority
or billing behavior changes with this presentation.

Public copy audit on 17 September: the canonical homepage HTML and public source
contain no promise of a complete fax for EUR0.007/page. The previously published
homepage described an
illustrative EEA-to-Luxembourg route (EUR0.03–0.12, one page, 1–3 minutes), different
from the local LU-to-LU quote above. This correction aligns the public example
with the configured Luxembourg sender: about EUR0.05–0.17 for one page to a fixed
Luxembourg number, estimated 1–4 billed minutes (the 60–210 second duration
assumptions are rounded to whole 60-second billing increments). It explicitly
remains a variable-cost
example, not a guaranteed ceiling; the operational quote governs each send. The
existing dated FX and other channels are unchanged. [Telnyx's public fax price](https://telnyx.com/pricing/fax)
is USD0.007/page **plus SIP transmission usage**; it is not an all-inclusive EUR
customer price. Provider charges and commercial accounting remain private.

Verification: official in-memory MCP transport exercises preparation, status and
list responses across all four settlement states, plus strict OpenAPI validation,
exact observed amounts, unchanged legacy 17-cent field and 200-cent cap, tiny
positive estimates, zero, no supplier-accounting leak and text/structured parity.
The D1 domain fixture verifies the same display projection from an immutable
quote. These are synthetic tests, not another real fax or live assistant run.
