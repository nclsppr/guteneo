# Telnyx rate qualification and proposed fax pricing v3

**Historical implementation status — initial release on 17 September 2026:** the proposal below was implemented and published in release `118ce087c3fe5a1ad63bd4c562adb8e26aa8af21`, after migration 0023. At that release, no active v3 tariff had been installed and live sending remained disabled. Later pilot activation and current routing evidence are recorded in [TELNYX_READINESS.md](TELNYX_READINESS.md). Publication or tariff activation does not qualify successful transmission or usage-record correlation. See also [LIVE_FAX_QUOTES.md](LIVE_FAX_QUOTES.md) and [LIVE_RELEASE.md](LIVE_RELEASE.md). The dated inspection and proposal below are retained as historical evidence; their original status describes that inspection.

Observed and reviewed **2026-09-17**. Status: **read-only account evidence and implementation proposal; no active v3 tariff or runtime change**. The inspection covered only the authorized Guteneo Telnyx account. No key, number, purchase, account setting, call or fax was created or changed. This note does not qualify successful transmission or authorize activation.

The current [fax v2 contract](LIVE_FAX_QUOTES.md) requires a guaranteed final supplier total before preparation. Standard Telnyx fax combines a page charge with transmission duration, so that contract cannot model the observed rate deck faithfully. The proposed v3 prepares from a qualified, dated tariff and an explicit duration estimate, reserves a firm customer ceiling, then reconciles usage after transmission. **A future supplier invoice is not a prerequisite for preparing the estimate.**

## 1. Evidence and its limits

| Evidence | What it establishes | What it does not establish |
| --- | --- | --- |
| Telnyx portal, Guteneo Fax API application and its assigned outbound profile | Current displayed association, destination permissions and selected controls | A successful call, complete persisted values behind ambiguous placeholders, or final billing |
| Exact CSV linked by that profile's **View rates** action | The rate deck presented for this account/profile at inspection time | A separately negotiated fax page fee, future prices, taxes, or the final duration/cost of a fax |
| Official public fax price | A dated published reference for page pricing and separate SIP usage | An account-specific negotiated price or an all-inclusive customer quote |
| Official usage/reporting documentation | Candidate ways to retrieve correlated usage and costs | A verified account-specific `fax_id` mapping, finalization delay or immutable invoice total |

