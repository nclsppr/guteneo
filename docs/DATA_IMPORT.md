# Dataset import, mappings and optional AI

This is a local implementation candidate. CSV, XLSX, XML and JSON parsing and mapping
are implemented; no external AI inference, production deployment or real send was
performed to qualify them. Upload/profiling never transfers data to an AI provider.

## Shared deterministic engine

`packages/data` is called by the workflow service used by REST, MCP and the web.
`profileDataset(bytes, format, options)` keeps raw strings and cell coordinates;
the service separately retains immutable original bytes in private R2. The pure
parser has no storage, tenant-selection, billing, dispatch or network authority.
The service remains responsible for authenticated ownership, scanning, retention
and source access. A template share does not share a dataset or a mapping.

`validateMapping(profile, plan)` performs a complete deterministic pass and returns
`ready` or `needs_review`, measured issues, excluded source rows, logical document
count, records and per-field provenance. This is data validation, never approval to
send. `normalizeDataset` is the same function. Manual mappings and mappings supplied
by an external assistant require no internal AI call.

Version 1 plans select a sheet and explicit header row. Fields refer to column
names, so reordering columns preserves compatibility. Exact expected header sets
detect additions/removals/renames; both the main sheet and all joined sheets require these. Header or schema changes
require a new mapping version and validation. Mapping versions are independent of
template versions. `datasetStructureSignature` provides a sorted structural
signature; final compatibility is determined by the full mapping validation.

Optional `group` and `recordKey` produce one document with repeated items from
multiple rows. Cross-sheet joins require explicit source and target keys and
cardinality. Duplicate parent keys, missing one-to-one children, multiple
one-to-one children, orphan rows, missing keys and conflicting parent fields are
errors. There is no Cartesian product and no automatic recipient inference.
Records retain source-row identifiers and provenance, independent of job
completion order.

Mapping fields support nested object paths, text, safe integers, exact decimal
strings, integer minor units with an explicit scale of 0–9, calendar dates and
booleans. Amounts should normally use `minor` and an integer template field; exact
`decimal` output is a string, and should be bound to a textual schema field with
the template binding’s `decimal` display format. A template schema of type `number`
does not accept this string: the web mapper flags a mapped exact-decimal field
and blocks its validation until the template or mapping is corrected. This also
applies to repeated table fields. Integer and minor-unit mappings remain numeric;
no optional unmapped field is blocked. There is no floating-point arithmetic or
implicit rounding. Required missing values are
errors, optional defaults are explicit, and overlapping/prototype paths or unknown
mapping properties are rejected. No script, expression, `eval`, macro or network
function can be supplied by a mapping.

## Supported source behavior and limits

| Boundary              | Implemented limit or rule                                                                                                                             |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Original upload       | 5 MiB, nonempty, CSV/XLSX/XML/JSON only                                                                                                                   |
| Workbook              | 12 sheets, 5,000 rows per sheet, 128 columns, 100,000 cells total including rectangular XLSX gaps                                                     |
| ZIP                   | 256 entries, 24 MiB total expansion, 8 MiB per entry, maximum expansion ratio 200                                                                     |
| Cells and diagnostics | 12,000 characters per cell, 1,000 issues retained; overflow prevents ready status during normalization                                                |
| Logical records       | 500 documents per normalization                                                                                                                       |
| CSV                   | Existing Papa Parse dependency, UTF-8 default; Windows-1252 only when explicitly chosen; comma/semicolon/tab/pipe supported                           |
| XLSX                  | Sheet title offsets, multiple sheets, exact numeric lexemes, explicit zero-padding formats, cached formula metadata, hidden rows/sheets, merge ranges |
| JSON                  | Array of objects or object of named sheet arrays; nested scalar objects flattened into column paths; repeated child rows use named sheets and joins   |

