# PDF verification: unit price and operating cost

## Customer price decision — 25 October 2026

One completed diagnostic for one exact PDF and one selected profile costs
**EUR0.10 excluding tax**, taken from the workspace's available Guteneo credit.
The authoritative price and version are in
[`packages/contracts/src/pdf-validation.ts`](../packages/contracts/src/pdf-validation.ts).
There is no subscription, included monthly allowance, renewal or automatic
purchase. A PDF/UA or PDF/A report is an automated diagnostic, not certification.
Selecting another profile is another separately priced check.

The user explicitly delegated this pricing decision. The small fixed unit price
covers the bounded machine operation and contributes toward operation,
maintenance and support. It is a commercial price, not a statement of verified
margin or an exact allocation of the Cloudflare invoice.

## Purchase and failure behavior

An authenticated browser administrator reviews the exact document, selected
profile and current price before explicitly confirming the purchase. The server
binds the document hash, profile, price, currency, terms version and idempotency
key. Assistants and native sessions cannot assert this browser approval.
Reading an existing report or exporting it creates no additional purchase.

Acceptance atomically reserves the unit amount. A valid complete report settles
it once, whether the automatic rules pass or reveal noncompliance. An engine,
integrity, authorization or deadline failure releases the hold without a debit.
Replaying the same completed request returns the same report without a second
charge; an uncertain HTTP response is recovered with the same key. The purchase
journal, report and exact-byte relation are retained. Simulation evidence and
credits remain separate from production.

The explicit `PDF_VALIDATION_ENABLED` gate fails closed when absent or false.
The reviewed live configuration requests activation only after hosted
qualification; it has not yet been deployed. Migration
`0060_pdf_validation_per_check.sql`, qualified private validation, current scanner
readiness and a coordinated application release are prerequisites to activation.
The user has authorized production activation during this delivery; successful
local tests alone do not establish the hosted outcome. Follow
[the activation runbook](PDF_VERIFICATION_ACTIVATION_RUNBOOK.md) and record the
exact source, deployed versions, remote migration and non-sending proof.

## Infrastructure model — prices checked 25 October 2026

The configured private validator candidate is bounded to one `standard-1` container:
0.5 vCPU, 4 GiB memory and 8 GB disk. The Worker deadline is 45 seconds and configured idle
sleep is five seconds. These are source limits, not a universal measured billed
duration. A read-only Cloudflare inspection on 25 October found that the private
validator Worker did not exist. The user subsequently explicitly authorized
creation of this single private service and completion of the delivery. Actual
hosted qualification and activation must still be observed separately.

Cloudflare's published overage rates are USD0.000020 per active vCPU-second,
USD0.0000025 per provisioned GiB-second and USD0.00000007 per provisioned GB-second.
For an illustrative 50-second awake request with CPU saturated at 0.5 vCPU:

```text
CPU       = 0.5 * 50 * 0.000020   = USD0.0005000
Memory    = 4   * 50 * 0.0000025  = USD0.0005000
Disk      = 8   * 50 * 0.00000007 = USD0.0000280
Subtotal                          = USD0.0010280
```

One continuously awake instance at that full CPU allocation for 31 days models
USD55.067904 gross Containers consumption before shared allowance. This is an
illustrative scenario, not an account spending cap or a measured invoice.

The 25 October native arm64 full-corpus run passed on `standard-1`: all twelve
official references and the 100-page near-limit PDF across all six profiles,
with cold health at 16.345 seconds and large-PDF checks at 13.191–13.922 seconds.
The fresh `basic` run failed a large-PDF engine deadline. These local observations
select the candidate; actual Cloudflare x86 execution, cold requests and idle
stop/wake still require hosted qualification. Earlier dated `basic` measurements
remain historical and do not override the fresh failure.

This subtotal excludes Durable Objects, Workers, D1, R2, network transfer,
operational polling, repeated starts, support and taxes. No currency conversion
or net-margin claim is inferred. The USD5 monthly Workers Paid minimum and
included allowances are shared across the account; they are neither per-check
credits nor proof of free operation. Real invoices and representative hosted
CPU, memory, active/idle time and request measurements must requalify the model
when configuration or traffic changes.

Sources: [Cloudflare Containers pricing](https://developers.cloudflare.com/containers/platform/pricing/)
and [instance types](https://developers.cloudflare.com/containers/platform/limits/).
The retained measurements and resource assumptions are in
[the infrastructure cost model](PDF_VERIFICATION_COSTS.md); they do not determine
the customer price or establish a fresh hosted qualification.
