# Organization billing

Implemented on 2026-09-16. This module tracks actual Stripe billing objects when an independently owned Stripe account is configured. It never converts simulation usage to money, invents a plan, creates a charge, subscribes a customer, raises a sending quota or enables a channel. Local intercepted Stripe responses are test evidence, not a qualified live account.

## API and browser integration

Apply `migrations/0009_billing.sql` before installing the API routes. `handleStripeWebhook(request, env)` handles `POST /webhooks/stripe` before browser authentication. `handleBillingRoute(request, env)` handles the following routes before the generic MCP authentication middleware; it authenticates browser sessions, validates CSRF for mutations, checks current administrator membership and shares the organization's HTTP quota. It returns `Response | null` and throws the existing `DomainError` on failures.

| Route                                            | Behavior                                                                                                                                                                           |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/billing`                               | Connection status, Stripe environment, recorded subscriptions and a distinctly labelled sending reservation ledger.                                                                |
| `GET /api/billing/invoices?limit=25&cursor=in_…` | Tenant-scoped invoice metadata and integer amounts; up to 50 records per page.                                                                                                     |
| `GET /api/billing/payments?limit=25&cursor=pi_…` | Tenant-scoped PaymentIntent status and received amounts; up to 50 records per page.                                                                                                |
| `POST /api/billing/customer`                     | Create an empty Stripe customer for the authenticated organization using a server-generated stable idempotency key. No payment method, price, plan or invoice is created.          |
| `POST /api/billing/portal`                       | Create a short-lived Stripe-hosted portal session for this organization's existing customer. Requires an `Idempotency-Key` of 8–128 alphanumeric, hyphen or underscore characters. |

Mutation bodies are empty or `{}`. A caller cannot submit a customer ID, organization, return URL, amount or plan. Billing requires an administrator browser session: assistant tokens cannot open the portal. The return path is fixed at `/#/app/billing`. Portal URLs are checked against `https://billing.stripe.com`, returned with `no-store` and never persisted or logged.

The `Billing` page in `apps/web/src/billing-page.tsx` takes the active `Session` as a prop. It presents the connected organization's invoices, payments, subscription statuses and usage reservations. Public preview builds display an empty demonstration state without billing API requests. Local simulation usage remains labelled as simulation even when Stripe test mode is configured.

## Configuration

Use Worker secrets for `STRIPE_API_KEY` and `STRIPE_WEBHOOK_SECRET`. Prefer a restricted key with only Customer creation/read, invoice/payment-intent/subscription read and Customer Portal session creation permissions. Set `STRIPE_MODE` explicitly to `test` or `live`; the key prefix and environment must agree. Production rejects test mode, and a simulation organization cannot create a live customer. Test and live customer mappings and projections are isolated in every database key and relationship.

`STRIPE_PORTAL_CONFIGURATION_ID` may select an existing reviewed portal configuration; otherwise Stripe's configured default is used. Configure features in Stripe deliberately before activation: the portal may offer subscription/payment-method actions according to that configuration. Guteneo itself provides no checkout, price catalog or automatic billing activation.

The transport uses Workers-compatible `fetch`, a fixed Stripe API origin, redirect rejection, a ten-second timeout and pinned stable API version `2026-08-26.dahlia`. No additional SDK dependency is needed. Missing configuration produces `configuration_required` in the overview and an actionable `BILLING_CONFIGURATION_REQUIRED` error on mutations.

No external account, customer, endpoint, charge or secret was created during implementation. Production configuration and live account qualification remain deployment prerequisites.

## Signed events and ordering

Configure a **snapshot** webhook for the same API version, listening to relevant invoice events (created, updated, finalized, paid, payment failed, voided, marked uncollectible), `payment_intent.*` state changes and `customer.subscription.*` state changes. Do not subscribe this endpoint to invoice preview/upcoming or draft-deletion events: deleted drafts cannot be retrieved and draft-deletion projection is not implemented. Refunds, disputes, credit notes and payout reconciliation are also outside this first projection; received payment amounts are gross received amounts, not net revenue or refundable balances.

The raw payload is limited to 256 KiB and verified with HMAC-SHA256 through WebCrypto. Signature timestamps must be within five minutes in either direction. Multiple `v1` signatures support Stripe signing-secret overlap. Wrong environments and Connect-account events fail closed. Unknown customers are acknowledged and ignored; webhook metadata never creates a membership or binds a new customer.

Events are only notifications. The handler retrieves the canonical current invoice, PaymentIntent or subscription from Stripe, validates the returned object ID, customer and environment, and stores minimal metadata. It does not trust old event snapshots or assume delivery order. Reads are serialized by a sixty-second organization/customer lease; the database write is fenced by its random lease token and deadline. Projection and durable event receipt are committed in one D1 batch. A crashed or expired worker cannot overwrite a newer projection or mark an unprojected event as processed. Stripe/provider failures return a retryable error without committing a receipt. Event replay after successful projection is an idempotent acknowledgement.

If customer creation has an ambiguous outcome, retries reuse the same server-generated Stripe idempotency key and immutable parameters. After 23 hours an unresolved mapping requires operator reconciliation, before Stripe's minimum 24-hour retention window can expire. Never delete that pending mapping merely to retry creation: first determine whether Stripe created the original customer and reconcile it through a reviewed tenant-scoped operation.

## Money and data boundaries

Amounts are validated as safe integers in currency minor units and never added across currencies. Sending `usage.reserved_minor` and `usage.confirmed_minor` are reservation ceilings; neither is an invoice nor proof of actual provider charges. The browser labels that ledger separately. Stripe invoice and payment projections are authoritative only as of their displayed synchronization timestamp; the hosted portal supplies Stripe's current detailed records.

No document content, destination, card data, payment secrets, hosted invoice link, portal link or raw webhook body is saved in billing tables. A provider customer ID is globally unique within its Stripe environment to prevent ambiguous webhook routing, while all business primary keys, reads, cursors and foreign keys include organization and environment. Only existing authenticated organization administrators can view billing data.

## Verification and remaining qualification

`npx vitest run tests/unit/billing.test.ts` passed 15 tests against real Miniflare D1 and the repository migrations. These cover current membership and tenant isolation, session/CSRF rejection, scoped cursors, missing configuration, concurrent customer idempotency, ambiguous outcomes, hosted portal isolation, signed event verification and replay, unknown accounts, stale events, provider failure retry, canonical object mismatch, integer amounts, concurrent synchronization and expired-worker fencing. Network calls are intercepted fixtures. Test results do not prove a live Stripe account, a deployed webhook, delivered invoices, tax configuration or real assistant compatibility.

Still required before commercial activation: verify the independently owned Stripe account and restricted permissions, configure and exercise the hosted portal and webhook, agree actual prices/tariffs and refund policy, qualify any required tax registrations, backfill pre-existing records deliberately, add refunds/credit notes/disputes when in scope, and retain real test/live evidence separately. This release does not provision an account, add a purchase flow or imply recurring work after the session.

Official sources checked 2026-09-16: [API versioning](https://docs.stripe.com/api/versioning), [webhook signature and ordering](https://docs.stripe.com/webhooks), [Customer Portal session API](https://docs.stripe.com/api/customer_portal/sessions/create), [idempotent requests](https://docs.stripe.com/api/idempotent_requests), [currency minor units](https://docs.stripe.com/currencies).