CSV values remain strings: postal codes and identifiers keep leading zeros.
XLSX numbers use the parser's `parseNumber` hook to retain their original lexical
precision. Simple custom Excel zero formats such as `00000` preserve displayed
leading zeros. More elaborate formatting is retained as metadata, not interpreted
as an instruction to invent identifier digits. XLSX date values are interpreted by
the XLSX parser's workbook epoch and recognized date style; textual dates require
an explicit order except unambiguous ISO dates. Decimal commas require an explicit
separator. Thousands separators and numeric exponents are deliberately rejected
by numeric mapping. JSON decimal/exponent literals and unsafe integers are
rejected before they can be silently rounded; pass those values as JSON strings.

Merged cells are reported and never propagated. Hidden rows are excluded by
default with coordinates in `excludedRows`; hidden sheets require explicit
inclusion. Suspected subtotal labels and ambiguous dates appear as measured
warnings in the profile. A person or calling application chooses header rows,
exclusions and date/number conventions. Formula execution never occurs: default
mapping rejects formulas, `formulaPolicy: cached` explicitly accepts an existing
cached result, and missing caches stay errors. Cached results may be stale; this
policy does not recalculate or attest correctness. Even formula-only rows with no
cache remain in the profile.

Malformed ZIPs, path traversal, duplicate names, overlapping members, encrypted or
multipart archives, ZIP64 sentinel sizes, bad CRCs and inconsistent sizes are
rejected before parsing. Every entry's declared allocation is checked before
inflation; fixed-size output plus a guard byte detects dishonest expanded sizes.
XLSX cell coordinates are inspected before the third-party parser can allocate
sparse row/column arrays. DTD/entity declarations, external OOXML relationships,
embedded objects, ActiveX and macro workbooks are rejected. XML depth is bounded.

CSV/XLSX import does not execute text resembling a spreadsheet formula. There is
no new CSV export endpoint; callers exporting normalized values to spreadsheets
must use an appropriate formula-escaping writer. The existing campaign CSV
validator and its protections are unchanged.

## XML records and repeated items

XML is accepted as a UTF-8 source, with lexical values retained as strings (for
example `001`, `00120` and `12.5000`). A root containing one homogeneous collection
can be recognised automatically. Otherwise pass the literal absolute
`xmlRecordPath`, for example `/export/clients/client`; XPath expressions and
wildcards are not supported. Selection is never guessed between collections.
Nested scalar elements become dotted column names, attributes use `@name`, and
text with attributes uses `#text`. These are source column names; the mapping
chooses separate safe template paths.

Repeated elements such as `items.item` become a secondary sheet
`Données.items.item`. The main sheet contains `__xml_record_id`, and the secondary
sheet contains `__xml_parent_id`. Select these keys in an explicit one-to-many
join to populate the template table. Records containing only one item use the
same child sheet as records with many items. Nothing is silently discarded.

Limits: 32 XML element levels, 8 scalar field levels, 100,000 elements, 4,999
records plus headers per sheet and at most 8 repeated child tables, within the
shared byte/cell/column budgets. Arrays nested within arrays, mixed element/text
content, non-UTF-8 declarations, DTDs, custom entities, invalid character
references, ambiguous field names and prototype keys are rejected explicitly.
XML parsing has no network access. `xmlRecordPath` is retained with the immutable
original's parsing options for analysis recovery.

## Pinned XLSX parser qualification

The selected parser is `read-excel-file@9.3.10`, MIT, published registry metadata
modified 10 August 2026, read on 21 September 2026. Its public `/universal` export
accepts ArrayBuffer without a DOM, uses SAX parsing, and exposes a `parseNumber`
hook. Guteneo does not import an unpublished internal module. `fflate@0.8.3` and
`fast-xml-parser@5.11.1` are MIT and pinned; the latter is used only for bounded
OOXML security/metadata inspection. The initially considered older XML version
was rejected because the dependency audit reported vulnerabilities. The root
lockfile is authoritative for exact transitive versions.

