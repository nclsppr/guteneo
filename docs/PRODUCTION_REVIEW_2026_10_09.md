# Production review and monitoring proposal

**9 October 2026** review of deployed source
`4ce1bdd467f9aa35f98e525986db888eff3bf977`. Corrections are a separate candidate.
This review merged/deployed nothing, sent/transferred nothing and activated no
channel/mandate.

## Observations

At review start, canonical and `guteneo-app.nclsppr.workers.dev` reported the same
clean source/source-and-asset hashes, built 9 October 17:45 UTC. Deployed-source
[CI 37928685996](https://github.com/nclsppr/guteneo/actions/runs/37928685996) passed
in **17m03s**; CI does not prove provider journeys. Forty-four initial anonymous
reads checked public pages/four languages/metadata/robots/protected API refusal.
First monitor passed **28 checks** over both hosts, including selected page bytes
against each host's manifest. Public manifest is no independent source attestation:
release still needs clean local `verify-release.mjs`/Cloudflare deployment identity.

| Feature | Remote observation | Still unproved |
| --- | --- | --- |
| Site/languages/guides | Pages/locales/bytes/security headers | Real navigation/accessibility/physical devices |
| Identity | Auth0 configured; private anonymous refusal | Signup/mail/login/expiry/renewal/revocation |
| Documents | Import/render announced, scanner binding | Fresh signatures, scan, exact bytes, private render/deletion |
| Studio | Templates/CSV/XLSX/JSON/XML/generation announced | Authenticated synthetic journey/async PDF result |
| Fax/postal | Send switches on; providers `configured_not_live_validated` | Current quotes/approval/actual handover/callback/delivery |
| Email/protected link | Closed publicly | Separate activation/qualification |
| Horizon/veraPDF | Off | Activation/private checks/authorized debit |
| Stripe/AI | Off | Separate qualification; existing credits are distinct |
| Assistants/native | Anonymous MCP refused; native code present | Real-client OAuth/tools/physical device |
| Belvédère | Included deployed code; unknown private address refused | Platform-watcher access/private data not read here |
| Queue/cron/backups | Instrumentation/contracts in source | Recent activity/delays/DLQ/independent restoration |

## Routing change during review

At **19:04 UTC**, technical-host routes became 404 while canonical remained healthy.
Inspection of the relevant account/role chat confirmed the owner's explicit
canonical-only instruction. This was expected closure, not product outage.
Final monitor uses **14 canonical checks plus three old-host closure checks**:
404 expected, 200/redirect a regression. Earlier two-host evidence stays historical;
this review branch changed no routing. [MAIN_RELEASE.md](MAIN_RELEASE.md) owns
current origin requirements.

## Findings and corrections

1. **Unconfigured signature automation.** Recent scanner-refresh runs skipped; required secret/variable absent ([observed run](https://github.com/nclsppr/guteneo/actions/runs/37950533248)). This did not prove stale signatures: Cloudflare read failed 504. First qualify freshness, then authorized dedicated-credential [scanner maintenance](SCANNER_CI.md). No refresh/deploy here.
2. **False green summary.** production-status accepted coherent responses without identity/scanner and failed to compare send flag/manifest. Corrected with regressions; dependencies/delivery stay `not_checked`. Manifest bound became 512 KiB; other responses remain 64 KiB.
3. **Repeated purge.** Cursor wrapping repeatedly deleted already-purged documents/inflated counters. Fix recognizes only tombstone plus tenant-scoped successful audit written after R2. Same 25-item batches/retention/storage-and-audit recovery; avoids one R2 delete/two D1 writes per repeated item, retaining reads. No billed savings measured.
4. **Archive-heavy CI.** Checkout pulled over 1 GB historic footage/captures. Targeted general profile reduces file volume **65.9%**, preserving tests/public media/narration; specialized profiles smaller. Measured CI **17m03s→14m12s (−16.7%)**, summed job duration **−39.8%**; commands/dependencies/coverage unchanged. Already-compressed artifacts no longer recompressed. [CI evidence](CI.md).
5. **Dependencies.** Compatible tooling/source-map-parser fixes reduced npm high findings **eight→three**, all one MCP OAuth-client advisory, with no identified production-accessible path. [Dated audit](DEPENDENCY_AUDIT_2026_10_09.md) owns versions/migration limits.

## Available local tool

```sh
npm run status:prod
npm run monitor:prod
npm run monitor:prod -- --expected-sha 4ce1bdd467f9aa35f98e525986db888eff3bf977
npm run monitor:prod:live
```

Live mode serves **http://127.0.0.1:8796**, publicly probes every sixty seconds;
UI reads only local results every ten. No cookies/credentials/redirects/arbitrary
target origins. Local server refuses foreign hosts/cross-origin/mutations.
Measurements stale after 120 seconds including `/status`. Ctrl+C stops; no permanent
task. Result separates public passed/attention/disabled/not-tested; exit 0 qualifies
only public scope. JSON retains time/source/status/HTTP codes/durations, no raw
body/token/document/recipient. Mac samples are no global percentile/SLO.

Manifest held 264 assets/~413 MB. Minute monitor does not redownload media;
historical two-host exhaustive release check was ~826 MB. Twenty GET/measurement
means 28,800/day if continuously running. Avoid needless frequency/private-service
wakeups. Dated Workers Standard overage USD0.30/million above shared ten million:
864,000 GET/30 days would cost at most **USD0.2592 request component** if all counted
over allowance. Excludes subscription/CPU/logs/storage/private/other account use,
not an invoice estimate. Actual billed requests/CPU/memory/startup/active time still
need measurement. [Pricing](https://developers.cloudflare.com/workers/platform/pricing/).

## Proposal: per-feature evidence in Belvédère

The following is proposed, requiring separate implementation/activation. It reuses
platform-watcher authority without making ordinary assistants platform operators.

**Continuous observation without business mutations:** show latest evidence/age/
deployed source/error per feature. Reuse Worker events; persist last successful
cron heartbeat, oldest outbox age, DLQ/unknown outcomes. Incidents ignore creation-date
filters so old stuck work stays visible. Use bounded indexed aggregates, no content/
recipient/signed URL/raw logs. A dedicated private collector may read Cloudflare;
ordinary assistant access does not gain platform authority. Missing signals must
alert as well as errors.

**Synthetic hosted journeys:** reserve test workspace/least-privilege accounts,
known PDFs/synthetic data, hashes/codes/expiry. CI production-mode fixtures remain
simulation; a remote canary must traverse actual authorized hosted services.

| Proposed journey | Initial frequency | Evidence/limit |
| --- | --- | --- |
| Pages/locales/manifests/anonymous guards | 60 s | HTTP/selected hashes/origin/time; available via local tool |
| Auth0/test workspace read | 15 min | Real session/current role/expiry, no auth bypass |
| Small PDF import/scan/render | 60 min | Exact hash/ready/render; separate signature freshness |
| Template/tiny dataset/generation | 60 min | Terminal job/expected rows/hashes; dedicated quotas/purge |
| Quote preparation without approval | Daily | Price/provider/expiry; no approve/send |
| Pingen draft transfer | Separate explicit authority only | Actual external transfer/confirmed deletion; excluded by default |
| MCP | After release/daily | Real OAuth/read-preparation, no activated delegation |
| Horizon/protected link/Stripe/AI | After authorized activation | Actual budgets/entitlements/billing, bounded separate tests |
| Restore | Monthly | Isolated restoration/integrity, never overwrite production |
| iOS/assistant clients | After release | Actual device/client/identity/bytes/revocation, not emulation alone |

**Controlled actual communication:** explicitly choose channel, owned destination,
exact content/options/cost ceiling/frequency. Separate human review/send authority,
then provider/callback/receipt observation. Unknown outcomes never auto-resend.
Canaries never renew mandates/activate channels/debit to repair a test.

Initial thresholds need calibration: unexpected error/refusal immediately; public
measurement absent >2 min; cron success absent >5 min; outbox >60 s; DLQ/unknown >0;
signature warning before 48 h/incident before 72 h closure. Judge repeated slowness
across time/locations, not one request. Deduplicate incidents; notify opening/change/
recovery and retain last-notification evidence. Notification channel/destination
still needs choice/authorization before external messaging.

Independent external probing should also detect Cloudflare/collector failures.
GitHub Actions can provide postrelease/backup schedules but may delay; no real-time
promise. [Schedule limits](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule).
This improves measured-scope detection, not all-bug detection. Missing/stale proof
always remains reviewable, never default-green.
