# Guteneo — email and PDF correspondence

<img src="https://guteneo.com/brand/guteneo-mark.png" alt="guteneo" width="64" height="64" />

Guteneo's MCP identity already includes the standard 512 px PNG icon. The server
also supplies its title and developer-guide URL. Hosts decide whether their
connector picker displays these fields; if a manual logo field is available,
use [this canonical PNG](https://guteneo.com/brand/guteneo-mark.png). Installing a
logo or package grants no account access or approval.

This directory prepares candidate **1.1.0**. Package version, application
capabilities and MCP server identity follow the same source version; the release
fingerprint identifies actually served code. Building an archive updates neither
the server nor a directory. The builder also emits the dedicated
`guteneo-claude-code.zip` and `guteneo-claude-marketplace.zip`; their READMEs
separate format checks, installation, OAuth and actual host qualification.

## Features and access

The package combines the Guteneo MCP connection with `get-started`, `email`,
`fax-pdf`, `postal-pdf`, `document-studio`, `pdf-accessibility` and `secure-distribution`. Available actions
depend on the connected server, account permissions, activated channels/services
and actual host capabilities. Installation grants no mandate and proves neither
end-to-end qualification, OpenAI approval nor directory publication. Installation
runs no code or local hook, and the package contains no credentials. Its optional
exact-file helper runs only with explicit host and file permission; installation
grants no filesystem access or network authority.

Server: **https://guteneo.com/mcp**; OAuth is required. Account/server access must
already work. A valid archive proves neither connection nor successful sending.
The manifest contains an English listing and localized French interface copy,
with [support](https://guteneo.com/support/?lang=en),
[privacy](https://guteneo.com/privacy/?lang=en) and
[terms](https://guteneo.com/terms/?lang=en). Skills depend on the Guteneo MCP;
only tools actually exposed to this connection may be used.

The workflows exclude PCI DSS payment-card data, protected health information,
government identifiers, authentication secrets and sensitive personal data,
including known excluded data in existing documents. Malware scanning does not
establish their absence. A `review_prepare_only` quote stops at preparation,
without approval, expert review or sending. Business email requires qualified operational controls and current
account/channel gates; package installation does not enable it.

PDF/UA/PDF/A checks require existing account entitlement and an available
veraPDF service. Reports bind exact original bytes and certify neither complete
accessibility nor legal compliance. The plugin never subscribes, renews/cancels
a plan, buys credit or manages billing. Existing account authority and balance
explain availability; they are not a plugin sales flow.

## Manual installation

Sources were reviewed on **13 October 2026**; Claude Code/Claude web/Desktop
instructions were rechecked on **23 October 2026** with Claude Code 2.1.309 and
official guides. The [public ZIP](https://guteneo.com/integrations/guteneo-plugin.zip)
and [version/SHA-256 manifest](https://guteneo.com/integrations/manifest.json)
allow manual retrieval independently of directory publication. The
[repository](https://github.com/nclsppr/guteneo) includes this directory on main.
Loading a folder does not require compiling Guteneo; rebuilding uses `npm ci`
and `npm run build:integrations` at repository root. Check the selected archive's
version/hash: the website and main may represent different versions.

| Host                 | Installation and qualification boundary                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ChatGPT              | Plugins → `+` → **Add custom MCP server**; enter the server URL, configure OAuth, review permissions, then **Create as a plugin**. Check tools, install the created plugin and select it with `@` in a new conversation. Account/workspace policy applies; developer mode is not a universal prerequisite. Personal MCP connection alone does not distribute this archive's skills. [OpenAI guide](https://developers.openai.com/plugins/deploy/connect-chatgpt).                                                                                                          |
| Claude web / Desktop | For MCP only, use [Connect to Claude](https://guteneo.com/assistants/claude/) or Customize → Connectors. For the full package: **Customize → Plugins → Add → Upload plugin**, then open **Connectors** in the plugin and connect Guteneo. Loading skills does not complete OAuth. [Claude plugins](https://claude.com/docs/plugins/overview).                                                                                                                                                                                                                              |
| Claude Code          | From the repository: `claude --plugin-dir ./integrations/guteneo`, or `claude --plugin-url https://guteneo.com/integrations/guteneo-plugin.zip` without cloning. Use the real extracted path when applicable. Loading is session-scoped; open `/mcp` to connect. The dedicated Claude package documents its separate OAuth prerequisites. [Direct loading](https://code.claude.com/docs/en/plugins/create#develop-without-a-marketplace).                                                                                                                                  |
| Grok web             | [Connectors](https://grok.com/connectors) → **New Connector → Custom**, add the MCP URL and complete authentication. Team policy may require administrator authorization. [Grok connectors](https://docs.x.ai/grok/connectors).                                                                                                                                                                                                                                                                                                                                            |
| Grok Build           | `grok mcp add --transport http guteneo https://guteneo.com/mcp`, then `grok mcp doctor guteneo`; `/mcps` handles authentication. `grok --plugin-dir ./integrations/guteneo` is a candidate based on documented Claude Code compatibility. Guteneo connection/skills remain to be qualified there. [MCP](https://docs.x.ai/build/features/mcp-servers), [plugins](https://docs.x.ai/build/features/skills-plugins-marketplaces).                                                                                                                                            |
| Cursor               | Copy the entire package, including hidden files, to an empty `~/.cursor/plugins/local/guteneo/`; preserve any existing local changes. From the repository use `mkdir -p ~/.cursor/plugins/local/guteneo`, then `cp -R ./integrations/guteneo/. ~/.cursor/plugins/local/guteneo/`. Restart or **Developer: Reload Window**, inspect **Customize** and connect MCP. Local imports must be allowed; external symlinks are ignored. For MCP only, merge cursor-mcp.json into `.cursor/mcp.json`. [Cursor local plugins](https://cursor.com/docs/plugins#test-plugins-locally). |
| GitHub Copilot       | Merge copilot-vscode-mcp.json into `.vscode/mcp.json`, then **MCP: List Servers**. Copilot CLI uses copilot-cli-mcp.json in `~/.copilot/mcp-config.json`, then `/mcp auth guteneo` when requested. Templates prove neither installation of this ZIP nor Microsoft consumer Copilot compatibility. [Guteneo guide](https://github.com/nclsppr/guteneo/blob/main/docs/COPILOT.md).                                                                                                                                                                                           |

URLs, archives and JSON templates are installation mechanisms, not live access
proof. Replace `REPLACE_WITH_REGISTERED_PUBLIC_CLIENT_ID` or
`GUTENEO_CURSOR_CLIENT_ID` only with an actually registered public client matching
the host's exact callback. Claude.ai's hosted client is not a Claude Code loopback
client. Discovery of a registration URL proves neither DCR nor CIMD compatibility.

For OAuth rejection, compare the advertised issuer exactly, including its
trailing slash. Reconnect after token expiry or new scope grants, then check
`get_capabilities`. ChatGPT **Refresh** updates metadata and proves no token
renewal. Automatic refresh and revocation require separate per-client proof.
See [connection diagnostics](https://github.com/nclsppr/guteneo/blob/main/docs/LLM_SETUP.md)
and [RFC 8414 §3.3](https://www.rfc-editor.org/rfc/rfc8414.html#section-3.3).

## Preparation and authority

Example requests: “Prepare this email with my PDF and show the quote”, “Prepare
this email without an attachment”, or “Prepare a protected link for this PDF for
7 days”. Fax/postal remain account-dependent. Collect only missing recipient,
channel and ceiling details. Missing tools or disabled channels are blockers.

Standard sending requires the person's review and approval in Guteneo. Expert
mode starts disabled: only a browser administrator can grant this exact OAuth
connection a bounded, expiring mandate, with selected channels, per-send/daily EUR
ceilings, daily count and expiry within 30 days. The assistant cannot activate or
extend it; chat agreement creates no mandate. Read `get_expert_status`.
`review_dispatch` returns readable PDF pages (up to 10 MiB, three pages per call),
then a token valid at most five minutes only after every page. Exact delegated
acceptance uses `approve_and_send_dispatch`. Postal `transfer_postal_draft` needs
distinct delegated authority and transfers a draft without sending. Host
confirmations and server gates remain mandatory.

The private binary bridge uses begin_document_upload and get_document_upload only
when the host actually supplies original-file access and permitted Guteneo egress.
Its bounded POSIX Python client is explicit, grants no OAuth/filesystem permission,
and proves no actual client or physical-iPhone transfer. Preserve host controls.

ChatGPT import requires the host's actual file contract. Guteneo fetches exact
bytes from a direct public HTTPS source and verifies the PDF; private, expired or
redirected URLs are rejected. Without qualified file transport, the user may
choose [authenticated document upload](https://guteneo.com/?lang=en#/app/documents)
and reuse the document ID. A separately installed Cursor/Claude Code local
adapter is documented independently; this package grants it no disk access.

For postal requests, preserve the postal channel. `get_postal_setup` reads the
sender. If absent, collect its name/full address in the conversation; an OAuth
administrator with dispatches:prepare may call `configure_postal_sender` without
a web setup form. It cannot replace existing identity or restore suspended
service. OAuth submission is recorded distinctly from human send consent and
physical address verification. Then collect missing recipient/options, preflight
the PDF and present `reviewUrl`. A fax-only mandate does not block standard
postal preparation.

Read `analysis` on the same stored document. Processing continues automatically;
wait the returned delay, read `get_document` at most three times and never
reimport or loop on rescans. `documentUrl` is optional when the person wants the
website. Analysis prepares, approves and sends no communication. The server
remains authoritative; follow current tool schemas and error.recovery. An
uncertain response never authorizes another dispatch.

## Account-protected distribution

`secure-distribution` prepares delivery through a recipient account and a
secure page reader, with a funded retention term and the server’s active
document authentication policy. It uses `prepare_secure_distribution`,
`list_secure_distributions`, `get_secure_distribution`,
`confirm_secure_distribution` and `revoke_secure_distribution`. The term,
original-download permission and any authorized personal copy are part of the
immutable preparation and approved quote. Revocation refunds no funded term and
does not delete a personal copy already delivered.

Rendering can return `preparing`: query the same identifier without recreating
the operation. Activation requires recorded browser approval under the active
document authentication policy, including for an expert connection. The
assistant never confirms recipient identity, performs initial account binding
or accesses personal documents. Display/download events preserve their
provenance; they prove neither complete reading, saving to disk nor screenshot
detection.

All clients connected to `https://guteneo.com/mcp` discover the same tools under
their current server authority: the combined ChatGPT/Cursor/Claude package,
the dedicated Claude package and the MCP configuration examples. Existing
`dispatches:prepare`, `dispatches:read` and `dispatches:send` scopes cover this
workspace workflow and grant no access to someone else’s personal space. REST
describes the same workspace operations in `/openapi.json`.

Configuration, rendering, scanning, notification, authentication and account
availability gates remain mandatory. A local archive proves neither production
activation nor qualification in each host. The legacy password-protected email
link remains a separate workflow; never switch modes without an explicit choice.

## Email, protected documents and studio

`email` reuses `prepare_dispatch` for no attachment, original PDF attachment or
protected link. The quote separates delivery and applicable EUR1 hosting per
protected document. Duration is 1, 7 or 30 days. The verified original remains
immutable. Recipients need a password, not an account. The sender reads the
password only in their authenticated browser and shares it separately; no MCP
tool reads or transmits it. Preparation-only review accounts still cannot send.
For an accessible ready PDF, omitted subject/body use localized defaults naming
the authenticated workspace. Document emails without custom HTML use the branded
template. Custom protected-link HTML can place `{{document_url}}` as an anchor
button's exact `href` with safe inline email styles; clients never supply the
private access URL or password. Message-only email still requires content, and
all final text/HTML remains bound to review and approval.

`document-studio` covers editable pdfme templates, DOCX import warnings,
CSV/XLSX/XML/JSON, versioned mappings, private PDF jobs and separate distribution
preparation. Executable examples live in `examples/template-workflow/`. Dedicated
OAuth scopes are templates:read/write/publish/share, datasets:read/write and
generations:read/write, plus document/dispatch scopes for their own actions.
Discover current rules with `get_template_authoring_guide`, then five synthetic
bases with `list_template_examples`/`get_template_example`. Direct assistant
authoring needs no extra internal AI call. The packaged
[authoring reference](skills/document-studio/references/template-authoring.md)
explains the envelope. Owners may remove creations or demo copies through
`delete_template`; existing PDFs/history remain. Shared templates do not share
private data sources. Data files are not email attachments; recipient accounts
and Excel/other attachments remain unavailable in the email journey.

## Identity and publication evidence

The approved simple directory emblem is assets/guteneo-mark.png (512 × 512).
The composer derivative assets/guteneo-composer.png (1 254 × 1 254) has a transparent
outer contour and simplified frame. The halftone portrait belongs to website and
sign-in surfaces. Assets alone prove no ChatGPT publication.

The manifest's public video is the **21 September 2026** recording. It qualifies
neither this package, a fresh reviewer run nor postal execution. Test cases are
not redeclared inside the ZIP, preserving existing portal cases. Reviewer access
stays in secure portal fields. Package preparation, submission, OpenAI approval
and directory publication are separate. Current review evidence and open cases:
[CHATGPT_MARKETPLACE.md](https://github.com/nclsppr/guteneo/blob/main/docs/CHATGPT_MARKETPLACE.md).
