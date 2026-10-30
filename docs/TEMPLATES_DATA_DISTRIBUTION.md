# Templates, data and distribution

## Correction and explicit preparation — 29 October 2026 local candidate

Each destination explicitly selects its PDFs. Adding a destination selects no
piece automatically. The preparation summary shows the exact associations and
warns that the first preparation permanently freezes the entire generation,
including excluded/failed rows. Navigation alone creates no plan or dispatch.

One template id has a current published version and immutable earlier versions.
Publishing a correction advances that current version; existing generations and
preparations retain their original version and exact PDFs. Later publications
continue the same history with automatically assigned version numbers.

Studio preserves the selected template/version through compatible data import,
replacement and field mapping. Row exclusions survive replacement only when
row identity/structure can be verified; reordered, inserted, changed or
unverifiable rows require explicit exclusion review before validation. Corrections create a new version/generation;
previous documents and prepared manifests keep their immutable bytes and hashes.
Generation results use bounded business labels (name, subject and reference)
without changing record identifiers. A browser-only owner-authorized
`GET /api/generation-jobs/:id/record-context` supplies presentation labels in
pages of 50 with the result-record cursor;
`?recordId=…` supplies one record and its current document for explicit
correction, shown beside the form on wide screens; when a destination takes its
recipients from the data, the same read of the first selected record offers its
field names as suggestions. The current membership,
tenant and creator gates are rechecked; shared-template or review access grants
no access to private source inputs. The optional current template name also
requires current template read permission; revoking sharing hides that metadata
while the creator retains their own generation and record labels. A local D1/R2
regression covers sharing, revocation and a later private rename. This adds no MCP
tool or native permission.

[Local acceptance](STUDIO_SPACE_REPRISE.md) records the actual V1/V2 and missing-
data checks separately from browser fixtures and deployed/provider qualification.

## Studio space — 29 October 2026 candidate

Templates, Data and Generations form the web **Studio** space under
`/app/studio/templates`, `/app/studio/datasets` and `/app/studio/generations`,
with detail pages at `/app/studio/template/<id>`, `/app/studio/dataset/<id>` and
`/app/studio/generation/<id>`. Earlier addresses resolve to these routes in the
browser and keep their query. Selected PDFs pass by identifiers to
`/app/distribution/new?generation=<id>&selected=<recordId>…`; Correspondence
revalidates all selected ready results before displaying its preparation form,
including selections spanning multiple 50-record pages. Navigation makes no write.
Every new destination starts with zero documents, even for one selected PDF.
Back/Forward, reload and explicit return preserve Studio selection; unsaved
preparation changes may veto departure. Prepared distribution plans keep
`/app/distribution/<id>` and their form, detail and styles belong to Correspondence,
under Dispatches. The Studio uses
the same workspace session, roles and private-resource rules; REST paths, MCP
tools and scopes are unchanged. The [workspace layout contract](DASHBOARD_V2.md)
owns the switcher and navigation.

## Synthetic generation diagnostics — 26 October 2026 follow-up

A terminal `failed` or `partial` generation is not pending work. Status reads
never restart failed records. The XML browser regression retains its two exact
generated PDFs, routing/options and zero-send assertions, and reports a terminal
failure immediately with bounded state/counters instead of waiting out 90 seconds.

In local simulation only, an uncoded record failure emits a finite phase and
exception-category diagnostic through the captured error channel. It includes no
raw exception, content, recipient, URL, SQL value, credential or customer ID.
Production and nonlocal/nonsimulation environments emit none of these diagnostics.
Processing, claims, quotas, API errors, timeouts and retry rules remain unchanged.

Main run 40241350392 had one terminal XML-record failure with `GENERATION_FAILED`
before its render artifact was retained; the other record completed. An isolated
macOS reproduction on the same source passed both records at their first attempt.
That does not reproduce Linux or its preceding shard state and establishes no
cause. Preserve the failed run and this qualification limit; a later source pass
must not be described as proof that the historical failure's cause was repaired.

## Local images and committed editor changes — 25 October 2026 candidate

