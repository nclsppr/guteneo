# GitHub verification pipeline

The required checks remain **verify** and **scanner**. This workflow builds and tests local fixtures only; it does not deploy or receive production secrets. Every pull request runs the full pipeline, and `main` runs it again after merge. Feature-branch push runs have been removed so an open PR no longer starts two copies. No path filters or conditional test selection skip checks on documentation-only changes.

Public-navigation browser checks prove document reuse with a random identifier
bound to the current Window, plus zero document navigation requests. Exact
`performance.timeOrigin` equality is unsuitable for that identity assertion:
the 30 October WebKit run observed a one-millisecond difference within the same
navigation sequence. Timing values remain in the attached measurements; the
identity check has no clock tolerance and still fails on a new document.

## Independent work

- `dependencies`: locked install, supported MCP peers/template engine/transport
  checks and high/critical audit before the costly root build, rendering and test
  matrix. Failed preparation blocks downstream work and aggregate success; the
  independent scanner/PDF-validator checks retain their own locked packages.
- `checks`: TypeScript, ESLint, exact local migration transport/schema verification and the existing cost-model report. `npm run check:integrations` also rejects a stale MCP/plugin synchronization record before the remaining checks; see the [maintained package procedure](LLM_SETUP.md#mandatory-mcp-plugin-and-archive-synchronization).
- Developer documentation: `npm run docs:check` includes the feature-atlas and MCP annotation-document checks once, alongside the other documentation guards. The atlas requires synchronized Markdown/HTML views, valid code/contract/test references and complete role/journey fields. Review also checks that every feature change updates the registry; generated-byte validation alone cannot discover undocumented behavior.
- `vitest`: four native Vitest shards on separate runners. Files remain sequential inside each shard; process isolation, D1/R2 fixtures and all transaction/race assertions are unchanged. Browser-backed integration files, including `secure-resend-journey.test.ts`, are excluded here and run once in `security`.
- `security`: the exact-PDF Chromium integrations, the secure-distribution/Resend journey and **every** Node security test, including Chromium and WebKit setup-form tests. Chromium is installed before those integration files execute. The renderer's existing narrow AppArmor allowance was moved unchanged into `scripts/ci/chromium-sandbox.mjs`; no browser sandbox is disabled.
- `build`: builds the final live frontend once before the unchanged local, private-document and live Worker dry runs, then builds the separate fictional preview and status assets and dry-runs the status Worker. `build:live` uses the same non-preview Vite configuration and integration-package checks as the former initial `build:web`, adding the release snapshot, canonical public pages and manifest. The final artifact already used this live frontend before deduplication. Preview compilation flags and manifests remain separate. TypeScript runs in `checks` rather than again through `npm run build`. The two browser asset directories are passed to browser jobs as a same-run, SHA-named artifact; these are test artifacts, not approved deployment bundles.
- `browser`: nine isolated runners: three shards for each of desktop Chromium, mobile Chromium and iPhone WebKit. Each migrates/seeds its own D1 and retains one Playwright worker. Desktop and iPhone also partition their corresponding public-preview project across the same three shards. Belvédère runs on the first shard of each supported profile; status runs on desktop shard one. WebKit jobs install Chromium too, because the local PDF renderer needs it. CI's explicit `GUTENEO_E2E_PREBUILT=true` starts the existing local server without rebuilding the supplied application artifact; normal local commands continue to build as before.
- `distribution-e2e`: isolated TesterArmy profiles run fourteen `strong` and two `verified_account` account, pricing and secure-distribution results against isolated local D1/R2 and the real local PDF renderer. Identity assurance is an explicit simulation fixture. Model calls, telemetry and browser traces are disabled. The strict gate requires every expected case, zero skips/flakes/model calls and a current privacy marker; artifact upload also scans the captured console output for actual fixture invitations. See [the suite guide](../tests/distribution-e2e/README.md).
- `engineering`: installs root and its own locked dependencies, audits the independent package, checks generated content, builds the static site, runs its Chromium/WebKit browsers and verifies asset-only deployment by dry run. These checks provide no business credentials or publication authority. See the [curated pipeline guide](../apps/engineering/src/content/docs/engineering/ci-and-release.mdx).
- `pdf-validator`: retains its separate locked dependency installation, typecheck and complete validator suite.
- `scanner`: retains its separate dependency installation, typecheck and complete scanner test suite.

The standalone four-language MCP Apps SDK fixtures run once on desktop Chromium
shard three, with the same report paths and immutable evidence selection. They
remain outside the Playwright inventory. The successful 27 October baseline
[40543944920](https://github.com/nclsppr/guteneo/actions/runs/40543944920)
spent 47 seconds on this step in its critical first desktop shard; the next
successful [PR run](https://github.com/nclsppr/guteneo/actions/runs/40553851575)
spent 43 seconds. Moving the step, removing duplicate documentation invocations
already covered by `docs:check`, and avoiding the overwritten frontend build
preserve every assertion. These are measured placement/duplication findings,
not a qualified wall-time improvement; runner queues and artifact transfer vary.

`verify` uses `always()` and depends on every job above. Failed, cancelled or skipped dependencies cannot produce a successful final gate. It merges the five native Vitest blob reports without rerunning tests, checks every assertion succeeded and compares the resulting file list with all current `tests/unit/**/*.test.ts` and `tests/integration/**/*.test.ts`. Missing, duplicated and unexpected files fail. There is no fixed assertion total to update when tests are added. The matrix uses `fail-fast: false` so a failure in one shard preserves the other shards' evidence.

When adding an integration that launches actual Chromium, route it to the existing
browser-equipped `security` job and exclude it from the ordinary Vitest shards.
The routing regression in `tests/security/ci-results.test.mjs` discovers browser
launches, checks that every excluded file executes once in that job and requires
browser installation before execution. The 27 October 2026 secure-invitation
addition exposed this dependency gap during release review; local browser success
does not prove a clean hosted runner has the executable. Keep failed exact-source
CI evidence and qualify the corrected PR and merged revision before publication.

The browser skip registry binds each exception to an exact suite, project, file,
title and reason. Renaming or splitting a test requires checking the independent
inventory against every declaration. The Classic/V2 mobile navigation scenarios
now execute on both desktop Chromium and iPhone WebKit; their former desktop
exception is removed, leaving the other eighteen project-specific skips intact.
The 29 October V2 sidebar geometry case is desktop-only: its two declared
mobile-project skips bring the registry to twenty project-specific exceptions.
The Studio space candidate adds the same exception for its 1280 × 720 check in
`studio-space.spec.ts`, bringing the registry to twenty-two.
The gate still rejects obsolete declarations, unexpected skips and incomplete
execution. Validate registry maintenance with `verifyBrowserEvidence` against
the original current-run reports and fresh inventories, not just `--list` or
synthetic fixtures. This local replay does not replace the next hosted CI run.

The separate `production-e2e.yml` schedules twenty-eight fixed anonymous production checks every six hours. It publishes a sanitized report to the independent status service using GitHub OIDC bound to the report hash. This is distinct from pull-request CI and the fifteen-minute HTTP monitor. It does not receive Guteneo credentials, approve a document, send a message or deploy the application. Missing, stale or version-mismatched reports remain unknown. Real authenticated production qualification is explicitly unavailable until dedicated accounts, genuine Auth0 login under the selected document policy and human-approved synthetic fixtures have been qualified; see [the monitor](PRODUCTION_BROWSER_MONITOR.md) and [account procedure](PRODUCTION_TEST_ACCOUNTS.md).

## Hosted timing qualification — 26 October 2026

The earlier delay combined an oversized sequential browser job, Ubuntu package
download latency in the engineering job, and failures that required corrected
source to pass fresh PR and merged-main checks. Publishing the application and
documentation is a separate, shorter step after those checks. The timing below
measures complete GitHub runs from creation to their final completed job; it does
not include local implementation, human authentication, merge waiting or public
verification.

| Completed main run | Source | Jobs passed | Wall time |
| --- | --- | --- | --- |
| [Pre-sharding baseline, 25 October](https://github.com/nclsppr/guteneo/actions/runs/40226465628) | `03daa4136de8999cc79018f33f2a22038917c621` | 16 | 25 min 49 s |
| [Current qualification, 26 October](https://github.com/nclsppr/guteneo/actions/runs/40254684422) | `f94664ff77c532c0c6b352109f565f6768091c2b` | 22 | 12 min 22 s |

The qualified main run used one attempt. Its independent inventory accounted for
all 1,131 current browser IDs across nine matrix rows and eight suite/profile
inventories: 1,112 passed and 19 retained their declared skip conditions, with
zero retries, missing IDs or duplicates. Vitest covered 135 files and 2,802 passed
assertions. These are dated observations, not fixed coverage thresholds; the
verifiers derive future coverage from the then-current sources.

The observed workflow wall time fell by about 52%. This comparison does not
isolate runner availability, caches or network variability, and it establishes
neither an SLA nor lower aggregate runner cost. Parallel jobs repeat setup.
Continue comparing complete exact-source runs and retain failed-run evidence;
never remove assertions, merge protections or report verification to meet a time
target. An authorized delivery still checks the PR and the actual merged main
revision before deploying, then verifies the served release independently.

`.github/dependabot.yml` proposes weekly grouped updates for all four npm packages
and workflow actions. Routine version updates remain minor/patch, with explicit
MCP peer and PDFme engine compatibility holds. Each update retains the full
pipeline, supported-dependency graph check and high/critical audit. Manifest-only
updates do not invent product documentation requirements. The separate
credential-gated dependency release workflow can publish a merged root npm update
only after full successful exact-current-main CI. The dedicated application release secret was installed on 29 October; merged
workflow activation and its first hosted publication remain to be qualified. The [maintenance contract](DEPENDENCY_UPDATES.md)
owns observed failures, security implications of holds and hosted activation.

## Evidence and caches

`guteneo-verification` contains the complete merged `reports/vitest.json`, original per-job reports/logs, browser HTML/JSON reports, newly generated visual-proof screenshots and failure traces/screenshots, the current restoration proof, and the cost model. Intermediate evidence artifacts are retained for 14 days, including when a job fails; the reusable browser builds expire after one day. Downloaded evidence keeps separate artifact directories to avoid report filename collisions. The historical tracked restoration report is copied only by the shard that actually passed the restoration test. Browser runners remove historical screenshot fixtures before testing so their artifacts contain only images generated in that run.

### Manual reruns and artifact identity

A manual job rerun can leave several immutable artifacts with the same name in
one workflow run. Select the newest creation timestamp for each logical name
before downloading its exact artifact ID; artifact IDs and API listing order do
not establish chronology. The bounded selector reads every current-run metadata
page through `scripts/ci/select-artifacts.mjs`, checks the run/repository/head
identity, and refuses ambiguous timestamps,
expired or malformed latest artifacts. It never falls back to an older passing
artifact. The downloaded browser reports still require the exact execution SHA,
run ID, valid attempt, original digests and complete independent test inventory.
For a pull request, GitHub's run head can differ from its synthetic merge SHA;
metadata provenance and executed-source identity are checked separately.

Only the browser, distribution and aggregate jobs receive `actions:read` for
current-run metadata. Downloads retain the existing action and report formats;
there is no artifact deletion, automatic test retry, production credential or
new release permission. A metadata/read failure blocks the job. Preserve failed
attempts and inspect them before an explicit rerun; a newer failed report must
still fail the unchanged result gate.

On 26 October, merged run `40261598557` passed all 21 prerequisite jobs on its second
attempt, but aggregate verification read the older failed WebKit report from a
same-name directory collision. The selector correction needs its own full PR
and merged-main qualification. This observation proves no production change or
repair of the independently documented Linux media stall.

`node --test tests/security/ci-artifacts.test.mjs` covers the metadata selector
with synthetic pagination, chronology and refusal cases. A read-only local
execution against the affected run's actual metadata selected its second-attempt
WebKit artifact while preserving both observations; this is not hosted workflow
or production qualification.

Every job uses lockfile-keyed `setup-node` npm download caching and still runs `npm ci`; `node_modules`, Miniflare databases and browser session state are not reused. Browser binaries are installed only in jobs that require them. No new browser cache is added: Playwright documents comparable download/restore costs and the need to install Linux system libraries anyway. A measured later change can revisit this choice; it is not assumed to save time.

All jobs that install Ubuntu packages, including `engineering`, run the existing
`scripts/ci/ubuntu-mirrors.mjs` before that installation. It prefers the runner's
official HTTPS Ubuntu archives while retaining Azure as a fallback, without
changing package signatures, suites or dependency coverage. On 25 October, the
documentation job omitted this setup and spent over twelve minutes downloading
packages from Azure before its browser assertions had started. This is setup
latency, not a product-test failure. Unexpected mirror configuration fails closed;
retain the failed or cancelled run and qualify the corrected source in fresh CI.

The public-preview configuration uses one worker in CI too. Its real audible media cases share Linux GStreamer/audio resources; concurrent sessions have produced a fully buffered, visible, unpaused player whose clock never advanced. No decode, progression, duration, locale or final-frame assertion is removed, and production playback is unchanged. The application suite already uses one worker.

On `main` run 37109071599, exclusive sessions did not eliminate the intermittent
Linux WebKit media stall. The manual rerun instead failed the uncertain PDF
request journey: three synthetic mouse clicks completed, but the third produced
no request after the error notice collapsed and moved the form. Both failures
and their traces remain evidence; their internal causes are not established.
Phone projects now activate these real-media and explicit PDF-replay controls
with Playwright's trusted touch gesture (`tap` when `hasTouch`), while desktop
retains mouse clicks. No browser APIs are mocked in the delivered-media tests,
and all clock/decode/seek and same-key/new-key assertions remain required.
This is qualification of the intended device input, not proof of a WebKit fix.

## Mobile preparation input qualification — 26 October 2026

PR run 40243121283 reached the V2 consent scenario with an empty required email
field, so native validation prevented any dispatch POST. The field was already
empty just after `fill`; no source-driven recipient reset or relevant JavaScript
exception was established. Three isolated macOS experiments passed: one original
fill, one trusted tap plus sequential keyboard entry, and one fill followed by
release of the two real held document/sender GET responses. They did not reproduce
Linux or a response arriving during insertion, and establish no historical cause.

Run 40246543758 passed that V2 scenario but failed a different fax-ceiling case:
the first phone field remained empty after its fill, while the typed decimal
comma and selected PDF were retained. Native validation again prevented a POST.
No JavaScript exception or source-driven reset explained the missing input, and
nearby data replies alone establish no cause. Preserve this separate failure.

The two scenarios share one input helper: one trusted tap plus sequential
keyboard entry on touch projects, and one fill on desktop. Each checks the exact
value and focus after entry and the exact value before submission, without
printing the recipient. Only the V2 scenario holds its two real GET replies until
after the gesture and releases their unchanged bodies. The fax scenario retains
its original request timing, literal typed `1,5`, normalized phone and exact
150-cent POST assertions. No refill, automatic retry, fixed sleep, longer timeout
or business assertion removal is allowed. This qualifies the intended input
path, not a claimed product-state repair or paste qualification. Required
exact-source PR and merged-main checks remain complete.

## Checkout optimization — 9 October 2026 candidate

The exact deployed `4ce1bdd467f9aa35f98e525986db888eff3bf977` still passes
all required checks. Its [main run 37928685996](https://github.com/nclsppr/guteneo/actions/runs/37928685996)
took 17 min 03 s; the preceding [PR run 37926010842](https://github.com/nclsppr/guteneo/actions/runs/37926010842)
took 24 min 24 s. These are observed workflow durations, not the optimized result.

| Measured step | Main | Previous PR |
| --- | ---: | ---: |
| Build checkout | 186 s | 184 s |
| iPhone checkout | 26 s | 189 s |
| Verification checkout | 86 s | 190 s |
| iPhone application assertions | 327 s | 431 s |
| iPhone preview assertions | 139 s | 187 s |
| Build-artifact upload | 26 s | 22 s |

Checkout alone took 298 s on the main build → iPhone → verify critical path and
563 s on the PR path. Initial parallel jobs each spent 163–232 s checking out
main, while the isolated scanner and PDF-validator assertions took seconds.
The tree has 1,804,117,453 uncompressed tracked bytes, including archived film
production material that none of these checks consumes.

The candidate uses sparse checkouts. General checks, Vitest, security, build and
browser jobs retain all application assets, all tests and the complete narration
package. They exclude only `videos/guteneo-gutenberg/archive/`,
`videos/guteneo-gutenberg/media-parts/` and old `reports/screenshots/` evidence.
All 1,528 retained files total 614,533,844 bytes: 65.9% fewer tracked bytes to
materialize. No tracked file is deleted from the repository. Fresh screenshots
are still generated and uploaded, and both production and preview videos remain
covered by their existing byte, decode, progression and locale checks.

| Sparse job | Retained tracked bytes | Required scope |
| --- | ---: | --- |
| Scanner | 643,537 | Package, shared observability source, workflow fixtures and root files |
| PDF validator | 1,067,248 | Complete package and root files |
| Final verification | 2,690,037 | Complete unit/integration test inventory, CI scripts and root configuration |

Shared browser harnesses belong under the retained `tests/fixtures/` scope.
The final verifier loads their imports while discovering every expected test;
a helper available in full browser jobs but absent from the verification
checkout must fail discovery. Before moving or adding shared helpers, reproduce
the verifier's exact sparse patterns and run every `suitePlans()` inventory.
Never waive an import failure or substitute an older inventory.

`actions/checkout@v7` automatically fetches with `blob:none` when sparse checkout
is requested. The binary-heavy browser-build artifact uses compression level 0
so an already-compressed MP4/WebP bundle is not compressed again. The same
artifact contents, same-run SHA binding, suite commands, assertions, browser
projects, sequential database isolation, required jobs and fail-closed coverage
gate are retained. No path-based test skipping or dependency cache trust is added.

Local validation uses independent sparse copies of the deployed source, not a
full checkout that could accidentally hide missing dependencies. It checks the
complete scanner and PDF-validator suites, exact retained path inventory,
public-video bytes, CI failure/coverage gate, feature-map references and all three
asset builds. The checks passed: scanner 29 Node + 38 Python assertions,
PDF validator 30 Node + 18 Python assertions, both package typechecks, 4 CI-gate
and public-video-byte tests, 62 narration tests, ESLint, the feature-map checker
and web/live/preview builds (264 live assets). A separate sparse verification
copy also merged the five downloaded main-run blobs and accounted for all 102
files / 1,926 passing assertions with the unchanged strict gate. Only the
GitHub workspace prefix was rebased in temporary report copies for local path
matching; this is report compatibility proof, not a fresh run of those assertions.

This validates checkout scope; it does not establish a hosted speedup. Record the optimized GitHub run and artifact size after the PR runs,
then compare both wall time and aggregate runner time with these two baselines.

Sources: [checkout sparse-fetch implementation](https://github.com/actions/checkout/blob/v7/src/git-source-provider.ts),
[artifact compression settings](https://github.com/actions/upload-artifact#altering-compressions-level-speed-v-size).

## Hosted result — 9 October 2026

[Run 37976971718](https://github.com/nclsppr/guteneo/actions/runs/37976971718)
passed **13/13 jobs** on `1d38b2ecc86e657bf1b4ce149fa30642583ab573`.
The strict gate accounted for 102 files and 1,928 assertions. This source
precedes the monitor's adaptation to the owner's subsequent canonical-only
routing change; the CI workflow and optimization are identical.

| Measure | Deployed main baseline | Optimized run | Observed change |
| --- | ---: | ---: | ---: |
| Workflow wall time, including initial queue | 17 min 03 s | 14 min 12 s | −16.7% |
| Aggregate runner job durations | 84 min 03 s | 50 min 36 s | −39.8% |
| Aggregate checkout steps | 31 min 03 s | 6 min 40 s | −78.5% |
| Build job | 277 s | 113 s | −59.2% |
| Build checkout | 186 s | 34 s | −81.7% |
| Scanner checkout | 232 s | 2 s | −99.1% |

The optimized run included 63 seconds of initial queueing. Its iPhone job
actually took 637 seconds versus 618 seconds on main: the improvement concerns
checkout, build and final-gate overhead, not a claim that every test is faster.
Compared with the preceding PR baseline of 24 min 24 s, wall time fell 41.8%.
These are observed runs, not a guaranteed future duration; compare several
subsequent runs for a stable median. The final monitor follow-up requires its
own CI status before merge.

## Measured baseline and candidate limits

Baseline read from GitHub on 17 September 2026:

| Run                                                                             | Source    | `verify` duration | `npm test` | Application E2E | Preview E2E |
| ------------------------------------------------------------------------------- | --------- | ----------------: | ---------: | --------------: | ----------: |
| [main 35194664673](https://github.com/nclsppr/guteneo/actions/runs/35194664673) | `9b70dfe` |       13 min 23 s |      479 s |           160 s |        45 s |
| [PR 35193744771](https://github.com/nclsppr/guteneo/actions/runs/35193744771)   | `ef2c15a` |       10 min 30 s |      296 s |           162 s |        44 s |

The slower baseline's Vitest portion is 470.69 s, with 454.46 s executing tests. Its historical per-file durations projected onto the standard four shards (excluding the separately run PDF renderer) sum to approximately 55, 185, 104 and 95 seconds. That is a projection, not a new CI timing: runner variation, installation, queued jobs and artifact transfer add overhead. The expected critical path is now the slowest shard or browser job, followed by report verification, rather than the sum of all of them. More parallel runners may increase aggregate runner minutes even while shortening feedback; elimination of duplicate feature-push/PR runs saves redundant executions.

Local candidate validation on 17 September, based on `9b70dfe` (Node 24.18.0, Vitest 4.1.11):

| Check                                                     | Result                                                        |
| --------------------------------------------------------- | ------------------------------------------------------------- |
| Four simultaneous shards, isolated Miniflare fixtures     | 678 assertions pass; elapsed 45.52 / 120.17 / 60.23 / 59.59 s |
| Separate private PDF renderer integration                 | 12 assertions pass; 22.71 s                                   |
| Native blob merge plus inventory gate                     | 42 files, 690 assertions, no missing or duplicate file        |
| All Node security tests, including the new gate tests     | 117 pass; 23.75 s                                             |
| Application E2E using prebuilt assets, all three projects | 75 pass, 3 existing project-specific skips; 2.0 min           |
| Public preview, both projects                             | 30 pass, 4 existing project-specific skips; 19.5 s            |
| TypeScript, focused ESLint, all three asset builds        | Pass                                                          |

The browser suites were run sequentially against one local checkout; their GitHub split has not yet been measured. The test implementations and existing project-specific skips were unchanged. Local reports live under `test-results/ci/`, leaving the prior global JSON reports untouched.

Actual end-to-end GitHub duration and cache behavior must be recorded after the candidate PR runs. Local measurements validate execution and isolation but do not establish hosted speed or AppArmor behavior.

## Local reproduction

The normal `npm test`, `npm run build`, `npm run test:e2e` and preview commands are unchanged. To reproduce a CI shard without overwriting the main report:

```sh
npx vitest run --shard=1/4 \
  --exclude=tests/integration/document-postal-preflight.test.ts \
  --reporter=default --reporter=json --reporter=blob \
  --outputFile.json=test-results/ci/vitest-1.json \
  --outputFile.blob=test-results/ci/blobs/1.json
```

Run shards 2–4 and the excluded PDF integration with the analogous unique output paths, then use `vitest run --merge-reports=test-results/ci/blobs` to merge those files. Avoid mixing reports from different source revisions. Playwright projects must run in separate checkouts/runners or sequentially; parallel processes against one `.wrangler` directory are unsupported.

Sources: [Vitest sharding](https://vitest.dev/guide/improving-performance.html#sharding), [Playwright CI and browser caching](https://playwright.dev/docs/ci#caching-browsers), [GitHub required checks and skipped dependencies](https://docs.github.com/en/pull-requests/how-tos/merge-and-close-pull-requests/troubleshooting-required-status-checks#handling-skipped-but-required-checks), [Playwright reporters](https://playwright.dev/docs/test-reporters).

## Documentation and repository standards

CI requires `npm run docs:check` and `npm run check:standards`. Regenerate the atlas
with `npm run docs:build`; synchronize shared integration instructions with
`node integrations/sync-claude-workflows.mjs` and verify `node integrations/sync-claude-workflows.mjs --check`. Feature changes
must update both the source feature tree and affected developer documentation in
the same pull request. The [repository standards](REPOSITORY_STANDARDS.md) own the
language, routing, deduplication and exception policy; language checks are bounded
regression heuristics rather than linguistic or semantic proof.

## Automatic served verification after live deployment

The live publishing wrapper now runs `scripts/verify-release.mjs` after Wrangler
returns successfully, using the fixed canonical origin and the already validated
local `dist/web/release.json`. Completion requires matching source, public asset
bytes/hashes, robots policy and security headers. A failed verification reports
`RELEASE_VERIFICATION_FAILED`: publication has happened, but the release remains
unverified. The wrapper performs no automatic rollback, redeployment or retry.
Preview publication retains its existing independent contract.

This anonymous GET-only check sends no document and establishes no Auth0,
recipient, signed provider callback or inbox success. The local secure/Resend
cross-service regression runs in the existing application suite. Real canaries
need dedicated accounts/recipients, separate authorization, bounded costs and
observable signed outcomes; fax/postal production tests must never run implicitly
on every deployment. See [operations](OPERATIONS.md) and the
[engineering release guide](../apps/engineering/src/content/docs/engineering/ci-and-release.mdx).
