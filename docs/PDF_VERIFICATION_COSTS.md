# PDF verification — controlling Cloudflare costs

Engineering documentation only. This dated infrastructure model does not define
the current customer price or revive a monthly subscription. The current
[unit-pricing contract](PDF_VERIFICATION_PRICING.md) owns the individual purchase,
new cost research and remaining release qualification.

 Official prices checked **3 October 2026**, in
**USD excluding tax**, without EUR conversion. Estimates model consumption rather
than an invoice. Docker measurements are separate from assumptions and prove no
hosted deployment/performance.

## Current candidate — 25 October 2026

Fresh native arm64 Docker qualification selects one `standard-1` instance
(0.5 vCPU, 4 GiB memory, 8 GB disk), five-second idle sleep and the unchanged
384 MiB JVM heap and 40/45-second process/request deadlines. All twelve official
references and all six profiles of the 100-page near-limit fixture passed.
Cold health took 16.345 seconds; the large-file checks took 13.191–13.922 seconds;
peak memory was 233,508,864 bytes. The fresh `basic` run failed a large-file
process deadline. Local native evidence is distinct from actual Cloudflare x86,
cold-request, actual-resource and idle stop/wake qualification.

At the current published overage rates, a modeled 50-second awake operation
at full 0.5 vCPU costs `0.5*50*0.000020 + 4*50*0.0000025 + 8*50*0.00000007`
= **USD0.001028** in Containers resources before shared allowance. One instance
awake continuously at that full CPU allocation for 31 days models
**USD55.067904** gross Containers use. Neither is an invoice or whole-account cap;
Workers, Durable Objects, D1/R2, network and the shared plan remain separate.

The earlier measurements and comparisons below are retained dated evidence.
Their `basic` selection is superseded by this fresh result. The current
[unit-price and activation contract](PDF_VERIFICATION_PRICING.md) records the
EUR0.10 excluding-tax price and the still-required paid-resource authorization
and hosted qualification.

The main avoidable cost is **provisioned memory/disk while awake**, even without
PDF processing. CPU is billed for active use. For spaced requests, short sleep
saves more than a few Worker milliseconds.

## Prices and resources

Workers Paid minimum: **USD5/month per account**. Allowances are shared with scanner
and other account applications, never recreated per service.

| Containers resource | Included monthly | Overage |
| --- | --- | --- |
| Memory | 25 GiB-hours = 90,000 GiB-seconds | USD0.0000025/GiB-second |
| Active CPU | 375 vCPU-minutes = 22,500 vCPU-seconds | USD0.000020/vCPU-second |
| Provisioned disk | 200 GB-hours = 720,000 GB-seconds | USD0.00000007/GB-second |
| Europe/North America egress | 1 TB | USD0.025/GB |

Measurement periods are 10 ms. Memory uses **GiB**, disk **GB**; a vCPU-second is
compute work rather than HTTP waiting time.

| Instance | Available CPU | Memory | Disk | Awake memory+disk/hour before allowance |
| --- | --- | --- | --- | --- |
| `lite` / `dev` | 1/16 vCPU | 256 MiB | 2 GB | USD0.002754 |
| `basic` | 1/4 vCPU | 1 GiB | 4 GB | USD0.010008 |
| `standard-1` / `standard` | 1/2 vCPU | 4 GiB | 8 GB | USD0.038016 |

veraPDF's Java heap alone is 384 MiB, excluding `lite`/`dev` before Python/native/
system memory. Custom sizes require at least one vCPU and 3 GiB/vCPU, so cannot
make a cheaper `basic` equivalent. Moving standard-1 → basic reduces memory/disk
hourly cost **73.7%**, but halves CPU; qualify reference PDFs, startup, memory and
deadlines. At 0.25 vCPU, ten vCPU-seconds already needs forty seconds at capacity.
Do not extend engine/Worker **40/45-second** deadlines to conceal this limit.

## Sleep matters

Initial candidate: `standard-1`, max one instance, `sleepAfter="2m"`. A lone request's
120-second idle tail costs USD0.0012672 memory/disk, or USD0.0003336 on basic.
Twenty-second sleep cuts the tail **83.3%**; five seconds cuts **95.8%**, to
USD0.0000139 on basic. These are tail savings, not total bill savings.

Short sleep must preserve in-flight work with the installed SDK. Configuration
alone proves no exact Cloudflare shutdown time. Retain selected setting/proof in
[activation evidence](PDF_VERIFICATION_ACTIVATION_RUNBOOK.md). Public health/capabilities must
not call the engine. Private validator `/health` **wakes** it; never use as periodic
availability polling. Scanner startup/memory requires separate qualification.