An editor with current edit authority imports a local PNG/JPEG from the visible
image action above the canvas, using pointer or keyboard. The existing image
contract permits at most 250 KiB, four million pixels and 4,000 pixels per side;
it rejects SVG, remote URLs and malformed raster data. The helper inserts on the
selected page, fits the original aspect ratio, uses a name unique across pages
and static content, and preserves business bindings and original embedded bytes.
The new block is selected for direct position/size editing. No separate upload,
asset store, external image fetch, AI call or production service is introduced.
An unsupported image leaves the prior template intact and permits another choice.

The native property panel debounces changes. Saving, publishing or changing studio
tabs waits until the accepted model matches mapped authoring inputs, so a rapid
save cannot persist old geometry. Search controls do not block saving. Invalid
numbers remain visibly pending; correcting them or restoring the accepted value
recovers without waiting for a nonexistent change callback. Ambiguous native
changes restore the previous accepted definition under the existing reconciliation
contract. Save/publish still use current authority and revision checks, and
published versions remain immutable. Mobile import remains available while native
visual editing requires a desktop viewport; the desktop help state reflects that.

The REST/MCP envelope format and document-rendering path are unchanged. Native
clients do not gain a designer or new authority. A generated PDF retains its normal
exact-byte security gate; an embedded raster is not separately advertised as an
antivirus-qualified file. Exporting a shared template includes its embedded image.
Relevant source: `apps/web/src/template-designer.tsx`, `template-pages.tsx`,
`packages/templates/designer-images.ts` and the existing image contract. The unit
and actual browser/API/PDF round trip are in `templates-images.test.ts` and
`template-images.spec.ts`; final browser-engine and hosted evidence is recorded in
[TEST_RESULTS.md](TEST_RESULTS.md).

### Generation completion and PDF security analysis

Generation completion and readable PDFs are separate states. Each result exposes
`documentAnalysis: DocumentAnalysis | null` through the existing REST/MCP result
view. The projection uses the current authorized document, its exact artifact
hash and the tenant-bound analysis relation. An unrelated owner, tenant or hash
cannot supply readiness. The shared document projection distinguishes
`processing`, `ready`, `retryable` and `blocked`; expired processing and legacy
quarantine without analysis do not claim that a scan is still running.

The generation page follows confirmed processing every 15 seconds for at most
two wall-clock minutes and eight followup reads per page/manual refresh, even
after the job completes. Hidden pages pause scheduling without extending that
deadline. Terminal, retryable, unavailable or failed reads stop automatic refresh;
manual refresh remains available and resets the window. Reads never start or
retry an analysis, render another PDF, reserve credit or create a dispatch.
Selection, preview and distribution still require an accessible ready PDF.
Refreshing the job counter does not establish that its independently loaded
result rows are ready. Native keyboard navigation skips disabled rows and keeps
its current focus when later data enables a checkbox; no refresh steals focus.

The pure analysis projection, actual generation/read integration and controlled
slower-result keyboard regression are covered by
`document-analysis-projection.test.ts`, `template-workflow.test.ts` and
`generation-analysis.spec.ts`, with keyboard ordering in
`template-xml-multichannel.spec.ts`. No schema migration, new route or new scope
is introduced by this additional read projection.

## AI suggestions — 23 October 2026 version 1.0.0 candidate

Template edit permission, current membership/OAuth connection, revision and AI
transfer consent must remain valid immediately before inference and before returning
a proposal. Revocation, removed sharing or concurrent edits block stale results.
Reread current state and explicitly request another proposal; no automatic apply,
publish or send follows. Browser/REST/MCP share these server checks. Reserved quota
remains consumed. Regressions intercept synthetic inference, proving no actual
provider call. See [V1_RELEASE_CANDIDATE.md](V1_RELEASE_CANDIDATE.md).

## MCP annotations — 20 October 2026 local candidate

`prepare_distribution` now declares `destructiveHint:true` for an existing effect:
the first plan permanently prevents retries of failed records anywhere in its
generation batch, including records excluded from selection. Classification/copy
adds no permission, route or send. Roles/scopes/ownership are unchanged; explain
this consequence before calling and honor host confirmations.

