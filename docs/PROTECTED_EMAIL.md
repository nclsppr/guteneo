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

## Language of new protected-link messages

The shared preparation service reads the authenticated sender's saved
`users.preferred_locale` through current workspace membership. It uses French
when that preference is absent or unsupported. The protected-link button,
password instructions and expiration date come from
`packages/contracts/src/delivery-messages.json` in French, English, German or
Luxembourgish. `deliveryExpiryDate` formats the hosting calendar date in UTC;
Luxembourgish uses declared CLDR month names because workerd may lack `lb` Intl
data and silently format an English date. No subject, entered message or document
is translated.

The server adds the localized footer and a supported `?lang=` to the recipient
link before the final content is fingerprinted and reviewed. This applies to web,
REST, MCP and mobile API preparation through the same domain operation. Changing
account language later, an idempotent replay or provider submission cannot
rewrite prepared, approved or already sent text. Recipient page language remains
switchable without granting access or changing the link's hosting term.

The V2 preparation and review panels follow the shared geometry documented in
[DASHBOARD_V2.md](DASHBOARD_V2.md); the final email/document content retains its
own presentation. The recipient route and failure contract are owned by
[protected PDF delivery](PROTECTED_DOCUMENTS.md).

The 25 October correction is a source candidate. Local regression fixtures in
`tests/integration/resend-email.test.ts` cover four-language preparation, French
fallback, localized UTC expiration, explicit reader language and frozen provider
content. The initial routing/localization run passed 13 Resend and 10 protected-document cases
with synthetic local D1/R2 and intercepted transport. Twenty cases in
`tests/unit/delivery-messages.test.ts` cover exact four-language dates, all twelve
Luxembourgish months without Intl and UTC calendar rollover. A local workerd smoke
check also verifies the Luxembourgish formatter. Actual publication and a received-message
journey require separate evidence; no replacement email is automatically sent.

## Default document messages and custom buttons

An email with an accessible ready document may omit its subject, body or both.
Blank values count as omitted. A body default is generated only when both text and
custom HTML are absent; supplied custom HTML provides derived plain text when
no explicit text alternative is given. Defaults identify the authenticated workspace,
using its database name and the sender's saved language with French fallback;
client input cannot select that identity. Supplied subject/body are preserved
subject to their existing validation and sanitization. Message-only email still
requires subject and content; an inaccessible or unready PDF does not unlock
this convenience.

For document emails without custom HTML, Guteneo renders the supplied/default
message in its branded email template. Message-only presentation is unchanged.
A custom HTML template retains safe inline typography, colors,
spacing, borders and table layout through a separate email sanitizer. Scripts,
images, remote resources, CSS URLs/imports and unsafe layout/effect properties
are excluded; this does not loosen the PDF-rendering sanitizer. Custom HTML must
retain readable message text after sanitization; an empty result is rejected with
`INVALID_EMAIL_CONTENT` rather than replaced by a default message.

For a protected link, an author can style an anchor button and place the exact
`href="{{document_url}}"` marker in it. The server substitutes its own private
access URL, includes localized password/expiry instructions and always retains
the URL/instructions in plain text. A valid marker prevents a duplicate access
button; protected custom HTML without the marker receives the styled fallback
button. Both retain the password/expiry instructions. Do not place the marker
inside text, CSS,
another URL or an attachment-only message. Invalid markers are rejected with
`INVALID_DOCUMENT_URL_PLACEHOLDER`; using the marker without protected delivery
returns `DOCUMENT_URL_NOT_AVAILABLE`. No actual token, password or client-supplied
hosting identifier belongs in template input.

Defaults, branded/custom HTML and link substitution are finalized before quoting,
fingerprinting and approval. Idempotent replays retain stored content despite
later workspace/profile edits. Changed content needs new preparation and review;
no template preview is approval. REST, the mobile API and MCP reuse this behavior;
current roles, recipient-request attestation and browser/expert gates remain.
The web individual and campaign forms omit blank document-message fields rather
than submitting guessed defaults. Their draft preview uses the shared template
and authenticated workspace plus saved sender language (French fallback), even
when unsaved browser/interface language differs. The exact substituted link and
expiration appear only in the prepared server review. Advanced protected HTML exposes the literal
marker and an editable button example, with localized validation recovery. A
draft preview contains no invented access URL and never substitutes for review.
The MCP/plugin email workflow describes optional defaults and the marker while
keeping private URLs/passwords out of standard summary readbacks. Authorized expert
review still receives the exact final message under its existing policy; password
retrieval remains exclusively in the authenticated browser. The current native
composer exposes message-only email, not document/template controls.

The presentation extension is a source candidate; deterministic contract tests,
packaged instructions and screenshots do not prove provider rendering, actual
inbox delivery or publication. No email is sent by template authoring or review.

## Local template qualification — 25 October 2026

The expanded template candidate passes 31 email-content unit cases and 23 Resend
integration cases, plus 89 MCP/capability/package/mobile cases and 14 OpenAPI
checks. `tests/security/email-content-runtime.test.mjs` separately compiles the
actual sanitizer/template helpers into local workerd: its one runtime case checks
safe inline CSS retention, parsed protected-link substitution, unsafe resource
removal and branded output in all four languages, including the Luxembourgish
expiration date. Node-only fixtures do not substitute for this runtime check.
All provider transport in these checks is synthetic or intercepted.

The complete `protected-email`, `protected-recipient` and
`email-recipient-attestation` browser specifications pass 75/75 across desktop
Chromium, mobile Chromium and iPhone WebKit. The final run follows a fresh web
build with stable assets. Earlier interrupted captures overlapped a separate
security test that rebuilt the shared output; they do not qualify this candidate.
These are emulated browsers, not physical-device or inbox-rendering evidence.

Final local built-app captures in French, English, German and Luxembourgish show
no page/preview horizontal overflow or JavaScript errors at 390 and 1440 px, with
a dark workspace and the original light-paper email. The measured draft journey
loads 48 resources, transfers 689,462 bytes and makes four API GETs: session,
capabilities, documents and senders. The PDF-viewer module is absent from this
email draft path. First-contentful-paint samples range from 156 to 228 ms across
four individual locale contexts; this is bounded local observation, not a claimed
speed gain or production latency. One separate French sample measured 960.9 ms
from the document-selection routine through enabled protection and a visible
branded preview, including automated control waits; it does not measure initial
network navigation. The separately sanitized full email renders at
390 and 760 px in all four languages with no overflow or network requests. No
actual Gmail/Outlook delivery or rendering is established by these checks.

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
