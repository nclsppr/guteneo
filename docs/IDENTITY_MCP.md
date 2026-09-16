# Identity, delegated assistants and exact files

Verified against official documentation on **2026-09-16**. Implemented in `apps/api/src/auth.ts`, `apps/api/src/mcp.ts` and migration `0002_auth.sql`. External Auth0 and assistant tests have **not** been executed. Passing local tests is not evidence that a user's account or subscription exposes a particular connector feature.

## Selected identity provider

| Criterion          | Auth0 — selected                                                                                         | Clerk — considered                                                                                        |
| ------------------ | -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Workers boundary   | Hosted authorization endpoints and signed JWTs, verified by `jose` using Web Crypto                      | Hosted OAuth and backend token verification                                                               |
| MCP                | API resource indicators, third-party clients, mandatory PKCE, explicit scopes/grants, DCR                | DCR; custom scopes are now supported; CIMD requires beta activation                                       |
| Token policy       | Configurable access lifetime; expiring refresh tokens, rotation on strict public clients                 | Published OAuth lifetime: one day; refresh tokens do not expire; opaque tokens allow immediate revocation |
| Cost qualification | Free tier does not satisfy all required MFA/export capabilities; paid plan must be selected deliberately | MFA in Pro; public page shows $20/month annually, 50k MRU included, then $0.02/MRU through 100k           |
| Portability        | App membership stays in D1. Paid-plan JSON/CSV profile exports documented                                | Export mechanics not verified in this work                                                                |

