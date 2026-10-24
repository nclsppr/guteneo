---
title: "Reviewer OAuth qualification"
description: "9 capabilities in the operations branch of Guteneo."
sidebar:
  order: 14
---

<!-- Generated from docs/feature-map.json. Run npm run docs:build; do not edit this view. -->

**Access boundary:** Restricted operator authority required.

Operator tooling implemented; applying Auth0 changes requires explicit authority and a reviewed fingerprint.

**Surfaces:** Authorised operator CLI; GET inspection by default, explicit fingerprint-bound apply.

[Read the engineering guide](/integrations/mcp/) · [All features](/features/)

## Capabilities

<ol>
<li id="feature-3264b68a011b">Read-only inspection of the exact existing OpenAI reviewer client, historical callback, owner, scopes, API, connections and both Actions’ draft/deployed versions</li>
<li id="feature-ebfdaee2a866">Redacted state/change plan and fingerprint without tokens, client secrets or private content</li>
<li id="feature-25f7c8232d49">Apply only after explicit authority with --apply --expect and reviewed fingerprint; provision no client/account</li>
<li id="feature-8b3b70c9ccb7">Deploy both exact Actions before API offline_access and reviewer refresh grant, preserving ownClients, unrelated clients, bindings and consent</li>
<li id="feature-084b4be9e028">Bounded rotating refresh: 30-day idle, 90-day absolute, 3-second leeway; API access token at most 3,600 seconds</li>
<li id="feature-9fd60c9b5e1d">Stop on drift before each write, collision, another renewable Guteneo client or unknown Action; no automatic write retry</li>
<li id="feature-081846a71325">For partial state, inspect again, review a fresh fingerprint and apply only remaining steps; unknown provider outcomes never trigger blind recovery</li>
<li id="feature-ce4081d2c1bc">prepare-chatgpt-reviewer --qualify-client --expect-renewal checks the complete exact state with GET only; never auto-provisions or completes partial migration</li>
<li id="feature-fa094c877ac8">Real reconnection, refresh and revocation need separate qualification; prepare_only, sending configuration, approval and mandates remain unchanged</li>
</ol>
