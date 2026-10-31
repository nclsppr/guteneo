# Provider freshness and consumed deadlines

## Current evidence — 30 October 2026

Production **1.1.20** includes the continuous restricted-reviewer access and the
registered Luxembourg fax refresher from migrations **0066–0067**. The first
genuine automatic fax refresh and restricted-reviewer preparation were observed.
Those observations do not qualify other providers, real delivery or marketplace
publication.

The cross-provider collector, J-1 incidents, Pingen maintenance, Resend
maintenance and scanner warning changes described here are a **local candidate**.
Migrations **0068–0070 have not been applied to production**. The extended native
Cloudflare alert condition has not been configured or delivery-tested. Existing
native monitors and their dated evidence remain separate. No new Resend read key
has been provisioned, and authenticated automatic Resend renewal is unqualified.

## Follow the consumer

An observation matters here only if an active, selected mechanism consumes it.
The collector follows the actual provider, account, tenant, sender, route and
options before choosing an effective deadline. Selection does not require an old
quote or message: an explicitly configured first use also needs protection.

| Mechanism                                  | Consumed deadline                                                                                                                | Maintenance and boundary                                                                                                                                                                                                                               |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Registered sendable fax                    | Current `trusted_fax_usage_tariffs.expires_at`, capped by the registration's independent `authorization_expires_at`              | Genuine daily current-catalog discovery, official fax fee, selected CSV, ECB and provider-ownership reads create a new immutable revision with at most 168-hour validity. The route authority is never extended.                                       |
| Pingen preparation                         | Latest exact `postal_setup_policy_generations.expires_at` and its qualified `trusted_delivery_costs` rows                        | Within seven days of expiry, reinspect the same account's country, EUR billing currency and address window; install a new **90-day** generation only if the complete binding still matches. The prepared-letter calculator supplies each actual price. |
| Automatic Resend tariff                    | `resend_policy_refresh_state.qualified_until` after successful maintenance; otherwise the legacy `RESEND_TARIFF_QUALIFIED_UNTIL` | Daily genuine domain, public-price and ECB reads qualify a **30-day** pricing snapshot; selected sending limits also require real usage capacity. Automatic setup/renewal uses it without rewriting old price rows. A replacing manual policy makes the unused automatic setting irrelevant.             |
| Resend account limits                      | `resend_send_limit_policies.expires_at_ms`, with `qualified_at_ms <= now`                                                        | The same complete reads may renew technical evidence while preserving the exact account ID, daily/monthly caps and submission interval. Global reservations and unknown outcomes remain intact.                                                        |
| Other current manual delivery/fax policies | The deadline actually enforced by their quote resolver                                                                           | Monitor as operator-maintained; never convert them into automatic sources or change their dates.                                                                                                                                                       |

The Pingen consumer is **preparation**, selected by its production draft-transfer
configuration and current enabled sender/setup. Cutting final live sending alone
does not remove the price gate from a preparation path that remains open. Missing
or malformed configuration is unknown; it is not evidence of intentional
suspension. An omitted live-send allowlist retains the runtime's existing default.

Historical generations, revoked policies, explicitly disabled mechanisms,
informational tariff/FX dates and archived continuous-review references create no
independent age alarm. Never manufacture a deadline by adding a duration to an
unused source date. The restricted reviewer still uses labelled archived prices,
its own 900-second quote and current no-send guards.

## Real reads and independent authority

Fax discovery follows the fixed authenticated current Telnyx catalog endpoint.
A previously selected versioned CSV is an initial anchor, never a fallback after
failed current discovery. The supported live pilot preserves its existing page
cap, at most ten pages, EUR2 ceiling and independent 3 November 2026 deadline.
The separate reviewer remains capped at seven pages. See
[fax tariff maintenance](FAX_TARIFF_MAINTENANCE.md).

Pingen uses its existing `organisation_read` OAuth exchange and organisation GET.
It renews profile/method eligibility, not a fabricated fixed postage tariff. The
original method evidence and its dates stay unchanged; actual prepared-letter
calculation, short quote validity, human transfer review and final-send approval
remain separate. No document upload, letter, channel activation or sender consent
is created by maintenance. See [postal review](POSTAL_REVIEW.md).

Resend's [Usage API](https://resend.com/docs/api-reference/usage/retrieve-usage)
requires Full access. The optional server-only `RESEND_READINESS_API_KEY` is used
only for inspection GETs; if absent, inspection tries the existing sending key and
may be refused. Delivery continues to use `RESEND_API_KEY`; maintenance creates or
widens neither key. Reads must verify the exact configured domain, provider caps
that accommodate existing local caps when maintaining selected limits,
**USD 900 micros per recipient** from the
public Pro additional-email reference and a genuinely dated ECB rate. The public
Pro reference does not claim the Free account's actual marginal invoice.

