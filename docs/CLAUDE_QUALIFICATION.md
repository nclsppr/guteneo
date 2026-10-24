# Claude.ai qualification — 17 September 2026

For the 23 October Claude Code 1.0.0 candidate, see
[CLAUDE_PLUGIN.md](CLAUDE_PLUGIN.md). Evidence below remains historical and
qualifies neither that package nor a Claude Code session.

Dedicated Claude.ai Auth0 configuration was created/reread. **Consent,
successful OAuth return, discovery of 21 tools and an actual `get_capabilities`
call were qualified in the real browser.** The call succeeded on **17 September
2026 at 17:55 UTC**, mode `production`, `simulation:false`. This concerns
Claude.ai in Safari with the observed Free account, not Claude Code or other
Claude accounts/surfaces.

The 18 September installation-button/rotating-renewal follow-up is prepared
in [CLAUDE_RENEWAL.md](CLAUDE_RENEWAL.md). Local validation changes no remote
state below; renewal activation/actual qualification remain pending.

## Verified Auth0 configuration

Client created/reread on **17 September 2026 at 17:48:15.683 UTC**.

| Parameter | Verified value |
| --- | --- |
| Name | `Guteneo - Claude hosted` |
| Public client identifier | `IhJieRsvZBAnl1uJO125X2SPoIHxT8ed` |
| Callback | `https://claude.ai/api/mcp/auth_callback` |
| Token-endpoint authentication | `none` |
| Allowed grant | `authorization_code` only |
| Target resource | `https://guteneo.com/mcp` |
| Account connection | `Guteneo-Accounts` only |

Client ID is public configuration, not a secret. Guteneo-Accounts binding
was verified through `GET /connections/{id}/clients`. No other OAuth client
changed. Actions, tenant settings and Worker were neither redeployed nor
modified for this installation.

Actually deployed code of both Auth0 Actions was reread, then run locally in
a VM with fixtures. A new client requesting the correct audience/connection,
verified account and S256 PKCE triggers additions of
`https://guteneo.com/verified_account` to simulated ID/access-token APIs.
Wrong PKCE/connection is refused; unverified accounts trigger no claim addition.
This local check produces no signed JWT. It explains audience coverage for
the new client without Action changes and remains separate from actual
Claude.ai evidence below.

## Observed Claude.ai installation

In Safari with Claude.ai signed in, a **Guteneo** custom connector was added:

- Server: `https://guteneo.com/mcp`.
- Transport: Streamable HTTP.
- Own OAuth client: public identifier above.
- Client secret: empty.

Actual Auth0 consent accepted `documents:read`, `documents:write`,
`dispatches:prepare`, `dispatches:send`, `dispatches:read`. These permissions
prove no tool invocation and create neither human send approval nor expert
mandate.

Auth0 return succeeded: Claude.ai displays **Disconnect** and 21 tools,
nine read/twelve write. All **Needs approval** settings were preserved.

## Actual read-only call

A new **Sonnet 5, High** conversation received this request (English translation):

> Check the Guteneo connection by calling only its get_capabilities tool. State whether the call succeeded and the returned mode. Read no document or dispatch, create nothing and trigger no communication.

Claude approval was limited to **Allow once**. Persistent **Needs approval**
settings remain unchanged. At **17:55 UTC**, expanded **Get capabilities**
trace exposed a successful raw response:

| Field | Observed value |
| --- | --- |
| `ok` | `true` |
| `data.name` | `Guteneo` |
| `data.version` | `0.2.0` |
| `data.mode` | `production` |
| `data.simulation` | `false` |
| `data.humanApproval` | `authenticated_browser` |
| `data.approval.default` | `authenticated_browser` |
| `data.approval.expert.connection.state` | `inactive` |
| `data.approval.expert.connection.canUseExpert` | `false` |
| `data.approval.expert.connection.canTransferPostalDraft` | `false` |

Claude then confirmed success. This proves connector authentication, discovery
and that one production capability call. No `list_documents`/`list_dispatches`
call occurred; no existing document/dispatch was read. Returned app version
is not evidence of a new Worker deployment.

## Remaining qualification

1. Qualify other reads/writes separately; listed tools prove no execution.
2. Qualify expiry/reconnection/revocation. Registered client allows only
   `authorization_code`; refresh tokens remain disabled. Expiry requires
   reconnection, not demonstrated in this qualification.
3. Qualify exact import/SHA-256 before claiming native transfer of a Claude
   PDF attachment. Authenticated Guteneo upload followed by
   `list_documents`/`get_document` remains documented but untested here.
4. Separately qualify preparation, approval and actual communications under
   their own authorization. Capability success qualifies no send/file transfer.

No import, render, preparation, send approval, communication or expert-mandate
activation occurred. This note retains no token, OAuth code, code-bearing
return URL, email address or user content. Private connector installation
remains separate from directory publication/skill-package installation.

General setup/host limits: [LLM_SETUP.md](LLM_SETUP.md).
Identity controls: [IDENTITY_MCP.md](IDENTITY_MCP.md).
