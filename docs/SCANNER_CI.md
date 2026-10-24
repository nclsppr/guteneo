# Automated scanner maintenance

Initial **23 October 2026, 07:23 UTC** inspection found private health
`SIGNATURES_STALE`, deployment from 2 October, no dedicated GitHub secret/activation
variable and recent scheduled runs skipped. No successful first GitHub publication
had been qualified. This change exposes that condition and adds independent
checking; Git presence is not activation proof. Local Codex automation
`maintenir-l-antivirus-guteneo` was suspended because it depended on the Mac.

## Daily operation

`.github/workflows/scanner-refresh.yml` uses a GitHub-hosted runner daily at
08:17 UTC. It requires `SCANNER_REFRESH_ENABLED=true`; absent/false configuration,
missing secret or invalid expiry now fails visibly. Manual `main` execution is
available before daily activation. No language model/personal computer participates.

The job verifies exact `main` and successful CI including `verify`/`scanner`, builds
Linux amd64 with FreshClam and tests offline: clean PDF, harmless EICAR, exact hashes,
bounds and no retained test documents. It publishes the **same immutable image**
and updates only private `guteneo-scanner`, rechecking main before publication.
After deployment acknowledgement it records version and waits at most five minutes
for previous-image convergence to the qualified image. Waiting only reads; unexpected
image/Worker/scope/public exposure stops immediately. No automatic redeployment.

A runner-local, never-deployed qualification gateway uses private service binding
without customer documents/renderer access. Proof must correlate actually queried
Worker version, 100% traffic, container image and loaded signature database.
Embedded/returned build identity distinguishes images with identical signatures;
desired deployment configuration alone is insufficient. Qualification needs
signatures under **48 hours**; command success alone is no proof.

Each run retains a 30-day GitHub artifact with local/remote proof, commit, versions,
hashes. No daily commit/PR; derived build settings stay ignored. It sends no letter,
changes no account and deploys no public application.

## Local and first hosted evidence

Scanner suite: **46 Node/38 Python tests**, typecheck. A real Linux amd64 container
from `5b5041ab` ran offline with 4 GiB/0.5 CPU: ClamAV 1.5.4, database 28162 dated
23 October 06:24:08 UTC, clean PDF/EICAR/hash/input-bound checks, no document logs/
temporary files retained. It claims no hosted-run identity. Local cold readiness
**52.85 s** is not Cloudflare performance.

First hosted run `39923762583` from `main` `5b5041ab` published the qualified image/
Worker, then failed **08:21:01 UTC** because immediate inspection still saw old image.
Cloudflare converged **08:21:58**. The run remains failed, never rewritten as pass.
At **08:27:39**, separate private qualification without republishing validated Worker
`6f9f4e2d-ade1-4c67-abc2-d490988a9fe0` and image
`sha256:d96e8fd958361ae694e4e3fec9b07e2c99a43cb09abeb10577c5e71069fea752`:
clean/EICAR/hash/empty-and-wrong-format refusal, current 28162 signatures, 100%
traffic, private single European container. No customer document or external send.
Daily activation awaited this convergence fix's merge and a successful hosted run.

## Initial activation

1. Merge after CI; wait for merged-commit CI.
2. Create dedicated Cloudflare token; send directly to [Actions secrets](https://github.com/nclsppr/guteneo/settings/secrets/actions) as `CLOUDFLARE_SCANNER_API_TOKEN`, never chat/repository/history-bearing commands.
3. Set actual UTC `SCANNER_TOKEN_EXPIRES_AT` as `YYYY-MM-DDTHH:mm:ssZ`. Watchdog warns fourteen days ahead; renewal is explicit. Never extend metadata without renewing token.
4. Manually run **Refresh private scanner signatures** on main. Check artifact `result.json` is `status:qualified` and correlates publication/remote evidence.
5. Then set repository `SCANNER_REFRESH_ENABLED=true`; inspect first schedule. Run **Check private scanner maintenance** immediately and verify maintainer Actions failure notifications.

Account ID is fixed. Token must deploy existing Worker, push Containers image,
inspect deployment and use remote binding qualification. Preferred rights:
**Individual Workers Editor**, **Specified Workers:guteneo-scanner**, plus account
**Containers Write**, qualified in the first run. No D1/R2/provider/public-route/
billing access is needed. If remote preview requires more authority, identify the
exact refusal before widening. Actual separately authorized scope differs below.

## Authorized scope — 23 October 2026

Cloudflare picker did not offer one-Worker scope. After explanation, owner explicitly
authorized a ninety-day **Workers Editor + Containers Write** token for the Guteneo
account. It can modify other account Workers and is not presented as scanner-only.
No D1/R2/routes/billing/token-management right was added. Direct secret installation:
23 October **08:18 UTC**; actual expiry **`2027-01-21T22:59:59Z`** recorded in the
variable. Workflow operations remain scanner-only. Reconsider Worker-limited scope
at renewal; never automatically expand authority.

## Watchdog, failures and engine updates

`.github/workflows/scanner-watchdog.yml` runs every six hours at minute 43 or manually.
It fails for disabled refresh, latest completed failed/skipped run, no successful
artifact-backed qualification within thirty hours, or absent/expired/soon-expiring
token. It also requires fresh private health/signatures under 48 hours, qualified
build identity, exact 100%-traffic Worker/image and private container scope.
It reads the hash-checked bounded GitHub archive without extracting files.
Version/deployment/image/signatures must match that exact run; later deployments
cannot borrow old success. Final rereads after warmup also require closed subdomain/
preview URLs. It tolerates five-minute cold startup, never stale signatures.
Serialized workflows avoid measurement during publication; queue retains up to
100 waiting runs rather than replacing the previous one.

Watchdog only reads/`GET /health` through service binding: no document scan, image
publication or deployment. Reports filter errors, tokens and raw remote responses.
Failure notifications use maintainer GitHub preferences, without configured recipient/
message service. Predeployment failure keeps old version; postdeployment qualification
failure means unqualified publication to inspect, not automatic rollback. Stage
report identifies progress. Never blindly rerun during another deployment.

Scanner still rejects databases older than **72 hours**; workflow/Git dates/green CI
never extend it. Missing schedule is no maintenance proof: GitHub may delay schedules
or disable inactive public-repository runs. Six-hour checking detects daily stoppage
but depends on GitHub itself, so cannot report its own disablement, global scheduler
failure or muted notifications. Independent monitoring remains needed for those
failures; no external message/paid monitor is created.

FreshClam updates **signatures**, not engine version. Reviewed image digest remains
pinned; engine updates need PR/tests. No-update antivirus would not preserve
protection against new threats.

Official references: [Cloudflare Actions](https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/),
[Container images](https://developers.cloudflare.com/containers/guides/image-management/),
[Workers permissions](https://developers.cloudflare.com/workers/authorization/),
[ClamAV signatures](https://docs.clamav.net/manual/Usage/SignatureManagement.html),
[GitHub schedule limits](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule).
