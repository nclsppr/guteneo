# Guteneo Auth0 provisioning

`node scripts/setup-auth0.mjs` prints an offline plan. It performs no Auth0 or Cloudflare request. `--inspect` reads the current Auth0 configuration; `--apply` provisions the reviewed configuration and imports the browser client credentials into Cloudflare. The utility is restricted to the active CLI tenant `pieper.eu.auth0.com` and refuses any other tenant.

Local candidate, 18 September: hosted clients can explicitly opt into rotating,
expiring refresh tokens with `--refresh-client claudeHosted` (or `chatgpt`) and
their exact callback, under `--auth-policy verified_email`. Unselected clients
remain authorization-code-only. The initial code flow still requires S256;
refresh is separately limited by client, audience, connection and verified user.
No MFA claim is carried forward by silent renewal. See
[CLAUDE_RENEWAL.md](CLAUDE_RENEWAL.md) for durations, the targeted migration and
the remaining live proof. This candidate has not activated remote refresh.

## Renew the official CLI session

The official CLI session was successfully renewed on 17 September 2026. Live inspection found three existing clients (including Parkventory) and no existing Post Login bindings before Guteneo setup. Unsupported API `fields` projections were corrected; they were not authentication failures.

The operator completed their personal administrator MFA enrollment in Safari. The application tenant was inspected separately: it is on **Free ($0)**. OTP was briefly enabled while qualifying the configuration; the console then disclosed that use requires Pro MFA (Essentials displayed $35/month excluding taxes). The operator explicitly chose to remain free. Guteneo therefore uses the `verified_email` application policy; no subscription upgrade was performed. Administrator MFA for the Auth0 dashboard is a separate credential and remains intact.

The three Guteneo applications, its database connection, API and two Actions are now provisioned, and the browser credentials were securely installed in Cloudflare. A second successful apply updated the same two Action IDs for the free beta. Real user signup, email receipt and host OAuth qualification remain to be completed; configuration is not evidence of those journeys.

The installed CLI help confirms `auth0 api METHOD PATH` accepts JSON on standard input. Authentication stays inside the official CLI; never copy its token or a client secret into a chat, an argument or a file.

The required management permissions are:

```sh
auth0 login --scopes read:tenant_settings,read:guardian_factors,read:clients,create:clients,update:clients,read:client_keys,read:resource_servers,create:resource_servers,update:resource_servers,read:connections,create:connections,update:connections,read:actions,create:actions,update:actions
```

Then inspect:

```sh
node scripts/setup-auth0.mjs --inspect --auth-policy verified_email
```

