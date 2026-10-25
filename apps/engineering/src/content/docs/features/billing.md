---
title: "Credits and billing"
description: "8 capabilities in the operate branch of Guteneo."
sidebar:
  order: 13
---

<!-- Generated from docs/feature-map.json. Run npm run docs:build; do not edit this view. -->

**Access boundary:** Partial implementation; check the stated limits.

Credits, ledger and selectable consumption history implemented; commercial top-up and this candidate publication remain unqualified.

**Surfaces:** Browser administration; shared backend ledger. No assistant billing administration.

[Read the engineering guide](/architecture/dispatch-lifecycle/) · [All features](/features/)

## Capabilities

<ol>
<li id="feature-ca0e8cf47560">One-time shared welcome balance in euros</li>
<li id="feature-0000a0ff1a7f">Available, reserved and consumed balances; top-up remains unqualified</li>
<li id="feature-ecf62bcbe864">Atomic reservation with acceptance and outbox insertion</li>
<li id="feature-f1650cb998d3">Provider settlement and retained reserves for unknown outcomes</li>
<li id="feature-aa40a6397a9c">Administrator credit/billing inspection</li>
<li id="feature-413e08f6f713">Prepared Stripe integration with separate commercial qualification</li>
<li id="feature-ce82ea1538be">Read-only tenant-scoped monthly consumption history; current/latest/explicit UTC month selection preserves previous usage and simulation boundaries</li>
<li id="feature-d971254e1b05">GitHub-style annual daily activity grid from exact UTC posted debits, selectable years/day detail, keyboard navigation and contained phone scrolling; reservations and simulation remain distinct</li>
</ol>

## REST operations

- `GET /api/usage`
- `GET /api/usage/activity`

Read the [REST integration guide](/integrations/rest-api/) for authentication, errors and contract discovery.
