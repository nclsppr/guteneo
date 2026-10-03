# guteneo Horizon — monthly account-credit plan

Local candidate, 2 October 2026. The common name is **guteneo Horizon** in French,
English, German and Luxembourgish. The price is **EUR30 per calendar month**, stored
as integer `3000` minor units. This candidate does not activate production, create
a Stripe customer or subscription, issue an invoice, charge a payment card, send a
communication or provision infrastructure.

## Consent and payment

`POST /api/plan/subscribe` requires a current authenticated browser administrator,
same-origin browser CSRF, an `Idempotency-Key` of 8–128 ASCII letters/digits/underscore/
hyphen, and exactly this JSON:

```json
{ "consent": true, "termsVersion": "horizon-2026-10-02-v1" }
```

The administrator must explicitly accept the fixed EUR30 price, debit from available
shared account credits, and automatic monthly renewal before the UI submits this
request. The server records immutable terms, price, currency, payment source, recurring
authority, tenant, user and browser-session provenance. Human browser authority is
never inferred from assistant statements, MCP scopes, expert mandates or native tokens.
Plan routes share the existing authenticated tenant HTTP budget of 180 requests per
minute. Excess requests return HTTP 429 before recording consent or debiting credits.

The initial debit and paid entitlement are atomic. Production uses the existing
lifetime promotional credit balance after communication reservations, settled usage
and protected-document hosting fees. A plan cannot consume reserved credits, borrow
against future credit, or create an overdraft. Existing dispatch and hosting SQL credit
guards see the plan charge in the same shared balance view. The EUR50 promotional grant
does not renew and no new top-up implementation is included. After the initial EUR30
term, a previously unused EUR50 promotional grant alone cannot fund a second term.

Simulation has a separate fictional EUR50 plan grant and separate simulation charge
evidence. It never creates a production promotional grant or consumes real credits.
These fictional plan credits do not extend the existing communication simulation
safety allowances and are not a provider payment balance.

## Periods, renewal and cancellation

The first term starts at subscription. Months use the UTC calendar anniversary,
clamping to the last day when necessary while retaining the original day: January 31
renews to February 28/29, then March 31. Scheduled renewal handles at most 100 due
accounts per invocation, and requires the original explicit recurring consent.
It rechecks cancellation, period and available credit in the actual write transaction.

A normally due renewal opens the immediate successor term. When an account has missed
an entire successor term, funded recovery restarts a calendar month at the recovery
time. The system never catches up by charging expired intervening months. Insufficient
credit records `past_due`, disables paid features, and creates no debt or debit. Repeated
unfunded scheduled scans do not accumulate entries. Scheduling gaps are not continuous
service evidence; expired access fails closed even before the next cron run.

`POST /api/plan/cancel` requires the same current browser administrator, CSRF and
idempotency key, with `{}` as its body. It stops renewal and retains paid entitlement
until the existing period end. Cancellation remains available when the launch flag or
validator is disabled. Resubscription within the paid term restores renewal without
charging again or extending the period. Same-key replay and concurrent different-key
subscription requests also cannot double debit one paid period.

## Entitlements and billing authority

`GET /api/plan` is an authenticated browser read returning the fixed plan,
`termsVersion`, launch readiness, status, paid term, cancellation state, entitlement,
evidence and management permission. `getHorizonStatus` and `requireHorizonPlan` allow
other authenticated surfaces to read the tenant entitlement. Only a current browser
administrator receives `creditAvailableMinor`; every other member, MCP or native
caller receives `null`. An assistant may use a paid PDF-check feature through MCP,
but cannot subscribe, cancel, manage the account or view its financial balance.

PDF diagnostics and their reports follow current document access: generated private
PDFs remain visible only to their creator, including against another administrator,
while legacy shared imports retain tenant visibility. Paid history survives plan
expiry only for callers who can still access the document; dispatch-specific review
access does not automatically grant access to diagnostics.

The candidate starts disabled. `HORIZON_ENABLED="true"` and a `PDF_VALIDATOR` binding
are both necessary for any subscription or entitlement, including simulation.
Production also requires production evidence; missing validator or mismatched mode
cannot unlock a paid feature. Validator presence is a configuration gate, not proof of
provider availability or production qualification. The PDF validation adapter has its
own exact-file and response-validation gates.

The entitlement SQL fence is tenant-bound `horizon_subscriptions` with matching
organization evidence, `status IN ('active','cancelled')`, start at or before the
operation, and end strictly after it. Any operation retaining access across an
asynchronous boundary must recheck this condition before persisting or returning its
result. Current billing administration requires both the plan and browser admin
authority. The separate plan page allows an administrator to subscribe or cancel.

## Migration and local evidence

Additive migration **0050_monthly_plan.sql** follows workspace and template migrations through 0049.
It retains the dispatch consumption and protected hosting charge terms from migration
0040 when rebuilding `welcome_credit_balances`. Historical credit entries and
reservations are unchanged. `horizon_plan_actions`, subscriptions and charges use
tenant-scoped foreign keys, immutable consent/charge history and a unique charge per
tenant and paid period.

The route fences current session, CSRF, verification/MFA snapshot and administrator
membership in the same `INSERT SELECT` that triggers the atomic change. Revocation,
CSRF rotation or demotion after initial authentication prevents any debit. The response
checks the browser session and current administrator again before exposing a balance.
Recurring renewal uses recorded standing consent rather than claiming fresh human
review on every period; cancellation can be performed by any current administrator.

`tests/unit/monthly-plan.test.ts` uses real Miniflare D1 migration/trigger execution
for initial debit, shared reservation protection, cancellation and paid-period reuse,
idempotent/concurrent subscriptions, authority races, tenant boundaries, assistant/
native financial privacy, default-off/validator gates, insufficient renewal and UTC
month boundaries. Funded renewal uses an explicitly injected **test-only simulated
credit adjustment**, because the actual EUR50 grant cannot pay two EUR30 terms; it
does not qualify top-ups or real recurring production payments.

Production migration, commercial/tax treatment, credit top-up activation, deployed
validator qualification, operational scheduling and actual customer renewal remain
separate publication gates. No production activation is claimed by this candidate.
