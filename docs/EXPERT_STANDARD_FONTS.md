# Offline standard PDF fonts

Local follow-up to the published `649c079` expert journey, 17 September 2026.
The baseline release passed private rendering of a synthetic PDF with embedded
fonts. Qualification then found that a valid PDF using unembedded Helvetica
failed closed with `REVIEW_RENDER_FAILED`: PDF.js required its standard-font
data and emitted a render warning when those bytes were unavailable.

The correction bundles all 14 standard-font resources from the existing,
lockfile-pinned `pdfjs-dist` package. `loadPdfScripts()` is shared by the Worker
asset build, local renderer and actual-browser tests. It fixes the filenames,
limits each font to 256 KiB and the complete set to 1 MiB, and retains the Foxit
and Liberation license notices in the generated Text asset.

The isolated browser receives the fonts and factory as package-owned script
data. PDF.js 6.3.289 uses `BinaryDataFactory.fetch({ kind, filename })`; this
factory accepts only an exact own-property font name with kind
`standardFontDataUrl`, decodes that resource on demand, and returns fresh bytes.
PDF.js maintains its own per-document cache. No URL or network fallback exists.
The factory lives in the Text asset so Worker bundling cannot inject a closure
helper that would be missing when Puppeteer serializes `openPostalPdf`.

System fonts and worker fetch remain disabled. CSP, offline mode, resource
interception, scan/hash checks, document and rendering budgets, and refusal on
PDF.js lost-content warnings remain enforced. The original PDF is never
rewritten. Postal preflight still requires embedded fonts for provider
compatibility; visual readability does not remove that separate requirement.

Actual Chromium tests exercise all Helvetica, Times and Courier variants,
Symbol and ZapfDingbats, check readable text and original hashes, and observe
only the intercepted isolated-page navigation. Missing font data still refuses
review. Additional factory cases reject CMap/Wasm requests, URLs, path traversal
and prototype names without fetching. Existing expert and postal rendering
tests cover the shared initialization.

Local validation passed 66 tests across the expert/postal browser suites and
their boundary suites (`test-results/standard-fonts/focused.json`), plus full
typecheck and lint. The browser suite includes a permanent regression that runs
Wrangler's actual dry-run build, extracts both browser callbacks and their Text
imports, and renders Helvetica, Times and Courier through those built callbacks.
It detects missing assets and injected closure helpers such as `__name`.
The generated Helvetica, Times, Courier and symbol page
images were visually checked. An independent check extracted both callbacks
from the actual Wrangler bundle and executed them in offline Chromium with its
real imported Text assets: all four unembedded-Helvetica pages rendered with
matching original/image hashes, no unexpected warning and no external request
(`test-results/font-fix/independent-final-bundle-proof.json`). The private Worker
dry-run bundle passed; its compressed size is about 1.7 MiB.

This candidate needs its own protected CI, private Worker publication and
synthetic service qualification before being described as released. A real
ChatGPT/iPhone session remains a separate client qualification.
