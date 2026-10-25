---
title: "Customer journeys"
description: "From actor and intent to result, including failure and recovery boundaries."
sidebar:
  order: 91
---

<!-- Generated from docs/feature-map.json. Run npm run docs:build; do not edit this view. -->

These journeys are generated from the same inventory as the [feature tree](/features/). They describe implementation and recovery; [live qualification is separate](/engineering/testing/).

## J01: Discover and sign in

**Actor:** Visitor → verified account owner, with optional workspace membership · **Branch:** Access

Open the public site → choose a visitor language → read the offer/assistant guide → enter canonical Auth0 → register one personal account without an automatic workspace → receive documents or voluntarily choose/create a workspace for service use → verify current identity and rights. Return to the valid destination. Explicit logout opens the public home.

**Failure and recovery:** Refuse invalid callback state, unknown issuer/subject or expired invitation. Recovery retries are explicit. Package download, optional Auth0 branding/domain and actual host sign-in each need separate proof.

## J02: Administer a team

**Actor:** Browser administrator · **Branch:** Access

Open members → invite individually or preview CSV → select role and supervisor options → confirm → track invitations → change/revoke rights. Members without management use workshop contacts.

**Failure and recovery:** Protect the last administrator. Rights changes revoke access/pending approvals. Directory errors announce manual recovery without stealing focus or losing profile input.

## J03: Prepare a fax

**Actor:** Administrator, supervisor or operator; current approver for acceptance · **Branch:** Deliver

Import/reuse the exact ready PDF → collect E.164 recipient/sender/ceiling → obtain the actual quote → show estimate and separate ceiling → human browser approval or existing expert review → confirm → track delivery and usage settlement separately.

**Failure and recovery:** Keep reviewer quotes unsendable. Renew only an eligible prepared unattempted quote with exact original parameters and stable key, then obtain fresh approval. Unknown submissions require reconciliation, never resend.

## J04: Prepare and send postal mail

**Actor:** Preparer → current approver · **Branch:** Deliver

Read postal setup/requirements → collect missing sender/recipient/options → optionally create an address page from the original → read the final PDF → preflight → separately authorise transfer → obtain the exact provider quote → final approval/send → track.

**Failure and recovery:** Respect address window/profile and scan gates. A failed/unknown transfer cannot be reset with another key. A prepared provider draft is not a sent letter; ordinary post has no invented proof of receipt.

## J05: Prepare an email

**Actor:** Preparer → current approver · **Branch:** Deliver

Collect recipient, requested message and ceiling → choose no file, ready PDF attachment or protected link → obtain the quote → review final content/options → record recipient-request attestation and browser/existing delegated approval → confirm → track.

**Failure and recovery:** Never infer recipient consent. Protected passwords stay in the sender browser and are shared separately. Provider acceptance/delivery/PDF reading are different facts; unknown outcomes require reconciliation.

## J06: Create a reusable template

**Actor:** Preparer with current resource rights · **Branch:** Create

Read authoring guide or a synthetic example → create/private-copy or import DOCX content → edit schema/layout → inspect warnings/exact PDF preview → review optional AI proposal → publish an immutable version → configure independent sharing rights.

**Failure and recovery:** DOCX is content import, not faithful Word layout reproduction. expectedRevision fences concurrent edits. AI requires configured consent and current authority before transfer/return; stale proposals do not apply. Known assistant-excluded content stops processing.

## J07: Turn data into PDFs

**Actor:** Preparer owning the private source · **Branch:** Create

Import CSV/XLSX/XML/JSON → verify/profile the exact original → select sheet/header/record path → define deterministic versioned mappings → validate every row → select published template → generate → inspect results and provenance.

**Failure and recovery:** Resume the same original after transient analysis failure. Resolve mapping/type/join issues explicitly. AI is optional and separately consented; generation creates no dispatch or credit reservation.

## J08: Distribute a PDF batch

**Actor:** Preparer → current approver · **Branch:** Deliver

Choose generated PDFs and frozen channel/recipient data → disclose that the first distribution plan permanently freezes the entire batch → prepare the manifest → resume remaining entries → complete linked postal preflight where needed → review/approve each exact dispatch.

**Failure and recovery:** A frozen batch cannot retry even excluded failed records; create a new generation batch when needed. Multiple channels require explicitMultichannel. No manifest operation implies consent, transfer or sending.

## J09: Supervise or observe work

**Actor:** Authorised supervisor or observer · **Branch:** Operate

Read accessible documents/dispatches → inspect tracking → use aggregate reports only with the independent reporting right → review attention items before further action.

**Failure and recovery:** Preparation, approval and reporting are independent permissions. Observers stay read-only. Private originals/generated PDFs retain owner/context checks, regardless of workshop read access.

## J10: Work with an assistant

