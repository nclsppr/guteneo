# Private original PDF transport

25 October 2026 candidate. Source tests do not establish deployment, migration,
OAuth renewal, transfer from an actual assistant, or customer delivery. No real
CV, recipient, communication, purchase or mandate is part of this qualification.

## One original, bounded transport choices

`import_document` retains its existing direct HTTPS/OpenAI file-envelope contract.
It is suitable only when the host actually supplies an accessible exact-file URL;
a local path, extracted text or private attachment ID is not such a URL. Do not
publish a private PDF to manufacture a source link or regenerate its contents.

The additive private transport reserves an exact original through MCP, then
accepts its unchanged binary bytes at a fixed Guteneo endpoint. The content is
never publicly readable. It uses the existing `documents:write` scope, membership,
document quota, private R2 storage, quarantine, exact scan and isolated validation.
The new original is creator-private under the existing document ACL. Reviewers
access a later prepared request only through its existing exact-dispatch policy.

| Surface                                         | Actor and authority                                                                | Result                                                             |
| ----------------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| MCP `begin_document_upload`                     | Authenticated member/supervisor/admin, current OAuth connection, `documents:write` | Exact reservation and an upload-only capability                    |
| Binary `PUT /api/document-uploads/{id}/content` | Only that one short capability; no ambient cookie or OAuth bearer                  | Acknowledges receipt; exposes no PDF, password or document ID      |
| MCP `get_document_upload`                       | Same user/client/connection/revision and current `documents:write`                 | Same upload state and sanitized exact document receipt             |
| MCP `import_inline_pdf`                         | Current OAuth writer, explicit original-file permission, original at most 64 KiB   | Same private import pipeline, without runtime HTTP egress          |
| Browser/native REST upload                      | Existing authentication and browser CSRF where applicable                          | Existing multipart `/api/documents` contract, unchanged            |
| Prepare/review/send                             | Existing channel, scan, quote and human/delegated authority                        | Unchanged; possession of an upload capability grants none of these |

## Assistant journey

1. The user explicitly selects an allowed original PDF in the actual host. Its
   computing environment must have those bytes as a file and permission to send
   them privately to `guteneo.com`. Reading its extracted text is insufficient.
   Respect content exclusions, host confirmations and egress policy. Never inspect
   credential stores or request the user's OAuth tokens.
2. Compute the original byte length and SHA-256 using code. Call
   `begin_document_upload` with a stable `idempotencyKey`, safe PDF `fileName`,
   `size` and lowercase `sha256`. All fields are strict; tenant, destination,
   headers and business authority cannot be supplied as inputs.
3. For a reserved import, the result contains `upload.method`, fixed `url`,
   `capabilityHeader`, `capability` and `client`. The client is reviewed Python 3
   standard-library source with its SHA-256, supplied by the MCP response itself;
   no package install or external script fetch is needed. Write exactly that
   source in the host's computing environment and verify its digest. Use it there,
   including for an iPhone conversation's cloud computing environment, rather
   than attempting to install a local extension on the phone.
4. The same source is packaged at `scripts/upload-private-pdf.py`. Its explicit
   commands are `python3 upload-private-pdf.py inspect /allowed/folder file.pdf`
   and `python3 upload-private-pdf.py upload /allowed/folder file.pdf`. Supply
   the reservation JSON only on standard input to upload. Never display the
   capability or place it in a command argument, public link or log. The helper
   checks the allowed folder, regular file, no links/path escape, stable file,
   PDF magic and size; its PUT sends unchanged bytes, without cookies,
   Authorization, Origin, redirects or automatic retries. Normal host proxy and
   network controls remain in force. This helper does not acquire OAuth itself.
5. A 202 response acknowledges binary receipt, without proving readiness. Call
   `get_document_upload` with the same ID. Compare the receipt's SHA-256 and size
   to the original. Use its returned document ID across channels; continue the
   existing `analysis` recovery on that same stored PDF. Only ready permits
   preparation. Do not reconstruct an original from pages/text or import again
   to accelerate verification.

If the runtime holds the original but cannot reach Guteneo, use the bounded
inline alternative below when that tool is actually exposed. If neither route is
available, report the specific missing capability. A source patch, listed tool,
computing screenshot or successful web test does not qualify that host. An
explicitly chosen authenticated browser upload remains a separate journey, not
completion of the attached-file feature.

## Small originals when runtime egress is unavailable

`import_inline_pdf` accepts one original of 20–65,536 bytes through the existing
authenticated MCP channel. The runtime computes the actual filename, size and
SHA-256 and encodes those unchanged bytes as canonical standard base64. Supply
that data with a stable idempotency key in one tool invocation. This is a narrow
fallback; preserve a native file envelope or permitted binary transfer when
available. It adds no public URL or network-policy exception.

