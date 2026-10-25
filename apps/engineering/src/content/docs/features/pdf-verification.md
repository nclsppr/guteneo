---
title: "PDF verification"
description: "10 capabilities in the operate branch of Guteneo."
sidebar:
  order: 19
---

<!-- Generated from docs/feature-map.json. Run npm run docs:build; do not edit this view. -->

**Access boundary:** Current capability and authority required.

Individual purchase candidate; no new subscription or recurring renewal. Runtime capability, private validator, scanner and final release qualification remain separate.

**Surfaces:** Web browser administrator purchases; REST and MCP retain current document-scoped history reads and cannot create assistant financial consent.

[Read the engineering guide](/workflows/pdf-diagnostics/) · [All features](/features/)

## Capabilities

<ol>
<li id="feature-87af61106655">Individual exact-PDF/profile purchase from available account credits; current integer EUR price and excluding-tax terms come from the authenticated pricing endpoint</li>
<li id="feature-08bd83f34855">Current browser administrator alone accepts the immutable purchase; assistants, native callers and other members cannot create financial consent; the document preview reserves its frame through loading/rendering so price consent remains stationary, with no purchase from viewing or scrolling</li>
<li id="feature-34a6fe22cc01">Atomic reservation and one settled charge for a complete valid report; engine failure releases the reservation without a settled debit</li>
<li id="feature-44ece89298b1">New subscriptions and automatic recurring renewals are retired; immutable legacy actions and charges are retained, and posted charge history remains visible under current reporting authority</li>
<li id="feature-8eacf06733b6">Pinned private veraPDF for PDF/UA-1/-2 and PDF/A-1b/2b/3b/4, with official positive/negative corpus, signal-aware bounded cleanup and separate offline/hosted graceful-stop qualification</li>
<li id="feature-01e5d5dea05b">Exact-byte reports, history and JSON export under current PDF access, independent of a monthly entitlement</li>
<li id="feature-2acdd0b62b62">Required human review; a valid report with failed conformance checks is billable, while operational failure is not a conformity verdict</li>
<li id="feature-31d5342b365a">One explicit activation flag, private validator and production scanner gates; activation after hosted qualification, never legal certification</li>
<li id="feature-5fc00307842b">PDF-accessibility exclusions apply to originals and existing reports; person-redacted recovery without web bypass</li>
<li id="feature-334428e4fc84">Same-key recovery for uncertain network responses does not purchase or execute twice; a new independent check requires a new explicit purchase</li>
</ol>

## REST operations

- `GET /api/pdf-validation/pricing`
- `GET /api/documents/{id}/validation`
- `POST /api/documents/{id}/validation`

Read the [REST integration guide](/integrations/rest-api/) for authentication, errors and contract discovery.

## MCP tools

- `get_pdf_validation`
- `validate_pdf`

Read the [MCP integration guide](/integrations/mcp/) for scope, approval and host boundaries.
