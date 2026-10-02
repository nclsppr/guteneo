# Executable template workflow examples

The `api.mjs` and `mcp.mjs` scripts create a private template from `create-template.json`, publish its
first immutable version, and generate the two synthetic records from
`generate-records.json`. They poll the durable job until terminal status and print
only resource identifiers, hashes, document statuses and error codes. They do not
prepare a distribution, approve, reserve sending credit or call a communication
provider. A failed or interrupted job remains durable: retain its job ID and
idempotency key rather than rerunning the whole script as a retry.

Provide an authorized delegated OAuth bearer in `GUTENEO_BEARER_TOKEN` through your
secret environment, with `templates:write`, `templates:publish`,
`generations:write` and `generations:read`. The authenticated MCP capability call
does not add a dispatch scope requirement. Set `GUTENEO_ORIGIN` to the
intended Guteneo origin. HTTPS is required except on loopback, and redirects are
rejected. Neither script prints or persists the bearer. No browser cookie or new
API-key mechanism is used by the example itself.

```sh
node examples/template-workflow/api.mjs
node examples/template-workflow/mcp.mjs
```

The default origin is `http://localhost:8787`. Local verification uses only the
existing `/api/dev/login` and `/api/dev/mcp-token` simulation helpers to obtain a
one-hour development bearer in process memory. Those helpers are forbidden in
hosted production. The scripts are not evidence of machine-to-machine production
OAuth qualification, real-host file transfer or provider delivery.

## Discover rules, create a demonstration and delete its private copy

```sh
node examples/template-workflow/authoring-mcp.mjs
```

This SDK Streamable HTTP example requires `templates:read`, `templates:write`,
`generations:write` and `documents:read`, with the same origin and bearer rules
above. It discovers the advertised tools, reads `get_template_authoring_guide`,
lists the five examples and obtains the complete `quote` envelope. It creates a
private synthetic copy, renders its sample data with `preview_template`, deletes
only that copy using its current revision, then verifies that the template is
unavailable and its private preview PDF remains accessible. It does not publish,
share, create a generation job or prepare a communication. No internal AI
configuration or inference is needed.

The server guide includes the current JSON schemas, allowed graphic properties,
semantic validation rules, limits and a complete minimal envelope. The
[plugin reference](../../integrations/guteneo/skills/document-studio/references/template-authoring.md)
also documents the authoring sequence. Reading the guide or catalogue does not
create a saved model. If a run is interrupted, inspect its printed template ID
before cleanup; the script never retries a mutation automatically.

Fresh local execution on **2 October 2026**, after migration
`0047_template_soft_deletion.sql`: **exit 0**. It discovered five examples,
created and deleted `tpl_5b440fff-5120-4e48-b9b1-f2015e9545ec`, and confirmed
`doc_756d567d-c308-4b03-b43f-abd671cad381` remained `ready`. Evidence is in
`/Users/nclsppr/Developer/.artifacts/guteneo-template-demos-20261002/authoring-mcp.log`.
The ephemeral local bearer was held only in memory and its bootstrap session was
logged out. Rendering was real and local; scanning was simulated.

An initial run exposed an incorrect `get_document` argument in this example;
the script now uses `documentId`. A separate interrupted run left one synthetic
draft, which was inspected and deleted through the local API using its current
revision. Both unsuccessful logs and the bounded cleanup proof are retained
separately from the successful execution. No other saved model was removed.

## Local execution evidence — 2 October 2026

All three executable examples exited **0** against the reconciled local
application and document renderer, with migrations through
`0046_dataset_analysis_recovery.sql` applied. The candidate is based on main
`a808307c5687588eb8c0aab45c9e559aa70a03dc`; these are fresh executions, separate
from the historical jobs below. Logs are kept in
`/Users/nclsppr/Developer/.artifacts/guteneo-templates-20261002`.

