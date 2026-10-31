# Opening postal mail to all accounts

## Automatic consumed-profile maintenance — 30 October 2026 candidate

The ninety-day deadline qualifies the configured Pingen account/profile and the
local price-calculator method policies. It is not the lifetime of a cached price:
each letter still reads the exact analyzed provider draft and asks Pingen's live
calculator for its current EUR amount. Its immutable quote lasts at most five
minutes, bounded by the enclosing policy. No currency conversion or ECB reference
is consumed in this postal calculation. The historical method/tax-source date
therefore remains historical; an automatic profile inspection never relabels it
as a newly observed supplier price.

Migration `0069_postal_policy_refresh.sql` adds bounded scheduling state only.
`refreshPostalPolicies` considers one existing production organization per cron
invocation, in the seven days before the current generation's expiry. It requires
the hosted postal preparation consumer to be enabled, the exact verified sender and
immutable declaration, current matching account/country/window profile, and a
complete qualified eight-policy French or sixteen-policy Luxembourg/German set.
It performs genuine `organisation_read` authentication and an account GET. Only an
exact EUR, country and window match can create a new immutable ninety-day policy
generation. It modifies no sender coordinates, declaration, channel, credit,
expert mandate, transfer consent or human approval.

A sixty-second lease, retry backoff and one-hour deferral bound the work. An
unexpired prepared quote or a queued, submitting or uncertain letter referencing
the old policies defers renewal before provider inspection. After the provider
wait, one atomic transaction rechecks the exact sender/declaration/generation and
all old policy fields, preparation selection, lease and absence of affected active
quotes. It retires only that exact predecessor policy set and inserts its new
immutable generation. Old quote amounts, hashes and receipts are not rewritten.
An expiry that prevents safe replacement remains closed rather than bypassing a
commitment or retrying an uncertain communication.

The read-only `inspectPostalPolicyDeadline` reports the revision/deadline only
for an exact active configuration actually consumed by postal preparation.
Explicit preparation deselection, a disabled sender or a proven wholly
revoked current generation is inactive. Missing/unreadable data or changed
bindings are unknown, never proof of recovery or incident closure. The
[shared freshness alerting contract](FRESHNESS_ALERTING.md) owns deadline-minus-one-day
warnings and their deduplication. Inactive or informational records and unused
postal FX do not create freshness alerts. Final-send switches, an absent or invalid
send-channel allowlist, and `channel_controls.enabled=0` do not deselect the
preparation consumer: quote calculation can still use its policies. Maintenance
and deadline alerts therefore continue while preparation remains enabled, without
enabling final sending or changing any channel control.

Source and isolated synthetic tests are separate from production migration,
hosted account inspection, scheduler success and provider delivery. A missing
new schema during rolling deployment produces a closed maintenance failure metric
without interrupting other jobs. Ordinary setup GETs remain read-only. A revoked
policy or disabled preparation service is never revived by this timer; a real account/profile
change requires the existing explicit administrator/operator review.

20 September 2026 delivery contract. The user requested availability on
`guteneo.com` for **all accounts**, confirmed Pingen funding and reserved the first
real end-to-end letter test for themselves. Availability does not prove delivery.

## Existing and future accounts

In Senders, a browser administrator declares organization sender name/address
and explicit authority to use them. Existing/new organizations share this form;
other members ask an administrator. `GET /api/postal/setup` reads;
`POST /api/postal/setup` needs current browser administrator, Origin, CSRF and
explicit declaration. Assistant tokens cannot use that browser action or create/
extend mandates; coordinates are not added to PDFs. A later separately documented
[OAuth sender setup](MCP_POSTAL_JOURNEY.md) has its own authority contract.

Server read-only OAuth checks configured Pingen account, EUR, expected country/window,
then atomically records sender/declaration/eight print-delivery policies and opens
organization channel. Existing credits/quotas do not increase. Client input supplies
no organization/provider account/price; transaction rechecks session/rights.
`senders.status='verified'` means administrator-declared authority, not physical or
Pingen verification. Evidence retains `physical_address_verified=0`; UI says
Declared by administrator. Other channels retain their checks.

Identical repetition reuses sender. Revoked sender/policy and explicit channel
shutdown are never reactivated. Policies expire after 90 days; the automatic
consumed-profile path above maintains an unchanged active setup. Existing explicit
renewal remains available for recovery, preserves the declaration and extends no
approved quote. Then: exact PDF import → scan
→ postal check → review/transfer consent → `auto_send:false` draft → quote → send
approval/confirmation. Supported destinations remain FR/LU/DE under account profile;
physical returns are not promised.

## Price and provider proof

The calculator prices the exact analyzed draft/paper/country/print mode/spectrum/
speed. Customer price is twice returned EUR, integer cents, with eight separate
combination policies. No fixture price or fixed historical LU test amount is installed.

Basis `public_list_price_ex_tax`, method `pingen_price_calculator`, no FX. Pingen
states delivery prices exclude VAT, handled at credit purchase. Sources reread
20 September: [balance/VAT](https://help.pingen.com/en/credits-and-billing/introduction-balance-and-credits),
[VAT statements](https://help.pingen.com/en/credits-and-billing/vat-statements),
[calculator](https://api.pingen.com/documentation/swagger-docs).
Ex-tax pricing establishes no Guteneo tax treatment/final invoice. Paid top-up stays off.

`0030_postal_public_pricing.sql` extends SQL ex-tax checks to EUR postal while
preserving SES/history; `0031_postal_sender_declarations.sql` retains tenant-bound
declarations. Approved fingerprint includes ex-tax basis. Connector reconstructs
from validated quote, then rereads price/evidence before final PATCH. Changes,
expiry or revocation block sending.

## Publication and evidence

Source configuration opens fax/postal, leaves email closed. Release guard checks
channel list/manifest; publish verified merged `main` after migrations/schema
checks, correlating commit, release manifest, public assets, capabilities and
Cloudflare traffic.

PR #18 merged as `ef417c7f187bd11e327881b2127eae653288ac58` with successful PR/main
CI. On 20 September at 19:46 UTC, both then-public origins served it, 72 asset
hashes verified, `postal:true`, `fax:true`, `email:false`. Private Pingen OAuth/EUR/
LU/left profile passed. Remote 0030–0031/schema/integrity checked. No sender
declaration was made for an administrator. The [current origin contract](MAIN_RELEASE.md)
supersedes that dated two-host arrangement.

Audit found a stale scanner, then replaced it with private version
`8e0bffd1-43fd-4401-8663-1f4ecdb794a5`, 100% traffic, ClamAV 1.5.4/database 28129
of 20 September 06:26:26 UTC. Remote clean/EICAR synthetic PDFs, exact hashes and
input refusals passed after deployment. Private postal preflight and read-only
Pingen profile also passed; no letter was sent.

Daily signature maintenance remains required; 72-hour maximum is unchanged.
[SCANNER_CI.md](SCANNER_CI.md) describes replacing local maintenance with Actions,
still requiring dedicated secret/first qualified run at that date. Abandoned
customer drafts and unknown submissions require operator intervention; uncertainty
authorizes no automatic resend/refund. Four Pingen subscriptions were configured;
real tracking proof accompanies the user's first test.

Local/CI tests use intercepted accounts/transports: isolation, browser authority,
concurrency, eight policies, frozen prices, revocation and desktop/mobile UI.
None is a real mailed letter.
