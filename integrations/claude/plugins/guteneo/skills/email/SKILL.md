---
name: email
description: Prepare and track a Guteneo email. A PDF opens My documents through the recipient account by default; original attachments and legacy password links require an explicit choice.
---

Before using this skill, read the [Claude host contract](../../references/claude-host.md). Use the connected Guteneo tools and preserve the host’s permission prompts.

# Guteneo email

1. Read get_capabilities and reuse the supplied recipient, document, message and ceiling. An email with a ready PDF defaults to My documents: the recipient signs in or creates the one Guteneo account with the matching verified email, without a separate document password. Use options.emailDeliveryMode=attachment only for an explicitly requested original attachment. protected_link remains an explicit legacy compatibility choice. Never substitute either when account delivery is unavailable. Reuse the verified original; follow processing on the same document at most three times, without reimporting or looping on rescans.
2. Call prepare_dispatch with channel=email, documentId, recipient.email and a stable idempotency key, or prepare_secure_distribution for the dedicated policy controls. Omit missing subject/body to use localized defaults naming the authenticated workspace. Without custom HTML, Guteneo uses its V2 email template. Custom HTML may style an anchor with exact href="{{document_url}}"; the server resolves the account invitation before review and adds one fallback button only if the marker is absent. Never invent or expose the private URL. Supplied content remains authoritative. Message-only email still requires subject and text/html. Before requesting content, explain that these workflows exclude sensitive personal data, payment card data subject to PCI DSS, protected health information (PHI), government identifiers and authentication secrets. If such data is known to be present in a document, message, template or dataset, even one already stored, do not import, generate, read, analyse, review or transmit that content through tools. Ask the person to remove the excluded data before sharing a new version; never request the excluded values or suggest web upload to bypass this limit. Antivirus checks and ready status do not prove the absence of these data. See https://guteneo.com/privacy/?lang=en#data.
3. Account delivery returns a secure distribution, possibly preparing. Read get_secure_distribution using its id until prepared; never create a second operation. Present the recipient, PDF, access policy, retention and exact quote including email transport. Account retention defaults to 7 days; 7/30/90/365 days are available. The recipientBinding policy defaults to verified_email; independent confirmation is an explicit dedicated-tool choice. Original download and personal-copy rights are separate. Standard MCP summaries exclude final HTML and private URLs; the exact rendered email is reviewed in the browser.
4. For account delivery, open approvalUrl for authenticated browser review of the exact email, PDF, recipient, policy and non-refundable cost, with separate recipient-request attestation. Neither chat consent nor an expert mandate replaces this approval. After recorded approval, call confirm_secure_distribution with its id and stable key. Use get_secure_distribution for follow-up and revoke_secure_distribution only when requested. Preparation-only accounts cannot send. Never claim recipient consent or enable your own mandate.
5. Message-only email, explicitly requested attachments and legacy protected_link retain their ordinary dispatch flow: browser approval then confirm_dispatch, or an existing authorized expert mandate with review_dispatch and approve_and_send_dispatch. Read get_dispatch_status. A legacy protected-link password stays exclusively in the sender's authenticated browser via emailDelivery.passwordAccessUrl; never retrieve it with tools, request it in chat or put it in the email. The sender shares it separately. New My documents invitations have no such password.
6. Preserve the same id and key after uncertainty. accepted is not delivered; email delivery does not prove document reading or saving. Unknown provider outcomes require reconciliation, never automatic resend. Account access respects verified identity, fresh authentication, expiry and revocation. Receipt creates no workspace membership, purchase or marketing consent. Workspace tools cannot list, claim, export or bind the recipient's personal documents.

## Custom document button

Use safe inline CSS, for example:

```html
<a href="{{document_url}}" style="background-color:#2450db;color:#ffffff;padding:14px 24px;border-radius:7px;text-decoration:none">Open document</a>
```

The marker must occupy the entire anchor href. Text, CSS, nested URLs and attachment-only emails cannot use it. The server sanitizes HTML, replaces the marker and preserves account/expiry instructions in HTML and plain text. A marker prevents a duplicate button; otherwise one styled button is appended. No remote images, scripts or unsafe CSS survive sanitization. Omitted subject and content use the authenticated workspace name and saved sender language, with French fallback. All defaults and links are frozen before approval. See the dedicated `secure-distribution` skill for optional personal-copy and independent-binding controls.

Data imports, templates and campaigns use the document-studio workflow only when exposed. This individual account invitation does not silently convert an existing campaign or a source already used by legacy dispatches. Explain source/configuration refusals without bypassing them. Installation enables no channel, credit, mandate or marketplace publication.

Account invitations accept at most 16,000 characters of supplied text and 150,000 characters of supplied HTML. Read the current account-delivery content limits in get_capabilities and the tool field descriptions. An EMAIL_CONTENT_TOO_LONG response identifies the field and bound before preparation; ask for a shorter version without silently truncating the supplied content. Other delivery modes retain their existing bounds.

Document emails include recipient controls in their footer. Read `recipientFeedback` (`unsubscribed` or `reported`) separately from delivery status. These link-holder responses block future email from the originating workspace; they do not revoke document access or prove identity. Do not exercise recipient controls, expose their URLs or lift a suppression through assistant tools.

## Private original PDF transfer

Preserve a native host file envelope when actually available. Otherwise, when
begin_document_upload is exposed and this runtime can read the selected original
and make the permitted binary PUT, compute its actual size/SHA-256 and use the
bounded client/upload-only grant. When original bytes are available but runtime
egress is unavailable, import_inline_pdf is a separate one-call fallback for an
original up to 64 KiB. Compute canonical base64, size and SHA-256 with code and
use one stable idempotency key; never chunk, truncate, echo/log the encoding or
apply the 10 MiB binary bound to it. Keep explicit original-file permission and
content exclusions. Inline tool arguments consume host context and need actual
host qualification. Preserve network controls, keep capabilities private, and
never publish or reconstruct the PDF. Recover get_document_upload on the same
upload ID after ambiguity, without another import, binary attempt or new key.
Only the same document's ready state allows preparation. A listed tool or local
client test does not qualify an actual host or physical iPhone. A visible name
or local path alone is not an original-byte transport.
