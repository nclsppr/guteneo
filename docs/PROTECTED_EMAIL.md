# Resend and protected documents

21 September 2026 candidate. [RESEND_PROOF.md](RESEND_PROOF.md) records publication
and real tests; local tests do not prove actual delivery.

## Transactional letter — 6 November 2026 candidate

The revised candidate uses a 620 px postal letter on ivory with a thin 3 px
cobalt edge and a 32 px live ink wordmark. Qualified single-send Resend mail adds
the approved stamp/cancellation composition at 128 × 70 px only when the selected
policy includes its inline bytes. The original stamp is slightly rotated; a
translucent founding-edition seal overlaps its left edge with four undulating
cancellation lines, leaving the face visible. The actual quoted
filename is the sole, wrapping heading when present, otherwise the existing
subject/localized fallback. Heading size steps down for longer text. French HTML
guillemets use narrow nonbreaking spaces so a closing mark does not detach on
mobile; the entered filename is preserved. The document title is not repeated as another hero. Body copy remains
16 px/26 px; the primary action is a blue pill, access instructions have a
separate compact note, and service links stay underlined and quiet.
`packages/contracts/src/email-presentation.ts` owns the shared table letter,
action and service footer; `email-template.ts` owns default document and
message composition. Preserve supplied subject/text and the independently supplied
custom-HTML contract below; a visual refresh never translates customer content,
changes the selected delivery mode or rewrites an approved or sent email.

HTML-body branding is separate from the sender icon beside a message in Gmail.
[Email sender identity](EMAIL_SENDER_IDENTITY.md) owns that candidate and its
independent domain/provider/display qualification. Changing HTML grants no inbox
logo, provider activation or sending authority. Auth0's separately generated,
application-scoped templates retain the
[account-email contract](AUTH0_EMAIL_BRANDING.md).

Generate the synthetic local review artifacts with:

```sh
npm run preview:emails
```

`reports/email-preview/index.html` is an interactive correspondence gallery with
language, example and desktop/320 px controls plus direct HTML/EML links. It
contains 32 fictional samples: sixteen correspondence letters (account documents,
explicit protected links, attachments and message-only email in four languages)
and sixteen rendered Auth0 account examples (four template types in four
languages). Attachment examples contain only a small generated fictional PDF.
`manifest.json` records HTML sizes and zero performed sends. URLs and addresses are fictional; no real
capability, password, customer content or provider credential belongs in these
artifacts. Browser HTML and opening a local EML file qualify their inspected
local rendering only. They establish neither delivery nor Gmail/Outlook behavior,
sender authentication, an inbox avatar or publication. Preview EMLs carry the
fixed brand artwork inline for a self-contained local file; Auth0's actual provider
candidate still uses its fixed HTTPS image URL. Auth0 generation/application and
actual delivery retain separate evidence.

The initial 1.1.32 letter iteration was visually qualified on 6 November across
all sixteen sanitized variants at 320, 390 and 900 px in Chromium: 48 checks,
zero horizontal overflow, remote resource requests or page errors, with computed
16 px body text. Desktop French, 320 px French and 390 px Luxembourgish screenshots were inspected for hierarchy,
wrapping, action and footer placement.
`reports/email-preview/initial-1.1.32/visual-checks.json` and adjacent PNGs retain
this historical synthetic browser evidence.

The initial iteration's synthetic `my_documents-fr.eml` was also opened and
visually checked in the then-current native macOS Apple Mail renderer: letter, ink wordmark, action, body,
access instructions and footer. This was a local-file observation, with no send,
provider call or inbox receipt. It does not qualify Gmail, Outlook, mobile Mail,
every client setting, sender authentication or inbox-logo display.