Finish desired failed-record retries before creating a plan. Afterwards
`retry_generation_records` returns `GENERATION_FROZEN`; regeneration requires a
new batch. `resume_distribution` continues only preparations in the frozen plan,
without reopening generation, approving sends or retrying unknown provider outcomes.
Existing PDFs/provenance remain.

[Annotation remediation](MCP_ANNOTATION_REMEDIATION.md) records all four booleans for
67 tools. Business reads declare `readOnlyHint:true`/`idempotentHint:true`; the
connection's last-used time refreshed after any success is connection metadata.
`npm run audit:mcp` checks actual local `tools/list` coverage. On 20 October,
55 `tests/integration/template-workflow.test.ts` cases including excluded-record
freezing, 16 `tests/unit/mcp-annotation-audit.test.ts` cases, full typecheck/lint and
67-tool/268-boolean/216-source-reference audit passed without discrepancy. This
proves neither exact-commit CI, deployment, portal checks nor OpenAI approval.

## Recovery and coordinated publication — 2 October 2026

Local recovery used `a808307c5687588eb8c0aab45c9e559aa70a03dc` in worktree
`templates-workflow`, restoring 21 September work from snapshot
`20d7b8249b1aa8d942c45b59d56ec9e768503b8e` (base `c5319253`). Older reports do not
qualify reconciliation. Initially this was local without merge/deployment/AI
activation/real sending. A subsequent user request authorized merge/publication
after PR/merged-commit validation. Local proof remains distinct from public
manifest and Cloudflare-version publication proof.

Reconciliation with `8b060bb` preserves merged role/invitation migrations 0042–0043.
Six studio migrations, previously unpublished, became 0044–0049 without SQL-byte
changes. Earlier proof used numbers 0042–0047 and remains historical.

Current roles apply: observer reads, operator prepares, approval follows effective
permissions. Generated PDFs stay private before preparation. Preparing grants
current approvers exact-dispatch-context review access, explained before the
action. The library remains private; REST/MCP require exact dispatch, same workspace
and current rights, rechecking metadata/bytes/pages after reads. Removing approval
or connection authority cuts this access.

Publication requires studio migrations 0044–0049, private `/render/template` renderer
and scanner/container `/scan-source`. Publish/qualify private services before
coordinating migrations/app. Use atomic `scripts/migrate-remote.mjs` batches, retain
a D1 bookmark, check schema/ledger/integrity and apply absent migrations only.

Migration 0045 changes deduplication for private PDFs, making the old application's
SQL predicate incompatible. Keep the migration-to-app window brief; imports/renders
may fail during it. Once private PDFs exist, never roll back before `access_owner_id`
checks. Fallback code must preserve new access guards/schema compatibility.

Scanner Docker proof on 2 October: ClamAV 1.5.4, database 28141 dated 06:26:12 UTC,
clean PDF and harmless EICAR recognized with exact hashes. This does not replace
remote renderer/`scan-source` checks. Separate deployment evidence:
`/Users/nclsppr/Developer/.artifacts/guteneo-templates-deploy-20261002`.
Existing channels stayed unchanged; real sends, AI activation and mandates were
outside that publication.

## Demonstrations, removal and LLM authoring

The gallery has five synthetic starting points: business letter, demo invoice,
tabular statement, quote and delivery note. Create my private copy saves an
independent editable/shareable template in the reader's language (field titles,
PDF text, sample data and number/date formats); reading the gallery does not
populate a workspace. Each has a business schema, bindings and sample data that render real PDFs.

Owners may remove their creation from library/studio with confirmation naming it,
including demo copies. Shared removal also hides it from other members; generated
PDFs/history remain and the demo base remains reusable. Confirmation warns of
unsaved edits; cancellation retains the draft. Edit/publish rights do not grant
another owner's deletion right.

`0049_template_soft_deletion.sql` adds `deleted_at`; mutation checks current owner,
membership, OAuth authority and revision. Reads/new generation exclude deleted
templates. Concurrent edit/publish/share cannot revive them; immutable versions
and provenance relations remain.