The server validates encoding, size and hash before creating a reservation. It
then reserves and consumes the same 0061 import internally using the current
OAuth identity and existing claim, SQL expiry/authority fences, quota, quarantine,
scanner and creator-private document policy. It makes no HTTP request to itself
and returns neither upload capability nor original bytes. The reservation clock
starts after the encoded argument arrives, rather than while the host prepares
it. No scope, migration, approval, provider or charge is added.

Encoding increases tool/context size, and the host processes the original in its
tool arguments. Keep explicit file permission and content exclusions. Do not echo
the encoded data in narrative, log it, split it into tool calls, raise the limit,
silently truncate it or reconstruct a PDF from extracted text. A truncated or
changed payload fails its exact size/hash check. Files over 64 KiB require another
qualified original-byte transport; the 10 MiB binary bound does not apply here.

Follow `get_document_upload` on the returned upload ID after any ambiguity or
processing response. Keep the same idempotency key and document; never submit
another encoded import or scan to resolve an uncertain outcome. A completed
same-key receipt is recovery, not another import. Only `ready` allows preparation.
If the lost MCP response contained no upload ID, call `begin_document_upload`
with exactly the same key and metadata to recover it, then read that ID. This
metadata recovery does not authorize a second encoded import or a new key.

## Bounds, atomicity and recovery

The binary original is 20 bytes–10 MiB and at most 100 pages after isolated validation.
MCP JSON stays bounded to 2 MiB. Inline original bytes have the separate 64 KiB
limit above; the binary route adds no base64 or arbitrary source headers.
A production upload destination is exactly `https://guteneo.com`;
the server cannot accept a model-selected host, query, fragment or redirect.

The random 256-bit capability is only stored as a hash. It expires within five
minutes and no later than its authenticating OAuth token. Its immutable ledger
binds organization, user, canonical connection, authorization revision, verified
token issuer, role flags, authentication policy, original name/hash/size and one
planned document. No access/refresh token or general signing secret is stored.
Current membership, issuer trust and connection revision are rechecked around
awaits and in the document-registration SQL fence. A capability is neither
browser authentication nor send consent; the ordinary browser CSRF boundary is
unchanged. Cookie, Authorization, Origin and Content-Encoding on this route are
refused before consuming original bytes.

One conditional claim consumes the capability before stream reads, quota,
storage or scanning. The body deadline is at most 30 seconds, clipped to expiry;
the finalization lease is at most 90 seconds, also clipped to expiry. All final
SQL authority checks compare these deadlines against D1's clock at statement
execution; JavaScript checks only reject expired requests early. Hash/size and
PDF magic are checked before the existing document pipeline. The claim prevents
concurrent requests from reserving quota or scanning twice. Reservation metadata
is separately bounded to 20 active and 200 new reservations per organization/day;
the existing content quota still independently controls actual imports.

Repeating a reservation with its same key and exact fields returns the same ID.
Before any binary attempt, it may replace the unused capability without extending
the original deadline; a stale capability then fails. It never resets a started,
rejected or unknown attempt. `get_document_upload` reveals no capability.

| State       | Required action                                                                                                  |
| ----------- | ---------------------------------------------------------------------------------------------------------------- |
| `reserved`  | Transfer those exact bytes once while the grant is valid                                                         |
| `uploading` | Wait the returned delay, then read the same upload                                                               |
| `complete`  | Use the exact document receipt; it may still be quarantined                                                      |
| `rejected`  | Stop; report the refusal instead of silently creating another key                                                |
| `unknown`   | Read the same ID to reconcile a committed exact creator-owned document; never automatically upload or scan again |

An expired writer is fenced before recovery. A committed exact document resolves
a lost receipt without another import. An unregistered uncertain attempt remains
unknown, and recovery may delete only its exact unreferenced owned object, never
a deduplicated document. No provider communication is retried. An operator may
investigate unresolved imports; the client must not infer failure from a timeout.

## Protected email and authority

After this PDF is ready, existing `prepare_dispatch` can use
`channel=email`, `options.emailDeliveryMode=protected_link`, duration 1/7/30 days,
the actual requested recipient/message and exact ceiling. Approval binds those
values and the immutable original. The generated password stays exclusively in
the sender's authenticated browser through `passwordAccessUrl`; never read or
paste it into MCP, a tool trace or the same email. Preparation starts no provider
send or hosting activation/charge. Sending still requires the standard recorded
browser approval, or a previously granted bounded mandate for that exact
connection and channel where supported. The assistant cannot enable a mandate,
assert consent, buy credit or activate a channel.

