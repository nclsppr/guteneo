# Executed verification — 2026-09-17

## Workspace dashboard corrections — candidate, 25 September 2026

Branch commits `db0cf26`, `19edc3c` and `83ec407` add organization-wide overview counters, server-side dispatch status groups, filtered lists, an attention notice, focus re-reads, euro ceilings, session-expiry recovery, inline confirmations and the legacy PDF.js build. The continuation on the same branch corrects what executing the complete suites showed:

- Amount fields are text fields with `inputmode="decimal"` and one shared parser. A Chromium number field drops the comma, so a ceiling typed `1,5` was prepared as 15 €; the expert delegation caps had the same defect.
- Fax numbers use one normalization (`packages/contracts/src/fax-number.ts`) in the browser, REST, MCP and the preview fixture. `(0)` after the country code is dropped; a national 0 kept after it (`+33 06…`, `+49 030…`) is refused with its correction instead of reaching the provider.
- Returning to the tab performs one read, and pages added with "Afficher la suite" stay until an explicit refresh.
- `GET /api/overview` is browser-only (`403 BROWSER_REQUIRED` for OAuth): its document count is not a `dispatches:read` fact. `list_dispatches` accepts the same optional `group`.
- A reconnection to another account or workshop in another tab returns to the overview with fresh pages.
- The overview keeps the documented order (starting choice before statistics, [ASSISTANT_HUB.md](ASSISTANT_HUB.md)); the branch had inverted it and broke `assistant-hub.spec.ts` on the three browser projects.
- Layout: one "Nouvel envoi" action on the dispatch list, open confirmations in the place of their action, spaced member actions and a full-width role list on phones, 44 px filter chips on touch widths, field hints attached to their field, mobile sign-out aligned with the menu links.
- `scripts/dev.mjs` starts Wrangler through Node: `npx` cannot be spawned without a shell on Windows, so `npm run dev`, `npm run demo` and the Playwright web server did not start there.

Executed locally on Windows 11 with Node 24.15.0 and Playwright Chromium/WebKit. The Linux CI remains the reference and has not run this exact source.

Evidence, 25 September 2026:

- `npm run typecheck`, `npm run lint` and Prettier on the changed files pass. `npm run build:web`, `npm run build:preview`, `npm run build:live` and the Wrangler dry-runs of the application, private-document and live Workers pass.
- New tests: `tests/unit/form-values.test.ts` (euro parser, native pattern and French-comma display), `tests/unit/content.test.ts` (fax normalization and trunk-prefix refusal), `tests/unit/mcp-dispatch-groups.test.ts` (MCP `group` passed as-is, raw statuses and SQL-shaped values refused before the domain), and `tests/e2e/dashboard.spec.ts` (comma typed key by key, `(0)` fax notation, one focus re-read keeping loaded pages, browser-only overview, reconnection to another workshop).
- Vitest, renderer files excluded as in CI: **1,295/1,322 tests pass in 62/66 files**; the three Chromium renderer files pass 33/34 (one real-Chromium composition exceeds the default 30 s timeout). The remaining failures reproduce identically on the unmodified branch HEAD in a separate worktree: `ses-send-limits` (18, the first test exceeds the 30 s timeout on Windows Miniflare, then cleanup fails on foreign keys), `live-delivery-quotes` (3 to 4 timeouts, including the 51 concurrent acceptances), `cursor-upload` (4, symlinks need Windows Developer Mode). The two deadline cases of `expert-approval` pass in a targeted rerun. An earlier run that overlapped these edits also reported a stale `content.test.ts` result; the file passes on its own and in the final run.
- Node security tests: 157/160 outside `public-assets.test.mjs`. The two `CONFIG_PERMISSIONS_REQUIRED` failures (a POSIX file-mode check) and the `public-assets` failure (`EBUSY` removing its temporary asset directory, then no exit) reproduce on the unmodified HEAD; the third is an `EPERM` symlink creation in the release-guard fixture.
- Playwright application suite, fresh local D1/R2 state, server started by Playwright through `scripts/dev.mjs`: **318 of 327 cases pass, with four intentional skips**. Three failures were the expert form assertion updated for the comma display after that run had loaded it, and one was a `Network connection lost` from the local Wrangler proxy during PDF rendering; those 18 cases (two specs on three projects) pass on rerun. `journeys.spec.ts:170` fails only on iPhone WebKit: Playwright WebKit on Windows never moves focus to links with Tab or Alt+Tab, and the test deliberately requires real keyboard traversal. It passes on the two Chromium projects.
- Public preview suite: **71 cases pass, six intentional skips**. `homepage-film.spec.ts:237` fails on iPhone WebKit, which reports the 346 px fallback size of a film it does not decode on Windows; no film code changed.

