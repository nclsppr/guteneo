# Private postal checking service

17 September 2026 state: the private Worker was deployed and remotely qualified
with synthetic PDFs only. API/MCP integration was published in `813dd717`, with
D1 migration 0020 and successful integrity/schema checks; see [release proof](LIVE_RELEASE.md).
[Postal review](POSTAL_REVIEW.md) owns server authority and separate upload consent;
[Pingen preflight](PINGEN_PREFLIGHT.md) owns layout rules. No Pingen transfer was
used to qualify the renderer.

## Internal contract

`apps/documents` retains `/validate` and `/render` and adds only
`POST /preflight/pingen` through service binding. No public domain, `workers.dev`
or version-preview URL is enabled. Body is the unchanged original PDF with
`Content-Type:application/pdf`. Internal headers:

- `X-Guteneo-Source-Sha256`: immutable private-storage document hash.
- `X-Guteneo-Scan-Sha256`: the same hash after the caller checks qualified scan proof.
- `X-Guteneo-Pingen-Options`: strict `PingenPreflightOptions` JSON (`defaultCountry`, `country`, `addressPosition`, `printMode`, `printSpectrum`, `deliveryProduct`); provider qualification supplies account profile, never browser input.

Headers are trusted-caller assertions, never copied from public requests. The
renderer has no D1/R2 access to verify scan or tenant itself. It hashes received
bytes and again hashes bytes actually opened in PDF.js. `PingenPreflightResult`
is extended by:

```ts
rendering: {
  dpi: 144;
  complete: boolean;
  pages: Array<{ page: number; width: number; height: number; rasterSha256: string }>;
};
address: null | {
  items: Array<{
    text: string;
    boundsMm: { x: number; y: number; width: number; height: number };
    baselineMm: number;
    fontSizePt: number;
    geometry: "approximate";
  }>;
  lines: string[];
  issues: string[];
  textVisibility: "not_verified";
  crop: {
    pngBase64: string;
    width: number;
    height: number;
    boundsMm: { x: number; y: number; width: number; height: number };
  };
};
```

PNG includes window and reserved postage area. Coordinates are top-left millimeters;
text bounds use font metrics, not certified glyph outlines. Lines are reconstructed
without case/country/postal-code correction. Syntax applies to those lines;
LU/DE/domestic-FR additions are versioned `pingen-2026-09-17-v2`. Full typography
and actual visibility are not automatically verified. Historical evidence below
is v1, not a v2-deployment claim: migrate 0026, then publish/qualify the same renderer
and app version.

Address-bearing text/PNG is private, `Cache-Control:no-store`, unlogged. Full rasters
and PDF bytes are not returned; their hashes prove local rendering, not provider
acceptance. Failures may add `diagnostic:{stage}` from a closed stage list: reading,
structure, budget, launch, isolation, scripts, open, rendering, raster, address.
Open substages identify only missing engine capabilities. No exception, stack,
content, URL or user-agent is returned.

## Isolation and bounds

- Streamed body at most **8,000,000 bytes**, regardless of missing/false Content-Length; options 512 characters; existing 100-page bound.
- Before Chromium: A4, no unexpected rotation/crop, embedded fonts, no active features/forms/annotations. Private policy also rejects optional layers and declared images over ten million pixels each/twenty million total.
- One browser per request, no session reuse. A synthetic HTTPS shell is served by local interception for WebCrypto; all other network aborts. Offline mode, service-worker bypass and CSP forbid external connection/workers; no CDN libraries.
- Locked official `pdfjs-dist/legacy/build` parser/render bundles are packaged in the Worker. The same publisher's compatibility build supplies missing `Map.prototype.getOrInsertComputed` used by modern PDF.js in the qualified Browser Run browser. PDFs remain data; no PDF JavaScript executes. No `unsafe-eval`, font/CMap/WASM downloads; parsing stays inside the isolated page.
- **Every page sequentially at 144 dpi**, opaque white, at most 2.1 million canvas pixels. One raster at a time, Worker decoding avoids huge intermediate JS arrays; release canvas after each page. Large images, incomplete decoding and PDF.js warnings block.
- Whole-request **25-second** budget plus at most two seconds to close. Expiry closes the browser, including late launch. Interrupted work never marks complete. Browser Run limits add protection; these bounds do not prove maximum memory for every hostile PDF.
- Page-1 text: at most 20,000 items/128,000 characters; window 200 items/1,000 characters each; PNG base64 at most one million characters.

Always `canSend:false`. A clean report is `review_required`, never ready/send
authority. Ink/extracted text alone cannot prove the visible recipient matches:
invisible text, outlines, images and overlays still need visual comparison.
Unextractable addresses block under this conservative profile even if Pingen
might accept them.

## Application integration

`apps/api/src/postal.ts`, `postal-authority.ts`, browser/MCP routes and migration
0020 check current authority, tenant, ready/unpurged document, canonical qualified
scan audit for the same hash, exact R2 bytes, atomic render budget and qualified
Pingen profile before calling. The Worker never replaces API business guards.