The observed CSV URL is [global_conver_6f678b5cc3.csv](https://portal.telnyx.com/downloads/global_conversational/global_conver_6f678b5cc3.csv). A direct HTTPS GET without cookies or authorization returned HTTP 200, without a redirect. Reads were bounded to 40 MiB and processed in memory; no persistent download was retained.

- Actual size: **34,769,285 bytes**.
- HTTP `Last-Modified`: **Tue, 08 Sep 2026 11:42:59 GMT**. This is the response metadata, not proof of the rate's contractual effective date.
- SHA-256: `ec4e3baeb5e26ba40024d99ffac022e95b22573cdbe6af008fb1c6193e0949c7`.
- Columns: `ISO`, `Country`, `Origination Prefixes`, `Destination Prefixes`, `Description`, `Interval 1`, `Interval N`, `Rate`, `Price Per Call`, `Exact Match`.

The CSV itself has no currency column. Telnyx's [terms, section 4.1](https://telnyx.com/terms-and-conditions-of-service), state USD pricing; the portal uses dollar-denominated controls. The values below are recorded as USD reference rates, not EUR or tax-inclusive totals. Any exceptional currency agreement would require separate evidence.

## 2. Account settings observed

| Setting | Observation |
| --- | --- |
| Fax API application | **Guteneo**, active; assigned to outbound profile **Default** |
| Application outbound channel limit | **1** |
| Account outbound concurrent call limit | **2** |
| Outbound profile | **Default**, enabled; **Global / Rate Deck** |
| Allowed destinations | UI reports **52 European destinations**, including France, Germany and Luxembourg; North America has **United States and Canada** selected, Mexico and Saint-Pierre-et-Miquelon unselected |
| Daily spend limit | **Disabled** |
| Repeat Call Guard | **Disabled** |
| Attached number | One active Luxembourg **National** number, attached to Guteneo; **Pay per minute**, **T.38 Fax Gateway enabled** |
| Local Calling feature of that number | **Not confirmed** in the available number/settings/order screens |

The profile's channel-limit and maximum-destination-rate fields displayed a grey `10` without an accessible confirmed value. They must **not** be recorded as a verified limit of 10 channels or USD10/minute. Likewise, the disabled daily-spend field's grey `100` is **not an active USD100/day ceiling**. A later scoped read through `inspectTelnyxReadiness` may resolve persisted controls; missing data must remain unknown, distinct from an explicit provider `null` meaning unlimited.

Profile permission is only one prerequisite. It does not prove that every destination can receive fax, that the caller ID is accepted on every route, or that the number has Local Calling. No full telephone number, personal verification data, secret or private callback URL is retained in this note.

## 3. Origin classification and relevant rate rows

Telnyx distinguishes **Local**, **EEA**, **Non-surcharged** and **Surcharged** origins. A Telnyx-issued number calling its own country is Local; a number from a different EEA country calling an EEA destination is EEA. Consequently, our LU caller maps to EEA for France/Germany and to Local for Luxembourg when the local route is qualified. The LU EEA row is **not** the domestic LU rate. [Official classification](https://support.telnyx.com/en/articles/6974437-updates-to-global-conversational-rate-deck).

| CSV destination/category | Destination prefix examples | Rate, USD/minute | Initial / subsequent interval |
| --- | --- | ---: | --- |
| France — From EEA, general row | `33` | **0.0056** | 60s / 60s |
| Germany — From EEA, general row | `49` | **0.0081** | 60s / 60s |
| Germany — Fixed IP Phone — From EEA | `4932` | 0.0091 | 60s / 60s |
| Luxembourg — Fixed — Local | `35223`, `35299`, `352809`, `3524` | **0.022** | 60s / 60s |
| Luxembourg — NGN Service 1 — Local | `352801`, `35220`, `352291` | 0.044 | 60s / 60s |
| Luxembourg — NGN Service 2 — Local | `35260` | 0.20 | 60s / 60s |
| Luxembourg — Mobile — Local | `3526` | 0.08 | 60s / 60s |
| France — Special Services — From EEA | Including `33182883934`, `33893` | 0.05 | 60s / 60s |
| Germany — Special Services — From EEA | Including `49193`, `49180` | 0.1201 | 60s / 60s |

These are selected rows, **not an exhaustive production allowlist**. The resolver must first determine origin class, then the most-specific applicable destination prefix, including special-number overrides. It must not select a general-country row while ignoring a more-specific excluded category. Normalize CSV digit prefixes and E.164 numbers consistently. Conflicting, malformed or unsupported entries fail qualification rather than falling back to a cheap country price. The relevant rows have empty `Price Per Call` and `Exact Match` columns; their semantics must be qualified before ingestion, not silently interpreted as proof of zero fees.

For a positively billable duration `t`, a qualified 60/60 tariff corresponds to `ceil(t / 60)` billed minutes. A duration of zero, unanswered call, partial fax or failure needs the provider's applicable billing evidence; this formula alone must not manufacture a debit. The provider's [billing increments guide](https://support.telnyx.com/en/articles/1130659-billing-increments) and the exact CSV intervals belong in the tariff evidence.

Local Calling is supported in Luxembourg in the [official country list](https://support.telnyx.com/en/articles/6622229-pstn-replacement-local-calling-with-telnyx), but Telnyx requires a number with that feature and the same number used as outbound caller ID. T.38 being enabled does not prove this feature. Start with qualified FR/DE routes; LU remains separately gated until the attached number's feature is confirmed.

## 4. Public price and controllable limits

As checked on 2026-09-17, [Telnyx fax pricing](https://telnyx.com/pricing/fax) publishes **USD0.007 per page plus SIP Trunking usage for transmission**. Destination, volume tiers, carrier charges and taxes can affect billing. This is the public reference page fee; the actual page fee of the inspected account remains **unconfirmed**. An explicitly labelled public-list-price commercial basis could be qualified for a pilot if Guteneo accepts the variance, but must not be presented as the account's guaranteed final cost.

[Send Fax](https://developers.telnyx.com/api-reference/programmable-fax-commands/send-a-fax) documents 50MB and 350-page limits. No hard maximum transmission-duration field was found in the inspected Fax API request schema. A smaller Guteneo limit, such as 10 pages for a pilot, is an application policy proposal, not a Telnyx guarantee. Do not import Voice API duration parameters into Fax API requests.

The [outbound profile](https://support.telnyx.com/en/articles/4320411-more-about-outbound-voice-profiles) offers concurrency, permitted destinations, maximum per-minute destination rate and daily spend controls. Its daily threshold prevents further calls after expenditure exceeds the threshold; it is not a hard per-fax exposure cap. [Cancel Fax](https://developers.telnyx.com/api-reference/programmable-fax-commands/cancel-a-fax) is an asynchronous request, not proof that transmission stopped immediately or incurred zero cost.

The profile also links to [short-duration charges](https://support.telnyx.com/en/articles/1130707-what-are-short-duration-calls): connected calls of six seconds or less can incur USD0.01/call internationally when the account's monthly short-call proportion exceeds 15%, with the surcharge applying to all such calls in that month. This illustrates why a per-page-plus-minute estimate cannot promise the entire future invoice. Monthly adjustments and other unallocated overhead must not become undisclosed retroactive customer charges.

## 5. Cost correlation still to qualify

A signed [fax-delivered callback](https://developers.telnyx.com/api-reference/callbacks/fax-delivered) can provide `fax_id`, page count and call duration; these are usage observations, not a final invoice amount. The current adapter returns `cost: null` from `readStatus()`, and the webhook normalizer currently retains outcome/failure information rather than billable usage.

The [Detail Records API](https://developers.telnyx.com/api-reference/detail-records/search-detail-records) exposes fax and SIP usage reporting. [Session Analysis](https://developers.telnyx.com/docs/reporting/session-analysis) describes metadata discovery, `fax-api`/`sip-trunking` relationships, per-event cost, cumulative cost and links to underlying records. The candidate read-only investigation is:

1. Inspect `/v2/session_analysis/metadata` and `/v2/session_analysis/metadata/fax-api` for the actual fields and relationships.
2. On an explicitly authorized pilot, correlate its provider fax reference and account/application to the fax event and associated SIP records. Do not assume `event_id == fax_id`.
3. Verify currency, billed pages, duration/intervals, each component's identity and when records become available or change. Sum leaf charges or a qualified complete rollup, **never both**.
4. Establish a bounded reconciliation policy and retain immutable evidence references/hash plus normalized amounts. A usage total can be the explicitly agreed charging basis; it must not be relabelled a final tax-inclusive supplier invoice.

No usage records or existing communications were inspected in this task. Account-specific correlation, partial-failure billing, record completeness and finalization delay remain open. Missing evidence retains a hold and creates an operator reconciliation item; it never implies zero cost or permission to resubmit.

## 6. Proposed smallest usable pricing-v3 slice

This is a proposal to replace the v2 commercial contract, not a silent loosening of its guards. Prepare from a current, operator-qualified **reference tariff**, origin/destination classification, explicit tax treatment and dated commercial USD/EUR conversion. Freeze the page rate, SIP rate, intervals, eligible fees, duration-model version, lower/upper duration assumptions and source hashes. A conservative configured duration band may be used initially if labelled an estimate rather than a measured confidence interval; approved pilot evidence can refine later revisions.

For page count `P` and estimated billable duration band `[L,U]`, compute both endpoints from `P × page_rate + billed_minutes × SIP_rate + identified_per_call_fees`, convert at the frozen commercial FX rate, then apply the disclosed customer multiplier. The upper estimate is not a network-enforced maximum. The browser separately approves a **firm EUR ceiling** and the exact document/recipient/options. A reasonable initial policy is at most 10 pages, one active fax, and only approved fixed-number categories in FR/DE, adding LU after Local Calling qualification. Thresholds and numeric caps require an explicit commercial choice; none is installed by this document.

The proposed customer rule is **twice the agreed verified usage basis, capped at the approved ceiling**. Guteneo bears provider costs or later adjustments beyond that ceiling and overhead excluded from the stated basis. This is a capped multiplier, not a guarantee that every charge equals twice the eventual invoice. If the product promise includes customer tax, calculate/include it within the same approved ceiling before activation; do not describe an ex-tax reference as tax-inclusive.

- Preparation and approval require tariff/identity/route qualification, **not a future invoice**. They create no send or debit.
- Confirmation atomically reserves the approved ceiling from the shared EUR50 credit and channel quota, and writes the existing outbox entry once.
- Provider acceptance marks delivery progress but does **not** settle v3 credit. Keep the reserve through transmission and usage reconciliation.
- Verified usage settlement atomically charges no more than the ceiling, releases the unused hold and records supplier reference cost, customer amount and any Guteneo-absorbed excess. Use bounded integer/rational arithmetic and the existing cumulative nano-EUR approach; never round every fax component to a cent.
- A pre-invocation cancellation or explicit no-submission rejection can release the hold. A failed/partial fax, timeout, ambiguous response, or cancellation request after invocation cannot establish zero cost. Late acceptance remains reconcilable without resending.
- Duplicate callbacks and cost observations cannot settle twice. Later provider increases never debit above the approved ceiling or silently reopen a settled charge. Corrections need append-only adjustment evidence; an operator waiver/write-off must explicitly record Guteneo assuming the liability, distinct from proof of zero supplier cost.

The settlement proof must match the tenant, dispatch, fenced attempt, supplier reference, account and application. A unique `(organization_id, dispatch_id)` settlement makes an identical replay harmless and a conflicting observation a reconciliation issue. The proof, debit and unused-reserve release must commit together. A subsequently expired tariff or revoked sender can prevent a new transmission, but must not prevent reconciliation of a previously valid submission at its frozen terms. Record the original reservation period so a later-month settlement cannot move the liability into a fresh quota or replenish credit.

The operational pilot also needs a small explicit Guteneo exposure budget and monitoring. An optional cancellation watchdog limits risk only on a best-effort basis; it cannot turn the customer cap into a hard supplier cap. Live gates stay closed until this complete path and a specifically authorized test document/destination are qualified.

## 7. Exact integration points for a future implementation

Use a **new ordered migration after the current set** (0022 is the latest present at this review; reserve the next number with the release owner). Do not edit applied 0013/0014/0015/0016 or overwrite historical quote/approval hashes.

| Existing location | Required v3 change |
| --- | --- |
| `packages/domain/src/live-fax-quotes.ts`: `resolveFaxTariff`, `exactFaxPrice`, `makeFaxQuote`, `insertFaxQuote`, `validateLiveFaxQuote` | Introduce an explicit v3 branch/module for reference tariffs, origin/category/prefix selection, rational USD/FX estimates, firm cap and versioned duration assumptions. Preserve v2 exact-cost meaning; never coerce estimated costs into `guaranteed_final_supplier_total`. |
| `migrations/0013_trusted_fax_quotes.sql`, `0015_exact_supplier_fax_pricing.sql`: `valid_live_fax_quotes`, preparation/approval/acceptance/preflight guards | Add immutable v3 tariff and quote tables plus version-aware validity guards. Bind tenant, account, Fax application, outbound-profile revision, sender, exact PDF hash/page count, destination, options, source, FX and expiry. Revocation or a newly more-specific policy invalidates pending preparation/approval/claim. Preserve old records and explicit version policy. |
| `packages/domain/src/index.ts`: `prepareDispatch`, `approveDispatch`, `confirmDispatch`, private `dispatch`, `getDispatch`, `processDispatch` | Persist the v3 quote with the dispatch in one batch; fingerprint the range, cap and charging terms. Expose typed estimate/settlement fields. Keep current browser approval, membership and idempotency barriers. Revalidate before claiming/invoking; do not treat `estimated_minor` as settled actual cost. |
| `apps/api/src/live-providers.ts`: `createLiveProviderHook`, `exactDocument`, `claimAttempt` and fax final preflight | Revalidate v3 identity, profile/route revision and exact scanned bytes before the fenced first call. Preserve private media grants, one-attempt fencing and unknown-outcome behavior. Bound parsing/network responses and do not expose supplier tokens or signed URLs. |
| `packages/providers/telnyx.ts`, `packages/providers/webhooks.ts`, `apps/api/src/webhooks.ts` | Keep signature/account verification and durable receipts. Normalize only qualified usage fields; add a bounded private cost-reconciliation reader once account record mapping is proven. `client_state` or browser-supplied cost is never accounting authority. |
| `packages/domain/src/index.ts`: `ingestEvent`, event projection and `reconcileExpiredLeases` | Separate delivery state from cost-reconciliation state. Acceptance/delivery/failure order must not force a v3 fixed-price charge; lease expiry must retain uncertainty. Cost polling may retry reads, never submission. |
| `migrations/0014_welcome_credit.sql`: `welcome_credit_accept`, `welcome_credit_confirm`, `welcome_credit_attempt_accepted`, `welcome_credit_event_accepted`, reservation/settlement guards | Retain ceiling reservation at queued transition; exclude v3 from acceptance-driven settlement, including late acceptance after failure. Add a settlement proof that authorizes only the verified capped amount. Do not globally make immutable reservations editable. |
| `migrations/0016_live_delivery_quotes.sql`: `delivery_charge_entries`, `valid_delivery_charge`, `welcome_credit_settlement_entry`, `confirm_reservation`, `release_reservation`, `delivery_quota_release` | Extend the fractional ledger with a versioned fax settlement source. Preserve the existing email/postal path. Exclude v3 from legacy quota settlement/release on status alone; update shared credit and per-channel usage together on verified settlement or demonstrable no-submission release. |
| `packages/domain/src/welcome-credit.ts`, `apps/api/src/billing.ts`, usage API | Show held credit separately from spent credit and settled actual amounts. Keep the one-time 5000-cent grant and disabled top-up unchanged. No reset or extra grant to mask held/exhausted funds. |
| `apps/web/src/api.ts`: `Dispatch`, `quotedMoney`; `apps/web/src/dispatch-pages.tsx`; MCP/REST/OpenAPI contracts | Present “estimated range”, “maximum approved” and later “charged” separately, with FX/basis and uncertainty. Assistants may prepare/read/confirm only after a real browser approval; no tool can assert consent or supply trusted rates. |

The current `delivery_charge_entries` guard requires a `live_delivery_quotes` row and its frozen `customer_nanoeur`; it cannot simply accept a fax observation. Likewise, the welcome reservation's `charge_minor` is currently immutable and tied to the estimate. Design a guarded v3 settlement source and migrate trigger logic together; changing only the UI or the quote resolver would create incorrect debits.

Historical v1/v2 quotes must remain byte-for-byte intact. A migration may explicitly require re-preparation of unsubmitted obsolete versions, but must preserve active/unknown attempts and their accounting obligations without automatic retries or reinterpretation at new rates. Simulation stays a separate deterministic ledger.

## 8. Required proof before activation

1. **Tariff parsing/calculation:** real CSV-shaped fixtures for Local versus EEA, whitespace in origin lists, longest-prefix special exclusions, ambiguous rows, 60/60 boundaries at 1/60/61 seconds, page and fee components, rational FX, overflow and source expiry. Include LU domestic not using the EEA price.
2. **D1 authorization/immutability:** extend `tests/integration/trusted-fax-quotes.test.ts` or a dedicated v3 suite for tenant/account/application/profile mismatches, exact document/options changes, source revocation, newer specific exclusions, approval/cap binding and direct-SQL bypass attempts.
3. **Money/concurrency:** extend `tests/integration/welcome-credit.test.ts` for concurrent fax/email/postal reservations, shared EUR50 exhaustion, accepted-but-unsettled holds, cumulative fractional settlement, below/at/over-cap costs, one settlement per attempt and atomic quota/credit updates. Prove rounding never exceeds the approved minor-unit cap.
4. **Failure ordering:** test unknown→failed→late accepted, accepted→failed with partial usage, callback before HTTP acknowledgement, duplicate/out-of-order or contradictory costs, final positive/zero cost after failure, rejection without invocation, post-invocation cancellation and missing cost records. None may release uncertain liability or resubmit. Include crash/replay and settlement after tariff expiry, sender revocation or change of month.
5. **Provider/reconciliation:** extend `tests/unit/live-providers.test.ts`, `providers.test.ts` and `providers-webhooks.test.ts` with intercepted HTTP, signed usage fixtures, unique account-scoped fax/SIP correlation, currency/record incompleteness rejection and no rollup double counting. No real communication belongs in these suites.
6. **Migration/restore/UI:** populate old-version quotes and reserved/unknown/settled states before migration, prove preserved hashes/balances and run the migration verifier without remote mutation. Extend restore proof and browser tests for range/cap consent, expired quotes, holds, lost confirmation responses and final charge. Use separate report files while another release suite runs.
7. **Bounded live pilot, separately authorized:** qualify the page-price basis, route, sender, Local Calling where relevant and read-only usage mapping; then send only the explicitly approved synthetic document to an approved recipient. Record actual usage, capped settlement and release of unused credit. This inspection and proposal perform none of those external actions.

Validation of this note is documentary/source inspection only. No runtime tests, migrations, production tariff writes or deployments were performed for it. Current release evidence remains owned by the ongoing release task.