## Historical local measurements and candidate choice — 3 October 2026

3 October Docker `linux/amd64`, no network, read-only root, no swap, matched
CPU/memory quotas; **not hosted Containers proof**. Engine/Worker budgets remain
40/45 seconds. JVM retains `-Xmx384m`, adds `-Xms32m`,
`-XX:ActiveProcessorCount=1`, `-XX:+UseSerialGC`, `-XX:TieredStopAtLevel=1`.
Identical corpus includes twelve positive/negative references across six profiles,
synthetic PDFs, concurrency, refusals and synthetic process-deadline testing; the
last is no actual Java timeout on a real PDF.

| First local batch, no large PDF | Initial `standard-1` | Optimized JVM `basic` |
| --- | --- | --- |
| CPU/RAM | 0.5 vCPU / 4 GiB | 0.25 vCPU / 1 GiB |
| Cold health | 18.267 s | 19.296 s |
| Slowest reference | 16.608 s | 17.398 s |
| Batch peak memory | 125,284,352 bytes / 119.5 MiB | 102,690,816 bytes / 97.9 MiB |
| Timed-request CPU sum | 64.567 vCPU-s | 33.564 vCPU-s |
| Final cgroup total CPU | 66.856 vCPU-s | 34.963 vCPU-s |
| Total minus requests | 2.289 vCPU-s | 1.399 vCPU-s |

Request CPU falls approximately **48%**. Total-minus-request is an upper estimate
of startup/initialization/driver probes, not pure universal Cloudflare startup.
Sub-GiB peaks justify testing basic, not a bound for all PDFs; lite/384 MiB heap
remain incompatible.

Stress PDF: **100 pages, 9.887 MiB**, SHA-256
`d3e4f48e0c7bd3ca3f8739062eac029a0d68d801fa04430dad4d351e96bc391e`.
Twelve references and six large-PDF results match between images excluding timing;
no customer data.

| Large PDF across six profiles | Old `standard-1` | Optimized `basic` |
| --- | --- | --- |
| Time/profile | 18.380–19.598 s | 18.913–20.289 s |
| CPU/profile | 4.399–5.163 vCPU-s | 2.273–2.586 vCPU-s |
| Full-batch peak memory | 192.5 MiB | 165.7 MiB |
| Supplement cold health | 17.142 s | 17.753 s |
| Full-batch request CPU | 91.456 vCPU-s | 48.244 vCPU-s |
| Final full-batch cgroup CPU | 93.671 vCPU-s | 49.522 vCPU-s |
| Total minus requests | 2.214 vCPU-s | 1.278 vCPU-s |

Full-batch request CPU reduction remains approximately **47%**. cgroup counters
include the local Python driver; useful comparison, not hosted billing telemetry.
Basic cold-plus-slowest sums to **38.042 seconds**, below 45, but this is not a
hosted end-to-end request or a guarantee for other PDFs. That dated local evidence
selected **basic/five-second sleep as candidate**, preserving profiles, bounds,
cleanup and deadlines. The fresh result above supersedes that selection.

Local evidence:

- [Versioned resource/cost summary](../apps/pdf-validator/tests/benchmark-fixtures/local-resource-proof.json), with hashes of [basic](../apps/pdf-validator/tests/benchmark-fixtures/local-docker-basic-proof.json) and [standard-1](../apps/pdf-validator/tests/benchmark-fixtures/local-docker-standard-1-proof.json) full-batch observations.
- The retained original standard-instance proof, image `sha256:ae8a2523611c2f72763856a61808662cbd83fbdf2a44a586d10170c64b5ac840`.
- The retained optimized-basic proof, image `sha256:e2a8edd58c410cd9639b3350ee66d573cc7b0c7b6409bfed4d5a45f4715af1ca`.
- The retained standard-instance large-file proof and `docker-basic-large-proof.json`: six-profile large-PDF supplement.

Private scratch artifacts belong to their qualification workspace, not public URLs.
Relative links are retained repository evidence; release proof must hash the
actually hosted image.

### Choosing sleep from startup cost

Basic awake memory/disk costs **USD0.00000278/s**. Local startup upper estimate
1.399 vCPU-s costs **USD0.00002798** CPU before allowance, equivalent to **10.06 s**
of idle memory/disk. Full-batch 1.278 vCPU-s gives **9.20 s**: roughly **9–10 s**;
the conservative model uses 1.4. This excludes next startup memory/disk and Durable
Objects, so is no universal traffic optimum.

Without measured pilot traffic, **five seconds** is the short-sleep candidate:
less tail than 20/120 with a small close-request reuse window. One second reduces
idle further but may add restarts. SDK must keep in-flight work alive and restart
timing after responses. Final publication waits for hosted stop/resume qualification;
Docker/settings are no deployed or already-billed savings claim.

