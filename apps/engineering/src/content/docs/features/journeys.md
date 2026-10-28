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

Open the concise public homepage with its approved browser icon in its preselected URL/cookie/browser language, without a session probe or late translation → choose visitor language or the header appearance icon → read How it works, Getting started, Pricing or PDF checks and the complete Support FAQ through canonical shared navigation with initial styles and same-document page changes preserving language, metadata, focus and browser history → open Engineering documentation from the shared Resources footer for English technical guides → use the existing localized closing invitation and first-dispatch link above the home-only panorama → enter canonical Auth0 → register one personal account with V2 appearance → ordinary /app entry without membership opens Services with create/join workspace choice; explicit personal-document entry stays personal → create a workspace or review and accept an administrator invitation → verify current identity, saved account language and rights before useful private content. Return to the valid destination. Explicit logout opens the public home and restores the separate visitor choice.

**Failure and recovery:** Refuse invalid callback state, unknown issuer/subject or expired invitation. Recovery retries are explicit. Invalid/duplicate presentation hints fall back safely and grant no identity; explicit public language cannot be replaced by a conflicting late account read. Legacy storage migration excludes private/recovery URLs. Package download, optional Auth0 branding/domain and actual host sign-in each need separate proof. Public route presentation, a localized status link and the fictional example grant no approval or provider activation; failed detail loading retains complete styled static information. Modified/external/private/download links retain native behavior; unavailable initial JavaScript retains complete static HTML and native links without a blank loading page.

## J02: Administer a team

**Actor:** Browser administrator · **Branch:** Access

Open members → invite individually or preview CSV → select role and supervisor options → confirm → track invitations → change/revoke rights. Members without management use workshop contacts.

**Failure and recovery:** Protect the last administrator. Rights changes revoke access/pending approvals. Directory errors announce manual recovery without stealing focus or losing profile input.

## J03: Prepare a fax

**Actor:** Administrator, supervisor or operator; current approver for acceptance · **Branch:** Deliver

Import/reuse the exact ready PDF → collect E.164 recipient/sender/ceiling → obtain the actual quote → show estimate and separate ceiling → human browser approval or existing expert review → confirm → track delivery and usage settlement separately.

**Failure and recovery:** Keep reviewer quotes unsendable. Expired operator tariffs require a separately authorized scoped replacement after matching runtime/SQL support; old price evidence stays dated and no mandate is renewed. Renew only an eligible prepared unattempted quote with exact original parameters and stable key, then obtain fresh approval. Unknown submissions require reconciliation, never resend.

## J04: Prepare and send postal mail

**Actor:** Preparer → current approver · **Branch:** Deliver

Read postal setup/requirements → collect missing sender/recipient/options → optionally create an address page from the original → read the final PDF → preflight → separately authorise transfer → obtain the exact provider quote → final approval/send → track.

**Failure and recovery:** Respect address window/profile and scan gates. A failed/unknown transfer cannot be reset with another key. A prepared provider draft is not a sent letter; ordinary post has no invented proof of receipt.

## J05: Prepare an email

**Actor:** Preparer → current approver · **Branch:** Deliver

Collect recipient and ready PDF → default to My documents, with an explicit attachment alternative → optionally supply subject/message/custom HTML with {{document_url}}, otherwise use localized workspace V2 defaults → prepare secure distribution → follow rendering on the same ID → browser review exact email, PDF, policy and quote → attest the email request → approve and confirm → track. Message-only and explicit legacy modes retain ordinary dispatch approval. → recipient may explicitly unsubscribe/report through the footer; track the response separately from delivery and access.

**Failure and recovery:** Never infer recipient consent. Protected passwords stay in the sender browser and are shared separately. Provider acceptance/delivery/PDF reading are different facts; unknown outcomes require reconciliation. Later workspace/profile changes do not rewrite frozen content or resend existing mail. Missing/invalid documents do not permit defaults; malformed or wrong-mode button markers require corrected preparation. Account content overflow identifies the field and limit before rendering; generated buttons follow the notification locale even when interface and account language differ. For secure account invitations only, use explicit browser quote recovery from the original eligible unsubmitted share; review the replacement price again. Fresh sign-in preserves the existing safe share path and grants no approval.

## J06: Create a reusable template

**Actor:** Preparer with current resource rights · **Branch:** Create

