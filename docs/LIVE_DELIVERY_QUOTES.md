# Live email and postal quotes

17 September 2026: production paths implemented/tested locally on D1 with
intercepted transports. This qualifies no actual tariff, changes no provider
account and sends nothing. Additive `0016_live_delivery_quotes.sql` preserves fax
v2 and historical financial writes.

## Commitment and authority

`createLiveDeliveryQuoteConfig(env)` supplies `liveDeliveryIdentity` and private
`postalQuote` to `DomainService`. Browser/MCP input cannot establish provider cost;
options/user ceiling can restrict, never qualify pricing. Provider secrets stay
in the API bridge.

Operator-only `trusted_delivery_costs` rows, immutable except revocation, qualify
Guteneo organization, verified sender, channel, provider account, route, options,
source/SHA-256, cost basis, EUR currency, validity and quote TTL (30–900 seconds).
No public endpoint installs them. SES account is `SES_ACCOUNT_ID`; route is
`AWS_REGION:SES_CONFIGURATION_SET:SES_SANDBOX`. Pingen account/route is
`PINGEN_ORGANIZATION_ID`. Changed account/region/configuration/mode invalidates old identity.

Immutable quotes bind policy, normalized content, private PDF ID/hash/size,
recipient, sender, options, exact price, ceiling, source and expiry. Quote hash
belongs to the human-approved fingerprint. Assistants cannot assert human approval;
production email also requires requested-message attestation (migration 0018),
which is not marketing-consent collection. Optional delegated approval retains
its separate [expert mandate](EXPERT_APPROVAL.md).

SQL views enforce same-tenant relations. Guards cover quote preparation, approval,
acceptance and attempt claim; acceptance atomically reserves credit/quota and
writes outbox. Before final calls, bridge revalidates quote, sender, channel and
attempt. Expiry/revocation during Pingen calculation blocks send PATCH. Unknown
outcomes never permit automatic retry.

## SES formula and qualification

