---
title: "Dispatch dry run"
description: "7 capabilities in the deliver branch of Guteneo."
sidebar:
  order: 10
---

<!-- Generated from docs/feature-map.json. Run npm run docs:build; do not edit this view. -->

**Access boundary:** Read-only assessment.

Implemented partial validation; neither acceptance nor delivery is executed.

**Surfaces:** REST GET and MCP, plus bounded operator runner; current read authority only.

[Read the engineering guide](/architecture/dispatch-lifecycle/) · [All features](/features/)

## Capabilities

<ol>
<li id="feature-179ddeee3651">Validate an existing dispatch within authenticated-workshop and current document authority</li>
<li id="feature-f4978026ad8a">Read preparation guards, absence of attempts, quote validity and channel restrictions</li>
<li id="feature-2e50039d6cb0">Partial/blocked result; acceptance and delivery are never executed and simulation stays separate</li>
<li id="feature-b47392842ab1">Create, renew and consume no quote; preserve expiry; no approval, reservation, outbox or provider attempt</li>
<li id="feature-ea57da63eba0">REST GET/MCP automation with dispatches:read grants no preparation or approval authority</li>
<li id="feature-7eb019570629">Business read-only semantics remain distinct from HTTP counters and persisted MCP connection activity</li>
<li id="feature-919313a18b11">The test:prod:dry-run runner reads 1–10 existing dispatches sequentially on the canonical origin using an injected read token and emits recent redacted partial evidence</li>
</ol>

## REST operations

- `GET /api/dispatches/{id}/dry-run`

Read the [REST integration guide](/integrations/rest-api/) for authentication, errors and contract discovery.

## MCP tools

- `dry_run_dispatch`

Read the [MCP integration guide](/integrations/mcp/) for scope, approval and host boundaries.
