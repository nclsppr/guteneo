---
title: "Public service status"
description: "12 capabilities in the operations branch of Guteneo."
sidebar:
  order: 22
---

<!-- Generated from docs/feature-map.json. Run npm run docs:build; do not edit this view. -->

**Access boundary:** Public reading surface.

Public availability, local coverage and version-bound browser reports are separate. Historical deployments and synthetic UI passes do not establish current hosted ingestion or authenticated business qualification.

**Surfaces:** Independent public page and read-only GET /api/status, /api/history and /api/e2e-status; bounded GitHub OIDC report ingestion is independent of workspace membership and business REST/MCP authority.

[Read the engineering guide](/engineering/testing/) · [All features](/features/)

## Capabilities

<ol>
<li id="feature-6073730fee4e">Independent status.guteneo.com service with fourteen bounded anonymous canonical checks every fifteen minutes and no business bindings/secrets</li>
<li id="feature-d78842f1496a">D1 7/30/365-day history separates observed success and slot coverage; daily aggregates, unknown missing days and no reconstructed past</li>
<li id="feature-5452eba9d0af">Public summary covers only recent checks; mismatches stay visible and missing/invalid/unavailable/stale (&gt;30 minutes) measurements make current state unknown; public reads never collect probes</li>
<li id="feature-d406b94b5312">Service view shows freshness/groups/history; Checks separates detailed observations, local proof and journey coverage; Operations states limits/actions, without customer data or command IDs</li>
<li id="feature-ac5200ae4c06">Local qualification separately tests the real domain/PDFs with external network denied and final providers simulated; timestamped redacted evidence never becomes delivery proof or a production incident</li>
<li id="feature-3557f2c261bd">Branded footer and bounded seasonal decoration, optional and respecting reduced motion</li>
<li id="feature-0b22f8aa38c5">English authored status copy with English/French browser selection and a shared locale catalog; historical French feature labels remain accepted alongside canonical English reports</li>
<li id="feature-7420209d214c">Dedicated release from clean main with source checks, manifest and status-only D1 migrations</li>
<li id="feature-836c3619f640">Separate public browser reports run on GitHub main every six hours: fourteen desktop/simulated-mobile Chromium journeys and fourteen fixed HTTP contracts, without business operations; the Node driver requests identity/no-transform, preserves strict received-byte/SHA checks without automatic retries and emits bounded public diagnostics outside the signed report; canonical public HTML origin responses also declare no-transform while preserving existing cache directives, bytes, ETag and encoding, without widening private/API policies</li>
<li id="feature-506c76f457f2">Public GET /api/e2e-status exposes execution, tested/observed commit, eight-hour freshness, twenty-eight checks and history; absent/stale/version-mismatched proof stays neutral without degrading Cron availability</li>
<li id="feature-a78f8b521002">Bounded report ingestion uses GitHub OIDC bound to body and allowed workflow; sanitized output contains no content, account, screenshot or token, and requires no business secret; failures expose only the allowed stage, HTTP status and response code, never OIDC URLs or free-form upstream errors; direct-job workflow claims must be jointly absent or match the exact canonical main workflow and runner commit, with foreign/partial/empty/null pairs denied; only an actual 401 REPORT_REJECTED permits a bounded six-second boolean diagnostic and one signature verification, without requesting another token, retrying ingestion or changing the original result</li>
<li id="feature-6f8fa1bce269">Authenticated distribution/receipt stays To qualify until dedicated accounts and the real journey under the active document policy are qualified; public journeys establish no delivery or personal coverage</li>
</ol>