## Host matrix and qualification

The server contract is host neutral. The authoritative [client compatibility
matrix](MCP_CLIENT_COMPATIBILITY.md) separates Claude iPhone/web, ChatGPT
iPhone/web, Cursor, Grok consumer/Build/API and other clients, including native
file envelopes, computing/filesystem access, network policy and actual evidence.
OAuth support alone establishes no file transfer. No new private-bridge or
physical-iPhone pass is claimed here. The supplied client requires POSIX
Python 3.9+ on Linux/macOS; it deliberately refuses native Windows before reading
or transferring data. The binary server contract can be consumed by another
properly qualified runtime without changing the endpoint, capability or guards.

Claude's official mobile help explicitly includes code execution/file creation on
iOS. It does not prove that a particular attached PDF is mounted as exact bytes,
that a specific account can reach Guteneo, or that its tool will be invoked
correctly. API code execution differs: no outbound internet, and `mcp_toolset`
does not support programmatic `allowed_callers`. API Files IDs belong to their
own workspace and uploaded inputs are not generally downloadable. MCP resources
are server-to-client; roots describe paths, do not transfer bytes and are
deprecated for new implementations. No file URI grants a remote Worker access
to an iPhone, conversation container or local disk.

On 25 October a real Claude Desktop Free conversation exposed the authorized
synthetic original with matching 1,268-byte size and SHA-256. A subsequent public
GET from that runtime failed name resolution before any HTTP response. Its
Capabilities screen showed network egress enabled for common package managers
and no custom-domain field. This is separate from its successful MCP capability
read. The failed request alone does not establish its underlying cause.
Anthropic documents specific-domain configuration for Team/Enterprise owners;
do not assume that setting exists on Free or change network policy automatically.
The inline candidate still requires an actual transfer/readiness trace before
claiming a successful original import, and physical iPhone proof remains separate.

Use a new synthetic PDF with a recorded random marker, original SHA and size in
the real intended client. Attach it there; request exact private import without
reconstruction, public URL or manual Guteneo upload. Retain the actual host/tool
trace for the actual transport (permitted binary PUT or bounded inline MCP
invocation), matching stored bytes, the same document ID through analysis and
exact ready scan proof. Do not invent an external PUT for an inline import.
Qualify protected-email preparation with a
synthetic recipient separately, without queueing, charging or sending. Repeat
this evidence separately for each claimed host, including a physical iPhone.

Anthropic's current directory policy section 1.G restricts extraction of uploaded
Claude files for software included in its directory. This private custom-connector
candidate establishes no directory eligibility, submission or approval; obtain
a concrete eligibility answer before publishing such a claim there.

## Source and maintenance

Migration 0061 is additive and requires ordinary reviewed deployment/migration
authorization. The ledger adds no provider, paid infrastructure, OAuth scope,
mandate or server secret. Keep the canonical helper at
`integrations/guteneo/scripts/upload-private-pdf.py`; after edits run
`node scripts/build-private-upload-client.mjs` and
`node integrations/sync-claude-workflows.mjs`. Tests enforce identical MCP and
package client bytes. Do not hand-edit the JSON projection or Claude copy.

Relevant source: `apps/api/src/document-upload.ts`, `mcp.ts`, `index.ts`,
`documents.ts`, and `migrations/0061_private_document_uploads.sql`. Focused tests:
`tests/integration/private-document-upload.test.ts`,
`tests/unit/private-document-upload-mcp.test.ts`, and
`tests/security/private-pdf-client.test.mjs`. These are deterministic local
server/protocol/client tests, not host, antivirus-runtime, provider or send proof.

Primary references checked 25 October 2026:

- [Claude files and mobile computing](https://support.claude.com/en/articles/12111783-create-and-edit-files-with-claude).
- [Claude connectors including mobile](https://support.claude.com/en/articles/11176164-use-connectors-to-extend-claude-s-capabilities).
- [Remote versus desktop connectors](https://support.claude.com/en/articles/11725091-when-to-use-desktop-and-web-connectors).
- [Claude API code execution](https://platform.claude.com/docs/en/agents-and-tools/tool-use/code-execution-tool), [tool reference](https://platform.claude.com/docs/en/agents-and-tools/tool-use/tool-reference), [Files API](https://platform.claude.com/docs/en/build-with-claude/files).
- [MCP tools](https://modelcontextprotocol.io/specification/2026-07-28/server/tools), [resources](https://modelcontextprotocol.io/specification/2026-07-28/server/resources), [roots](https://modelcontextprotocol.io/specification/2026-07-28/client/roots).
- [Anthropic directory policy](https://support.claude.com/en/articles/13145358-anthropic-software-directory-policy).
