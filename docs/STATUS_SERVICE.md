# Guteneo service status

`https://status.guteneo.com/` serves customers, product staff and on-call operators.
Its own Worker/European D1 are independent of business bindings, secrets, documents,
accounts and providers. Both services still depend on Cloudflare.

Status interface source copy is English. The browser offers English and French,
selected by `?lang=en|fr` or the browser language; unsupported or malformed explicit
choices fall back to English. Static labels, dynamic observations and animations
share the English-keyed French catalog in `apps/status/public/locales/fr.js`.
The page accepts historical French feature labels and current English report
labels through exact aliases without rewriting stored reports; duplicate aliases
for one feature are rejected. Historical checks retain their observed URL, including
the former developer route, while new probes use canonical English paths.
Legal/privacy links and the content anchor use the
same English routes as the main website.

## What evidence establishes

- **Observed production:** fourteen anonymous reads on a fixed allowlist of public pages/contracts/expected access refusals every fifteen minutes, without quotes, sends, purchases, hosted scans or paid rendering.
- **Locally qualified functions:** real production-mode domain, local D1/R2, synthetic scenarios and provider transport replaced at boundaries. System-level offline restrictions retain dated evidence separate from production.
- **Unverified:** recipient delivery, provider services, actual scanner integration and unexecuted authenticated journeys. HTTP/simulation never turns these into success.

See [offline tests](TESTING_OFFLINE.md) and [nonconsuming dispatch validation](PRODUCTION_DRY_RUN.md).

## Production browser reports — 24 October candidate

The candidate adds evidence separate from the fourteen Cron reads: a GitHub
workflow on `main`, every six hours or manually (`production-e2e.yml`), observing
only fixed canonical public URLs. Its 28 checks combine fourteen Chromium journeys
(seven pages in desktop and simulated mobile views) and fourteen public HTTP
contracts. Pages cover the four home languages and Roles, Developer and ChatGPT
guides. This does not qualify a physical device.

**Public browser journeys** shows the latest execution, tested product commit,
currently observed commit, freshness, checks and GitHub execution link. Runner
commit remains distinct from deployed product commit. After eight hours, a
version change or absent/invalid evidence, presentation is neutral: an old pass
cannot qualify the current version. A recent actual discrepancy stays visible.
This report neither replaces nor changes the fourteen availability checks.

**Authenticated distribution and receipt** remains **To qualify** until dedicated
test accounts and the real journey under the selected document authentication
policy are qualified. Strong mode additionally requires qualified strong
authentication; the explicitly selected `verified_account` mode does not claim
MFA. Neither mode gets a synthetic success or incident badge. Local TesterArmy
success is not authenticated production execution. The public workflow creates
no account, document, quote, purchase, message, provider access or business order.

Report writes use verified GitHub OIDC bound to the body fingerprint, repository
and allowed workflow. The runner gets no Cloudflare write secret or business
credentials. `GET /api/e2e-status` is public read-only; opening status launches no
test. Received reports are bounded and sanitized: only fixed check identifiers,
allowed codes, durations, states, commits and public GitHub references appear.
They contain no customer content, account name, screenshot, raw log, recipient,
token or private URL. External links are rebuilt against the expected repository.

The UI reads on opening, explicit refresh, then every fifteen minutes while
visible; returning from a hidden tab refreshes only after that interval. Reads
consume shared account quotas. GitHub runner minutes and report storage remain
subject to repository terms; cadence promises neither free use nor a bill cap.
Only sanitized JSON is retained as a workflow artifact for fourteen days.

Candidate sources: `apps/status/production-e2e.ts`,
`apps/status/public/production-e2e.js`, `scripts/production-e2e.ts`,
`tests/production-e2e/`, `.github/workflows/production-e2e.yml` and status migration
`0002_production_e2e.sql`. Local presentation qualification on 24 October:
**37 passing status UI tests**, including ten new desktop/390/320 px scenarios
(current, absent, stale, changed version, actual discrepancy, blocked check,
inconsistent contract and unauthorized link). These are synthetic UI responses.
Executed hosted workflow, OIDC ingestion, status publication and the first real
report read remain separate, unestablished evidence.

## History and interpretation

