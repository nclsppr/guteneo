# Private original PDF transport

The original-file transports were developed on 25–26 October 2026. Release 1.1.6
at source `147ada069959f69440d4f98f968b0f2f5df1f7ba` is published. Its App remains
off by default: a temporary Claude Desktop window qualified two explicitly
selected fictional originals, including 10 MiB, through exact private storage and
ready analysis. The separate registered-ID handoff to the model failed on that
host and general activation remains pending. The 1.1.8 source follow-up is not
an actual-host retest. [Dated qualification](CLAUDE_QUALIFICATION.md#claude-desktop-selected-original-app--26-october-2026)
owns the observations and limits. No real CV, communication, purchase or mandate
is part of this qualification; no physical-iPhone/web/other-host pass is implied.

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
| MCP `begin_document_upload`                     | Current administrator/supervisor/operator, OAuth connection, `documents:write` | Exact reservation and an upload-only capability                    |
| Binary `PUT /api/document-uploads/{id}/content` | Only that one short capability; no ambient cookie or OAuth bearer                  | Acknowledges receipt; exposes no PDF, password or document ID      |
| MCP `get_document_upload`                       | Same user/client/connection/revision and current `documents:write`                 | Same upload state and sanitized exact document receipt             |
| MCP `import_inline_pdf`                         | Current OAuth writer, explicit original-file permission, original at most 64 KiB   | Same private import pipeline, without runtime HTTP egress          |
| MCP `open_mcp_document_upload`                  | Current OAuth writer and `documents:write`, explicitly active qualification or rollout setting | Opens the optional App; selects or transfers no file itself |
| App-only begin/append/status/finish/cancel tools | Same current writer and activation, explicit device-file selection and import action | Bounded private staging, then the shared exact-original pipeline |
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
inline alternative below when that tool is actually exposed. The separately gated
App journey below is an explicit new device-file selection, not automatic access
to an attachment already in the conversation. If no qualified route is
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

<a id="selected-local-originals-through-mcp-apps--disabled-candidate"></a>

## Selected local originals through MCP Apps

This is a separate transport for a host that renders standard MCP Apps and
carries the reviewed App-only payloads through its official tool bridge. It
does not change `import_inline_pdf`, its 64 KiB bound, the binary endpoint, its
10 MiB bound, or their recovery contracts. Do not split inline calls to emulate
this protocol. No direct browser fetch, new Origin/CSP network permission, proxy,
public PDF URL, OAuth token in the iframe or new infrastructure is introduced.

### Entry, selection and result

The model-visible `open_mcp_document_upload` accepts only `{}`. It opens a
versioned immutable resource and accepts no URL, file ID, content or encoding.
The person explicitly chooses one original through the device's file chooser,
then clicks **Import**. The reviewed App reads that selected `File` once into a
bounded buffer, computes its actual size and full SHA-256 locally, and transfers
those same bytes. Selection alone starts no reservation or upload. A cancelled
chooser reads no file and creates no business state.

The explicit content-exclusion review precedes byte access. It does not classify
the PDF automatically, replace the existing exclusion instructions or prove
allowed content from a clean scan. Backgrounding pauses further transfer; a
person returns through bounded manual status recovery and explicit Resume only
when the same session conclusively allows the next part or finish. There is no
automatic polling or whole-file restart.

This is a **selected local original** journey. A chooser supplies a new selection
from device Files; it does not retrieve an earlier conversation attachment.
Authenticated MCP capabilities expose `documents.originalFilePicker` with
`selection: "explicit_local_original"` and `conversationAttachmentAccess: false`;
the entry requires active server authority and advertises `requiresMcpApps: true`,
which does not qualify the host's actual support.
Names, extracted text and previews cannot establish that the selections have the
same original bytes. Automatic attachment handoff needs a native host contract
or independently matching original byte length/SHA-256 and remains separately
unqualified.

The five transport tools are App-only on a compliant MCP Apps host:

| Tool | Strict input | Effect |
| --- | --- | --- |
| `begin_mcp_document_upload` | `idempotencyKey`, `fileName`, `size`, full `sha256` | Reserve one immutable original and fixed part layout under the current authority snapshot |
| `append_mcp_document_upload` | `uploadId`, `partIndex`, canonical `base64`, part `sha256` | Append one verified fixed-position part; exact confirmed replay retains its receipt |
| `get_mcp_document_upload` | `uploadId` | Read the same session and bounded receipt progress under current authority |
| `finish_mcp_document_upload` | `uploadId` | Claim complete receipts, assemble once, verify the whole original and enter the shared pipeline |
| `cancel_mcp_document_upload` | `uploadId` | Fence the owned unfinished session and make its staging eligible for bounded cleanup |

All five App-only tools declare `destructiveHint: true`: same-key/status
reconciliation can conditionally remove this attempt's exact unregistered
original object. Ordinary `begin_document_upload` also declares that potential
indirect effect. A status label is not a promise of no storage effects. These
annotations add no authority and never permit deletion of a registered or
deduplicated original. App-specific error recovery has `tool: null` and directs
the person to **Check status**/**Resume** in the existing App; it never asks the
model to invoke App-only tools or switch to binary-upload recovery.

Current `documents:write` and an administrator, supervisor or operator membership
are required for every operation; observers are denied. The verified
organization, user, issuer, client, connection and authorization revision come
from authentication, never tool inputs. The existing immutable original metadata,
planned-document identity, role flags, authentication policy and original token
expiry remain bound to the reservation. Refresh can permit a current status
read; it cannot extend the original reservation.

The App-only view contains the session ID, state, expiry, fixed part layout,
confirmed indexes/received byte count, remaining call budget, next action and
optional fixed error code. An accepted finish identifies the registered
creator-private document with a minimal ID/status receipt. It may still be
processing or quarantined. After that registered receipt, the App publishes only
the document ID/status and its bound original size/SHA-256 through the SDK's model
context update. The actual host must qualify delivery of that reference to its
model: 1.1.6's structured-only attempt did not make the two new IDs available in
the observed next turn. The 1.1.8 candidate supplies standard text content as well
as the same structured receipt, with a separate explicit **Use in conversation**
action described below. Import sends no automatic chat message; actual-host
receipt handoff still needs retesting. No bytes, base64, filename, upload capability, OAuth token or recipient
is posted to model context or persisted in browser storage, URLs or logs.
App-only visibility is a protocol requirement, not a guarantee that the host
never retains tool arguments. Actual host visibility, confirmations and privacy
need their own qualification. It is also not cryptographic proof that a native
picker, rather than a same-authority client, supplied the bytes.

### Staging, limits and unknown outcomes

Each part is at most 256 KiB raw; at most 40 cover the unchanged 10 MiB original
limit. Canonical base64 for one full part is 349,528 characters before its JSON
envelope. The existing 2 MiB MCP request, 120,000-element and 180 requests/minute
tenant limits remain unchanged. The App serializes appends and never silently
changes the layout or raises limits to fit a host.

Reservations expire within five minutes and no later than the original token.
Admission allows one active App session per user within the current workspace,
at most 20 pending reservations
per organization and 200 new reservations per organization/day, and at most
200 MiB of reserved staging debt per organization. A session permits at most
64 App calls, including status and replay. Existing content quotas can be more
restrictive. Hashing precedes reservation. Every append, status and finish
rechecks current authority and activation; final registration retains the shared
SQL authority/expiry fence. A part has a ten-second write deadline; assembly
uses the shared thirty-second bound, and the final writer lease remains at most
ninety seconds clipped to the original expiry. Host pauses do not extend them.

The staging ledger stores only tenant-scoped metadata and part receipts in D1;
PDF bytes live in immutable private R2 staging objects. Fixed index, offset,
length, decoded byte count and computed part hash prevent gaps, overlaps and
conflicting replay. Receipt claims precede object writes, with current authority
rechecked across asynchronous boundaries. Exact confirmed replay returns the
existing receipt without another storage/quota write; conflicting bytes are
refused.

A lost append response permits only bounded manual same-ID status recovery.
`receiving` with `nextAction=append_part` conclusively permits the next missing
part; the App enables explicit Resume on the same retained buffer/key/upload.
`unknown` with `APP_PART_UNCONFIRMED` retains volatile bytes only while the fixed
five-minute deadline, current accepted authority and remaining call budget allow.
Only a positive read of the immutable object with matching length/SHA can recover
that state to `receiving`. An absent object never proves that an uncertain put
did not happen and never authorizes replay.

A denial before the R2 put is invoked is conclusively rejected as
`APP_PART_NOT_ACCEPTED`, with storage settled and staging debt eligible for
cleanup. Actually attempted but uncertain writes retain their receipt/key and
debt. Terminal pipeline `APP_UPLOAD_UNCONFIRMED` is status-only: the App clears
bytes and may recover an already registered document, never resume content.
Other stopped outcomes, expiry, explicit cancellation, exhausted budget and
definite MCP refusals also clear bytes. Lost begin replies recover only the same
frozen key/name/size/SHA through the App's Check status control. No automatic
polling, new key, transport switch, whole-file replay or repeated scan resolves
ambiguity. Honor a returned delay or `Retry-After`; a timeout is not failure.

One finalization claim freezes complete receipts, assembles in order and
recomputes full length/SHA-256/PDF magic before invoking the shared original
acceptance path. Quota, creator-private ACL, quarantine, clean scan and isolated
PDF validation apply once to the whole original, not once per part. R2 writes,
D1 receipts, quota, registration and final ledger completion are separate
operations, not a distributed transaction. A committed exact document reconciles
a lost final receipt without another import. An unresolved outcome stays unknown.

A database-wide single App-finalizer lease bounds concurrent App assembly. It
does not bound ordinary binary/inline imports or prove that total isolate memory
fits the Workers limit. The minute scheduler prioritizes expired finalizer leases
within its existing batch, fences the original writer first, then derives the
App state from the current original ledger and releases that logical capacity.
This does not rerun the content pipeline or delete an original.

Cancel, expiry and revocation fence writers before cleanup. Only owned staging
keys may be deleted; a registered or deduplicated original is never staging.
The existing minute scheduler runs this cleanup before identity/provider gates,
handles at most two sessions and 80 parts per tick and retains the references
required to reconcile a late writer. Staging deletion waits until the original
reservation expiry plus ninety seconds, including after capacity recovery.
Unknown missing puts keep their reservation debt and immutable key/tombstone
references; a listing alone cannot establish storage settlement. Cleanup is
eventual when healthy, not an erasure SLA during an outage. Session expiry does
not prove that storage is already purged. Measure oldest staging age and debt;
investigate unresolved objects rather than guessing ownership from a listing.
Proven-settled, absent staging is marked cleaned and excluded from future object
maintenance, while its metadata remains. Only unresolved rows remain eligible
for bounded retry. Partial due-uncleaned and state-leading finalizer indexes avoid
repeatedly scanning settled historical sessions.

### Activation and qualification

`MCP_DOCUMENT_UPLOAD_APP` is absent/off by default. It has two explicit activation
modes:

| Setting | Availability | Qualification boundary |
| --- | --- | --- |
| Strict connection/revision/start/expiry JSON | One existing OAuth connection and its current authorization revision, canonical UTC window of at most one hour | Temporary actual-host qualification; remove it after the test |
| Exact string `enabled` | Current eligible production OAuth writers under all ordinary guards | General rollout only after reviewed source/package, actual qualification and owner-authorized delivery |

Unknown/malformed values fail closed. An absent, early, expired or mismatched
qualification setting hides the opener, App-only tools and resource. General
mode does not bypass production mode, canonical origin, current token expiry,
trusted issuer/connection/revision, membership or `documents:write` checks; it
accepts no development authentication. Recheck activation on discovery, resource
delivery and every transport call, including cached resource URIs. Workshop role,
a shared public client ID, host label or upload input cannot activate either
mode. Removing the setting closes new calls; outstanding staging remains
eligible for fenced cleanup. Release 1.1.6 was published and its selected Desktop
window has closed with the flag absent. General activation is still pending the
model-handoff correction and review; neither a source/package change nor the two
successful private imports activates it for all users. The no-content
[diagnostic probe](MCP_UI_CAPABILITY_PROBE.md) retains only its bounded JSON mode.

If a client does not render MCP Apps, explain that unsupported flow and retain
the ordinary tool-only workflows. A generally enabled opener does not
establish file-picker/payload support, grant access to existing conversation
attachments or qualify every host. The independent host/device evidence below
still applies.

The earlier [1.1.5 diagnostic checkpoint](CLAUDE_QUALIFICATION.md#claude-desktop-free-mcp-apps-checkpoint--26-october-2026)
retains its widget/empty-bridge/chooser-cancellation scope. The later
[1.1.6 Desktop qualification](CLAUDE_QUALIFICATION.md#claude-desktop-selected-original-app--26-october-2026)
separately proves explicit selection/import of 299,807-byte and 10,485,760-byte
originals, independent matching private R2 bytes, creator-private ready/verified
one-page documents and manual same-ID recovery of the latter's registered
receipt without resend. Its 40 parts/42 base calls completed in 258.644 seconds
of App-session elapsed time; the later manual status action corresponds to a
43rd call. The deadline-message cause remains unproven. A scoped SELECT found
zero associated business effects for both originals; that proves neither a send
journey nor global account state.

The next-turn ID-handoff test failed: the model had neither new ID and made no
`get_document` call. Automatic model-context delivery, automatic conversation-
attachment handoff, physical iPhone, web, other hosts, comprehensive host retention
and confirmation behavior, revocation/background recovery and hosted resource/cost
headroom remain separate qualification work. The App is not a completed end-to-end
assistant preparation journey merely because the private document is ready.

For another host or a broader transfer claim, record an explicitly authorized fictional PDF larger
than 64 KiB on the actual intended device/account: independent source size/SHA →
App-computed size/SHA → stored creator-private original with matching size/SHA →
clean/ready analysis. Qualify a requested prepare-only email independently and
verify zero approval, outbox, provider-attempt, sending-quota/credit-reservation
and charge effects. The upload's own reservation/receipt ledger is expected.
Qualify that surface's 10 MiB boundary, cancellation/backgrounding, revocation and
same-ID lost-response recovery on that surface. Neither step authorizes sending,
a paid `validate_pdf`, a mandate, new consent or directory publication.

### Resource and cost maintenance

Reuse the existing Worker, D1, private R2 and minute scheduler. At 40 parts the
base transport uses 42 bridge calls, before common discovery/UI and bounded
recovery, and adds up to 40 staging puts and 40 staging gets before deletion and
the common final document/scanner work. Actual receipt rows, indexed reads/writes,
authorization/activity/rate accounting and cleanup must be measured, not inferred
from SQL statement count. The [authoritative cost assumptions](COSTS.md) own
official rate sources and shared allowances; their dated model is not a current
invoice or a per-upload price. No new tariff or total bill is asserted here.

Measure actual host payload/confirmation counts, first useful content, transferred
code, client peak memory and hashing/transfer latency; server CPU, memory,
startup, active/wall time, billed requests, D1 rows, R2 operations and idle staged
bytes. The 128 MB Workers isolate budget is shared across concurrent requests;
a 10 MiB buffer alone proves no safe finalizer headroom. Retain representative
concurrent ordinary-import checks and admission limits before production
qualification. A local fixture or bundle measurement cannot establish hosted
cost, physical-device latency, host retention or a performance gain.

### Local widget measurements — 26 October 2026

The recorded 1.1.6 local official-SDK fixture and security run contains 18 checks.
That release's self-contained resource is 496,699 bytes, SHA-256
`a6fa81cb6c5955d97284b91f80e2edd7ca3ac5909b67c1cf43f327a29d0f9b16`;
local gzip and Brotli sizes are 111,314 and 92,407 bytes. MCP compression remains
host-dependent. The existing no-content probe remains 481,608 bytes.

Four-language local Chromium contexts observed the enabled control at
84.5–128.3 ms on the document clock, including test-driver overhead. Navigation
Timing reported 496,999 transfer bytes and 496,699 encoded/decoded body bytes.
Fifteen fresh fixture resource loads stayed on loopback with zero external
requests. The synthetic 10 MiB flow used 40 parts/42 App server calls in about
1.709 seconds and matched the original full SHA. Its recovery case selected/read
one file once, kept the same begin/session, observed unresolved part status,
then resumed only after a positive receipt and explicit person action.

These are local SDK-fixture observations, not backend/scanner execution, a native
device picker, actual-host payload/privacy behavior or hosted CPU/memory/billing
qualification. The private `client-local-recovery-handoff.private.json` and
`RECOVERY_HANDOFF.md` under `mcp/app-original-client-local-20261026/` in the dated
evidence folder supersede the earlier widget handoff's measurements and recovery
gap. Source/package/release and actual device transfer remain separate.

### Receipt resilience follow-up — 1.1.8 source candidate

A confirmed registered receipt remains the document's known state after a late
SDK bridge error. The interface preserves its accepted ID and ready or processing
status while disabling unavailable bridge actions. A late transport error cannot
turn an accepted document into an unregistered one or authorize reimport. This
source-found error-handler issue is distinct from B's unproven deadline cause.
The candidate also includes standard text context for the same minimal registered
receipt, alongside its structured fields, to support a host that consumes text
context. After registration, the localized **Use in conversation** control also
lets the person explicitly publish that same four-key JSON receipt through the
official `App.sendMessage`/`ui/message` bridge. Only that UI gesture requests the
message; import/context update never automatically sends one or starts a model
turn. It carries `documentId`, `status`, `size`, `sha256` only, with no filename,
bytes, instructions, approval or sending assertion.

The App marks the ID/status receipt attempted before calling the bridge and
permits one in-flight request. Acknowledgement, refusal or uncertain response
prevents another message attempt for that same receipt state; it never guesses
that a lost acknowledgement means no message was posted. Message/bridge failure
keeps the accepted document and its recovery reference; it creates no import, prepare,
send, paid check or authority change. Causal local SDK fixtures cover late-error
truth, text-consuming hosts and zero messages before the explicit click followed
by one exact receipt, pending/refused/uncertain deduplication and preserved
document truth. The native-host retest must
qualify automatic context delivery and any explicit-message fallback separately.
An acknowledged host message response is protocol evidence, not proof that the
model consumed the document ID; the continuation check must establish that fact.

The frozen 1.1.8 local resource is 498,379 bytes, SHA-256
`e5e9a70116f08145384c4139e46d4530ce1819052be24facd2174d2f65962e57`.
The client source SHA-256 is
`098a7dc7d23d3a7d35883781b8d89bd4afd2425910e16cd30d7aad4e34047c8b`.
Its official-SDK browser run passed 19 subcases/20 Node tests including the parent
in 40.313 seconds; three security checks, affected-file typecheck and lint also
passed locally. The fixtures cover all four languages without overflow, retained
40-part/42-call bounds, text-only context, late errors after quarantined/ready
receipts, zero messages before the explicit action, exact four-key message data,
pending/acknowledged/refused attempt deduplication and preserved receipt truth.
Suite elapsed time is not actual upload latency, first useful content or Workers
CPU/memory proof. These results establish no 1.1.8 deployment or native-host pass. The client/resource
hashes preserve the local UI evidence across reconciliation with the directory
release; the earlier fixture run does not substitute for merged-source CI.
Private `frontend-handoff.private.json` (SHA-256
`5af76e1a39e6396a07676612230051bf8998fc7d2a407386e0b246fabc4cbf1d`)
and `independent-test-receipt.private.json` (SHA-256
`ec77be1e0aca00ea442baa0cf8c0f0b9227234c2a41c688c9bd7700aec01cd18`)
retain this bounded source evidence.

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
OAuth support alone establishes no file transfer. The
[dated Claude qualification](CLAUDE_QUALIFICATION.md#claude-desktop-free-inline-original--26-october-2026)
owns the observed inline result and its limits; it does not qualify native binary
upload or a physical iPhone. The supplied client requires POSIX
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

The dated Claude record also owns the observed runtime network limitation.
Do not infer permitted Guteneo egress from working MCP tools or package-manager
access. Anthropic documents specific-domain configuration for Team/Enterprise
owners; do not assume that setting exists on Free or change network policy
automatically. An original above the inline bound still requires another
permitted and qualified transport.

For a separately authorized binary/inline qualification, use a synthetic PDF with a recorded
random marker, original SHA and size in the real intended client. Attach it there;
request exact private import without
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

Migration `0063_mcp_app_document_uploads.sql` must be applied **before publishing
the new application code**, even while `MCP_DOCUMENT_UPLOAD_APP` is absent.
The existing minute cron calls the new cleanup unconditionally so revoking the
App flag cannot retain abandoned staging. The migration is additive: existing
private uploads default to `transport='binary'`, preserving binary/inline
compatibility. A missing schema makes that scheduled invocation fail before later
maintenance; an off flag is not a schema guard. Recover by applying and verifying
the reviewed migration, or rolling code back to its compatible version until the
migration can be applied. Do not bypass cleanup, activate the App or widen
authority to hide the failure. Migration and publication retain their existing
authorization requirements.

The App transport uses shared metadata in
`packages/contracts/src/private-document-upload.ts`, strict App schemas in
`packages/contracts/src/mcp-app-upload.ts`, shared bounds in
`packages/contracts/src/mcp-app-upload-limits.ts`, `apps/api/src/mcp-app-upload.ts` and
the resource/authority adapter `apps/api/src/mcp-document-upload.ts`. The frontend
is authored in `apps/mcp-document-upload/`; build it with
`scripts/build-mcp-document-upload.mjs`. Its descriptor is
`packages/contracts/src/mcp-document-upload-resource.json`, inert asset
`/mcp-document-upload/v1.txt`, and immutable `ui://` address derived from the
completed resource digest. Preserve exact served bytes and the authenticated
resource's App MIME/integrity/current-authority boundary. The existing binary
helper and 0061 ledger remain supported; do not edit generated clients or
resource descriptors independently.

Focused backend source evidence covers the 40 existing binary/inline cases,
24 App integration cases and six contract cases in
`tests/integration/private-document-upload.test.ts`,
`tests/integration/mcp-app-document-upload.test.ts` and
`tests/unit/mcp-app-upload-contracts.test.ts`. The App gate/resource tests are in
`tests/unit/mcp-app-upload.test.ts`; the client/security fixtures are in
`tests/browser/mcp-document-upload.test.mjs` and
`tests/security/mcp-document-upload.test.mjs`. Keep these with
`packages/contracts/src/assistant-recovery.ts`, the annotation audit and the
shared `mcp-app-activation.ts`/`mcp-app-resource.ts` helpers. The recorded local
70 backend assertions and 18 Node client/security checks do not establish exact
CI, production migration/activation, real scanner runtime or actual host transfer.

MCP Apps protocol references checked 26 October 2026: the
[stable extension specification](https://raw.githubusercontent.com/modelcontextprotocol/ext-apps/main/specification/2026-01-26/apps.mdx)
defines App-only visibility and host-mediated communication; the
[official App client](https://apps.extensions.modelcontextprotocol.io/api/classes/app.App.html#callServerTool)
provides `callServerTool`. Neither establishes a particular host's payload size,
retention, confirmation count, device-file behavior or existing-attachment access.

Primary references checked 25 October 2026:

- [Claude files and mobile computing](https://support.claude.com/en/articles/12111783-create-and-edit-files-with-claude).
- [Claude connectors including mobile](https://support.claude.com/en/articles/11176164-use-connectors-to-extend-claude-s-capabilities).
- [Remote versus desktop connectors](https://support.claude.com/en/articles/11725091-when-to-use-desktop-and-web-connectors).
- [Claude API code execution](https://platform.claude.com/docs/en/agents-and-tools/tool-use/code-execution-tool), [tool reference](https://platform.claude.com/docs/en/agents-and-tools/tool-use/tool-reference), [Files API](https://platform.claude.com/docs/en/build-with-claude/files).
- [MCP tools](https://modelcontextprotocol.io/specification/2026-07-28/server/tools), [resources](https://modelcontextprotocol.io/specification/2026-07-28/server/resources), [roots](https://modelcontextprotocol.io/specification/2026-07-28/client/roots).
- [Anthropic directory policy](https://support.claude.com/en/articles/13145358-anthropic-software-directory-policy).
