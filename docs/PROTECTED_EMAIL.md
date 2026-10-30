# Resend and protected documents

21 September 2026 candidate. [RESEND_PROOF.md](RESEND_PROOF.md) records publication
and real tests; local tests do not prove actual delivery.

## Document email contract — 26 October 2026 candidate

The individual web email composer and MCP `prepare_dispatch` with a PDF now default
to **My documents**. The invitation opens the recipient's one Guteneo account,
with sign-in/registration and matching verified address before document access.
There is no separate document password. The recipient journey and authority matrix
are owned by [secure distribution journeys](SECURE_DISTRIBUTION_JOURNEYS.md).

Web preparation calls `POST /api/secure-distributions`. MCP also offers
`prepare_secure_distribution`; generic `prepare_dispatch` returns the secure
view when a PDF has no explicit mode, or `options.emailDeliveryMode=my_documents`.
Follow its ID using `get_secure_distribution`, review the final browser
`approvalUrl`, then `confirm_secure_distribution` after recorded approval.
Rendering may initially return `preparing`. An expert mandate does not replace
this specific browser approval. Exact costs include retention and email transport;
preparation itself sends nothing. Revocation uses the existing secure service.

An original attachment remains an explicit web/MCP choice. Historical password
links and explicit MCP `protected_link` remain compatible; their passwords stay
exclusively in the sender browser and are shared separately. Generic REST
`POST /api/dispatches`, campaign preparation and the current native message-only
composer retain their existing wire contracts. REST clients use the dedicated
secure endpoint for this account journey. An unavailable account service or
incompatible source never falls back to an attachment/password link. Existing
sent emails are not rewritten, migrated or resent.

## V2 default and custom HTML

Subject and body are independently optional for an accessible ready PDF. Blank
values count as absent. The server derives the authenticated workspace name and
sender's saved locale (French fallback); an explicit supported notification locale
is allowed by the dedicated contract. A supplied subject/message is preserved.
Custom HTML supplies derived plain text when no message alternative is provided.

Without custom HTML, `packages/contracts/src/email-template.ts` renders warm
ivory paper, an ink-black lowercase wordmark, a serif document heading, a white
10 px panel and a blue 7 px access button. Email-safe Georgia/Arial fallbacks and
inline table layout need no remote fonts, images or tracking resources. All four
languages come from `delivery-messages.json`. The button opens **My documents**;
copy explains sign-in/signup with the receiving address and the funded term. The frozen document name is displayed as a quotation. Small service links explain guteneo and open [recipient feedback controls](EMAIL_RECIPIENT_FEEDBACK.md), whose confirmation and lifecycle contract is maintained separately.

For custom HTML, use an anchor such as:

```html
<a href="{{document_url}}" style="background-color:#2450db;color:#ffffff;padding:14px 24px;border-radius:7px;text-decoration:none">Open document</a>
```

Safe inline styles survive the email-specific sanitizer. Scripts, images, remote
resources, CSS URLs/imports and unsafe effects are removed. HTML must retain
readable content; an empty sanitized body is refused. The marker must be the
entire anchor href; text, styles and nested URLs are invalid. It is supported for
account invitations and explicit legacy protected links, never attachments or
message-only email. A valid marker prevents a duplicate button. Without one,
custom HTML receives one styled fallback button. Localized account/term or legacy
password/expiry instructions remain, including in the plain-text alternative.
Never place a real capability or password in template input.

Defaults and sanitized input freeze at preparation, before bounded rendering.
The final link, HTML, text, policy, recipient and quote are fingerprinted before
approval. Same-key recovery and later workspace/profile changes cannot alter
approved content. Historical policies and request hashes remain compatible.
The browser shows the final rendered invitation; standard MCP/REST summaries
exclude private HTML/URLs. Draft previews contain only a harmless `#` href.
The HTML editor can insert a styled marker button while preserving supplied text
and markup. It reuses the final email's shared button renderer. Its generated
label uses the notification language, including
the French fallback when the account has no saved language, independently of the
interface language. A directly selected or uploaded document keeps its quoted
title in the draft even when it is absent from the first list page. The default
plain-text alternative quotes the same document title and preserves the supplied
message. Preview is never approval or provider-rendering evidence.

Account invitations accept at most 16,000 characters of supplied message/text
and 150,000 characters of supplied HTML. The shared secure-distribution limits
own these bounds; MCP capability metadata and preparation descriptions expose
them. Generic MCP account preparation returns `EMAIL_CONTENT_TOO_LONG` naming
the field and bound before rendering. Other delivery modes retain their existing
limits, and final sanitized messages still pass the dispatch byte-size guard.

