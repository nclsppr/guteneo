---
title: "Automatic fax tariff maintenance"
description: "8 capabilities in the operations branch of Guteneo."
sidebar:
  order: 26
---

<!-- Generated from docs/feature-map.json. Run npm run docs:build; do not edit this view. -->

**Access boundary:** Restricted operator authority required.

Source candidate for the bounded local +3524 pilot only; schema, actual server-key catalog discovery, explicit route registration and successful scheduled maintenance require independent qualification. No historical CSV fallback is allowed.

**Surfaces:** Authorized private operator CLI/service-binding qualification and registration, and existing scheduled backend maintenance; no public browser, REST or MCP registration authority.

[Read the engineering guide](/engineering/provider-maintenance/) · [All features](/features/)

## Capabilities

<ol>
<li id="feature-fdb86cb6a0ae">Current candidate covers only the existing local Luxembourg fixed +3524 operator-test route with canonical empty options, at most seven pages and EUR2; source refresh never extends its independent 3 November 2026 pilot deadline</li>
<li id="feature-fea7c89505c3">Explicit registration binds an exact tenant, sender, provider account/application/profile, destination prefix and options to an authorized global-conversational public commercial catalog</li>
<li id="feature-3a4c32b375ed">Daily authenticated current-catalog discovery plus bounded official fax-page, selected allowlisted CSV and dated ECB reads and current provider ownership inspection create new immutable revisions with at most 168-hour validity</li>
<li id="feature-c7cdcc6fb886">Public commercial references do not claim negotiated supplier prices or a freshly observed provider UI association; original source and association dates retain their meaning</li>
<li id="feature-ca87aa1160b4">Existing scheduled maintenance considers one route per execution with a lease, retry backoff and daily refresh target; active quotes defer replacement to preserve approved commitments</li>
<li id="feature-a4b4943039f7">Atomic exact-predecessor replacement refuses source ambiguity, identity/registration drift or lost leases; failure never fabricates freshness, extends pilot authority or enables a channel</li>
<li id="feature-b14b939387d2">Coarse refreshed/failed/deferred results exclude content, recipients, credentials and private source bodies; a bounded same-account private RPC qualifies current catalog access without registering or writing a price</li>
<li id="feature-a5043c92dda1">Registration configuration and plans are absolute private 0600 files under a 0700 directory outside Git; read-only planning and reviewed-digest application remain distinct</li>
</ol>
