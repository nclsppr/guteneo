# Opening postal mail to all accounts

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
shutdown are never reactivated. Policies expire after 90 days; explicit renewal
preserves declaration and extends no approved quote. Then: exact PDF import → scan
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
