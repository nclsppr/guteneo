# Horizon candidate — executed evidence and release gaps

Prepared on 2 October 2026 in the isolated branch
`codex/pdf-accessibility-horizon`, initially based on `origin/main` at
`8b060bbd805e1778f62ba795c1e6d942092bb670`, then reconciled with template-studio
merge `4b5df4d753d30ec4e9564ec1dca2655d6c2a35ac`. Horizon migrations are now
0050–0051 after the upstream template migrations through 0049. The original
dirty checkout was preserved. This document describes local preparation; no production service,
migration, debit, communication, marketplace publication or deployment occurred.

## Implemented and exercised

- The D1 monthly-plan tests execute migrations and real SQL triggers, rather than
  substituting the entitlement or debit result. They cover immutable browser
  consent, shared available credit, concurrent subscription/renewal, cancellation,
  month-end anniversaries, missed periods, insufficient funds, current CSRF/member
  fences, simulation separation and the tenant request budget. A regression
  places 100 older unfunded accounts before a funded renewal and verifies progress.
  Funded repeated renewal uses explicit test-only simulated credit, not a claimed
  production top-up.
- The PDF service tests use private synthetic R2 originals and the real D1
  attempt/history/quota tables, with the private engine response intercepted.
  They cover exact bytes/hash/profile/version/counters, idempotent replay,
  concurrent attempts, the 100-attempt calendar quota, expiry, cross-tenant reads,
  membership/session revocation during analysis, invalid reports and MCP scope
  parity. These tests prove the application adapter; their intercepted responses
  are distinct from the real engine proof below.
- The shared browser authority now binds mutating SQL writes to the current CSRF
  token as well as the session, expiry, tenant and membership. Its regression
  rotates CSRF in the same D1 batch and proves that no write is accepted.
- Billing tests intercept Stripe, require a paid administrator and recheck
  browser authority after the response. They do not create a real customer,
  payment, invoice or portal session. Existing production credit/dispatch tests
  continue to keep settlement, reserved funds and protected-document fees separate.
- Browser checks cover explicit recurring consent, stable retry keys, disabled
  launch state, cancellation while the service is unavailable, renewal restoration
  within the paid period, administrator-only billing, diagnostics, report export,
  manual-review notices and the four-language public offer on desktop, mobile
  Chromium and iPhone WebKit.

## Real local engine proof

The private container runs the unmodified official **veraPDF 1.30.2** installer,
pinned by SHA-256. The profile rule inventory and GPL/MPL notices are checked in.
An actual locally built Docker image was exercised through its HTTP adapter with
runtime networking disabled, a read-only root, a non-root process and synthetic
PDFs. All six profiles produced expected nonconformity reports, and a synthetic
PDF/A-2b positive fixture passed all 144 rules. Temporary files were removed and
container logs were empty. Proof containers were removed afterward.

The observed image is
`sha256:2cce3cfcb0a68d3267a0afeda47c119c7f382c21915856d0c37ef4cd0c79514b`.
The persisted observation, response counters and fixture hashes are in
[`local-docker-proof.json`](../apps/pdf-validator/tests/fixtures/local-docker-proof.json).
The private Worker/parser tests also refuse incomplete jobs, wrong profiles,
versions, hashes, malformed counters and excessive stream chunks.

This is real local veraPDF execution on synthetic inputs. It is not hosted
Cloudflare qualification, a customer PDF test, full human accessibility review or
a legal certification. Positive reference coverage for every offered profile,
especially PDF/UA, remains a hosted release prerequisite.

## Automated verification before the template-studio reconciliation

| Check | Executed result |
| --- | --- |
| Complete Vitest inventory | 85 files, 1,614 assertions passed; zero failures/skips; real shard/renderer blob merge checked by `requireTestResults` |
| Node security suite | 226 passed; updated CI/OpenAPI subset also passed 10/10 afterward |
| Private validator | Typecheck passed; 11 Worker and 15 Python parser/server tests passed |
| Root verification | Typecheck, ESLint, build and Worker dry run passed |
| Migration transport | All 45 migrations; equivalent schema, integrity OK, zero foreign-key violations |
| Application browser coverage | Initial full run: 426 passed, 4 planned skips, 32 failures; rebuilt affected suites: 75 passed, covering all 32 failures and 9 new cancellation/restoration cases |
| Public preview | 76 passed, 6 planned skips; final preview build passed; corrected public copy additionally checked on desktop/mobile |

