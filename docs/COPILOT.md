# Guteneo with GitHub Copilot

Official documentation checked **17 September 2026**. This guide covers GitHub
Copilot in **VS Code** and **Copilot CLI**. It establishes no compatibility
with consumer Microsoft Copilot, Microsoft 365 Copilot, GitHub.com or hosted
coding agent. No actual connection, registry publication or Copilot transmission
was qualified here.

Target: Streamable HTTP `https://guteneo.com/mcp`. Public preview remains a
demonstration and exposes no MCP server. Actual access needs configured
Guteneo, an authorized account and qualified OAuth. Organization policy may
prohibit external MCP servers.

## VS Code

1. Install current VS Code and sign in to your authorized GitHub Copilot account.
2. Download [copilot-vscode-mcp.json](../integrations/config/copilot-vscode-mcp.json).
   Merge its `guteneo` entry under **`servers`** in `.vscode/mcp.json`, preserving
   other servers. `MCP: Open User Configuration` supports profile-level
   configuration instead of repository settings.
3. Open `MCP: List Servers`, select Guteneo/start connection. Review server
   trust and OAuth permissions; verify available tools before conversational use.

The template contains only `type: "http"` and URL, no token/registered client.
If Guteneo supplies a **preregistered public identifier**, add
`"oauth": { "clientId": "PUBLIC_CLIENT_ID_PROVIDED_BY_GUTENEO" }` to `guteneo`.
This marker is not an existing client. Never assume dynamic registration active.

Sources: [VS Code MCP format](https://code.visualstudio.com/docs/agents/reference/mcp-configuration),
[GitHub Copilot Chat MCP](https://docs.github.com/en/copilot/how-tos/provide-context/use-mcp-in-your-ide/extend-copilot-chat-with-mcp).

## Copilot CLI

Merge [copilot-cli-mcp.json](../integrations/config/copilot-cli-mcp.json) under
**`mcpServers`** in `~/.copilot/mcp-config.json`. CLI does not read
`.vscode/mcp.json`; the supplied files are not interchangeable.

Alternatively:

```sh
copilot mcp add --transport http guteneo https://guteneo.com/mcp
```

Interactive `/mcp` lists servers. `/mcp auth guteneo` restarts browser OAuth
when needed; `/mcp show guteneo` inspects tools. `tools: ["*"]` exposes server
announcements without removing permission requests/Guteneo checks.

Documented preregistered-client fields are `oauthClientId`,
`oauthPublicClient: true`, `oauthGrantType: "authorization_code"` in `guteneo`.
Add an ID only when supplied/qualified. These templates need no provider
secret, plaintext token or shared `client_credentials` flow.

Sources: [add CLI servers](https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-mcp-servers),
[CLI configuration/OAuth](https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-command-reference).

## PDFs, permissions and validation

Upload the original PDF to authenticated Guteneo Documents, then locate it
with announced `list_documents`/`get_document`. Templates qualify no Copilot
attachment transfer, local path/disk access or local adapter. MCP configuration
alone installs neither ZIP package nor `fax-pdf`/`postal-pdf` instructions.

Start with `get_capabilities`; use only returned account channels/tools/prices.
Default document/recipient/options/quote approval is **human review in Guteneo**.
Optional expert mode is off by default and requires a prior browser-admin
mandate for that OAuth connection, bounded by channels, per-send/day caps,
daily count and expiry within 30 days. `review_dispatch` then
`approve_and_send_dispatch` permit delegated approval of the exact version;
postal transfer has a separate tool. Copilot permission grants no mandate
or human-review evidence. Never bypass Copilot confirmations. See
[EXPERT_APPROVAL.md](EXPERT_APPROVAL.md). `submission_unknown` requires
reconciliation, never automatic resend.

## Evidence before opening

For each surface retain exact version, account permissions, **actually observed
and registered** OAuth callback, consent, expiry/renewal/revocation, organization
isolation, exact PDF and SHA-256. Add no arbitrary/wildcard callback to make
an example work. Retain no token, OAuth code, signed URL or personal document.
Repository tests verify distributed files/local interface, not successful
Copilot connection.
