---
title: "Documents and protection"
description: "13 capabilities in the create branch of Guteneo."
sidebar:
  order: 3
---

<!-- Generated from docs/feature-map.json. Run npm run docs:build; do not edit this view. -->

**Access boundary:** Current capability and authority required.

Implemented; exact-byte, scanner and owner-access gates apply.

**Surfaces:** Web/native and existing REST/MCP document access; bounded private upload reservation/status through MCP plus one upload-only binary PUT. Actual host original-file/code/network transfer and physical iPhone evidence remain separately qualified.

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
<li id="feature-9b63dcc8d8fc">Creator-private MCP original-file reservation with actual basename, integer byte count and SHA-256; unchanged documents:write plus current writer and connection authority</li>
<li id="feature-5956c46cf48c">Upload-only 256-bit capability is returned only by reservation, hashed at rest, limited to five minutes/token expiry and claimed before a 30-second bounded binary PUT; no OAuth token, public PDF link, browser cookie or provider upload authority</li>
<li id="feature-abad6a098d4d">Exact-size/hash private upload feeds the existing antivirus/quarantine/100-page pipeline under the same planned document ID; connection/trust/membership/expiry rechecks and same-ID status recovery refuse blind retries on unknown outcomes</li>
<li id="feature-733a5cf0d42e">Host file/code/network access and physical Claude iPhone OAuth/file transfer require separate qualification; attachment previews, extracted text, tool discovery and desktop helpers do not prove original-byte transfer</li>
<li id="feature-2eb40b63af49">Reservation can return deterministic POSIX Python 3.9+ standard-library client code with its SHA-256 for authorized local/cloud execution; status never returns code/capability, and no package install, external script fetch or actual host qualification is implied</li>
</ol>

## REST operations

- `GET /api/documents`
- `POST /api/documents`
- `POST /api/documents/render`
- `GET /api/documents/{id}/content`
- `POST /api/documents/{id}/rescan`
- `GET /api/documents/{id}`
- `PUT /api/document-uploads/{id}/content`

Read the [REST integration guide](/integrations/rest-api/) for authentication, errors and contract discovery.

## MCP tools

- `begin_document_upload`
- `get_document`
- `get_document_upload`
- `import_document`
- `list_documents`
- `read_document_pages`
- `render_pdf`
- `rescan_document`

Read the [MCP integration guide](/integrations/mcp/) for scope, approval and host boundaries.
