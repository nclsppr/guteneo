---
title: "Workspace administration and reports"
description: "15 capabilities in the access branch of Guteneo."
sidebar:
  order: 28
---

<!-- Generated from docs/feature-map.json. Run npm run docs:build; do not edit this view. -->

**Access boundary:** Authenticated browser session.

4 November 2026 continuation of the 3 November recovered source candidate. Current local qualification and limits are recorded in the administration contract; hosted CI, production-data and physical-device qualification remain separate. The 11 November 2026 customer webhooks (release 1.1.38) are a local source candidate covered by integration tests; activation needs a provisioned WEBHOOK_SIGNING_KEY, CI, staging and publication evidence, and no real receiver has been called.

**Surfaces:** Authenticated browser membership only; OAuth, MCP and native callers are refused.

[Read the engineering guide](/architecture/authority-and-tenancy/) · [All features](/features/)

## Capabilities

<ol>
<li id="feature-077f965c6e51">Dedicated Administration application for one workspace, offered to administrators and to supervisors with report permission; the server recomputes permissions from the current membership on every read</li>
<li id="feature-07a2afe786c0">Overview with Belvédère-style figures, daily activity and channel/state breakdowns, limited to the authenticated workspace</li>
<li id="feature-6251a71f2fc7">Server-paged activity filtered by channel, state, attention or reference, without recipients, subjects, document titles or message content</li>
<li id="feature-66d0b4cf4e87">Consumption from the posted charge ledger by service, channel and month, beside the former monthly usage ledger and calendar</li>
<li id="feature-11597417e4fc">Members, roles, supervisor options, invitations and member activity moved from Correspondence; workspace name, channel controls and diagnostics moved from the personal profile to Settings</li>
<li id="feature-d734542425d7">Open access, assistant authorizations and recorded sign-ins of members, without connection countries</li>
<li id="feature-36d8db1d4274">Audit log of actions and resource identifiers, never audit details</li>
<li id="feature-362e5c9aadee">CSV, Excel and PDF exports of the period with exact decimal amounts from integer minor units, formula-safe CSV, a cumulative 10,000-row and 4 MiB text refusal, bounded cells and a global 500-row PDF with explicit omissions and an audit entry per export</li>
<li id="feature-29dc2e239b7e">Earlier /app/admin, /app/usage and /app/billing addresses remain aliases, including billing portal returns</li>
<li id="feature-7f33dc04f3af">URL periods reject malformed dates safely; custom fields follow presets and history, stale reads cannot overwrite the current workspace, and obsolete export downloads are cancelled</li>
<li id="feature-ce8625432366">My documents and Use Guteneo offer Administration from a server-computed per-membership report right in the personal session; selecting it from an already open workspace form applies the new URL destination and eligible membership filter; removal hides it and the API refuses meanwhile</li>
<li id="feature-bd7353f7e9ae">PDF exports embed the pinned Roboto font only when a drawn string is outside WinAnsi, size columns from content, wrap headers, share the 500-row budget across tables and localize header dates; the Excel summary stores typed numbers, money and date-time</li>
<li id="feature-b351544c99cb">The public preview renders Administration over its fictional workspace with the server's permission split, validates date and pagination bounds, and groups consumption by confirmation day and month; sign-in history follows the selected range and exports stay disabled</li>
<li id="feature-efdb36128f77">Browser administrators explicitly resolve an already operationally and financially closed dead-letter incident through a current-session and current-membership fenced transaction; one retained resolution audit/timestamp survives replay, with no dispatch mutation, credit release, queue replay or provider invocation</li>
<li id="feature-8bc02b7d2f7a">Customer webhooks: a browser administrator registers up to five public HTTPS addresses (migration 0080) that receive a signed notice (dispatch id, channel, status) at each dispatch status change; secrets are derived from WEBHOOK_SIGNING_KEY and shown once; delivery is at least once in the existing minute cron, retried five times over about eight hours then abandoned; nothing is delivered without the key</li>
</ol>

## REST operations

- `POST /api/admin/dead-letters/{id}/resolution`

Read the [REST integration guide](/integrations/rest-api/) for authentication, errors and contract discovery.
