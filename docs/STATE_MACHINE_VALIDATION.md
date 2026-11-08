# State-machine local qualification — 8 November 2026

The [execution ledger](STATE_MACHINE_EXECUTION.md) distinguishes integrated
transition models and fences from retained existing controllers. This note records
the local backend, client, public preview and curated engineering checks. It does not
establish hosted CI, deployment, provider communication or physical native-device
qualification.

## Backend, schema and integration gates

The runtime and schema were independently reviewed and frozen after the complete
eligible deletion path, upload/source authority races, transaction expiry,
storage debt, lease ownership and simultaneous-administrator cases passed.
The deletion suite passes 18/18 using real migrated local D1/R2 and synthetic
processors, including actual workerd redirect handling. The dead-letter suite
passes 17/17, including real Hono browser cookie/CSRF, MCP/native refusal and
paired effects when authority expires inside a batch. Private operator CLI
security passes 2/2. None invokes a real send or real external erasure.

The first complete Vitest attempt exposed five fixture incompatibilities with
the new guards/dependencies and three untranslated server messages. It finished
with 195 passing and six failing files: 3,817 passed, 59 failed and 68 skipped
assertions. Because Vitest failed, that command did not run its security stage.
Its failed stdout remains preserved; these figures are not final qualification.

Corrections are confined to disposable fixture reset/upgrade sequencing and
three French/German/Luxembourgish catalog entries. The fixture resets atomically
restore the exact production guards; a real D1 regression verifies restoration
and subsequent last-administrator refusal. Focused corrected runs pass 96/96
and 32/32, sharing the same one restoration test; they are not added as a
deduplicated total. All four automatic server-message translation cases pass.
The fresh complete Vitest stage passes all 202 files and 3,945 tests, with no
skips. Its security stage exposed two stale test fixtures: the old 77-route
inventory omitted the new browser-only operation, and an inspection-only bundle
mock omitted the new unrelated service export. Only those two security test
files changed. Exact route inventory, browser/CSRF/same-origin/no-OAuth checks and
the inspection entrypoint's absence of deletion methods remain enforced.

The complete Node security rerun passes 696/696, with zero skips. This is a
composition of green complete stages, not a claim that the earlier combined
command exited successfully. Reconstructing the two prior security fixtures
exactly reproduces the captured test-input snapshot; the unit/integration inputs
and final runtime remain unchanged. See the
[backend and schema evidence](evidence/state-machine-backend-2026-11-08.json).

An independent offline replay of all 77 canonical migrations produces 139
application tables, 21 views and 321 triggers with no foreign-key violations on
SQLite 3.54.0. This is schema-replay evidence, separate from the actual D1
service/concurrency cases and from production physical integrity.

Root lint passes with all 208 web sources owned; typecheck, web/archive build
and Worker dry-run pass. The synchronized candidate remains 1.1.33. Its MCP
catalogue audit passes for 83 tools, all 332 explicit annotation booleans and 258
source-evidence references; no MCP tool or permission is added. The 24-file
portable archive includes its hidden compatibility manifests and has SHA-256
`579b5da274b2354f1718b0ba5f57f72273af6de614bf64bc59d3cf8148a3a91c`.
Archive checks establish package/source consistency, not host or directory
approval. The final application/API/schema/package source fingerprint is
`f7731f69962e64c640c9d436e614c0ae0d44fe98971d37bcb3524f35cb2df550`.
It is a source digest, not a deployment or clean-main proof.

## Client workflows

The client recovery changes passed 53 focused unit cases. Browser checks cover
postal and secure write uncertainty, status-read recovery, source-copy receipts,
current identity and accepted-route invalidation, dirty-navigation vetoes, partial
Studio adoption, and delayed A → B → A continuations. The final postal approval
and confirmation suite passed 27 cases across desktop Chromium, Pixel 7 Chromium
and iPhone WebKit. The real local Worker/D1/renderer Studio suites passed 43 cases
with two declared mobile exclusions for desktop graphical editing. Earlier focused
runs and their exact scopes are retained in the evidence rather than added as a
single deduplicated test total.

See [client evidence](evidence/client-workflows-2026-11-08.json),
[Studio evidence](evidence/studio-client-workflows-2026-11-08.json) and the bounded
[frontend performance measurements](FRONTEND_PERFORMANCE.md).

## Application runtime and translation delta

