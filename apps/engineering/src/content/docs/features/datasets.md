---
title: "Data and mappings"
description: "9 capabilities in the create branch of Guteneo."
sidebar:
  order: 5
---

<!-- Generated from docs/feature-map.json. Run npm run docs:build; do not edit this view. -->

**Access boundary:** Current capability and authority required.

Implemented; private-source and optional AI-transfer gates apply.

**Surfaces:** Web, REST and MCP; private source/mapping ownership.

[Read the engineering guide](/workflows/studio-and-data/) · [All features](/features/)

## Capabilities

<ol>
<li id="feature-c30d6283604c">CSV, XLSX, XML and JSON imports with a private original</li>
<li id="feature-4505e9415713">Sheet/header selection and XML record paths</li>
<li id="feature-c39779048368">English generated Data sheet names, with explicit legacy mapping aliases and exact uploaded-name precedence</li>
<li id="feature-2e7661d36254">Profiling, anomalies and paginated inspection</li>
<li id="feature-8b84483a97d3">Resume analysis of the same original</li>
<li id="feature-9bf3c806a59c">Versioned field/group/join mappings</li>
<li id="feature-46faf4660e81">Mapping validation before generation</li>
<li id="feature-70426d795853">Optional AI analysis under browser-administrator policy and transfer consent</li>
<li id="feature-40ccaa008315">Document-studio exclusions also cover datasets, direct records and AI functions; stop reading/profiling/mapping/generation on known excluded content without collecting its values</li>
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
