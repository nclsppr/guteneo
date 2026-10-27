# Guteneo in ChatGPT, Claude, Grok, Cursor and GitHub Copilot

<img src="https://guteneo.com/brand/guteneo-mark.png" alt="guteneo" width="64" height="64" />

The MCP server advertises this existing 512 px PNG through standard
`serverInfo.icons`, with its title and English developer-guide link. Display is
controlled by each host; the add-connector dialog may ignore those fields. Where
the host offers a manual logo field, use the
[canonical PNG](https://guteneo.com/brand/guteneo-mark.png). Protected-resource
metadata links the guide through standard `resource_documentation`; it invents
no OAuth logo field or new authority.

[Candidate 1.0.0](V1_RELEASE_CANDIDATE.md) adds a dedicated Claude Code
distribution: [package, local catalog and qualification](CLAUDE_PLUGIN.md).
Claude formats/loading commands were reviewed on 23 October 2026; package
validation and actual OAuth connection remain separate evidence. Dated findings
below retain their historical versions.

Installation journeys checked against official sources on **13 October 2026**.
Target: **https://guteneo.com/mcp**, Streamable HTTP, per-user OAuth. Server
availability, package download, actual host connection and catalog publication
are four separate evidence classes. These manual installation instructions
are neither renewed client qualification nor marketplace approval. Your plan,
version/workspace policies may limit custom installation.

In ChatGPT, private development connection, reading, exact PDF transfer and
verification were observed in the actual client in September 2026. A fax was
then delivered on a Luxembourg route after Guteneo approval; see
[dated qualification/limits](CHATGPT_QUALIFICATION.md). This qualifies neither
the full current package, every model/destination nor OAuth renewal/revocation.
The [ChatGPT submission dossier](CHATGPT_MARKETPLACE.md) retains artifacts/
prerequisites; reread current portal state before publication.

The [Claude qualification record](CLAUDE_QUALIFICATION.md) owns the dated browser
and Desktop observations and their exact limits. **Connect to Claude** provides
a prefilled form/public ID to copy, not connection evidence.
[Renewal notes](CLAUDE_RENEWAL.md) describe prepared rotation and limits;
old connection success does not prove expired-token renewal.

## Package and downloads

`integrations/guteneo/` contains Agent Plugins, Claude/Cursor manifests, images
and seven journeys: welcome, email, fax PDF, postal mail, document studio,
PDF validation and secure distribution. Instructions are conditional; they add no tool/activate no
channel. The remote package runs no code or hook on installation and grants no local disk access
and contains no secret. The optional exact-file helper runs only with explicit
host and file permission; inclusion grants no network authority.

Local **0.3.4 candidate dated 13 October 2026** harmonizes five descriptions/
titles, English public links and installation documentation. It accompanies
but does not deploy a local issuer-discovery correction; it activates neither
Auth0 nor renewal. In-review 0.3.2 and PR #52's 0.3.3 draft remain distinct
([PR #52](https://github.com/nclsppr/guteneo/pull/52)). The candidate replaces
no review/public archive. `?lang=en` changes no saved account preference.

Public downloads: [package ZIP](https://guteneo.com/integrations/guteneo-plugin.zip),
[version/SHA-256](https://guteneo.com/integrations/manifest.json),
[Cursor MCP](https://guteneo.com/integrations/cursor-mcp.json),
[Cursor static OAuth](https://guteneo.com/integrations/cursor-static-oauth.json),
[Claude Code static OAuth](https://guteneo.com/integrations/claude-static-oauth.json),
[Copilot VS Code](https://guteneo.com/integrations/copilot-vscode-mcp.json),
[Copilot CLI](https://guteneo.com/integrations/copilot-cli-mcp.json).
Static OAuth templates need an actually registered public ID before use.
These downloads/`main` provide their latest published version, not automatically
the local 0.3.4 candidate. The 13 October check verified public 0.3.2. Compare
manifest/fingerprint before selecting an exact version.

The [public repository](https://github.com/nclsppr/guteneo) also provides the
folder from `main` without catalog publication:

```sh
git clone --branch main --depth 1 https://github.com/nclsppr/guteneo.git
cd guteneo
```

Loading the folder needs no Guteneo build. To **rebuild** the ZIP:

```sh
npm ci
npm run build:integrations
# Or supply the public output directory after building the site:
node integrations/build.mjs dist/web/integrations
```

Output includes `guteneo-plugin.zip`, five host JSON templates and
`manifest.json` with version, SHA-256/qualification status. Internal names,
order/ZIP dates are fixed; identical builds produce identical content.
Portable manifests validate against official vendored schemas in
`integrations/schemas/`. Default output: `dist/integrations`. Building
publishes nothing.

[OpenAI/Agent Plugins format](https://developers.openai.com/plugins/build/plugins),
[Cursor format](https://cursor.com/docs/reference/plugins),
[Claude Code format](https://code.claude.com/docs/en/plugins-reference).

## Mandatory MCP, plugin and archive synchronization

Every MCP update must update the ChatGPT plugin and its downloadable archive in
the same change. Review the portable instructions, tool schemas and annotations,
authentication, permissions, document limits and recovery behavior. Preserve the
existing plugin identity and all current workflows. Installing the package adds
no authority and does not activate a channel.

1. Update the affected source instructions under `integrations/guteneo/`, then
   regenerate Claude workflow copies with `node integrations/sync-claude-workflows.mjs`.
2. Increase the shared application/plugin release version consistently across
   root `package.json`, its lockfile entries, the portable/Claude/Cursor manifests
   and the dedicated Claude manifest. The existing
   [single-version contract](V1_RELEASE_CANDIDATE.md) still applies.
3. Run `npm run sync:integrations` to record the reviewed version, package digest
   and MCP source digests in `integrations/guteneo/mcp-contract.json`, then
   `npm run check:integrations`. Changed recorded content requires a higher
   release version. The check also runs in CI and during package builds.
4. Run the changed contract/package tests and `npm run build:integrations`.
   Application and preview builds regenerate their downloadable ZIP and manifest
   from those same sources. Do not copy an old ZIP into a fresh release.
5. After an authorized publication, follow [release verification](MAIN_RELEASE.md)
   and compare the ZIP downloaded from the guide with the exact release manifest
   SHA-256. Retain actual ChatGPT import/OAuth and portal-update proof separately.

The automatic source scope is `apps/api/src/mcp.ts` and every direct local import,
discovered by `integrations/sync.mjs`. Missing or stale metadata blocks the build.
Indirect business/provider changes still require review of their MCP effects;
a fingerprint does not establish semantic correctness. Package generation and
CI create no marketplace submission, merge, deployment or human consent.

## Connecting hosts

### Shared OAuth and separate host qualification

All supported MCP transports start at `https://guteneo.com/mcp` and read its
served resource/authorization metadata. The custom-domain migration changes the
preferred authorization server, not the resource, audience, scopes, registered
clients or canonical connection keys. Both configured issuer families remain
valid; use one discovered issuer consistently for authorize/token/refresh within
a client flow. No host may substitute a provider key, browser password, invented
client secret or extra scope when its OAuth setup is unavailable.

| Surface                                          | OAuth setup contract                                                                                                                                          | Qualification boundary                                                                                                                                                           |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Claude web, Desktop and iPhone application       | Use the hosted connector where that surface exposes it, with the existing registered hosted client/callback and person-owned consent                          | Each surface needs its own OAuth return/renewal and original-file/network proof; desktop or web evidence does not qualify iPhone                                                 |
| ChatGPT web and iPhone application               | Retain the existing Guteneo plugin/custom-MCP identity and the exact host-displayed callback/client configuration                                             | Native file envelopes and the new private upload bridge are different transports; neither web installation nor a historical file-envelope test qualifies current iPhone transfer |
| Cursor desktop and web/agents                    | Use the supplied remote-MCP configuration and the separately registered callback for that surface                                                             | Local file access/permission does not prove remote-agent file transfer, current OAuth or a successful original-byte upload                                                       |
| Grok web and Build                               | Use the host's MCP OAuth flow and actually registered client/callback                                                                                         | Connector documentation is not a connected Guteneo pass or proof of private-attachment transfer                                                                                  |
| Claude Code, Copilot local and other MCP clients | Where the client supports remote OAuth, use standards discovery plus its actually registered public client, S256 PKCE, exact callback and explicit API scopes | Confirm support separately for that surface; do not activate DCR/CIMD or create grants merely to fill a matrix                                                                   |
| Copilot cloud and code review                    | Remote OAuth is not supported on these surfaces; Guteneo keeps its required OAuth boundary                                                                    | Do not replace it with a static shared Bearer or provider key                                                                                                                    |
| Gemini consumer custom apps                      | Follow the current account, region, language and settings restrictions in the compatibility matrix before testing an actual custom app                        | Eligibility or an advertised MCP feature establishes neither Guteneo OAuth nor exact-file transfer                                                                               |

The [host compatibility matrix](MCP_CLIENT_COMPATIBILITY.md) owns current
per-surface evidence; [private upload](PRIVATE_DOCUMENT_UPLOAD.md) owns exact-byte
transport rules. Server/SDK fixtures establish the server contract only.

### ChatGPT web

The [Guteneo guide](https://guteneo.com/assistants/chatgpt/) offers **Plugin archive
(ZIP)** first and **MCP address** as an alternative. The public guide and account
reuse the same four-language catalog. Archive import depends on the account and
workspace policies.

1. Download [guteneo-plugin.zip](https://guteneo.com/integrations/guteneo-plugin.zip)
   and keep it zipped.
2. Open ChatGPT Plugins, choose the archive-upload option when available, select
   the file and inspect the displayed plugin information.
3. The archive preconfigures the registered public ChatGPT OAuth client. Connect
   at `auth.guteneo.com` and review the requested permissions. No client secret
   is required.
4. Start a new conversation, select Guteneo and run the guide's read-only
   capability check. A download or imported package does not prove connection.

If archive upload is unavailable, select **MCP address** in the guide: Plugins →
`+` → **Add custom MCP server**, name Guteneo, enter `https://guteneo.com/mcp`,
configure the actual OAuth connection and choose **Create as a plugin**. Current
host/account rules govern availability; developer mode is not universally
required. A custom server connection alone does not distribute the bundled
skills. After server changes, refresh the connection and open a new conversation;
for package changes, download the current ZIP and use the host's existing-plugin
update flow when offered. Preserve the existing identity.

### ChatGPT OAuth configuration — 27 October 2026

The package's `mcp.json` is the single source for the public ChatGPT client ID,
custom-domain endpoints and supported scopes. Its OpenAI extension selects a
**provided** public client with token endpoint authentication `none`. The public
and account guides read the same ID for the manual MCP alternative. This ID is
public client metadata, not a credential or a user's authorization.

For URL-only installation, choose OAuth and a registered client, copy the ID
shown in the guide and leave the secret empty. Do not select DCR: the current
Auth0 discovery does not advertise dynamic registration or CIMD. Adding an
invented registration endpoint or a client ID to protected-resource metadata
would not implement either protocol.

A portable import uses ChatGPT's stable callback only when the authorization
server advertises issuer identification and returns the exact issuer in every
success/error response. The registered client's callback allowlist must retain
its existing specific callback and include the stable ChatGPT callback. Configure
these provider prerequisites before publishing the preconfigured archive. Do not
alter the separate reviewer client or existing connections. See the
[Auth0 custom-domain contract](AUTH0_CUSTOM_DOMAIN.md).

If an existing import still asks for credentials, update it from the current ZIP
and check the saved OAuth settings. If its callback remains incompatible, retain
the exact callback displayed by ChatGPT for support; never collect a password,
access token or client secret. Imported settings, public metadata and a no-session
issuer-response check do not establish actual human consent, token exchange,
refresh or a successful host tool call. Those remain separate qualification steps.

Official contracts: [OpenAI OAuth](https://developers.openai.com/plugins/build/auth)
and [package authentication](https://developers.openai.com/plugins/build/plugins).

The combined 26 October archive-guide candidate targets release **1.1.3** after
reconciliation with current `main`; its [26 October local validation](ASSISTANT_HUB.md#chatgpt-archive-candidate--25-october-2026)
records the current archive and browser/build checks. Earlier local 0.3.4 results
predate that reconciliation and do not qualify this candidate.
The subsequent document-email candidate targets **1.1.4**: account invitations,
V2 defaults, custom document-button markers and recipient-feedback readback are
reflected in both listing languages and the packaged workflow. Its content bounds
are exposed before preparation. The MCP/package record and downloadable archive
must be rebuilt from that combined source using the maintenance flow above.
The subsequent **1.1.5** candidate retains that email contract and adds the
default-off [MCP Apps capability probe](MCP_UI_CAPABILITY_PROBE.md). Its two
diagnostic tools appear only for one explicitly selected current connection
inside a bounded server-owned window. They read no file metadata or bytes and
establish neither an original-file transfer nor physical-device compatibility.
No actual import, OAuth renewal, portal update or public directory publication is
established by these instructions.
Release **1.1.6** published the separately default-off
[selected-original MCP App](PRIVATE_DOCUMENT_UPLOAD.md#selected-local-originals-through-mcp-apps--disabled-candidate),
with a strict empty opener and five App-only staging tools. Current writer
membership, `documents:write`, migration 0063 and explicit server activation are
required. The narrow connection/revision/window is for qualification; general
rollout has a distinct reviewed activation after actual qualification and
authorized delivery. Device Files selection then Import is
a new local selection, not automatic handoff of a conversation attachment.
The [1.1.5 Desktop diagnostic observation](CLAUDE_QUALIFICATION.md#claude-desktop-free-mcp-apps-checkpoint--26-october-2026)
retains only widget/empty bridge/native chooser cancellation. The later
[1.1.6 Desktop record](CLAUDE_QUALIFICATION.md#claude-desktop-selected-original-app--26-october-2026)
qualifies two selected originals, including 10 MiB, through exact private bytes
and ready analysis; registered-ID delivery to the model failed. Its window is
closed and general activation remains pending. The **1.1.8 source candidate**
adds text plus structured receipt context, preserves accepted receipts after
late bridge errors and offers explicit Use in conversation for the same four
fields. Import never sends that chat message automatically. Local SDK fixtures
do not qualify the actual automatic or explicit-message native handoff retest.
Privacy/confirmations, physical iPhone and other hosts remain independent gates;
package generation creates no activation or transfer proof.
The **1.1.12 source candidate**, dated 27 October, synchronizes application,
ChatGPT/Claude packages and the downloadable archive for
[secure invitation recovery](SECURE_DISTRIBUTION_JOURNEYS.md#recover-an-expired-invitation-quote).
Its portable workflow directs an expired quote to the browser's explicit
**Refresh quote** action, then follows the returned replacement and new human
review. MCP tool schemas, annotations and scopes remain unchanged; standard
summaries expose no browser renewal metadata and no tool gains renewal or approval
authority. Rebuild/fingerprint the archive from the exact source; package parity
is not an actual host import, marketplace submission or production publication.

The full synthetic source-review inventory is 83 tools: 75 ordinary, two gated
probe tools and six gated original-picker tools. The five App-only upload tools
and ordinary `begin_document_upload` disclose potential exact unregistered-object
cleanup through `destructiveHint:true`. App errors point to its existing Check
status/explicit Resume controls with no suggested model tool; do not switch to
binary recovery or call App-only tools from the model. These catalog effects
grant no role, scope, activation, approval or sending right.
[Official ChatGPT journey](https://developers.openai.com/plugins/deploy/connect-chatgpt).

### Claude web and Desktop

#### Directory compatibility candidate — 26 October 2026

The [directory resumption record](CLAUDE_DIRECTORY.md) owns the current portal
observation, transient-draft limit and ordered publication checklist.

The Claude developer portal's tools scan identified one schema issue and 75
title suggestions on 26 October 2026: `import_json_dataset.data` had no declared
JSON type, and the advertised tools lacked `annotations.title`. This is a dated
portal observation, not proof that a submission was sent or published.

The compatibility candidate puts each tool's existing display title in its
standard `annotations.title`, including conditional tools. It preserves the four
effect booleans and their actual side effects; a display title changes no scope,
membership, host permission or server approval. JSON dataset metadata declares
an array of objects or an object of named arrays of objects, matching the existing
dataset parser. Runtime parsing, nested values, error recovery, request/cell
bounds and ownership checks remain unchanged. This creates no file access or
implicit AI-transfer permission.

The same source review makes tool descriptions declarative: each describes its
operation, accepted inputs, result, actual side effects and factual prerequisites.
Descriptions retain consent, authority, provider, cost, content and recovery
limits without instructing the assistant to call another tool, follow returned
behavioral rules or override the host's behavior. Multi-step orchestration belongs
in the maintained package skills and MCP prompts. This wording correction changes
no runtime check, scope, effect boolean or available business action; it does not
establish that the portal accepted the descriptions.

The same review updates the portable [Studio workflow](../integrations/guteneo/skills/document-studio/SKILL.md)
and [PDF-check workflow](../integrations/guteneo/skills/pdf-accessibility/SKILL.md),
then regenerates their Claude copies. Those sources own the detailed generation,
quota, irreversible batch and browser-purchase guidance; a description cleanup
must not drop their existing restrictions or grant new MCP authority.

After the combined source is reviewed, versioned and released through the normal
MCP/package process, reconnect the exact server in the portal and inspect its
fresh tools scan. Exercise every advertised tool under an appropriate account
and record its result before making the portal's test-completion attestation.
Historical read/import/preparation observations do not qualify the complete
catalog. A local schema test, rebuilt archive or successful scan establishes
neither current production behavior nor submission, approval or publication.

The current [directory submission guide](https://claude.com/docs/connectors/building/submission)
accepts a remote MCP URL through the developer portal; paid personal plans can
submit from their own account. Review the current policy and actual portal
acknowledgments before submitting. Private connector installation and a public
directory listing remain separate operations.

#### Private installation

For the connector alone, use **Connect to Claude** in the
[Guteneo guide](https://guteneo.com/assistants/claude/), or Customize → Connectors
→ Add custom connector with the MCP URL. Advanced settings accept Guteneo's
hosted-Claude public client ID. Each member connects their own account under
organization rules.
[Claude connectors](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp).

For bundled skills/connector, download ZIP then **Customize → Plugins → Add
→ Upload plugin** on web/Desktop. Open the plugin **Connectors** tab, add
Guteneo if needed/connect. ZIP import is not OAuth consent.
[Claude plugins](https://claude.com/docs/plugins/overview).

### Claude application on iPhone

The iPhone application is a separate qualification surface. New MCP authorization
uses served discovery, including the explicitly configured branded Auth0 issuer;
public metadata and a successful web/Desktop/Code connection do not prove the
iPhone OAuth return, renewal or attached-file transfer. Those require evidence on
the actual device and account. This candidate has no physical-iPhone proof.

For an attached private PDF, the host must actually read the selected original,
compute its byte count/SHA-256 and transfer those unchanged bytes using the narrow
[private upload contract](PRIVATE_DOCUMENT_UPLOAD.md). A mobile attachment preview,
extracted text, file path or discovered MCP tool alone establishes none of that.
Do not publish a CV/PDF to make import possible or claim that a local Claude Code
helper runs inside the iPhone application. Host file/code/network capabilities
and user authorization must be qualified before this transport is offered there.

If the runtime exposes the exact original but cannot reach Guteneo, the
`import_inline_pdf` tool accepts one original up to 64 KiB through the
authenticated MCP connection. Compute size/SHA-256 and canonical base64 using
code; preserve the same key, scanner and readiness/recovery gates. Do not chunk,
truncate, echo the encoding or assume the 10 MiB binary limit applies. Tool
arguments consume host context and require explicit original-file permission.
The [dated Desktop qualification](CLAUDE_QUALIFICATION.md#claude-desktop-free-inline-original--26-october-2026)
owns its observed transport/network result; it does not establish iPhone file
access or egress. Exact host transfer remains separately qualified. Do not change
network policy automatically.

### Claude Code

From repository root:

```sh
claude --plugin-dir ./integrations/guteneo
```

Or load the public archive:

```sh
claude --plugin-url https://guteneo.com/integrations/guteneo-plugin.zip
```

These load the package for the session. Open `/mcp` to connect; inspect
`/plugin` Errors if loading fails. Claude.ai's hosted client does not replace
a client registered for Claude Code's localhost callback.
[Loading without a marketplace](https://code.claude.com/docs/en/plugins/create#develop-without-a-marketplace).

### Grok web and Grok Build

Web: [Connectors](https://grok.com/connectors) → **New Connector → Custom**,
enter `https://guteneo.com/mcp`, authenticate/review tools. Administrator
permission may be required. [Grok connectors](https://docs.x.ai/grok/connectors).

Grok Build:

```sh
grok mcp add --transport http guteneo https://guteneo.com/mcp
grok mcp list
grok mcp doctor guteneo
```

First OAuth-server use opens the browser; `/mcps` also authenticates.
[Grok Build MCP](https://docs.x.ai/build/features/mcp-servers).

Grok Build also documents Claude Code-compatible plugins. Candidate local path:

```sh
grok --plugin-dir ./integrations/guteneo
```

Documented compatibility proves neither Guteneo connection nor actual skill
loading. Qualify OAuth client/callback for that surface.
[Grok Build plugins](https://docs.x.ai/build/features/skills-plugins-marketplaces).

### Cursor

For MCP alone, merge `integrations/config/cursor-mcp.json` into `.cursor/mcp.json`.
Static `cursor-static-oauth.json` uses `GUTENEO_CURSOR_CLIENT_ID`, populated with
the actually registered public ID. [Cursor MCP/OAuth](https://cursor.com/docs/mcp).

For local plugin installation:

```sh
mkdir -p ~/.cursor/plugins/local/guteneo
cp -R ./integrations/guteneo/. ~/.cursor/plugins/local/guteneo/
```

This includes hidden files. If a copy exists, preserve changes before using
an empty directory. Restart Cursor or **Developer: Reload Window**, then
verify skills/server in **Customize** and connect. Workspace must permit
local imports; symlinks outside the local folder do not load.
[Local Cursor installation](https://cursor.com/docs/plugins#test-plugins-locally).

### GitHub Copilot and PDF transfer

Separate files: `copilot-vscode-mcp.json` → `.vscode/mcp.json` (`servers`);
`copilot-cli-mcp.json` → `~/.copilot/mcp-config.json` (`mcpServers`). Installation,
OAuth/limits are maintained in [COPILOT.md](COPILOT.md). No consumer Microsoft
Copilot journey is announced. MCP templates do not prove ZIP installation.

In ChatGPT, `import_document` uses host-supplied `openai/fileParams`. Guteneo
accepts direct public HTTPS sources and checks bytes; private, expired or
redirected sources are refused. Other hosts without qualified transfer use
[Guteneo Documents](https://guteneo.com/#/app/documents), then
`list_documents`/`get_document`. Optional local Cursor/Claude Code adapter is
configured separately under [CURSOR.md](CURSOR.md); remote package does not
install it.

## OAuth registration

Use clients **separate** from Guteneo browser login. Each delegates a user
through Authorization Code + S256 PKCE; shared `client_credentials` never
represents a user. Exact resource/audience: `https://guteneo.com/mcp`.
Server checks each permission and derives organization from authenticated
connection.

Journey scopes: `documents:read documents:write dispatches:prepare dispatches:send dispatches:read`.
Read-only installation should request only reads. Missing scopes yield
`INSUFFICIENT_SCOPE`; visibility grants no access.

| Surface           | Registered callback                                                                                                                                                                                                | Configuration                                                                                                           |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| ChatGPT           | Copy **exactly** the server-management callback. `https://chatgpt.com/connector_platform_oauth_redirect` requires correctly advertised/returned issuer identification; otherwise `/connector/oauth/{callback_id}`. | Actually configured preregistered client, DCR or CIMD; never derive from a fictional ID.                                |
| Hosted Claude     | `https://claude.ai/api/mcp/auth_callback`                                                                                                                                                                          | Advanced Client ID; secretless public client if server/host permit.                                                     |
| Claude Code       | `http://localhost:8788/callback` for supplied fixed port                                                                                                                                                           | `.mcp.json` `oauth.clientId`, `oauth.callbackPort`, `oauth.scopes`; replace `REPLACE_WITH_REGISTERED_PUBLIC_CLIENT_ID`. |
| Cursor Desktop    | `http://localhost:8787/callback`                                                                                                                                                                                   | `auth.CLIENT_ID`/`auth.scopes`, `cursor-static-oauth.json`.                                                             |
| Cursor Web/Agents | `https://www.cursor.com/agents/mcp/oauth/callback`                                                                                                                                                                 | Separate client or explicitly registered additional callback.                                                           |

Claude Code template fixes scopes; replace the marker with actual public ID.
Do not assume variable interpolation in `oauth.clientId`. Another documented
path is `claude mcp add --transport http --client-id CLIENT_ID --callback-port 8788 guteneo https://guteneo.com/mcp`,
then `/mcp`. Invent no public-client secret.
[Claude Code OAuth](https://code.claude.com/docs/en/mcp),
[hosted Claude OAuth](https://claude.com/docs/connectors/building/authentication),
[Cursor OAuth](https://cursor.com/docs/mcp).

Copying MCP URL/importing ZIP/retaining a marker creates no OAuth client.
An administrator completes templates with actual client/callback. Advertised
`registration_endpoint` proves no enabled/authorized/usable DCR; CIMD also
needs effective configuration. Otherwise use a host-appropriate preregistered
client.

**Auth0 configuration boundary:** strict third-party Auth0 clients in
[IDENTITY_MCP.md](IDENTITY_MCP.md) reject OIDC scopes. ChatGPT may request
`openid`, `profile`, `email` if advertised. Qualify a compatible preregistered
client with exact consent/scopes or suitable authority configuration;
advertising DCR/CIMD or arbitrarily removing scopes proves no compatibility.
Each host needs actual consent, signed verified-account evidence, renewal/
revocation. Auth0 Free beta uses `verified_email` without mandatory MFA;
historical strict policy retains MFA when selected.
[OpenAI authentication contract](https://developers.openai.com/plugins/build/auth).

## Connection and renewal diagnosis

- **Discovery/issuer refused:** inspect [MCP metadata](https://guteneo.com/.well-known/oauth-protected-resource/mcp)
  and authority discovery. `authorization_servers` must match `issuer` exactly,
  including trailing slash. The separately configured MCP custom-domain
  preference advertises `https://auth.guteneo.com/`; canonical legacy clients
  remain compatible while canonical/custom token trust is retained. The browser
  domain setting alone does not activate that trust. See
  [domain activation and independent rollback](AUTH0_CUSTOM_DOMAIN.md#independent-mcp-trust-and-discovery).
  Do not confuse issuer with MCP resource `https://guteneo.com/mcp`.
  [RFC 8414 §3.3](https://www.rfc-editor.org/rfc/rfc8414.html#section-3.3),
  [SDK discovery](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/packages/client/src/client/auth.ts),
  [MCP authorization](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization).
- **Callback refused/`invalid_client`:** use the host-displayed callback and
  registered-client settings. Hosted Claude, localhost Code and Cursor use
  distinct callbacks. Prefilled form/public ID cannot repair incompatible
  authority configuration.
- **Expired token/new scopes:** reconnect/review permissions. ChatGPT
  **Refresh** updates metadata, not proven token renewal. Code uses `/mcp`;
  Grok Build `/mcps`. Reread `get_capabilities`, `mode`/`simulation` and account
  features.
- **Automatic renewal:** refresh code is insufficient. Production check on
  13 October observed no advertised `offline_access`, active reviewer refresh
  grant or API offline access. Qualify per client; reconnect once after
  actual activation to obtain newly granted authority.
  [Claude limits](CLAUDE_RENEWAL.md),
  [Auth0 rotation](https://auth0.com/docs/secure/tokens/refresh-tokens/configure-refresh-token-rotation).

Retain only redacted date/host/version/issuer/discovered tools/read result.
No token, OAuth code, private content or signed URL belongs in reports.
Local tests, downloads or error-free installation replace no end-to-end OAuth
qualification.

## Canonical operational guides

Host instructions reuse the following contracts rather than maintaining
parallel copies. Start with `get_capabilities`; simulation never becomes a
real send. Preserve immutable original bytes, exact recipient/options/price,
current authority and stable idempotency.

- **PDF/UA and PDF/A, current individual-purchase candidate:**
  `validate_pdf`/`get_pdf_validation` inspect an imported `ready` original using
  explicit PDF/UA-1, PDF/UA-2, PDF/A-1b, PDF/A-2b, PDF/A-3b
  or PDF/A-4. Reports bind SHA-256 and reread without rerunning analysis.
  New paid checks require the browser administrator’s explicit exact-PDF/profile
  purchase. Assistants cannot create financial consent, make that purchase or
  manage billing; current document-scoped history remains readable. veraPDF automated checks
  still require human review and certify neither full accessibility nor legal
  compliance. Candidate is production disabled, not host-qualified by package
  presence. [Contract](PDF_ACCESSIBILITY.md), [current price and release contract](PDF_VERIFICATION_PRICING.md).
- **Email, candidate 0.3.0, 21 September 2026:** `email` prompt/skill use
  `prepare_dispatch` with `channel="email"`. Omit `documentId` for no file;
  otherwise use exact ready PDF. Protected links add
  `options.emailDeliveryMode="protected_link"`, `options.protectedDays` of
  `1`, `7`, `30` (default `7`). Server builds final recipient content before
  immutable fingerprint/quote; disclose final message, mode/duration, applicable
  €1/document hosting fee and cap. Preparation submits no message. Responses
  expose `emailDelivery.mode`, `protectedDocument.expiresAt`, `durationDays`,
  `hostingFeeMinor`, `passwordDelivery="sender_browser_only"`,
  `passwordAccessUrl`. **The sender opens the latter themselves**, reveals
  password and communicates it separately; assistants neither visit/read,
  request a copy nor put it in the email. There is no MCP password-reading
  tool. Summaries expose no internal hosting ID/link token; exact content
  review retains recipient link without password. Browser-only reveal/revoke
  requires session/CSRF and rejects OAuth Authorization. Recipients need
  password, not account; sender can revoke. Multi-format recipient lists,
  Excel/other attachments and recipient accounts are later work.
  [Protected email contract](PROTECTED_EMAIL.md).
- **Fax:** exact import via `import_document`, qualified adapter or
  `/#/app/documents`; reuse `list_documents`/`get_document` to verify
  SHA-256/pages/state. Quarantine blocks preparation. `prepare_fax` needs
  `documentId`, E.164 recipient and integer EUR-cent cap; returns quote/
  `approvalUrl`. `fax_pdf` prompt and skill explain this without granting
  rights. ChatGPT file contract retains four official properties, requiring
  only `download_url`/`file_id`.
  [Fax flow](PRODUCT.md), [OpenAI file contract](https://developers.openai.com/plugins/reference).
- **Approval and tracking:** normally human opens `approvalUrl`, reviews/
  approves in Guteneo; `confirm_dispatch` verifies persisted approval and
  performs common acceptance. A preexisting eligible expert mandate uses
  `review_dispatch({dispatchId})`, exact message/all PDF pages, then
  `approve_and_send_dispatch({dispatchId,fingerprint,ceilingMinor,reviewToken,idempotencyKey})`.
  Review token expires within five minutes. Do not add automatic confirmation
  afterward. Email `recipientRequested:true` requires actual recipient request.
  `get_dispatch_status` distinguishes queue/provider acceptance/delivery;
  `accepted` is provider acceptance, email `delivered` recipient-server
  delivery, not PDF reading. Lost response requires rereading the same dispatch;
  `submission_unknown` forbids resending/new keys, pending operator reconciliation.
  Expired email quotes do not renew through fax tools.
  [Expert authority](EXPERT_APPROVAL.md).
- **Postal:** `get_postal_requirements`, `preflight_postal_pdf`,
  `get_postal_preflight`, `quote_postal_draft`; `postal-pdf` reads account
  requirements before creation, reviews every page/address. Standard flow
  requires separate human `auto_send:false` transfer consent. Delegated
  `transfer_postal_draft({preflightId,fingerprint})` needs prior postal mandate
  explicitly covering Pingen data transfer. Draft transfer is not send approval;
  review/acceptance follow separately. Pending Pingen analysis is reread without
  recreating draft; uncertainty requires reconciliation.
  [Fields/permissions](POSTAL_REVIEW.md).

Expert mandate is off by default, browser-admin granted to one OAuth connection
with channels, EUR/send/day, daily count and at most 30-day expiry. Assistants
never create/extend it. Host confirmations/scopes, scanner, provider, quote/
credit gates remain. Actions are delegated, never fictional human review;
refusal falls back to browser review. ChatGPT reviewer remains prepare-only.

## Evidence before publication

`npx vitest run tests/unit/mcp-integrations.test.ts tests/unit/auth.test.ts`
checks actual local SDK schemas/transports, ZIP validity, organization isolation,
scopes, simulated fax preparation and human approval before atomic reservation.
It calls no assistant host or communications provider. `mcp-email` tests cover
three modes, secret-option refusal, bounded projections/no automatic acceptance.
The combined ZIP retains [Agent Plugins/OpenAI](https://developers.openai.com/plugins/reference)
and [Claude Code](https://code.claude.com/docs/en/plugins-reference) manifests
with [Claude-distributed skills](https://code.claude.com/docs/en/skills).
These email-related official sources were consulted on 21 September 2026.

For every host retain dated account/surface/version, OAuth consent, renewal/
revocation and exact imported PDF/SHA-256. Test wrong scope/organization,
quarantine, insufficient cap, missing approval and uncertain state. No tokens,
signed URLs or personal numbers in logs. Real transmission requires an explicitly
authorized test recipient, configured scanner/provider and qualified actual
quote.

For every directory reread current portal state; distinguish submission,
review, approval and publication. MCP Inspector/local tests establish neither
installation nor directory publication. Each host/additional journey needs
its own qualification.
