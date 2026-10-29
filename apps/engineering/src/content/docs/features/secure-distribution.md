---
title: "Sensitive distribution and personal documents"
description: "31 capabilities in the deliver branch of Guteneo."
sidebar:
  order: 10
---

<!-- Generated from docs/feature-map.json. Run npm run docs:build; do not edit this view. -->

**Access boundary:** Current capability and authority required.

Implemented candidate with migrations 0055–0059 and separate deterministic strong/verified_account qualification. Default strong, explicitly selected verified_account, aligned environment/D1 policy and human approval remain mandatory; real Auth0, provider delivery, publication and external-client proof are separate.

**Surfaces:** Workspace and personal web UI in FR/EN/DE/LB with shared V2 primitives; workspace REST/MCP and assistant packages under scopes. Recipient access, sensitive approval and explicit quote renewal are browser-only; workspace Bearer tokens cannot open the personal vault. Native and real host support need surface-specific qualification.

[Read the engineering guide](/workflows/secure-distribution/) · [All features](/features/)

## Capabilities

<ol>
<li id="feature-08115f58a8e9">One Guteneo account receives, keeps documents and uses services, with zero workspaces permitted</li>
<li id="feature-6d0917d240c7">Prepare a verified PDF for one named recipient; immutable permissions, term, tax-exclusive price and notification language; revoke unexpired legacy draft/active hosting first, and use a dedicated source after any referenced postal derivation, legacy send, postal preflight or provider draft</li>
<li id="feature-f5e6d1d8fb7f">Bounded durable private rendering serves authorized page images and accessible text; the reader never delivers the original PDF</li>
<li id="feature-8b90be060e64">Shared terms of 7/30/90/365 days and personal-copy terms of 365/1095 days; personal-copy options are funded at activation even when unused</li>
<li id="feature-5ffc6245e7d3">Versioned prices and separate invitation transport; activated retention commitments are nonrefundable even after revocation</li>
<li id="feature-487e28d5ff1d">Review final pages/text, recipient, message, permissions and quote before browser approval under the active policy; email-request attestation remains separate</li>
<li id="feature-7ff1331958f2">Atomic activation and outbox insertion require sensitive browser evidence even through REST/MCP confirmation; expert delegation cannot approve this flow</li>
<li id="feature-b42e8921b2a8">Browser-only explicit quote recovery replaces an eligible unsubmitted distribution from its exact stored source, recipient, policy, notification and ceiling; guarded cancellation and a durable marker retain history, deterministic replay returns the same replacement, and new human review is required before activation</li>
<li id="feature-b69ca8c6b602">Opaque invitation moves through same-tab handoff and a POST exchange, never authentication returnTo, logs, MCP responses or public captures</li>
<li id="feature-bf8752bea5f4">New immutable verified_email policy binds the matching verified address and stable account at claim under fresh-session checks; independent or missing historical policy still requires workspace confirmation</li>
<li id="feature-93a71ed7892d">My documents separates Shared with me and Saved copies, with bounded server filtering/search and pagination over authorized documents</li>
<li id="feature-39ab543ebaa8">Private pages and text load on demand; document policy, recent session and current grant are rechecked before each delivery</li>
<li id="feature-c60fb15ec6e5">Paginated workspace audit distinguishes server/browser provenance and actor account without claiming physical identity; detailed access events retain ninety days, immutable receipts remain separate, visible refresh is bounded and no full reading, disk save or screenshot is proven</li>
<li id="feature-b8145b3e4dd2">Optional original export is explicit and requires five-minute authentication freshness under the current policy; requested download and started transfer are distinct events</li>
<li id="feature-2f4534f81104">Idempotent personal deposit uses bounded durable jobs, visible automatic progress and recovery after tab closure; success appears only after activation</li>
<li id="feature-18f00f163101">Acquired copies survive workspace revocation or departure; personal export/deletion/history are private from the sender; cancelling deletion retains the copy, confirming removes reading/export, and deletion/expiry prevents redeposit through the same invitation without an extra charge</li>
<li id="feature-cfc41ec9bfd6">Services remain available through the same account, with voluntary workspace choice/creation, no mandatory purchase and no confidential-content targeting</li>
<li id="feature-56cb9ba5118c">Existing REST/MCP and assistant packages expose catalog, preparation, listing, detail, confirmation after browser evidence and revocation under current rights/scopes</li>
<li id="feature-5018586579a1">Workspace tools expose neither personal principal, recipient association nor personal-vault content</li>
<li id="feature-2c169d9f944f">Activation fails closed until keys, renderer, scanner, provider and aligned document policy are qualified; V1 excludes ordinary attachments, legacy postal transformations, cropping, analysis and password access after sensitive reference, even after failure/revocation; only a dedicated invitation without source attachment is eligible, with bidirectional service/SQL race guards; local email flags and dated provider qualification prove no installed quota policy, signed webhook or delivery</li>
<li id="feature-b3390b87e4cb">Secure distribution navigation follows Documents while Overview and Assistants lead; list/preparation/detail retain a coherent title and active entry; document-authentication and approval-freshness refusals offer localized explicit fresh sign-in returning to the valid existing share route, without SSO loops, private form storage or automatic approval</li>
<li id="feature-39937e425995">Workspace preparation explicitly paginates PDF sources and explains that an authorized personal copy can be exported even when the shared original cannot</li>
<li id="feature-d4704f92cb03">Association attestation binds the displayed account, address and request; changing the candidate requires new independent verification</li>
<li id="feature-e9322039b01d">Personal-list 401/403 clears loaded metadata and cursors; stale pagination responses cannot restore an old list after refresh</li>
<li id="feature-45cc544c0188">Direct personal routes start their own small shell and authenticated personal session before the document list without waiting for workshop bootstrap; old workshop reads are aborted and fenced from applying identity/language after navigation, and return rereads current workshop authority</li>
<li id="feature-3b2aae178e2b">Personal focus/visibility session reconciliation is bounded and cleaned up; changed identity remounts document state, obsolete results are ignored and list retry does not reload a still-valid session; recipient/document-policy/server authorization remains unchanged</li>
<li id="feature-84e65dce0e3a">Secure distribution list, composer, detail and reader reuse the shared V2 workspace/personal surfaces, typography, controls, facts and responsive spacing; each authorization boundary remains unchanged</li>
<li id="feature-58b495c5faae">Personal section changes retain the mounted authenticated shell while capturing and removing each new invitation before children render; no redundant personal-session bootstrap precedes the next page. Initial entry, bounded visible-tab revalidation, identity-change remounts and current server authorization remain required</li>
<li id="feature-a57a041d1487">Provider preflight validates the transport reservation after deducting already committed secure retention/personal-copy charges from the immutable total ceiling; it retains all active attempt, approval, sender and tenant checks</li>
<li id="feature-8a4676396a87">One explicit priced browser Send action records approval then activation after two attestations; a failed response requires read-only Check status before same-key recovery, without effect-driven writes or another MCP confirmation after active readback</li>
<li id="feature-7a62af39f473">Local D1/R2 regressions cover revocation of metadata/images/text/permitted-original/deposit, decryption races, concurrent deposit and duplicate-copy workers; durable copies converge on exact bytes and single receipts without reviving revoked shared access</li>
</ol>

## REST operations

- `GET /api/secure-distributions`
- `POST /api/secure-distributions`
- `GET /api/secure-distributions/catalog`
- `GET /api/secure-distributions/{id}`
- `POST /api/secure-distributions/{id}/confirm`
- `POST /api/secure-distributions/{id}/revoke`

Read the [REST integration guide](/integrations/rest-api/) for authentication, errors and contract discovery.

## MCP tools

- `confirm_secure_distribution`
- `get_secure_distribution`
- `list_secure_distributions`
- `prepare_secure_distribution`
- `revoke_secure_distribution`

Read the [MCP integration guide](/integrations/mcp/) for scope, approval and host boundaries.