| Transport | Job | Observed outcome |
| --- | --- | --- |
| REST, `example-api.log` | `gen_3fe45d98-a72d-4552-b16e-9a2ae8d73731` | `completed`; two distinct PDFs; `customer-001` and `customer-002` both `ready`; hashes returned; no errors |
| SDK Streamable HTTP MCP, `example-mcp.log` | `gen_7822419a-aec6-4e83-9c17-4c46474d9f29` | `completed`; two distinct PDFs; the same two record IDs both `ready`; hashes returned; no errors |
| XLSX import, mapping reuse and distribution, `example-dataset-api.log` | `gen_960e99fc-ed3e-4992-9a1a-9904c3e80b7d` | `completed`; `record-3` and `record-4` both `ready`; mapping reused without AI; four record/PDF/recipient associations verified |

The XLSX execution reused `map_99e279b1-55ed-4ca3-95f5-279a8d238170` version 1
for sources `data_2bf8a112-5350-434a-8d84-f9a6ae4ff6cf` and
`data_ec115b27-e0ce-4467-9108-d4a6b91634e2`. Common-destination plan
`dist_6b7f01c1-4936-4e42-a9e3-861ddb5a4ff8` and field-resolved plan
`dist_eb99928d-e9dc-405e-8e40-1d6569311bd2` each contained two prepared drafts.
Readback confirmed **zero approvals, zero provider attempts, and unchanged
sending-credit/quota counters**. This XLSX example does not exercise XML or
mixed-channel delivery; those have separate local tests in the
[verification report](../../docs/TEMPLATES_DATA_DISTRIBUTION.md).

The ephemeral development bearer was held only in process memory, never saved or
printed; the temporary local bootstrap session was logged out. These runs use
synthetic input, actual local PDF rendering and simulated scans. No inference,
real communication, remote migration, hosted deployment or production OAuth
qualification occurred.

## Historical local execution evidence — 21 September 2026

Both scripts exited **0** against the local application and document renderer,
after local migrations through the then-named `0035_generation_provenance.sql`
were applied. That historical migration became `0044_generation_provenance.sql`
in the 2 October integration; the September execution did not use the new number.
The development bearer was neither printed nor saved; its temporary browser
bootstrap session was logged out after execution.

| Transport                                            | Job                                        | Observed outcome                                                                                           |
| ---------------------------------------------------- | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| REST with development bearer                         | `gen_24c6dd27-102d-4be5-ab5b-5eb17a03aede` | `completed`; two distinct PDFs; `customer-001` and `customer-002` both `ready`; hashes returned; no errors |
| Real SDK Streamable HTTP MCP with development bearer | `gen_bcf76792-b88f-4d09-8043-b27af8e2a447` | `completed`; two distinct PDFs; same two record IDs both `ready`; hashes returned; no errors               |

An initial REST attempt returned `INTERNAL_ERROR` because the running local
database had not yet received the newly added provenance migration. Applying that
additive local migration corrected the environment; the successful executions
above are fresh jobs, not claims that the failed call completed. No production
database or remote service was changed.

The MCP example now waits for terminal job status instead of immediately printing
possibly queued results, and both examples avoid printing document links or
payloads. These are real local API/MCP and PDF-rendering checks using synthetic
input and local scan simulation; no live antivirus, OpenAI inference, customer
data or communication provider was involved.

## XLSX import, mapping reuse and prepared distribution

```sh
node examples/template-workflow/dataset-api.mjs
```

This example requires `datasets:read`, `datasets:write`, `templates:write`,
`templates:publish`, `generations:write`, `generations:read`,
`dispatches:prepare` and `dispatches:read`. It uses the same origin/bearer rules as
the other examples; it does not bootstrap a session or obtain credentials.

