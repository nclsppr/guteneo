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

### Version anchor, readable notes and portable test proof

Every production application version has an authored
`docs/releases/<package-version>.md` beginning with `# Guteneo <version>` (an
em-dash title may follow). Describe visible changes, controlled capabilities,
validation and remaining limits in ordinary language. A commit list is not a
release explanation. The CI verifier requires the matching note and generates
the [portable test report](CI.md#portable-release-test-evidence).

After exact-current-main CI succeeds, an authorized operator creates the remote
`v<package-version>` tag on that exact main commit and its GitHub Release. Do not
move an existing version tag to a newer commit: choose a new synchronized version.
Mark the release as a candidate until the separate served verification succeeds.
The live publisher's `verifyReleaseTag` guard queries the remote tag directly
before building and again immediately before deployment; it accepts lightweight
or annotated tags only when their resolved commit is the checked clean main.
Missing, stale, malformed or unreachable tags, mismatched note versions and a
different manifest version stop publication. Local cached tags cannot satisfy it.
The preview application retains its separate contract.

Download the successful exact-source verification artifact, preserve its run and
attempt provenance, and attach `test-proof.html` and `test-proof.json` to the
GitHub Release. Link the HTML asset directly as **Download test proof (HTML)**;
it opens offline with its selected screenshots embedded and does not require an
Actions login or a local report server. Standalone synthetic PNGs may also be
attached and shown inline. The GitHub Release body uses the authored note and
links to those actual uploaded assets; an Actions artifact URL alone is not the
reader-facing proof. Upload is an authorized release operation, never a side
effect of the read-only checks workflow.

After publication, attach the separate sanitized served-verification receipt and
update the release's deployment status. Preserve the tested synthetic merge SHA,
reviewed head and any identical-tree reuse provenance; do not relabel a prior PR
execution as a main test rerun. Test proof, tag creation and production receipt
establish separate facts. Provider readiness, marketplace publication and real
delivery remain separately qualified.

An MCP change must include the updated ChatGPT plugin and downloadable archive in
the same release. Follow the [MCP/plugin synchronization contract](LLM_SETUP.md#mandatory-mcp-plugin-and-archive-synchronization)
before review and CI. Package builders reject a stale source/package record and
regenerate the archive from the checked sources. After authorized publication,
verify the guide download and compare its bytes with the release's
`integrations/manifest.json` SHA-256 as part of the served-asset verification below.
An OpenAI portal update and real host qualification remain separate operations.

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

## Operator-triggered application publication

The separate [`manual-application-release.yml`](../.github/workflows/manual-application-release.yml)
workflow is an explicitly dispatched production operation. It does not change
`dependency-release.yml`, widen bot eligibility, create credentials or publish
from a pull request. Its read-only GitHub token cannot merge, create a tag or
attach release assets. Complete the version/tag, readable notes and portable
release-proof steps above before dispatching it.

Supply the exact forty-character current `main` commit and the successful
`Guteneo checks` push run ID and current attempt. The dispatch revision, fresh
remote `main`, checkout, canonical CI workflow, full or strictly rechecked reused
job inventory and exact remote version tag must agree. A changed main or concurrent
CI retry fails qualification. Both manual and eligible dependency publications
share `guteneo-production-application` concurrency without cancelling a started
operation. Repository administrators must still avoid advancing main while a
publication is in progress; Git and Cloudflare operations are not atomic together.

The workflow requires the existing `CLOUDFLARE_APP_RELEASE_API_TOKEN` solely for
application publication and a separate, already authorized
`CLOUDFLARE_D1_MIGRATION_API_TOKEN` for the fixed production database. No secret
value is an input or artifact. The documented application token has no D1
permission. A missing/refused D1 credential fails before schema mutation or
publication; this workflow has no fallback to scanner credentials, personal OAuth,
operator-supplied proof or a wider token. Creating or expanding access remains a
separate explicitly authorized operator action. A read-only D1 credential can
qualify an already-current schema; a pending migration also needs the provider's
actual write authorization.

The manual schema runner is deliberately bounded to the reviewed additive indexes
`0081_approval_request_lookup.sql` and `0082_pdf_validation_history.sql`. It accepts
only the exact source-prefix ledger through migration 0080, 0081 or 0082, compares
the complete application schema with the locally qualified source/transport
schema, and requires enabled foreign-key/CHECK constraints. It will not replay
older migrations, accept a future migration, change runtime configuration or
seed data. An older, divergent or unreadable production schema needs its own
reviewed reconciliation instead of a relaxed release gate.

Before any write, it retains a Time Travel bookmark and rechecks current source,
CI and tag. Each missing index and its ledger row use one atomic D1 API batch;
an in-flight marker is retained before invocation. There is no automatic retry
of an unknown response. Afterward the exact ledger and complete schema must match,
with global `quick_check=ok`, no foreign-key violations and enabled constraints.
The global check's resource refusal is a failure, never a partial-table substitute
or a passing integrity claim. The existing
[migration transport protocol](D1_MIGRATION.md) owns its equivalence proof.

Only a successful schema receipt generated within that same workflow run/attempt,
for the same commit and version, permits the publication step. It freshly rechecks
main/CI/tag and calls the unchanged guarded `deployPublic("live")` implementation.
This rebuilds exact clean main and verifies canonical served assets afterward.
The D1 token is absent from that publication step. Runtime publication does not
activate future schedules or customer callbacks, authorize a real communication,
provision infrastructure or publish private services.

The `manual-application-release-<run>-<attempt>` artifact retains sanitized
qualification, schema hashes/ledger names/bookmarks, in-flight state, publication
status, build log and public release manifest. It contains no document rows,
recipients, content, tokens or signed URLs. A failed schema/publication step can
already have changed production; inspect the actual ledger and served release
before another deliberate dispatch. Do not automatically restore a bookmark or
roll back runtime. Attach the separately verified public receipt and update the
GitHub Release status under the existing procedure above.

The local guard tests use synthetic GitHub/D1 responses and real reviewed migration
files. They establish refusal, ordering and no-retry behavior, not hosted
permissions, schema integrity or a deployed release. Run
`node --test tests/security/manual-application-release.test.mjs` and the unchanged
main-only/dependency-release guard suites; exact-source hosted CI and the actual
manual run remain separate required evidence.

### Explicit local operator publication with existing OAuth

An authorized operator can separately run `scripts/operator-application-release.mjs`
from clean exact `main` when the dedicated CI D1 credential is unavailable. This
does not create a secret, widen access or make the workflow accept an external
receipt. It requires the existing Wrangler consent for the single production
account, renewed through the official login with exactly `account:read`,
`user:read`, `workers_scripts:write`, `workers_routes:write`, `d1:write`,
`zone:read` and `offline_access`. The profile must remain encrypted in the OS
keyring, under an explicit `XDG_CONFIG_HOME`. No token is extracted or copied.
Because `gh` also follows `XDG_CONFIG_HOME`, set `GH_CONFIG_DIR` explicitly to its
existing authenticated configuration directory when isolating the Wrangler
profile. Preserve that configuration in place; do not export its credentials.

```sh
node scripts/operator-application-release.mjs --confirm-production \
  --commit <full-main-sha> --ci-run-id <successful-main-run> --ci-run-attempt <attempt>
```

The operator uses the existing authenticated `gh` CLI to recheck the same canonical
main/CI job inventory and exact published version tag. It refuses active production
publishers, ambiguous inventories, implicit `.env`/`.env.local` files, alternative
credentials, endpoints, environment/account overrides and wider OAuth grants.
A local exclusive lock fences another instance. Keep remote dispatch and main
advancement paused throughout: local and GitHub locks cannot atomically exclude
each other.

Source/CI qualification and the active-publisher inventory each use a fresh
bounded reader with the existing 60-second deadline. Neither phase borrows time
from the other, skips reads or accepts cached results. A timeout still stops
before the next mutation. The 12 November 2026 local qualification exposed this
boundary: sequential authenticated reads behind the session proxy exhausted a
shared deadline even though each phase completed within its own budget.

It reuses the reviewed two-index migration guard and complete local transport
proof, checks hosted global integrity before any migration and again afterward,
retains Time Travel bookmarks, and independently reads the exact schema, ledger,
constraints and foreign keys. Resource refusal remains failure. Each index and
its ledger row are one `wrangler d1 execute --command` operation. The atomicity
contract comes from Cloudflare's documented
[`d1 migrations apply` rollback guarantee](https://developers.cloudflare.com/d1/wrangler-commands/#d1-migrations-apply):
the locked Wrangler 4.152.0 builds migration SQL plus its ledger INSERT and invokes
the same `executeSql(command)` → `executeRemotely` → single `/query` SQL path.
A runtime version guard refuses a different installed Wrangler version until its
rollback path has been reviewed. The Worker `db.batch()` documentation alone is
not the evidence for REST atomicity.

There is no automatic retry after an unknown response and no imported schema
receipt. One process retains its source-bound evidence in a private temporary
directory, rechecks qualification immediately before the existing guarded live
publisher, and verifies served release bytes. Inspect any in-flight record and
the hosted ledger before deliberately rerunning. After a killed process, inspect
the lock's PID and evidence before removing a stale local lock. This runner cannot
relax integrity checks, publish from a feature branch or bypass CI.

## CI boundaries

`Guteneo checks` runs for every PR and `main` push without path filters. It retains
`scanner`, `checks`, four Vitest shards, `security`, `build`, three browser
profiles with three independent shards each, and aggregate `verify`. `/api/mobile/v1`, shared contracts, migrations and npm
dependencies receive complete PR coverage. Main may qualify an identical-source
full PR proof under [the CI contract](CI.md#validate-once-and-qualify-an-identical-main-merge),
or execute the full suite; an unavailable proof never bypasses validation. Required `verify`/`scanner` and branch policy are
unchanged. A separate credential-gated dependency release workflow may publish a
genuine merged Dependabot root npm update after successful exact-current-main CI.
It retains the clean-main and served-verification gates below; see
[the dependency maintenance contract](DEPENDENCY_UPDATES.md) for eligibility,
dedicated credentials and activation evidence.

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
or production deployment within the checks workflow. The dependency preflight
stops incompatible graphs before the costly matrix; the complete current
full application workflow has 24 jobs including qualification;
an eligible main promotion executes qualification, fresh dependency/audit checks,
explicit scanner provenance and independently rechecked verification;
required `verify` and `scanner` protections remain unchanged.

The earlier sequential iPhone job identified the browser critical path. The
[dated hosted timing comparison](CI.md#hosted-timing-qualification--26-october-2026)
records the completed baseline and qualified main runs, their coverage and
measurement limits. More parallel jobs trade repeated setup and runner minutes
for shorter wall time; local guard tests alone establish no hosted speedup.

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
true for preview; local `.env` cannot reverse it. The application checks workflow
receives no production release secret and provisions no paid resource.
Private configuration/secret commands publish no
source and do not use this guard. Production credentials for optional dependency
redelivery belong only to its separate guarded workflow, never PR checks.

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

## Bounded served-file download concurrency

The live publisher validates `GUTENEO_RELEASE_VERIFY_CONCURRENCY` before building
or publishing. Absent means four download workers. Only literal `1`, `2`, `3` or
`4` is accepted; empty, malformed or out-of-range values fail closed. The
standalone served verifier uses the same parser.

For a connection on which parallel large-media downloads exceed the existing
request deadline, run:

```sh
GUTENEO_RELEASE_VERIFY_CONCURRENCY=1 npm run deploy:live
```

Every manifest entry still receives its existing exact byte/hash verification
or explicit configuration/robots treatment. The 30-second request deadline,
source identity, headers, origin and robots checks remain the same. The receipt
records `downloadConcurrency` and `requestDeadlineMs`. This setting controls
operator-side read parallelism and grants no publication bypass, automatic
retry, sending capability or resource provisioning. A failure after publication
still requires actual served-state inspection before another deployment.
