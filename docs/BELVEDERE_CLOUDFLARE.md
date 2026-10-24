# Belvédère — read-only Cloudflare access

The local connector queries one server-configured account and Worker. It
provisions nothing, deploys nothing and activates no remote access.
Qualification uses simulated API-format responses; no real Cloudflare account
was queried during these tests.

## Configuration after activation authorization

| Server variable | Expected value |
| --- | --- |
| `BELVEDERE_CLOUDFLARE_ACCOUNT_ID` | Only the Guteneo account ID, 32 hexadecimal characters |
| `BELVEDERE_CLOUDFLARE_SCRIPT_NAME` | Exact observed Worker name, without route/URL |
| `BELVEDERE_CLOUDFLARE_API_TOKEN` | Cloudflare secret restricted to **Account / Account Analytics / Read** and the Guteneo account |
| `BELVEDERE_CLOUDFLARE_BILLING_TOKEN` | Separate optional secret restricted to **Account / Billing / Read** and the Guteneo account |

Cloudflare documents [Analytics tokens and read permission](https://developers.cloudflare.com/analytics/graphql-api/getting-started/authentication/api-token-auth/).
Reuse no global key, deployment token or external account. Never put the
token in a `VITE_*` variable, URL, repository, log or browser. Account/script
are server parameters too; API users cannot choose others.

The Belvédère API must verify its privileged browser identity before calling
`getBelvedereCloudflareMetrics`. Serve results with `Cache-Control: no-store`.
The adapter persists nothing in D1, R2, KV, external cache or third-party
provider.

## Actually implemented data

One read-only POST to `https://api.cloudflare.com/client/v4/graphql` queries
`viewer.accounts.workersInvocationsAdaptive`, filtered by `accountTag`,
`scriptName`, `datetime_geq` and `datetime_lt`. The window is strictly the
last **24 hours** or **7 days**. The
[official Workers tutorial](https://developers.cloudflare.com/analytics/graphql-api/tutorials/querying-workers-metrics/)
describes this dataset, sums and quantiles. The
[official Cloudflare repository's GraphQL reference](https://github.com/cloudflare/skills/blob/main/skills/cloudflare/references/graphql-api/api.md)
confirms the hourly dimensions and wall-time quantiles used here.

- Requests, invocation errors and subrequests over the whole window.
- Invocation-error proportion among requests.
- Wall-time p50/p99 in milliseconds, calculated by Cloudflare across the
  full period in a separate selection without a time dimension.
- Hourly request/error/subrequest series, bounded to 169 possible intervals
  for seven rolling days. Missing hours remain missing.

Never average hourly percentiles. Extrapolate no cost by multiplying a
percentile by a request count.
[Workers metrics](https://developers.cloudflare.com/workers/observability/metrics-and-analytics/)
distinguish wall time, response latency and HTTP status: invocation error is
not an HTTP 4xx/5xx response. Quantiles are sampled and telemetry can arrive
late. Results expose `sampled: true` and time bounds; they are not an
exhaustive log.

Member countries come from Guteneo authentication events. Cloudflare datacenter
`coloCode` is not a member's country; this connector never mixes those sources.

## States and limits

| State | Meaning |
| --- | --- |
| `ok` | Validated response with counters/series |
| `not_configured` | Missing/invalid parameter; no network call |
| `forbidden` | HTTP 401/403 or recognized GraphQL authentication error |
| `no_data` | Valid dataset without observed invocation |
| `unavailable` | Timeout, quota, schema error, inconsistent response or other unavailability |

The full response is bounded to 128 KiB and eight seconds, including its
body. Redirects/automatic retries are disabled.
[GraphQL errors can accompany HTTP 200](https://developers.cloudflare.com/analytics/graphql-api/errors/):
any error makes partial data unusable. Provider bodies/messages are never
returned to the browser or logged. Unavailability never becomes zero counters.

`billing.status: unavailable` means **unreconciled infrastructure spending**.
`amountMinor`/`currency` remain `null`. Metrics are neither an invoice nor net
margin evidence.

## Usage costs reported by Cloudflare

The second adapter, `getBelvedereCloudflareBilling`, uses a separate billing
secret and one GET to `/accounts/{account_id}/billable-usage`. It requests the
**current billing cycle**, independently of the Workers-metrics window. The
[v1 reference](https://developers.cloudflare.com/api/resources/billing/subresources/usage/methods/get_account_usage_v1/)
notes that a `from`/`to` filter excluding the subscription anchor day returns
empty data: arbitrarily requesting seven days would create misleading missing
costs. No arbitrary time parameter is exposed.

The [official Billable Usage introduction](https://blog.cloudflare.com/billable-usage-api/)
documents `ContractedCost` in `BillingCurrency`, charge periods and cumulative
subtotals. The connector sums only `ContractedCost`, never
`CumulatedContractedCost`, and keeps currencies separate. It returns subtotals
by service/currency with earliest/latest observed charge-period dates.
Account, zone and subscription names, detailed descriptions and invoice URLs
are not returned.

Each numeric `ContractedCost` token is preserved as decimal before JSON
conversion to binary numbers. Calculation uses `BigInt`, with up to 18 decimal
places in major currency units. Subcent amounts are added exactly; each display
subtotal is then rounded once to the nearest cent, half up. Response fields:
integer `amountMinor`, exact `reportedAmountDecimal` string and
`rounding: nearest_minor_half_up`. Displayed row sums can therefore differ
by one cent from a total rounded after addition. EUR/USD are accepted; another
currency makes the result unavailable rather than inventing decimal precision
or an exchange rate.

Reads are bounded to eight seconds, 512 KiB and 2,000 rows. Duplicate/inconsistent
periods, another account, corrections, negative cost, unrepresentable precision
or safe-integer overflow make the entire result unavailable. The contract
covers current monthly cycles: cycles longer than 62 days and charge periods
longer than 31 days require explicit extension. No partial subtotal is presented
as complete. An empty response is `no_data`, distinct from validated zero cost.

Coverage remains `metered_usage_only`.
[Official cost tracking](https://developers.cloudflare.com/billing/manage/billable-usage/)
excludes fixed-price subscriptions and aligns data to each account's cycle.
This connector proves neither payment, total invoices including taxes/fixed
fees nor Guteneo net margin. It does not use API v2: its
[current reference](https://developers.cloudflare.com/api/resources/billing/subresources/usage/methods/get_account_usage_v2/)
states that cost/price fields are not yet populated.

## Documented extensions, not activated

The following are officially documented capabilities, not implemented
connectors:

| Source | Possible extension | Required qualification |
| --- | --- | --- |
| [D1 Analytics](https://developers.cloudflare.com/d1/observability/metrics-analytics/) | `d1AnalyticsAdaptiveGroups`, `d1StorageAdaptiveGroups`, `d1QueriesAdaptiveGroups` | Pin only Guteneo database IDs; verify accessible schema, period and permissions |
| [R2 Analytics](https://developers.cloudflare.com/r2/platform/metrics-analytics/) | Operations, object count, stored volume and bandwidth | Pin buckets; use required `eu_` jurisdiction prefix for European buckets; transfers below 100 KiB are absent from bandwidth data |
| [Account Billing History](https://developers.cloudflare.com/api/resources/billing/subresources/history/methods/list/) | Invoice/payment history | Separate **Account / Billing / Read** token, pagination, currency/unit validation and per-invoice reconciliation; do not count invoice and payment twice |

Billing History exists but is not called: its `action`, `type` and `status`
fields lack a qualified vocabulary proving settled-invoice reconciliation
here. An extension must qualify those states, preserve currencies without
implicit exchange rates and distinguish invoiced spending, payments and
estimates. Potentially sensitive hosted-invoice URLs must appear in neither
logs nor public exports.

## Local evidence

`npx vitest run tests/unit/belvedere-cloudflare.test.ts --reporter=default`
checks windows/filters, result format, absence of requests without configuration,
HTTP/GraphQL access refusals, partial/malformed data, size/time bounds and
absence of secret leaks. These tests activate no Cloudflare access. Real-account
validation and publication require their respective explicit authorizations.

`npx vitest run tests/unit/belvedere-cloudflare-billing.test.ts --reporter=default`
separately checks billing transport, decimal precision, rounding after addition,
currencies, account identity, periods, no double counting and read limits.
Responses are fictional fixtures, never evidence of real spending.

Official sources consulted on 2 October 2026.