The Linux CI has not run this source. Windows limits are environmental and are not treated as proof for or against the change.

No deployment, real communication, assistant connection or merge is part of this candidate.

## Optional postal address page — candidate, 20 September 2026

The browser and MCP explicitly create a separate immutable PDF with a fixed address page; duplex adds a blank verso to preserve original page pairs. The new PDF is scanned and enters the existing exact-document review, quote and approval flow. The source is preserved and no supplier upload is performed by generation. See [POSTAL_ADDRESS_PAGE.md](POSTAL_ADDRESS_PAGE.md) for the implementation, migration and proof boundaries.

Focused local evidence: **17 renderer tests** (five real Chromium/PDF.js cases with unchanged original raster hashes), **18 new backend tests plus 74 existing document/domain/postal cases**, **two new MCP tests**, **39 browser cases** on desktop/Android/iPhone, **148 Node security checks**, typecheck, lint and both application/private-document Worker builds. The migration transport verifies **33 migrations / 216 schema objects**, clean integrity and no foreign-key violations. Backend tests include authority revocation, tenant isolation, idempotent retries, immutable provenance, final scan recovery and changed recipient/options/profile refusal. No merge, production deployment or real letter is a consequence of this candidate. General-suite and exact-commit CI results are tracked in its pull request.

## Public HTTPS PDF imports — local candidate

Branch `fix/public-pdf-import`, based on `649c079`. The provider-domain allowlist
is removed, with hosted public egress required and remote URL imports kept
closed in local Miniflare. Source refusals occur before download and never
create a quarantined document. See [PUBLIC_PDF_IMPORT.md](PUBLIC_PDF_IMPORT.md).

- **159 distinct focused Vitest cases pass** across document import, content,
  document recovery, document integration, MCP and observability. The first
  five-file run passed 148 cases; the final import rerun passed 50 (three added
  capability cases), and the separate content suite passed eight. Reports:
  `test-results/public-pdf-import-vitest.json`,
  `test-results/public-pdf-import-final-unit.json`, and
  `test-results/public-pdf-import-content.json`.
- **12 focused Node security cases pass**: deployment public-egress configuration,
  OpenAPI and observability. Report:
  `test-results/public-pdf-import-security.log`.
- Typecheck, ESLint, application build and both local/live Worker dry runs pass.
  Build report: `test-results/public-pdf-import-build.log`.
- Independent source/security review found no blocking issue. Config tests prove
  the required deployment flag is present; intercepted downloads and local
  Miniflare tests do not prove hosted DNS filtering or real assistant transfer.

The exact reported Azure hostname is exercised with synthetic bytes and retained
hash-matched PDF/scan integration checks. No existing customer document was read
or promoted, and no real communication, merge or production deployment occurred.
The full repository/CI/browser suites were not rerun for this candidate.


## Postal status and private webhook tooling — published `44d1d5b`