`read:clients` alone does not reveal the confidential client secret. Its narrow retrieval requires `read:client_keys` or `read:client_credentials`. The utility uses `read:client_keys` and keeps that response in memory. [Auth0 client field permissions](https://auth0.com/docs/api/management/v2/clients/get-clients-by-id)

## Explicit tenant prerequisites

Inspection reports blockers and `--apply` stops before any mutation unless all required settings are already present:

- `resource_parameter_profile: "compatibility"`, so MCP's RFC 8707 `resource` is accepted as the audience.
- Only for the legacy `verified_email_and_mfa` policy: `customize_mfa_in_postlogin_action: true` and an enabled OTP factor. The explicitly selected free-beta policy does not require or invoke paid MFA. The utility does not change a subscription or factor configuration.
- A current `post-login` trigger advertises the `node22` runtime. Its version is discovered from Auth0 rather than assumed.

These are tenant-wide settings, so the utility reports them without changing them. Review their effect on the existing tenant before an operator adjusts them. Neither the tenant's default audience nor Dynamic Client Registration settings are changed. [Resource compatibility](https://auth0.com/ai/docs/mcp/get-started/authorization-for-your-mcp-server), [tenant settings](https://auth0.com/docs/api/management/v2/tenants/tenant-settings-route), [MFA prerequisites](https://auth0.com/docs/secure/multi-factor-authentication/customize-mfa/customize-mfa-enrollments-universal-login)

## What apply creates

```sh
node scripts/setup-auth0.mjs --apply --auth-policy verified_email
```

The configured API identifier is `https://guteneo.com/mcp`, with RS256 access tokens lasting at most one hour. Its permissions are `documents:read`, `documents:write`, `dispatches:prepare`, `dispatches:send`, and `dispatches:read`. The API keeps consent enabled. It does not fund a sending budget or grant an organization role.

| Guteneo-owned application | Type and authentication                          | Exact callback                                                                          |
| ------------------------- | ------------------------------------------------ | --------------------------------------------------------------------------------------- |
| Browser                   | Confidential regular web client, secret via POST | `https://guteneo.com/auth/callback`                                                     |
| Claude Code               | Public native client, S256 PKCE                  | `http://localhost:8788/callback`                                                        |
| Cursor                    | Public native client, S256 PKCE                  | `http://localhost:8787/callback` and `https://www.cursor.com/agents/mcp/oauth/callback` |

These are explicit first-party registrations owned by Guteneo, with user consent required by the API. They avoid claiming that a strict third-party registration supports OpenID scopes. A Guteneo-scoped Action checks S256 PKCE; there is no invented `enforce_pkce` application field. Only `authorization_code` is enabled in this first setup. Refresh tokens remain disabled, so hosts must reconnect after expiry. [Auth0 client schema](https://auth0.com/docs/api/management/v2/clients/post-clients), [PKCE enforcement](https://support.auth0.com/center/s/article/Enforce-PKCE-with-Actions), [host setup and callbacks](LLM_SETUP.md)

Optional hosted clients require the exact callback copied from their respective connection setup:

```sh
node scripts/setup-auth0.mjs --inspect --chatgpt-callback https://chatgpt.com/connector/oauth/EXACT_CALLBACK_ID --claude-callback https://claude.ai/api/mcp/auth_callback
```

Use the same callback arguments with `--apply` only after supplying real values. The ChatGPT stable `/connector_platform_oauth_redirect` callback is accepted only when Auth0 advertises `authorization_response_iss_parameter_supported: true`. The script does not create a directory listing, register an OpenAI plugin ID, install anything in a host account, or claim those clients have completed OAuth. Unknown, wildcard, query-bearing and external callbacks are rejected.

The dedicated `Guteneo-Accounts` database connection enables signup and brute-force protection and accepts Auth0's current password defaults. It never changes an unrelated connection's options or users. Only its owned application IDs are enabled on the dedicated connection and disabled on other connections, preventing tenant auto-enable defaults from silently selecting an unrelated account database. The dedicated relationship endpoint adds/removes the listed clients without replacing other clients. No verification email is sent by the utility; Auth0's signup flow and Guteneo's callback enforce the actual verified email requirement. [Connection creation](https://auth0.com/docs/api/management/v2/connections/post-connections), [connection client relationships](https://auth0.com/docs/api/management/v2/connections/patch-clients)

## MFA and existing login flows

Two scoped Guteneo Actions require the dedicated connection and S256 PKCE. The free beta adds `https://guteneo.com/verified_account: true` to ID/access tokens only for an actually verified email identity. The Worker must use the matching `AUTH0_AUTH_POLICY=verified_email`, and migration0019 records this signed evidence on browser sessions; old unqualified sessions must reconnect. The browser callback still independently checks `email_verified`, issuer, audience, nonce, signature and authorization-code exchange. The claim is never user metadata or client input.

If Auth0 reports a genuinely completed MFA method within five minutes, the Actions also emit the real `https://guteneo.com/mfa` claim. Password or passkey login is never mislabeled MFA. In legacy `verified_email_and_mfa` mode the first Action challenges/enrolls and the second requires this recent MFA evidence; default tooling retains that stricter mode unless the operator explicitly selects the free-beta option.

The owned legacy Action names are migrated to “Guteneo - require verified identity” and “Guteneo - verified identity claims” using their existing IDs. No unrelated application requesting an unrelated API is modified. Passkeys are available on the Free plan but require additional explicit connection/login configuration; their activation is not implied here.

The utility reads every page of existing Post Login bindings and preserves their order and binding IDs. It appends the two Guteneo Actions, retaining existing Guteneo binding IDs on a rerun. It omits binding secrets entirely. Current Auth0 schema supports `ref.type: "binding_id"`; preserving private binding configuration through that existing identity is an API-semantic inference, not an independently tested live guarantee. Run while no other operator edits the login flow: the utility compares a fresh snapshot before writing and verifies the resulting action order, but Auth0 does not expose a transaction spanning these separate requests. [Binding schema and order](https://auth0.com/docs/api/management/v2/actions/patch-bindings), [current SDK reference types](https://github.com/auth0/node-auth0/blob/master/src/management/api/types/types.ts#L833-L882)

## Secret import, reruns and proof

After the Actions are deployed and their order verified, `writeCloudflareSecrets` streams `AUTH0_DOMAIN`, `AUTH0_AUDIENCE`, `AUTH0_CLIENT_ID` and `AUTH0_CLIENT_SECRET` to the Worker selected by `wrangler.live.jsonc`. No secret is written to source, a temporary JSON file, an argument or stdout. Captured child buffers and credential object fields are cleared after use; JavaScript cannot promise erasure of every immutable string allocation.

Generated names and ownership metadata protect reruns. A conflicting unowned application, API or Action stops inspection. A failed step may leave Guteneo resources created earlier in that run; rerun inspection and then apply to complete them. No failed create, update, deployment or secret write is blindly retried by the utility. Final public client IDs may be printed because they are configuration identifiers; secrets are never printed.

Validation on 17 September 2026: eight provisioning tests passed locally; the free-beta identity/session migration tests are tracked in TEST_RESULTS.md. They cover the offline default, prerequisite refusal before writes, exact active tenant, existing binding identity/order, scoped MFA/PKCE behavior, secret-stream input, credential clearing on upload failure, signed callback fixtures, and a single shared welcome credit after verified signup. These are fixture tests, not live Auth0 qualification. Fresh `--inspect --auth-policy verified_email` succeeds without blockers. The dashboard administrator enrollment and an application user signup remain distinct proof levels.

The tenant's public OpenID discovery returned HTTP 200 with the expected issuer, authorization-code support, S256 and RS256. It did not advertise `authorization_response_iss_parameter_supported: true`; the stable ChatGPT callback therefore remains ineligible under the utility's preflight check. Public discovery cannot establish the state of the management-only tenant prerequisites or dedicated Guteneo resources.

After successful provisioning, verify a real signup, delivered verification email, signed verified-account proof, nonce/PKCE callback, resulting browser session, and each host's consent/resource-audience/token flow before claiming authentication is activated. Keep the €50 welcome-credit evidence separate from channel activation and from top-ups, which remain unavailable during the requested beta.
