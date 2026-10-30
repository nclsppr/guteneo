# Apple passkeys and Guteneo login

Audit dated 22 September 2026. No Auth0 configuration changed, key created,
account created or biometric login performed during this audit.

## Conclusion

Auth0 supports passkeys on database connections. A key specific to the Guteneo
account can be stored in Passwords/iCloud Keychain and used on Mac and iPhone.
This neither reuses the Apple-account key nor adds Sign in with Apple.

Guteneo code requires no password and can retain Universal Login. Reading the
authenticated Auth0 dashboard confirms passkeys are **disabled** on
**Guteneo-Accounts**, with **Identifier First** still missing. No successful
physical Mac/iPhone test is claimed.

## What was verified

| Level | Finding |
| --- | --- |
| Provider | Auth0 documents Universal Login passkeys and coexistence with passwords. |
| Apple | iCloud Keychain can synchronize passkeys between approved devices. Safari/compatible systems present local verification, including Face ID/Touch ID. |
| iOS client | `Authentication.swift` uses `ASWebAuthenticationSession`. It embeds no password form or imposed authentication method. |
| Server | `auth.ts` uses OAuth code and PKCE without forcing a password. The account still needs email verification and existing signed evidence. |
| Public page | HTML fetched with Mac/iPhone Safari headers shows email/password, without a passkey button or `webauthn` autocomplete attribute. The built-in browser also showed a password form and one Guteneo logo. This is not a Safari/device test. Missing buttons alone do not establish administrative configuration. |
| Administration | Read-only Safari inspection of authenticated `manage.auth0.com/dashboard/eu/pieper/`: Enable Passkey disabled; Password active; Identifier First missing. No setting saved/changed. |
| Devices | Key creation, synchronization and Mac/iPhone authentication remain unqualified. This branch's mobile API is not deployed. |

`scripts/setup-auth0.mjs` provisioning configures neither passkeys nor
Identifier First. That describes script behavior, not current provider state.
It preserves existing connection options.

The same public inspection shows one Auth0 logo loaded from
`https://guteneo.com/brand/guteneo-stamp.png`. That PNG is the halftone
“guteneo.com” stamp, fully opaque (512 × 512; 262,144 pixels at alpha 255).
It matches the repository file, SHA-256
`4a71302cbf9226fb6efc2df99ce8effc48101d5bc254d2e71bb10e84f8820822`.
The app's transparent logo is therefore corrected separately; Auth0's actually
presented logo still needs replacement. Current plans for new clients already
use `guteneo-portrait.png`. For an existing client, follow
[AUTH0_BRANDING.md](AUTH0_BRANDING.md): verify Guteneo ownership, then change
only `logo_uri` after authorization, without reapplying provisioning or the
whole tenant theme.

Public portrait `https://guteneo.com/brand/guteneo-portrait.png` was also
checked: SHA-256
`df22d2f73f7e281ece61a2c99b5331d30be344e647dc97c738d09f9df122fb9a`,
64,315 transparent pixels. Availability/transparency are proven; they do not
prove the Auth0 client already uses it.

The production repository's configured policy is `verified_email`. The audit
did not change it. The client must not treat a passkey as MFA evidence: strict
mode, when chosen, requires MFA actually reported by Auth0. Human-approval
and tenant rules apply regardless of login method.

## Auth0 settings observed in Safari

Database > Guteneo-Accounts > Authentication Methods > Configure Passkey shows
Enable Passkey disabled (`Value 0`) and Password active. Displayed prerequisites:
Requires Username disabled, custom login page disabled and Universal Login
enabled — all satisfied; Identifier First remains pending.

Button & Autofill is selected, as are the displayed progressive/local
enrollment options. Because the method remains disabled, these choices are
not effective activation. No setting changed.

The connection's Applications tab enables Browser, ChatGPT, Claude Code,
Claude hosted, Cursor and OpenAI Review. Default App and Parkventory are
disabled. Enabling passkeys on this connection would therefore affect its
six Guteneo clients. Preserve password recovery access.

Passkey settings belong to the database connection; Identifier First affects
the tenant login journey. Inspect other databases/applications before changing
it. Confirm login domain and RP ID before creating keys: changing that
identity can require reenrollment.

The current app uses system web authentication. Direct in-app passkey APIs
are another Auth0 journey with additional prerequisites: custom domain,
app/site association and application settings. The audit adds no such journey
and does not claim those settings already configured.

