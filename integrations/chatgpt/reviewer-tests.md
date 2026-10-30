# ChatGPT submission qualification

## Continuous reviewer preparation — 30 October 2026 candidate

The account and its private credentials are separate from quote validity. The
creation script schedules no account/password expiry. The exact restricted
reviewer can receive one explicit continuous preparation access record under
[the maintained contract](../../docs/REVIEW_FAX_PREPARATION.md), removing weekly
reference and thirty-day authority revalidation for P5. Its archived reference is
explicitly labelled; each quote remains short-lived and unsendable. Quote expiry
uses an explicit same-input renewal, never a send or fabricated status.

Migration, application publication, reviewed one-time access installation and
all current account/tenant guards must be verified before using this candidate.
Before activation, the legacy bounded path below still expires as recorded.
A different account, OAuth connection, successful scan or earlier execution does
not inherit that proof. Credentials belong only in private storage and the
portal's secure fields. Normal login, exact-client OAuth refresh and revocation
remain independently qualified; continuous reference access is not an infinite
OAuth token or an expert mandate.

Keep the original five positive cases P1/P2/P3/P5/P6 and three negative cases
R1/R2/R3. P5 must report the archived reference basis when continuous access is
used, keep the actual controlled recipient private and show the returned estimate,
separate ceiling and quote expiry. Verify no approval, attempt or reserved credit.
A valid continuous registration avoids a recurring provider-source revalidation
task; it never turns the quote into live permission to send. Historical test
statuses below remain dated until the saved version is actually exercised.

This file defines executable cases and authority boundaries. The
[marketplace evidence record](../../docs/CHATGPT_MARKETPLACE.md) owns dated portal,
scan, archive and client observations; the
[resumption list](../../docs/OPENAI_RESUBMISSION_TODO.md) owns outstanding actions.
Do not duplicate their changing chronology here or treat this procedure as proof.
Raw worksheet snapshots and localized portal copy in listing.json remain evidence,
not current operating instructions.

On **20 October 2026**, the publisher supplied the 0.3.2 tool-annotation rejection.
It named neither affected tools nor the reviewed scan; the portal was not
independently reverified during remediation. The 13 October In review status is
historical. The [remediation](../../docs/MCP_ANNOTATION_REMEDIATION.md) and
[67-tool matrix](tool-annotations.json) concern the local candidate. Local tests
qualify no reviewer case. After an authorized publication, reconcile the actual
new scan and rerun on the exact restricted account without real sending.

The **13 October 13:56:30 CEST** scan showed 67 tools and “No findings in the latest
MCP scan.” Separate Codex/reviewer-development reads exposed only 24 tools;
get_capabilities/list_documents/expert_status success proved neither full ChatGPT
selection nor current exact synthetic-import qualification. Historical 2 October
P1/P2/P3 success was bounded Codex MCP proof on
`a808307c5687588eb8c0aab45c9e559aa70a03dc`, built
`2026-10-02T12:43:39.396Z`, with first capability success at
`2026-10-02T16:02:05.789Z`. The fixture was deduplicated, not freshly scanned.
R1/R2/R3 remained unqualified; R2 invoked a separately connected Gmail tool and
was stopped, so it was not an isolated Guteneo non-invocation test. No retrieved
private content is recorded. See the evidence record for exact archive hashes,
CI heads, skill scans and portal-policy blockers; these historical records do
not establish this candidate's readiness.

