---
title: "Data and mappings"
description: "11 capabilities in the create branch of Guteneo."
sidebar:
  order: 5
---

<!-- Generated from docs/feature-map.json. Run npm run docs:build; do not edit this view. -->

**Access boundary:** Current capability and authority required.

Implemented; private-source and optional AI-transfer gates apply.

**Surfaces:** Web Studio space under /app/studio/…, REST and MCP; private source/mapping ownership.

[Read the engineering guide](/workflows/studio-and-data/) · [All features](/features/)

## Capabilities

<ol>
<li id="feature-c30d6283604c">CSV, XLSX, XML and JSON imports with a private original</li>
<li id="feature-64c7925c6cc6">MCP JSON dataset metadata declares arrays of objects or named arrays of objects to match existing parsing; nested values, runtime errors/recovery, request/cell bounds and private ownership remain unchanged, without new host-file or AI-transfer authority</li>
<li id="feature-4505e9415713">Sheet/header selection and XML record paths</li>
<li id="feature-34984f3b9bc1">English generated Data sheet names, with provenance-bound legacy aliases; uploaded XLSX and explicitly named JSON tables require exact mapping and join names</li>
<li id="feature-2e7661d36254">Profiling, anomalies and paginated inspection</li>
<li id="feature-8b84483a97d3">Resume analysis of the same original</li>
<li id="feature-9bf3c806a59c">Versioned field/group/join mappings</li>
<li id="feature-60e0a2bf28d6">Mapping validation before generation; browser validation waits for the exact selected template payload rather than its identifier alone, using existing loaded-resource state without extra effects or requests</li>
<li id="feature-70426d795853">Optional AI analysis under browser-administrator policy and transfer consent</li>
<li id="feature-40ccaa008315">Document-studio exclusions also cover datasets, direct records and AI functions; stop reading/profiling/mapping/generation on known excluded content without collecting its values</li>
<li id="feature-c9d57cd7c922">Compatible replacement imports retain the current template/version, field correspondence and valid record selection; cell/person/field errors remain actionable without mutating prior generated content</li>
</ol>

## REST operations

- `GET /api/datasets`
- `POST /api/datasets`
- `GET /api/datasets/{id}`
- `POST /api/datasets/{id}/retry-analysis`
- `GET /api/datasets/{id}/profile`
- `POST /api/datasets/{id}/analyze`
- `GET /api/mappings`
- `POST /api/mappings`
- `GET /api/mappings/{id}`
- `POST /api/mappings/{id}/validate`

Read the [REST integration guide](/integrations/rest-api/) for authentication, errors and contract discovery.

## MCP tools

- `analyze_dataset`
- `create_mapping`
- `get_dataset`
- `get_dataset_ai_policy`
- `get_mapping`
- `import_dataset`
- `import_json_dataset`
- `list_datasets`
- `list_mappings`
- `profile_dataset`
- `retry_dataset_analysis`
- `validate_mapping`

Read the [MCP integration guide](/integrations/mcp/) for scope, approval and host boundaries.