**Actor:** Existing Guteneo member and a host-supported OAuth client · **Branch:** Interfaces

Choose the host-specific installation guide → compare package version/hash → consent OAuth under actual host rules → read capabilities/current mandate → use only available file transport/tools → prepare → review through browser or pre-existing bounded delegation → track.

**Failure and recovery:** Host installation, token refresh and scopes grant no extra role or mandate. Announce excluded-content rules before collection and stop known excluded content. Respect host confirmations and no automatic unknown-outcome retries.

## J11: Use iPhone or iPad

**Actor:** Member using the native candidate · **Branch:** Interfaces

Start system authentication on the canonical backend → use dedicated mobile session → import/inspect/search PDFs → prepare fax/email → open authenticated browser for final review → read tracking.

**Failure and recovery:** Native sessions cannot approve or send. Account erasure processing, physical-device sign-in, signing, TestFlight and App Store distribution require separate qualification.

## J12: Manage credits

**Actor:** Browser administrator · **Branch:** Operate

Read welcome/available/reserved/consumed balances → inspect the annual UTC consumption grid and selected-day totals → open the latest recorded usage month or select current/previous UTC month → inspect usage/billing → reserve the exact approved ceiling atomically with acceptance/outbox → settle using qualified provider evidence.

**Failure and recovery:** Welcome credit is one-time, not monthly. Top-up is not commercially qualified. Unknown outcomes retain reserves; fax delivery alone does not settle verified usage. An empty current month does not mean lost history; failed period reads offer retry without replacing ledger or balance.

## J13: Purchase a PDF verification

**Actor:** Current browser administrator for a purchase; current PDF reader for history · **Branch:** Operate

Read current capability and price → select the ready immutable PDF and PDF/UA or PDF/A profile → explicitly accept this exact purchase → reserve available account credit atomically → run the private engine → settle once for a complete valid report → inspect report/history/JSON and complete human review.

**Failure and recovery:** Require current PDF authority, browser administrator purchase consent, available credit and scanner/private validator. Engine failure creates no settled charge; a valid failing-conformance report is billable. Recover uncertain responses with the same key. A new check needs a new purchase. Existing reports retain their document access policy without monthly subscription.

## J14: Receive a protected PDF

**Actor:** External recipient · **Branch:** Deliver

Open the private link → enter the separately supplied password → download the unchanged PDF while access remains valid; no recipient account required.

**Failure and recovery:** Expiry, revocation, invalid credentials or unavailable storage refuse access. Never reveal passwords through assistant tools/chat or infer PDF reading from email delivery.

## J15: Release a change

**Actor:** Developer and explicitly authorised release operator · **Branch:** Operations

Update feature tree/developer contracts/source/tests together → regenerate and check atlas → check canonical build assets and compatibility redirects → run exact-source checks → review → obtain explicit merge/release authority → publish from clean synchronized main → verify public manifest/assets and separately qualify authenticated/runtime behavior.

**Failure and recovery:** Dirty source, drift, failing checks, missing configuration/scan or absent authority blocks release. Unexpected redirects or changed/missing advertised bytes fail served verification; correct the source and repeat the reviewed release sequence without weakening verification. CI, local fixtures, production HTTP and real provider/client proof remain distinct.

## J16: Verify identity and find a responsible contact

**Actor:** Browser member in the current workshop · **Branch:** Access

Read visible name/login email → open account profile for role → inspect effective permissions and workshop responsible contacts → edit own name/language or explicitly switch account.

**Failure and recovery:** Provider login email is read-only identity data. Missing address/contact errors stay explicit. Reconcile identity after tab focus and ignore cancelled stale reads without interrupting editing.

## J17: Inspect the platform in Belvédère

**Actor:** Explicitly authorised browser Watchkeeper with verified identity · **Branch:** Operations

Open the server-secret platform address → inspect read-only overview/workshops/members/dispatches/connections/finances/infrastructure → read available provider measurements and their limits.

**Failure and recovery:** Workshop administrator/OAuth/assistant roles grant no platform authority. Unknown costs/profit stay unavailable. Preview fixtures and hosted observations are separate.

## J18: Inspect production without sending

**Actor:** Local operator using public anonymous reads · **Branch:** Operations

Run the bounded local monitor → read canonical health/releases/pages/private refusals and retired-origin closure → inspect timestamped hashes and partial per-feature proof → stop when finished.

**Failure and recovery:** At 120 seconds evidence becomes stale. Public success does not qualify authenticated workflows, scanner/provider delivery or a permanent monitoring service.

## J19: Dry-run an existing dispatch

**Actor:** Current dispatch reader; OAuth assistant with dispatches:read · **Branch:** Deliver

