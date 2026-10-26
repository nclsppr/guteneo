# MCP Apps capability probe

## Design and activation plan — 26 October 2026

This candidate diagnoses a host's MCP Apps rendering, standard tool bridge,
secure context and file-picker API presence. It does not import, upload, read,
encode or inspect a file, establish conversation-attachment access, prepare a
dispatch or qualify larger-original transfer. Implementation and actual host
observations remain separate.

The [26 October actual Claude Desktop checkpoint](CLAUDE_QUALIFICATION.md#claude-desktop-free-mcp-apps-checkpoint--26-october-2026)
records a real widget, one empty official bridge call and the native chooser
opened then cancelled under source `8854`, server `1.1.5`. The temporary gate
was removed and its rollback recorded. No file was selected, read or transferred;
web, physical iPhone, large payloads and the separate
[App original transport](PRIVATE_DOCUMENT_UPLOAD.md#selected-local-originals-through-mcp-apps--disabled-candidate)
remain unqualified.

The probe is absent by default. A server-owned `MCP_UI_PROBE` setting must
explicitly select one existing OAuth connection and its current authorization
revision, with a canonical UTC start/expiry window of at most one hour. Missing,
malformed, not-yet-active or expired configuration makes both tools and the UI
resource unavailable. Match only the verified authentication snapshot, never a
public shared client ID, user agent or tool argument. Current production OAuth,
membership, token expiry and `documents:read` remain required; no new scope or
grant is added. Recheck authority and activation when serving a resource or
answering a bridge call, including for a cached resource URI.

One presentation-only tool opens a versioned HTML resource; a strict empty-input
bridge tool returns a constant diagnostic acknowledgement. The browser uses the
official MCP Apps `App` client and `callServerTool`, with no handwritten RPC,
direct browser fetch, proxy, health polling or new business endpoint. The
diagnostic retains normal authentication, HTTP rate accounting and successful
connection activity; it has no content, quota, approval, balance, outbox, provider
or document effects.

The UI displays only finite local capability states. A clearly labelled picker
test asks the person to cancel without selecting a file. It may request the
native chooser from a user gesture, but never accesses `input.files`, filenames,
sizes, file bytes, drag/drop data or file encoding. A chooser request or API's
presence is not proof that it opened, returned an original or transferred bytes.
No capability result, host context, private identifier or log is submitted back
to Guteneo. The person records any actual visible result separately.

The resource has no external script/font/image/network dependencies or additional
permissions. Its CSP denies connections, frames and forms. Bundle the standard
SDK into the HTML, use native controls and inherited host tokens, and provide
French, English, German and Luxembourgish diagnostic copy. No upload action or
separate product visual language is introduced.

## Public inert bytes and gated App delivery

The web build emits the self-contained bundle at `/mcp-ui-probe/v1.txt`. This is
a public static asset served as `text/plain`, with `X-Content-Type-Options:
nosniff` and `X-Robots-Tag: noindex, nofollow`; it is not a browser application
entry. Its source contains no connection selection, credentials or private
content. Public access to these inert bytes grants no diagnostic activation,
OAuth authority, document access or tool execution.

Keep the asset in the ordinary release manifest and verify its served bytes and
required headers. Do not exempt it as a private asset, hide it from the release
verifier or deny the unrelated `/mcp` and OAuth routes. The builder records its
exact byte count and SHA-256 in the contracts manifest, and the Vite build checks
that manifest before emitting the text asset. The release source fingerprint
includes the probe sources and builder.

Only the authenticated, selected MCP connection receives the bundle as an App
resource whose `ui://guteneo/mcp-ui-probe/v1/<sha256>.html` URI is recorded in the
manifest. The builder derives it after hashing the completed HTML, so a changed
shell has a changed URI without a circular hash. Only the current manifest URI is
registered; previous resource addresses are unavailable. The callback rechecks current
authority before a fixed `ASSETS` binding read, bounds the fetch and streamed body
under one five-second deadline, cancels on error or timeout, requires
the expected text representation and exact manifest size/SHA-256, then rechecks
authority after the asynchronous read. Only a successful response uses
`text/html;profile=mcp-app`. The binding lookup adds no browser network access,
public URL fetch, proxy, Origin exception or upload grant. A missing, stale or
replaced asset must fail closed rather than return a different application shell.

The self-contained HTML retains seven complete, unchanged runtime notices in a
non-executable text data block. The shared MCP-family notice covers the SDK and
its embedded client/core; separate notices cover Zod, content-type, cfworker and
the Ajv, Diego Perini and schemasafe format-code origins. The copied-code credits
are retained even though they are hidden from the downstream esbuild graph.
`apps/mcp-ui-probe/licenses/provenance.json` pins the official prebundle, upstream
lock and original client source-map evidence, each notice's bytes/SHA, and the
type-only exclusion. Build-time SDK/notice changes fail until that provenance is
reviewed. Preserve the full notice text, including permission/disclaimer clauses;
do not infer the embedded versions from the application's installed peers.

## Implementation and maintenance

| Boundary | Maintained source and evidence |
| --- | --- |
| Activation, current authority, resource integrity and App MIME | `apps/api/src/mcp-ui-probe.ts`; `tests/unit/mcp-ui-probe.test.ts` |
| Default-off tool discovery and strict bridge input | `apps/api/src/mcp.ts`; `scripts/audit-mcp-annotations.ts`; `tests/unit/mcp-annotation-audit.test.ts` |
| Official client, finite states and discarded selection | `apps/mcp-ui-probe/client.ts`; `apps/mcp-ui-probe/locales/index.ts` |
| Reproducible bundle, CSP and integrity manifest | `scripts/build-mcp-ui-probe.mjs`; `packages/contracts/src/mcp-ui-probe-resource.json`; `tests/security/mcp-ui-probe.test.mjs` |
| Vendored runtime notices and copied-code provenance | `apps/mcp-ui-probe/licenses/provenance.json`; unchanged adjacent notices; `tests/security/mcp-ui-probe.test.mjs` |
| Static emission, public/preview response and release coverage | `apps/web/vite.config.ts`; `apps/api/src/public-assets.ts`; `apps/preview/src/index.ts`; `scripts/release-source.mjs`; `scripts/verify-release.mjs` |
| Local SDK bridge, locale/render and request measurements | `tests/browser/mcp-ui-probe.test.mjs` |

Retain negative tests for absent activation, other connections/revisions,
expiry/revocation, unexpected tool arguments and altered resource bytes. A local
SDK host fixture qualifies the implementation contract only. Record its requests,
transferred bytes and first useful content with its environment; it cannot prove
actual Claude rendering, chooser behavior or a physical device. Keep local
measurements and actual-host observations separate from production release proof.
CI executes the four-language SDK fixture once in the first Chromium shard and
retains its report with that required job's evidence; failure blocks the job.

### Local measurement — 26 October 2026

The official `@modelcontextprotocol/ext-apps/app-with-deps` client is pinned at
2.0.3. The complete self-contained resource measures 481,608 bytes, 106,117 bytes
with gzip and 87,885 with Brotli in the local Node build. These are bundle
compression measurements; MCP transport compression is host-dependent. An
isolated Vite build verified the exact emitted resource and found no diagnostic
client or SDK module in any of its 51 ordinary JavaScript chunks.

Four fresh local Chromium contexts at a 430 px viewport, using the official SDK
AppBridge fixture, rendered English, French, German and Luxembourgish without
horizontal overflow or external requests. The heading and enabled bridge control
were observed at 86.5–110.4 ms on the document clock, including test-driver
observation overhead. Each context requested the resource once and made one
empty bridge call. The fixture used a synthetic selection event without creating
or choosing a file; this establishes neither native chooser behavior nor an
actual Claude or physical-device result.

A matched local esbuild comparison against source
`f123868dbc25e6198ee17b45546c7dd7dc935797` measured a 3,999-byte Worker increase
(1,379 bytes with gzip; 994 with Brotli). The Worker includes the official server
helper and small manifest, with no client SDK or HTML literal. This is a local
bundle measurement. Actual workerd startup, CPU, memory and billed requests remain
unqualified; no production performance or cost reduction is claimed.

## Release and actual-host checkpoint

The new SDK dependency and any direct MCP import change require the synchronized
application/plugin release version, reviewed portable instructions, updated MCP
fingerprints and rebuilt downloadable archives before release. Finalize and
review all packaged content before changing the synchronized version and record.
A stale fingerprint is an expected release blocker until
that coordinated step; never refresh it to conceal unfinished contents.

Publication and temporary activation require release-owner authorization. Before
an actual test, the release owner must review the exact source/package and
authorize the narrow connection/window.
Use the existing Claude connection with normal host confirmations, observe the
real device/account, and stop at the diagnostic. Remove the activation setting
afterwards; expiry also closes it. Do not create a connection, widen permissions,
relax Origin or network policy, acquire credentials, select/send file content or
claim a physical-iPhone pass from fixtures.

Official contracts reviewed on 26 October 2026:

- [MCP Apps specification](https://github.com/modelcontextprotocol/ext-apps/blob/main/specification/2026-01-26/apps.mdx).
- [Official App client](https://apps.extensions.modelcontextprotocol.io/api/classes/app.App.html#callServerTool).
- [Anthropic interactive connectors](https://claude.com/resources/articles/interactive-tools-in-claude).

The [compatibility matrix](MCP_CLIENT_COMPATIBILITY.md) owns host status, and
[Claude qualification](CLAUDE_QUALIFICATION.md) owns dated real observations.
