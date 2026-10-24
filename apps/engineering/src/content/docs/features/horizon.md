---
title: "Horizon PDF diagnostics"
description: "10 capabilities in the operate branch of Guteneo."
sidebar:
  order: 19
---

<!-- Generated from docs/feature-map.json. Run npm run docs:build; do not edit this view. -->

**Access boundary:** Current capability and authority required.

Implemented diagnostics/subscription contracts; runtime capability, private validator and scanner gates apply.

**Surfaces:** Web, REST and MCP diagnostics; browser administrator alone manages recurring subscription.

[Read the engineering guide](/workflows/pdf-diagnostics/) · [All features](/features/)

## Capabilities

<ol>
<li id="feature-48ec5c5c6ba0">EUR30 monthly subscription from available credits, including remaining welcome credits for the first period; private /app/plan entry</li>
<li id="feature-84303d6b173c">Immutable recurring consent by a browser administrator</li>
<li id="feature-a371725e3ff2">Cancellation, renewal and suspension without debt; top-up remains unavailable</li>
<li id="feature-f3e5896f7439">100 attempts per calendar month under atomic quota</li>
<li id="feature-7f69dc7a2ab1">Pinned private veraPDF for PDF/UA-1/-2 and PDF/A-1b/2b/3b/4, with official positive/negative corpus and separate offline/hosted qualification</li>
<li id="feature-3514ffcd12c5">Exact-byte reports, history and JSON export</li>
<li id="feature-d6d333ccb610">Web/MCP diagnostics with required human review; same-key recovery for uncertain network responses and new-key independent checks</li>
<li id="feature-d62cce35c19a">Public/server availability share HORIZON_ENABLED, private validator and production scanner gates; activation after hosted qualification, never legal certification</li>
<li id="feature-5fc00307842b">PDF-accessibility exclusions apply to originals and existing reports; person-redacted recovery without web bypass</li>
<li id="feature-d70787c4f4ff">Home → signed-in workspace → home preserves private capability reads and performs one fresh public read after failure, without writes or stale availability inference</li>
</ol>

## REST operations

- `GET /api/documents/{id}/validation`
- `POST /api/documents/{id}/validation`

Read the [REST integration guide](/integrations/rest-api/) for authentication, errors and contract discovery.

## MCP tools

- `get_pdf_validation`
- `validate_pdf`

Read the [MCP integration guide](/integrations/mcp/) for scope, approval and host boundaries.
