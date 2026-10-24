---
title: "Postal mail"
description: "8 capabilities in the deliver branch of Guteneo."
sidebar:
  order: 8
---

<!-- Generated from docs/feature-map.json. Run npm run docs:build; do not edit this view. -->

**Access boundary:** Current capability and authority required.

Implemented; qualified profile, distinct transfer authority, quote and final approval are mandatory.

**Surfaces:** Web, REST and MCP with separate postal transfer authority.

[Read the engineering guide](/workflows/delivery-channels/) · [All features](/features/)

## Capabilities

<ol>
<li id="feature-f8bebf6eaffa">Sender, address, country and qualified provider requirements</li>
<li id="feature-a9a840d25b1f">Left/right address window and explicitly requested address page</li>
<li id="feature-7b4510b0b4fd">Paper, colour, simplex/duplex and delivery-service options</li>
<li id="feature-a1b8b767439b">PDF preflight, address rendering and review</li>
<li id="feature-e815495f8665">Distinct authority for PDF transfer to obtain a quote</li>
<li id="feature-03f96b9aa8c7">Exact quote, expiry and final review</li>
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
