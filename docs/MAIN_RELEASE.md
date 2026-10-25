# Publication from main

Production exposes the customer application at **https://guteneo.com**. The
reviewed candidate also routes **https://belvedere.guteneo.com** to the isolated,
read-only platform control tower; customer routes and bearer authority remain
closed there. Its Auth0 configuration and authenticated hosted journey require
separate qualification under [BELVEDERE.md](BELVEDERE.md). The application
Worker disables its `workers.dev` subdomain and Cloudflare version-preview URLs
(`workers_dev:false`, `preview_urls:false`); verify closure after publication.
`https://guteneo-app.nclsppr.workers.dev` and application version previews are not
fallback access. The fictional `deploy:preview` Worker remains separate under
[PUBLIC_PREVIEW.md](PUBLIC_PREVIEW.md).

Customer browser login and Auth0 callback use `https://guteneo.com`. Belvédère
uses the same client with its exact dedicated-host callback, logout and allowed
origin entries, separate host-only cookies and the unchanged Watcher identity
guard. Keep canonical entries and exclude the old application host; never use a
wildcard or shared parent-domain cookie. Assistant callbacks are separate contracts. Configuration/tests
prove no human signup, callback or reconnection; qualify those separately without
business sending.

## Dated origin-closure evidence

**10 October 2026 user decision:** SES was unused; SNS migration deferral was
explicitly accepted for closing `workers.dev`. Fresh configuration/capability reads
must confirm business email remains disabled. Leave the dormant SNS subscription
and attributes intact, without AWS mutation or sender-permission expansion. Its
historical endpoint becomes unavailable; this is no provider-migration proof.
Missing AWS administrator access no longer blocks closure under these conditions.
Other provider callbacks in use still require inspection and qualification.

The production public read at **2026-10-09T23:49:29Z** (10 October in Paris) reported
`email.liveSending:false`, Resend, and `liveSending:true` for fax/postal. Closure
preserved those settings; [SES_STATUS.md](SES_STATUS.md) tracks the accepted deferral.

Cloudflare reread at **2026-10-09T23:51:27Z** confirmed application subdomain and
previews disabled, with only `guteneo.com` as custom domain. Six old-host routes
returned 404: home, manifest, health, session, login, profile. Canonical manifest,
health and UI returned 200; anonymous session returned 401. Normal/account-change
login used canonical callback and PKCE S256. Observed source remained
`4ce1bdd467f9aa35f98e525986db888eff3bf977`: the routing operation did not publish
new configuration sources. Human-session proof is separate in [ACCOUNT_IDENTITY.md](ACCOUNT_IDENTITY.md).

Before any future SES activation, migrate to `https://guteneo.com/webhooks/ses`;
qualify authenticated confirmation, exact topic, SignatureVersion 2 and equivalent
subscription attributes. Keep the old subscription until the new one is qualified,
then remove only the verified obsolete binding. See [SES_STATUS.md](SES_STATUS.md)
and [SES_SUBSCRIPTION_CONFIRMATION.md](SES_SUBSCRIPTION_CONFIRMATION.md). Identity
provider transactional email is separate; this decision activates no business send.

## Publication gates and sequence

`npm run deploy:live` and `npm run deploy:preview` require local branch `main`,
a completely clean Git tree (tracked and nonignored untracked files), and `HEAD`
exactly equal to `origin/main` after a fresh explicit fetch. Fetch failure blocks
publication; stale local remote refs are insufficient. Index flags
`assume-unchanged` and `skip-worktree` are refused because they can hide changes.

The guard runs before build and again before deployment; the original checked
commit must remain unchanged. The freshly generated `release.json` must have the
exact commit, `sourceDirty:false`, correct mode, expected source scope and current
byte fingerprint, using the shared builder calculation. Every asset is reread and
compared: added, missing or changed files block publication. Preview `health.json`
is checked separately. One final branch/commit/cleanliness check precedes Wrangler.

The shared [`public-site.json`](../packages/contracts/src/public-site.json)
registry owns canonical public page paths and legacy page/download aliases.
Aliases are HTTP redirects in both application and preview routing;
do not add physical stubs at those paths. The real-build regression checks every
alias against both manifests and output directories, including localized page
variants, and checks the canonical download bytes. Preserve strict served-byte
verification: an unexpected redirect fails the release proof. Remove an obsolete
alias file from source and rebuild through normal review/CI gates instead of
following the redirect or excluding the file from verification.

After an authorized merge, fast-forward `main`, verify merged-commit CI and publish
from a clean checkout of that commit. Retain Cloudflare version/traffic, health
and public `scripts/verify-release.mjs` evidence. Review and preserve test-modified
tracked reports according to the task; never automatically delete them to bypass
the guard. Compare release manifest/assets only at the canonical origin:

```sh
node scripts/verify-release.mjs https://guteneo.com dist/web/release.json
```

Separately prove the old application `workers.dev` host and version previews no
longer serve pages, manifest, API or authentication. Retain responses and Cloudflare
configuration as closure proof. Closed hosts do not need release-asset comparison.
Public browser checks target `https://guteneo.com` without opening `/auth/login`
or performing business POSTs. Earlier two-origin proof remains dated evidence.