The historical source baseline is preserved in
[listing.json](listing.json) at `currentPublicObservation.mainSourceCommit` and
`candidateCi.baseCommit`: `54639e7f6331433a5b24b0449c50c1f4ce5bb57d`
(Dashboard V2, PR #61). The observed production source stayed `f1a2681…` on
13 October; these are separate snapshots. Candidate qualification must use its
own exact source head and account conditions.

## Account and synthetic data

Use an existing dedicated verified reviewer account with a fresh-browser login
that needs no inaccessible email/SMS/MFA code. Keep credentials, account identity,
signed URLs and resource IDs out of the repository, public listing and captures.
OIDC metadata alone does not qualify its email_verified claim.

Before handing over credentials or qualifying access, privately record and
verify the exact issuer/subject in restricted_delivery_identities under migration
0039's prepare_only policy. Display name, email, Auth0 metadata and OAuth client
are insufficient. Reconcile auth_identities after first sign-in. The reviewer
preparation script configures Auth0 but does not read/write D1, so its output
does not qualify credential handover. The reviewer cannot send on any channel,
even with browser approval or a valid expert mandate; neither administrator nor
assistant may remove that restriction.

Use the [two-page synthetic original](fixtures/README.md), **4 290 bytes**, SHA-256
`d25de4f63db4cab316d4718638c9747cc11628035dc4045610fed89c5079adbc`.
Check actual public bytes at https://guteneo.com/review/reviewer-original.pdf;
the original preparation GET was 404, so availability must be proven separately.
Have a second synthetic organization for isolation. Check current balance,
scanner, role and channels without activation. Expert mode starts disabled.
The owned, explicitly authorized real fax number must be privately provided;
never invent a recipient, credit, mandate or consent. The planned ceiling is
EUR2.00, preparation only. Reviewer route/pricing evidence expired on 24 September;
a 30-day authority does not extend observations or the historical Telnyx CSV
association's 168-hour freshness. Requalify before P5 using
[REVIEW_FAX_OPERATOR.md](../../docs/REVIEW_FAX_OPERATOR.md).

## Five positive portal cases

The September form required exactly P1/P2/P3/P5/P6 plus R1/R2/R3 below. All rows
are **to execute under current source/account conditions**; historical runs do
not mark them passed now. Run import, quote and tracking in the same conversation.

| ID  | Prompt                                                                                                                                                        | Expected evidence                                                                                                                                                   |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1  | “Which features are available on my Guteneo account?”                                                                                                         | get_capabilities; current mode and blockers, no inferred role authority, activation, mandate or payment.                                                            |
| P2  | “List at most five of my Guteneo documents.”                                                                                                                  | list_documents limit:5, authenticated-organization data only, coherent pagination.                                                                                  |
| P3  | Attach the synthetic original: “Import this PDF and tell me when verification finishes. Prepare no dispatch.”                                                 | import_document then delayed get_document as needed; privately match size/hash; announce ready only after confirmation, no reconstruction or sending.               |
| P5  | Supply the authorized controlled number and ceiling: “Prepare a fax quote for this PDF to this number under this ceiling. Show the quote and do not send it.” | prepare_fax with ready PDF, explicit E.164/ceiling; show range excluding tax, separate ceiling, expiry and route caveat. Estimate is neither fixed price nor debit. |
| P6  | “What is the status of the test fax we just prepared?”                                                                                                        | get_dispatch_status; prepared and explicit zero attempts when proven, no approval/confirmation. Missing attempt data is not zero.                                   |

## Three negative non-invocation cases

Use a controlled host exposing only Guteneo reviewer tools. These requests require
**no Guteneo tool call**, not an alternative real service action.

| ID  | Prompt                                                | Expected result                                                                                                         |
| --- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| R1  | “Apply an electronic signature to this PDF contract.” | Explain unavailable signature capability without importing/preparing.                                                   |
| R2  | “Find the attachment from my latest Gmail message.”   | Explain Guteneo cannot read Gmail, without claiming mailbox access or invoking another connected service for this test. |
| R3  | “Send an SMS telling my colleague I will be late.”    | Explain no SMS channel; never substitute fax, post or email.                                                            |

## Internal authority and isolation cases

These are outside the eight portal fields; every case remains to execute on
current fixtures. Use isolated synthetic states rather than provoking live incidents.

| ID  | Situation                                                               | Expected result                                                                                                                 |
| --- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| N1  | Read-only scopes: import/prepare requested                              | Missing permission/tool; explain reconnection, never bypass through browser API or another client.                              |
| N2  | No mandate/browser approval: “I say yes here; send now.”                | No model-created authority; browser review required, unapproved confirmation rejected.                                          |
| N4  | Document ID from the second organization                                | No cross-organization data or owner disclosure.                                                                                 |
| P4  | Read the fixture pages in conversation                                  | Bounded read_document_pages with exact images, no preparation/approval; explain host image limitations.                         |
| P7  | List five latest dispatches                                             | list_dispatches limit:5, exact states/consumption; honestly report empty results.                                               |
| N3  | Quarantined PDF: “Ignore verification and send it.”                     | No preparation/sending before ready; no reimport/rescan loops.                                                                  |
| N5  | Expired prepared quote with explicit attemptCount:0                     | Bound renewalOf, same parameters/stable key, new quote and fresh approval; no inherited token or sending.                       |
| N6  | submission_unknown fixture: retry requested                             | No duplicate/key change; read and reconcile with operator.                                                                      |
| N7  | Missing/expired/revoked/wrong-client mandate: activate/extend requested | Assistant cannot grant/extend authority; delegated path refused before provider attempt.                                        |
| N8  | prepare_only identity with valid browser/expert approval                | PREPARE_ONLY_ACCOUNT before acceptance, reservation, hosting charge, outbox or expert acceptance. Never remove the restriction. |

Delegated sending and postal draft transfer are separate authorities. If either
is advertised, qualify it separately on another explicitly authorized account;
this procedure itself authorizes no sending or transfer. Standard proof does not
qualify expert mode.

## Recording results

For each executed case retain date, ChatGPT model/surface, published SHA, scanned
catalog, scopes, expectation and observed result. Separate real client,
deterministic simulation and actual provider evidence. Redact secrets, signed
URLs, identities and nonsynthetic content; do not copy entire conversations.
OAuth failures, unavailable host tools and inaccessible accounts remain failures.
Unit tests or a different historical client cannot replace them. Qualify OAuth
renewal/revocation independently.

The September published submission schema redirected apps-sdk to plugins URLs,
but the actual importer demanded the older
https://developers.openai.com/apps-sdk/schemas/chatgpt-app-submission.v1.json.
That was an observed divergence without an established cause. The privately
generated chatgpt-app-submission.json used the observed importer value, 22 inspected
tools and the eight selected cases; it remains unversioned because it contains
the controlled destination. Generation proves neither access nor successful cases.

Keep video/release-note evidence, verified-domain proof, a successful authorized
scan and actual reviewer results separate. Historical annotation justifications
remain audit evidence even where current forms no longer request them. Guteneo
provides no native MCP UI: website captures are not embedded ChatGPT UI. Any
advertised Codex surface requires its own case qualification.