Read authoring guide or a synthetic example → create/private-copy or import DOCX content → edit schema/layout and optionally embed a local PNG/JPEG logo or image on the selected page → save committed native property edits → inspect warnings/exact PDF preview → review optional AI proposal → publish an immutable version → configure independent sharing rights.

**Failure and recovery:** DOCX is content import, not faithful Word layout reproduction. Invalid/unsupported images preserve the template and permit another choice; pending invalid property edits block saving until corrected. expectedRevision fences concurrent edits. AI requires configured consent and current authority before transfer/return; stale proposals do not apply. Known assistant-excluded content stops processing.

## J07: Turn data into PDFs

**Actor:** Preparer owning the private source · **Branch:** Create

Import CSV/XLSX/XML/JSON → verify/profile the exact original → select sheet/header/record path → define deterministic versioned mappings → validate every row → select published template → generate → inspect results and provenance.

**Failure and recovery:** Resume the same original after transient analysis failure. Resolve mapping/type/join issues explicitly. Generation completion does not establish PDF readiness; follow the bounded security-analysis refresh and review retryable or blocked results explicitly. AI is optional and separately consented; generation creates no dispatch or credit reservation.

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

Choose the host-specific guide → for ChatGPT download/import the plugin ZIP or choose manual MCP with the supplied public client ID and empty secret when unavailable → compare package version/hash and actual tool titles/schemas/descriptions → follow the maintained workflow skills/prompts under actual host rules and consent OAuth → verify read-only account capabilities/current mandate → use only available file transport/tools → prepare → review through browser or pre-existing bounded delegation → track.

**Failure and recovery:** Archive download/import, directory metadata or a portal scan creates no connection proof, extra role, scope or mandate. Directory publication and every-tool test attestation need separate evidence. Missing host upload support uses the manual guide; OAuth failures require the actual registered client/callback and exact issuer response; update stale imports and preserve reviewer identity, never use a shared token or advertise unavailable DCR. Announce excluded-content rules before collection and stop known excluded content. Respect host confirmations and no automatic unknown-outcome retries.

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

Open the private /share link through the protected handler → read the localized page and enter the separately supplied password → download the unchanged PDF while access remains valid; no recipient account required.

**Failure and recovery:** Expiry, revocation, invalid credentials or unavailable storage refuse access. Never reveal passwords through assistant tools/chat or infer PDF reading from email delivery. A generic site 404 requires route/hosting diagnosis; do not create a replacement send or bypass access checks.

## J15: Release a change

**Actor:** Developer and explicitly authorised release operator · **Branch:** Operations

Update feature tree/developer contracts/source/tests together → regenerate and check atlas → check canonical build assets and compatibility redirects → run exact-source checks → review → obtain explicit merge/release authority → publish from clean synchronized main → verify public manifest/assets and separately qualify authenticated/runtime behavior.

**Failure and recovery:** Dirty source, drift, failing checks, missing configuration/scan or absent authority blocks release. Manual reruns must select the latest same-run evidence deterministically without deleting failed attempts, falling back to older passing reports or bypassing complete-result verification. Private-engine graceful-stop or idle failures keep customer activation closed; explicit force-stop recovery is not qualification. Unexpected redirects or changed/missing advertised bytes fail served verification; correct the source and repeat the reviewed release sequence without weakening verification. CI, local fixtures, production HTTP and real provider/client proof remain distinct.

## J16: Verify identity and find a responsible contact

**Actor:** Browser member in the current workshop · **Branch:** Access

Read visible name/login email → open account profile for role → inspect effective permissions and workshop responsible contacts → edit own name/language or explicitly switch account.

**Failure and recovery:** Provider login email is read-only identity data. Missing address/contact errors stay explicit. Reconcile identity after tab focus and ignore cancelled stale reads without interrupting editing.

## J17: Inspect the platform in Belvédère

**Actor:** Explicitly authorised browser Watchkeeper with verified identity · **Branch:** Operations

Open the dedicated protected Belvédère host root, or compatible server-secret entry → complete normal Auth0 sign-in and current platform guard → inspect read-only overview/workshops/members/dispatches/connections/finances/infrastructure → read available provider measurements and their limits.

**Failure and recovery:** Workshop administrator/OAuth/assistant roles grant no platform authority. Unknown costs/profit stay unavailable. Preview fixtures and hosted observations are separate.

## J18: Inspect production without sending

