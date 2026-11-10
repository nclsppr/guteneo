---
title: "Campaigns and tracking"
description: "15 capabilities in the operate branch of Guteneo."
sidebar:
  order: 12
---

<!-- Generated from docs/feature-map.json. Run npm run docs:build; do not edit this view. -->

**Access boundary:** Current capability and authority required.

Implemented tracking and campaign contracts. The 9 November lifecycle candidate adds contacts and separately approved schedules, with migrated-D1 and synthetic production-bridge tests; migrations 0078/0080, release activation, hosted clients and actual future delivery require separate qualification.

**Surfaces:** Web, existing OAuth REST and nine additive MCP contact/schedule tools under existing scopes; future approval is browser-only. Native gains no contact/schedule API or approval surface. Detailed contracts: SCHEDULED_DISPATCHES.md and lifecycle integration routes.

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
<li id="feature-fce7b153ae66">Frozen nonempty campaigns complete automatically only after every immutable member is operationally closed with no execution lease, unresolved invocation or reserved quota/credit; postal handover is execution closure, never recipient receipt, and late ranked facts remain projectable</li>
<li id="feature-7f8579678c90">Reusable tenant-scoped fax, email and postal recipients require current preparation authority even for reads; validated optimistic-revision edits affect the address book only, and immutable dispatch recipients retain their snapshots</li>
<li id="feature-9077b930c8da">Saved-recipient creation has a durable tenant-scoped idempotency receipt; deletion removes contact data and an old create-key replay cannot resurrect it; bounded pages and a 1,000-contact workspace limit remain explicit</li>
<li id="feature-dd998c0f5e56">Scheduled fax and message-only email use a distinct revocable future_browser grant from an actual current browser approver, binding exact source content, destination, sender, options, UTC instant, fifteen-minute acceptance window and integer total cap within thirty days</li>
<li id="feature-6ccf8b67512a">Draft schedules hold ordinary approval and immediate acceptance of the original without reserving funds; default-off automatic release refuses approval while disabled, prepares a fresh quote within cap and rechecks both principals, source, provider and funds before atomic quota/outbox acceptance Held originals project into in-progress lists/counts, while draft-schedule approval attention opens its distinct review. Ordinary cancellation also refuses a held original, including an already-cancelled source; future authority is revoked only through its schedule operation.</li>
<li id="feature-d925fddf142d">A schedule has one immutable release command; current-source and revocation races are fenced in SQL, actual Telnyx/SES/Resend bridges consume separate accepted future evidence, and unknown outcomes never auto-retry</li>
<li id="feature-0c9cfc63871c">Secure/protected/PDF-email/postal and review-only fax cannot gain schedule authority; explicit terminal recovery is offered only for known-unsent blocked/cancelled work, with a new cap/time and no inherited approval</li>
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
- `GET /api/recipients`
- `POST /api/recipients`
- `GET /api/recipients/{id}`
- `PATCH /api/recipients/{id}`
- `DELETE /api/recipients/{id}`
- `GET /api/dispatch-schedules/capabilities`
- `GET /api/dispatch-schedules`
- `POST /api/dispatch-schedules`
- `GET /api/dispatch-schedules/{id}`
- `POST /api/dispatch-schedules/{id}/approve`
- `POST /api/dispatch-schedules/{id}/cancel`

Read the [REST integration guide](/integrations/rest-api/) for authentication, errors and contract discovery.

## MCP tools

- `approve_and_send_dispatch`
- `cancel_dispatch`
- `confirm_dispatch`
- `get_dispatch_status`
- `list_dispatches`
- `prepare_dispatch`
- `review_dispatch`
- `list_saved_recipients`
- `get_saved_recipient`
- `save_recipient`
- `update_saved_recipient`
- `delete_saved_recipient`
- `list_dispatch_schedules`
- `get_dispatch_schedule`
- `prepare_dispatch_schedule`
- `cancel_dispatch_schedule`

Read the [MCP integration guide](/integrations/mcp/) for scope, approval and host boundaries.
