---
title: "Postal mail"
description: "10 capabilities in the deliver branch of Guteneo."
sidebar:
  order: 8
---

<!-- Generated from docs/feature-map.json. Run npm run docs:build; do not edit this view. -->

**Access boundary:** Current capability and authority required.

Worldwide input is an unpublished 1.1.27 candidate; production remains 1.1.26 at this handoff. Local country/cache/calculator/SQL/mapping tests establish no real worldwide send. Fresh eligibility, qualified profile, distinct transfer authority, actual quote and final approval remain mandatory; fax routes are unchanged.

**Surfaces:** Web, REST and MCP with separate postal transfer authority.

[Read the engineering guide](/workflows/delivery-channels/) · [All features](/features/)

## Capabilities

<ol>
<li id="feature-6cf78e1f1d42">All 250 Pingen-recognized country codes, including XZ, with an unchanged legacy FR/LU/DE recipient form and strict complete printed address blocks including name and any required country line</li>
<li id="feature-6911b22e6caf">Fresh fixed official unavailable/delayed reference, bounded single-flight observation with at most 300-second cache and no expired fallback; recognized countries, current eligibility, account profile and actual price are independent</li>
<li id="feature-a9a840d25b1f">Left/right address window and explicitly requested address page</li>
<li id="feature-7b4510b0b4fd">Paper, colour, simplex/duplex and delivery-service options</li>
<li id="feature-a1b8b767439b">PDF preflight, address rendering and review</li>
<li id="feature-e815495f8665">Distinct authority for PDF transfer to obtain a quote</li>
<li id="feature-0a8b7beb73ff">Actual analyzed-draft EUR calculator quote, unchanged four pricing options and legacy hash material; no fixed country price, invented postcode or implicit address completion</li>
<li id="feature-8f19495bd3af">Version selected by frozen recipient shape, with schema-first 0072 preserving old objects while binding new block/page versions to the exact tenant, consent, PDF, recipient, profile, quote and approval</li>
<li id="feature-7524bd8c17b6">Confirmation, calendar cutoffs and provider tracking</li>
<li id="feature-0d001fa40eb7">Status projection and reconciliation of unknown outcomes</li>
</ol>

## REST operations

- `GET /api/senders`
- `POST /api/postal/preflights`
- `GET /api/postal/preflights/{id}`
- `GET /api/postal/preflights/{id}/address.png`
- `POST /api/postal/preflights/{id}/quote`
- `GET /api/postal/requirements`
- `GET /api/postal/destinations`
- `POST /api/postal/address-pages`

Read the [REST integration guide](/integrations/rest-api/) for authentication, errors and contract discovery.

## MCP tools

- `configure_postal_sender`
- `create_postal_address_page`
- `get_postal_preflight`
- `get_postal_requirements`
- `get_postal_setup`
- `preflight_postal_pdf`
- `quote_postal_draft`
- `transfer_postal_draft`

Read the [MCP integration guide](/integrations/mcp/) for scope, approval and host boundaries.
