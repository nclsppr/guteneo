# Qualifying SES for an attachment-free test

17 September 2026: public ex-tax pricing model published in `813dd717`, migrations
0021–0022 applied/verified; **no tariff policy installed, activation or send** by
this work. `0021_ses_text_only_quotes.sql`/`0022_ses_public_list_prices.sql` contain
no active price/sender/organization and consume no credit.

## Available evidence

At approximately 03:27 Europe/Paris on 17 September, Guteneo AWS console/Paris
region again displayed **Essentials**, including Outbound Email and Virtual
Deliverability Manager — SES deliverability. Test recipient identity was verified;
sandbox-exit case had no new reply. Account observation differs from public tariff;
see [SES_STATUS.md](SES_STATUS.md).

Essentials marginal first tier (zero–ten million monthly recipients):
**USD0.16/1,000**, **160 microUSD/recipient**. No higher-plan regional flat fee.
Attachments separately USD0.12/GB; qualify paid/related services including SNS.
Do not count included deliverability twice. Attachment wording/message-volume
example do not prove byte billing basis. [SES pricing](https://aws.amazon.com/ses/pricing/).

ECB **16 September 2026**: **EUR1 = USD1.1537**, exact EUR/USD `10000/11537`.
Informative reference, not AWS invoice FX; ECB discourages transactional use.
[ECB publication](https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html),
[official XML](https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml).
Tax depends on billing identity/AWS entity, not Paris region/Luxembourg name;
infer neither 0% nor 17% VAT. [AWS Europe](https://aws.amazon.com/legal/aws-emea/).
[InvoiceCurrencyAmount](https://docs.aws.amazon.com/aws-cost-management/latest/APIReference/API_invoicing_InvoiceCurrencyAmount.html)
separates invoice currency/FX without proving ECB use.

## Public ex-tax commercial contract

`public_list_price_ex_tax` means **public SES price excluding tax ×2 at quote-fixed
commercial FX**, not net AWS invoice cost. Guteneo invoice VAT is separate;
no tax/exemption is inferred. One recipient, text plus normalized HTML, **no document/
attachment**, needs no GB/MIME assumption:

```json
{
  "pricingBasis": "public_list_price_ex_tax",
  "plan": "Essentials",
  "tier": "0-10000000",
  "unit": "recipient",
  "currency": "USD",
  "tariffSource": "https://aws.amazon.com/ses/pricing/",
  "tariffDate": "2026-09-17",
  "attachmentBasis": "no_attachments",
  "usdMicrosPerMessage": 160,
  "eurPerUsdNumerator": 10000,
  "eurPerUsdDenominator": 11537,
  "fxBasis": "commercial_fixed_reference",
  "fxSource": "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml",
  "fxDate": "2026-09-16"
}
```

`emailRateComponents()` returns `base_numerator=1600000000`, `byte_numerator=0`,
`rate_denominator=11537` in nanoEUR. Converted public reference approximately
`0.00013868423333622258 EUR`; upward projection `138685` nanoEUR, customer ex-tax
`277370` nanoEUR/`0.00027737 EUR`. Isolated ceiling may be one cent, but debit is
organization-cumulative, **not one cent/email**. Initial provider rounding is under
one nanoEUR; [LIVE_DELIVERY_QUOTES.md](LIVE_DELIVERY_QUOTES.md) owns rounding.

This policy **can be qualified without a future AWS invoice** once actual plan/tier/
options and commercial FX convention are explicitly verified. AWS credits/discount/
payment FX/auxiliary fees affect operating cost, not retroactively approved catalog
price. Keep ex-tax presentation without invented tax treatment. Historical API
`quote_supplier_nanoeur` here means converted list basis, not invoice amount.

Required future private policy:

| Field | Value/evidence |
| --- | --- |
| `organization_id`, `sender_id` | Actual signed-in organization/verified same-tenant sender |
| `channel`, `provider` | email, ses |
| `account_id` | Observed SES account `982055099242` |
| `route_id` | Observed sandbox `eu-west-3:guteneo-production:true`; reread when qualifying |
| `options_json` | `{}` for transactional test without paid extras |
| `rate_json` | Above verified plan/tier/chosen FX; changes need new policy |
| Coefficients | Helper output, never independently guessed |
| `currency`, `pricing_basis` | EUR, public_list_price_ex_tax |
| Deprecated policy `fiscal_basis` | qualified_final_variable_cost only for old-schema compatibility; not authoritative pricing or real-cost claim in this mode |
| `source_reference`, `source_sha256` | Private frozen dossier covering account plan/tier/config/dated public tariff/FX convention; no personal invoice/secrets in Git |
| `valid_from`, `expires_at` | Short operator-dated period after verification; 16 September FX is not permanent |
| `quote_ttl_seconds` | 300 |
| `status` | qualified only after verification; this document is not an active row |

Old `qualified_final_variable_cost` retains its requirements, including postal;
public SES mode reinterprets no old quote. Out-of-model plan/tier/extra-option/message
scope requires explicit model extension, not qualification by assumption.
Unknown attachment accounting does not block preparing no-attachment account/sender/
text/evidence/verified destination. Send flags/channel stay closed until qualification
and test authority. SES sandbox actually sends; it is not Guteneo simulation.

## Protection and local proof

- `no_attachments` forbids `usdMicrosPerGb`/`bytesPerGb`, including zero/null; PDF size never chooses scope.
- Preparation rejects any document, even declared zero-byte, without quote/dispatch/outbox.
- Migration guards policy insert/`valid_live_delivery_quotes`; prepare/approve/accept/attempt inherit checks. Unrecognized old scope blocks quote use while preserving history.
- SQL stops older applications treating zero byte price as PDF permission. Domain repeats read/pre-submit guards even during old-view transitions.
- Account/region/set/sandbox compose SES identity; change invalidates quote before external calls. Tenant/sender/content/cost/expiry stay fixed; no client price/assistant human consent accepted.

## Migration and projections

0022 only adds policy `pricing_basis` defaulting to old contract, then adapts
immutability guard/view: no rebuild, FK disabling, writable_schema or old migration
edits. Existing quote/approval/financial bytes remain unchanged. Already-signed quote
`fiscal_basis` receives authoritative basis and must equal `policy.pricing_basis`,
so old readers cannot label a public quote as final cost.

New public quotes freeze pricingBasis/FX before fingerprint. View/pre-submit checks
compare ratio/date/source to immutable tariff. Unit reads return
`quote_pricing_basis`, `quote_fx:{numerator,denominator,date,source}` in EUR/USD,
only four public values. Old quotes keep old basis/null FX; no email/postal quote
means both null. Lists may omit fields.

`tests/integration/live-delivery-quotes.test.ts`/`tests/unit/live-providers.test.ts`
use isolated D1/intercepted transport: rational formula/×2, zero-byte PDF refusal,
ambiguous SQL scope, old-reader interpretation, presubmit, changed account/route,
expiry, ex-tax contract, approved-quote/already-debited-credit upgrade, empty
foreign_key_check/quick_check OK. This qualifies no actual account.
