---
title: "Assistants and API"
description: "20 capabilities in the interfaces branch of Guteneo."
sidebar:
  order: 13
---

<!-- Generated from docs/feature-map.json. Run npm run docs:build; do not edit this view. -->

**Access boundary:** Qualified assistant host required.

Implemented contracts/packages; actual host compatibility, OAuth and marketplace publication need separate evidence.

**Surfaces:** Web guides, REST/OpenAPI, MCP and host-specific installation packages.

[Read the engineering guide](/integrations/mcp/) · [All features](/features/)

## Capabilities

<ol>
<li id="feature-7084b008de17">Discover actual account capabilities and limits</li>
<li id="feature-f379fb2177b6">REST/OpenAPI and Streamable HTTP MCP catalogues</li>
<li id="feature-110e46005f25">ChatGPT, Claude web/Desktop/Code, Grok web/Build, Cursor and Copilot installation guides; OAuth qualification is per surface</li>
<li id="feature-a1c80dd6ef8b">Import through the file transport actually supported by the host</li>
<li id="feature-232fd93af26c">Document, template, dataset, generation and preparation tools</li>
<li id="feature-f09d41d8e258">Browser review before sending; scopes never elevate membership rights</li>
<li id="feature-418d10cba34a">Optional bounded expert delegation for one OAuth client</li>
<li id="feature-53a874c4c708">Complete review replaces the previous token for this dispatch/connection; review_dispatch declares destructiveHint true</li>
<li id="feature-d4b14eec2b6d">Only a browser administrator grants/revokes a mandate</li>
<li id="feature-ea5265e7fea1">Six portable package workflows with English metadata, deterministic archives and inventory checks; portal review/publication remains separately evidenced</li>
<li id="feature-a829c79594e7">Manual host-specific installation packages; downloading grants no OAuth consent</li>
<li id="feature-92524d02b874">Exact registered callback/client per host; DCR/CIMD advertising alone never proves installation</li>
<li id="feature-3bfae1148be0">Explicit MCP annotations disclose overwrites, archival, sharing revocation, generation cancellation, review-token replacement and batch freezing</li>
<li id="feature-475d99fe8372">Every advertised tool has four annotation booleans and per-tool evidence, audited through actual tools/list</li>
<li id="feature-832d1568e2f6">readOnlyHint/idempotentHint remain false where successful production calls persist visible connection activity; the side effect is disclosed centrally</li>
<li id="feature-1378c2afdfe0">Assistant restrictions cover files, text, templates, datasets, records, existing PDFs/reports; person-redacted recovery adds no automatic classification or new server guard</li>
<li id="feature-da0fda410e52">Single source version synchronises application, serverInfo and release/package manifests; builds reject version/connection drift</li>
<li id="feature-29008e5fe906">MCP bodies limited to 2 MiB and 120,000 elements; existing 100,000-cell business limit remains</li>
<li id="feature-bf0d4dc9dfef">Reproducible standalone Claude Code and relative-source local marketplace archives; six workflows without OpenAI metadata or tool preauthorisation</li>
<li id="feature-4f07976a9a4b">Developer guidance distinguishes canonical REST/MCP resource/issuer from optional browser Auth0 domain</li>
</ol>

## REST operations

- `GET /api/capabilities`

Read the [REST integration guide](/integrations/rest-api/) for authentication, errors and contract discovery.

## MCP tools

- `get_capabilities`
- `get_expert_status`

Read the [MCP integration guide](/integrations/mcp/) for scope, approval and host boundaries.