`get_template_authoring_guide` exposes JSON schemas from current Zod contracts,
allowed graphic properties, semantic rules, limits and complete minimal envelope.
`list_template_examples`/`get_template_example` return the same five web examples
without writes. Adapt, `create_template`, inspect preview, then publish explicitly.
Direct LLM authoring needs no internal OpenAI adapter/configuration. Plugin guidance
complements server reference. Owner `delete_template` needs ID/current revision;
reads use `templates:read`, creation/removal `templates:write`; other permissions
remain separate. See [API_CONTRACT.md](API_CONTRACT.md).

Separate evidence:
`/Users/nclsppr/Developer/.artifacts/guteneo-template-demos-20261002`.
It covers 52 contract/plugin tests, 39 non-AI workflow cases (including a focused
recheck after correcting an expectation), 216 security checks, six browser journeys
and one Designer regression. All five examples rendered real visually inspected
PDFs. The [executable MCP example](../examples/template-workflow/README.md) discovered
rules, created a private quote, previewed it, removed the template and reread the
retained PDF. [TEST_RESULTS.md](TEST_RESULTS.md) separates successful runs, corrected
initial failures and local limits; these counts do not replace base-candidate totals.

## Initial architecture and decisions

One business service, Hono API, MCP and React workspace remain. D1 owns membership,
approval, quota, dispatch and outbox; R2 holds private bytes. `DocumentService`
imports/checks/stores PDFs; a private Worker isolates rendering. CSV campaigns
prepare individual sends without modeling line items or personalized PDFs.

Additions are engine-independent template envelopes/versions/rights, separate
sources/mappings, generation jobs and explicit result/destination associations.
Distribution calls existing preparation; publishing, mapping validation and PDF
generation never approve sending. The first vertical journey is gallery/API
creation → visual edit → revision-checked save → immutable publish → business-object
generation → checked PDF. Dataset/batch work extends it.

- pdfme is pinned. Dimension/margin `basePdf` supports dynamic tables; a background PDF does not supply that pagination. Rendered PDF, not canvas, is evidence.
- Business values remain objects/arrays; a bounded adapter creates engine inputs without user JavaScript expressions.
- React lazily loads the embedded Designer; customer PDFs get no imposed Guteneo branding.
- Dataset originals stay private; mappings are separate deterministic plans. AI may propose, never silently apply.
- Word import yields editable blocks with conversion warnings, without faithful Microsoft Word round-trip promises.
- Existing quote/postal/consent/mandate rules govern distribution. Repeated destinations authorize no merging, deduplication or channel switch.

