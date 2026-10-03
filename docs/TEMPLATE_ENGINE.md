# Template engine: implementation and evidence

Candidate implementation begun on 21 September 2026 and reconciled locally on
2 October 2026. No production deployment, paid provisioning, real communication
or hosted Browser Run qualification was performed for this increment. The
2 October run repeats the 20 engine checks, including all five real local
Chromium/PDF.js fixtures below, and the document Worker dry-run. The direct
workerd spike remains historical evidence from September, not a fresh run.

## Decision and sources

Guteneo uses the open-source pdfme engine, pinned to **6.1.13** for `@pdfme/common`, `@pdfme/generator`, `@pdfme/schemas` and `@pdfme/ui`. The npm stable package was published on 16 September 2026; the registry also contains newer development builds, which are not selected. All four package manifests declare MIT; [upstream MIT license](https://github.com/pdfme/pdfme/blob/main/LICENSE.md). The embedded font is Roboto (copyright Google 2011), exposed internally as `GuteneoSans`; its [Apache 2.0 license](https://github.com/googlefonts/roboto/blob/main/LICENSE) and the pdfme license are retained under `packages/templates/licenses/`. No commercial pdfme cloud subscription or Pro component is used.

The [pdfme getting-started documentation](https://pdfme.com/docs/getting-started) and [table documentation](https://pdfme.com/docs/tables) describe the shared Designer/generator template and dynamic blank `basePdf` with width, height and padding. The installed package implementation was inspected: `repeatHead: true` is necessary for repeated table headers, and `overflow: "expand"` enables flowing text. A background PDF is not accepted as the base of this dynamic template format. Existing immutable PDF imports and HTML rendering retain their own paths.

The production code path is the existing private document Worker, `POST /render/template`. It uses package-owned browser code, the embedded font, an isolated synthetic page, offline mode, CSP and request interception. All network requests except the single intercepted synthetic page are aborted. Using that existing browser isolation is an architectural choice, not a claim that pdfme cannot run in a Worker: the direct **local workerd** spike also generated one PDF successfully. Hosted Worker CPU/memory and hosted Browser Run remain separate unqualified environments. Cloudflare's [Browser Run limits](https://developers.cloudflare.com/browser-run/limits/) are account-dependent; local timing must not be presented as provider capacity or cost evidence.

## Shared contracts

`packages/contracts/src/templates.ts` defines the versioned Guteneo envelope: engine/version, graphic definition, independent business `inputSchema`, bindings, locale, synthetic examples, and resource policy. The business schema is a bounded JSON Schema subset: objects, arrays, strings, integers, numbers, booleans, required properties, defaults, enum, date/email formats and length/row limits. Unknown schema keywords fail validation instead of being silently ignored.

`prepareTemplateRender(envelope, data)` validates both structures, applies defaults, converts the business object to **one** pdfme input, and returns engine/adapter metadata. The backend creates one logical PDF per generation record. An array of records is never handed to pdfme as a single combined output.

Bindings support nested values, repeated object arrays, explicit table columns, simple equality conditions, sums and integer multiplication. Money uses safe integers and `BigInt` calculations before locale formatting; fractional arithmetic is never used for totals. Currency is explicitly EUR, CHF, GBP or USD, with two minor digits. Other currency scales are not qualified. Dates require unambiguous ISO dates. Exact decimal strings from dataset normalization can be bound with decimal formatting without converting them to floating point. Missing required values and overflow return structured field/block errors.

`applyTemplatePatch` supports moving a block, replacing static text, setting a binding, adding a table column and removing a block. These operate on the same serializable graphic definition used by the web Designer. Persistence, revisions, immutability of published versions, access grants and job orchestration belong to the shared workflow service, not the editor.

`reconcileDesignerChange` keeps native Designer names compatible with the contract and preserves bindings across exact renames and identified native copies. Formatting edits keep their existing identity. Ambiguous combined renames and content changes are rejected with an explanation and restore the last accepted definition; the editor never silently discards a business binding while guessing which block was renamed.

The embedded Designer keeps the actual container dimensions through its typed protected `render` extension. Stock pdfme 6.1.13 measures only the remaining viewport height below the container, which collapsed a canvas placed under the Guteneo toolbar; its existing resize observer still handles resizing. Programmatic `updateTemplate` calls suppress the synchronous change callback to avoid extra undo entries and recursive recovery. Browser proof waits for real page content and checks a native property change persisted through the API; final full-suite results are recorded separately.

The web studio also edits existing binding formats/currencies, repeated columns,
exact sums/products, typed equality/absence conditions, declared replacement values,
and required/default business fields. A false condition removes the whole block,
including table headings. `equals: null` means absence after normalization; zero
and false remain distinct. Web generation accepts omitted required fields that
have a valid declared default, using the same server normalization.

The gallery contains a professional letter, a demonstration invoice and a tabular statement. The invoice explicitly makes no claim of tax compliance. Header/footer and page counters are separate static schemas; only the exact `{currentPage}` and `{totalPages}` built-ins are allowed. Arbitrary expressions, JavaScript, HTML, SVG, hyperlinks and remote fonts/assets are rejected.

Raster logos are embedded privately in the versioned envelope as PNG/JPEG data, with magic bytes, maximum byte size and pixel dimensions checked. No URL is fetched. They do not have an independent antivirus verdict: the final PDF still traverses the existing exact-byte scan and document validation gate. Exporting a shared template necessarily includes its embedded logo and synthetic example content.

## Limits and rendering checks

| Surface | Enforced limit |
| --- | --- |
| Envelope and per-render business input | 512 KiB each |
| Graphic blocks | 100 total, at most 10 authored pages |
| Tables | 500 rows, 20 columns |
| Text field | 50,000 characters |
| Raster logo | 250 KiB, 4 million pixels, 4,000 pixels per dimension |
| Final PDF | 100 pages and 10 MiB |
| Private render request | 25-second deadline; bounded stream and cleanup |
| DOCX original | 5 MiB, 12 MiB expanded, 200 ZIP entries |
| DOCX XML | 3 MiB per entry, 30,000 tags, depth 64 |
| DOCX content | 90 blocks, 50,000 characters, 200 rows per table |

The adapter inspects the engine's final dynamic layout for page bounds, reserved margins and overlaps between text/table/image blocks, then structurally validates the produced PDF and checks the resulting page count. Unsupported glyphs fail with an actionable error instead of creating blank boxes. The font coverage and source-font hash are pinned in `font-coverage.json`; each renderer bundle build verifies the actual embedded bytes, and render provenance includes the filename and hash. French thousands grouping uses ordinary spaces because the bundled Roboto does not support narrow no-break space U+202F; this issue was caught through visual review of the last page, not text extraction alone.

The geometry policy intentionally rejects overlapping text/images even when an author could regard the overlap as intentional. Decorative lines and shapes may underlay other blocks. Rich text/inline Markdown and arbitrary custom fonts remain outside the qualified subset. Full arbitrary-document layout fidelity and binary reproducibility are not promised.

## Word import

`importDocxTemplate(bytes, name)` extracts ordered DOCX paragraphs and regular tables into editable pdfme blocks. The business service scans and retains the original privately, separate from the shared template. ZIP directory validation, fixed allocation decompression limits, CRC checks and XML DTD/entity rejection happen before content interpretation. External relationships, macros, embedded objects, fields and active controls fail closed. The parser does not execute Word, macros or external links.

The import returns warnings and provenance, including original SHA-256 and `layoutPreserved: false`. Word fonts, styles, pagination, images, headers/footers and notes are not reconstructed. Merged cells and irregular tables are rejected rather than silently reshaped. Literal braces in paragraph text remain data through a default binding. Old binary `.doc` and macro `.docm` are explicitly unsupported; save a `.docx` first. This is editable **content import**, not faithful Word-to-PDF conversion. The synthetic Word proof preserves all content, but its final sentence wraps a lone period onto a second line; typography and layout still require review in the studio.

The private antivirus was extended with a separate `/scan-source` route accepting `application/octet-stream` up to 5 MiB and forwarding exact bytes to ClamAV. The existing `/scan` remains PDF-only at 10 MiB. Type interpretation still belongs to the CSV/XLSX/XML/JSON/DOCX parser. The added scanner path was tested with contract doubles; no new Docker/real ClamAV or hosted source scan was qualified in this increment.

## Reproducible evidence

Run from the repository root:

```sh
npx vitest run tests/unit/templates.test.ts tests/unit/templates-docx.test.ts tests/unit/templates-designer.test.ts tests/integration/templates-renderer.test.ts
node --import tsx scripts/pdfme-spike.ts
node --import tsx scripts/pdfme-worker-spike.ts
npx wrangler deploy --dry-run --config apps/documents/wrangler.jsonc --outdir ../../test-results/template-engine/worker
npm --prefix apps/scanner test
npm --prefix apps/scanner run typecheck
```

`reports/template-engine/proof.json` contains measured timings, PDF bytes/hashes, page counts, source-marker coverage and unexpected network requests. The Chromium spike calls the actual private request handler and its bundled browser implementation. Actual local PDF.js reads every rendered page, checks text bounds, verifies all row/paragraph markers and required accented characters, and saves first/last-page PNGs. The five synthetic PDFs and PNGs are in the same directory. First and last pages were visually inspected.

With repeated table headers, the measured fixtures contain **1, 3 and 16 pages for 1, 30 and 200 invoice lines**, and **5 pages for 45 long paragraphs**, plus a one-page editable DOCX content import. `word-source.docx` and its imported envelope/provenance `word-import.json` are included for an exact web/API demo. No source marker was missing, no extracted text lay outside its page and no external network request occurred. A deliberately overlapping block is rejected. The latest exact sizes/timings/hashes are in the report; elapsed wall time and host RSS are not Cloudflare CPU/browser-memory measurements. The historical September dry-run document Worker was **8,759.28 KiB raw / 2,720.37 KiB gzip**, including the existing PDF.js assets and new approximately 3.25 MiB browser script; consult a fresh dry-run after dependency changes.

The historical direct workerd report was `reports/template-engine/workerd-spike.json`. It demonstrated one-page generator compatibility locally, not hosted execution, production throughput or all engine features. The current document Worker dry-run is **8,959.54 KiB raw / 2,828.43 KiB gzip**. Fresh generated artifacts are archived outside the checkout at
`/Users/nclsppr/Developer/.artifacts/guteneo-templates-20261002/template-engine/`;
the command examples recreate them under `reports/template-engine/`.

Targeted engine tests: 20 passing checks cover native Designer defaults and name/binding reconciliation, pinned font bytes, gallery round-trip, exact monetary totals, semantic edits, missing/ambiguous inputs, expression/resource/prototype rejection, prompt text treated as data, Word extraction/rejections, actual multi-page rendering, network isolation and deadlines. Scanner checks: 29 JavaScript and 38 Python tests pass, including the new source route and unchanged PDF gate; scanner TypeScript passes. These counts are separate from the full repository verification and the web/API/MCP integration evidence in `TEMPLATES_DATA_DISTRIBUTION.md`.
