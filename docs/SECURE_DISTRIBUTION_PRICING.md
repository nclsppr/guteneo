# Secure distribution pricing

Customer prices chosen for the 24 October 2026 candidate, **EUR excluding VAT, per PDF and named recipient**. These are server-catalog amounts, not Cloudflare prices or subcontractor quotes. Immutable version: `secure-distribution-2026-10-24-v1`.

| Shared retention | Price |
| --- | ---: |
| 7 days | EUR 0.49 |
| 30 days | EUR 0.99 |
| 90 days | EUR 1.99 |
| 365 days | EUR 4.99 |

| Prepaid personal-delivery option | Supplement |
| --- | ---: |
| Independent retention for 365 days | EUR 1.99 |
| Independent retention for 1,095 days | EUR 4.99 |

The option funds delivery capacity for the intended recipient until sharing expires. It is billed at activation even if the recipient never requests a copy. When delivered, the copy's own term starts at delivery. Preparation displays sharing, option and invitation transport separately, with total/ceiling before approval. No later charge is hidden from the recipient.

Example: thirty-day sharing, one-year personal copy and transport quoted at EUR 0.01 total EUR 2.99 excluding VAT. That cent represents hypothetical/simulated transport, not a provider-price promise. Actual email pricing uses Guteneo's existing qualified quote contract.

**Revocation refunds neither committed retention nor the prepaid personal-delivery option.** Service charges remain separate from transport. Provider failure/unknown outcomes follow transport reservation/reconciliation rules without recreating the service. Idempotent recovery, repeated confirmation and repeated copy requests create no second charge. Tests trigger no card or external debit.

## Technical costs and estimation limits

Public prices consulted on 24 October 2026, excluding tax, in USD. Included quotas are shared across the existing account, never fully reallocated to each workspace/document.

| Resource | Public overage |
| --- | --- |
| R2 Standard | USD 0.015/GB-month; USD 4.50/million class A writes; USD 0.36/million class B reads |
| Workers Standard | USD 0.30/million requests and USD 0.02/million CPU milliseconds after account inclusions |
| D1 Paid | USD 0.001/million rows read; USD 1/million rows written; USD 0.75/GB-month after inclusions |
| Queues Paid | USD 0.40/million operations after inclusion; normally write, read and delete per message |
| Browser Run Paid | USD 0.09/hour beyond ten included monthly hours; concurrency billed separately beyond inclusion |

Official sources: [R2](https://developers.cloudflare.com/r2/pricing/), [Workers](https://developers.cloudflare.com/workers/platform/pricing/), [D1](https://developers.cloudflare.com/d1/platform/pricing/), [Queues](https://developers.cloudflare.com/queues/platform/pricing/), [Browser Run](https://developers.cloudflare.com/browser-run/pricing/).

Candidate serialization ceilings allow approximately **40.6 MB per encrypted namespace**: 10 MiB original, one hundred images up to 268,800 decoded bytes and one hundred text layers up to 32,000 UTF-8 bytes, plus envelopes. Initial workspace source adds at most 10 MiB. A personal copy is a complete second namespace with independent retention.

At these ceilings, R2 storage for a one-year share/source is approximately **USD 0.0094**, and a three-year copy approximately **USD 0.0223**, before aggregate rounding and excluding other resources. Volume calculation is not total cost. Rendering uses up to 34 three-page batches; hypothetical thirty-second batches imply USD 0.0255 in browser hours before concurrency. This is not a measured duration.

`scripts/benchmark-secure-storage.ts` separately measures local encryption, reads/writes and volumes using maximal synthetic buffers; `test-results/secure-storage-capacity.json` labels that environment explicitly. Node CPU/memory is not billable Workers telemetry. E2E actually renders/copies a four-page PDF without extrapolating its duration to every PDF.

Decisive costs also include Auth0, active accounts/sessions, audit indexes/events, operations, support, identity recovery, security and independent backups. [Auth0 pricing](https://auth0.com/pricing) depends on active users, security features and contracts. Passkey choice and final security-method cost are deferred; continuing UI implementation qualifies no extra identity cost and activates no subscription. No Auth0 per-recipient price is invented. GitHub Actions/monitoring quotas are shared with existing pipelines.

Customer pricing is an executable product choice, not a margin guaranteed by R2 cost alone. Commercial activation requires representative traffic measurements, audit/abuse budgets, identity-cost qualification and event-retention policy. Promise neither unlimited intensive reading nor a capped infrastructure bill until those budgets are tested. Price changes apply to new preparations with a new version, never rewrite approved commands.