Primary sources: [maintainer repository and license](https://github.com/catamphetamine/read-excel-file),
[published package](https://www.npmjs.com/package/read-excel-file/v/9.3.10),
[fflate repository](https://github.com/101arrowz/fflate),
[fast-xml-parser repository](https://github.com/NaturalIntelligence/fast-xml-parser).

`tests/unit/datasets-runtime.test.ts` bundles the public parser with esbuild and
executes a real two-sheet XLSX profile inside local Miniflare/workerd with no DOM.
This is an actual local Worker runtime check, not a Node-only substitute. It does
not qualify a hosted Cloudflare deployment, production throughput, CPU quota or
peak isolate memory. Those remain deployment-stage checks. Strict OOXML variants,
encrypted workbooks, binary `.xls`, macros and preservation of every Excel
presentation style are not claimed supported. XLSX rows require explicit bounded
OOXML row/cell coordinates in this implementation.

## Optional OpenAI proposal adapter

`suggestMappingWithOpenAI` and `OpenAIMappingProvider` implement the public Responses
API with strict JSON Schema Structured Outputs. An explicit model and injected
secret, organization data-transfer consent and a remaining-call budget are
required. The workflow service reserves each organization's call allowance before
calling the adapter. No secret is discovered automatically; absent configuration
returns `AI_UNAVAILABLE` and leaves the manual route usable.

The adapter sends up to four sheets, each with an inferred header plus three
sample rows, at most 24 cells per row and 120 characters per value, together with
bounded technical metadata. Sampling is visibly marked truncated. Samples and
model prompts/responses are never logged by this module. It sends `store:false`,
`tools:[]`, disallows redirects and uses only the fixed OpenAI endpoint. A strict
server schema and independent mapping/source validation run after the response.
The proposal always remains `needs_review`, even when deterministic validation
finds no errors. It cannot approve, send, enable hidden data, accept formula
caches, alter organization rights or supply constants for recipients.

Refusal, truncated or malformed responses, invented source references, missing
configuration, missing consent, exhausted budget, non-success responses and
timeouts are distinct errors. Maximum two attempts are possible only when the
caller has reserved enough calls, and only for explicit transient HTTP failure.
The workflow currently reserves one call and therefore performs no retry. Unknown
network/timeout outcomes are never retried. Responses are capped at 128 KiB and a
maximum 30-second configured timeout. Returned telemetry contains token counts,
call count and elapsed milliseconds, never content. Token counts are not a price
quote; no model quality/cost claims are inferred from synthetic tests.

The implementation follows [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs).
Only direct OpenAI is implemented here. There is no configured AI Gateway and no
Workers AI inference. `store:false` does not itself assert zero retention or EU
residency; provider account retention, data processing, logging and location must
be qualified before an organization's live transfer is enabled. Live model
quality, refusal rate, latency, cost and provider account access are **not
qualified**. Automated tests use an explicitly synthetic injected fetch and never
require a paid subscription or invoke OpenAI.

`suggestTemplateWithOpenAI` and `OpenAITemplateProvider` share the same bounded
Responses transport, policy and token telemetry. They take the current validated
template and a separate user instruction and return at most 12 semantic patches
plus a fully validated candidate envelope. Supported suggestions move an existing
block, change an unbound fixed text block, update a binding to existing business
fields or add a table column from an existing item field. A truly blank template
can select one of the three built-in gallery definitions. A gallery choice cannot
replace an existing design. Adding a new undeclared data field remains an explicit
schema edit, not an inferred AI default for future customer data.

The adapter sends at most 32 block summaries with 400-character text excerpts, the
business schema, bounded bindings and truncated synthetic samples; it excludes
image bytes. The shared transport rejects payloads over 64 KiB. Embedded template
text remains untrusted. Suggestions cannot remove blocks, replace bound variables
with fixed text, alter samples or acquire send/publish/permission powers. Server
checks validate the whole envelope, sample data and deterministic render inputs.
The returned status is always `needs_review`; this operation does not save,
publish or render a PDF. Applying a candidate and rendering its preview are
separate explicit operations. Real model suggestion quality remains unqualified;
tests cover the actual adapter with a synthetic transport.

`suggestDatasetSchemaWithOpenAI` additionally proposes a new business schema from
the profile, without requiring an existing template. The single structured AI
response selects semantic mapping paths/types and source joins. Trusted code
constructs the exact `BusinessField` schema matching those normalized values,
including nested objects, grouped tables and one-to-one/one-to-many joins. It
builds an editable pdfme envelope with at most 24 scalar fields and four tables of
10 columns, one table per page. Decimal values remain strings; minor units remain
integers and no currency is inferred. Unsupported paths and excessive schemas are
rejected rather than silently trimmed.

All example data is deterministic synthetic data, independent of source cell
values. The server validates the complete envelope, schema, sample and prepared
render inputs, then checks every normalized source record against that schema.
Source data errors keep validation in `needs_review`; the outer proposal status is
always `needs_review`. The existing REST `POST /api/datasets/:id/analyze` and MCP
`analyze_dataset` accept the explicit `proposeSchema: true` option. They retain the
same `datasets:write` scope, private-source access, organization transfer policy,
single-call quota and post-response authorization recheck. There is no new
provider or operational capability.

The web displays proposed fields, types, source columns, repeated items and
ambiguities. Only an explicit review and adoption action creates a private draft
and its draft mapping through the existing endpoints. Publication, validation of
the saved mapping and generation remain separate actions. Six focused adapter
tests use a synthetic transport, including full-record array-limit rejection,
source hallucinations and no copying of private sample values. The browser
scenario explicitly intercepts the analysis response; subsequent import,
adoption and PDF preview are real local application operations. This demonstrates
workflow behavior, not live model output quality.

## Executable synthetic examples and proof

`tests/fixtures/datasets/clients-articles.xlsx` contains title rows before the
header and separate Clients/Articles sheets. Its mapping produces two logical
documents with separate item arrays. The date convention and comma decimal rule
are explicit in `clients-articles.mapping.json`. `clients-reordered.csv` preserves
zero-prefixed postal codes; `grouped-200.csv` contains one synthetic client with
200 item rows. The fixture source is `tests/unit/datasets-fixtures.ts`.

```sh
npx vitest run tests/unit/datasets.test.ts tests/unit/datasets-ai.test.ts tests/unit/datasets-template-ai.test.ts tests/unit/datasets-schema-ai.test.ts tests/unit/datasets-runtime.test.ts
```

The targeted suite demonstrates actual XLSX parsing, grouping, joins,
provenance, reordered-header reuse, structure drift, exact arithmetic, ambiguous
dates, missing values, cardinality/orphans, hidden rows, formula/cache handling,
malicious ZIP/XML, resource limits, prototype-path rejection, AI injection
separation, refusal/truncation, bounded retries and local workerd compatibility.
API/MCP upload, private retention, mapping-version permissions and generation are
qualified separately by the workflow integration suite and examples.

The web profile browser requests at most 30 rows per selected sheet and shows
first/previous/next navigation; browsing another sheet does not change the mapping
source. Header rows outside the displayed page are retrieved independently with a
single-row request. Long preview values are explicitly marked as truncated at 256
characters; validation continues to use the original private profile. Exclusion
numbers keep their free-form comma-separated input while typing and are checked
on blur and again on submission. The focused E2E scenario in
`tests/e2e/template-data.spec.ts` covers a header at row 40, two paginated sheets,
and exclusions typed as `41, 43`. The final focused run passed nine cases across
Chromium desktop, mobile Chromium and iPhone WebKit, including explicit
Windows-1252/tab imports with accented content and zero-prefixed identifiers.
See `reports/templates-data/data-ui-final.json`; these are local browser checks,
not physical-device qualification.
