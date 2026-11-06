# Auth0 account email presentation

`scripts/setup-auth0-email-branding.mjs` prepares four existing Auth0 Liquid
templates: `verify_email`, `reset_email`, `welcome_email` and `blocked_account`.
It can change only `body`, `subject` and `from` on `pieper.eu.auth0.com`. The
recovered implementation is an offline candidate; no provider application or
real delivery is implied.

## Coherent letter — 6 November 2026 candidate

The visual candidate aligns the four account-email bodies with Guteneo's
[transactional letter direction](BRAND_IDENTITY.md#transactional-email-identity--6-november-2026-candidate):
white paper, ivory surroundings, a blue accent and primary action, ink lowercase
wordmark, readable body copy and a quiet footer. The existing original stamp,
local font fallbacks and blocked-image behavior retain their separate email
compatibility checks. The content catalog, request-language fallback, escaped
action URLs and application-scoped preservation guards below stay authoritative.

Auth0 account actions remain identity-provider operations, separately from a
business document invitation, approval or communication. Building the candidate
and its synthetic previews changes no Auth0 template, client, email provider,
DNS record or sender identity. A visible logo inside a body does not establish
the [inbox sender-logo qualification](EMAIL_SENDER_IDENTITY.md). Exact generated
artifacts, scoped provider application and actual client delivery still need
their respective evidence.

The 6 November focused qualification passes sixteen local mobile browser cases
for the four generated template types and four languages, including their
available/blocked-image behavior and synthetic long links. Targeted Node checks
cover Liquid scoping/fallback preservation alongside the native-runtime business
sanitizer. These results do not establish a provider-side template update, actual
Auth0 rendering, sender authentication or a received identity email. The
[business-email proof](PROTECTED_EMAIL.md#transactional-letter--6-november-2026-candidate)
records its separate composer, EML and full-security scopes.

## Content and local generation

The declared recipient-copy source is
`integrations/auth0/emails/locales/messages.json`. It contains English, French,
German and Luxembourgish messages. Each field normalizes `request_language`
with `default: 'en'`, `downcase` and `slice: 0, 2`; unknown or missing language
uses English. This email localization does not change Universal Login locale
support or the browser's locale handoff.

The generator uses lowercase ink `guteneo`, the original public stamp PNG,
system email fonts, presentation tables, inline styles and responsive padding.
The verification, password-reset and unblock links use `{{ url | escape }}`;
the welcome link is the fixed public sign-in entry. No name, address or other
recipient content is interpolated. The welcome message grants no document-send
or payment authority. The sender candidate is `guteneo <no-reply@guteneo.com>`;
actual delivery and sender authentication require separate provider proof.

```sh
# All commands in this block are local and send no email.
node scripts/setup-auth0-email-branding.mjs
npm run build:auth0-email
npm run check:auth0-email
npm run test:auth0-email
npm run test:auth0-email:browser
```

The build regenerates four `.html.liquid` files plus `subjects.json` and sixteen
previews in `reports/auth0-email-preview/`. Preview images are copied locally and
ticket URLs are synthetic. The browser checks use a 320-pixel Chromium viewport
with images both available and blocked, and a long synthetic link. Browser email
rendering is separate from Outlook, Gmail, Apple Mail and Auth0 delivery proof.

## Tenant-wide templates, application-scoped presentation

Auth0 has one template per email type. Never paste the unscoped generated
candidates directly into its dashboard. The setup script selects only clients
with current `guteneo-setup-v1` ownership and one of the maintained `browser`,
`claudeCode`, `cursor`, `chatgpt` or `claudeHosted` components. The known reviewer
client additionally needs its exact maintained ID and
`guteneo-openai-review-v1` / `openai-review` metadata. Names alone never establish
ownership. Unknown components and unrelated clients retain their existing email.

The script reads a complete bounded client inventory and requires one to twenty
owned IDs. It wraps **all three** display fields in an `application.clientID`
condition. An unmatched or missing application identity evaluates the exact prior
Liquid field in the fallback branch. That prior field is preserved byte for byte,
including its nested Liquid and whitespace. Missing/non-Liquid templates or empty
fields are refused; defaults are never invented or activated.

Managed v2 wrappers include a payload checksum to detect operator edits. Reentry
extracts the same original fallback, replaces the owned branch and updates the
client list without nesting wrappers. The checksum is a drift check, not a
signature or authorization. Unknown, altered or legacy v1 wrappers fail closed
and require explicit reconciliation against their original template backup.
The September drafts' unaudited wrapper format is deliberately not migrated by
guessing which branch still belongs to another application.

## Remote operation and preservation

The official Auth0 CLI must already be authenticated. These remote commands are
operator procedures and were **not** executed for this recovery:

```sh
node scripts/setup-auth0-email-branding.mjs --inspect
# Requires explicit authorization for the reviewed provider change:
node scripts/setup-auth0-email-branding.mjs --apply
```

The allowlist permits narrowly projected client reads, reads of the four existing
templates, and PATCH payloads containing exactly `body`, `subject` and `from`.
Every API call first rechecks the active tenant. The script requires only
`read:clients`, `read:email_templates` and `update:email_templates`. No client
PATCH, login branding, provider activation, job, send or template creation route
is allowed. It does not retrieve client secrets or change credentials.

Before each potential template write, all selected clients are reread to confirm
their current ownership/component. The template is reread and compared with the
initial snapshot to reject concurrent operator changes. Each write is followed
by exact display-field verification and comparison of every other returned field,
including `enabled`, `syntax`, `resultUrl`, `urlLifetimeInSeconds` and
`includeEmailInRedirect`. Final client and template verification catches later
drift; rerunning an unchanged candidate performs zero writes.

Auth0 operations are not transactional and offer no cross-resource compare-and-set.
A change between the final read and PATCH remains a provider race; use a quiet
operator window. An interruption can leave a subset applied. Errors report only
a bounded code, acknowledged write count and the name of an unverified template.
An uncertain write is never retried automatically. Inspect current state before
an explicitly authorized rerun; do not restore stale snapshots over operator
changes. No raw template, client metadata, recipient or provider response is logged.

## Recovery provenance and proof boundaries

This clean implementation recovers the useful email generators, guards and
preservation tests from the uncommitted `guteneo-resend` draft, and the lowercase
ink presentation from `guteneo-auth0-email-branding`. Old Universal Login/client
logo writes, newsletter helpers, historical provider state and unrelated migration
changes are not part of this lot.

Local tests execute LiquidJS 10.30.1 with strict filter checks rather than textual
substitution. They cover all four locales, English fallback, URL escaping,
unknown/missing application fallback, idempotence, changed client scope, ownership
revocation, complete pagination, malformed inventory/wrappers, concurrent edits,
functional readback, partial outcomes, route restrictions and sanitized summaries.
Tests and screenshots use synthetic state. No live Auth0 rendering, sender/DNS
verification, SMTP delivery or email-client compatibility is claimed.

Primary references consulted on 3 November 2026:

- [Auth0 template customization and request language](https://auth0.com/docs/customize/email/email-templates/customize-email-templates)
- [Auth0 supported Liquid syntax and application variables](https://auth0.com/docs/customize/email/email-templates/supported-liquid-syntax)
- [Auth0 email template scope and provider prerequisites](https://auth0.com/docs/customize/email/email-templates)
- [LiquidJS engine options](https://liquidjs.com/tutorials/options.html)
