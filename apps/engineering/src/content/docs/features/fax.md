---
title: "Fax"
description: "9 capabilities in the deliver branch of Guteneo."
sidebar:
  order: 7
---

<!-- Generated from docs/feature-map.json. Run npm run docs:build; do not edit this view. -->

**Access boundary:** Current capability and authority required.

Implemented worldwide fax preparation, customer ceiling approval and bounded settlement. The carrier controls availability and delivery. The restricted marketplace review account retains its preparation-only access.

**Surfaces:** Web, REST, MCP and native preparation/tracking; browser or existing delegated approval.

[Read the engineering guide](/workflows/delivery-channels/) · [All features](/features/)

## Capabilities

<ol>
<li id="feature-30bb34a6b7b9">Exact PDF, recipient number and qualified sender</li>
<li id="feature-260671e0aed6">Worldwide destination-specific pricing for international fax numbers, with the latest applicable reference or EUR0.25 per page during a cold start</li>
<li id="feature-3636a3003e0b">Estimated range, approved ceiling and credit balance in euros</li>
<li id="feature-32927ed70105">Preparation, human review, approval and confirmation</li>
<li id="feature-c07652a7bf1f">Tracking, receipts, usage settlement and unknown outcomes</li>
<li id="feature-e322e320b56e">Unsendable reviewer mode stops before approval</li>
<li id="feature-d201405f7b7f">Explicit continuous access removes periodic reviewer-reference renewal for the exact restricted single-member account; archived pricing stays labelled, quotes retain their 900-second lifetime and approval/sending remain prohibited</li>
<li id="feature-b43a890b3454">The daily scheduled job checks Telnyx and ECB sources and keeps existing quotes immutable during catalogue replacement</li>
<li id="feature-90bd3e8fbaf7">Read-only readiness overlaps outbound-profile inspection with ordered bounded phone pagination; partial errors retain stable stage order and tariff/replay/settlement dependencies remain fenced</li>
</ol>

## REST operations

- `POST /api/dispatches/{id}/renew-quote`

Read the [REST integration guide](/integrations/rest-api/) for authentication, errors and contract discovery.

## MCP tools

- `prepare_fax`

Read the [MCP integration guide](/integrations/mcp/) for scope, approval and host boundaries.