Select an existing accessible dispatch → call read-only dry run → inspect state/attempt/quote/document/recipient gates → follow explicit partial or blocked guidance.

**Failure and recovery:** Create/renew/consume no quote, reserve no quota/credit, enqueue nothing and contact no provider. Expiry stays expired. Successful validation grants no sending authority.

## J20: Read service status and evidence

**Actor:** Anonymous visitor, customer or on-call reader · **Branch:** Operations

Open public status → inspect freshness and public groups → compare observed success and history coverage → read Checks for separate local evidence → read Operations for limits/actions.

**Failure and recovery:** Missing/invalid/unavailable/stale evidence makes current state unknown. Public reads do not trigger collection; local simulation never becomes production delivery proof.

## J21: Save and restore workspace appearance

**Actor:** Authenticated browser member changing their own preference · **Branch:** Operate

Enter through compact My documents/workshop navigation → inspect role and detailed rights on My account → choose Classic/V2 beside language → save successfully → reload or change workshop/device → reconcile the saved personal preference with current identity.

**Failure and recovery:** Temporary atelier overrides never claim a server save and clear after explicit save/identity change. Old cache cannot override the current person; business authority remains identical.

## J22: Qualify reviewer OAuth refresh

**Actor:** Explicitly authorised Auth0 platform operator; account owner for real OAuth consent · **Branch:** Operations

Inspect exact existing client/API/Actions with GET → review redacted state/change fingerprint → under explicit authority apply ordered missing steps → qualify exact renewal state → separately observe real consent/refresh/revocation.

**Failure and recovery:** Stop on drift, unknown Action/client or uncertain write. Never provision duplicate clients or auto-complete partial state. prepare_only restrictions, sends and expert mandates remain unchanged.

## J23: Maintain private scanner signatures

**Actor:** Authorised operator and explicitly scoped dedicated GitHub Actions credential · **Branch:** Operations

Inspect exact hosted qualification/private health/signature freshness/token expiry → rebuild/release from reviewed clean source under explicit authority → verify the loaded definitions and watchdog evidence.

**Failure and recovery:** Stop on main/protected-source/CI/inventory drift. A successful build is not fresh loaded scanner proof. No customer scans/sends; independent monitoring must cover GitHub failure.

## J24: Use the Guteneo Auth0 browser domain

**Actor:** Authorised platform operator for setup/release; person for ordinary browser sign-in · **Branch:** Access

Review exact Auth0/DNS/domain plan → explicitly configure/publish after qualification → start canonical browser/mobile-authorize flow → verify signed tokens → restore the same canonical subject/workshop and valid deep link.

**Failure and recovery:** Unknown domain/transaction, wrong issuer/nonce or differing subject fails closed. Never link identities by email. MCP resource/issuer stay canonical; rollback does not silently switch identities.

## J25: Recover from a public HTTP error

**Actor:** Browser visitor with no additional workshop authority · **Branch:** Interfaces

Request an eligible public HTML document → retain real error status → show localised message/accessible artwork → choose an explicit home/help/assistant/developer/status recovery link.

**Failure and recovery:** Private/API/auth/MCP, JSON/PDF/binary/event-stream, explicit downloads and range protocols retain their contracts. Missing media/translation remains closed; reflect no private URI/query/body and never invent success.

## J26: Receive a sensitive document with one Guteneo account

**Actor:** Personal recipient, with or without a workspace; sender’s current approver confirms association · **Branch:** Active individual invitation, personal principal and current document policy; association confirmed before content

Open the invitation → capture/remove its fragment token before any HTTP login URL → same-tab ten-minute handoff → Auth0 sign-in/registration and secret-free return → request association with verified account/address and a recent session under the active policy → await independent workspace confirmation → read authorized pages/text and find the share in My documents. Receipt creates no workspace, purchase or marketing consent.

**Failure and recovery:** Wrong account, expired token, revoked access or insufficient policy evidence exposes no sensitive title/original. Explicitly switch account or reopen the link; if storage is blocked, sign in then reopen without a secret returnTo. A 401 offers explicit recovery without loops. No physical identity or complete reading is promised. A changed association candidate requires fresh attestation. Personal-list 401/403 clears metadata/cursors and ignores late obsolete responses.

## J27: Prepare and activate sensitive distribution

**Actor:** Authorized preparer → browser approver under the active document policy → authorized confirmer · **Branch:** Web/REST/MCP/packages prepare and follow; sensitive approval is browser-only

Open Secure distribution after Documents, keeping Overview/Assistants first and the active entry coherent → select an accessible ready PDF up to 100 pages/10 MiB → one recipient → 7/30/90/365 days → optional original export/personal copy → subject/message/language → idempotent preparation → follow preparing under the same ID → review final pages/text, recipient, rights, message and tax-exclusive total including transport → separately attest the email request → browser approve → confirm/activate → inspect paginated provenance/actor audit with ninety-day detailed access and separate immutable receipts. Revocation blocks future access without refund. Explicit source pagination reaches older PDFs; permitted personal copies remain exportable even when the shared original is not.