## Reproducible model

Let monthly `T` be total awake seconds, `M` provisioned GiB, `D` disk GB, `U` active
vCPU-seconds. Other account usage `Am`, `Ad`, `Au` uses the same units. Marginal
validator Containers cost:

```text
memory = [max(0, Am + M*T - 90000) - max(0, Am - 90000)] * 0.0000025
disk   = [max(0, Ad + D*T - 720000) - max(0, Ad - 720000)] * 0.00000007
CPU    = [max(0, Au + U - 22500) - max(0, Au - 22500)] * 0.000020
```

Gross cost before allowance:

```text
(M*T*0.0000025) + (D*T*0.00000007) + (U*0.000020)
```

Do not subtract allowances already consumed by scanner. Use actual account metrics
rather than assuming `Am=Ad=Au=0`.

### Isolated and closely spaced requests

Explicit planning assumptions:

- `N` accepted diagnostics/month, **assumed** 1–10 vCPU-s each, not measured veraPDF consumption.
- `B=N` starts for isolated requests; `B=N/10` for uninterrupted ten-request series. This models traffic, not a batch API.
- Twenty-second startup/series, rounded near local cold-health evidence. Generic Cloudflare 1–3-second startup statements do not replace image measurements.
- Startup CPU `K`: 1.4 vCPU-s basic, 2.3 old standard-1, from local differences.
- Processing `W`: twenty/forty seconds for low/high; CPU `C`: one/ten vCPU-s. Time and CPU are independent assumptions. Add actual alarm/cleanup/shutdown consumption not included here.
- Sleep `S`: `T = B*(20+S) + N*W`; `U = N*C + B*K`.

**Gross Containers only**, before monthly allowances:

| Diagnostics/month | Distribution | standard-1 / 120 s | basic / 120 s | basic / 20 s | basic / 5 s |
| --- | --- | --- | --- | --- | --- |
| 100 | Isolated | USD0.176–0.215 | USD0.049–0.073 | USD0.021–0.045 | USD0.017–0.041 |
| 100 | Series of ten | USD0.038–0.077 | USD0.012–0.035 | USD0.009–0.033 | USD0.009–0.032 |
| 1,000 | Isolated | USD1.756–2.147 | USD0.493–0.728 | USD0.215–0.450 | USD0.173–0.409 |
| 1,000 | Series of ten | USD0.384–0.775 | USD0.117–0.353 | USD0.090–0.325 | USD0.085–0.321 |

Isolated basic/5 s: **USD0.000173–0.000409/diagnostic**, versus standard-1/120 s
**USD0.001756–0.002147**. Includes assumed startup/tail, only modeled Containers,
not guaranteed arbitrary-PDF or whole-account price.

1,000 isolated basic/5 s requests model **12.5–18.1 awake hours**, **12.5–18.1
GiB-hours**, **50–72.2 GB-hours**, **2,400–11,400 vCPU-seconds**. If allowances remain
fully available, incremental Containers cost is zero; subscription/other services/
account use remain. High compute approaches basic's engine deadline and proves no
actual acceptance within it.

### Awake for the whole month

One instance bounds concurrency, **not monthly account budget**. Continuous requests,
even busy replies, may prevent sleep. Gross **31-day** scenarios before allowances/
other costs:

| Single awake instance | Memory+disk | With average active CPU matching stated capacity |
| --- | --- | --- |
| basic | USD7.445952 | USD20.837952 |
| standard-1 | USD28.283904 | USD55.067904 |

These model 744 hours at average 0.25/0.5 vCPU. Documented capacity alone proves no
guaranteed billable CPU cap. They cap neither Workers/DO/scanner/storage nor whole
Cloudflare invoice. A per-customer request limit is no global cost bound when
many customers can submit paid checks. The former subscription allowance is
retired; current unit pricing is documented in [PDF_VERIFICATION_PRICING.md](PDF_VERIFICATION_PRICING.md).

## Other invoice items

| Item | Accounting boundary |
| --- | --- |
| Workers | Standard: ten million requests/month then USD0.30/million; thirty million CPU-ms then USD0.02/million. Waiting is not CPU. Service bindings add no Worker request fee; called-Worker CPU counts. |
| Durable Objects | Each Container has one DO. One million requests/400,000 GB-s included; then USD0.15/million requests, USD12.50/million GB-s. Duration assumes 128 MB per active/nonhibernating object; documented rounding means tiny overage is not an exact fraction of a cent. |
| DO state | SQLite/alarm work can survive Container sleep. Persistent state bills until deletion; it differs from ephemeral Container disk. |
| Logs | Private configuration disables persistent observability. Enabling consumes Workers Logs allowance/may add fees. FAQ announces Containers Observability log pricing from 1 December 2026; recheck beforehand. |
| D1/R2 | Shared document/history/report storage and operations are separate. |
| Images | Cloudflare states compute bills active instances rather than unexecuted prepared images; documented image storage limit 50 GB/account. Cited pages state no separate registry price; this is no permanent price promise. Keep needed rollback images before deleting older ones. |

