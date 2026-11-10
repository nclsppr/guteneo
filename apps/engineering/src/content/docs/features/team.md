---
title: "Team and responsibilities"
description: "11 capabilities in the access branch of Guteneo."
sidebar:
  order: 2
---

<!-- Generated from docs/feature-map.json. Run npm run docs:build; do not edit this view. -->

**Access boundary:** Authenticated browser session.

Implemented; invitations require separately configured delivery. The 10 November 2026 approval request (POST /api/dispatches/:id/request-approval, migration 0078 index, dispatch page control) is a local source candidate covered by the workspace-role integration test; it requires CI, application-browser and publication evidence. Only a human browser session receives the approvalRequest field of the dispatch detail; REST OAuth, assistant and native responses are unchanged.

**Surfaces:** Authenticated browser; invitation emails are authored in English.

[Read the engineering guide](/architecture/authority-and-tenancy/) · [All features](/features/)

## Capabilities

<ol>
<li id="feature-bd46f0a22505">Four human membership roles with independent supervisor approval/reporting options</li>
<li id="feature-d3e8fa6389a3">Member management, permission changes and atomic access revocation</li>
<li id="feature-1e10287283cf">Last-administrator protection</li>
<li id="feature-40903b2fb1a6">Individual/CSV invitations with batch preview and confirmation</li>
<li id="feature-6790e1b431ec">Verified-email acceptance, expiry and invitation revocation</li>
<li id="feature-8fa1f89008dd">Bounded browser-only responsible contacts filtered by current workshop membership</li>
<li id="feature-8de991823011">Login email distinguishes members with the same name; effective permissions stay readable</li>
<li id="feature-0f4c31854ae1">Sensitive preparations are visible to their creator and current approvers; operators and observers gain no general access to other preparations</li>
<li id="feature-149da7afd29d">Sensitive approval and recipient/account association require a browser under the current document policy; OAuth confirmation follows recorded browser evidence, with no expert-mandate substitute</li>
<li id="feature-f4b883cce481">Workspace roles grant no access to another person’s vault; a recipient gains no membership in the sender’s workspace</li>
<li id="feature-036fe2c3facb">Approval request: a member who can prepare asks the workspace's approvers to review a dispatch awaiting approval, from a human browser session only; one audit receipt per version (fingerprint), shown to approvers on the dispatch and as an "Approval requested" label that leads the Overview queue; it approves, reserves, sends and notifies nothing</li>
</ol>