The complete backend result retains actual assertion records. One authority file
had been compiled before the final CSRF patch during the concurrent shard run;
its result was replaced by a fresh passing 19-test process and the original blob
and replacement audit were preserved. The complete 85-file inventory validator
then confirmed all 1,614 assertions, including the latest Horizon UI tests.

The initial complete run exposed obsolete test cleanup that deleted organizations retaining
immutable simulation credit grants, a deferred-migration fixture order, and old
billing expectations. Those fixtures were corrected without changing application
retention, consent or financial safety rules. Disposable per-case D1/R2 fixtures
preserve the application triggers. Incremental browser reruns use rebuilt assets
and current API fixtures. Their first-run failures also included stale built copy
and one transient initial HTML 500; the unchanged affected account test passed
on all three engines after rebuilding. No serving assets were rebuilt during
the final browser reruns. Existing planned browser skips are not backend skips.

The public preview checks additionally confirm that subscription/cancellation
and PDF validation writes return `PREVIEW_ONLY` without any business binding.
Its deterministic documents/reports do not constitute engine or payment evidence.
The root build packages plugin **0.3.2** and performs a Worker dry run; it does not
deploy. CI includes a required private-validator typecheck/test job alongside
the existing complete test inventory gate.
The validator's canonical Worker suite lives inside its independent package;
the root security suite imports it. A temporary copy containing only that
package, with no parent dependencies, passed its own `npm ci`, typecheck,
11 Node tests and 15 Python tests. The root compiler excludes this independent
package alongside the scanner; its required CI job compiles the complete package.

## Verification after the template-studio reconciliation

Upstream PR #39 had twelve successful required checks on its reviewed head before
merge. The reconciled branch keeps its studio, private generated documents,
OAuth authorities, background processing and renderer checks. Horizon migrations
0050–0051 follow its unchanged migrations through 0049.

Local post-reconciliation verification passed 142 focused backend assertions:
13 monthly-plan, 15 PDF validation/privacy, and 114 billing, credit, delivery,
plugin-package and observation assertions. Private generated PDF history,
validation and replay remain creator-only, including against another administrator
and through MCP; the SQL guards enforce the same ownership without spending
another member's allowance. All 51 migration transport checks passed with
equivalent schemas, integrity OK and zero foreign-key violations. Typecheck,
ESLint and the Worker dry run passed on the reconciled source.

The 81 affected application browser cases passed again on all three projects,
including studio observer permissions, private-PDF dispatch review and unsaved
edits during language changes. The full preview passed 76 cases with six planned
desktop skips. After the final OpenAPI description update, a fresh preview build
passed all six developer-contract and no-business boundary cases; its source and
served asset hashes were checked. These runs used the branch's own isolated
servers, which were stopped afterward.

The PR workflow separately executes the complete 96-file inventory on its exact
head. Results from the earlier 85-file inventory above are preserved as historical
local evidence; they do not substitute for the reconciled PR's CI.

## Before a public launch

- Obtain explicit authorization for private service provisioning/binding,
  production migrations and deployment. Keep `HORIZON_ENABLED` absent/false until
  the actual private service and production mode are qualified.
- Qualify positive and negative real reference documents for every profile, as
  well as hosted failure, concurrency, timeout and exact-file privacy behaviour.
- Qualify production credit debit, renewal/cancellation and financial records.
  The current EUR50 lifetime promotional grant alone funds one EUR30 period;
  replenishment is still unavailable. Resolve tax presentation and invoice
  obligations before offering a durable paid subscription.
- Perform human keyboard/screen-reader review and a real OAuth assistant journey.
  Local REST/MCP tests and a ZIP do not prove ChatGPT/Claude host availability.
- Verify the exact deployed source and public surfaces, then authorize the
  separate announcements. [Four-language launch drafts](HORIZON_LAUNCH.md) remain
  preparation copy until that evidence exists.

The public offer explains European accessibility rules with primary sources and
their scope/exemptions. PDF/A archival conformity and automated PDF/UA checks
remain distinct. Every report requires human review and explicitly denies
certification. [Feature contract and sources](PDF_ACCESSIBILITY.md),
[monthly plan](MONTHLY_PLAN.md), [private service](PDF_VALIDATOR.md).
