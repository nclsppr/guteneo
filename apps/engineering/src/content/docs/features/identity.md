---
title: "Access and identity"
description: "33 capabilities in the access branch of Guteneo."
sidebar:
  order: 1
---

<!-- Generated from docs/feature-map.json. Run npm run docs:build; do not edit this view. -->

**Access boundary:** Authenticated browser session.

Unified personal account and optional workspace implementation; migrations, aligned document policy, Auth0 configuration and connected production qualification require separate evidence.

**Surfaces:** Personal browser authority and workspace/native sessions; REST/MCP resource OAuth with explicit same-tenant issuer trust, independently selected discovery and canonical identity/connection/mandate keys.

[Read the engineering guide](/architecture/authority-and-tenancy/) · [All features](/features/)

## Capabilities

<ol>
<li id="feature-118253ca6bfe">Auth0 sign-in, verified accounts and explicit MFA policy</li>
<li id="feature-5996e8b92f62">Canonical browser sign-in/callback; retired hosts and preview URLs refuse authentication</li>
<li id="feature-3b417c25ebfb">Personal profile, interface language and saved Classic/V2 workspace layout; browser color preference is separate presentation state</li>
<li id="feature-1b09fee94068">Session listing, revocation and explicit logout</li>
<li id="feature-258bd6db5347">Successful logout returns to the public home before Login remounts; failures stay visible and never claim a logout</li>
<li id="feature-0d705f70130f">Workshop switching with current membership rights</li>
<li id="feature-e45c48c38807">OAuth connection binding, revocation and consented scopes</li>
<li id="feature-0902d179dfda">Exact resource-metadata discovery issuer, including its trailing slash; official MCP SDK contract tests without external network</li>
<li id="feature-550f7a5eac9d">Account deletion request; complete erasure processing remains unqualified</li>
<li id="feature-6cd634a938cf">Visible signed-in name and login email on desktop/mobile; current role and permissions belong on My account</li>
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
<li id="feature-040ff1c8f0c7">Independent browser domain and bounded same-tenant MCP token trust; explicit custom/canonical MCP discovery preference with rollback that retains existing tokens and canonical identity/connection keys</li>
<li id="feature-639934edd469">Additive migration 0054 binds authorisation issuer and identity namespace to PKCE; legacy NULL flows stay canonical and rollback never silently switches provider</li>
<li id="feature-e4042fab26c4">Verified dual-token subject binds to the canonical namespace without email linking or duplicate person/workshop/credits/authority; browser evidence and prepare_only restriction remain</li>
<li id="feature-1a57b0baee0f">One Guteneo account without an automatic workspace; idempotent initial administrator/workspace creation only on explicit service use</li>
<li id="feature-32b756cf5246">Personal browser principal and session without membership, separate from workspace API authority; shared profile name/language and no email-based identity merging</li>
<li id="feature-ca1439eebfa1">My documents, Use Guteneo and Account and security share one sign-in; voluntary workspace choice/creation reloads the chosen destination and bootstraps that workspace’s current session, rights and CSRF</li>
<li id="feature-fd09f6d08c28">Document policy defaults to strong or explicitly selects verified_account: verified account/address and signed recent auth_time; fifteen minutes for reading/association/approval and five for export/deposit/deletion; documentAccessAllowed/documentAccessMode do not imply MFA or strongAuthentication; D1 defaults strong and environment disagreement fails closed</li>
<li id="feature-f9f5d7df1035">Document invitation handoff lasts at most ten minutes in the same tab, then is deleted; capture before Auth0 with secret-free returnTo and no arbitrary private query</li>
<li id="feature-455cf75df968">Document-service 401 offers explicit recovery without session-bootstrap loops; Auth0 recovery reconciles language and returned identity</li>
<li id="feature-d6bb64f893db">Ordinary application entry without workshop membership offers workspace creation or joining through an existing canonical same-origin invitation with the shared raw 43-character base64url token contract, fragment clearing and explicit acceptance; server-generated invitation integration covers the entry, preview and auth handoff, while the stored SHA-256 hash never enters the link; explicit personal document entry remains independent, with no public workspace enumeration</li>
<li id="feature-f86a9c83e39e">Production browser configuration selects auth.guteneo.com; the tenant-wide custom-domain email flag and exact authorization-response issuer identification were applied and reread on 27 October, without sending verification mail or qualifying human login</li>
</ol>