Service view shows public monitoring, freshness, three check groups and history.
Fourteen recent successful checks give a positive result within that scope. Only
observed discrepancies alert; absent/invalid/stale measurements remain unknown.
Missing business coverage is not an outage and does not degrade that result.
Verifications view preserves detailed checks, local proof and journey coverage;
out-of-public-scope/inactive functions use neutral badges. Neither simulation nor
configuration becomes delivery proof.

7/30/365-day views use actual observations. Availability is measured over received
samples; expected-slot coverage is separate. Unobserved days remain unknown, with
no invented preactivation history. One snapshot per slot plus daily aggregates
bounds annual reads. Retention: 366 days. Stale observation downgrades state to
unknown. Public reads can neither run tests nor write results.

## Operations

1. Check the last observation time before interpreting state.
2. For stale history, inspect Cron Trigger, `guteneo-status` errors and `STATUS_DB`.
3. For public-contract failures, compare the check with actual response/release. Create no quote/send to diagnose availability.
4. Corrected sources need new local qualification; an old report proves no new version.
5. Wait for fresh collection after correction; never rewrite historical snapshots to green charts.

Only public facts/times/codes appear, never customer content, recipients, dispatch
IDs, tokens or signed URLs. Seasonal effects are bounded, optional, status-page-only
and respect `prefers-reduced-motion`.

## Resources and cost

On 10 October 2026 the user explicitly allowed existing Cloudflare quotas with
**no business cost**. Workers Standard applies; a Free Website domain does not
make Workers free. Available credentials cannot read subscription/invoice, so no
final bill is inferred. Official prices checked on that date:

| Resource | Workers Paid account inclusion | Overage |
| --- | --- | --- |
| Worker requests | 10 million/month | USD0.30/million |
| Worker CPU | 30 million ms/month | USD0.02/million ms |
| D1 reads | 25 billion rows/month | USD0.001/million |
| D1 writes | 50 million rows/month | USD1/million |
| D1 storage | 5 GB | USD0.75/GB-month |
| Direct static files | Unlimited | Free |

[Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/),
[D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/).
Allowances are **account-shared**, not reserved. The subscription already exists;
none is added.

Fifteen-minute collection means 2,880 runs/40,320 Guteneo reads in thirty days;
Guteneo's own incoming quotas may also apply. Direct static pages bypass Worker;
state/history reads invoke it according to audience. Cache reduces D1 reads without
promising free Worker requests. Do not enable Workers Caching before static files,
which changes their billing.

Annual aggregates read at most 1,460 rows/request. Collection launches no hosted
browser/container. Bounds reduce cost without capping invoice. Build/startup/
latency/resource observations belong with publication proof. Final-schema local
measurement: eleven row writes for first collection excluding purge; 1,462 full-year
reads (1,460 aggregates plus two metadata). Prepared Worker approximately 22 KB,
under 8 KB compressed. 50 ms invocation CPU cap is a setting, not measured use.
Hosted memory/CPU still need Cloudflare metrics; do not extrapolate local timings.

`npx playwright test -c playwright.status.config.ts --project=chromium` uses synthetic
responses and loopback static serving without collection/D1. CI retains UI, service,
security and product tests. Production measurements/first actual Cron remain separate.

## Publication and rollback

Observed **10 October 2026**: service/application exposed
`c953596dc0650961a7294da622703f5edc3a764d`; **20 status assets** verified.
First Cron completed **02:45:05.570 UTC**, **14/14 public checks passed**.
02:45:37.358 reread found one sample in each 7/30/365 window; earlier days stayed
unobserved. Public proof qualifies no authenticated business journey/delivery.

`npm run build:status` creates static files/source-bound manifest. Local qualification
is included only when scope/fingerprint match current sources; otherwise unavailable.
The fingerprint is rechecked after migration before publication.
`npm run deploy:status` requires clean `main` matching freshly fetched `origin/main`,
applies only dedicated status migrations and deploys its Worker, never business
migrations. Verify domain, headers, manifest hashes, three windows and first real
Cron. Empty precollection periods remain unknown. Main-site link uses normal
`npm run deploy:live` release.

Rollback selects a verified Cloudflare version, retaining observations and checking
compatibility. Do not delete history as a rollback mechanism.
