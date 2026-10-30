# Claude.ai: installation and renewal

## Strict registration tooling — 30 October 2026 candidate

The separate [strict registration controller](MCP_REGISTRATION.md) preserves the static-client renewal fallback. It does not activate DCR or prove a new client renewal policy; inspect and qualify the actual host before enabling provider changes.

State as of **18 September 2026**: local candidate. Initial actual connection
is qualified in [CLAUDE_QUALIFICATION.md](CLAUDE_QUALIFICATION.md). The button/
renewal described here still require publication and Auth0 activation; local
tests attest no actual refresh-token exchange.

## Installation for another user

1. Create a Guteneo account, verify email and open the workspace once. This
   creates identity/organization.
2. In the Claude Assistants guide or Connect an assistant, use **Connect to
   Claude**. The official link prefills Guteneo and `https://guteneo.com/mcp`
   in Claude.ai.
3. Copy public ID `IhJieRsvZBAnl1uJO125X2SPoIHxT8ed`, choose **Use your own
   OAuth client**, paste into **OAuth client ID**, leave secret empty.
   The official link cannot prefill these OAuth fields.
4. Add the connector, connect your own Guteneo account and review permissions.
   An administered Claude workspace may require its owner to add the connector
   before members connect.

The public ID grants no account access. Every connection retains its
authenticated user, permissions and organization. Users with multiple
organizations choose one in Guteneo. End users need neither Auth0 admin
accounts nor a terminal.

Local/public-mockup controls remain: demonstration connection never appears
as actual connection. Downloadable terminal configuration is named **Claude
Code**.

Source: [official Claude install links](https://claude.com/docs/connectors/building/directory-vs-custom#share-an-install-link).

## Lifetimes and security

| Item | Prepared policy |
| --- | --- |
| Access token | At most one hour, unchanged |
| Renewal | New refresh token each exchange |
| Inactivity | Expiry after 30 days without refresh exchange |
| Absolute lifetime | Reauthentication no later than 90 days |
| Network tolerance | 3 seconds for concurrent exchange/lost response |
| Reuse beyond tolerance | Auth0 family detection/revocation |

Ninety days is a bounded product choice, not an Auth0 requirement. Rotation/
both expiries use native Auth0. Claude requests `offline_access` when server
discovery offers it and manages host-side tokens. Guteneo stores none in
browser/URLs and adds no artificial keep-alive timer.

Actions retain S256 PKCE for initial authorization. Only explicitly selected
hosted clients can later use `oauth2-refresh-token` for the correct audience,
Guteneo connection and still-verified account. Refresh proves no new MFA:
no MFA claim is reissued on that basis, and strict MFA rejects silent renewal.
Other clients/browser sessions gain no extension.

Every request still verifies signed identity, organization membership, scopes
and active connection. **Revoking the Guteneo connection also blocks new
refresh-issued tokens.** Local revocation does not remove Auth0 consent;
consent/token family can be revoked there. Explicit browser reassociation
remains required after local revocation. OAuth renewal activates/extends no
expert mandate.

Sources: [Claude authentication](https://claude.com/docs/connectors/building/authentication),
[Auth0 rotation](https://auth0.com/docs/secure/tokens/refresh-tokens/configure-refresh-token-rotation),
[Auth0 expiry](https://auth0.com/docs/secure/tokens/refresh-tokens/configure-refresh-token-expiration).

## Activation and retained evidence

Reproducible general plan:

```sh
node scripts/setup-auth0.mjs --auth-policy verified_email --claude-callback https://claude.ai/api/mcp/auth_callback --refresh-client claudeHosted
```

For the existing installation, use targeted
`scripts/enable-claude-renewal.mjs`: inspect without mutation, review its
fingerprint, then apply that fingerprint after production authorization.
It reimports no browser secret and changes no other client. Do not use global
provisioning solely for this change.

```sh
node scripts/enable-claude-renewal.mjs --inspect
# After fingerprint review and production authorization:
node scripts/enable-claude-renewal.mjs --apply --expect REVALIDATED_SHA256_FINGERPRINT
```

CLI session must target `pieper.eu.auth0.com`, permit reading clients,
connections, APIs/Actions and updating clients/APIs/Actions. Action versions/
bindings are reread with `read:actions`. Inspection rejects other active
sources, custom modifications or state changed since review. Interruption
requires fresh inspection/fingerprint; failed mutations never automatically
retry. Only already validated code permits recovery. Auth0 provides no
transaction across this set; avoid concurrent administration during apply.

After activation, reconnect Claude once so new authorization issues a refresh
token. Old access tokens gain none retroactively. Verify `get_capabilities`,
then a new call after access-token expiry without interactive authentication.
Distinguish reread configuration, successful callback, actually observed
renewal and revocation. Retain no token, OAuth code, signed URL or document
data. No real send is needed.

On 18 September administrative inspection was refused because Auth0 CLI
session expired. No remote setting changed. This is not user-connector failure
and does not change 17 September evidence.

## Local candidate checks

On 18 September: typecheck, ESLint, application build/Worker dry-run,
production build and mockup build passed. **1,087 Vitest tests** in 55 files,
including revocation fixtures, pass. **167 Node security tests**, including
30 targeted migration cases, pass. **32 mockup browser tests** pass with four
intentional desktop exclusions. Qualification covers copy/manual selection,
clipboard refusal, no business requests and narrow screens. Claude panel was
visually reviewed at normal width/390 px.

Worker authentication tests use actual JWTs signed by fixture keys: after
revocation, later-issued tokens remain refused. Results prove neither Auth0
refresh-token issuance, automatic Claude exchange nor production button
publication.
