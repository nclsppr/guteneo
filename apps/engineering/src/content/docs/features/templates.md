---
title: "Template studio"
description: "14 capabilities in the create branch of Guteneo."
sidebar:
  order: 4
---

<!-- Generated from docs/feature-map.json. Run npm run docs:build; do not edit this view. -->

**Access boundary:** Current capability and authority required.

Implemented; AI suggestions require configuration and organisation consent.

**Surfaces:** Web Studio space under /app/studio/…, REST and MCP; optional configured AI proposal service.

[Read the engineering guide](/workflows/studio-and-data/) · [All features](/features/)

## Capabilities

<ol>
<li id="feature-76f2f637ab54">Private, shared and organisation template libraries</li>
<li id="feature-da2b89a1db86">Five synthetic examples: letter, invoice, statement, quote and delivery note</li>
<li id="feature-dd83001d032c">Private copy or blank creation with the REST/MCP authoring guide</li>
<li id="feature-8665658cf5b3">Word DOCX content import with explicit layout warnings</li>
<li id="feature-3eada6ea27ff">Designer variables, tables, columns, logos, formats and conditions</li>
<li id="feature-e25350103202">Visible local PNG/JPEG image import above the visual editor; selected-page insertion preserves original bytes, aspect ratio, unique names and business bindings</li>
<li id="feature-868eba4e1c12">Save, publish and studio navigation wait for committed native property edits; invalid numeric fields and reverting values recover without saving stale geometry</li>
<li id="feature-af9781225f01">Business schema, sample data, calculations and totals</li>
<li id="feature-d9a8b8e4fb78">Review AI proposals before explicit application</li>
<li id="feature-900e2a6510e0">Exact PDF preview, immutable versions, publication, duplication and archival</li>
<li id="feature-9c139b80a7fb">Independent use, edit, publish and share rights</li>
<li id="feature-d893b0099d2f">Owner-only removal preserving historical PDFs and provenance</li>
<li id="feature-7ad6848682c7">Document-studio exclusions cover DOCX, text, existing templates and business data; stop known excluded content and request a person-redacted copy without web bypass</li>
<li id="feature-7da1eb053f33">AI suggestions revalidate edit rights, membership, OAuth connection, revision and transfer consent before inference and before returning; reject stale proposals without automatic application/publication</li>
</ol>

## REST operations

- `GET /api/templates/authoring-guide`
- `GET /api/templates/examples`
- `GET /api/templates/examples/{exampleId}`
- `GET /api/templates`
- `POST /api/templates`
- `POST /api/templates/import-docx`
- `GET /api/templates/{id}`
- `DELETE /api/templates/{id}`
- `PATCH /api/templates/{id}`
- `POST /api/templates/{id}/publish`
- `POST /api/templates/{id}/duplicate`
- `POST /api/templates/{id}/share`
- `GET /api/templates/{id}/sharing`
- `POST /api/templates/{id}/archive`
- `POST /api/templates/{id}/preview`
- `POST /api/templates/{id}/suggest`
- `GET /api/templates/{id}/schema`

Read the [REST integration guide](/integrations/rest-api/) for authentication, errors and contract discovery.

## MCP tools

- `archive_template`
- `create_template`
- `delete_template`
- `duplicate_template`
- `get_template`
- `get_template_authoring_guide`
- `get_template_example`
- `get_template_schema`
- `get_template_sharing`
- `import_docx_template`
- `list_template_examples`
- `list_templates`
- `preview_template`
- `publish_template`
- `share_template`
- `suggest_template`
- `update_template`

Read the [MCP integration guide](/integrations/mcp/) for scope, approval and host boundaries.
