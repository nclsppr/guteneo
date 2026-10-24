# Vertical spot — claims and evidence

Read-only audit **22 September 2026 at 00:02 UTC**, local/public source
`22c24d5235dd204e48effafabef417c9bafac213`. No communication/account change/publication.
[Capabilities](https://guteneo.com/api/capabilities)/[release](https://guteneo.com/release.json)
then reported 0.2.2, production, scanner bound, fax/postal live true, email false,
500 campaign rows, PDF 10 MiB/100 pages. Flags prove no individual delivery/client
integration. Extra requested claims below are **user-stated vision** where source/
proof did not support current availability. Vision has no release date/commitment.
All line references are historical audit observations, not current source locations.

## Historical state matrix

| Pitch claim | Inspected evidence | Bounded conclusion / initial editorial guidance |
| --- | --- | --- |
| One document/dispatch | Immutable PDF/one recipient, approval/cost binding; PRODUCT53–55, ARCHITECTURE81; actual LU fax in CHATGPT_QUALIFICATION11–17 | Available under account/channel gates. Show document/recipient/consent. |
| One→10,000+ documents | content.ts14–20,164–168/public campaignRows500; WELCOME_CREDIT15's10,000 is a monthly safety cap, not campaign/throughput evidence; EXECUTION_PLAN98 reserved massive materialization | **Vision** for 10,000+, no actual send counter/volume guarantee. Current individual-to-campaign language is bounded. |
| Simple campaigns | index.ts672–698 and workspace-pages61–123; individual approval, not whole campaign; no full provider campaign test | Implemented UI/domain with per-dispatch gates; never thousands in one click. |
| Personalized campaigns | content.ts149–162 CSV only channel/contact fields; workspace-pages107–120 reused document/subject/body; no merge/template engine found then | **Vision** for varying document content; distinct recipients do not prove personalization. |
| Marketing campaigns | domain/index665–670 MARKETING_NOT_ENABLED; EXECUTION_PLAN85,98 unsubscribe/reputation gaps | Closed; say correspondence/document campaigns, no fabricated sent advertising. |
| Ordinary email | SES HTML/text/attachments provider221–249; live config line26/email false | Implemented, closed to actual sending; future opening without date. |
| Encrypted email | SES Simple lacks S/MIME/OpenPGP/content encryption; historical TLS is not end-to-end; pdf.ts43–49 rejects encrypted PDFs | **Vision**; lock imagery cannot prove active encryption. |
| Fax | Open public channel; real ChatGPT import/LU delivery; content114–121 accepts FR/LU/DE syntax; PRODUCT16–18/TELNYX_READINESS bound LU pilot to 24 September | Actual limited evidence, subject to sender/price/route; no universal coverage/delay promise; revalidate pilot before publication. |
| Print/postal handover | POSTAL_ACTIVATION38–48 account/PDF/check/transfer/quote/approval; first real letter separate at3–6,91 | Open journey, no first-delivered-letter proof found. Printing/enveloping/handover differ from receipt. |
| All-Europe delivery | content129–134 and POSTAL_ACTIVATION40–41 restricted FR/LU/DE | **Vision** beyond three countries; provider coverage is not Guteneo coverage. |
| PDF upload | Exact upload/HTTPS import, public import/exactBytes/urlImport true; PRODUCT31–36,55 | Available with document gates/limits. |
| Reusable templates | i18n documents.defaultHtml starter/render content101–103; no catalog/versioned templates/merge found then | Starter existed; library was **vision** in that inspected scope. |
| AI generation | render_pdf converts provided HTML, mcp855–865/documents1165–1199; ARCHITECTURE95/EXECUTION_PLAN80 no internal LLM | Rendering exists; external assistant composes. Do not invent native AI engine. |
| Proof/quote before send | ARCHITECTURE81 immutable document/recipient/options/price; postal calculator; native approval.png | Available. Industrial/color proof certification was unproved; call it document/recipient/price review. |
| ChatGPT | Real connection/exact import/LU fax with browser approval; CHATGPT_QUALIFICATION11–17,61–69 | Private developer installation, limited actual journey, no directory/all-model qualification or never-leave-chat promise. |
| Claude | LLM_SETUP24–25,41–46 guides; public not_tested_in_real_client; no full actual journey found | Protocol documented, client incomplete; no implicit attachment transfer promise. |
| Copilot | COPILOT3 historical unqualified VS Code/CLI; ASSISTANT_HUB14–18,106–111 distinguishes GitHub/Microsoft365/Studio without new actual connection | Guides only; name the exact product/environment, no global Copilot qualification. |
| Website | Actual app/direct journey; homepage/atelier/approval captures with real-vs-fixture provenance | Available; assistant or direct guteneo.com paths. |
| iOS | Bounded Developer-root Guteneo-folder/Swift/Xcode search in three known checkouts found no native project; TEST_RESULTS135 was responsive WebKit, not signed app | **Vision/outside inspected scope**, never absolute nonexistence; no App Store badge. |

## User-confirmed creative choice

After this audit the user explicitly chose the hypothetical finished-product
promise, omitting staging/coming-soon/objective/project labels inside advertising.
Actual state stays in this dated audit; the film certifies no current availability
and this work published nothing externally. Requested ending stays official Guteneo
stamp then guteneo.com, without marketplace/App Store badges.

## Audit boundary

Local product/architecture/execution/campaign/PDF/SES/assistant/postal qualification
sources; only two anonymous public GETs, no private account/document. iOS search
was bounded to Guteneo folder names under Developer and Swift/Xcode in three known
checkouts, without unrelated personal inspection. No actual send/activation/10,000-load
test. Absence claims apply only to inspected files.
