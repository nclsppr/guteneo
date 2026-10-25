# Claude: package 1.0.0 and separate evidence

Candidate state as of **23 October 2026**.
`integrations/claude/plugins/guteneo` contains a standalone Claude Code package:
manifest, remote HTTP connection and six skills adapted to that host's limits.
Local catalog `integrations/claude/.claude-plugin/marketplace.json` references
it without an external path. The combined package's Claude manifest remains
available at the same version; do not install both alternative distributions
simultaneously under the `guteneo` name.

## Three separate surfaces

| Surface                    | Deliverable/access                                                | Current evidence                                                                                                 |
| -------------------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Claude Code plugin         | Dedicated ZIP, local directory or `guteneo-plugins` local catalog | Both extracted ZIP formats validated by Claude Code 2.1.309; installation/actual calls unqualified.              |
| Claude.ai custom connector | `https://guteneo.com/mcp`, per-user OAuth                         | Connection/`get_capabilities` observed only on 17 September; [CLAUDE_QUALIFICATION.md](CLAUDE_QUALIFICATION.md). |
| Anthropic directory        | Separate connector/plugin submission                              | No submission, listing or approval claimed. Local catalogs publish nothing there.                                |

[Claude Code formats](https://code.claude.com/docs/en/plugins-reference) use
`.claude-plugin/plugin.json` and discover skills/`.mcp.json` in standard
locations. Name stays `guteneo`, version follows the product, transport retains
existing scopes. The package contains no secret, hook or automatically granted
permission. The25October candidate adds an explicitly invoked bounded Python
client for [private original transfer](PRIVATE_DOCUMENT_UPLOAD.md); it grants
no OAuth or filesystem access. Earlier archive-format checks do not qualify the
new archive, file transfer or any physical mobile host.

## Build and validation

From repository root:

```sh
npm run build:integrations
node --test tests/security/claude-plugin.test.mjs
```

The builder produces in `dist/integrations/`:

- `guteneo-claude-code.zip`: plugin root; after extraction,
  `claude plugin validate ./guteneo-claude-code`, then, if the user chooses
  to use it, `claude --plugin-dir ./guteneo-claude-code`.
- `guteneo-claude-marketplace.zip`: catalog root with the same plugin under
  `plugins/guteneo/`. Bundled README gives validation and separate registration/
  installation commands.

Tests verify exact archive contents, contained paths, version/connection parity,
authority limits and rejection of added secrets/permissions. They do not simulate
host success. `claude plugin validate` is Anthropic's reference validator;
retain output and CLI version separately from OAuth qualification. The
[local catalog](https://code.claude.com/docs/en/plugin-marketplaces) is Guteneo's
distribution method, not Anthropic-directory presence.

On 23 October, official **Claude Code 2.1.309** validated both extracted
archives using `plugin validate --strict`, with no manifest errors/warnings.
The npm runtime was isolated outside the repository, without install scripts,
with empty Claude configuration and network blocked during validation.
No connection/plugin installation occurred. Five package tests pass, including
actual archived bytes and rejection of credential, command, scope, path and
permission substitutions.

Additional `--profile directory --strict` fails only on `LICENSE_MISSING`.
The rights holder must decide distribution licensing before directory
submission; neither an invented open-source license nor local validation
resolves this. Existing 512 × 512 icon and public support/privacy/terms URLs
are included. CLI checks do not replace directory security/policy review.

## Claude Code OAuth prerequisites

The remote package uses standard discovery. Actual DCR/CIMD compatibility is
not demonstrated here. Historical Claude.ai client ID
`IhJieRsvZBAnl1uJO125X2SPoIHxT8ed` targets hosted callback
`https://claude.ai/api/mcp/auth_callback`; it is not a qualified localhost
Claude Code client. The package creates no identifier, secret or callback.

If automatic registration is refused, work with the operator to verify an
existing public client actually registered for the CLI callback before
configuring it. `integrations/config/claude-static-oauth.json` documents port
8788, but its marker is not usable configuration. Copy neither marker into
the plugin nor modify OAuth registration merely to pass validation. The
[Claude Code MCP guide](https://code.claude.com/docs/en/mcp) describes
`oauth.clientId`, fixed callback and `/mcp`; host permissions/Guteneo rights
still apply. No authentication was performed to prepare this candidate.

Current documentation also says Claude.ai connectors may appear in Claude
Code under a compatible Claude.ai login. Observe that in the actual account
before claiming it: it proves neither this plugin's bundled connection nor
reuse of its OAuth client.

## Qualification before claiming actual compatibility

1. Validate both extracted directories with Anthropic CLI; record its version,
   ZIP SHA-256 and secret-free output.
2. After explicit installation choice, observe six skills, server and normal
   confirmations. Complete normal OAuth for the correct account.
3. Call only `get_capabilities`; verify mode, bound tenant and actual blocks
   without creating documents/dispatches. Tool presence proves neither
   execution nor authority.
4. Separately qualify expiry, actual renewal and revocation. Rotation code
   or reconnection does not prove refresh exchange.
5. With an authorized synthetic PDF, verify exact bytes, scan/page reading.
   Qualify the private binary bridge only when the actual host can access the
   original file and permitted Guteneo egress. Claude iPhone uses its cloud
   computing environment, not a local extension. The bundled POSIX Python client
   and server tests are not a physical iPhone/web/Code pass. Browser upload
   remains a separate alternative chosen by the person.
6. Qualify preparations separately with exact recipient/cap and applicable
   authority. `review_prepare_only` stops before expert review, provider
   transfer, approval or sending. Plugin-format validation needs no real send.

Workflows retain content restrictions, immutable originals, default browser
review, preexisting client-bounded mandates, uncertain outcomes without retry
and server-returned prices. [Claude skills](https://code.claude.com/docs/en/skills)
grant no `allowed-tools` here; that field can preauthorize tools and does not
replace product authority checks.

## Claude.ai and directory

The [official custom-connector link](https://claude.ai/customize/connectors?modal=add-custom-connector&connectorName=Guteneo&connectorUrl=https%3A%2F%2Fguteneo.com%2Fmcp)
prefills only name/URL. Users must still confirm and authenticate. Private
installation grants no badge, publication or listing. The
[directory/custom-connector distinction](https://claude.com/docs/connectors/building/directory-vs-custom)
and [Anthropic authentication contract](https://claude.com/docs/connectors/building/authentication)
require qualification of the chosen identity mechanism for that surface.
Hosted-client configuration/old consent evidence do not qualify CLI.
Authentication changes, installations and external submissions remain separate
from this source candidate.

Primary sources consulted on 23 October 2026. September notes in
[CLAUDE_RENEWAL.md](CLAUDE_RENEWAL.md) and
[CLAUDE_QUALIFICATION.md](CLAUDE_QUALIFICATION.md) remain historical and do
not become package-1.0.0 qualification evidence.