PDF operators [deploy-pdf-validator.mjs](../scripts/deploy-pdf-validator.mjs)
(temporary qualification) and [qualify-hosted.mjs](../apps/pdf-validator/scripts/qualify-hosted.mjs)
read `/api/capabilities` only on the canonical origin. Their guards require
production mode and PDF verification unavailable before qualification. The closed host is
no second check. [pdf-validator-release.test.mjs](../tests/security/pdf-validator-release.test.mjs)
uses intercepted canonical reads and rejects PDF verification open, unknown or unreachable.
Local evidence does not qualify the hosted PDF service.

Fresh authorized provider inspection may use the existing private Telnyx reader
without extracting credentials or changing callbacks. `application.webhooks.primary`
and `.failover` expose bounded `unknown`, `absent`, `canonical`, `different` states,
plus boolean/null `present` and `matchesCanonical`; no raw URL. Contract/fixtures
prove neither current provider state nor a real signed callback. Retain inspection
results separately; see [TELNYX_READINESS.md](TELNYX_READINESS.md) and
[telnyx-readiness.test.ts](../tests/unit/telnyx-readiness.test.ts).

## CI boundaries

`Guteneo checks` runs for every PR and `main` push without path filters. It retains
`scanner`, `checks`, four Vitest shards, `security`, `build`, three browser
profiles with three independent shards each, and aggregate `verify`. `/api/mobile/v1`, shared contracts, migrations and npm
dependencies use the full suite. Required `verify`/`scanner` and branch policy are
unchanged.

### Parallel browser execution — 25 October 2026 follow-up

The browser matrix runs nine independent jobs: three shards for each of desktop
Chromium, mobile Chromium and iPhone WebKit. Each runner retains one test worker,
its own local D1/R2 state and local server ports. The application and applicable
public-preview suite use the same complete three-part partition. Belvédère runs
once per supported desktop/iPhone profile on shard one; status runs once on the
desktop first shard. Existing browser configurations, assertions, sandboxing,
WebKit media pipeline and independent distribution profiles remain required.

Every project/shard writes uniquely named reports and artifacts. Aggregate
verification independently lists the unsharded browser inventory and accounts for
the complete union of reported test IDs: missing/duplicate/unexpected entries or
absent reports fail the gate. Intentional existing skip semantics remain distinct
from a missing test or a skipped required job. The workflow still checks every PR
and merged main revision, with no path-based coverage reduction, automatic retry
or production deployment. The complete current application workflow has 22 jobs;
required `verify` and `scanner` protections remain unchanged.

Baseline main run [40226465628](https://github.com/nclsppr/guteneo/actions/runs/40226465628)
completed all 16 previous jobs in about 25 minutes 49 seconds. Its iPhone browser
job spent 3 minutes 15 seconds in setup, then ran application tests for 11 minutes
48 seconds, preview tests for 7 minutes 12 seconds and Belvédère for 53 seconds
sequentially. This identifies the browser critical path; dependency installation
was not its main cost in that observed run. More parallel jobs trade repeated
setup/runner minutes for shorter wall time. File balance, runner availability and
network setup still affect actual results. Local guard/partition tests establish
no hosted speedup; compare the next complete exact-source PR and main runs before
claiming an improvement.

`Guteneo iOS` runs XCTest/archive for PRs or `main` pushes changing `ios/**` or
`.github/workflows/ios.yml`. Swift, tests, translations, assets, Xcode project and
native scripts live under `ios/`. Native builds consume no server TypeScript/npm
packages; web/API/dependency-only changes qualify in `Guteneo checks` without
starting a simulator. `workflow_dispatch` retains manual native qualification.
Add any future native dependency outside `ios/` to both path filters.

Web publication requires merged-commit application checks. XCTest/archive evidence
is separate for native changes. Native changes still run the full native suite
on PR and `main`, with unchanged assertions and no automatic retry. Reusing older
proof would additionally require provenance, project, workflow and toolchain
verification; current filtering preserves a fresh run for native changes.

`build:live` and `build:preview` remain available on PR/detached HEAD for testing
and dry runs. `VITE_PUBLIC_PREVIEW` is explicitly false for application builds and
true for preview; local `.env` cannot reverse it. No GitHub secret, CI deployment,
purchase or resource is added. Private configuration/secret commands publish no
source and do not use this guard.

The guard protects project commands, not Cloudflare access policy. Direct
`npx wrangler deploy`, another project, an old script or external administrator
can bypass it. Fetch and Cloudflare submission are not atomic: do not change the
checkout or advance `main` while publishing. It checks Git sources/local artifacts,
not the entire build environment, and replaces neither CI nor remote proof.

Focused CI completeness tests: `node --test tests/security/ci-results.test.mjs
tests/security/ci-browser-results.test.mjs`. These use local synthetic reports and
independent inventory comparisons, not GitHub or production mutations.

Focused release tests: `node --test tests/security/main-only-release.test.mjs`. Real
temporary Git repositories and a local bare remote exercise wrong branches,
dirty sources, stale refs, fetch failure, changes during build, manifest/asset
mismatch and absence of deployment after refusal. Build/deploy are intercepted;
no test accesses the product remote or Cloudflare.

Public artifact and redirect regressions:
`node --test tests/security/preview-release-assets.test.mjs tests/security/verify-release.test.mjs`
builds both static products and checks the verifier with local fixtures;
`npx vitest run tests/unit/public-routes.test.ts` checks GET/HEAD alias status,
target, query preservation and absence of asset reads on both routing surfaces.
These local checks do not replace post-publication verification.
