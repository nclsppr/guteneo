# Horizon activation and qualification

This developer-only runbook separates an authorization, an implemented safeguard,
an isolated test result and a production observation. Do not publish it in public
assets or treat an unchecked row as a passed release gate.

## Authorization and scope

On 3 October 2026, Nicolas explicitly requested all remaining Horizon activation
steps: “Fais toutes ces étape et pas grave pour l'offre commerciale, les gens
pourront au moins tester un mois grâce à ça et d'ici à la fin du mois ils pourront
racheter du crédit”. This authorizes the private validator provisioning,
qualification, application binding, activation and production release already
discussed. It defers credit replenishment and durable commercial offer work; it
does not authorize a customer communication, an invented invoice, a promise that
top-ups already work, or administrative impersonation of a customer's account.

The launch uses the existing EUR50 lifetime promotional credit. A first term
costs EUR30 from **currently available** shared account credit. Existing delivery
reservations, settled usage and protected-document fees can reduce the available
amount. No extra grant is created, the first month is not free, and an unused
EUR50 grant alone leaves EUR20 and cannot fund a second term. Insufficient
renewal credit must stop entitlement without a new charge or debt.

The previous publication owner reported source
`c5cc0ddba3c8bb2bcd6fe144bc37a17d1f9cc596`, successful main CI run
`37111666771` attempt 2, and applied migrations 0050–0051 with 51 migrations,
343 matching schema objects and successful integrity/foreign-key checks. These
are the **disabled Horizon baseline**, not evidence that this activation
candidate, a hosted validator or a subscription has been released.

## Evidence ledger

Fill the production column with a timestamp, exact source/Worker version and
an artifact location only after the observation. Evidence labels in application
JSON describe the application's mode; a synthetic fixture carrying
`evidence: "production"` does not establish a real customer transaction.

| Gate | Prepared evidence | Production observation |
| --- | --- | --- |
| Application availability | One `horizonAvailable` predicate requires the exact flag, private validator, production scanner and coherent production mode; focused capabilities regression | Not recorded by this runbook |
| Account debit and authority | Real isolated D1 triggers in `tests/unit/monthly-plan.test.ts` | Not recorded by this runbook |
| Exact-file PDF adapter and ownership | Real isolated D1/R2 with intercepted engine responses in `tests/unit/pdf-validation.test.ts` | Not recorded by this runbook |
| Real engine profiles | Pinned veraPDF 1.30.2 local Docker proof; hosted matrix is separate | Not recorded by this runbook |
| Production browser subscription/cancellation | Protocol below; genuine browser administrator required | Not recorded by this runbook |
| Natural monthly renewal | Calendar, concurrency, insufficient-funds and cancellation tests; no accelerated production clock | Not observed; first due date is in the future |
| Credit replenishment and commercial offer | Deferred by Nicolas; no implemented top-up claimed | Unavailable until a separately completed release |
| OAuth assistant host | Local MCP permission/parity tests are available | Not recorded by this runbook |
| Human accessibility review | Protocol below; automated PDF result always retains manual-review notice | Not recorded by this runbook |

For the shared availability fix, a focused local invocation of
`live-capabilities.test.ts`, `monthly-plan.test.ts` and `pdf-validation.test.ts`
passed **46 tests in three files**, without skips or failures. The retained local
JSON is `/workspace/scratch/horizon-activation-application-proof.json` in the
activation workspace. The monthly-plan fixture uses isolated D1/session rows;
the PDF adapter intercepts engine responses. Neither is a hosted qualification
or a live account debit. CI must run on the final candidate and its merged main.

## Release order

1. Freeze and record the candidate, final CI head and clean main source. Re-read
   the actual production migration ledger; never edit an applied migration.
2. From exact clean synchronized main, run
   `npm run deploy:pdf-validator -- --qualification` for the bounded prelaunch
   qualification. The wrapper first requires both application origins to report
   production mode and Horizon closed; unknown/error/open results prevent
   deployment. This explicit option temporarily enables only the account-private
   `ValidatorQualification` RPC. It does not enable Horizon. Deploy the private
   pinned validator with no public route, no workers.dev or
   preview URL, no persisted observability, EU jurisdiction and runtime network
   disabled. Record the deployed image digest, Worker version, health/version
   proof and actual configuration. A configuration file alone proves no runtime
   network or logging behavior.