The private source-inspection RPC shares these exact readers and parsers while
performing no database access or qualification write. Its result contains closed
status/code/stage values and coarse verified observations, without identifiers or
raw responses. An HTTP 403 remains distinct from a network failure with no
response. Current authenticated renewal remains unqualified; the existing
read-only domain inspection failed. See [Resend setup](RESEND_SETUP.md) and
[dated evidence](RESEND_PROOF.md).

A failed required source read produces no extension. A confirmed domain/binding
contradiction blocks both consumers; a capacity contradiction blocks acceptance,
and a commercial-price contradiction blocks automatic pricing. An exact qualified
manual override retains its own price and deadline. Multiple negative facts stay
recorded independently; a timeout cannot erase them. Quotes, approvals, expert
mandates, sessions, transfer consent and operator authority never gain extra
lifetime from technical maintenance.

## Preserve commitments across replacement

Leases and exact predecessor comparisons fence changes while provider reads are
in flight. Fax and Pingen replacement defer while an applicable prepared quote is
still usable or a dispatch remains queued, submitting or unknown. The final
transaction rechecks the latest selected binding and any newly created quote.
Old source rows and fingerprints remain historical; a new revision does not edit
an existing quote, recipient, content, approved ceiling or approval.

Resend renewal compares the complete previous account-limit policy before
committing its evidence and new deadline atomically. It never resets daily/monthly
reservations, removes holds or retries unknown provider outcomes. An expired
automatic price row may be replaced at a later preparation; a manual row is never
silently superseded. Sender listing uses identity/membership and does not consume
an otherwise unused price qualification.

## J-1, control failures and scanner maintenance

J-1 begins **86,400 seconds before the effective UTC deadline**, inclusive. An
incident becomes expired at the deadline. Tenant/binding/revision/deadline hashes
deduplicate operational state; stale or conflicting evaluations cannot resolve
newer evidence. A successful inspected replacement or proven suspension resolves
only that exact binding. Missing pages, missing credentials and failed reads do
not imply recovery.

The existing minute scheduler performs bounded collection with durable cursors.
The separate `freshness` observation emits `FRESHNESS_AT_RISK` for risk/expiry and
`FRESHNESS_CHECK_FAILED` when inspection or reconciliation fails. A normal Cron
`complete` heartbeat cannot hide a failed check, and an expiry warning does not
stop unrelated safe outbox work. Only coarse counters and closed codes reach logs;
no content, recipients, business IDs, tokens or private source bodies do.

The intended notification path extends the existing native Cloudflare failure
monitor, preserving its destination, original failure conditions, missing-Cron
monitor and hourly repeats. It does not rely on a potentially blocked Resend
send. The plan is local and read-only; native application/readback and actual
notification receipt remain unqualified. Application incident deduplication does
not promise exactly one provider notification per deadline. See
[freshness alerting](FRESHNESS_ALERTING.md).

Scanner maintenance stays on its existing daily refresh and six-hour watchdog.
The candidate warns when the **actually loaded signatures reach 42 hours**;
runtime refusal remains **72 hours**, and shared qualification remains 48 hours.
At normal cadence, this gives roughly 24–30 hours of lead; scheduling or delivery
delays can reduce it. The watchdog separately requires a successful qualification
within 30 hours and warns on maintenance credentials within 14 days. Its GitHub
notification settings are independent of native Cloudflare alert delivery.

## Roles, rollout and proof

Workspace roles and product OAuth grant no provider-maintenance configuration or
monitoring authority. An explicitly authorized platform operator qualifies source
access, reviews any existing route registration, separately authorizes secrets or
native monitor changes, and verifies the resulting hosted evidence. The scheduler
then performs only the bounded technical work above. A connected assistant gains
no approval, mandate, purchase or sending authority.

The candidate supports runtime-first rollout: new Resend state reads retain the
strict legacy qualification when table 0070 is absent; other database errors fail
closed. Missing maintenance/collector schema emits a failed check without stopping
unrelated scheduled work. After exact-source validation and authorized runtime
deployment, apply empty additive migrations 0068–0070 and independently qualify
provider reads, scheduled renewal and native alert configuration. Publication,
authenticated reads, actual renewal, alert receipt and real business delivery are
distinct proof; local fixtures establish only the candidate's tested behavior.

After activation, retain a runtime that understands the current qualification and
contradiction guards during any rollback. An older reader ignoring those recorded
facts is not a safe rollback merely because the schema is additive. Preserve the
new tables and immutable evidence, keep affected operations closed where needed,
and verify both freshness observations and the independent Cron heartbeat after
the authorized recovery. Do not replay uncertain dispatches or reverse evidence
as a deployment shortcut.