Risks include fonts/pagination, bundle cost, adversarial XLSX/DOCX archives, data
ambiguity, revoked async authority, concurrent duplicates and partial errors.
Sources: [pdfme tables](https://pdfme.com/docs/tables), [pdfme source](https://github.com/pdfme/pdfme),
[Workers practices](https://developers.cloudflare.com/workers/best-practices/workers-best-practices/).

## Evidence boundaries

Initial development used an isolated worktree and authorized no deployment,
merge, paid provisioning, provider activation or real send. Later publication
authority is dated above. Local renderer proof is no remote Browser Run proof;
local MCP is no ChatGPT/Claude/Cursor qualification. Recovered AI adapters were
unchanged/inactive; all AI tests were excluded on 2 October. Historical synthetic
AI doubles qualify neither that recovery nor an actual model.

## Delivered implementation

- `packages/contracts/src/templates.ts`, `datasets.ts`, `template-workflow.ts`: envelopes, business data, declarative plans and shared contracts.
- `packages/templates/`: gallery, adapter, semantic changes, Word import and bundled assets. [TEMPLATE_ENGINE.md](TEMPLATE_ENGINE.md) owns decision/licenses/measurements/limits.
- `packages/data/`: CSV/XLSX/XML/JSON profiling, full validation, joins, normalization and OpenAI adapters. [DATA_IMPORT.md](DATA_IMPORT.md) owns formats/bounds.
- `apps/api/src/template-workflow.ts`: single business authority; `template-workflow-routes.ts`/`mcp.ts` transport it. React decides no authority/approval.
- `apps/documents/`: private pdfme rendering beside HTML/PDF; `apps/scanner/` separately scans office-source bytes.
- `apps/web/src/*-pages.tsx`, `template-*.tsx`: library, lazy Designer, forms, sharing, mapping, tracking, distribution; not exposed in fictional public preview.

Additive migrations: `0044_template_workflow.sql` creates templates, versions,
grants, private sources, mappings, jobs, results, manifests;
`0045_private_generated_documents.sql` adds private ownership/separate deduplication,
preserving old documents; `0046_generation_provenance.sql` stores cell coordinates,
hashes/render parameters; `0047_distribution_postal_reviews.sql` binds checks to
frozen entries; `0048_dataset_analysis_recovery.sql` adds leases/counters/options
for same-original retry. Initial implementation reset/migrated no remote database.

Source retention: 30 days. Normalized inputs/intermediate generation copies:
90 days outside active jobs. Final PDFs/dispatches follow existing maintenance.
Provenance excludes cell values. Published versions/templates remain traceable;
archive does not destroy them. Original Word files are private, but extracted
content becomes template content and must be reviewed before sharing.

## Interface parity

Names below are server MCP names without host prefixes. The same service checks
each resource. `get_capabilities` describes limits, no-send generation and local
qualification status. REST paths are prefixed `/api`.

| Operation | API | MCP | Web |
| --- | --- | --- | --- |
| Library/schema | `GET /templates`, `/:id`, `/:id/schema` | `list_templates`, `get_template`, `get_template_schema` | Templates, palette, business form |
| Create/edit | `POST /templates`, `PATCH /templates/:id` | `create_template`, `update_template` | Gallery, blank page, Designer, variables, columns, logo, formatting, conditions, totals |
| Word import | `POST /templates/import-docx` multipart | `import_docx_template` through supported file transport | .docx, warnings, studio |
| Template suggestion | `POST /templates/:id/suggest` | `suggest_template` | Instruction, review, explicit local apply |
| Publish/duplicate/archive | `POST /templates/:id/{publish,duplicate,archive}` | `publish_template`, `duplicate_template`, `archive_template` | Dedicated actions/expected revision |
| Sharing | `GET /templates/:id/sharing`, `POST /templates/:id/share` | `get_template_sharing`, `share_template` | Private/workspace/members; four distinct rights |
| Exact preview | `POST /templates/:id/preview` | `preview_template` | Server PDF/page navigation |
| Original import | `POST /datasets` multipart/JSON | `import_dataset`, `import_json_dataset` | CSV/XLSX/XML/JSON |
| Profile/read | `GET /datasets`, `/:id`, `/:id/profile` | `list_datasets`, `get_dataset`, `profile_dataset` | Sheets/rows/headers/anomalies/paged preview |
| Analysis recovery | `POST /datasets/:id/retry-analysis` | `retry_dataset_analysis` | Explicit same-original retry after temporary failure |
| AI proposal | `POST /datasets/:id/analyze` | `analyze_dataset` | Mapping or new schema/template; explicit review/adoption |
| Mappings | `GET/POST /mappings`, `/:id`, `/:id/validate` | `list_mappings`, `get_mapping`, `create_mapping`, `validate_mapping` | Independent version, grouping/join/reuse/validation |
| Generation | `POST /generation-jobs` | `generate_documents` | Single form or validated-mapping batch |
| Tracking/provenance | `GET /generation-jobs`, `/:id`, `/:id/results`, `/:id/provenance` | `list_generation_jobs`, `get_generation_job`, `get_generation_results`, `get_generation_provenance` | Progress/PDF/errors/source cells |
| Cancel/retry | `POST /generation-jobs/:id/{cancel,retry}` | `cancel_generation_job`, `retry_generation_records` | Cancel or retry designated failed records |
| Distribution | `POST /distribution-plans`, `GET /distribution-plans/:id` | `prepare_distribution`, `get_distribution_plan` | Selection/common or frozen-field recipients/explicit multichannel |
| Resume preparation | `POST /distribution-plans/:id/resume` | `resume_distribution` | Remaining entries or designated preparation errors |
| Postal checks | `POST /distribution-plans/:id/entries/:entryId/postal-preflight` | `create_distribution_postal_preflight` | Existing postal review bound to frozen entry |
| AI policy | `GET/PUT /dataset-ai-policy` | Read-only `get_dataset_ai_policy` | Browser administrator; human-only activation/transfer authority |

`apps/web/public/openapi.json` is generated for this module by
`scripts/update-template-openapi.ts`. Distinct scopes are
`templates:read/write/publish/share`, `datasets:read/write`, `generations:read/write`.
Document/dispatch scopes keep their roles. No copied browser session, invented API
key or implicit delegation is added. Static integration examples list requestable
scopes; editing them grants no authority to existing connections.

## Business guarantees

Published versions are immutable snapshots; edits open drafts/new publication
creates a new version. Job creation resolves/fixes template, data, mapping and
hashes. Lists/status never start work. Mutations begin bounded `waitUntil` work;
cron resumes persisted records with leases, at most three attempts, authority
checks and cancellation. Existing Queues still serve dispatches. Recovery reuses
already-stored PDFs.

Maximum generation: 500 records, three active jobs/organization, 64 KiB/record,
1,900,000-byte payload. Atomic creation uses set-based JSON insertion rather than
500 batch requests. Idempotency binds tenant/content. Stable `recordId` survives
out-of-order rendering.

Template sharing grants no other owner's datasets/mappings/jobs/private PDFs,
even to administrators. Document/preview/derived dispatch/campaign guards preserve
ownership. Equal generated bytes never reveal another user's private document.
Async work rechecks membership, OAuth and use-right revocation. Private means owner-only,
with the separately documented dispatch-review exception after preparation.

Distribution freezes record → document/version/hash → channel/recipient.
`recipientFields` resolves frozen record data, not reparsed files. Multiple
recipients remain separate dispatches; multiple channels require
`explicitMultichannel:true`. Web destinations apply to all selected records or a
named subset; with several selected PDFs a new destination starts with none, so
every association is chosen, and the form lists the exact destination/channel/PDF
pairs and the batch freeze below before preparing. Identical bytes shared by different records still receive common
multichannel checks. Plans create no approval, provider attempt or credit reservation.
Postal preparation referencing a qualified draft may read provider pricing without
submitting. Entry errors stay visible. First plan freezes the entire batch,
including excluded records; later retries return `GENERATION_FROZEN`. Finish
retries first or create a new batch. Plan preparation recovery differs from
generation retry and sending.

Actual channels, verified senders, quotes, billing, Review mode, postal checks and
mandates remain existing Guteneo gates. A UI option does not activate transport.
Unknown provider outcomes require reconciliation. Email has subject/body separate
from PDF, one record/PDF per preparation, no CC/BCC grouping, and explicit blocking
of unqualified attachments.

## Local setup and AI

```sh
npm ci
npm run db:migrate
npm run db:seed
npm run dev
```

Open `http://localhost:8787/#/app`; the **Simulation** banner is mandatory. The local
document browser is real, antivirus is simulated in this mode. Production still
requires scanner, identity, bindings and provider configuration.

AI assistance needs `DATASET_OPENAI_API_KEY` plus explicit `DATASET_OPENAI_MODEL`.
Secrets alone give no transfer consent: a browser administrator enables organization
policy, transfer and daily call budget. No key was created/configured and no
inference executed during recovery. Presence checks exposed no value; configuration
choice remains the user's. Unchanged recovered adapters use Responses structured
outputs, `store:false`, bounded samples, no tools or sending authority. Proposals
always require review; validated templates/mappings run deterministically afterwards.
`proposeSchema:true` may propose fields/editable template in the same analysis
call: server-built/validated schema, synthetic examples, at most 24 simple fields
and four ten-column arrays. Web shows sources/types and saves private draft/mapping
only after explicit adoption. Historical AI doubles were not rerun on 2 October
and measure no real model quality. No AI Gateway or EU-residency promise is claimed.

## Exact demonstration

### Web

1. In Templates choose Business letter, or import external-evidence `template-engine/word-source.docx`; inspect Word warnings.
2. Move a Designer block, add a business variable, save revision and publish. In Data and generation, fill fields, inspect server PDF or generate without sending.
3. In My data import `tests/fixtures/datasets/clients-reordered.csv`; choose target template, client key and business columns; validate every row/count and correct anomalies first.
4. For client/line-item data use `clients-articles.xlsx`, pre-header titles and two sheets. `examples/template-workflow/clients-articles.mapping.json` demonstrates validated sheet joins and explicit date/amount conventions.
5. In Generations (each named after its template and version, with its state) inspect PDFs/provenance, select ready results and Prepare distribution; the per-send cap is entered in euros and sent in integer cents. Choose common recipients or data paths. Manifest/blockers remain readable; human approvals use existing dispatch flow. Automated qualification stops before approval/sending.

### API and assistant

[Executable examples](../examples/template-workflow/README.md) document scripts and
proof. `api.mjs`/`mcp.mjs` create/publish a template, generate two records and inspect
results using an authorized environment-supplied OAuth bearer. Local proof uses
only the repository simulation token, not remote machine-OAuth qualification.
An assistant on the candidate server may follow:

> Read capabilities. Create a template from `create-template.json`, add a business
> column with `update_template` and `add_table_column`, then publish the expected
> revision. Import XLSX through the host's advertised file transport, read its
> paged profile, create/validate the supplied mapping. Generate without sending;
> follow the job and inspect PDFs/provenance. Prepare distribution only with the
> supplied explicit associations; confirm no dispatch.

If private file transfer is unsupported, explain and use web upload. Never rebuild
an original from an extract or make it public. Integration `document-studio/SKILL.md`
defines the journey without assistant-created human consent. Rebuilt local packages
are not marketplace publication.

## 2 October candidate verification

Current external evidence:
`/Users/nclsppr/Developer/.artifacts/guteneo-templates-20261002`, machine summary
`verification.json`. September observations remain historical; subsets/reruns are
not added to broad totals.

| Local scope | Result/evidence |
| --- | --- |
| Non-AI unit/integration | **1,540 passed in 82 files**; two files failed initialization, leaving 31 unexecuted (`non-ai-tests.log`), from fixtures missing `documents.access_owner_id`. After correction LU **3/3** (`historical-fax-regressions.log`) and fax preparation **28/28** (`fax-review-final.log`) passed. Focused recovery is not a new full green run. |
| Data/runtime | **29 data tests + one workerd test passed**, included above: CSV/XLSX/JSON/XML, lexical values, nested addresses, joined line-item tables, explicit paths and bounded XML refusal. |
| Workflow | **27 non-AI focused cases passed**, including privacy/revocation/cancellation; subsets are not added. |
| Templates/rendering | **20 passed**, included above. Five real-handler isolated-Chromium PDFs: 1/30/200-line invoices, long letter, Word import. Markers/page bounds/pagination/no external requests verified. |
| Security/contract | **215 security checks passed** (`security-tests.log`), including **seven OpenAPI checks** for exact 60-operation inventory, scopes, browser approval and idempotency. |
| Scanner | **29 JavaScript + 38 Python tests passed** on 2 October; terminal observation without exported log in that folder; no hosted-antivirus qualification. |
| Browser studio | **22 passed, eight intentional skips** (`studio-browser.log`); mobile graphical editing skipped in both mobile projects. Mapping/distribution checked on desktop/mobile Chromium/iPhone WebKit. |
| XML/language/keyboard | **6/6 passed** in three projects (`studio-table-a11y-final-browser.log`): per-record XML channel/recipient without sending; locale change retains customer title/unsaved edits; Tab/visible table focus, real arrow scroll and keyboard selection. This enriches the same six `xml-language-browser-final.log` cases, not additional cases. |
| Workspace navigation | **21/21 passed** (`studio-navigation-regression.log`): private routes, focus, session, translated navigation/mobile. |
| Public preview | **76 passed, six intentional skips** (`preview-tests.log`); separate fixtures without studio business capabilities. |
| Migrations | **46 migrations, 296 schema objects**, equivalent source/transport, `quick_check=ok`, no foreign-key violation (`migration-transport.json`). |
| Executable examples | REST/MCP/dataset scripts **exit 0** (`example-api.log`, `example-mcp.log`, `example-dataset-api.log`), each two ready PDFs. Dataset example reuses mapping and checks four associations across two plans: zero approval/provider attempts, unchanged credits/quotas. |
| Build/dependencies | Full typecheck/lint after final keyboard fix; application/web/preview builds, API/document-Worker dry runs (`build.log`, `final-web-build.log`, `preview-build.log`, `documents-build.log`). Final web/focused lint reran (`studio-table-a11y-final-build.log`, `studio-table-a11y-final-lint.log`). `npm audit --omit=dev`: **zero production vulnerabilities** (`npm-audit.json`); three known development alerts excluded. `lint.log` retains an earlier failed attempt, not the successful rerun. |

Focused Resend recovery also passed **8/8** with intercepted transport
(`resend-regression.log`), no real delivery. Logs retain initial attempts/reruns
separately. No final-commit CI, complete application-browser suite or remote
qualification is claimed here. AI is excluded: no key/call, unchanged recovered
adapters and tests awaiting the user's configuration choice.

## Remaining limits

- Real-handler local isolated Chromium/workerd proof establishes no hosted Cloudflare CPU/memory bounds or sustained 500-render load.
- Word retains editable content, not Word styles/pages/images. `.doc`/`.docm` excluded; the spike is an actual synthetic file.
- Graphical editing qualified on desktop; mobile supports reading/forms/mapping/tracking. Lazy Designer: approximately 6.52 MB minified JS/2.16 MB gzip. Document Worker: 2,828.43 KiB gzip (approximately 2.76 MiB). Initial slow-network cost remains to monitor.
- Bundled fonts cover the checked FR/DE/English/euro corpus; missing glyphs fail. Arbitrary layout, external fonts and intentional block overlap are unsupported.
- Real AI quality/cost/latency, hosted office-source antivirus, ChatGPT/Claude/Cursor file transport, providers and remote machine OAuth need separate authorized qualification.
- The initial candidate work itself performed no merge, production deployment, real send, payment, activation or paid provisioning; later authority is dated above.

## Recovery and postal checks

`POST /api/datasets/:id/retry-analysis`/`retry_dataset_analysis` preserve original
hash/encoding/separator. Initial attempt counts toward three; 90-second lease
prevents concurrent analysis. Security rejection never becomes ready by retry.
Web exposes state/deadline/explicit retry; reads start nothing. Failed Word import
before template creation needs a new import.

Distribution performs at most three preparations per mutation. Two statements
atomically insert up to 500 manifest entries; `pendingCount`/`errorCount` remain
visible. Explicit `/distribution-plans/:id/resume`/`resume_distribution` handles
next entries or preparation errors with `retryFailed:true`, never unknown provider
attempts.

Postal entries freeze sender/ceiling/three print options.
`POST /api/distribution-plans/:id/entries/:entryId/postal-preflight`/
`create_distribution_postal_preflight` needs both `documents:write` and
`dispatches:prepare`. It may read configured provider profile, but transfers no
PDF, creates no draft and grants no consent. Existing review/authorized transfer/
quote remain. No automatic PDF correction: edit template, regenerate and create
an explicit new plan, preserving original/manifest. Plan exposes review/eventual
final dispatch separately from frozen original PDF; web links each row. Missing
options require a new explicit manifest.

Publication validates contract/sample data, not a prior rendered preview. Server
preview/generation rejects overflow; inspect final PDF before distribution.

## XML and data-selected channels

UTF-8 XML preserves lexical values and refuses DTDs, external entities, mixed
content and ambiguous structures. `xmlRecordPath` explicitly selects a collection,
for example `/export/clients/client`. Repeated lines become sheets joined by
`__xml_record_id`/`__xml_parent_id`, explicitly mapped; see [DATA_IMPORT.md](DATA_IMPORT.md).

Each distribution entry chooses `channel` **or** `channelField`; the latter resolves
only fax/email/postal from frozen data. Use shared `recipientFields` or
`recipientFieldsByChannel`; `senderIdsByChannel`/`optionsByChannel` prevent cross-channel
sender/postal-option misuse. Manifest retains resolved channel/recipient/sender/
options. Server guesses neither address nor channel. Corrections require explicit
new preparation with existing approval, pricing and postal-transfer guards.
