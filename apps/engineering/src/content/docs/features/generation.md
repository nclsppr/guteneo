---
title: "PDF generation and distribution"
description: "14 capabilities in the create branch of Guteneo."
sidebar:
  order: 6
---

<!-- Generated from docs/feature-map.json. Run npm run docs:build; do not edit this view. -->

**Access boundary:** Current capability and authority required.

Implemented; generation, preparation, approval and delivery remain separate.

**Surfaces:** Web Studio under /app/studio/… and Correspondence preparation /app/distribution/new plus frozen detail /app/distribution/:id, REST and MCP; generation is separate from distribution and delivery. Browser-only owner-authorized record-context supplies correction inputs and is excluded from the OAuth OpenAPI paths.

[Read the engineering guide](/workflows/studio-and-data/) · [All features](/features/)

## Capabilities

<ol>
<li id="feature-24b0ccee25f9">Single PDF from a business form</li>
<li id="feature-fcebd62d65fc">PDF batch from a validated mapping</li>
<li id="feature-c31b120306da">Progress, per-record results and source-cell provenance; only local simulation emits finite failure phase/category diagnostics through the captured error channel, never raw errors or customer data; terminal failed/partial XML test results stop polling while preserving both expected exact PDFs and zero sending, and a separate macOS pass does not establish the cause of an earlier Linux failure</li>
<li id="feature-af8ac87b8693">Exact authorized generated-document analysis state distinguishes processing, retryable and blocked results; bounded visible refresh follows pending scans after generation completes without changing readiness, stealing focus or retrying analysis</li>
<li id="feature-446f64517f9f">Generation cancellation and retry of failed records only</li>
<li id="feature-1ea775d9973a">PDF selection in Studio opens the single Correspondence-owned preparation form with bounded record IDs; arrival revalidates every selected ready result in 50-record pages, performs no navigation write, and Back/Forward/reload preserve the selection</li>
<li id="feature-d4d0fd9899d1">The first plan permanently freezes the full batch, including excluded failed records; prepare_distribution declares destructiveHint true</li>
<li id="feature-41281e978398">Common recipient or frozen columns with an explicit channel per record</li>
<li id="feature-8d3448a860b7">Resume remaining entries without duplication</li>
<li id="feature-95d7b0497306">Entry-linked postal preflight with separate review and sending</li>
<li id="feature-b7f28cbf0e72">Known assistant-excluded content is never generated, previewed, shared or distributed; request a person-redacted version and never treat scanning as proof of absence</li>
<li id="feature-104e3c6ee4e1">Browser results show bounded name/subject/reference labels without changing record identifiers; the browser-only owner-authorized record-context read supplies labels or one explicit correction input, with current tenant/creator guards and no MCP/native authority</li>
<li id="feature-5b165c326795">Import/replacement retain the selected template/version and compatible field mapping/record exclusions; correcting data or a template creates a new generation/version while prior PDFs and prepared manifests retain their exact hashes</li>
<li id="feature-4966475eb55a">Every new destination starts with zero documents even for one PDF; unsaved preparation may veto departure and late preparation/postal replies cannot navigate obsolete visits; the pre-preparation summary lists exact associations and explains that the first plan freezes the full generation, including excluded failed records</li>
</ol>

## REST operations

- `GET /api/generation-jobs`
- `POST /api/generation-jobs`
- `GET /api/generation-jobs/{id}`
- `GET /api/generation-jobs/{id}/results`
- `GET /api/generation-jobs/{id}/provenance`
- `POST /api/generation-jobs/{id}/cancel`
- `POST /api/generation-jobs/{id}/retry`
- `POST /api/distribution-plans`
- `POST /api/distribution-plans/{id}/resume`
- `POST /api/distribution-plans/{id}/entries/{entryId}/postal-preflight`
- `GET /api/distribution-plans/{id}`

Read the [REST integration guide](/integrations/rest-api/) for authentication, errors and contract discovery.

## MCP tools

- `cancel_generation_job`
- `create_distribution_postal_preflight`
- `generate_documents`
- `get_distribution_plan`
- `get_generation_job`
- `get_generation_provenance`
- `get_generation_results`
- `list_generation_jobs`
- `prepare_distribution`
- `resume_distribution`
- `retry_generation_records`

Read the [MCP integration guide](/integrations/mcp/) for scope, approval and host boundaries.
