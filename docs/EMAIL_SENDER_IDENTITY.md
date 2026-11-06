# Email sender identity and inbox logos

The HTML email design and the logo beside a sender in Gmail are separate
surfaces. A picture inside Guteneo's message does not configure the inbox avatar.
This document owns inbox identity, public DNS, certificate eligibility and the
qualification boundary; the email-template contract owns message content.

## Current public evidence — 6 November 2026

Read-only authoritative queries to `armfazh.ns.cloudflare.com`, cross-checked
through `1.1.1.1`, found:

| Name | Observed state | Meaning |
| --- | --- | --- |
| `_dmarc.guteneo.com` | TXT `v=DMARC1; p=none;`, TTL 300 | Monitoring policy; no enforcement or report destination configured |
| `default._bimi.guteneo.com` | NXDOMAIN | No default sender-logo assertion |
| `guteneo.com` | No apex TXT or MX answer | No apex SPF or receiving mailbox shown by these reads |
| `send.guteneo.com` | CNAME `send.forge.rmta.net` | Resolver follows provider SPF |
| `rsend.guteneo.com` | CNAME `rsend-euw1.forge.rmta.net` | Resolver follows provider SPF |
| `bounce.guteneo.com` | SPF `v=spf1 include:amazonses.com ~all` | Existing SES return-path authentication |
| `resend._domainkey.guteneo.com` | One public TXT key | Presence only, not a received-message signature check |

