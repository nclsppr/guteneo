# Claude client qualification

## Claude Desktop Free inline original — 26 October 2026

This is the authoritative dated record for the observed Claude Desktop original
transfer. Other client surfaces use the [compatibility matrix](MCP_CLIENT_COMPATIBILITY.md);
the [private upload contract](PRIVATE_DOCUMENT_UPLOAD.md) owns transport limits
and recovery rules. The September browser evidence below remains historical.

The private receipt `real-clients/claude-a923-custom-domain-reconnect.private.json`
was recorded at **2026-10-26 00:10:08 UTC**. The existing Claude Desktop Free
connector first reported an expired connection, then completed normal
reauthentication through `https://auth.guteneo.com/u/consent` and the existing
Claude callback. This proves that reconnect, not automatic refresh. No persistent
tool permission, credential, network setting or expert mandate changed.

The later receipt
`real-clients/claude-desktop-inline-original-ready-proof.private.json`, recorded
at **2026-10-26 01:02:30 UTC**, covers **Claude Desktop Free**, recorded model
label `Sonnet5.5Medium`, with the existing remote Guteneo connector and 75 visible
tools:

| Observation | Recorded result |
| --- | --- |
| Selected original | One explicitly approved fictional PDF, 1,268 bytes |
| Original SHA-256 | `7d09f8571d0ef054d42e74289bdd4ff604aa2051c569b0cf6e5ca193074d3c1c` |
| Actual transport | One `import_inline_pdf` invocation, with **Allow once** |
| Initial analysis | `processing`, `scanner_not_ready`; three status reads |
| Later analysis | One additional read of the same document: `ready`, `analysis.ready`, `verified`, one page, `nextAction=continue` |
| Stored original | Same 1,268-byte size and SHA-256 |
| Additional effects | No second import, manual rescan, PDF-check purchase, dispatch preparation or communication |

The expanded final `get_document` result was opened in the native client UI;
`real-clients/claude-desktop-inline-final-tool-visible.private.txt` retains that
observation. The structured size/hash fields were reported in the native UI;
the actual status input and independent server ready text were inspected. The
audit performed no second server download of the original. The later same-document
read closes the initial processing state and demonstrates automatic continuation.
The precise scanner startup duration and initial readiness cause were not measured.

This test used source `c81ea94a1f60fab8776a130a7fc9d446abc72911`.
Comparison with published source `f94664ff77c532c0c6b352109f565f6768091c2b`
found no changes under `apps/api`, `packages/contracts` or `packages/domain`.
That source continuity carries the bounded result forward; it is not a repeated
host test of the later publication or a new package-installation pass.

These records and `claude-inline-scanner-c81-readonly/RESULT.md` remain outside
the repository in the private `guteneo-mcp-private-transfer-20261025` evidence
folder. No original bytes, encoding, document/upload identifiers, capabilities,
recipient, token or signed URL are copied into this record.

### Limits of this result

The local probe candidate subsequently incorporated main
`f123868dbc25e6198ee17b45546c7dd7dc935797` on 26 October 2026. That merge supplies
no new deployed, App-host or physical-device observation and does not extend the
dated preparation proof to the changed email implementation. The evidence below
remains bound to its recorded original source and account.

That import receipt qualifies only one small inline original and its later
readiness. The separately dated email-preparation observation below owns the
next step. The 64 KiB host boundary, larger PDFs, native binary PUT up to 10 MiB,
other models/accounts, Claude web, Cowork, Claude Code and a physical iPhone
remain separately unqualified. No approval or send follows from this import.

The same Free runtime exposed the original bytes but its Guteneo GET failed DNS
before an HTTP response. Its observed settings offered package-manager egress
without a custom-domain field; the underlying failure cause was not established.
The inline success does not qualify runtime binary egress. Above the inline bound,
that runtime still needs another permitted original-byte transport; no network
policy change, reconstruction, public source URL or informal chunking is implied.

## Claude Desktop original email preparation — 26 October 2026

The private record
`real-clients/claude-desktop-original-prepare-only-proof.private.json`, observed at
**2026-10-26 02:16:02 UTC**, matches the authorized actual Claude Desktop
preparation to an authoritative D1 read. The application source was
`f94664ff77c532c0c6b352109f565f6768091c2b`.

This preparation reused the same already-ready fictional original identified
above: 1,268 bytes, the same SHA-256 and one page. The row created at
**2026-10-26 02:11:31.397 UTC** was `prepared`, channel `email`, delivery mode
`attachment`, with a **one-euro-cent estimated quote**. That is this recorded
quote, not a general tariff or a current sending authorization.

The read-only database receipt reports four rows read and zero rows written.
Approval, quota-reservation, outbox, provider-attempt, credit-reservation,
credit-entry, delivery-charge and protected-hosting-charge counts were all zero;
no provider identifier existed. No new import, manual rescan, paid check, approval
or communication was performed. No recipient, message, document identifier,
password, signed URL or token is reproduced here.

This extends the bounded Desktop journey through preparation from the same
stored original. It qualifies neither delivery nor the optional MCP Apps probe,
another original/host, larger-file transport, automatic OAuth refresh or a
physical iPhone. The record remains in the same private evidence folder as the
import receipt; [host compatibility](MCP_CLIENT_COMPATIBILITY.md) and the
[diagnostic-probe contract](MCP_UI_CAPABILITY_PROBE.md) retain their separate
boundaries.

## Historical Claude.ai browser qualification — 17 September 2026

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

### Verified Auth0 configuration

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

### Observed Claude.ai installation

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

### Actual read-only call

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

### Qualification remaining after the September observation

1. Qualify other reads/writes separately; listed tools prove no execution.
2. Qualify expiry/reconnection/revocation. Registered client allows only
   `authorization_code`; refresh tokens remain disabled. Expiry requires
   reconnection, not demonstrated in that September qualification. The dated
   Desktop reconnect above does not establish automatic refresh or revocation.
3. Qualify exact import/SHA-256 before claiming native transfer of a Claude
   PDF attachment. Authenticated Guteneo upload followed by
   `list_documents`/`get_document` remains documented but untested here.
4. Separately qualify preparation, approval and actual communications under
   their own authorization. Capability success qualifies no send/file transfer.

No import, render, preparation, send approval, communication or expert-mandate
activation occurred in that September observation. This note retains no token,
OAuth code, code-bearing return URL, email address or user content. Private connector installation
remains separate from directory publication/skill-package installation.

General setup/host limits: [LLM_SETUP.md](LLM_SETUP.md).
Identity controls: [IDENTITY_MCP.md](IDENTITY_MCP.md).
