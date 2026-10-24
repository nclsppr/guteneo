---
title: "Documents and protection"
description: "8 capabilities in the create branch of Guteneo."
sidebar:
  order: 3
---

<!-- Generated from docs/feature-map.json. Run npm run docs:build; do not edit this view. -->

**Access boundary:** Current capability and authority required.

Implemented; exact-byte, scanner and owner-access gates apply.

**Surfaces:** Web, REST and MCP with current document authority; native import/inspection subset.

[Read the engineering guide](/workflows/documents/) · [All features](/features/)

## Capabilities

<ol>
<li id="feature-d76f3e9e1591">Bounded PDF upload and remote import with English API diagnostics and only a sanitized public source hostname</li>
<li id="feature-28b984312799">Search, paginated listing, metadata and page reading</li>
<li id="feature-142f39adb7ae">Quarantine, real antivirus, exact hash and PDF validation</li>
<li id="feature-58827408ac65">Resume analysis of the same document without reimport</li>
<li id="feature-c139a21c4cc1">Browser-administrator scanner warm-up</li>
<li id="feature-852540f19465">Isolated HTML-to-PDF rendering into an immutable document</li>
<li id="feature-2e15c951f0fe">Private storage, quotas, retention and owner-level privacy</li>
<li id="feature-4435f9363dca">Assistant exclusions announced before content collection/processing; known excluded content is not imported/read even when stored or ready; scanning never proves its absence</li>
</ol>

## REST operations

- `GET /api/documents`
- `POST /api/documents`
- `POST /api/documents/render`
- `GET /api/documents/{id}/content`
- `POST /api/documents/{id}/rescan`
- `GET /api/documents/{id}`

Read the [REST integration guide](/integrations/rest-api/) for authentication, errors and contract discovery.

## MCP tools

- `get_document`
- `import_document`
- `list_documents`
- `read_document_pages`
- `render_pdf`
- `rescan_document`

Read the [MCP integration guide](/integrations/mcp/) for scope, approval and host boundaries.
