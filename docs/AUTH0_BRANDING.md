# Auth0: Guteneo identity

`scripts/setup-auth0-branding.mjs` changes only **New Universal Login** presentation
on `pieper.eu.auth0.com`. This customization was authorized for Guteneo; the former
product no longer uses this tenant. The tenant must already use New Universal Login:
the script refuses to switch authentication experiences.

## Presentation

- Paper `#f6f5ef`, form `#fffefa`, text `#181b22`, buttons and links `#2450db`.
- Login logo: the transparent portrait without text, `https://guteneo.com/brand/guteneo-portrait.png`.
- Separate simple favicon: `https://guteneo.com/favicon.svg?brand=20260917`.
- Tenant display name: **Guteneo**. No other tenant-settings field is submitted.
- French and English titles, descriptions and logo alternative text for `login`, `login-id`, `login-password`, `signup`, `signup-id` and `signup-password`.
- Native Auth0 form, without remote fonts, a custom HTML template, Classic Login or a custom domain.

Presentation changes neither authentication methods nor account-verification
requirements. The display name does not rename the tenant domain. New clients use
the transparent portrait through the provisioning plan. For existing clients,
verify Guteneo ownership and update only `logo_uri`; do not rerun general
provisioning for a visual change. [Brand identity](BRAND_IDENTITY.md) distinguishes
this asset from the guteneo.com stamp used in the footer and external communications.

## Usage

The official Auth0 CLI must already be authenticated to this tenant. The script
reads no credential file, retrieves no token for another process, performs no
automatic reauthentication and does not switch tenants.

```sh
# Local plan: no network calls.
node scripts/setup-auth0-branding.mjs

# Remote inspection with output limited to verified states.
node scripts/setup-auth0-branding.mjs --inspect

# Presentation writes only; requires operator authorization.
node scripts/setup-auth0-branding.mjs --apply

node --test tests/security/auth0-branding.test.mjs
```

Before every call, the script rereads the active tenant identity. Allowed
Management API routes are limited to branding, theme, twelve text dictionaries
and `friendly_name`. Each dictionary is read and merged before replacement to
preserve other customized text. Reapplying skips settings that already match.
Failures expose bounded codes without response bodies, tokens, signed URLs or
personal data.

Remote commands are not transactional: interruption may leave partial changes.
Inspect state, resolve the failure and rerun the same script. A missing theme
(404) differs from permission refusal (403); permission refusal stops without
starting interactive login.

## Evidence and limits

Remote application was confirmed on **17 September 2026 at 01:11 UTC**: Guteneo
name, branding, theme and all twelve dictionaries matched on reread. Idempotent
verification performed **zero writes**. Six focused tests and ESLint passed.

When available, `reports/auth0-branding-proof.json` stores filtered inspection
time, the New Universal Login experience and exact comparisons against script
constants. It contains no raw Auth0 response or login session. The full apply
compares functional prompt settings and the language list before and after.

Local tests cover preservation of text and functional settings, idempotence,
Classic refusal, tenant checks, out-of-scope route refusal and CLI error
projection. An API reread alone proves neither browser rendering nor successful
account creation. No subscription, paid custom domain or personal MFA setting is
changed by this script.

## Primary documentation consulted on 17 September 2026

- [Auth0 CLI Management API access](https://auth0.github.io/auth0-cli/auth0_api.html)
- [Customize New Universal Login themes](https://auth0.com/docs/customize/login-pages/universal-login/customize-themes)
- [Create a theme](https://auth0.com/docs/api/management/v2/branding/post-branding-theme) and [update a theme](https://auth0.com/docs/api/management/v2/branding/patch-branding-theme)
- [Branding settings](https://auth0.com/docs/api/management/v2/branding/patch-branding)
- [Customize text](https://auth0.com/docs/customize/login-pages/universal-login/customize-text-elements) and [replace a language dictionary](https://auth0.com/docs/api/management/v2/prompts/put-custom-text-by-language)
- [Official Auth0 Terraform theme schema](https://registry.terraform.io/providers/auth0/auth0/latest/docs/resources/branding_theme), including accepted border values