The source candidate requires current unit, browser, runtime and documentation
checks. Publication, Auth0 signup/callback and actual received-email rendering
remain separate qualification; no real message is authorized by this change.

## Local template qualification — 25 October 2026

Before synchronization with upstream MCP authentication/private-upload changes,
the expanded candidate passed 31 email-content unit cases, 23 Resend integration
cases, 89 MCP/capability/package/mobile cases and 14 OpenAPI checks.
`tests/security/email-content-runtime.test.mjs` separately compiles the actual
sanitizer/template helpers into local workerd: its one runtime case checked safe
inline CSS retention, parsed protected-link substitution, unsafe resource removal
and branded output in all four languages, including the Luxembourgish expiration
date. Node-only fixtures do not substitute for this runtime check. All provider
transport in these checks is synthetic or intercepted. These targeted counts
qualify the pre-sync candidate, not a complete post-sync suite.

After synchronization and the final button-insertion correction, the complete
`protected-email`, `protected-recipient` and `email-recipient-attestation` browser
specifications pass 78/78 in 2.0 minutes across desktop Chromium, mobile Chromium
and iPhone WebKit. They cover preservation of plain text when custom HTML is empty
and retention of existing custom HTML as the authored body. This run uses freshly
built assets in an isolated temporary directory. These are emulated browsers,
not physical-device or inbox-rendering evidence.

One fresh French capture of that post-sync build loads 48 resources, transfers
689,528 bytes and makes four API GETs: session, capabilities, documents and senders.
Fonts and network idle precede the resource snapshot. The PDF-viewer module is
absent from this email draft path; the page and preview have no horizontal overflow
at 390 and 1440 px and no JavaScript errors. First contentful paint is 236 ms.
The synthetic document-selection routine through enabled protection and a visible
branded preview takes 495.1 ms, including automated control waits; it does not
measure initial network navigation. These are individual local samples, not a
speed comparison or production latency claim.

Earlier pre-sync captures in French, English, German and Luxembourgish showed no
page/preview overflow or JavaScript errors at 390 and 1440 px, with a dark workspace
and the original light-paper email. Those captures recorded 48 resources,
689,462 transferred bytes and first-contentful-paint samples of 156–228 ms; they
are distinct from the post-sync French sample. The pre-sync sanitized full email
also rendered at 390 and 760 px in all four languages without overflow or network
requests. No actual Gmail/Outlook delivery or rendering is established by these
checks.

## CI recovery follow-up — 26 October 2026

GitHub run `40242114407` on candidate `8e7058a` did not pass the full browser
matrix. Desktop shard 3 (`121316222261`) reported `EMAIL_REQUIRED` in the
fictional preview's email preparation/review/simulation scenario. Desktop shard 1
(`121316222214`) and mobile shard 1 (`121316222216`) failed the PDF-generation,
frozen-email approval and simulated-delivery journey at its subject/message
controls. The recovery aligns the fictional fixture with optional custom HTML
and document-message defaults, and selects the localized optional labels when a
PDF is present. Custom preview HTML still requires an explicit plain-text
alternative; that model does not run the production sanitizer.

The iPhone shard 2 job (`121316222226`) also failed the PDF verification
uncertain-response scenario. Its trace showed no POST from the first click while
the PDF became visible. A deterministic regression then reproduced 24.2 px of
consent-control movement between the lazy-module fallback and mounted viewer,
before PDF bytes arrived. The document page now uses the existing stable PDF
viewport, as dispatch review already does. Nine targeted iPhone cases passed
after that correction across three repetitions, covering Classic/V2 held-pointer
stability and the existing network/idempotency scenario. These local checks do
not establish a successful full CI matrix, physical-iPhone behavior or a real
purchase. The earlier focused 78-case email run also does not replace the failed
full CI matrix. No successful CI recovery, merge or publication is claimed by
this entry.

The completed local recovery checks pass 63/63 PDF-verification cases across
desktop Chromium, mobile Chromium and iPhone WebKit, plus 3/3 PDF-generation,
frozen-email approval and simulated-delivery journeys. The two affected preview
specifications pass 13 cases with five intentional desktop skips and no failures;
12 preview unit cases pass with no fetch calls. The guarded preview build,
typecheck, changed-file lint, documentation checks and final engineering build
also pass. These results qualify local synthetic recovery only; a fresh complete
CI run on the final revision and served-release verification remain separate.

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
