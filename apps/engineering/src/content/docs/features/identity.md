---
title: "Access and identity"
description: "26 capabilities in the access branch of Guteneo."
sidebar:
  order: 1
---

<!-- Generated from docs/feature-map.json. Run npm run docs:build; do not edit this view. -->

**Access boundary:** Authenticated browser session.

Implemented browser identity; optional Auth0/DNS configuration and hosted qualification remain separately gated.

**Surfaces:** Authenticated browser; MCP resource OAuth discovery; native identity/session contracts. Optional custom domain affects browser sign-in only.

[Read the engineering guide](/architecture/authority-and-tenancy/) · [All features](/features/)

## Capabilities

<ol>
<li id="feature-118253ca6bfe">Auth0 sign-in, verified accounts and explicit MFA policy</li>
<li id="feature-5996e8b92f62">Canonical browser sign-in/callback; retired hosts and preview URLs refuse authentication</li>
<li id="feature-703c99688915">Workshop creation with its initial administrator</li>
<li id="feature-0485df390661">Personal profile, interface language and saved Classic/V2 appearance</li>
<li id="feature-1b09fee94068">Session listing, revocation and explicit logout</li>
<li id="feature-258bd6db5347">Successful logout returns to the public home before Login remounts; failures stay visible and never claim a logout</li>
<li id="feature-0d705f70130f">Workshop switching with current membership rights</li>
<li id="feature-e45c48c38807">OAuth connection binding, revocation and consented scopes</li>
<li id="feature-0902d179dfda">Exact resource-metadata discovery issuer, including its trailing slash; official MCP SDK contract tests without external network</li>
<li id="feature-550f7a5eac9d">Account deletion request; complete erasure processing remains unqualified</li>
<li id="feature-f05c328497cd">Visible signed-in name, login email and current role on desktop/mobile</li>
<li id="feature-a27bec3f16f6">Explicit Auth0 account switching without disabling ordinary SSO</li>
<li id="feature-91f1d79cca79">Tab-focus reconciliation of identity, workshop and saved language</li>
<li id="feature-1422d346be7e">One authenticated language control in the account; visitor choice stays separate</li>
<li id="feature-db7acc719ea5">Account Classic/V2 preference, migration 0053 and reconciliation after identity changes</li>
<li id="feature-5fb66b6b5b44">Late contact-directory errors provide accessible recovery without interrupting profile editing</li>
<li id="feature-9f0ca97174ac">Path-scoped browser reads: hide previous resources, preserve same-path refresh and ignore cancelled late responses/401s</li>
<li id="feature-27ec8cd628c9">Direct Auth0 entry from public links and unauthenticated private routes, preserving locale and exact destination</li>
<li id="feature-a70a2d19cbf1">Deep-link recovery from the valid transaction, excluding callback URLs and private parameters</li>
<li id="feature-69740d1b791d">Prepared Auth0 brand assets and FR/EN/DE UI; Luxembourgish keeps its Guteneo locale with Auth0 fallback; language activation and publication need separate proof</li>
<li id="feature-6c620ab8178d">Restore explicit visitor language after the initial session check without overwriting current selection or account preference</li>
<li id="feature-9693e975dcf5">Recovery screen only after an error, with explicit retry and no automatic loop; native Auth0 signup, local demo and public fixture remain distinct</li>
<li id="feature-57f878e633a8">Reread workshop capabilities for a browser session; anonymous reads support recovery and refresh the shared public offer/FAQ after returning home</li>
<li id="feature-c784c69cee8c">Optional auth.guteneo.com browser domain for the existing Auth0 tenant; MCP issuer/discovery/tokens remain canonical</li>
<li id="feature-639934edd469">Additive migration 0054 binds authorisation issuer and identity namespace to PKCE; legacy NULL flows stay canonical and rollback never silently switches provider</li>
<li id="feature-e4042fab26c4">Verified dual-token subject binds to the canonical namespace without email linking or duplicate person/workshop/credits/authority; browser evidence and prepare_only restriction remain</li>
</ol>