**Actor:** Local operator using public anonymous reads · **Branch:** Operations

Run the bounded local monitor → read canonical health/releases/pages/private refusals and retired-origin closure → inspect timestamped hashes and partial per-feature proof → stop when finished.

**Failure and recovery:** At 120 seconds evidence becomes stale. Public success does not qualify authenticated workflows, scanner/provider delivery or a permanent monitoring service.

## J19: Dry-run an existing dispatch

**Actor:** Current dispatch reader; OAuth assistant with dispatches:read · **Branch:** Deliver

Select an existing accessible dispatch → call read-only dry run → inspect state/attempt/quote/document/recipient gates → follow explicit partial or blocked guidance.

**Failure and recovery:** Create/renew/consume no quote, reserve no quota/credit, enqueue nothing and contact no provider. Expiry stays expired. Successful validation grants no sending authority.

## J20: Read public availability and history

**Actor:** Anonymous browser reader or public-information consumer, with no workshop or platform authority · **Branch:** Operations

Open public status from its URL or common footer with the same approved product browser icon → read current summary, observation time and three public-access groups → choose 7/30/365 days → select a day/month or expand all daily records → distinguish received success, partial coverage and unknown/precollection periods → refresh existing evidence or use a canonical localized footer destination. Language/theme controls retain the selected history and create no business operation.

**Failure and recovery:** Missing, invalid, unreadable, contradictory, implausibly future or stale evidence makes current availability unknown; an earlier successful observation never stays green as a current result. An actual fresh failed check identifies its group. A history error supplies no percentage. Public reads trigger no collection, test, approval or transmission; local simulation and configuration never prove business delivery.

## J21: Save and restore Classic/V2 application layout

**Actor:** Authenticated browser member changing their own preference · **Branch:** Operate

Enter personal documents or the workshop → open account customization → choose Classic/V2 beside the shared language and color controls → save successfully through the existing context-specific profile endpoint → apply the saved personal preference in a full-width shell with responsive gutters and readable internal forms → reload, switch identity or enter the other application context → reconcile the current account preference without workshop bootstrap in personal documents.

**Failure and recovery:** Temporary atelier overrides never claim a server save and clear after explicit save/identity change. Old cache cannot override the current person; business authority remains identical. Immediate system/light/dark browser appearance is a separate preference and never claims an account profile save.

## J22: Qualify reviewer OAuth refresh

**Actor:** Explicitly authorised Auth0 platform operator; account owner for real OAuth consent · **Branch:** Operations

Inspect exact existing client/API/Actions with GET → review redacted state/change fingerprint → under explicit authority apply ordered missing steps → qualify exact renewal state → separately observe real consent/refresh/revocation.

**Failure and recovery:** Stop on drift, unknown Action/client or uncertain write. Never provision duplicate clients or auto-complete partial state. prepare_only restrictions, sends and expert mandates remain unchanged.

## J23: Maintain private scanner signatures

**Actor:** Authorised operator and explicitly scoped dedicated GitHub Actions credential · **Branch:** Operations

Inspect exact hosted qualification/private health/signature freshness/token expiry → rebuild/release from reviewed clean source under explicit authority → verify the loaded definitions and watchdog evidence.

**Failure and recovery:** Stop on main/protected-source/CI/inventory drift. A successful build is not fresh loaded scanner proof. No customer scans/sends; independent monitoring must cover GitHub failure.

## J24: Use the Guteneo Auth0 browser and MCP domains

**Actor:** Authorised platform operator for reviewed domain/trust/discovery configuration; person for browser sign-in or host OAuth consent · **Branch:** Access

Qualify the exact same-tenant alias and signing keys → deploy reviewed code and explicit MCP trust/discovery settings → host reads exact issuer metadata and completes its own consent/PKCE exchange → validate signed issuer/audience/subject → use the same canonical identity/workshop/connection. Roll discovery back independently while retaining established token trust.

**Failure and recovery:** Unknown domain/configuration/issuer, bad signature/audience/time/nonce or differing browser subjects fail closed. Never link identities by email or select JWKS from token claims. Existing canonical clients remain valid. Removing custom trust deliberately rejects custom tokens and is distinct from discovery rollback; no new scope, client, grant, approval or mandate is created.

## J25: Recover from a public HTTP error

**Actor:** Browser visitor with no additional workshop authority · **Branch:** Interfaces

