# Resend and protected documents

21 September 2026 candidate. [RESEND_PROOF.md](RESEND_PROOF.md) records publication
and real tests; local tests do not prove actual delivery.

## Journey

Email supports no document, the exact PDF as an attachment, or a protected link.
Direct import in the form waits for PDF analysis. Before approval and sending,
the sender checks recipient, message, document, expiration and cost. Message text
is sufficient; HTML is optional. Guteneo supplies the sending domain and the
author's verified address supplies Reply-To. Automatic configuration never
reverses an administrator's channel shutdown.

The link opens a Guteneo page without a recipient account. Its generated password
is revealed only to an authorized member in their browser and is shared separately
by the sender. It never appears in email, options, MCP responses or logs. The
opaque link belongs to the exact approved content. ChatGPT/Claude use the same
`prepare_dispatch` with `options.emailDeliveryMode=protected_link` and
`protectedDays` of 1, 7 or 30 days (default 7). Review and confirmation permissions
are unchanged. An assistant cannot enable delegation or reveal the password.

## Cost and duration

Hosting costs 100 euro cents per document and hosting period. Existing active
hosting is reused without another debit, including multiple recipients and two
concurrent confirmations. Effective duration and expiration are shown before
approval. After expiration or revocation, new hosting requires new price acceptance.

Resend transport pricing is separate: the public Pro reference of USD0.90 per
1,000 additional emails, multiplied by two using the frozen ECB commercial
conversion of 16 September 2026 (EUR1 = USD1.1537). This is a public price reference,
not a claim about the Free account's actual marginal cost. PDFs add no per-byte
price. Fractional email cents accumulate before debit.

One confirmation transaction checks approval, reserves transport, debits the
100 cents at most once, activates hosting and inserts the outbox. Transport
reservation excludes hosting already debited; monthly ceilings include both.
Cancellation or email rejection does not remove activated hosting or automatically
refund it. Access continues until revocation or expiration. Existing promotional
credits fund these amounts; Stripe replenishment is separate work.

## Protection

The private original remains bound to its organization and approved SHA-256.
A protected link replaces the attachment without removing that binding. A random
256-bit token is stored as a hash; the password has 144 random bits and a salted
PBKDF2 verifier. The recoverable token and password use AES-GCM with
`PROTECTED_DOCUMENTS_KEY`, associated with organization, document and hash. The
32-byte key is a Cloudflare secret, never a browser setting.

Password verification issues a 15-minute HttpOnly session limited to this hosting.
Worker reads recheck state and byte integrity; no R2 URL bypasses protection.
Opening the link, including by an email scanner, consumes no access. Attempts are
bounded; pages and files are uncached and send no referrer. Revocation invalidates
existing sessions for every recipient sharing the link. Purging retains an
original while active hosting needs it.

This protects access, with no end-to-end encryption claim. Guteneo analyzes the
PDF and the recipient downloads an ordinary PDF. Revocation cannot recover a
previous download. Possession of the link and password does not identify a reader.

## Activation and limits

Required gates: migrations 0039–0041, Resend sending and event-signing secrets,
qualified account/domain identity, dated tariff qualification, hosting key and
explicit channel activation. Account limits apply before provider calls.
Reservations remain held for unknown outcomes; an uncertain outcome never permits
automatic retry.

Account observation on 21 September: Free plan, verified guteneo.com domain,
100 emails/day, 3,000/month and 10 requests/second. Guteneo ceilings may retain
headroom for independent Auth0 traffic. Requalify account, domain or plan changes.
The separately installed Auth0 provider is outside this business activation.

Recipient-list import in arbitrary formats and distribution of Excel or other
files are future work. The active contract is PDF documents and validated CSV
lists. Personal recipient accounts are planned later.

Sources: [Resend sending](https://resend.com/docs/api-reference/emails/send-email),
[attachments](https://resend.com/docs/dashboard/emails/attachments),
[pricing](https://resend.com/pricing),
[webhook signatures](https://resend.com/docs/webhooks/verify-webhooks-requests),
[R2 encryption](https://developers.cloudflare.com/r2/reference/data-security/).