## Durable read-only administrative access

CLI diagnosis was qualified separately in memory: connection/prompt GETs exit
with process code 1 and category `AUTHENTICATION_EXPIRED`. No precise HTTP
401/403 status was established. Raw output was not exposed. Safari dashboard
login does not itself renew CLI identity.

For audits without repeated human login, the proposal is a dedicated first-party
M2M application limited to read-only tenant Management API access. The
[Auth0 CLI distinguishes user and machine login](https://auth0.github.io/auth0-cli/auth0_login.html);
machine login suits noninteractive tools. This application was not created.

| Required read | Proposed permissions |
| --- | --- |
| Applications/public configuration | `read:clients` |
| Connections/passkey settings | `read:connections`, `read:connections_options` |
| General tenant preferences | `read:tenant_settings` |
| Universal Login/Identifier First | `read:prompts` |

[Ordinary client fields](https://auth0.com/docs/api/management/v2/clients/get-clients)
need no secret access. Grant neither `read:client_keys`,
`read:client_credentials`, `read:connections_keys`, user access nor create/
update/delete permissions. `read:connections_options` is required for `options`
since the [July 2025 Auth0 change](https://auth0.com/docs/troubleshoot/product-lifecycle/deprecations-and-migrations#new-management-api-scopes-required-for-connection-options).
[Tenant-setting](https://auth0.github.io/auth0-PHP/classes/Auth0-SDK-API-Management-Tenants.html)
and [prompt](https://auth0.com/docs/api/management/v2/prompts/get-prompts)
permissions remain distinct. These scopes apply to the tenant: a Guteneo
application name does not technically restrict reads to its own objects.
The audit tool must restrict paths and filter responses before display.

M2M permissions are granted on its Management API authorization;
`auth0 login --scopes` concerns user login and does not create that grant.
Keep machine credentials in a system vault/secret manager, outside repository,
conversation and command history. Use tokens only in memory without raw
traces. Initial authorization remains required; it grants no configuration
mutation rights to the tool.

Client credentials can request a new token automatically using machine
credentials without a user refresh token.
[Auth0 explains M2M renewal](https://support.auth0.com/center/s/article/Refresh-token-for-M2M-applications).
Reuse the token until near expiry, then renew. The Management API default
lifetime is 24 hours; prefer a short lifetime compatible with need, without
blindly changing a shared duration. Already-issued tokens remain valid until
expiry after future-access revocation: plan credential rotation and grant
removal.
[Token lifetime/security](https://auth0.com/docs/secure/tokens/access-tokens/management-api-access-tokens)

Tokens for the internal Management API audience do not consume the M2M quota
for custom audiences. This removes neither rate limits nor plan-feature
qualification.
[Auth0 quota clarification](https://support.auth0.com/center/s/article/Do-Management-API-tokens-count-towards-my-M2M-token-quota)
Touch ID/Face ID tests and intentional passkey creation remain user actions;
machine access does not replace them.

## Remaining qualification

1. On an authorized test account, intentionally create a Guteneo key from
   Safari on Mac and retain it in Passwords. The user personally performs
   biometric validation and key creation.
2. Verify return to Guteneo, expected account and access checks; log out and
   log in again using the key.
3. On an approved physical iPhone with iCloud Keychain active, verify key
   availability, local validation and the same Guteneo account.
4. After authorized mobile API activation, repeat through the iOS authentication
   window with return to the app. Also check cancellation, missing key,
   recovery and session expiry.

Simulated WebAuthn or changed HTTP headers prove neither Face ID, Touch ID
nor iCloud synchronization. Delete no existing key for this test; no real
communication is needed.

## Official sources consulted

- [Auth0 passkeys](https://auth0.com/docs/authenticate/database-connections/passkeys)
- [Auth0 prerequisites/configuration](https://auth0.com/docs/authenticate/database-connections/passkeys/configure-passkey-policy)
- [Database-connection scope](https://support.auth0.com/center/s/article/enable-passkey-for-specific-app)
- [Embedded passkey APIs](https://auth0.com/docs/authenticate/database-connections/passkeys/passkey-apis)
- [Passwords/passkeys on Apple devices](https://support.apple.com/en-gb/120758)
- [Apple system web authentication](https://developer.apple.com/documentation/authenticationservices/authenticating-a-user-through-a-web-service)