3. Exercise hosted synthetic reference PDFs for every advertised profile. Keep
   their source, license, byte count and SHA-256 with observed results. Each profile
   needs a known pass and known failure; a PDF/A pass does not qualify PDF/UA.
   Record cold start, timeout, busy/concurrency, incomplete output and private
   error handling using a service-binding qualification harness. Do not expose
   the validator publicly for convenience or feed customer documents to it.
   Use the local-only bridge and hosted driver described below, then stop the
   qualification process/container and run `npm run deploy:pdf-validator` from
   the same reviewed clean main. Normal deployment forces
   `QUALIFICATION_ENABLED="false"`. Record the closing Worker version and actual
   effective flag; successful engine health plus refusal of the qualification
   RPC is additional evidence. A generic RPC 503 alone does not prove closure.
4. Deploy the application with `PDF_VALIDATOR` bound to the qualified private
   service while `HORIZON_ENABLED` remains absent/false. Confirm production mode,
   scanner, normal identity policy, source and both public availability flags.
   Missing/unready service must not produce a conformity verdict. Flags report
   configuration readiness; they are not a per-request engine-health probe.
5. Prepare dedicated operator qualification accounts and synthetic documents by
   normal authenticated application flows. Do not create or borrow customer
   sessions, OAuth tokens or membership rows. Do not silently subscribe an
   existing customer's account or debit reserved communication credit.
6. Enable the exact string `HORIZON_ENABLED="true"` in the reviewed production
   configuration and release the same clean main. Read `/release.json`,
   `/api/health` and `/api/capabilities` on **both** canonical and workers.dev
   application origins. `horizon.available` and
   `documents.validation.available` must agree. Read authenticated `/api/plan`
   in the operator account; its entitlement remains inactive until consent.
7. Execute the browser/account and document protocols below. Preserve minimal
   redacted evidence without session cookies, CSRF values, signed URLs or PDF
   content in reports/logs. If a material hosted gate fails, disable the launch
   flag and retain cancellation/history access. Disabling the flag alone does
   not demonstrate a successful rollback; re-read actual public/account gates.
8. Verify the released public and private copy in French, English, German and
   Luxembourgish on desktop and touch browser. Availability follows the actual
   deployed gate. The top-up promise stays deferred and no announcement is sent.

The public preview receives no business binding and must continue to reject
subscription, cancellation and PDF validation writes with `PREVIEW_ONLY`.

### Private hosted qualification commands

After the guarded qualification deployment, keep the authenticated Wrangler
bridge on loopback in one terminal:

```sh
npx wrangler dev --config apps/pdf-validator/qualification/wrangler.jsonc
```

Set `HORIZON_MAIN_SHA`, `HORIZON_VALIDATOR_QUAL_VERSION` and
`HORIZON_PROOF_PATH` from the exact clean source, observed qualification Worker
version and a private artifact location. In another terminal:

```sh
npm --prefix apps/pdf-validator run qualify:hosted -- \
  --source-commit "$HORIZON_MAIN_SHA" \
  --worker-version "$HORIZON_VALIDATOR_QUAL_VERSION" \
  --proof "$HORIZON_PROOF_PATH"
```

The driver checks that the customer application is closed before stopping the
container, exercises the actual private service using pinned upstream references,
and writes pass/fail evidence locally. Its process-deadline probe deliberately
kills harmless synthetic Python work; it proves the process-group deadline,
not an observed forty-second timeout of a real Java PDF. A failed hosted driver
does not authorize activation. Keep the original failure and diagnosis.

Before the normal private redeployment, while both origins remain closed, stop
the container through the loopback-only bridge and stop Wrangler dev. Then run
`npm run deploy:pdf-validator` and re-read actual deployed settings and health.
Do not bind the named `ValidatorQualification` entrypoint to the customer app;
the normal `PDF_VALIDATOR` service binding exposes its restricted health/validate
handler only. The temporary qualification bridge is never deployed or published.

## Browser consent and account-credit protocol

Use a dedicated operator-owned production account through its genuine Auth0
browser session. Obtain any necessary account access through the normal login
flow. Recorded human/admin consent comes from the real browser acceptance;
creating a database session or labelling an assistant request as browser consent
would not qualify this step. Subscription is not an MCP or native operation.