The complete standard application E2E run passed 1,148 cases with 19 reviewed
viewport exclusions and no failures, flakes or retries in 23 minutes 45.129
seconds. All 1,167 executed stable IDs match the independent test discovery.
Desktop Chromium passed 386 with three exclusions; Pixel 7 Chromium and iPhone
WebKit each passed 381 with eight exclusions. The run used the seeded local
Worker/D1/renderer and its declared intercepted fixtures. Its 239 compiled web
assets and E2E source/config/fixtures stayed unchanged throughout the run.

The only application source change during the run was three reviewed
French/German/Luxembourgish catalog rows; the running compiled assets stayed fixed.
Independent reconstruction reproduces the original source fingerprint exactly
in both preview scope and the complete live-profile scope including migrations;
the API, runtime and SQL are unchanged. The final catalog source passes the full
typecheck, web/archive build and Worker dry-run. Its four automatic translation
cases pass, and the rebuilt browser candidate passes 27 translated-error cases,
102 affected locale/Administration cases and nine existing measurement cases,
all across the three profiles with no skips or failures.

The temporary error-envelope checks preserve existing display precedence:
account-deletion fallback displays the new translated message, while
`INVALID_INPUT` and `FORBIDDEN` retain their generic localized code labels.
They also verify deliberate incident confirmation and refusal of dependent
dispatch writes. These intercepted checks do not execute Auth0 deletion or a
real incident operation. See [complete application evidence](evidence/state-machine-full-application-2026-11-08.json),
[translation delta evidence](evidence/state-machine-locale-delta-2026-11-08.json)
and the final client performance evidence above.

## Public preview

The final preview build passed all 295 browser cases with five reviewed desktop
exclusions and no failures, flakes or global errors in 106.003 seconds. All 340
disk asset entries and the source fingerprint match the final manifest. Desktop
Chromium and iPhone WebKit qualify the fictional browser-only preview described
in [PUBLIC_PREVIEW.md](PUBLIC_PREVIEW.md), with no business backend or real sending.

An earlier attempt passed 290 with five reviewed exclusions and five desktop
failures caused by empty HTTP 500 document responses. The concurrent security test
`preview-release-assets.test.mjs` rebuilt the actual `dist/preview` and `dist/web`
directories while the browser server was reading them. The failed report and
traces are preserved. After security finished, the local application build was
restored and all 239 assets matched the already-qualified catalog build exactly;
the complete preview retry then passed under exclusive build-output ownership.

See [preview evidence](evidence/state-machine-preview-2026-11-08.json).

## Curated engineering site

After the final feature registry update, documentation generation and checks
passed for 28 domains, 464 features, 46 journeys, 78 REST operations and 83 MCP
tools. The engineering checks reported zero errors, zero warnings and four hints;
29 authored MDX pages were lint clean and all four security cases passed.
The guarded build produced 418 static assets.

The existing engineering browser suite passed 30 cases across Chromium and
WebKit. Six additional guide checks covered 320, 390 and 1440 pixel widths in
both engines, with no horizontal overflow or page errors. The new guide remained
searchable, its 20 internal links returned 200, and its Markdown, MDX and LLM index
exports were present. The final desktop and mobile screenshots were inspected.
The same six viewport/engine checks verify the testing guide's explicit
transition-contract wording and shared-output serialization instruction.
An initial server startup collided with an existing local SQLite persistence
lock before tests ran; the successful runs reused one static server.

After the final testing-guide corrections, the guarded build and all 36 browser
checks passed again. All 418 disk asset entries and hashes match the built
manifest and current source snapshot. The local served manifest and twelve
representative page, index and image assets match their disk bytes; a missing
route returns 404. Final hashes are:

| Artifact | SHA-256 |
| --- | --- |
| Engineering source snapshot | `785649e59a9f6b769a67ae56d5678d3773b8da4b3ba62a9f2204a898fb3ea23c` |
| Complete asset manifest | `6a4ce34f3eb2226e123623fd785a02fcc6cec9d3c7775a72fac755b833f31d99` |
| `release.json` bytes | `e309ce9ed8b4debeb2efcf566c5955c61216a6f697ef1474f479a6fb7d7eb08e` |

See [engineering evidence](evidence/state-machine-engineering-2026-11-08.json).
The manifest records a dirty working tree at base commit
`e0df725a2d791ef9a629d7ea91f11674d4138575`; this is a locally reviewed candidate,
not a clean published release.