Request an eligible public HTML document → retain real error status → show localized message/accessible artwork in system or the bounded host-only theme choice → use canonical shared footer or an explicit home/help/assistant/developer/status recovery link.

**Failure and recovery:** Private/API/auth/MCP, JSON/PDF/binary/event-stream, explicit downloads and range protocols retain their contracts. Missing media/translation remains closed; reflect no private URI/query/body and never invent success. An appearance cookie contains only an allowlisted nonsecret enum and grants no document/session access.

## J26: Receive a sensitive document with one Guteneo account

**Actor:** Personal recipient with matching verified address and current-policy session; workspace approver only for independent policies · **Branch:** Active individual invitation, personal principal and current document policy; association confirmed before content

Open the invitation → capture/remove its fragment token before any HTTP login URL → same-tab ten-minute handoff → Auth0 sign-in/registration and secret-free return → open the document with verified account/address and a recent session → atomically bind the stable account for verified_email, or await workspace confirmation only for independent/historical policies → read authorized pages/text and find the share in My documents. Receipt creates no workspace, purchase or marketing consent. Personal section navigation retains the authenticated shell; a new invitation is captured and removed before its route renders, and every data delivery still checks current authority.

**Failure and recovery:** Wrong account, expired token, revoked access or insufficient policy evidence exposes no sensitive title/original. Explicitly switch account or reopen the link; if storage is blocked, sign in then reopen without a secret returnTo. A 401 offers explicit recovery without loops. No physical identity or complete reading is promised. A changed association candidate requires fresh attestation. Personal-list 401/403 clears metadata/cursors and ignores late obsolete responses. Verified-account recovery uses ordinary one-hour Auth0 SSO; missing signed auth_time in a legacy cookie is not backfilled. Strong/default recovery retains its existing forced freshness. Recovery grants no approval or additional recipient rights.

## J27: Prepare and activate sensitive distribution

**Actor:** Authorized preparer → browser approver under the active document policy → authorized confirmer · **Branch:** Web/REST/MCP/packages prepare and follow; sensitive approval and quote renewal are browser-only

Open Secure distribution after Documents, keeping Overview/Assistants first and the active entry coherent → select an accessible ready PDF up to 100 pages/10 MiB → one recipient → 7/30/90/365 days → optional original export/personal copy → optional subject/message/custom HTML or localized workspace V2 defaults, plus approved binding policy → idempotent preparation → follow preparing under the same ID → review final pages/text, recipient, rights, message and tax-exclusive total including transport → separately attest the email request → one priced browser Send action records approval then activation with the existing verified session; MCP reads active state and tracks without another confirmation → inspect paginated provenance/actor audit with ninety-day detailed access and separate immutable receipts. Revocation blocks future access without refund. Explicit source pagination reaches older PDFs; permitted personal copies remain exportable even when the shared original is not. Provider submission retains only transport in its reservation after committing retention fees; signed outcomes update invitation tracking separately from shared access.

**Failure and recovery:** Unqualified source, integrity, scan, rendering, authority, price, credit or configuration closes the flow. Revoke unexpired legacy draft/active hosting first. A prior postal derivation, legacy send, postal preflight or provider draft requires a dedicated source even after cancellation/failure. Sensitive reference permanently excludes ordinary email/fax/postal attachments, legacy transforms, cropping, analysis and password reads; only the dedicated sourceless invitation remains eligible. Bidirectional service/SQL guards close concurrent legacy writes and provider-transfer races. No original/legacy-link fallback. An expired or changed invitation quote offers explicit browser renewal only for an eligible unsubmitted original; preserve stored inputs and ceiling, resume the same deterministic replacement after failure, then review and approve again. Accepted/attempted work never renews. Expert mandates and assistant-asserted consent cannot approve. Unknown outcomes reread the same ID without new orders or blind provider retry. Localized Sign in again voluntarily opens the existing hosted login: DOCUMENT_AUTHENTICATION_REQUIRED uses ordinary bounded SSO, while strong, explicit freshness and browser-approval refusals retain fresh=1. Recovery preserves the valid existing share path and locale while stripping query/secondary fragments, with no private form storage, automatic write replay or weaker session checks. Recipient invitation secrets stay outside returnTo. Dated Resend qualification/local email flags establish no installed global D1 quotas, webhook/secret or delivery. Secure preparation failures emit a fixed operational signal once; delivery failures and unknown results require inspecting the existing invitation dispatch, without resending or refunding committed hosting. Expired/revoked sessions require ordinary login; verified_account has no separate 15/5-minute authentication gate, while strong retains its existing windows. After a failed browser final action, explicitly check the same status before same-key recovery; status refresh sends nothing.

