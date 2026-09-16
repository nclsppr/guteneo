# One-time welcome credit

Implemented as an isolated candidate on 2026-09-17. Migration `0014_welcome_credit.sql` is required before deploying this code. This document does not claim remote migration, deployment, a charge, or a real send.

Each production organization receives **5000 EUR cents once**, shared across fax, email and postal dispatches. This is a non-cash promotional allowance, independent of Stripe and distinct from per-channel monthly safety quotas. No API, webhook, month rollover, repeated login or duplicate signup increases this allowance. Top-up is unavailable; no checkout or credit-purchase route is implemented.

## Grant and authorization

A D1 organization-insert trigger writes the grant in the same transaction as account creation. Signup still requires the validated Auth0 identity, verified email and MFA; a rolled-back signup leaves no grant. The grant primary key is the organization, and repeated inserts, including replacement attempts, do not refill it. The migration gives existing production organizations the same single grant. Simulation organizations receive no real grant and continue to use the separate simulation ledger.

New-account per-channel monthly quotas are safety ceilings of 5000 cents and 10000 dispatches. These are not three grants: the shared lifetime balance must independently cover every acceptance. The migration upgrades only untouched zero onboarding quotas whose channels remain disabled. It preserves active-channel emergency zero limits and all nonzero operator settings. Missing later monthly rows inherit the latest channel ceilings, including operator reductions and zero limits, within the confirmation transaction. Month rollover never touches the grant or journal.

Channels, senders, trusted prices, provider configuration and live-send controls retain their existing independent gates. A welcome grant does not enable any channel or waive human approval. A browser admin cannot refill or directly edit the ledger; assistants cannot assert approval or access browser-only billing administration.

## Reservation and settlement

The existing immutable dispatch supplies both the approved ceiling and quoted customer amount. On `prepared → queued`, the credit trigger reserves `ceiling_minor`. The same SQLite statement and transaction also check approval/readiness/quotas and create the existing monthly reservation and outbox. Insufficient available credit raises `CREDIT_EXHAUSTED`; the losing transaction rolls back the dispatch transition, confirmation key, monthly reservation, credit reservation, journal and outbox together. Zero available credit also rejects a zero-cost command.

Confirmed provider acceptance settles the immutable customer price in `estimated_minor`, exactly once. The difference between its reserved ceiling and that amount becomes available again. The credit module does not derive a supplier cost or multiply a tariff; qualified pricing supplies the already-frozen customer amount. Payload values, provider cost claims and Stripe events never determine promotional debits or grants.

`submission_unknown`, a lost response or an expired processing lease retain the full ceiling. A provider failure before confirmed acceptance also retains it: failed/partial fax transmission can still incur supplier/SIP charges, and a claimed zero cost in a callback is not proof. There is no blind retry or automatic expiry of those holds. A later authenticated positive provider fact can settle them; final-cost reconciliation without such a fact remains an operator task, not an automatic refund. Cancellation/preflight failure without any attempt or an explicitly rejected attempt without a supplier reference releases only a still-pending reservation. A failure, complaint or bounce after acceptance does not automatically refund a settled debit. Contradictory positive evidence for an already released reservation is retained for manual reconciliation rather than silently creating an unfunded send (`credit_reservation_closed`).

Three tenant-scoped journal entry kinds describe reserve, settle and release; each kind can appear only once per dispatch. The journal is immutable, holds and charges are integer EUR cents, and balances derive from that journal rather than a browser-supplied counter. Deleting historical dispatch metadata cannot refund a debit or free an unresolved hold. Organization deletion is not exposed by this feature; preserve the journal in retention/backup procedures.

## Read contract

Both authenticated `GET /api/usage` and browser-admin `GET /api/billing` include:

```ts
welcomeCredit: {
  kind: "promotional" | "simulation";
  currency: "EUR";
  grantedMinor: number;
  reservedMinor: number;
  spentMinor: number;
  availableMinor: number;
  grantedAt: string | null;
  status: "available" | "exhausted" | "not_granted" | "simulation";
  renewal: "none";
  topUpAvailable: false;
}
```

Billing additionally has `topUpAvailable: false` at the response root. Stripe connection status remains independent: an unconfigured Stripe account can still display actual promotional credit. A simulation organization returns zero real-credit amounts and `status: "simulation"`. A public browser-only preview can show a separately labelled fictitious amount without API requests.

`availableMinor = grantedMinor - reservedMinor - spentMinor`. The UI must distinguish held amounts from settled consumption and invoices. No positive balance promises that another required provider/channel gate is open.

## Evidence

`tests/integration/welcome-credit.test.ts` uses all real migrations and Miniflare D1. Its pre-priced production-mode fixtures exercise the actual human approval, confirmation, outbox, provider-result and callback paths without external transmission. It verifies a single grant, rollback with failed signup, simulation isolation, concurrent idempotency, competition across channels, losing transaction rollback, tenant isolation, one-time settlement, ceiling release, unknown holds, cancellation/refusal, month rollover, preserved operator stops, journal retention and billing authorization.

The Auth0 test uses a locally signed JWT fixture with verified email/MFA, confirms the actual signup grant and three disabled channels, then signs in again and proves the same grant remains. Invalid identities create no grant. These are deterministic fixtures; real login, qualified prices, authorized real provider acceptance and a deployed migration require separate evidence.

Candidate validation: 18 welcome-credit integration cases and all 272 Vitest tests passed, with typecheck and targeted ESLint passing. `node scripts/migrate-remote.mjs --verify` verified all 14 migrations locally: 113 equivalent schema objects, `quick_check: ok`, no foreign-key violations. It did not contact or change remote D1. Independent review caught and verified the correction for failure arriving before positive provider acceptance; both response and delayed-webhook orderings now settle once while preserving the visible failed state.