| Step | Expected result and minimal proof |
| --- | --- |
| Read the inactive plan as administrator | `/api/plan` returns 3000 minor units (EUR30), EUR currency, current terms version, `enabled=true`, `entitled=false`, management allowed and the actual available balance; private response is `no-store` |
| Confirm available credits | Read the account's balance/reservations through normal admin surfaces or an operator read-only account-scoped SQL check; require at least 3000 available minor units and keep all unrelated reservation amounts unchanged |
| Inspect unchecked consent | Browser visibly explains EUR30/month, debit from shared credits and automatic monthly renewal; submit stays unavailable before acceptance |
| Explicitly accept and subscribe | Administrator checks acceptance and submits; the real same-origin CSRF-protected POST records the exact `termsVersion`; note request's idempotency key only in a redacted/local artifact |
| Inspect resulting account | Plan is active/entitled, period begins now and ends at its UTC calendar anniversary; credit available falls by exactly 3000 and one immutable charge/consent action exists for that period |
| Replay the same browser request | Reuse its key through the existing genuine browser flow; no extra charge, no new term and no changed balance; avoid HAR retention containing credentials |
| Attempt restoration after cancellation | See cancellation protocol below; restoration in the same paid period does not debit again or move the end date |
| Read as supervisor/member/viewer | All can read account status; `creditAvailableMinor=null`, `billingManagementAllowed=false`; none can subscribe/cancel or read financial management records |
| Assistant/native separation | Genuine OAuth/native credentials cannot call plan management; bearer plan routes return `BILLING_BROWSER_REQUIRED`; OAuth capabilities never expose the financial balance or management rights |
| Tenant separation | An authenticated second tenant sees its own inactive plan and own balance only; no caller-supplied organization overrides authenticated membership |

For initial subscriptions a replayed response alone is insufficient financial
proof. The read-only check must correlate the single `horizon_plan_charges` row,
its consent-action reference, the paid period and the shared available balance.
Never save a `session_hash`, cookie, bearer token or PDF body in the proof.

Local regressions already exercise wrong origin/CSRF, false/old/extra consent
fields, concurrent different-key requests, immutable history, demotion/revocation
at the actual SQL write and request-rate exhaustion. Do not demote a real
customer, rotate their token, consume their quota or launch 100 live requests
to restate those isolated cases. Exercise destructive races only in an isolated
qualification deployment/account designed for them.

## Document, report and permissions protocol

Use licensed synthetic reference files. Import through the production document
flow and wait for the **real scanner** to accept the immutable original. Never
insert a ready status in D1 or bypass the scanner. Record original SHA-256 and
size, current document status and engine version; avoid retaining customer text.

1. From an entitled operator account validate a known pass and a known failure
   for each of `ua1`, `ua2`, `1b`, `2b`, `3b`, `4`. Compare each returned hash with
   the original bytes, explicit requested profile and pinned veraPDF 1.30.2.
   Fixed rule totals are 106, 1727, 129, 144, 146 and 109 respectively. Every
   result has `manualReviewRequired=true` and `certification=false`. A genuine
   noncompliant result is a completed diagnostic, not a failed engine request.
2. Confirm no changes to original bytes, scanner state, dispatch approvals or
   communication credit reservations. Checks incur no per-check debit. A new
   key consumes one of the shared 100 attempts for the **UTC calendar month**,
   not the paid anniversary period. Interrupted/engine-failed attempts count.
3. Replay a completed request with the same key/profile/document. It returns the
   same report ID without another engine run or allowance consumption. A changed
   profile/document with the old key gives `IDEMPOTENCY_CONFLICT`. Unknown or
   interrupted outcomes require consulting history and an explicit user action;
   never auto-retry with a new key to make a flaky test green.
4. Read history and export the actual JSON from the browser. Compare its document
   ID/hash/profile/verdict/counters to the response. Only complete reports appear
   in the last-50 history; incomplete/wrong-hash/engine-error reports never claim
   conformity. Export retains manual checks and denial of certification.
5. Check a legacy shared imported document with same-tenant actors. Administrator,
   supervisor and member may run checks; viewer may read accessible history but
   cannot run one. Financial balance and subscription controls remain admin-only.
6. Generate a private original through the real studio as one member, then
   validate/read/export as that creator. Another member **and another current
   administrator in the same tenant** receive document-not-found for its
   diagnostics/history; their denied requests must not consume allowance or
   invoke the engine. A dispatch-specific review grant does not grant diagnostics.