## J28: Keep, export and delete a personal copy

**Actor:** Recipient owner with a recent policy-compliant session, independent of the original workspace · **Branch:** Independent copy funded at share activation and acquired only after durable deposit activation

In an active share allowing deposit, read independent retention/export terms → explicitly Keep a copy → follow the same bounded persistent operation → wait for active copy → open Saved copies → export with five-minute authentication freshness → view personal history or explicitly confirm deletion. The same account also opens Guteneo services.

**Failure and recovery:** Revocation before acquisition prevents acquisition; later revocation cannot delete the copy. After timeout/tab closure, resume the same operation without a second copy/charge. No success before activation. Personal deletion removes neither workspace source nor exported files; later private reads are not reported to the workspace. Deletion/expiry prevents redeposit through the same invitation, including direct calls, without fake preparation, recreation or debit.

## J29: Move from received documents to services with the same account

**Actor:** Guteneo account owner with zero or more memberships · **Branch:** Personal-to-workspace navigation, without another registration or separate sender account

Start in My documents → voluntarily open Use Guteneo → choose Prepare a dispatch or New share → select a current membership or request the initial workspace → idempotent creation, initial administrator and closed channels → reload the chosen destination and reread server session/workspace/rights/CSRF → continue normal preparation using the same name/language/identity. Local browser regression creates an administrator workspace then selects another as operator, with real screen/profile changes in both contexts.

**Failure and recovery:** Receipt never permits entry into the sender’s workspace; an organizationId without membership is denied. Creation/selection failure stays visible in the personal area without false navigation. Success retains no previous workspace session/authority. Registration implies no purchase, subscription, confidential-content targeting or marketing email; promised document access remains independent of conversion. An obsolete workspace bootstrap cannot overwrite a personal route, and returning to service use reads fresh workspace authority.

## J30: Read version-bound browser reports through the public report API

**Actor:** Anonymous reader; authorized GitHub runner only for report ingestion, without membership · **Branch:** Separate browser monitor → public report API → version and freshness

Scheduled/manual main workflow → twenty-eight fixed public checks with Node identity/no-transform requests, canonical HTML origin no-transform responses and strict received-size/SHA comparison, without business login/sending → sanitized report with body-bound OIDC → technical consumer reads GET /api/e2e-status for execution date, tested/observed commits, checks and history. The customer status page no longer fetches or presents these reports. Fourteen Cron checks remain independent; authenticated coverage still requires dedicated identities and a qualified connected journey under the active document policy.

**Failure and recovery:** Absent, stale, incomplete, invalid or version-mismatched reports remain neutral with explicit limits. An observed discrepancy stays in that report. Public reads launch no test. Incorrect OIDC identity, body hash or GitHub context denies ingestion. Local checks establish no paid operation, business authentication, communication, publication or delivery. Failure diagnostics are bounded to HTTP/OIDC/ingestion stages and allowed codes outside the signed body. No silent retry replaces a failed observation; an artifact written before ingestion does not prove the report was stored. HTML transformation remains a complete verification failure; a client request cannot replace the origin response rule. Direct-job workflow claim pairs must match the canonical main workflow and expected commit, or both be absent for legacy tokens. Local diagnostics after an actual ingestion rejection cannot turn it into success. Application HTML preservation and status-service claim verification require separate publication and hosted proof.

## J31: Understand and change a feature

**Actor:** Reader → contributor · **Branch:** Engineering

Open the engineering site → find a feature in the generated tree → read its architecture and workflow guide → reproduce the behavior locally → update the authoritative feature source and developer guide together → run documentation and relevant behavior checks.

**Failure and recovery:** Stale generated pages and broken internal links fail validation. Restricted runbooks and dated private evidence remain in the repository. Publication needs explicit authorization and separate hosted verification.

## J32: Choose browser appearance

**Actor:** Anonymous or signed-in browser reader; no role or additional authority required · **Branch:** Interfaces

