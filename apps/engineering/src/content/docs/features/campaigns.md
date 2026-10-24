---
title: "Campaigns and tracking"
description: "8 capabilities in the operate branch of Guteneo."
sidebar:
  order: 11
---

<!-- Generated from docs/feature-map.json. Run npm run docs:build; do not edit this view. -->

**Access boundary:** Current capability and authority required.

Implemented; role, exact-document and channel gates apply.

**Surfaces:** Web, REST and MCP; reporting and approval rights are independently checked.

[Read the engineering guide](/architecture/dispatch-lifecycle/) · [All features](/features/)

## Capabilities

<ol>
<li id="feature-442bbb3f8f29">Named campaign with CSV recipients</li>
<li id="feature-7627ae05ae1d">Row validation, errors and duplicate detection</li>
<li id="feature-596bd2b33b79">Prepare individual dispatches with the selected document</li>
<li id="feature-6aef42f5d613">Dispatch list/detail with prices and statuses</li>
<li id="feature-eb92fd5ad7e5">Aggregate reporting and usage according to current rights</li>
<li id="feature-aa5ee8227f81">Eligible cancellation and review of uncertain operations</li>
<li id="feature-9aa518acad32">Channel/ceiling administration without blind retries</li>
<li id="feature-fc01d17a7ef2">Path-scoped browser refresh prevents stale resources or cancelled 401s from replacing a newer session</li>
</ol>

## REST operations

- `GET /api/dispatches`
- `POST /api/dispatches`
- `GET /api/dispatches/{id}`
- `POST /api/dispatches/{id}/confirm`
- `POST /api/dispatches/{id}/cancel`
- `GET /api/campaigns`
- `POST /api/campaigns`
- `GET /api/campaigns/{id}`
- `POST /api/recipients/validate`

Read the [REST integration guide](/integrations/rest-api/) for authentication, errors and contract discovery.

## MCP tools

- `approve_and_send_dispatch`
- `cancel_dispatch`
- `confirm_dispatch`
- `get_dispatch_status`
- `list_dispatches`
- `prepare_dispatch`
- `review_dispatch`

Read the [MCP integration guide](/integrations/mcp/) for scope, approval and host boundaries.