`clients-articles-fax.xlsx` derives from the synthetic Clients/Articles test
workbook, with an explicit Fax column added for both synthetic customers.
`dataset-mapping.json` retains the title-row offset, explicit DMY dates, postal
code strings, integer quantities, exact minor-unit amounts and one-to-many join.
It adds the source ID as the invoice reference and the Fax column as
`customer.fax`. The supplied invoice schema is extended in the script to declare
these fields. The fixture numbers do not authorize sending or assert control of
an actual destination.

The script imports identical XLSX bytes twice and validates both with the same
immutable mapping version, without calling an AI endpoint. It generates two PDFs
from the second source and checks their source hash and mapping provenance. It
then prepares two separate plans: one common destination and one destination
resolved from each record’s frozen `customer.fax`. Entries are deliberately
reversed to prove that association uses record IDs. Each prepared draft is read
back to verify the exact PDF, template version, recipient, absent approval and
zero provider attempts. Only identifiers, hashes and proof flags are printed;
recipients, source rows and document URLs remain out of the console.

Preparation may span bounded requests; the example resumes the stored plan for
pending entries. It never calls approval, confirmation, transfer or sending
endpoints. Sending-credit and quota counters are compared before and after. Run
this final comparison without concurrent activity on the same organization: an
independent send would correctly cause `USAGE_CHANGED_DURING_EXAMPLE_CHECK_CONCURRENT_ACTIVITY`.

Historical local execution on 21 September 2026, after the then-named migration
`0037_dataset_analysis_recovery.sql` (now `0046_dataset_analysis_recovery.sql`
in the 2 October integration): **exit 0**. Sources
`data_dc57faed-9a60-4b27-817a-130d3168ab96` and
`data_c07a343c-e65b-4e6f-8869-a6559b1d1819` had identical SHA-256 hashes and reused
`map_1eb75820-17a9-4cc5-9772-0b25179491fd` version 1. Job
`gen_fa4bee20-6205-499f-a453-868906ad8758` completed with distinct ready PDFs for
`record-3` and `record-4`. Both provenance checks passed. Common-destination plan
`dist_b84d9eda-3bff-462b-bf1a-cfa66f9b2812` and field-resolved plan
`dist_c68b0c71-874f-4e14-b8e2-b50cfb66d70a` each contained two prepared drafts.
All four record/PDF/recipient associations passed readback; approvals and provider
attempts remained zero, and sending-credit/quota snapshots were unchanged.

An earlier attempt stopped on its first upload while the concurrent dataset
analysis migration was absent from the local database; it did not prepare any
plan. The successful run used an ephemeral development bearer held only in process
memory, then logged out its temporary bootstrap session. These results qualify
local orchestration and PDF rendering with synthetic input and simulated scans,
not a real communication, hosted deployment or live antivirus.

## Optional new-schema proposal, never run implicitly

With organization-approved provider configuration and the existing
`datasets:write` scope, request a proposal through the same analysis operation:

```http
POST /api/datasets/{datasetId}/analyze
Content-Type: application/json

{"proposeSchema":true,"instruction":"Un document par client avec ses lignes d’articles."}
```

The equivalent MCP call is `analyze_dataset` with
`{ "id": "<datasetId>", "proposeSchema": true, "instruction": "Un document par client avec ses lignes d’articles." }`.
The response remains `needs_review` and adds
`schemaSuggestion.inputSchema`, `schemaSuggestion.envelope`, a readable `fields`
list and `warnings`, alongside the mapping and bounded validation examples.
Review the proposed paths, types and joins before explicitly calling
`create_template` / `POST /api/templates` with the returned envelope, and
`create_mapping` / `POST /api/mappings` with its mapping. These actions create
private drafts; they do not publish, generate or prepare sending.

No executable example here automatically requests this paid analysis. The
recovered adapters remain unchanged and inactive. Historical adapter/API tests
used explicit synthetic provider doubles; all AI tests were excluded from the
2 October verification while the user's configuration choice is pending. No key
was created/configured and no inference was performed. Real model quality,
provider account permissions and actual inference remain unqualified.
