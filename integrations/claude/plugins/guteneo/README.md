# Guteneo for Claude Code — 1.1.5 candidate

Seven skills guide PDF diagnostics, document creation, secure distribution, email, fax and postal
preparation through the existing Guteneo service. The package connects to
`https://guteneo.com/mcp` over HTTP and carries no credentials, local executable,
permission grants or automatic actions. Each workflow checks the connected
account and preserves Guteneo's document, price and approval controls.

This is a Claude Code plugin candidate. It is not an Anthropic directory listing,
a Claude.ai connector installation, or evidence that Claude Code authentication
has passed. The repository's September 2026 Claude.ai test applies only to that
historical hosted session, not this package or today's server.

## Load a reviewed local copy

Extract `guteneo-claude-code.zip` to an empty directory. The directory must
directly contain `.claude-plugin/plugin.json`, `.mcp.json`, `skills/` and this
README. With Claude Code already installed, validate that directory before use:

```sh
claude plugin validate ./guteneo-claude-code
claude --plugin-dir ./guteneo-claude-code
```

The second command starts a Claude Code session and loads the connection. It is
an installation/use instruction, not a command run during package preparation.
Review the host's prompts. No permission bypass is needed.

For a persistent local marketplace installation, use the separately supplied
`guteneo-claude-marketplace.zip` and its top-level README. Install either this
dedicated package or the combined Guteneo compatibility package, not both under
the same plugin name.

After adding the extracted local marketplace, the install command is:

```sh
claude plugin install guteneo@guteneo-plugins
```

## Connect an existing Guteneo account

Open `/mcp`, locate the Guteneo connection and follow the browser sign-in flow.
Use your own verified Guteneo account and review the requested permissions. A
visible tool does not establish the account's authority to use it. If sign-in
fails, keep the error and stop before any business action.

The bundled connection uses standard OAuth discovery. Guteneo's automatic
registration compatibility with Claude Code has **not** been qualified. If the
host reports that registration is unavailable, an operator must verify an
existing compatible public OAuth client and its exact loopback callback. This
package supplies no client identifier, secret or fabricated callback registration.
Do not copy Claude.ai's hosted client identifier into Claude Code. The repository
guide `docs/CLAUDE_PLUGIN.md` describes this remaining prerequisite and the
separate static configuration template; that template is not a ready credential.

## Start with a bounded request

- `/guteneo:get-started` — check the actual capabilities of the connected account.
- `/guteneo:fax-pdf` — prepare a fax from an exact, verified Guteneo PDF.
- `/guteneo:postal-pdf` — check the postal profile, PDF and address before pricing.
- `/guteneo:email` — prepare the requested email and its chosen document mode.
- `/guteneo:document-studio` — create templates and private PDFs when entitled.
- `/guteneo:pdf-accessibility` — explain an automated PDF diagnostic and its limits.
- `/guteneo:secure-distribution` — prepare account-protected PDF access with a quoted retention term, optional download and authorized personal copy.

Use synthetic data for qualification. The remote package cannot read local PDF
paths or extract a Claude attachment. Where file transfer is unavailable, the
user may upload permitted content in their authenticated Guteneo browser, then
reuse the resulting document. This does not bypass the workflows' sensitive-data
restrictions. Read the [host contract](references/claude-host.md) before using a
workflow. Standard sending requires authenticated browser approval; expert
authority must already exist, and a preparation-only account cannot send.

## Qualification boundary

Secure distribution uses the same centralized MCP service as the other packages.
Its five tools prepare, list, inspect, confirm and revoke workshop distributions.
Activation always requires recorded browser approval under the active document
authentication policy, even for expert connections. The funded retention term is not refunded on revocation. The
assistant cannot bind recipient identity or inspect personal documents. Original
download and personal-copy rights are explicit and distinct. Display telemetry
does not certify reading, saving to disk, printing or screenshots.

These additions are source and package candidates. The historical validator
result below does not qualify this changed archive, its OAuth connection, the
server activation or execution of the new tools in Claude.

Packaging tests check the declared files, matching versions, endpoint/scopes,
relative paths and absence of credential or permission overrides. The official
Claude Code 2.1.309 validator passed both extracted archives with `--strict` on
23 October 2026, in an isolated configuration with network access denied.
Installation, OAuth, refresh/revocation and real Claude Code tool execution remain
unqualified. No email, fax, postal communication or provider transfer was made to
prepare the package.

The separate `--profile directory` check still reports `LICENSE_MISSING`:
distribution licensing must be decided by the copyright holder before an
Anthropic directory submission. No license or publication status is invented by
this candidate. Passing local format validation is not directory approval.

[Claude Code plugin manifest](https://code.claude.com/docs/en/plugins-reference),
[MCP authentication](https://code.claude.com/docs/en/mcp),
[Guteneo privacy](https://guteneo.com/privacy/?lang=en),
[Guteneo support](https://guteneo.com/support/?lang=en).
