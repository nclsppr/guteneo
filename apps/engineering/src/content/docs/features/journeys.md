---
title: "Customer journeys"
description: "From actor and intent to result, including failure and recovery boundaries."
sidebar:
  order: 91
---

<!-- Generated from docs/feature-map.json. Run npm run docs:build; do not edit this view. -->

These journeys are generated from the same inventory as the [feature tree](/features/). They describe implementation and recovery; [live qualification is separate](/engineering/testing/).

## J01: Discover and sign in

**Actor:** Visitor → verified member · **Branch:** Access

Open the public site → select a visitor language → read the offer/assistant guide → enter canonical Auth0 sign-in → create/join a workshop → verify identity and current rights. Return to the exact valid destination. Explicit logout opens the public home.

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

Read welcome/available/reserved/consumed balances → inspect usage/billing → reserve the exact approved ceiling atomically with acceptance/outbox → settle using qualified provider evidence.

**Failure and recovery:** Welcome credit is one-time, not monthly. Top-up is not commercially qualified. Unknown outcomes retain reserves; fax delivery alone does not settle verified usage.

## J13: Diagnose a PDF with Horizon

**Actor:** Browser administrator for subscription; authorised preparer/assistant for checks; current PDF reader for history · **Branch:** Operate

Read current capabilities → administrator reviews EUR30 recurring-credit subscription → use ready original with selected PDF/UA or PDF/A flavour → consume atomic calendar-month quota → inspect exact-byte report/history/JSON → complete human review.

**Failure and recovery:** Require active entitlement, current PDF authority, scanner/private validator and quota. Automatic checks are not certification. Reuse the key to recover an uncertain request; a new independent check uses a new key.

## J14: Receive a protected PDF

**Actor:** External recipient · **Branch:** Deliver

Open the private link → enter the separately supplied password → download the unchanged PDF while access remains valid; no recipient account required.

**Failure and recovery:** Expiry, revocation, invalid credentials or unavailable storage refuse access. Never reveal passwords through assistant tools/chat or infer PDF reading from email delivery.

## J15: Release a change

**Actor:** Developer and explicitly authorised release operator · **Branch:** Operations

Update feature tree/developer contracts/source/tests together → regenerate and check atlas → run exact-source checks → review → obtain explicit merge/release authority → publish from clean synchronized main → verify public manifest/assets and separately qualify authenticated/runtime behavior.

**Failure and recovery:** Dirty source, drift, failing checks, missing configuration/scan or absent authority blocks release. CI, local fixtures, production HTTP and real provider/client proof remain distinct.

## J16: Verify identity and find a responsible contact

**Actor:** Browser member in the current workshop · **Branch:** Access

Read visible name/login email/role → open account profile → inspect effective permissions and workshop responsible contacts → edit own name/language or explicitly switch account.

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

Open account → choose Classic/V2 beside language → save successfully → reload or change workshop/device → reconcile the saved personal preference with current identity.

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

## J26: Understand and change a feature

**Actor:** Reader → contributor · **Branch:** Engineering

Open the engineering site → find a feature in the generated tree → read its architecture and workflow guide → reproduce the behavior locally → update the authoritative feature source and developer guide together → run documentation and relevant behavior checks.

**Failure and recovery:** Stale generated pages and broken internal links fail validation. Restricted runbooks and dated private evidence remain in the repository. Publication needs explicit authorization and separate hosted verification.
