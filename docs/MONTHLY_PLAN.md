# Retired PDF verification subscription

Retired in the 25 October 2026 branch candidate. New subscription and resubscription
requests are closed, scheduled renewals create no new recurring charge, and the
current PDF verification purchase has no monthly subscription prerequisite.
[PDF verification](PDF_ACCESSIBILITY.md) and its
[unit-pricing contract](PDF_VERIFICATION_PRICING.md) own current behavior.
This document preserves historical financial meaning only.

## Historical terms and evidence

The 2 October implementation recorded EUR30 per calendar month as integer `3000`
minor units, paid from available account credits after explicit recurring consent
by an authenticated browser administrator. It included 100 diagnostic attempts per
UTC calendar month and separate simulation evidence. These are retired terms,
not current prices, allowances, a free period or a future renewal promise.

The original initial debit, consent action and paid period were atomic. Delivery
reservations and separately charged hosting were protected from subscription
spending. An unfunded renewal created no debt or debit. Cancellation retained the
already paid period. Calendar anniversaries clamped month ends while preserving
the original anniversary day. These facts explain retained records; they do not
authorize another debit or a replacement purchase.

Additive migration `0050_monthly_plan.sql` installed the original tenant-scoped
subscription actions, subscriptions and immutable charge journals. Its consent
terms, numeric amounts, timestamps and existing charge references remain unchanged.
No applied migration or historical financial entry is rewritten for the new offer.
Historical subscription charges still contribute once to the current shared
credit balance and to UTC usage activity on their original posting dates.

## Authority and privacy that still apply

Only current browser administrators may read administrative financial balances
and manage the independently configured billing integration. Current membership,
original tenant/user, browser credential evidence and CSRF are rechecked for
protected mutations. Assistant statements, OAuth scopes and expert mandates do
not establish human financial consent.

Existing PDF reports remain available only under current document access. A
legacy paid period does not reveal a creator-private PDF to another member or
administrator. Reading a report neither activates a subscription nor purchases
a new verification. The new individual purchase uses its own exact-PDF/profile
price and terms rather than reusing recurring consent.

## Dated qualification limits

The original `tests/unit/monthly-plan.test.ts` executed real isolated Miniflare
D1 migrations and triggers for subscription accounting, calendar boundaries,
concurrency, authorization races and simulation separation. Funded renewal used
explicit test-only simulated credit because a EUR50 grant cannot pay two EUR30
terms. Those fixtures did not prove commercial top-ups, real monthly customer
renewal, Stripe payment, tax configuration or a hosted validator.

The [historical proof](PDF_VERIFICATION_PROOF.md),
[opening record](PDF_VERIFICATION_OPENING_2026_10_03.md) and
[activation archive](PDF_VERIFICATION_ACTIVATION_RUNBOOK.md) remain dated evidence.
Do not execute archived subscription activation or renewal steps. Current rollout
must qualify individual purchase, failed-engine release, exact-key recovery,
insufficient credit and retained-history access against the final candidate.
