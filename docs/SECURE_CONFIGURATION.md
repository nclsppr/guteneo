# Private provider configuration

Enter keys on the operator's computer; values pass directly to Cloudflare secrets
for `guteneo-app`. Never paste a key into a conversation, issue, Git file or URL.

Run `npm run setup:fax` for Telnyx, `npm run setup:email` for Amazon SES or
`npm run setup:billing` for Stripe. Open the printed local link, fill the masked
fields and save. The Cloudflare service must already exist and Wrangler must be
signed into the authorized account. Empty optional fields preserve existing
secrets, except the AWS session token: a permanent key clears an old temporary token.

For Pingen, run `node scripts/secure-setup.mjs pingen`; client ID, client secret
and organization ID are mandatory. The profile leaves sending closed and creates
no letter or webhook. [Pingen setup](PINGEN_SETUP.md) covers private connectivity.

The server listens only on `127.0.0.1`, with a random path, Origin verification,
CSRF token, closed field list, size bounds and 30-minute expiration. Successful
entry closes it. Values are never returned to the browser, written to a file or
passed as process arguments. They travel in memory and through Wrangler stdin;
output, disk logs and telemetry are disabled for this operation. The computer
and local processes must be trusted.

The `same-origin` referrer policy keeps the entry URL from other sites and lets
Safari send Origin on form submission. Chromium/WebKit checks also cover foreign
origins, invalid CSRF, unknown/duplicate fields, failures and values never redisplayed.

Stripe requires a restricted **production** `rk_live_…` key; production rejects
test keys. Grant only [billing module permissions](BILLING.md). Creating a customer
or opening the portal causes no debit. This form creates no offer, price or
automatic billing.

SES requires a dedicated Guteneo sending IAM API key, European region and
configuration set. Temporary keys need a session token; never supply a root key
or SMTP password. The form sets `SES_SANDBOX=true` and never activates sending.
Any SNS ARN must match the region. See [SES setup](SES_SETUP.md) for minimal
permissions, domain verification and signed notifications.

Auth0 uses official reauthentication and dedicated provisioning, with no password
entry in Guteneo. Fax/email keys do not replace identity configuration, sender,
verified tariff, budgets or human approval.

## Dated operator evidence

On 16 September 2026, at the user's explicit request, the `guteneo-production`
Telnyx key was created in their Safari session, expiring 15 December 2026 at
23:59 UTC. Its value was copied directly into the secure field and sent to
Cloudflare; the clipboard was then replaced. `TELNYX_API_KEY` presence was confirmed
without reading its value. Callback verification key `TELNYX_PUBLIC_KEY` was also
installed. Fax application `Guteneo` (`3050489615535310376`) was active with
`https://guteneo.com/webhooks/telnyx`, outbound profile `Default` and one outbound
channel; its ID was installed as `TELNYX_CONNECTION_ID`. No number was yet in the
inventory. The agent sent no fax and made no payment.

17 September update: an active Luxembourg number attached to the application was
verified and installed as `TELNYX_FROM`. At that time, the callback changed to
`https://guteneo-app.nclsppr.workers.dev/webhooks/telnyx`. SES and Pingen credentials
were also installed and private account authentication succeeded. These are dated
observations; [live release evidence](LIVE_RELEASE.md) and the [current canonical
origin contract](MAIN_RELEASE.md) define their limits and subsequent release rules.