Missing apex SPF alone does not establish a delivery defect: DMARC can pass
through an aligned DKIM signature, or aligned SPF on a return-path subdomain.
Review the actual Resend, SES and Auth0 sending identities before enforcement.
Google recommends inspecting authentication and reports during DMARC rollout;
an authenticated DNS record is not proof that every sending stream aligns.
[Google's DMARC setup](https://knowledge.workspace.google.com/admin/security/set-up-dmarc).

For the user's Cloudflare comparison, `default._bimi.notify.cloudflare.com` had
no TXT answer, while `default._bimi.cloudflare.com` published a logo SVG and
mark-certificate PEM. Both `_dmarc.notify.cloudflare.com` and
`_dmarc.cloudflare.com` enforced `p=reject; pct=100`, with `sp=reject` on the
organizational domain. That public setup is consistent with a certified inbox
logo; it does not identify the authentication result of a particular message.

## Gmail requirements and remaining decisions

Gmail requires BIMI with a VMC or CMC, plus DMARC enforcement at `quarantine` or
`reject` for 100% of mail. An SVG-only self-assertion does not enable Gmail's
brand avatar. A VMC supports Gmail's verified checkmark; a CMC displays the logo
without that checkmark. Hosted assets use HTTPS. A certificate can embed the
approved SVG, and Gmail supports a PEM-only BIMI assertion.
[Google's current BIMI setup](https://knowledge.workspace.google.com/admin/security/set-up-bimi),
[Google's CMC announcement](https://workspaceupdates.googleblog.com/2024/09/gmail-additional-bimi-protections.html).

Certificate eligibility is unresolved. A VMC normally requires a recognized
registered logo mark. DigiCert's CMC prior-use route requires at least twelve
months of logo use on an applicant-controlled domain; a modified registered mark
is a separate supported route. Neither trademark ownership nor qualifying prior
use has been established for Guteneo. The issuer must verify the independent
Guteneo applicant and exact chosen mark. Do not assume a new unregistered logo
can immediately obtain a CMC.
[DigiCert's certificate eligibility](https://docs.digicert.com/zf/certcentral/order-and-manage-certificates/manage-certificate-orders/manage-your-vmc-and-cmc-certificates/common-mark-certificate--cmc-.html).

## Prepared local logo candidate

Repository-wide inspection found no native Guteneo vector master. The favicon's
SVG is a PNG wrapper, so renaming it cannot supply an SVG Tiny Portable/Secure
logo. The local candidate
[`guteneo-bimi.svg`](../apps/web/public/brand/guteneo-bimi.svg) traces the existing
approved compact Gutenberg emblem; all originals remain unchanged. It normalizes
the source's dominant blue and white paper rather than introducing new artwork.
Its [provenance](../assets/brand/source/guteneo-bimi-proof.json) binds source and
output hashes to the deterministic conversion.

The candidate is 28,300 bytes, with absolute 512-pixel dimensions, a square
viewBox, `version="1.2"`, `baseProfile="tiny-ps"`, title/description and only
filled vector paths plus a solid white background. It has no embedded bitmap,
font, script, link, animation or external resource. These choices follow the
[BIMI Group SVG guidance](https://bimigroup.org/creating-bimi-svg-logo-files/)
and Google's minimum 96-pixel dimensions. They are local format preparation,
not certificate-authority approval.

Dated local visual QA compared the unchanged 512-pixel source and the rendered
SVG at 512 and 96 pixels. Source-mask disagreement was 0.3304% at 512 pixels;
mean absolute RGB-channel error was 3.8531/255 at 96 pixels. The side-by-side
review retained the portrait, frame and perforations. Raster antialiasing and
paper/color normalization differ: this is a faithful technical derivative,
not a claim of pixel-identical conversion. A CA may require an original vector
master or another exact registered-mark representation.

```sh
# Read-only local integrity and narrow SVG-subset checks (Python standard library).
node scripts/check-email-sender-identity.mjs

# Also inspect current public DNS; no record, provider or message is changed.
node scripts/check-email-sender-identity.mjs --dns

# Regenerate the derivative only when intentionally updating the reviewed asset.
# Generation requires the existing local Pillow image tooling.
python3 scripts/build-bimi-logo.py
```

The checker verifies only this deliberately small SVG subset and its reviewed
hashes. It does not validate arbitrary SVGs, a mark-certificate chain, rights to
the logo or actual inbox rendering. Its output keeps
`certificateValidated=false` and `gmailDisplayQualified=false`.
The DNS diagnostic rejects duplicate or malformed DMARC tags, a changed version,
ambiguous records, incomplete policy application and unknown subdomain policy;
its parser regression imports perform no DNS query or asset generation.

## Deploy-neutral DNS template and activation order

After alignment has been established and certificate issuance completed, the
reviewable candidate records are:

```text
_dmarc.guteneo.com TXT
v=DMARC1; p=quarantine; pct=100; adkim=r; aspf=r

default._bimi.guteneo.com TXT
v=BIMI1; l=https://guteneo.com/brand/guteneo-bimi.svg; a=https://guteneo.com/brand/guteneo-mark-certificate.pem
```

These are templates, not instructions already applied. Add `rua` only after an
actual authorized report mailbox/service exists; the observed apex MX is absent.
Keep existing sending subdomain and DKIM records. The certificate path above
does not exist in this candidate and must not be filled with a placeholder.

1. Inventory the current sending streams and inspect existing received-message
   authentication evidence. Establish aligned DMARC before changing its policy.
2. Resolve logo eligibility and applicant identity; obtain a current issuer quote
   and explicit authorization before any paid order or identity submission.
3. Have the issuer accept the exact final SVG. Preserve its bytes after issuance.
4. Publish the accepted SVG and the issued public PEM chain over HTTPS through a
   separately authorized release. Never publish a private key or issuer token.
5. Separately authorize the reviewed DMARC/BIMI DNS changes and verify their
   actual public answers. Recheck HTTPS status, content type and exact file bytes.
6. Qualify Gmail with an explicitly authorized message and recipient observation.
   DNS, certificate issuance and successful provider acceptance are different
   evidence from inbox display. Do not promise the logo for every recipient.

No certificate was purchased, DNS/provider record changed, production asset
published or real communication sent during this preparation. No human approval,
tenant permission, sender authorization, consent or dispatch gate changes.