[Frontend measurements](FRONTEND_PERFORMANCE.md#transactional-email-preview--6-november-2026-local-measurement)
record the existing-import reuse, no added fetch/loading stage, 52 unchanged
JavaScript chunks and dispatch-chunk increase of 67 raw / 21 gzip-level-9 bytes.
The fixture's 15.11–30.27 ms first-visible-heading samples are local offline HTML
timings, not deployed application performance.

Initial-iteration focused qualification passed 182 Vitest unit/integration/
fictional-preview cases, 19 targeted Node security checks, 16 desktop/mobile Chromium composer cases and
16 Auth0 mobile rendering cases. The then-current complete Node security suite
passed 684/684. These are separate scopes, with overlapping targeted and complete Node
checks; they are not added together as an end-to-end delivery count. Typecheck,
full lint, application build/Worker dry run and the 83-tool MCP annotation audit
also passed for that iteration. A later shared-renderer revision needs fresh
visual and behavior qualification; these observations do not automatically
qualify changed typography, image delivery or provider transport. Exact-head CI
and publication retain their independent evidence requirements.

The initial 1.1.32 candidate synchronized the integration metadata and downloadable
archive because the shared mail source is covered by the direct-MCP import source guard.
That package change added no tool, scope or permission and performed no
marketplace submission, provider template application, real communication or
production release.

## Revised portrait and transport boundary — 6 November 2026 candidate

Default document and message-only business mail may include the exact approved
29,888-byte PNG (384 × 210 source pixels, displayed at 128 × 70) through an
immutable inline content-ID attachment only under a
qualified single-send Resend policy that includes those bytes. The server's
selected quote/policy decides eligibility before the HTML and approval are frozen;
caller HTML or an assistant cannot assert it. The artwork digest is recorded in
the generated CID inside the frozen HTML. No pricing change is introduced.
The visible wordmark remains live text, so identity, heading, action and access instructions remain readable
when a client does not display the decorative image. Preview rendering uses
trusted local bytes instead of a customer-selected or remote image URL. In the
application, only a canonical trusted reference can load the separate fixed-byte
module and resolve it as data under the preview CSP; custom HTML never enables
that source or image permission.
Deterministic offline simulation can exercise that synthetic inline path without
claiming live eligibility.

The production quote must select `resend`, an `included_pdf` attachment basis and
zero byte numerator. Only the server-generated path enables the sanitizer's fixed
CID image; user/custom HTML keeps the ordinary image refusal. The CID includes
the exact SHA-256 declared by `packages/contracts/src/email-branding.ts`; the
[source/output provenance](../assets/brand/source/guteneo-email-postmark-proof.json)
binds the approved source, final PNG, byte count, overlap and paper/alpha geometry.
The [brand contract](BRAND_IDENTITY.md#transactional-email-identity--6-november-2026-candidate)
owns the founding-edition label's decorative meaning; it is never a send timestamp.
The selected sender's normal authorization, content/price fingerprint and final
provider guards still apply.

`packages/contracts/src/email-branding.ts` owns the immutable identity and preview
resolution. The separate `email-branding-image.ts` stores compiled PNG bytes,
which are not imported into the shared browser template. Resend resolves only
the exact fixed image reference, validates byte length and SHA-256, and supplies
its inline `content_id` alongside any separately authorized original PDF. A body
without the image receives no new attachment. Unknown image/CID shapes or altered
bytes are rejected before HTTP; no image URL is fetched or customer bytes used.
The bounded known-asset registry also retains the previous 60 px portrait CID,
its exact 17,264-byte PNG and original dimensions. Existing frozen HTML keeps its
own artwork rather than being rewritten to the current stamp; unknown CIDs remain
refused.

SES and other or unqualified policies retain the same typographic letter without
the portrait and send no inline PNG. Existing attachment-free/raw-PDF quotes do
not qualify an image attachment; branding never adds unpriced bytes or changes a
frozen quote. Existing user-PDF attachment and protected/account delivery choices
keep their separate exact-content/price checks.

Membership invitations sent through the existing Resend batch path retain the
same typographic letter, English copy and primary acceptance action without
artwork or a CID attachment. Auth0 retains its separately fixed brand-asset HTTPS
fallback, described in [account-email branding](AUTH0_EMAIL_BRANDING.md). This
separation changes no invitation lifetime, recipient verification, administrator
permission, human approval, provider activation or unknown-outcome handling.

The revised candidate synchronizes the application, portable, Claude and Cursor
metadata at 1.1.33 because shared content/domain files are covered by the direct
MCP source guard. Both downloadable archive locations are regenerated from that
same record; 31/31 package/synchronization/Claude security checks pass. Tool
schemas, annotations, scopes and host confirmations are unchanged. Package
consistency is separate from actual host import or marketplace publication.

The current stamp/cancellation source passes 160/160 gallery checks across all
32 fictional correspondence/Auth0 cases in Chromium at 320/390/900 px and WebKit
at 320/390 px. Every asset has intrinsic dimensions 384 × 210 and renders at
128 × 70, with no horizontal overflow, external request or client error.
`reports/email-preview/postmark-visual-checks.json` records these local samples.
Independent MIME parsing verifies all 32 EMLs against the exact current PNG/CID,
with four fictional PDF attachments, zero defects and zero stale references;
`reports/email-preview/mime-checks.json` records zero sends.

Current local qualification also passes 87 targeted unit/integration cases, three
isolated browser attack cases, eighteen Auth0 contracts and sixteen Auth0 mobile
cases. The private workerd email check and application build/Worker dry run pass.
These are separate local scopes, not provider or recipient-delivery proof. The
prior portrait-only captures, MIME and bundle measurements at `657c2dae` remain
archived under `reports/email-preview/portrait-657c2dae/` and do not qualify the
new artwork.

[Current frontend measurements](FRONTEND_PERFORMANCE.md#stamp-cancellation-artwork--6-november-2026-local-measurement)
record 54 emitted JavaScript chunks, including isolated current and legacy image
modules loaded only when their exact CID is displayed. The new module measures
39,899 raw / 30,047 gzip-9 bytes; the legacy module retains 23,067 / 17,395 bytes.
Business mail makes no image fetch, and no latency improvement is claimed.

The earlier 1.1.32 Apple Mail observation and timings predate this revision. The
revised portrait/CID candidate has no new native macOS Mail result in this proof;
the local gallery, MIME parser and emulated browsers do not qualify native clients,
Gmail, Outlook, inbox placement or delivery. No real email, DNS change, Auth0 write
or production publication follows from these checks.

The revised French letter's [mobile review](evidence/transactional-email-mobile-fr-2026-11-06.png),
[desktop review](evidence/transactional-email-desktop-fr-2026-11-06.png) and
[letterhead detail](evidence/transactional-email-postmark-fr-2026-11-06.png)
show the current local candidate. These static captures qualify their inspected
source/layout, separately from the interactive gallery, transport tests, native
mail clients and a deployed recipient journey.

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

When earlier sending/postal use or a legacy protected link prevents secure
preparation, the individual email form offers the same explicit
[source-copy recovery](SECURE_DISTRIBUTION_JOURNEYS.md#create-a-source-copy-for-secure-sharing--5-november-2026-candidate)
as the dedicated secure-share form. It preserves the complete draft and selects
an independent private source. Preparation and human review remain explicit;
copying neither cancels earlier work nor recalls delivered files. This recovery
is browser-only and adds no MCP/native copying authority.

## V2 default and custom HTML

Subject and body are independently optional for an accessible ready PDF. Blank
values count as absent. The server derives the authenticated workspace name and
sender's saved locale (French fallback); an explicit supported notification locale
is allowed by the dedicated contract. A supplied subject/message is preserved.
Custom HTML supplies derived plain text when no message alternative is provided.
Message-only email still requires the caller's subject and readable content.
Without custom HTML, its HTML alternative uses that exact supplied subject and
text in the shared letter, with no document-ready heading or invented document
action; the plain-text alternative remains the supplied message. Supplied custom
HTML remains unwrapped under its existing sanitizer contract. The message-only
browser draft and isolated fictional preview use the same shared renderer through
the existing email-template import. The revised branding asset follows the
bounded trusted-preview contract below; it does not add a customer-selected URL
fetch or change the application's authority/loading sequence.

Without custom HTML, the revised source candidate uses the postal letter above,
with email-safe Georgia display lettering, Arial/Helvetica body text and inline
presentation tables. No remote font or tracking resource is needed. The document
message's approved portrait, when qualified by the selected Resend policy, is
carried inline by the trusted branding path rather than fetched from a third-party
URL. Other policies use the typographic treatment without an image. Narrow layout keeps wrapping and readable
spacing. All four languages come from `delivery-messages.json`. The button opens
**My documents**; the access note explains sign-in/signup with the receiving
address and the funded term. The frozen document name is the escaped quoted
heading. Small service links explain guteneo and open
[recipient feedback controls](EMAIL_RECIPIENT_FEEDBACK.md), whose confirmation and
lifecycle contract is maintained separately.

For custom HTML, use an anchor such as:

```html
<a href="{{document_url}}" style="background-color:#2450db;color:#ffffff;padding:14px 24px;border-radius:7px;text-decoration:none">Open document</a>
```

Safe inline styles survive the email-specific sanitizer. Supplied custom HTML
still cannot embed images or choose a CID: scripts, images, remote resources,
CSS URLs/imports and unsafe effects are removed. The generated source-controlled
branding asset has its own narrowly qualified path; it grants no caller image,
attachment, file or URL-fetch authority. HTML must retain
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
