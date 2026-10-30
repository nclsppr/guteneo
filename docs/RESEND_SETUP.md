# Resend for Guteneo

Historical preparation, **17 September 2026**, branch `feat/resend-email-connector`.
The 2 October integrated candidate uses **0039–0041** and
[PROTECTED_EMAIL.md](PROTECTED_EMAIL.md); [RESEND_PROOF.md](RESEND_PROOF.md) owns
publication/current proof. Initial connector/migration work deployed no code,
sent no test/campaign, made no purchase and activated no Auth0 provider. Authorized
domain/two sending-key configuration was separate; Worker secret was installed and
Auth0 provider reread disabled.

## Three independent uses

| Use | Path | Authority/tracking |
| --- | --- | --- |
| Account verification/password reset/Auth0 notices | Native Resend in Auth0, separate key, proposed `Guteneo <no-reply@guteneo.com>` | Tenant setup independent of Worker send gates; [AUTH0_RESEND.md](AUTH0_RESEND.md) |
| Guteneo transactional documents/campaigns | `ResendEmailProvider`, shared REST/MCP/domain/Queues | One recipient, immutable content, approval, qualified quote, credit and suppression checks |
| Newsletters/marketing | [Resend Broadcasts](https://resend.com/broadcasts), subscribed contacts/segments/unsubscribe | Separate audience/review; no actual contact/campaign created; app marketing remains closed |

Existing document campaigns stay at 500 rows with individual approvals, not a
marketing-automation engine. Document recipients/Auth0 accounts never automatically
become subscribers.

## Real account and domain observations

Google login in authorized Safari opened personal Resend workspace `nclsppr`.
Added guteneo.com in **Ireland/eu-west-1**, domain
`0140c1df-a406-495d-adb7-78a1204607b3`. Initially no API key/sent email appeared.
Two explicitly authorized Sending-access keys limited to guteneo.com were created,
one for Worker and one for Auth0; historical dashboard labels identified their
separate purposes. No dedicated account was created. Values passed through local
secure forms without output/repository storage. Wrangler confirmed `RESEND_API_KEY`
presence; native Auth0/no-reply sender was installed but **disabled**; no real send.

After conflict checks, three Cloudflare DNS records used TTL300/no proxy:

| Type | Name | Destination/content |
| --- | --- | --- |
| TXT | `resend._domainkey.guteneo.com` | Exact account-provided public DKIM key; report retains fingerprint |
| CNAME | `rsend.guteneo.com` | `rsend-euw1.forge.rmta.net` |
| CNAME | `send.guteneo.com` | `send.forge.rmta.net` |

These came from the actual account; do not substitute old Amazon-MX examples.
Three SES DKIM CNAMEs, `bounce.guteneo.com` MAIL FROM/SPF and DMARC remained.
Resend receiving stayed off. Sending region promises no all-data EU residency.
Domain verification is no send/inbox-delivery proof.

## Application configuration

`EMAIL_PROVIDER` accepts resend/ses; omission preserves SES compatibility, unknown
values block. Production example now shows Resend with sending closed. This dated
candidate changed neither live Wrangler channel selection nor application code;
secret installation alone created version `9698a3ae-6ec0-4f94-b464-403fefabe567`,
Source **Secret Change**, 100% traffic. Public source stayed
`c3798f59cb6cff4e1dcaddb524f43d59b1009822`; `liveSending:true`, channels `["fax"]`
allowed existing fax, not email.

| Setting | Purpose |
| --- | --- |
| `RESEND_API_KEY` | Domain-limited server sending credential in Cloudflare secret |
| `RESEND_WEBHOOK_SECRET` | Application Svix signing secret, not API key |
| `RESEND_ACCOUNT_ID` | Operator-qualified stable account identity, never inferred from key |
| `RESEND_DOMAIN_ID` | Actual domain ID above |
| `RESEND_VERIFIED_DOMAIN` | Exactly guteneo.com here |
| `RESEND_SENDS_ENABLED` | True only after qualification/activation authority |
| `LIVE_SENDS_ENABLED`, `LIVE_SEND_CHANNELS` | Existing additional business-send gates |

`npm run setup:email` securely stores Resend secrets; `setup:email:ses` retains SES.
Secret entry neither selects provider nor opens sending. Hosted use needs corresponding
authorization; [secure setup](SECURE_CONFIGURATION.md) owns mechanism. This initial
preparation installed only `RESEND_API_KEY`; account/webhook IDs were not invented
to fill fields and needed separate qualification.

Canonical `/webhooks/resend` must qualify at least email.sent/delivered/failed/
bounced/complained/suppressed. Verify raw-body/Svix headers before projection.
Unmatched Auth0/Broadcast events create no business dispatch.
`node scripts/provider-readiness.mjs resend` privately reads domain without sending;
sending-only keys may refuse reads, never authorizing automatic scope expansion.

## Migration, pricing and provider switch

Historical `0030_resend_email_transport.sql` extended provider-specific quotes and
Resend limits/reservations locally only; it was later integrated as the numbered
0039–0041 set above. Remote application needs backup/Time Travel, reviewed schema,
coordinated code, foreign-key/integrity checks.

SES tariffs never authorize Resend quotes. Qualify its account/domain/sender/cost/
limits independently; Free quotas are not resale prices/permanent zero-cost promises.
Auth0 consumes shared capacity, requiring qualified business headroom. Provider
switch cannot reroute SES-approved commands to Resend or vice versa. Each attempt
uses exact approved message/PDF bytes. Command-bound Resend idempotency lasts 24 h,
not authority to retry unknown outcomes. Acceptance and delivery differ; logs omit
content/recipients/secrets.

To return to SES, retain AWS/DNS, qualify SES and explicitly select its provider/
gates. Prepared work under another provider needs new quote/approval; unknown work
stays with original-provider reconciliation. No automatic failover.

Official sources: [Auth0 integration](https://resend.com/docs/send-with-auth0),
[domains](https://resend.com/docs/dashboard/domains/introduction),
[send API](https://resend.com/docs/api-reference/emails/send-email),
[idempotency](https://resend.com/docs/dashboard/emails/idempotency-keys),
[webhook verification](https://resend.com/docs/dashboard/webhooks/verify-webhooks-requests),
[Broadcasts](https://resend.com/docs/dashboard/broadcasts/introduction).