7. Repeat the document-ID read/run denial from the second operator tenant. Tenant
   IDs, document names and reports must not appear in errors. A failed probe is
   not proof that an inaccessible document does not exist; it is proof of the
   interface's indistinguishable refusal.
8. Use a genuine OAuth assistant connection with `documents:write` for
   `validate_pdf` and `documents:read` for `get_pdf_validation`. Recheck membership,
   document ownership, report hash and entitlement. No scope or expert mandate
   adds billing authority. If ChatGPT/Claude is not available, record the host
   journey as unobserved; local MCP transport tests cannot fill that row.

Failure/privacy/concurrency evidence through a dedicated hosted harness is
distinct from successful browser diagnostics. It should include a malformed
reference, a deliberately unavailable private service, a bounded timeout and
concurrent private calls without persisting content/logs. Do not weaken parser
assertions, enlarge limits beyond the reviewed contract or test malware against
customer accounts. Expiry or authority changes across the async engine boundary
must prevent publication, and histories remain governed by document access.

## Cancellation, expiry and renewal without fabricated time

On the operator account, cancellation uses its same current browser
administrator and CSRF with a new stable key and `{}`. Observe
`cancelAtPeriodEnd=true`, `status=cancelled`, the original end date and continued
paid access. A same-key replay changes no credits. A deliberate re-subscription
during the paid term restores renewal while leaving its charge and period
unchanged; finally cancel the qualification account again to avoid an unwanted
standing renewal. Record the operator's intended final state explicitly.

At natural expiry, cancelled accounts lose entitlement and cannot start a new
diagnostic. Already purchased reports remain readable/exportable for callers
who still have document access. The cancelled status may remain `cancelled`;
do not require `past_due` for a cancelled subscription.

For a normally renewing account with less than EUR30 **available** at its natural
due date, the scheduled maintenance must mark `past_due`, create no renewal
charge/debt and deny new paid operations. Repeat unfunded scans create no extra
debits/history entries. Record actual scheduled executions and the read-only
account-specific before/after observations. Expired access fails closed even
before the next cron. The configured maintenance schedule is once per minute;
configuration is not proof that all future executions will succeed.

Do **not** accelerate this in the live customer database: no edits to immutable
periods/actions/grants, fake refunds, temporary balance views, fabricated
subscription rows or time travel in a public production Worker. A first-month
launch cannot honestly claim it has observed its first actual monthly renewal.

To qualify boundary behavior now, run the unchanged application and migrations
in an isolated production-mode qualification deployment with dedicated D1/R2,
no queues/provider sending, no public business routing and the private validator
binding only. Mark every output **isolated production-mode qualification**.
Prepare fixtures and any controlled clock through an explicit test-only harness
that is never deployed in the live app; never install a time override or credit
adjustment in production. Initial subscription/cancellation can use genuine
operator browser sessions. Boundary tests then execute the real SQL/code in
that isolated store. Stop and remove the harness after evidence collection.

Current funded-renewal tests inject additional **simulation-only test credit**
because the grant cannot fund two EUR30 terms. They qualify atomicity/calendar
code, not an actual production top-up or funded monthly customer renewal. Until
replenishment exists, production evidence can cover the real initial promotional
debit and safe unfunded renewal at its natural date. Keep future funded renewal
and commercial replenishment as explicitly outstanding evidence, not retroactively
labelled passes.

## Human review and release record

On public offer, private plan, document control and exported report, review
keyboard focus/order, labels, errors, consent checkbox, disabled/available states
and a screen-reader reading pass. Inspect all four languages, desktop and touch
gestures. Separate this browser review from human assessment of the reference
PDF's reading order, meaningful alternatives and contrast: veraPDF cannot
complete those checks or certify legal compliance.

The final release record contains exact main SHA, 13-job CI result (or updated
required inventory), application/validator versions and image digest, both
origins' manifests/health/capability flags, integrity/migration baseline, synthetic
reference hashes, authenticated journey results and operator account's intended
final subscription state. It lists all unobserved future renewal/top-up/assistant
host/human-review items. Never include credentials, billing session URLs,
customer document bodies or another tenant's financial rows.

Sources: [monthly plan](MONTHLY_PLAN.md), [PDF access contract](PDF_ACCESSIBILITY.md),
[private validator](PDF_VALIDATOR.md), [historical proof](HORIZON_PROOF.md),
[technical atlas](FEATURE_MAP.md), and the exact tests/source files cited above.
