# GitHub verification pipeline

The required checks remain **verify** and **scanner**. This workflow builds and tests local fixtures only; it does not deploy or receive production secrets. Every pull request runs the full pipeline, and `main` runs it again after merge. Feature-branch push runs have been removed so an open PR no longer starts two copies. No path filters or conditional test selection skip checks on documentation-only changes.

## Independent work

- `checks`: TypeScript, ESLint, exact local migration transport/schema verification and the existing cost-model report.
- `vitest`: four native Vitest shards on separate runners. Files remain sequential inside each shard; process isolation, D1/R2 fixtures and all transaction/race assertions are unchanged. Only the Chromium PDF integration is excluded here and run in `security`.
- `security`: the exact-PDF Chromium integration and **every** Node security test, including Chromium and WebKit setup-form tests. The renderer's existing narrow AppArmor allowance was moved unchanged into `scripts/ci/chromium-sandbox.mjs`; no browser sandbox is disabled.
- `build`: builds local application, live and fictional preview assets once each, plus both existing Wrangler dry runs. Their distinct compilation flags and release manifests are retained. TypeScript runs in `checks` rather than again through `npm run build`. The two browser asset directories are passed to browser jobs as a same-run, SHA-named artifact; these are test artifacts, not approved deployment bundles.
- `browser`: three isolated runners for desktop Chromium, mobile Chromium and iPhone WebKit. Each migrates/seeds its own D1 and retains one Playwright worker. Desktop and iPhone also exercise their corresponding public-preview project. WebKit's job installs Chromium too, because the local PDF renderer needs it. CI's explicit `GUTENEO_E2E_PREBUILT=true` starts the existing local server without rebuilding the supplied application artifact; normal local commands continue to build as before.
- `scanner`: retains its separate dependency installation, typecheck and complete scanner test suite.

`verify` uses `always()` and depends on every job above. Failed, cancelled or skipped dependencies cannot produce a successful final gate. It merges the five native Vitest blob reports without rerunning tests, checks every assertion succeeded and compares the resulting file list with all current `tests/unit/**/*.test.ts` and `tests/integration/**/*.test.ts`. Missing, duplicated and unexpected files fail. There is no fixed assertion total to update when tests are added. The matrix uses `fail-fast: false` so a failure in one shard preserves the other shards' evidence.

## Evidence and caches

`guteneo-verification` contains the complete merged `reports/vitest.json`, original per-job reports/logs, browser HTML/JSON reports, newly generated visual-proof screenshots and failure traces/screenshots, the current restoration proof, and the cost model. Intermediate evidence artifacts are retained for 14 days, including when a job fails; the reusable browser builds expire after one day. Downloaded evidence keeps separate artifact directories to avoid report filename collisions. The historical tracked restoration report is copied only by the shard that actually passed the restoration test. Browser runners remove historical screenshot fixtures before testing so their artifacts contain only images generated in that run.

Every job uses lockfile-keyed `setup-node` npm download caching and still runs `npm ci`; `node_modules`, Miniflare databases and browser session state are not reused. Browser binaries are installed only in jobs that require them. No new browser cache is added: Playwright documents comparable download/restore costs and the need to install Linux system libraries anyway. A measured later change can revisit this choice; it is not assumed to save time.

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