The decision favors configurable credential lifetimes and explicit API authorization. It does **not** assert that Auth0 is cheaper. Current Auth0 page shows Free up to 25k MAU and Essentials $35/month at the displayed 500-MAU tier; exact MFA-inclusive pricing at higher user counts is unverified. Dispatch volume and MAU/MRU are different variables. [Auth0 pricing](https://auth0.com/pricing), [Auth0 profile export](https://auth0.com/docs/manage-users/user-migration/bulk-user-exports), [Clerk pricing](https://clerk.com/pricing), [Clerk OAuth](https://clerk.com/docs/guides/configure/auth-strategies/oauth/how-clerk-implements-oauth).

## Account setup and secrets

No account, key, tenant or paid plan was created. For each environment:

1. Create a separate Guteneo Auth0 tenant and explicitly choose its region. Record the region and plan in deployment evidence; an EU D1 database does not determine identity processing location.
2. Create an RS256 API with identifier **exactly** `${APP_ORIGIN}/mcp`, the five scopes below, RBAC and the `rfc9068_profile_authz` token dialect. Set a short access token lifetime, for example 900 seconds. Guteneo rejects access tokens with a lifetime above 3,600 seconds and tokens issued more than one hour ago.
3. Enable **Resource Parameter Compatibility Profile** and **Include Issuer in Authorization Responses**. The official MCP setup documents both switches. [Auth0 MCP setup](https://auth0.com/ai/docs/mcp/get-started/authorization-for-your-mcp-server), [access-token lifetime](https://auth0.com/docs/secure/tokens/access-tokens/update-access-token-lifetime).
4. Register a **Regular Web Application** for the browser BFF. Exact callback: `${APP_ORIGIN}/auth/callback`. Enable Authorization Code; the implementation always uses PKCE S256 and nonce. Do not register wildcard callbacks. Auth0 retains credentials; Guteneo stores no password or provider refresh token.
5. Set `AUTH0_DOMAIN` to the tenant hostname, `AUTH0_CLIENT_ID` to the BFF client, `AUTH0_AUDIENCE` to `${APP_ORIGIN}/mcp`. Supply `AUTH0_CLIENT_SECRET` as a Worker secret, never as a Vite variable. `APP_ORIGIN` is a trusted configuration value, not derived from a request header.
6. Configure MFA in the tenant. Guteneo administrators are rejected without a verified `amr` containing `mfa`, or the signed boolean claim `https://guteneo.com/mfa` set **by a trusted Auth0 action from actual completed authentication methods**. Apply that claim to ID tokens and API access tokens when required by the tenant configuration. Never derive it from editable user metadata. Test enrollment, loss of second factor and recovery in staging.
7. For MCP use separate **third-party** OAuth applications, with exact allowed redirect URIs and explicit API grants. Promote only the intended authentication connection to domain level. Prefer registered clients initially; enable DCR only for clients that require it. `/oidc/register` is disabled by default and needs default user-delegated API scopes before clients can work. [Third-party configuration](https://auth0.com/docs/get-started/applications/third-party-applications/configure-third-party-applications), [DCR](https://auth0.com/docs/get-started/applications/dynamic-client-registration).

Strict third-party clients enforce PKCE and expiring refresh credentials. **They currently do not support OIDC scopes `openid`, `profile`, `email`.** Those scopes belong to the separate first-party browser login in this implementation; MCP requests API scopes only. Keep the consent screen and explicit grants enabled. [Third-party security](https://auth0.com/docs/get-started/applications/third-party-applications/security-controls), [consent and OIDC limitation](https://auth0.com/docs/get-started/applications/third-party-applications/user-consent-and-third-party-applications).

Scopes: `documents:read`, `documents:write`, `dispatches:prepare`, `dispatches:send`, `dispatches:read`. Do not grant scope wildcard access. The server checks granted `scope` in each tool handler, independent of whether a tool is visible.

## Browser and connection behavior

`GET /auth/login` starts managed login; callback consumes a state transaction only once, checks browser binding, exchanges the code with PKCE and validates signed ID/access tokens with issuer/audience/expiry. Safe return paths include the frontend hash route. Session secrets are random and only SHA-256 digests are stored. Cookies are HttpOnly/SameSite=Lax with `__Host-` + Secure outside local. Every browser mutation requires the exact configured Origin and `X-CSRF-Token` from `GET /api/session`.

Membership is read from D1 on every authenticated request. An organization header or MCP argument grants no access. New verified identities receive an isolated organization, zero sending credits, a bounded PDF allowance (10 imports / 20 MiB / 3 renders per day) and three disabled channels. Admin MFA is required before using that organization. The current browser session selects the first existing membership; a full multi-organization browser switcher is deferred.

`POST /api/logout` deletes the local session. It does not claim to terminate all Auth0 SSO sessions. Sessions expire after one hour; the user re-enters the hosted flow, where provider SSO may apply. No home-grown refresh protocol is implemented.

MCP bearer tokens are verified using Auth0 JWKS and mapped by `(issuer, subject)` to a local user. A single membership can be bound on first OAuth use. Users with multiple memberships must bind the OAuth client in the dashboard. `POST /api/connections {clientId}` binds the current authenticated organization and invalidates older token issuance times. `DELETE /api/connections/:id` immediately disables Guteneo access for that connection. Refresh-token and provider-consent revocation can also be performed in Auth0; the app does not claim to revoke Auth0's grant through its local DELETE route.

No platform-content operator role is exposed through this identity module. Organization admins are not platform operators.

## MCP interface

The installed transport uses `agents/mcp/server.createMcpHandler` and `@modelcontextprotocol/server` 2.0.0. A new SDK server factory is used per request; business state lives in D1/R2. Origin and Host are restricted. Verified auth context is supplied using `handler.fetch(request,{authInfo})`; the handler itself does not verify tokens. No McpAgent, Durable Object or custom OAuth authorization server is introduced. [Cloudflare transport](https://developers.cloudflare.com/agents/model-context-protocol/protocol/transport/), [handler API](https://developers.cloudflare.com/agents/model-context-protocol/apis/handler-api/).

Discovery: `/.well-known/oauth-protected-resource` and `/.well-known/oauth-protected-resource/mcp`; the authorization server is the configured Auth0 issuer. Missing bearer access returns a `WWW-Authenticate` discovery challenge. Tools use structured result/error envelopes and bounded pagination:

| Tool                  | Required scope     | Effect                                                                |
| --------------------- | ------------------ | --------------------------------------------------------------------- |
| `get_capabilities`    | Authenticated      | Current simulation/configuration/limits                               |
| `import_document`     | documents:write    | Exact PDF bytes through restricted download service                   |
| `render_pdf`          | documents:write    | Explicitly creates a PDF from controlled HTML                         |
| `get_document`        | documents:read     | Exact document metadata, digest, scan state and authenticated preview |
| `list_documents`      | documents:read     | Bounded tenant-scoped discovery after a browser upload                |
| `prepare_fax`         | dispatches:prepare | Focused PDF-to-fax preparation; E.164 and explicit cost ceiling       |
| `prepare_dispatch`    | dispatches:prepare | Immutable preview and human-approval URL                              |
| `confirm_dispatch`    | dispatches:send    | Shared durable acceptance; requires existing human approval           |
| `get_dispatch_status` | dispatches:read    | Known outcome and next actions                                        |
| `list_dispatches`     | dispatches:read    | 1–50 items with cursor                                                |
| `cancel_dispatch`     | dispatches:send    | Only states supported by shared domain cancellation                   |

There is deliberately **no MCP approval tool** and no `user_confirmed` bypass. Confirmation invokes the same domain method as REST; the model cannot mint browser approval. Approval links are `/#/app/dispatch/{id}`. A publication hook is awaited after acceptance for low latency; failure leaves the committed outbox recoverable. MCP and HTTP share the organization rate limiter, independent of atomic send quotas.

The `fax_pdf` MCP prompt and distributable Agent Plugins/Claude Code/Cursor package describe the exact-byte fax journey. Each tool advertises its OAuth permissions under `_meta.securitySchemes` (the installed v2 SDK preserves that documented compatibility field, not arbitrary top-level extensions). Missing tool scope emits an `mcp/www_authenticate` relinking hint in addition to the enforced error; the remote HTTP boundary still rejects missing bearer authentication. Build/package instructions, exact OAuth callbacks and current host qualification limits are in [LLM_SETUP.md](LLM_SETUP.md).

## Files and client qualification matrix

The OpenAI adapter declares `_meta["openai/fileParams"]: ["file"]`. Its file object declares four fields: `download_url`, `file_id`, `mime_type`, `file_name`; **only the first two are required**. The document service immediately imports exact bytes, validates/quarantines and returns a durable document ID. Optional name/type are not trusted as content validation. An arbitrary URL is not allowed merely because a model supplied it. [Official file contract](https://developers.openai.com/plugins/reference).

| Client and journey                    | Implemented                                     | Evidence                                                                              | Remaining gate                                                            |
| ------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| ChatGPT remote tools/OAuth            | Server + Auth0 boundary                         | Local HTTP and signed token fixtures                                                  | Real account consent/refresh and connection                               |
| ChatGPT uploaded PDF                  | Exact fileParams adapter                        | Descriptor tested against actual tool listing                                         | Actual file URL source allowlist + client transfer                        |
| ChatGPT PDF generated in conversation | Same adapter                                    | **Not tested**                                                                        | Generate PDF inside client and compare SHA-256 after import               |
| Claude remote tools/HTML render       | Common MCP tools                                | Local transport only                                                                  | Real connector connection and render                                      |
| Claude original conversation PDF      | No undocumented special adapter                 | **Non-verified**                                                                      | Official byte-transfer mechanism or explicit authenticated upload         |
| Cursor remote tools/OAuth             | Common MCP endpoint                             | Local transport only                                                                  | Real desktop client consent and refresh                                   |
| Cursor local PDF                      | Project-limited byte upload adapter implemented | 27 automated local path, symlink, origin and upload tests; see [CURSOR.md](CURSOR.md) | Actual Cursor invocation and OAuth credential lifecycle remain unverified |
| MCP Apps preview card                 | Deferred                                        | None                                                                                  | Real supported host; text fallback already available                      |

Claude remote connectors originate in Anthropic infrastructure, including Desktop/Cowork. They do not make a local filesystem path remotely readable. [Claude connector networking](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp).

Cursor documents Streamable HTTP/OAuth, static OAuth registration and Apps. Its published redirect URIs are `https://www.cursor.com/agents/mcp/oauth/callback` and `http://localhost:8787/callback`; register only the surfaces actually used and recheck before tenant configuration. No tool test here equals a Cursor test. [Cursor MCP](https://cursor.com/docs/mcp).

## Local evidence and test mode

`POST /api/dev/login {organization:'atelier'|'studio'}` works only when all three conditions hold: `ENVIRONMENT=local`, `MODE=simulation`, request/configured origin is loopback. `POST /api/dev/mcp-token` additionally requires that browser session and CSRF; its opaque token expires in one hour and is unusable on a nonlocal deployment. This is explicitly simulated authentication, not simulated OAuth success.

Run `npx vitest run tests/unit/auth.test.ts`. Twelve tests passed during implementation: real D1 session writes/CSRF/logout, local-only gates, RSA signature/issuer/audience/expiry failures, PKCE transaction binding and single-use callback fixtures, unfunded onboarding, actual stateless HTTP tool schema listing, MCP-to-domain preparation and concurrent confirmation, tenant denial, publication outage and rate limit. The callback test uses a fixture token endpoint and JWKS with real RSA signatures; **it does not contact Auth0**. Full-suite reports are generated at `reports/vitest.json` and may supersede this focused run.

Release gates: configure real Auth0; test MFA and recovery; qualify short token lifetime/refresh/revocation in each real client; verify exact generated-file bytes; enable a qualified scanner and source allowlist; confirm provider prerequisites; execute authorized staging sends. Purge expired login transactions, browser sessions and development MCP tokens. Never log callback codes, cookies, tokens or signed file URLs.
