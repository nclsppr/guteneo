# Auth0 account email templates

The four HTML Liquid files and `subjects.json` are generated candidates. Their
recipient-facing copy lives in the declared locale resource
[`locales/messages.json`](locales/messages.json); edit that catalog and
[`scripts/auth0-email-templates.mjs`](../../../scripts/auth0-email-templates.mjs).
The sender is `guteneo <no-reply@guteneo.com>`.

Run `npm run build:auth0-email` to regenerate the candidates and sixteen local
previews in `reports/auth0-email-preview/`. Run `npm run check:auth0-email` to
detect generated drift. The preview builder renders Liquid with a pinned local
engine and synthetic URLs; it never calls Auth0 or sends mail.

Do not paste these unscoped candidate files into tenant-wide templates. The
application script wraps **body, subject and from** in a condition for freshly
verified owned application IDs and preserves the exact prior field for every
other application, including missing identity. Missing or unrecognized language
defaults to English; `fr`, `en`, `de` and `lb` accept mixed-case regional hints.

Read the [operator contract](../../../docs/AUTH0_EMAIL_BRANDING.md) for the narrow
mutation scope, preservation guards, partial-failure recovery and evidence gaps.
