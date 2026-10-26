# MCP client compatibility

<img src="https://guteneo.com/brand/guteneo-mark.png" alt="Guteneo" width="64" height="64" />

Checked against primary product documentation on 25 October 2026, with dated
actual Desktop observations added on 26 October. This is the
current qualification plan, not a claim that every client has passed. The dated
[platform audit](MCP_PLATFORM_READINESS.md) retains its historical observations.
Installation instructions live in [assistant setup](LLM_SETUP.md); the binary
contract lives in [private PDF transport](PRIVATE_DOCUMENT_UPLOAD.md).

## One service, independent client capabilities

Use `https://guteneo.com/mcp` with Streamable HTTP and the authorization server
returned by protected-resource discovery. The [domain contract](AUTH0_CUSTOM_DOMAIN.md#independent-mcp-trust-and-discovery)
owns issuer configuration; the observed custom-domain authorization flow is in the
[dated Claude qualification](CLAUDE_QUALIFICATION.md#claude-desktop-free-inline-original--26-october-2026).
Do not hardcode tenant-domain login URLs, copy another
client's callback, extract its credentials or replace OAuth with a shared key.

Every client must separately establish:

1. Discovery, exact client registration and normal OAuth consent.
2. An authenticated low-impact tool call with the intended workspace membership.
3. Original PDF bytes: a host-authorized native download source, an authorized
   runtime with permitted binary PUT, the bounded inline original transport, or
   the separately gated App transport after its own actual-host qualification.
4. Matching original and stored SHA-256/size, followed by ready analysis on the
   same document ID. An attachment summary or regenerated PDF does not qualify.
5. Delivery of the registered document ID to the model before it continues. A
   visible widget receipt or successful storage does not establish that handoff.
6. Correct channel preparation and the existing approval boundary, independently
   of upload. Host execution confirmation does not grant business sending rights.
7. Expiry, refresh when supported, disconnect/revocation and lost-response recovery.

MCP tools use structured JSON input; a remote server cannot read a client path.
Resources and roots are not a client-to-server binary upload transport. See the
current [MCP tools specification](https://modelcontextprotocol.io/specification/2026-07-28/server/tools).
Do not upgrade the server protocol or advertise a capability solely because a
newer specification exists.

## File transport selection

Prefer the existing `import_document` path when the host supplies an authorized
exact-file URL or supported OpenAI file envelope. Otherwise use
`begin_document_upload`, one private binary PUT and `get_document_upload` from a
runtime that actually holds the original. The private bridge requires no
download URL. The native envelope path can retain a host-authorized temporary
URL accessible under the existing direct HTTPS import contract, without custom
cookies or Authorization headers. Never publish a private PDF to manufacture
such a URL or reconstruct it from extracted text.

When the runtime has the original but cannot reach Guteneo, the
`import_inline_pdf` tool accepts one exact original of at most 64 KiB through
MCP. Compute its actual size/SHA-256 and canonical base64 using code, then use one
stable-key invocation. The server validates before reserving and reuses the same
private scanner/authority/quota pipeline. It adds no runtime egress exception and
keeps the 2 MiB MCP body limit unchanged. This route consumes more host context;
do not chunk, truncate or raise its bound. Larger originals need another qualified
transport. Neither tool discovery nor a successful local test proves that the
actual host can carry an encoded payload intact.

The default-off [App transport](PRIVATE_DOCUMENT_UPLOAD.md#selected-local-originals-through-mcp-apps)
opens a device-file chooser and requires an explicit Import action. It uses new
App-only staging tools through the official bridge, not informal splitting of
`import_inline_pdf`, direct browser fetch or a relaxed network/Origin policy.
It provides a selected local original, not automatic access to the conversation's
existing attachment. The earlier diagnostic remains limited to widget/empty
bridge/chooser cancellation. The [deployed 1.1.6 Desktop record](CLAUDE_QUALIFICATION.md#claude-desktop-selected-original-app--26-october-2026)
separately qualifies explicit imports of 299,807-byte and 10 MiB originals,
independent exact private R2 bytes and ready/verified analysis. Manual same-ID
status recovered the larger file's registered receipt without resend.

The next-turn registered-ID handoff **failed**: Claude had neither new ID and
made no `get_document` call. General activation remains pending. The 1.1.7 source
follow-up adds standard text context alongside minimal structured receipt data,
an explicit Use in conversation action for that same receipt, and accepted
receipt truth after a late bridge error. Import sends no automatic chat message.
Automatic context and the explicit-message fallback need separate native tests. Local fixture proof
does not establish the native-host retest or prove the observed deadline cause.
Comprehensive confirmation/retention, revocation, device/resource and other-host
checks remain separate gates; ordinary tool-only workflows remain available.

The returned reference uploader currently requires **POSIX Python 3.9+**. Linux
cloud runtimes and macOS are candidates; Windows native, a mobile filesystem and
a browser widget are not implicitly supported by that helper. The binary server
contract is independent of Python. An alternative uploader needs equivalent
file-boundary, fixed-destination, timeout, no-secret and no-retry qualification.
An authorized Linux environment on Windows is a separate runtime, not a native
Windows pass. The helper acquires no OAuth credentials and installs no packages.

Native host extensions are optional. A tool-only client must retain useful reads,
document preparation and honest capability errors without a widget, local
extension, resource subscription or particular model. Detect the actual file API
and runtime; do not infer their availability from a user-agent string.

## Brand discovery

The MCP implementation advertises `title`, `websiteUrl` and standard `icons`;
the portable and Claude packages retain their existing logo fields and assets.
The public icon is [Guteneo PNG, 512 × 512](https://guteneo.com/brand/guteneo-mark.png).
The protected-resource metadata links the hosted installation guide using
`resource_documentation`; it does not invent an OAuth logo field.

A guide image helps readers identify the service but does not configure a
client's connection card. Each host chooses whether to render server icons,
use its own cached/directory artwork or request a manual upload. Use the same
canonical icon when that host asks for one. A valid SDK icon response is protocol
evidence; visible artwork after installation needs an actual host check.

## Target matrix

The entries below describe documented connection routes and the next required
evidence. The [dated Claude record](CLAUDE_QUALIFICATION.md#claude-desktop-free-inline-original--26-october-2026)
owns the bounded inline result, no-content checkpoint and later selected-original
App transfer, as well as the failed registered-ID handoff. Native binary PUT still
has no actual-client pass in those records. Local API/client tests, a browser
emulator and an earlier native import are separate evidence; none qualifies a new
row. Mobile and web remain separate rows even when they share account configuration.

| Client                                   | Connection route                                                                                                            | Original-file candidate and remaining check                                                                                                                                                                     |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Claude on iPhone / iPad                  | Remote connector; mobile use is documented.                                                                                 | Cloud file/code access is documented. Qualify the exact original and permitted binary PUT or bounded inline original up to 64 KiB on the physical device. No desktop extension on the phone.      |
| Claude web                               | Custom remote connector with its own OAuth flow.                                                                            | Qualify the cloud original plus native, permitted binary or bounded inline transfer. Network controls and available settings vary by account; do not assume a custom-domain allowlist on Free.                                                                           |
| Claude Desktop / Cowork                  | Remote connector; local extensions are a distinct installation.                                                             | The dated [1.1.6 Desktop App record](CLAUDE_QUALIFICATION.md#claude-desktop-selected-original-app--26-october-2026) qualifies selected 299,807-byte/10 MiB originals through exact private storage and ready analysis, plus manual same-ID receipt recovery. Registered-ID delivery to the model failed; general activation and the 1.1.7 native retest remain pending. Binary PUT, Cowork and mobile remain separate. |
| Claude Code                              | Remote HTTP MCP and its normal authentication flow.                                                                         | Authorized original in its actual working environment, POSIX helper or independently qualified uploader; inspect host confirmations and file exclusions.                                                        |
| ChatGPT web                              | Remote MCP-backed plugin and account/workspace permissions.                                                                 | Retain native file-envelope import. Feature-detect widget file APIs when a widget is actually available; otherwise require original-file runtime and allowed egress. Plugin installation alone is insufficient. |
| ChatGPT on iPhone / iPad                 | The actual mobile app must expose the installed Guteneo connection.                                                         | Test native attachment authorization, exact file handoff and available controls on the physical app. Web, desktop, API and WebKit results do not establish this.                                                |
| ChatGPT desktop / Codex local / IDE      | Shared host MCP configuration supports HTTP OAuth.                                                                          | An authorized local original can use the reference uploader on its supported runtime. Verify the actual host, account and workspace; never read its OAuth cache.                                                |
| Cursor IDE / CLI                         | Remote OAuth MCP; normal project and tool permissions.                                                                      | Authorized local original plus qualified runtime. macOS/Linux and native Windows need distinct evidence.                                                                                                        |
| Cursor Cloud Agents                      | HTTP MCP with per-user OAuth; HTTP credentials remain outside the VM.                                                       | Use the upload-only grant in an authorized VM containing the original. Verify egress; never look for proxied OAuth credentials in the VM.                                                                       |
| Grok web                                 | Custom MCP connector at `grok.com/connectors`, subject to account/admin controls.                                           | Verify actual attachment byte access and permitted runtime/egress. A Grok Build or API capability does not establish consumer-file transfer.                                                                    |
| Grok mobile                              | Confirm the custom connector is available in that actual app/account.                                                       | Physical-device original-file and connector journey remains unqualified; web installation documentation alone does not prove it.                                                                                |
| Grok Build                               | Remote HTTP MCP with automatic OAuth is documented.                                                                         | Authorized local original and supported/qualified uploader; CLI evidence does not qualify Grok consumer apps.                                                                                                   |
| VS Code / GitHub Copilot local           | Add the remote HTTP server and complete host authentication/trust.                                                          | Authorized project original and qualified runtime, independently of Cursor and GitHub cloud.                                                                                                                    |
| GitHub Copilot cloud agent / code review | **Blocked:** current product documentation excludes remote OAuth MCP.                                                       | Guteneo requires per-user OAuth. Do not work around this with a shared token, public access or weaker authorization. Recheck when the host adds support.                                                        |
| Gemini CLI                               | Remote HTTP OAuth discovery; browser callback support is required.                                                          | Authorized local original and qualified uploader. Headless/remote sessions need an actually working callback path, not an assumed local browser.                                                                |
| Gemini consumer web / mobile             | Add a custom app on the web; documented mobile reuse. Availability is restricted by account, region, language and settings. | Qualify an eligible account and each actual surface; original-file export/egress is not established by connector support.                                                                                       |
| Perplexity                               | Custom remote connector with OAuth and product/admin permissions.                                                           | Qualify its exact callback/client and whether original bytes can reach a permitted runtime. A search/index connector is not an attachment upload contract.                                                      |
| Mistral Work                             | Custom HTTPS MCP with OAuth 2.1 and DCR.                                                                                    | Qualify usable client registration and original-file egress. Tool calls must work without resources or automatic prompt templates, which the host does not currently support.                                   |
| Windsurf / Devin Desktop                 | Product-specific remote HTTP OAuth configuration; legacy Cascade and Devin Local differ.                                    | Qualify actual agent/runtime, selected tools and authorized original. A marketplace entry or a different agent configuration is insufficient.                                                                   |
| Other MCP clients / API integrations     | Streamable HTTP, current OAuth discovery and per-client authorization.                                                      | Integrators provide a permitted original-file transport. API file IDs and runtime policies belong to that API; consumer app behavior cannot be inferred.                                                        |

### Current Codex connection check — 26 October 2026

The single read-only `get_capabilities` check returned `UNAUTHORIZED` with
reauthentication required. No fresh cause or automatic-refresh behavior was
established. The private record is
`completion-audit-20261026/mcp/requirements-audit.private.json` in the
`guteneo-mcp-private-transfer-20261025` evidence folder. This host result does not
establish an Auth0 source defect or qualify an original-file transport. Resume
through the existing host's normal authentication flow; no broader permission,
new client, credential-store access or replacement shared token is implied.

## Primary host references

These references describe host features, not Guteneo test results. Recheck the
page before changing a callback, eligibility rule or distribution claim.

- Claude: [connectors](https://support.claude.com/en/articles/11176164-use-connectors-to-extend-claude-s-capabilities),
  [code and file creation](https://support.claude.com/en/articles/12111783-create-and-edit-files-with-claude),
  [Claude Code MCP](https://code.claude.com/docs/en/mcp).
- OpenAI: [connection and testing](https://developers.openai.com/plugins/deploy/connect-chatgpt),
  [file bridge APIs](https://developers.openai.com/plugins/reference#capabilities),
  [Codex-host MCP](https://developers.openai.com/codex/mcp/).
  `selectFiles` must be feature-detected; file-library availability varies.
- Cursor: [MCP](https://cursor.com/docs/mcp),
  [cloud-agent capabilities](https://cursor.com/docs/cloud-agent/capabilities).
- Grok: [consumer connectors](https://docs.x.ai/grok/connectors),
  [Build MCP](https://docs.x.ai/build/features/mcp-servers).
- Microsoft/GitHub: [VS Code MCP](https://code.visualstudio.com/docs/agent-customization/mcp-servers),
  [Copilot cloud/code-review limitation](https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/configure-mcp-servers).
- Google: [Gemini CLI](https://geminicli.com/docs/tools/mcp-server/),
  [consumer custom apps](https://support.google.com/gemini/answer/17209137).
- Others: [Perplexity remote connectors](https://www.perplexity.ai/help-center/en/articles/13915507-adding-custom-remote-connectors),
  [Mistral Work MCP](https://docs.mistral.ai/vibe/work/connectors/mcp-connectors),
  [Devin/Cascade MCP](https://docs.devin.ai/desktop/cascade/mcp).

## Qualification record

Use a new synthetic PDF with a random marker and the size appropriate to the
transport being claimed. An App transfer qualification starts above 64 KiB, then
qualifies its 10 MiB boundary separately. Record the source revision,
server release, client product/version, surface, OS, account eligibility, runtime,
time, original size/hash and resulting document ID. Keep confidential evidence
outside the repository; do not log file content, capabilities, signed URLs,
recipients, OAuth codes or tokens.

For each row retain separate results for discovery, consent, authenticated read,
native or private transfer, ready analysis, channel preparation, recovery,
refresh and revocation. Keep unsupported, not tested, failed and passed distinct.
A read-only host check is not an import pass; an import pass is not a real send.
Test unknown-response recovery on the same upload/document, without automatically
resending bytes or creating a second reservation.

No qualification request authorizes a real communication, a paid scan, account
activation, a new expert mandate or directory submission. Directory rules and
publication remain separate from a private custom connector. Report a missing
host capability precisely and continue the supported actions; do not claim that
manual browser upload completed the requested attachment journey.