Afterwards, server authority/document identity, all pages and extracted-recipient
match are rechecked and immutable evidence stored. Exact-original visual review
and sender/returns review remain mandatory. Browser consent or separately recorded
administrator-granted postal delegation authorizes upload without sending; MCP
creates neither human consent nor a mandate. Public output retains
`textVisibility:"not_verified"` and browser-session-only PNG access, without MCP
embedded image. Evidence, provider draft, exact quote and final approval remain
separate. [Postal review](POSTAL_REVIEW.md) owns detailed integration; renderer-only
deployment activates none of those routes/capabilities.

## Build and evidence

From repository root:
`npx wrangler deploy --config apps/documents/wrangler.live.jsonc --dry-run --outdir dist/worker`.
The custom build copies two compatibility scripts from `node_modules` to ignored
`apps/documents/dist/pdfjs`; no new package/secret. Only **guteneo-documents** was
published to install this contract, without activating application sending.

Focused local run:
`npx vitest run tests/unit/document-postal-preflight.test.ts tests/integration/document-postal-preflight.test.ts`:
**27 passed**, including 12 real-Chromium cases. Exact bytes, every page, forbidden
page-2 corner, empty window, oversized image, page-2 failure, decode warnings,
timeout, false Content-Length, blocked network, content-free diagnostics and
missing-Map-API rendering are covered. Focused lint/typecheck passed. **12**
`tests/security/postal-preflight-qualification.test.mjs` checks add output filtering,
required exact scan, redirect refusal, deadlines, cleanup and cold start.

`node scripts/qualify-postal-preflight.mjs` accepts no argument/user file. Its
configuration exposes only private SCANNER/DOCUMENT_RENDERER bindings, no Pingen,
D1 or R2. It creates two fixed synthetic PDFs, requires qualified byte-exact scan,
then tests false hash assertion and truncated PDF. At most three readiness checks,
30 seconds apart after startup 503; no PDF before ready. Each request: 30 seconds;
CLI: 600 seconds. Output excludes addresses, crops, hashes and free diagnostics.

Remote diagnosis observed ClamAV ready after 31 seconds and modern PDF.js
`open_map_insert` incompatibility. Containers SDK resets idle timing on every
request including 503; no production scanner/sleep setting was changed.

Compatibility correction was deployed as **guteneo-documents** version
**b551ef12-dba0-4845-b664-b2715fe10d3d**, based on
**b349c19b23eda30518ae36a9f9e372fb89c0da68** plus renderer changes still uncommitted
at that publication. Final 17 September qualification returned **`passed:true`,
4/4 cases**, two readiness checks, three clean scans and four renderer calls,
**zero Pingen calls and zero D1/R2 writes**, always `canSend:false`.

| Remote case | Observed result |
| --- | --- |
| Valid synthetic two-page PDF | HTTP 200, `review_required`, complete 1190 × 1684 pages at 144 dpi, raster hashes, fixture-matching address, PNG crop, human review still required |
| Forbidden page-2 corner content | HTTP 200, `blocked`, both pages complete, page-2 `POSTAL_CORNER_CONTENT` |
| Wrong source hash assertion | HTTP 200, `blocked`, `POSTAL_RENDER_HASH_MISMATCH`, no rendered page |
| Truncated PDF | HTTP 200, `blocked`, `POSTAL_PDF_INVALID`, no hash or rendered page |

Exact publication source/asset SHA-256 values (PDF.js **6.3.289**, same locked
version before/after correction):

| File | SHA-256 |
| --- | --- |
| `apps/documents/prepare-assets.mjs` | `ccb9929a1159002bf3fb793df5321f5e8b07de3a1351ad81eca933e4d55f12c4` |
| `apps/documents/src/pingen-preflight.ts` | `6efa6634bbc37dccf0952245cd39ffe2995a38753846c1a9428b8606f59e6fe6` |
| `apps/documents/src/pingen-browser.ts` | `eed5b93d39f23cebc22ba9e98c11b0c49d94034ec2ed8d30e93bca3f62b56afa` |
| `apps/documents/src/index.ts` | `c63a38f0dc559bc5b77d2ea103f9205a7f61aec565fd9a2c052d9740c7e12c7c` |
| `apps/documents/wrangler.live.jsonc` | `ad5927ab776b13e24adaaa353615f3a81db36d9aeed528d1e85f0ee7bec7a18c` |
| `apps/documents/dist/pdfjs/pdf.txt` | `f401927e692efc7735e0cd528c490d0dd31b7f0972c122b7040df805be45cce4` |
| `apps/documents/dist/pdfjs/pdf.worker.txt` | `a33cfe728c584fdba4fcc1fd54bcdc2f9f2f13889ddbb5b2bd1d0f8cbe49b84e` |

This qualifies only these synthetic private-renderer cases, not Pingen upload,
pricing, sending, application migration or integration deployment.

Primary references: [PDF.js rendering](https://mozilla.github.io/pdf.js/examples/),
[PDFPageProxy](https://mozilla.github.io/pdf.js/api/draft/module-pdfjsLib-PDFPageProxy.html),
[Cloudflare Browser Run/Puppeteer](https://developers.cloudflare.com/browser-run/puppeteer/),
[Wrangler custom builds](https://developers.cloudflare.com/workers/wrangler/custom-builds/).
Effective options were checked in installed PDF.js types/source; removed options
were not invented.
