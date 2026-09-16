# Executed verification — 2026-09-16

## Hosted accounts, billing and MCP continuation

The v0.2 continuation adds account/team/session authorization, Stripe tracking, secure credential input, assistant packages and PDF rescan. **36/36 application browser tests passed** on desktop Chromium, mobile Chromium and iPhone WebKit. The rescan browser cases use controlled HTTP responses; **23 D1/R2 tests** independently exercise real document leases, hashes, quotas, revocation and quarantine.

The isolated scanner passed **14 tests**, typecheck and actual Cloudflare clean/EICAR qualification. Browser Run also rendered and validated real fixture PDFs. Production dependency audits for both the application and scanner reported zero known vulnerabilities. Hosted proof and open identity/provider gates are detailed in [LIVE_RELEASE.md](LIVE_RELEASE.md); no simulated send is counted as a real fax. The final full run passed **249/249 unit/integration tests across 18 files**, plus **12/12 secure-configuration tests** (including real Chromium/WebKit form submissions). The final application run passed **36/36** and the local preview run **6/6** browser tests. TypeScript, ESLint, the production Worker dry-run and 13-migration source/transport equivalence passed; the latter compared 88 schema objects with clean integrity and foreign keys. Exact deployed code identities are checked separately in LIVE_RELEASE.md.

The integrated review fixed three boundary defects before release: revoked browser administrators cannot receive a newly created Stripe portal URL; successful PDF rescans write the canonical scan proof in the same fenced transaction as readiness; and fax quote expiry is rechecked after asynchronous media preparation, immediately before the supplier call. A SQL NULL-provider regression also protects the attempt claim.

The historical migration fixture was updated to construct genuine pre-0008 rows using its original SQL acceptance triggers. It compares populated documents, dispatches, approvals, reservations, outbox and usage before/after migration, without calling current code against an obsolete schema or adding a production compatibility bypass.


## Initial Cloudflare preview continuation — historical evidence

- **163/163 unit and integration tests pass across 13 files**, including browser-preview isolation, remote route rejection, Cursor quarantine receipts, populated-schema migration and document re-import after purge. Final report: `reports/vitest.json`.
- **18/18 application browser tests pass** across desktop Chromium, mobile Chromium and iPhone WebKit; report: `reports/playwright.json`. These use the local D1/R2/Queue application, actual PDF import/render and simulated transport.
- **6/6 public-preview browser tests pass locally and at https://guteneo.com**, across desktop Chromium and iPhone WebKit. All workspace routes render, PDFs paint, preparation/review/confirmation works in tab memory, and no application API request leaves the browser. Remote backend routes refuse requests. Report: `reports/preview-playwright.json`; captures: `reports/screenshots/preview/`.
- Strict typecheck, ESLint, normal application build/Worker dry-run and dedicated preview dry-run pass. `npm audit` reports **zero known vulnerabilities across all dependencies** after removal of the unused Workers Vitest pool and its older transitive dependencies.
- Cloudflare first preview deployment `71f30997-dfbd-4f70-a4ce-10cfa4367e81` returned HTTP 200 on both the custom domain and workers.dev address. All 25 served assets matched their local release manifest hashes. Current deployed identity is available from `/release.json` and `/health`; see `PUBLIC_PREVIEW.md`.

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