Start with the operating-system palette unless a valid local choice exists → use the shared public/personal header or Belvédère page-action localized light/dark action icon at any viewport, with public activation available before React, or a three-way account setting where that surface exposes one → apply the resolved palette in place → retain the local origin preference when storage is available → follow system or same-origin storage changes. Main-site standalone HTML uses only the host-only enum cookie; status and engineering retain independent origin state. Native public pictures select matching dark art; header/app white paper stays inside each actual inner blue frame with transparent exterior/perforations, while document/PDF/email surfaces keep original content appearance.

**Failure and recovery:** Blocked persistence still permits an in-page choice. Invalid or duplicate cookies fall back to system without interpolation or account lookup. Script-free CSS follows system; language, Classic/V2 layout, identity, drafts, approval and provider gates remain independent. Local browser-engine evidence establishes no physical-device Safari or deployed-host pass.

## J33: Open personal documents without an unrelated workspace wait

**Actor:** Authenticated personal account owner, with or without a workspace · **Branch:** Access

Open My documents directly or use the shared blue-outlined personal-context entry in Classic/V2 desktop/mobile navigation → start the personal shell → validate current personal session → read the authorized list across the available main width with responsive gutters → retry a failed list explicitly. On focus or account change reconcile the session and discard previous identity/document state; returning to a workshop loads its current session and rights.

**Failure and recovery:** Personal policy and recipient bindings are never skipped. Cancelled or late workspace/account results cannot restore earlier identity, language or documents; expired sessions use established recovery. The five-context synthetic timing comparison is bounded local instrumentation, not production latency, real-client access or provider delivery proof.

## J34: Upload a private original through a connected assistant

**Actor:** Current OAuth writer (administrator, supervisor or operator) with documents:write and explicit original-file handling authorization; actual host byte-transfer capability required · **Branch:** Documents

Qualify actual host access to the selected original and its native, permitted binary or bounded inline transport → compute actual original filename, byte count and SHA-256 with code → preserve an available native file envelope, otherwise reserve through begin_document_upload and make one permitted fixed binary PUT, or use one import_inline_pdf invocation with canonical original base64 up to 64 KiB when runtime egress is unavailable → read get_document_upload on the same upload ID under current OAuth authority → inspect the same creator-private document after ordinary scanner/quarantine processing. If a lost inline response contains no ID, recover the strict same key/metadata through begin_document_upload before status; never automatically repeat the encoded import. Later preparation, approval and sending follow separate journeys.

**Failure and recovery:** Reject invalid/noncanonical base64, inline overflow, original size/hash mismatch, unknown/used/expired capability, binary cookies/Authorization/Origin/query/encoding, changed issuer trust/client/connection/revision/membership, overflow and timeout. Validate inline bytes before creating a reservation; the existing 2 MiB MCP request limit is unchanged and does not imply a 10 MiB inline route. Never publish, split inline calls, truncate or reconstruct a private PDF; J37 owns the distinct App-only staging protocol. Recovery retains the same key/upload/document and never blindly retries an unknown outcome or logs original bytes/capabilities. No sending, purchase or human/delegated approval is created. Web/Desktop/Code evidence does not qualify Claude on iPhone.

## J35: Decline or report document email

**Actor:** Holder of the recipient preference capability; sender reads only their authorized delivery status · **Branch:** Recipient-only browser action; scoped REST/MCP readback, no assistant preference tool

Open the email footer preference link → capture and remove fragment token without sign-in or API reads → explicitly unsubscribe or report → same-origin bounded POST → atomic originating-workspace suppression and lifecycle receipt → show Unsubscribed or Email reported separately from delivery and existing document rights.

**Failure and recovery:** Invalid/draft/cancelled capabilities reveal no address or title. GET/scanners do not write. Reopen or retry the same link after failure. Other workspaces and already received documents remain unaffected; reports cannot be downgraded and unknown provider outcomes never auto-retry. A cancellation between capability lookup and commit fails the transaction-time eligibility fences without a preference write; satisfied replays preserve the update timestamp.

## J36: Check an assistant host's MCP Apps capabilities

**Actor:** Authorized operator for temporary diagnostic activation; owner of that exact existing OAuth connection, with current membership and documents:read, for the host interaction · **Branch:** Interfaces

Review the diagnostic source/package and explicit target/window → operator selects one current connection and authorization revision for at most one hour → person opens open_mcp_ui_probe in the actual host → inspect finite local render/secure-context/picker-API states → request the fixed acknowledgement through check_mcp_ui_probe_bridge → optionally request the native chooser from a user gesture and cancel without selecting a file → retain the actual visible result separately → remove activation or let the window expire.