**Failure and recovery:** Unqualified source, integrity, scan, rendering, authority, price, credit or configuration closes the flow. Revoke unexpired legacy draft/active hosting first. A prior postal derivation, legacy send, postal preflight or provider draft requires a dedicated source even after cancellation/failure. Sensitive reference permanently excludes ordinary email/fax/postal attachments, legacy transforms, cropping, analysis and password reads; only the dedicated sourceless invitation remains eligible. Bidirectional service/SQL guards close concurrent legacy writes and provider-transfer races. No original/legacy-link fallback. Expert mandates and assistant-asserted consent cannot approve. Unknown outcomes reread the same ID without new orders or blind provider retry. Check my access voluntarily opens /auth/login?fresh=1 and returns to the distribution list without sensitive IDs/invitations; it grants no preparation/approval or implicit old SSO. Dated Resend qualification/local email flags establish no installed global D1 quotas, webhook/secret or delivery.

## J28: Keep, export and delete a personal copy

**Actor:** Recipient owner with a recent policy-compliant session, independent of the original workspace · **Branch:** Independent copy funded at share activation and acquired only after durable deposit activation

In an active share allowing deposit, read independent retention/export terms → explicitly Keep a copy → follow the same bounded persistent operation → wait for active copy → open Saved copies → export with five-minute authentication freshness → view personal history or explicitly confirm deletion. The same account also opens Guteneo services.

**Failure and recovery:** Revocation before acquisition prevents acquisition; later revocation cannot delete the copy. After timeout/tab closure, resume the same operation without a second copy/charge. No success before activation. Personal deletion removes neither workspace source nor exported files; later private reads are not reported to the workspace. Deletion/expiry prevents redeposit through the same invitation, including direct calls, without fake preparation, recreation or debit.

## J29: Move from received documents to services with the same account

**Actor:** Guteneo account owner with zero or more memberships · **Branch:** Personal-to-workspace navigation, without another registration or separate sender account

Start in My documents → voluntarily open Use Guteneo → choose Prepare a dispatch or New share → select a current membership or request the initial workspace → idempotent creation, initial administrator and closed channels → reload the chosen destination and reread server session/workspace/rights/CSRF → continue normal preparation using the same name/language/identity. Local browser regression creates an administrator workspace then selects another as operator, with real screen/profile changes in both contexts.

**Failure and recovery:** Receipt never permits entry into the sender’s workspace; an organizationId without membership is denied. Creation/selection failure stays visible in the personal area without false navigation. Success retains no previous workspace session/authority. Registration implies no purchase, subscription, confidential-content targeting or marketing email; promised document access remains independent of conversion.

## J30: Read browser reports for the deployed version

**Actor:** Anonymous reader; authorized GitHub runner only for report ingestion, without membership · **Branch:** Public status → browser report → version and freshness

Scheduled/manual main workflow → twenty-eight fixed public checks with Node identity/no-transform requests, canonical HTML origin no-transform responses and strict received-size/SHA comparison, without business login/sending → sanitized report with body-bound OIDC → read execution date, tested commit and observed version → inspect checks, GitHub execution and history. Fourteen Cron checks remain independent. Authenticated business coverage awaits dedicated accounts and a qualified connected journey under the active document policy.

**Failure and recovery:** Absent, stale, incomplete, invalid or version-mismatched reports remain neutral with explicit limits. An observed discrepancy stays in that report. Public reads launch no test. Incorrect OIDC identity, body hash or GitHub context denies ingestion. Local checks establish no paid operation, business authentication, communication, publication or delivery. Failure diagnostics are bounded to HTTP/OIDC/ingestion stages and allowed codes outside the signed body. No silent retry replaces a failed observation; an artifact written before ingestion does not prove the report was stored. HTML transformation remains a complete verification failure; a client request cannot replace the origin response rule. Direct-job workflow claim pairs must match the canonical main workflow and expected commit, or both be absent for legacy tokens. Local diagnostics after an actual ingestion rejection cannot turn it into success. Application HTML preservation and status-service claim verification require separate publication and hosted proof.

## J31: Understand and change a feature

**Actor:** Reader → contributor · **Branch:** Engineering

Open the engineering site → find a feature in the generated tree → read its architecture and workflow guide → reproduce the behavior locally → update the authoritative feature source and developer guide together → run documentation and relevant behavior checks.

**Failure and recovery:** Stale generated pages and broken internal links fail validation. Restricted runbooks and dated private evidence remain in the repository. Publication needs explicit authorization and separate hosted verification.