Both exact-source GitHub runs passed on their first attempt for `44d1d5bb64418372c5174faa1ce5601681fcc813`: [PR CI 35180968830](https://github.com/nclsppr/guteneo/actions/runs/35180968830) and [push CI 35180966623](https://github.com/nclsppr/guteneo/actions/runs/35180966623). The `verify` and `scanner` jobs completed successfully in both reports: `reports/ci-pr-44d1d5b.json` and `reports/ci-push-44d1d5b.json`.

The preserved PR log, `test-results/ci-44d1d5b-pr.log`, records **675/675 Vitest tests across 41 files**, **78/78 security tests**, **six scanner Worker tests plus eight Python scanner tests**, **75 application browser cases with three intentional skips**, and **30 preview cases with four intentional skips**. Typecheck, lint, migration verification, application/live/preview builds and the live Worker dry-run also passed. These CI browser and provider fixtures remain separate from remote user or supplier qualification.

The clean source was published on 17 September at 04:22:44 UTC as Worker version `bb332483-fd95-4b72-9b19-f967fbe492e0`, receiving 100% of application traffic. The preserved publication report, `reports/published-44d1d5b-release-proof.json`, records **56 matching public assets on each of the canonical and fallback hosts**, verified security headers and host-specific robots policy. `/api/health` returned HTTP 200 with production mode and `liveSending:false`. This evidence proves application publication, not a real postal delivery, a provider-originated signed notification or an authenticated customer journey.

The postal correction preserves a signed non-delivery outcome after handover, including reordered/concurrent events and replays, without refunding incurred postage or resubmitting. An explicitly proven delivery retains priority and fax/email rules are unchanged. The signed events in its regression tests are local fixtures, not real Pingen notifications; see [POSTAL_STATUS_PROJECTION.md](POSTAL_STATUS_PROJECTION.md).

## Historical private Pingen qualification tooling — published `5b91ad3`

Exact-source [PR CI 35178294242](https://github.com/nclsppr/guteneo/actions/runs/35178294242) passed all jobs for `5b91ad312ec14b40fa3441382d69782cc6343c96`, including tests, migrations, both builds/browser suites and scanner checks. The first [push CI 35178292026](https://github.com/nclsppr/guteneo/actions/runs/35178292026) attempt failed: 608 tests passed and one failed on `proxy.worker.ts:150 assert(heapValue !== undefined)` during native argument hydration before a D1 call. The subsequent migration/build/browser steps in that failed job were skipped; the independent successful PR run is not a relabeling of that attempt.

The unchanged trusted-fax integration file passed 16/16 locally. A separate forced-GC experiment with an injected 600ms batch delay reproduced the native-proxy failure for ephemeral statements and passed when statement references were retained. It reproduces the mechanism, not the exact CI scheduler or lost handle. The inspected proxy sources were identical across the previous/current Miniflare releases, so upgrade causation is not established. Diagnostic: `reports/miniflare-native-handle-5b91ad3-diagnostic.json`. No runtime, test assertion or automatic retry was changed. The single manual retry of the unchanged failed push job completed successfully. Attempt 2 of run 35178292026 passed **609/609 Vitest tests across 40 files**, **72/72 security tests**, **75 application browser cases with three intentional skips**, and **30 preview cases with four intentional skips**. The failed verify job was rerun; the six scanner tests had already passed in attempt 1 and were not rerun by `--failed`. The resulting run records both jobs as successful (`reports/ci-push-5b91ad3-attempt2.json`). The documented one-retry decision and initial failure remain preserved in the diagnostic and `reports/ci-push-5b91ad3-attempt1.json`; this does not rewrite the failed first attempt.

Targeted local qualification passed 45 provider tests (31 synthetic-probe and 14 Pingen-readiness cases), seven driver tests, typecheck and targeted lint with Wrangler 4.133.0 and Miniflare 5.20260916.0-alpha. These fixtures do not prove a provider transfer. After publication, separate real Pingen calls returned EUR 1.51 for the fixed one-page LU/cheap/simplex/grayscale calculator case and created/inspected the embedded fictional draft without submission. API deletion and the durable `deleted` tombstone read-back both succeeded. Business/fax v3 D1 tables remained empty. The 302 PDF redirect was not followed and proves no final print preview. This dated calculator observation is not a universal customer price. Reports: `reports/pingen-synthetic-qualification-20260917.json` and `reports/pingen-synthetic-d1-counts-20260917.json`; see [PINGEN_SYNTHETIC_QUALIFICATION.md](PINGEN_SYNTHETIC_QUALIFICATION.md). This proves no user signup, consented application journey, invoice or postal delivery.

The published application's 56 public asset hashes matched on canonical and fallback hosts, with verified robots/security headers and `/api/health` reporting production with live sending disabled. The preview remains on `118ce087` and its earlier browser proof remains separate. Deployment/source evidence is in [LIVE_RELEASE.md](LIVE_RELEASE.md).

## Published fax v3 implementation — `118ce087`, 2026-09-17

Both exact-source GitHub runs for `118ce087c3fe5a1ad63bd4c562adb8e26aa8af21` completed successfully: [PR 35176518316](https://github.com/nclsppr/guteneo/actions/runs/35176518316) and [push 35176516018](https://github.com/nclsppr/guteneo/actions/runs/35176516018). Application and preview deployment, traffic and public asset proof are recorded in [LIVE_RELEASE.md](LIVE_RELEASE.md), separately from the local tests below. The documentation-only commit recording these results is not the deployed runtime source.

Post-publication canonical developer/SEO checks passed **8/8 desktop+iPhone cases** in 4.6 seconds (`reports/published-118ce087-public-browser.json`). The separate fictional preview passed **30 cases with four intentional desktop skips** in 12 seconds (`reports/published-preview-118ce087.json`). `/api/health` reports production mode with `liveSending:false`; provider capabilities remain `configured_not_live_validated`. No actual signup, external assistant connection or communication was qualified.

The integrated candidate passed **578/578 Vitest tests across 39 files** and **65/65 security tests**, with the dedicated report `reports/fax-v3-full-vitest.json`. All **75 application browser cases pass**, with three intentional desktop skips; `reports/fax-v3-full-browser.json` preserves this independent run. Its local D1/R2 state was created in a separate temporary directory and all 23 final migrations applied before seeding fictional users. Existing development data was not reset. No real provider or account was used.

Typecheck, ESLint and the production Worker dry-run also pass. The separate preview build passed **30 browser cases with four intentional desktop skips**, including the updated developer reference and Swagger; report `reports/fax-v3-preview.json`.

The new coverage checks range/cap approval, accepted and delivered holds, later verified usage, supplier overrun capped for the customer, unknown→failed→late acceptance without resending, zero-cost proof, cross-tenant/account/attempt rejection, revoked reviewer, expiry, prefix exclusions, legacy-v2 behavior, cumulative fractional charging, retained financial history and a 100-ID page with only two D1 parameters. The public SDK transport preserves all four settlement states without leaking private cost fields. The targeted 320px UI screenshots were visually inspected on iPhone WebKit; real devices and external assistant hosts remain separate qualifications.

All 23 source/transport migrations produce equivalent local schemas (**178 objects including the migration ledger**) with clean integrity and foreign keys. During integration, the transport verifier rejected two unqualified CASE expressions in the new migration; equivalent OR-based country checks resolved this without editing the transport utility or previously applied migrations. Additional review preserved the v3 scope marker against deletion of a revoked tariff. Independent deployment review found no data seed or channel activation. Migration 0023 was subsequently applied remotely as one atomic batch before publication: all 23 ledger entries, **177 domain objects excluding the ledger**, exact schema match, `foreign_keys=1`, no foreign-key violations and `quick_check=ok`. The checked business and new fax v3 tables were empty. Remote proof is separate in `reports/d1-0023-release-proof.json` and [D1_MIGRATION.md](D1_MIGRATION.md).

The preceding evidence/test-only commit `b8d4b5f48abc6b5075ca645752f09eba6d181198` passed both complete GitHub runs ([push](https://github.com/nclsppr/guteneo/actions/runs/35175024740), [PR](https://github.com/nclsppr/guteneo/actions/runs/35175028676)); that earlier result is distinct from the exact fax v3 CI proof above.

## Historical postal/SES publication — `813dd717`, 2026-09-17

After publication, the canonical developer/SEO qualification passed **8/8 desktop+iPhone cases**, and the separately hosted fictional preview passed **30 cases with 4 intentional desktop skips**. Dedicated reports preserve the full local suite results: `reports/production-public-qualification.json` and `reports/published-preview-813dd717.json`. The canonical mode explicitly verifies its anonymous session 401; default preview mode retains 403 PREVIEW_ONLY. See LIVE_RELEASE for the initial mismatched-mode check and its correction.


Exact-source PR CI for the published `813dd7173389f8fbcc1e1e1abaf68be905e7084c` passed all jobs and steps: [35173778876](https://github.com/nclsppr/guteneo/actions/runs/35173778876). The sibling push run [35173776032](https://github.com/nclsppr/guteneo/actions/runs/35173776032) reported 536/537 tests passing, with only the 51-concurrent-acceptance financial integration test exceeding its 30-second deadline. Its subsequent test-only 90-second allowance preserves all 51 concurrent paths and financial assertions; the targeted local rerun passed in 27.21 seconds with no global report overwrite. Published code and full passing PR CI remain the original exact source.

At that release, remote D1 contained all 22 migrations with 161 matching domain objects, clean foreign keys and `quick_check=ok`. Its public application and preview asset/traffic proof is retained in [LIVE_RELEASE.md](LIVE_RELEASE.md).

The integrated postal/SES candidate passed **537/537 Vitest tests across 35 files**, **65/65 security tests**, typecheck, lint, and the production Worker dry-run. All **66 application browser cases pass**, with three intentional desktop skips; all **30 preview cases pass**, with four intentional desktop skips. These runs include the postal review at 320px, exact import, account/billing mobile flows, and the 23-operation developer reference. The first integrated run exposed five obsolete credit fixtures that lacked the newly required postal proof/consent; only those fixtures were updated, preserving all financial assertions. A concurrent Playwright run also removed another suite's trace files; the application and preview now use separate output directories, and the complete application suite was rerun successfully.

All **22 source/transport migrations** produce equivalent local schemas (162 objects including migration tracking), `quick_check=ok` and no foreign-key violations. Independent reviews covered postal authorization/idempotence/consent and SES rational pricing/legacy-quote compatibility. The private renderer additionally passed **four remote synthetic cases** on version `b551ef12-dba0-4845-b664-b2715fe10d3d`, with real scan and Browser Run, no Pingen call and no D1/R2 write. These checks do not prove a real account signup, assistant-host connection or delivered communication. Remote migrations and application publication are recorded separately in LIVE_RELEASE and D1_MIGRATION.

Committed baseline `b349c19b23eda30518ae36a9f9e372fb89c0da68` passed the complete [GitHub verification](https://github.com/nclsppr/guteneo/actions/runs/35171803416): **462 Vitest tests in 32 files**, **52 security tests**, **45 application browser cases with 3 intentional skips**, **30 preview browser cases with 4 intentional skips**, and the separate scanner job. The private Chromium integration uses its Linux sandbox; an exact-executable AppArmor profile fixed the Ubuntu runner restriction without disabling the sandbox. This historical baseline predates the postal application and SES pricing increment, covered by the exact-source release CI above.

The postal UI candidate passed **21/21 browser cases** on desktop Chromium, Pixel7 Chromium and iPhone WebKit (including a 320px-wide review). Cases cover two explicit review/transfer confirmations, refusal of blocked/unknown states, missing crop recovery, lost POST response reconciliation, and a pending-provider quote followed by successful navigation to a separate, initially unapproved dispatch. All API traffic is intercepted: these are UI fixtures, not Pingen transfers. Desktop and 320px screenshots were visually inspected. The updated developer reference passed **4/4 browser cases** and the self-contained OpenAPI contract passed **6 checks**, now documenting 23 operations. Later signed SES FX metadata is checked separately from those earlier browser artifacts.

The mobile/API/verified-account increment published initially from `291e697c23b21dd766ccd60486b0d8d97d34bdf7` passed typecheck, lint and **447/447 Vitest tests across 30 files**, followed by **40/40 security tests**. Adding the branding and release-verification tests brought the separate security run to **51/51**. A subsequent French-login-locale change passed all **27 auth tests** and targeted lint. The private postal renderer was still under development at that earlier point; its later deployment and remote qualification are recorded above.

On the committed application's built assets, the full local browser run had **39 passing cases, 3 intentional desktop skips and 6 failures caused by an obsolete rescan-link selector**. The UI correctly removes the link while scanning is incomplete. The corrected test now asserts absence of `href`, disabled accessibility state and removal from keyboard navigation before scanning, then the exact restored link afterward. All six affected cases passed on Chromium, Pixel Chromium and iPhone WebKit. This is a targeted successful rerun, not a relabelled all-green full run. The public preview independently passed **30 cases**, with **4 intentional desktop skips**, without rebuilding either bundle during testing.

At the earlier qualification point, remote D1 had all **19 migrations**, `quick_check=ok`, no foreign-key violations and an exact comparison of all 145 application-owned schema objects. AWS's verification email arrived in macOS Mail and its address-confirmation succeeded; that is not a Guteneo delivery test. Real signup, assistant OAuth and actual business-channel delivery remain separate qualification steps.

### Earlier editorial release evidence

Editorial SEO candidate: typecheck and lint pass; the full local suite passed **328/328 unit/integration tests in 24 files** and **31/31 security/build tests**. A subsequent conditional-304 indexing regression brings the targeted preview Worker suite to **35/35**, without relabeling the earlier full-run count. All **20/20 preview browser cases** pass locally on desktop Chromium and iPhone WebKit, including raw HTML/canonical/schema/HTTP checks, journal navigation with JavaScript disabled, responsive generated images, source links and chapter anchors. The independently reviewed five SSR pages produce no CSP violations. Production preview/backend builds pass with separate index/noindex policies. These are local candidate results; published SHA and remote evidence are recorded separately after deployment.

Both CI runs passed for the exact deployed backend source `ee64850691f9f50c3e7cee5cbbfea2afe46c448d`: [PR](https://github.com/nclsppr/guteneo/actions/runs/35162247327) and [push](https://github.com/nclsppr/guteneo/actions/runs/35162242683). The CI includes the complete updated unit suite, 25 security tests, 36 application browser cases and 12 preview cases, migration verification and deployment builds. The local runs below retain their separate dates and scope.

- The complete `npm test` run started at 23:17 UTC on September 16 passed **295/295 unit/integration tests across 23 files**, followed by **25/25 secure-configuration tests**. This full run preceded the separate private Pingen inspection and Telnyx callback changes below; it is not presented as their full-suite qualification.
- The combined subsequent provider/configuration run passed **58/58 targeted tests across five files**, including nine initial Pingen inspection cases, eleven Telnyx inspection cases and signed Telnyx callbacks independently of Auth0 setup. The final Pingen inspection suite then passed 14/14 cases with the separate upload-origin method. Typecheck and lint passed after integration.
- **12/12 preview browser journeys passed locally and against the published https://guteneo.com**, covering desktop Chromium and iPhone WebKit, the assistant stamps, customer prices, legal information, automatic bird wing cycles and reduced-motion behavior. All 35 publicly served preview assets matched the clean source manifest; response security headers passed.
- The prior complete application browser run passed **36/36** on desktop Chromium, mobile Chromium and iPhone WebKit after rebuilding the local application and starting a fresh server. Its report remains `reports/playwright.json`; final CI independently checks the current branch.
- A real workerd transport regression proves outbound provider requests use supported manual redirects and never forward credentials to a redirected host. Node-only scripts retain their distinct redirect behavior.
- The remote D1 ledger contains all fifteen migrations, with clean integrity and foreign-key checks and a local/remote domain-schema comparison. The full-suite restore rehearsal remains local, separate from remote recovery qualification.

Actual account evidence is tracked separately from fixture tests: installed AWS credentials were authenticated by private STS inspection, the SNS subscription was confirmed with authenticated unsubscribe protection, and Pingen OAuth plus the exact configured organization read succeeded. No fax, email, postal letter, payment or assistant-host send was performed. See [SES_STATUS.md](SES_STATUS.md), [PINGEN_SETUP.md](PINGEN_SETUP.md) and [LIVE_RELEASE.md](LIVE_RELEASE.md).

## Hosted accounts, billing and MCP continuation — earlier release evidence

The v0.2 continuation adds account/team/session authorization, Stripe tracking, secure credential input, assistant packages and PDF rescan. **36/36 application browser tests passed** on desktop Chromium, mobile Chromium and iPhone WebKit. The rescan browser cases use controlled HTTP responses; **23 D1/R2 tests** independently exercise real document leases, hashes, quotas, revocation and quarantine.

The isolated scanner passed **14 tests**, typecheck and actual Cloudflare clean/EICAR qualification. Browser Run also rendered and validated real fixture PDFs. Production dependency audits for both the application and scanner reported zero known vulnerabilities. Hosted proof and open identity/provider gates are detailed in [LIVE_RELEASE.md](LIVE_RELEASE.md); no simulated send is counted as a real fax. The final full run passed **249/249 unit/integration tests across 18 files**, plus **12/12 secure-configuration tests** (including real Chromium/WebKit form submissions). The final application run passed **36/36** and the local preview run **6/6** browser tests. TypeScript, ESLint, the production Worker dry-run and 13-migration source/transport equivalence passed; the latter compared 88 schema objects with clean integrity and foreign keys. The remote preview also passed **6/6 browser tests at https://guteneo.com** after publication. The backend’s 27 public asset hashes and preview’s 25 matched clean source commit `b3988da34c2d73765be7e74c6fda2af2e887b5ba`. [GitHub CI](https://github.com/nclsppr/guteneo/actions/runs/35153584742) passed for that exact deployed source, including the independent scanner job, full tests, migration proof and both deployment bundles. Exact Worker versions and closed hosted-runtime checks are in LIVE_RELEASE.md.

The integrated review fixed three boundary defects before release: revoked browser administrators cannot receive a newly created Stripe portal URL; successful PDF rescans write the canonical scan proof in the same fenced transaction as readiness; and fax quote expiry is rechecked after asynchronous media preparation, immediately before the supplier call. A SQL NULL-provider regression also protects the attempt claim.

The historical migration fixture was updated to construct genuine pre-0008 rows using its original SQL acceptance triggers. It compares populated documents, dispatches, approvals, reservations, outbox and usage before/after migration, without calling current code against an obsolete schema or adding a production compatibility bypass.


## Initial Cloudflare preview continuation — historical evidence

- **163/163 unit and integration tests pass across 13 files**, including browser-preview isolation, remote route rejection, Cursor quarantine receipts, populated-schema migration and document re-import after purge. Final report: `reports/vitest.json`.
- **18/18 application browser tests pass** across desktop Chromium, mobile Chromium and iPhone WebKit; report: `reports/playwright.json`. These use the local D1/R2/Queue application, actual PDF import/render and simulated transport.
- **6/6 public-preview browser tests pass locally and at https://guteneo.com**, across desktop Chromium and iPhone WebKit. All workspace routes render, PDFs paint, preparation/review/confirmation works in tab memory, and no application API request leaves the browser. Remote backend routes refuse requests. Report: `reports/preview-playwright.json`; captures: `reports/screenshots/preview/`.
- Strict typecheck, ESLint, normal application build/Worker dry-run and dedicated preview dry-run pass. `npm audit` reports **zero known vulnerabilities across all dependencies** after removal of the unused Workers Vitest pool and its older transitive dependencies.
- Cloudflare first preview deployment `71f30997-dfbd-4f70-a4ce-10cfa4367e81` returned HTTP 200 on both the custom domain and workers.dev address. All 25 served assets matched their local release manifest hashes. For this historical preview, `/release.json` and `/health` identified its deployed state; the current application health endpoint is `/api/health`. See `PUBLIC_PREVIEW.md`.

The first macOS test run exposed fixture paths using `/var` aliases directly rather than the real Cursor startup configuration. Tests now use the real canonical-root loader, plus explicit alias and replaced-root coverage; symlink restrictions remain enforced. A real connector defect rejecting quarantined `pages: 0` receipts was fixed.

The first WebKit keyboard test assumed ordinary Tab traverses links on macOS. An independent real-keyboard probe confirmed Tab leaves the body active while Option-Tab focuses the skip link. The test now uses the platform's link-navigation key and additionally activates the skip link and verifies main-content focus. No focus assertion was deleted or replaced with programmatic focus. [Apple keyboard behavior](https://support.apple.com/guide/safari/keyboard-shortcuts-and-gestures-cpsh003/mac).

Migration 0008 is verified locally with populated tables, preserved approvals/reservations/outbox and clean foreign keys; no remote business database exists or was migrated. iPhone WebKit is browser emulation on this Mac, not a physical iPhone test. Auth0, assistant clients, scanner, remote PDF renderer, real tariffs and live providers remain unqualified and closed.

## Original foundation report — historical evidence

The remainder records the preceding environment's run. Its counts and environment limitations describe that earlier run; current continuation evidence is recorded above.

Evidence is local unless explicitly stated otherwise. No real provider account, SES/Pingen sandbox, remote Auth0 tenant, hosted Cloudflare service or ChatGPT/Claude/Cursor client was exercised. A passing fixture is not a live integration result.

## Commands and results

| Command                                                                                               | Result and evidence                                                                                                                                                           |
| ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run typecheck`                                                                                   | Passed, strict TypeScript.                                                                                                                                                    |
| `npm run lint`                                                                                        | Passed against source; generated nested `dist` bundles excluded. No source lint rules disabled to pass.                                                                       |
| `npm test`                                                                                            | 124/124 passed across11 files; machine-readable `reports/vitest.json`, test inventory below.                                                                                  |
| `GUTENEO_BUNDLED_CHROMIUM=1 npx playwright test --project=chromium --project=mobile-chromium`         | 12/12 passed in54.6s, zero failures/flaky/skipped; `reports/playwright.json` and screenshots.                                                                                 |
| `node scripts/http-smoke.mjs --with-server`                                                           | 28 HTTP/MCP checks passed and15 simulated emails persisted/processed through actual Wrangler/workerd, D1/R2/Queues. `reports/http-smoke.json`.                                |
| `npm run build`                                                                                       | Strict type checking, Vite build and API Worker `wrangler deploy --dry-run`; no deployment.                                                                                   |
| `npx wrangler deploy --config apps/documents/wrangler.jsonc --dry-run --outdir dist/documents-worker` | Passed, dedicated Browser binding Worker compiles. No remote browser was invoked.                                                                                             |
| `npm run costs`                                                                                       | Reproducible1k/10k/100k assumptions in `reports/cost-model.json`; excludes explicitly unquoted suppliers/identity/scan/operations.                                            |
| `npm audit --omit=dev --json`                                                                         | Zero known production-dependency vulnerabilities after the documented targeted browser-installer override. `reports/npm-audit.json`. Not a comprehensive security assessment. |

Node24.19, Wrangler4.132, workerd/Miniflare, Vitest4.1.11 and Chromium153 were used. Exact dependency versions and integrity hashes are pinned in package-lock.json. Standard Playwright Chromium download failed in this environment; the npm-packaged Chromium fallback was extracted and the flags disabling web security/site isolation removed. No safety/approval protection was bypassed.

The WebKit browser archive downloaded, but required Linux system libraries could not be installed under this execution environment's process permissions. **iPhone/Safari is not qualified.** The separate `iphone-webkit` project remains in CI and was not marked skipped to make the local subset pass. Chromium mobile emulation tests touch/layout behavior, not Apple's browser engine. The GitHub workflow is supplied; its execution status is independent of local evidence.

## Automated coverage inventory

| File                                          | Tests | What is observed                                                                                                                                                                                                                                                                    |
| --------------------------------------------- | ----: | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tests/integration/domain-invariants.test.ts` |    22 | Real D1 constraints/triggers: tenant isolation, same-key conflict, concurrent confirmation/quota limits, outbox outage and duplicate publication, retained uncertainty, early/orphan/duplicate/reordered events, immutable campaign approval, suppression, cancellation and expiry. |
| `tests/integration/documents.test.ts`         |    10 | Real D1/R2: exact imported bytes, authorization before side effects, concurrent upload/render budgets, production quarantine, exact scanner result matching and isolated validation, preservation of active documents, interrupted/bounded purge.                                   |
| `tests/integration/queue.test.ts`             |     5 | Real consumer/domain/D1/R2: durable/idempotent DLQ, malformed payload handling without content logging, disabled live queue, duplicate simulation delivery and tenant-scoped administration. Unused MCP transport is isolated in the test import.                                   |
| `tests/integration/restore.test.ts`           |     1 | Independent fresh D1/R2 restoration, valid exact PDF, zero foreign-key violations and zero resubmissions of an uncertain command. `reports/restore-proof.json`.                                                                                                                     |
| `tests/unit/auth.test.ts`                     |    12 | Real D1 sessions and signed RSA/JWKS fixtures, CSRF/Origin, PKCE callback consumption, issuer/audience/expiry, no funded onboarding, actual SDK stateless MCP listing/preparation/confirmation, scope and tenant isolation. No Auth0 network call.                                  |
| `tests/unit/content.test.ts`                  |     8 | Hostile HTML, header injection, CSV formula/duplicates, unsupported address loss prevention, exact PDF/corruption/active content, bounded streams and restricted import URLs.                                                                                                       |
| `tests/unit/config.test.ts`                   |     1 | Hosted development-auth/simulation configuration gates.                                                                                                                                                                                                                             |
| `tests/unit/cursor-upload.test.ts`            |    27 | Allowed project root, real paths, symlink/traversal boundaries, origin/content and byte upload behavior. No real Cursor client.                                                                                                                                                     |
| `tests/unit/providers.test.ts`                |    20 | Documented Telnyx/SES/Pingen request/response contracts, limits and uncertainty using intercepted HTTP fixtures.                                                                                                                                                                    |
| `tests/unit/providers-webhooks.test.ts`       |     4 | Actual signature calculations/verification, spoofed/unrecognized/orphan event handling and topic constraints.                                                                                                                                                                       |
| `tests/unit/live-providers.test.ts`           |    14 | Active approval/attempt/reservation checks on D1/R2; scoped fax capabilities; SES individual frozen content; Pingen persisted draft ownership; claims, tampering and no blind resubmit. Test setup alone inserts synthetic production rows; public pricing gate stays closed.       |

Total inventory: **124 automated unit/integration tests**. The full report is the execution authority; targeted development runs are not counted as separate additional tests.

## Browser and visual evidence

The twelve final browser cases cover six journeys on each browser profile. The nonempty DLQ screen uses an explicitly synthetic response fixture linked to a real persisted dispatch; actual durable DLQ handling and tenant isolation are covered separately by the D1/Queue integration tests. The essential sending UI uses real API operations. It imports exact PDF bytes, generates a PDF from HTML, checks an actual painted PDF canvas, approves a frozen version, reloads the persisted approval, confirms and follows the simulated email result. Campaign validation/reuse and organization isolation are exercised. Keyboard focus and horizontal layout are checked at selected desktop/mobile sizes. Hostile HTML preview remains sandboxed. Simulation is persistently labelled.

Screenshots are real browser captures in `reports/screenshots/`:

- `landing-chromium.png`, `landing-mobile-chromium.png`
- `overview-chromium.png`, `overview-mobile-chromium.png`
- `document-chromium.png`, `document-mobile-chromium.png`
- `approval-chromium.png`, `approval-mobile-chromium.png`
- `delivery-chromium.png`, `delivery-mobile-chromium.png`
- `campaign-chromium.png`, `campaign-mobile-chromium.png`
- `prepare-mobile-chromium.png`

The embedded PDF view uses bundled PDF.js and its matching worker, canvas only, `stopAtErrors`, no XFA/WASM/worker network fetching and bounded output/image size. An explicit pdf-lib preflight rejects oversized image XObject dictionaries before decoding: testing showed that PDF.js alone could omit an oversized image despite `stopAtErrors`. This browser check is not a complete memory/security analyzer for every inline image or malicious compressed PDF stream. Production scanner and isolated validation remain required. Generated source PDFs are actual files parsed by the tests; browser appearance does not stand in for byte/hash equality.

## Performance and restoration

HTTP smoke conditions: localhost,15 sequential email confirmations, concurrency1, existing small local dataset, upload/render/preparation/human review excluded, confirmation includes D1 durable acceptance and attempted queue publication. Observed acceptance median16.32ms and p95**21.01ms**. First observed terminal simulation p95**1,018.61ms** includes polling/batch/queue delay and is **not provider callback projection latency**. No staging load, callback p95 at target load, monthly availability, provider delivery SLA or production p95 is claimed.

The restore rehearsal applies current migrations to two independent runtimes and restores30 tables/32 rows plus a892-byte one-page PDF in the recorded run. It retains the unknown state and reserved credit, then reconciles a simulated provider fact with **zero new submission calls**. See RESTORE_PROOF.md for the snapshot, trigger and real-backup limitations; this is not a hosted disaster-recovery qualification.

## Remaining acceptance gaps

External OAuth/file transfer, remote Browser Run, real scanning, supplier sandbox/live sends, funded tariffs, provider concurrency/status polling, real postal preflight, production backups/alerts and real iPhone/WebKit remain unqualified. Large campaigns, full marketing unsubscribe/reputation, public abuse onboarding and platform operator content permissions are deliberately incomplete. These are recorded in EXECUTION_PLAN.md with concrete next evidence. Production preparation remains blocked; no optional test was deleted to present a successful live system.