Sleep stops Container resources, not subscription, requests, persistent state or
other services. Never promise an all-asleep zero invoice.

## Qualification and monitoring

1. Qualify selected size with positive/negative corpus, cold start, deadlines, concurrency/cleanup; retain timing/memory. One-CPU testing does not qualify 0.25-vCPU basic.
2. Keep one shared DO name, one instance/calculation, no periodic wake/keepalive/per-customer instance. Reuse idempotent results after checking current authority.
3. Reject unauthorized/exhausted-quota work before engine calls. Preserve bytes/time/no automatic retry; errors also consume resources.
4. After publication compare Container/Worker/DO/scanner metrics with model. Public nonwaking probes suit monitoring; engine probes are occasional qualification. Cost alerts inform without guaranteeing billing suspension.

### Actual billable usage

Pay-as-you-go operators with `Billing read` use **Manage Account → Billing → Billable
Usage**. Select the account **billing period**, potentially different from calendar
month, then product/family. Record `Total usage` including allowance, `Billable usage`
over allowance and per-product `Usage cost`. Capture before/after qualification
and after real use, documenting other scanner/account workload changes. A global
delta cannot all be attributed to PDF verification. Compare consistent units without
subtracting included allowance twice.

This view shares invoice data but shows **usage overages**, not fixed subscriptions.
Completed-period invoice remains final. Enterprise uses contract terms without
this pay-as-you-go view. Budget alerts email whole-account overages and **neither
suspend nor cap usage**. This document creates no alert/recipient; later setup must
record operator-chosen scope/threshold.

### Measurement-led architecture

If Java startup dominates, distinguish Container start from a new veraPDF process
per document. Longer awake time avoids some Container starts but not the current
per-document Java launch. Compare identical corpus, cold/total/report CPU, peak
memory, profiles and near-byte-limit PDFs. HTTP duration is no CPU metric. A smaller
image that leaves provisioned disk unchanged but removes needed fonts/dependencies
is no useful saving.

Material measured gains may justify reusable JVM/direct veraPDF Java API with
same pinned profiles. Requalify verdicts, bounds, deadline termination and cross-document
erasure. Cost never justifies cross-tenant cached content or weaker isolation.
One-instance/deadline bounds remain; resident JVM must not prevent sleep.
Compare actual avoided startup CPU against extra awake cost:

```text
awake cost = added seconds * (M*0.0000025 + D*0.00000007)
avoided startup CPU = actually avoided vCPU-seconds * 0.000020
```

This marginal comparison assumes exhausted allowance and excludes DO. Measure close
traffic before extending sleep; spaced clients pay the whole tail without reuse.
Claim realized savings only after candidate measurement/qualification.

## Official sources

Fetched directly on 3 October 2026:

- [Containers pricing](https://developers.cloudflare.com/containers/platform/pricing/), updated 28 August: provisioned resources, active CPU, allowance, egress, Worker/DO charges.
- [Limits/instance types](https://developers.cloudflare.com/containers/platform/limits/), updated 30 September: sizes, aliases, custom minima, image storage.
- [Lifecycle](https://developers.cloudflare.com/containers/concepts/architecture/), updated 30 September: startup, prepared images, stop, ephemeral disk, no instance-lifetime guarantee.
- [FAQ](https://developers.cloudflare.com/containers/faq/): startup/sleep/announced log pricing.
- [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/), updated 2 October: account minimum/allowances/CPU/bindings/D1/R2.
- [DO pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/): duration, 128 MB, allowance, rounding, persistent state.
- [Billable usage](https://developers.cloudflare.com/billing/manage/billable-usage/), updated 30 June: access/period/fields/usage cost/invoice.
- [Budget alerts](https://developers.cloudflare.com/billing/manage/budget-alerts/), updated 29 May: whole-account notifications without automatic cap.

Recheck candidate configuration/guarantees in
[wrangler.jsonc](../apps/pdf-validator/wrangler.jsonc),
[Worker](../apps/pdf-validator/src/index.ts),
[container server](../apps/pdf-validator/container/server.py),
[PDF_VALIDATOR.md](PDF_VALIDATOR.md). Hosted version/qualification require separate proof.