**Failure and recovery:** Absent, malformed, early, expired or mismatched activation makes tools and the resource unavailable; current OAuth, scope, membership and connection revision remain mandatory, including for a cached URI. The probe sends no host context, file metadata or file bytes and creates no document, import/upload grant, quote, approval, charge, outbox or provider operation. Existing authentication/rate/activity accounting remains. Unsupported rendering/bridge/picker is an explicit diagnostic limit, not permission to widen access or relax network/Origin policy. The dated Desktop widget/empty-bridge/native-chooser-cancellation observation proves no selected original, existing-attachment access, larger-file transfer, web or physical-iPhone pass.

## J37: Import a selected local original through an MCP App

**Actor:** Person using a compatible host and their eligible OAuth connection; current administrator, supervisor or operator with documents:write and explicit original-file permission; distinct authorized operator controls bounded qualification or reviewed general activation · **Branch:** Documents; gated MCP App only, existing web/native/REST upload contracts unchanged

Review source/package and actual host checkpoint → apply migration 0063 before code publication even with the App flag off → activate an exact connection/revision window of at most one hour for qualification, or a separately explicit general rollout after reviewed actual qualification and authorized delivery → open open_mcp_document_upload with empty input → person chooses one allowed local PDF from device Files, reviews content exclusions and explicitly clicks Import → App computes actual size/SHA over the same bounded buffer → begin_mcp_document_upload freezes metadata/authority/layout → serialized append_mcp_document_upload calls stage verified fixed parts through the official App bridge → finish_mcp_document_upload verifies the assembled original once and enters the shared private scanner/quarantine pipeline → retain the same creator-private document and publish only its ID/status/size/SHA through text/structured SDK context; only an explicit Use in conversation UI gesture can also post that same minimal JSON receipt through the official App message bridge → verify the actual model receives the registered ID, rather than inferring handoff from the widget receipt → follow existing same-document analysis; prepare only when ready, requested and the exact ID is available. Remove temporary qualification activation afterwards. This is a new local selection, not automatic handoff of a conversation attachment.

**Failure and recovery:** Absent/invalid activation, mismatched/expired qualification, observer role, missing scope, changed connection/revision/issuer/membership, token/session expiry, quota/debt/call limits, noncanonical or conflicting parts and full-size/hash/PDF mismatch fail closed. General mode retains current production OAuth/writer guards; without MCP Apps explain the unsupported flow and retain ordinary tools. Bounds remain 256 KiB/part, 40 parts/10 MiB, 64 App calls, five minutes/original token expiry, one active session per user within the current workspace, 20 pending/200 MiB organization debt and 200 daily reservations. APP_PART_NOT_ACCEPTED is a settled pre-put refusal. APP_PART_UNCONFIRMED allows only manual same-ID status with volatile buffer retained inside fixed expiry/budget/current authority; only positive immutable-object length/hash evidence can enable explicit Resume. Missing objects never authorize replay. Final pipeline uncertainty is status-only and clears bytes; no new key, transport switch or reimport. The App-specific recovery has tool:null rather than instructing model/binary calls. Cancel/expiry/revocation fence writers; bounded cron also reclaims expired global App-finalizer capacity without deleting an original, while staging waits for original expiry plus 90 seconds and unresolved puts retain debt/tombstones. No direct browser fetch, egress/Origin/CSP exception, public PDF, bytes/base64/token in model context/storage/logs, paid check, approval, send or mandate. Release 1.1.6 has bounded actual Claude Desktop selected-original 299,807-byte/10 MiB storage/readiness and manual same-ID receipt recovery without resend, plus zero associated business effects for those two originals. The model then had neither new ID and made zero get_document calls: registered-ID handoff failed and general activation stays pending. The 1.1.8 source fixes preserve accepted receipts after late bridge errors and add text-plus-structured context plus a user-gesture-only minimal-receipt message with local fixtures; import sends no automatic chat message, repeated pending/acknowledged/refused/uncertain attempts are deduplicated for the same ID/status and message failure retains the document; the actual retest remains required, and neither fix proves the earlier deadline cause. Web/iPhone/other hosts, automatic attachment handoff, full retention/confirmation and runtime headroom remain separately unqualified.