The dated public AWS page showed multiple plans/tiers, not Guteneo's actual plan:
Essentials from USD0.16/1,000 messages; pay-as-you-go USD0.10/1,000; attachments
USD0.12/GB. No price is installed by migration. Qualify actual plan/tier/promotions,
tax and paid options. [SES pricing](https://aws.amazon.com/ses/pricing/).

Private `emailRateComponents()` converts evidence to rational EUR pricing:

```ts
{
  usdMicrosPerMessage, // 100 for USD0.10/1,000; example, never an active tariff
  usdMicrosPerGb,     // millionths of USD per billed GB
  bytesPerGb,        // explicitly qualified accounting unit
  eurPerUsdNumerator,
  eurPerUsdDenominator,
  attachmentBasis: "raw_pdf_bytes"
}
```

Server-fixed documented FX is frozen, never assumed/floating/client-supplied.
GCD-reduced `base_numerator`, `byte_numerator`, `rate_denominator` express provider
`(base + byte × original_PDF_size) / denominator` in **nanoEUR**. `rate_json`
retains USD units/FX; coefficients must match exactly. Integer bounds protect
SQLite; unsupported precision is refused.

Before real attachments, qualify raw/encoded billing basis and exact GB divisor.
Public attachment docs describe JSON base64/MIME transport without proving billing
units. Only `raw_pdf_bytes` is implemented; prove it fits the account or explicitly
extend the model. Never silently choose 10⁹, 2³⁰ or 4/3. No-attachment cost remains
calculable with qualified message rate/FX.
[AWS attachments](https://docs.aws.amazon.com/ses/latest/dg/attachments.html).

`0021_ses_text_only_quotes.sql` adds `attachmentBasis:"no_attachments"`, omitting
per-GB fields. Preparation, SQL view, reads and pre-submit checks reject any document,
even zero-size. Message rate/FX still require qualification; see [text-only
contract](SES_TEXT_ONLY_QUOTE.md).

`0022_ses_public_list_prices.sql` separates `pricing_basis`:
`public_list_price_ex_tax` is Essentials first tier, one recipient, no attachment/
extra option, public ex-tax list ×2 with quote-fixed commercial FX. It needs no
future AWS invoice. Dated source/metadata stay in `rate_json`; FX ratio/date/source
and basis are signed with content. Net AWS cost and eventual customer-tax treatment
are not claimed established. Historical policy `fiscal_basis` is deprecated for
compatibility; only `pricing_basis` owns snapshot semantics.

`qualified_final_variable_cost` covers qualified final variable cost/tax/FX for
this send; it does not automatically allocate monthly subscriptions, dedicated IPs
or related services. If these alter variable cost or hide its total, do not qualify.
SES sandbox sends real messages to verified recipients; it is separate from Guteneo
simulation. [SES limits](SES_SEND_LIMITS.md).

## Postal analyzed draft and calculator

A separately authorized draft preserves exact bytes with `auto_send:false`, without
moving/adding addresses. `PINGEN_DEFAULT_COUNTRY` supplies qualified account profile;
international addresses keep a final country line. Upload max: 8,000,000 bytes.
[Pingen preflight](PINGEN_PREFLIGHT.md) owns geometry/limitations.

Quote preparation reads the exact provider draft, checks address/country,
`meta.abilities.self.submit === "ok"` and analyzed `paper_types`, then calls
`POST /organisations/{id}/deliveries/letters/price-calculator`, JSON:API type
`letter_price_calculator`, with approved country/paper/print mode/spectrum/product.
Only calculable EUR 200 is final here; 202 remains pending. Unsupported special
paper is refused. Customer cost is twice provider EUR cost with qualified tax/fees.
[OpenAPI](https://api.pingen.com/documentation/swagger-docs).

Evidence binds provider ID, country, normalized address, analyzed paper, options
and amount. Immediately before `PATCH .../send`, reread/recalculate both amount
and evidence; both must equal approval even if a changed price stays below ceiling.
Then revalidate current local state. Drafts bind one organization/document/sender/
recipient and cannot be claimed by two commands. Unknown results need reconciliation.

## NanoEUR, reservation and debit

EUR1 = 1,000,000,000 nanoEUR; one cent = 10,000,000. Rational provider numerator/
denominator remain decimal strings. Upward projection differs by **less than one
nanoEUR**; customer price is twice that projection, differing by less than two
nanoEUR from twice the original rational. Do not hide this behind exact-price
wording. Cent-denominated postal prices have no such difference.

Reserve integer-cent ceiling before external effects.
`estimated_minor = ceil(customer_nanoeur / 10 000 000)` bounds an isolated operation;
it does not charge a cent per email. Proven provider acceptance atomically appends
immutable `delivery_charge_entries` with nano amount and incremental debit:

```text
ceil((total_nano_avant + prix_nano) / 10 000 000)
− ceil(total_nano_avant / 10 000 000)
```

The organization-wide total combines new email/postal quotes and survives historical
metadata removal; historical integer fax amounts stay separate/add normally.
Cumulative overrounding remains under one cent without monthly reset. Release
reservation and add only incremental debit to credit and current channel monthly
financial quota; count one accepted send. A final operation can receive a carried
cent from earlier fractions, rather than only its isolated price.

Unknown outcomes retain financial reservations, including failure callbacks that
do not prove zero provider cost. Pre-attempt cancellation/certain rejection release
credit/quota. Late proven acceptance after visible failure settles once without
regressing displayed state or double-spending welcome credit. Conservative
reservation/rounding may block less than a cent before EUR50 cumulative nano cost;
no recharge or monthly credit is created.

## Read contract and evidence

Historical unit reads from prepare/approve/confirm/cancel/getDispatch add
`quote_expires_at`, `quote_customer_nanoeur`, `quote_supplier_nanoeur`,
`quote_pricing_basis`, `quote_fx` (null without email/postal v1 quote). For public
ex-tax pricing, supplier-named value means converted list reference, not invoice;
FX is public `{numerator,denominator,date,source}`, EUR/USD, from signed content.
Old mode has null FX. Public customer projections now omit supplier cost under
[API_CONTRACT.md](API_CONTRACT.md). Lists may omit optional quote fields.
WelcomeCredit/Usage remain cents and show cumulative booked debits; do not label
`estimated_minor` as exact small-email cost.

Local proof uses real workerd D1/ordered migrations: tenant/account/options,
SQL tampering, expiry/revocation, shared ceiling, 51 concurrent synthetic-rate
emails for two cents, combined email/postal, replay, unknown failure then late
acceptance, history removal and human requested-message attestation. SES/Pingen
HTTP is intercepted. Fixtures/local success/calculator replies prove no qualified
real tariff, sent letter or production activation.
