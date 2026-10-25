---
title: "Belvédère platform oversight"
description: "9 capabilities in the operations branch of Guteneo."
sidebar:
  order: 21
---

<!-- Generated from docs/feature-map.json. Run npm run docs:build; do not edit this view. -->

**Access boundary:** Restricted operator authority required.

Initial dedicated-host release and authenticated overview verified from main 03daa4136de8999cc79018f33f2a22038917c621; subsequent V2 visual alignment requires its own exact-source release proof. Private read-only authority remains separate from workshop roles.

**Surfaces:** Private verified Watchkeeper browser only; no workshop/native/OAuth/MCP authority.

[Read the engineering guide](/administration/belvedere/) · [All features](/features/)

## Capabilities

<ol>
<li id="feature-76f776d9c56a">Private read-only Watchkeeper authority bound to verified browser identity and server-secret address, separate from workshop roles</li>
<li id="feature-0a8cf4fb49a1">Dedicated protected platform host at its root with exact Auth0 callback, host-only browser cookies and no customer API/signup/OAuth authority; compatible private entry retained and denied-identity recovery requests an explicit fresh login</li>
<li id="feature-64f6664b8d50">Seven views: overview, workshops, members, dispatches, connections, finances and infrastructure</li>
<li id="feature-401089aa38b5">Optional country observations with bounded deduplication, new sessions after workshop changes and 90-day retention</li>
<li id="feature-278a3e9c9a84">Distinct promotional credits, dispatch/hosting/individual PDF purchases and legacy subscription charges, actual receipts and supplier costs</li>
<li id="feature-7ecf65c9e78f">Server-side Cloudflare connectors with explicit availability; never invent cost or profit</li>
<li id="feature-17f4133e5cce">Additive migration 0052 and deterministic loopback-only preview; hosted activation is separate</li>
<li id="feature-a1a7cdd07930">Account-selected four-language UI on direct entry and tab focus; no additional private language selector</li>
<li id="feature-462c38702cd1">V2 workshop visual vocabulary with independent platform navigation, shared single system-default light/dark action, readable tables/globe and keyboard mobile drawer; theme changes preserve filters without business reads/writes or layout-preference changes</li>
</ol>
