# App Review preparation notes

Internal document — 22 September 2026 — not submitted.

The mobile backend is under local development and is not deployed. Update
these notes after binary and service qualification. They must not be copied
as an assertion of current availability.

## Information to provide with the qualified binary

Guteneo is a free iOS companion to the Guteneo web service. Its interface is
native. It lets users view tracking, work with account PDFs and prepare
supported operations. Visible features and actually available channels must
match the account supplied to App Review.

Login uses `ASWebAuthenticationSession`, with a secure window presented by
iOS from the app and a controlled return to it. It does not launch the default
browser through `openURL` to request login. This system mechanism is described
in [Apple's authentication documentation](https://developer.apple.com/documentation/authenticationservices/authenticating-a-user-through-a-web-service).
Opening the browser for human dispatch validation is a separate flow.

The application sells nothing. It contains no in-app purchase, credit top-up,
link or invitation to an external purchase. The existing balance and quotes
inform the user of an operation's cost. Guideline 3.1.3(f), concerning free
companions to paid web tools, is the proposed basis for this model. We do not
assume Apple has confirmed the classification of fax. Physical mail does not
justify a blanket exemption for a wallet shared with other services.

Preparation in the app does not send. The user opens the system browser to
review and approve the operation in Guteneo. That approval binds the immutable
document, recipient, options and cost. The browser is not an embedded app
WebView. Service security and availability checks still apply.

A server-limited preparation-only reference quote provides neither validation
nor dispatch access. Present it accordingly, including when a provider or
mandate prevents further steps. Include this case when checking the reviewer
account.

Any demonstration must be clearly identified and produces no real
communication. It does not replace mobile-backend operation evidence.
Final notes must identify the reviewer journey precisely and distinguish
simulated from real results.

Reference: [App Review Guidelines, including 3.1.3(f)](https://developer.apple.com/app-store/review/guidelines/).

## Channel advertised for the initial listing

The production service observed on 22 September 2026 does not enable email
sending. This version's description and keywords advertise fax preparation,
PDF viewing and operation tracking. The client's technical ability to support
email later is not service availability. The initial listing does not advertise
postal preparation.

## Reviewer access — not supplied

No App Review account, password or access code was created or invented.
An authorized owner must supply a dedicated account that remains usable
during review through App Store Connect's protected fields. Do not put those
secrets in this repository.

Before submission, use that account to verify:

1. Real login, verification requirements and any second factor.
2. Fictional PDFs authorized for review and the tracking states needed for
   a complete review.
3. Fax preparation to an available destination and clear explanations of
   unavailable channels.
4. Human approval opening in the system browser, then returning to tracking.
   The app cannot represent approval as already granted.
5. Insufficient balance, expired quotes, documents still under analysis,
   network failures and expired sessions.
6. Access to privacy, support and actual account deletion through the chosen
   journey.

Review must not require sending to a nonconsenting person. The owner must
supply authorized test recipients and explain what would actually be
transmitted before any real channel is used. If an isolated review mode is
chosen, document its limits and obtain Apple's agreement when it replaces
the requested service access.

## Submission blockers

- Mobile backend not deployed; production integration unqualified.
- Native authentication, returns, session lifecycle and account deletion need
  end-to-end qualification.
- Reviewer account, fictional data and authorized test recipients are not
  supplied in this folder.
- Physical-device, accessibility, signed-archive, Apple-validation and
  TestFlight-installation evidence must accompany the final build.
- Compare metadata against actually delivered features; finish real captures
  and privacy details after that check.
- Submission, production activation and publication are separate external
  actions; this document attests none of them.

Commerce boundaries, sources and detailed submission conditions are in
[REVIEW_POLICY.md](REVIEW_POLICY.md).
