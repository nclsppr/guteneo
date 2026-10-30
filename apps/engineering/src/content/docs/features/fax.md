---
title: "Fax"
description: "9 capabilities in the deliver branch of Guteneo."
sidebar:
  order: 7
---

<!-- Generated from docs/feature-map.json. Run npm run docs:build; do not edit this view. -->

**Access boundary:** Current capability and authority required.

Implemented fax contracts; continuous reviewer access and automatic commercial-reference maintenance are source candidates requiring additive migrations, explicit registration and independent hosted qualification. Live sender, tariff, approval, credits and provider gates apply.

**Surfaces:** Web, REST, MCP and native preparation/tracking; browser or existing delegated approval.

[Read the engineering guide](/workflows/delivery-channels/) · [All features](/features/)

## Capabilities

<ol>
<li id="feature-30bb34a6b7b9">Exact PDF, recipient number and qualified sender</li>
<li id="feature-4bc48953d372">Dated provider quote with bounded renewal</li>
<li id="feature-26620de430d6">Candidate scoped +3524 operator-tariff renewal preserves prices, source dates, seven-day validity and EUR2 cap; migration 0064, matching runtime and separate installation required</li>
<li id="feature-3636a3003e0b">Estimated range, approved ceiling and credit balance in euros</li>
<li id="feature-32927ed70105">Preparation, human review, approval and confirmation</li>
<li id="feature-c07652a7bf1f">Tracking, receipts, usage settlement and unknown outcomes</li>
<li id="feature-e322e320b56e">Unsendable reviewer mode stops before approval</li>
<li id="feature-d201405f7b7f">Explicit continuous access removes periodic reviewer-reference renewal for the exact restricted single-member account; archived pricing stays labelled, quotes retain their 900-second lifetime and approval/sending remain prohibited</li>
<li id="feature-8a942d3218f3">Registered live commercial references refresh from actual official sources and provider-ownership reads through the existing scheduler; bounded leases/backoff and active-quote deferral preserve immutable approved prices</li>
</ol>

## REST operations

- `POST /api/dispatches/{id}/renew-quote`

Read the [REST integration guide](/integrations/rest-api/) for authentication, errors and contract discovery.

## MCP tools

- `prepare_fax`

Read the [MCP integration guide](/integrations/mcp/) for scope, approval and host boundaries.
