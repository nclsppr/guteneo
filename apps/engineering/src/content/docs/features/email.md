---
title: "Email and protected links"
description: "14 capabilities in the deliver branch of Guteneo."
sidebar:
  order: 9
---

<!-- Generated from docs/feature-map.json. Run npm run docs:build; do not edit this view. -->

**Access boundary:** Current capability and authority required.

Implemented email candidate; dated operator qualification is separate from deployment, global D1 quota policy, signed webhooks and actual delivery.

**Surfaces:** Individual web and MCP default to secure account delivery; REST uses /api/secure-distributions. Explicit attachments and legacy password links, campaigns and native message-only wire contracts remain compatible. Recipient access stays in the personal browser.

[Read the engineering guide](/workflows/delivery-channels/) · [All features](/features/)

## Capabilities

<ol>
<li id="feature-4fdeddcee86c">Individual web/MCP PDF email defaults to My documents: one verified recipient account, no separate password; optional subject/body, localized workspace V2 template and custom HTML href={{document_url}}; final message is frozen before browser approval</li>
<li id="feature-ef24144fdff0">Text/HTML email without a file, with a PDF attachment or with a protected link</li>
<li id="feature-1be24126eeaa">Recipient-request attestation and transactional requirements</li>
<li id="feature-4184f692aa5c">Explicit quote and per-document hosting charge</li>
<li id="feature-394a796c5588">Protected-link footer and expiration date use the authenticated sender account language (French fallback), with four-language catalog, UTC date formatting and declared Luxembourgish months independent of runtime Intl support; recipient link locale freezes before fingerprinting; no translation of entered content or rewrite of approved/sent messages</li>
<li id="feature-5379244d1629">Private /share route and unlock/content children bypass Static Assets and public-error rendering; existing links retain hosting and access checks, with no sitemap inclusion or automatic resend</li>
<li id="feature-7da992808c43">Accessible ready document emails can omit subject/body independently for localized authenticated-workspace defaults (body only when both text and HTML are absent; HTML otherwise derives text); message-only email still requires content and caller HTML cannot select workspace identity</li>
<li id="feature-434127353bda">Web individual/campaign forms omit blank document-message fields, expose a protected-button marker helper and show a shared-template draft preview without invented access URLs; exact final link/expiry stays in prepared review</li>
<li id="feature-04c5a4e44e01">Branded default document-email template or custom HTML with safe inline email styles; exact protected-only anchor href={{document_url}} resolves server-side without a duplicate CTA; markerless custom HTML gets a styled fallback and both retain access instructions before quote/fingerprint, with malformed/unsupported markers rejected and private URL/password summary masking retained</li>
<li id="feature-4c66fb41a3ae">Private link, expiry and browser-only password entry</li>
<li id="feature-0300dfeb9845">Download without a recipient account under access controls</li>
<li id="feature-55e615792e90">Preparation, approval, tracking and provider policy</li>
<li id="feature-4b3aba9029e8">Resend/SES availability is gated separately from activation; public price references and operator account limits have dated qualification, while account-wide quota policy, webhook/secret and delivery require independent installation and verification</li>
<li id="feature-c2c9fa8c1399">Default email quotes the frozen document title and includes Discover guteneo plus explicit unsubscribe/report controls; the hashed mailbox capability can suppress only its originating workspace, with a separate recipientFeedback status and idempotent document lifecycle receipt</li>
</ol>
