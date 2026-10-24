# ChatGPT marketplace dossier — state of 20 October 2026

For the later dated follow-up, see [23 October resubmission tasks](OPENAI_RESUBMISSION_TODO.md). Each observation below remains bounded to its date; translation does not refresh portal or provider state.

## 0.3.2 rejection reported on 20 October — local remediation

The owner's email reports **0.3.2 not approved**, citing annotations potentially inconsistent with tool effects. It requests explicit booleans and a rationale per value without identifying affected tools or scans. The portal was not reread during this resumption.

The local catalog audit covers 67 tools. The correction marks replacement of a valid review token and permanent freezing of a batch during distribution preparation as destructive; it completes the matrix and coverage checks. Evidence, tests and remaining steps are in [MCP_ANNOTATION_REMEDIATION.md](MCP_ANNOTATION_REMEDIATION.md). This preparation neither changes package 0.3.4 nor proves deployment, a portal scan or resubmission.

## Last portal observation — 13 October, historical

The portal shows **0.3.2 · In review · Not published · Not live**. After reconnecting the scan account, the **13 October, 13:56:30 CEST** scan discovers **67 tools** and shows **“No findings in the latest MCP scan.”** The six skills show **Checks passed**. No review was canceled or replaced, and no new submission or publication occurred in that pass.

Production reread on 13 October at 18:56 UTC matches main `6a27eff665cd1fe9a330448f0dd92864650f7354`, build `2026-10-13T18:36:46.854Z`, after Dashboard V2 (#61) and stabilization (#62). The MCP contract and integrations remain unchanged since initial audit `1e5ab18…`; API/web changes are separate from the issuer correction. The public ZIP reread at 18:59 UTC remains **0.3.2**, 19 files, 1,310,328 bytes, SHA-256 `4a098e789b480b54713c2ddd448b8c32d172267f1d8eb58047140fe9080e1f4c`. Candidate **0.3.4 is local**, separate from PR #52's 0.3.3 draft and rebased onto that latest main. The exact Auth0 issuer correction remains local and undeployed. See the [platform matrix](MCP_PLATFORM_READINESS.md).

Two bounded D1 SELECTs reread at 18:58 UTC confirm migration 0053 in the ledger and the personal column present: that release prerequisite is satisfied. Their absence observed at 16:18 UTC remains historical. That pass performed no migration, merge or release. The new candidate's CI must cover its exact commit; older checks do not qualify it.

The **new package's** `extensions.com.openai.auth` OAuth metadata remains unresolved against portable MCP schema 1.0.0, which rejects this HTTP property. 0.3.4 does not enable it; scanning the existing portal OAuth configuration does not qualify the candidate's OAuth installation. The owner retains a proprietary plugin: Cursor's public catalog, which requires open source, is excluded; local/private installation remains unqualified.

Reconnecting **Guteneo Review** allowed `get_capabilities`, `list_documents` and `expert_status` in production with `simulation:false` and no expert activation. The surface is the **Codex development reviewer connector, 24 tools**, separate from the 67 scanned tools. Six documents were observed without the expected fixture's SHA-256. Identity and D1 restriction were not reconciled that turn; **P3 and full qualification remain unqualified**. An old successful P3 does not replace current checks.

The Auth0 Dashboard read confirms three reviewer-duration blockers: refresh grant disabled, API offline access disabled and deployed identity Action limited to initial PKCE protocol. The migrator is prepared and locally tested. The CLI was then reconnected with the owner's explicit permission for read-only access. The first GET rejected the candidate's generic callback constant: the live client retains exactly `https://chatgpt.com/connector/oauth/aAwc9dso12_L`, already recorded below. The constant was corrected without changing Auth0; full inspection and application remain distinct evidence.

The corrected source then passed full GET inspection, producing the same summary as an independent copy. Both draft/deployed Actions, the API, four connections, client lists and bindings are recognized; the precise plan remains unapplied. The 96 focused tests pass and independent review confirms that the callback is never rewritten. Check new-commit CI separately from the 13 successful jobs at `6b80d0a`. Plan authorization/application, D1 reconciliation, eight-case qualification and actual refresh remain open. Do not cancel review 0.3.2 to install a candidate without separate owner authorization.

Observations from 4 October and the following sections are **historical**: their versions, portal statuses, catalogs and successful cases are not the state above.

## 4 October history — preparation ongoing, no submission

Scanner OAuth reconnection in the existing editor succeeded. The portal showed **Tools scanned successfully**, **66 tools** and **Domain verified**. This scan replaced the historical 24-tool catalog; the 42 new tools needed annotation rationales in the legacy flow. Partial import then showed **Updated 62 tool justifications**, **Imported 62 / Skipped 0 / Missing 4 / Mismatched 0**. Discovery qualifies neither reviewer scenarios, annotations corrected after this scan, nor OAuth access duration during review.

The public GET of `/release.json` confirms clean source `c5cc0ddba3c8bb2bcd6fe144bc37a17d1f9cc596`, built at `2026-10-03T10:21:16.979Z`. The **0.3.2 [public package](https://guteneo.com/integrations/guteneo-plugin.zip)** contains six skills, weighs **1,310,181 bytes** and has SHA-256 `7b8af7bc48bbe827b33fe0e18d2c6b6de08e20007c09ba8ade9439466896e813`. Contents of get-started, fax-pdf and postal-pdf match final package 0.3.1; email changed, document-studio and pdf-accessibility are new. After three imports, **all six skills were explicitly observed Passed, then confirmed Passed after a full reload**. Version **0.3.2**, EN/FR descriptions including Horizon and “Package 0.3.2” release notes were entered from the package; **Draft saved** was observed and **persistence confirmed after a full reload**, retaining **All countries**. After **Exit**, the dashboard showed **Version 0.3.2 · Not submitted**, **Not published** and **MCP Configured**. **No global ZIP is reported imported.**

The pdf-accessibility skill's submission copy adds only `interface.display_name` and `interface.short_description` to `agents/openai.yaml`, following [official requirements](https://developers.openai.com/plugins/deploy/submission-errors#skill-agent-metadata-errors). YAML, unchanged dependencies, ZIP CRC and exact preservation of SKILL.md were verified. The corrected archive is **3,545 bytes**, SHA-256 `1bed147dc2af87dc95ec34804a4320f332c72c521c76073338e729743d17fe03`; it is separate from the faithful public-package copy. The same correction is in source with no runtime change. Archives, fields and reports remain outside the repository at `/Users/nclsppr/.codex/artifacts/guteneo-plugin-publish-2026-10-04/`.

Local build of corrected package **0.3.2** passed: **1,310,328 bytes**, SHA-256 `4a098e789b480b54713c2ddd448b8c32d172267f1d8eb58047140fe9080e1f4c`. This archive differs from the 1,310,181-byte public ZIP; it is neither an imported global ZIP nor submission proof.

[PR #38](https://github.com/nclsppr/guteneo/pull/38) merged on **3 October at 08:15:21 UTC**; **all 12 checks of final head `fde084a9e71a443ba0ed9a2b6ed6576b06408b76` passed** ([CI](https://github.com/nclsppr/guteneo/actions/runs/37104362078)). The 2 October CI blocker is therefore resolved for that PR; this does not validate changes from this resumption.

Local correction `a4f0904` correctly marks four document-studio operations destructive; **101 focused tests, types, lint and feature-map checks passed**. This commit **is not deployed**: the four corresponding values in the scanned catalog still need server correction and rescan. Rationales for the other 62 tools imported successfully without importing other fields. The four missing rationale sets are exactly **update_template, archive_template, share_template and cancel_generation_job**, excluded to avoid justifying old incorrect values. **After a full reload, all 66 read-only annotation fields are present and only 12 rationale fields remain empty: three rationales for each excluded tool**; the 62 imported triplets persist. The domain remains verified.

Privacy, terms, support and synthetic-PDF GETs return **200**. The public video retains the exact **2,367,095 bytes** and hash `8ff81c30eaefcb6bf319c8f8987cf543ffc300ba4e184eb7f3e83a0257928df2` of the 21 September recording. **No new video or P5/P6/R1/R2/R3 execution is qualified.** The dossier's latest tariff evidence remains expired since 24 September; no new D1 read or Telnyx profile/CSV association requalification is attested here. P1/P2/P3 evidence from 2 October remains bounded to its old server/client.

### Checklist at this historical point

- [x] Reconnect OAuth and obtain a new 66-tool scan; domain verified in the portal.
- [x] Verify exact public package 0.3.2, prepare six individual ZIPs and correct only pdf-accessibility's missing interface fields.
- [x] Verify final PR #38 head CI and merged status.
- [x] Import email, document-studio and pdf-accessibility; observe all six skills Passed, then enter version, EN/FR descriptions and 0.3.2 notes with Draft saved.
- [x] Fully reload the editor and verify persistence of version, EN/FR descriptions and 0.3.2 notes, retaining All countries.
- [x] Reread six Passed results after full reload; after Exit, verify Version 0.3.2 · Not submitted, Not published and MCP Configured.
- [x] Import rationales for 62 tools compatible with the current server; portal: Imported 62, Skipped 0, Missing 4, Mismatched 0. No other fields imported.
- [x] Verify persistence of 62 rationale sets after reload; only the 12 fields for four excluded tools remain empty.
- [ ] Correct and rescan four server annotations under deployment authorization, then complete rationales.
- [ ] Verify effective OAuth settings and reviewer access duration without automatically expanding permissions.
- [ ] Requalify review-only tariff references after authenticated profile/CSV association read, without activating a channel, mandate, credit or dispatch.
- [ ] Execute P5/P6 and three negative cases in a controlled host, then update the demonstration to the actual 0.3.2 scope. Infer no success from the scan.
- [ ] Present evidence to the authorized developer for the six currently unchecked attestations, submit and verify resulting status; after OpenAI approval, separately verify actual publication.

**Last state after full reload and import of 62 rationale sets: all six attestations are unchecked (`Value 0`), Submit remains disabled with MCP incomplete and Submit confirmation.** Six earlier values of 1 are historical; the cause is unestablished and **the agent checked no boxes**. **No Submit or OpenAI publication occurred in this resumption.** The following 2 October/September observations retain historical portal states, versions and tasks wherever explicitly superseded above.

## History of 2 October 2026 resumption

**Draft 0.3.1 is saved in the existing MCP editor; after Exit, the dashboard shows “Version 0.3.1 · Not submitted” and MCP configured. No Submit or OpenAI publication occurred.** The English subtitle, English/French descriptions and release notes come from manifest 0.3.1: email disabled pending qualification, protected PDF links and web UI in French, English, German and Luxembourgish. **All countries** is retained. Review 0.2.2 had been explicitly canceled for replacement; no OpenAI rejection reason was observed. The plugin retains identity `asdk_app_6ab05fbae9a881918dc6ee4e2f235d93`.

Scanner OAuth authentication and a **full 24-tool scan** succeeded against the already deployed server; all 24 annotation triplets and rationales imported in the legacy flow. This resumption caused no real sending, deployment, merge, mandate change, attestation or submission. Draft saving and package preparation remain distinct from OpenAI review.

## Resumption task list — retained at the owner's request on 2 October

- [x] Prepare [PR #38](https://github.com/nclsppr/guteneo/pull/38), branch `codex/plugin-review-draft-progress`, on `a808307c5687588eb8c0aab45c9e559aa70a03dc`. The final package rebuilt from that base with latest email safeguards passed **32/32 focused tests**, official schema, determinism, CRC and privacy/private-binding checks. [CI for PR base `015f7c3…`](https://github.com/nclsppr/guteneo/actions/runs/37033236823) passed **12/12 checks**; it does not qualify email safeguards added later. PR #34's 12/12 checks remain historical.
- [x] Authenticate the portal scanner, complete the **24-tool** scan and import annotations into the [existing MCP editor](https://platform.openai.com/plugins/edit/asdk_app_6ab05fbae9a881918dc6ee4e2f235d93/asdk_app_v_6ab05fbc52b08191824184064aee539f).
- [x] Save **0.3.1** details and verify **Not submitted** and **MCP configured** on the dashboard after **Exit**.
- [x] Retain three individual ZIPs byte-identical to 0.2.3: **get-started Passed**, **fax-pdf Passed**, **postal-pdf Passed**. Reimporting get-started reused its cached Passed result.
- [x] Complete safeguards for the fourth skill, **email**, and rebuild final ZIPs; verify bytes and 32 focused tests.
- [x] Replace the first email ZIP with the final **5,179-byte** ZIP, SHA-256 `2e81b491ef3b2a86f9df8b37b2a206ab9c0f6a9594206c89213886e275c58166`, then confirm **email Passed after reload**, with get-started, fax-pdf and postal-pdf also Passed.
- [ ] Verify CI after integrating latest safeguards. Final email Passed is confirmed for the 5,179-byte ZIP; the first ZIP's Passed result remains historical.
- [x] Restore **Guteneo Review** and exactly match expected account, tenant and OAuth client in D1 without exposing identifiers. **P1/P2/P3** passed as bounded MCP calls in Codex on public source `a808307…`, without simulation or expert activation; this does not qualify ChatGPT automatic selection or a fresh antivirus scan.
- [ ] After the requested owner Telnyx connection, reread reviewer tariff sources and profile/CSV association, then prepare review-only requalification. The reviewer tariff expired on **24 September** and the historical association exceeds **168 hours**. Do not automatically renew a channel, mandate, ceiling or tariff to satisfy a test.
- [ ] Resume **P5/P6/R1/R2/R3** with valid references that cannot authorize sending and the real client; update the video for advertised 0.3.1 functions, particularly faithful treatment of disabled email and protected links. `review_prepare_only` stops before approval or sending. September's video is not current qualification.
- [ ] Verify effective OAuth settings and access duration needed for review without automatically extending them. Missing refresh tokens in scripts and the one-hour limit are local clues, rather than a confirmed live cause.
- [ ] Have the authorized developer complete six legal/policy attestations after presenting evidence. After four Passed results, Submit was reread: **six policy boxes at 0**, **Submit for Review disabled**, and the sole visible issue **“Submit is incomplete Confirm this statement.”**; no Skills incomplete message. No box, attestation or final button was validated. Then perform **Submit for review** and verify actual resulting status.
- [ ] After OpenAI approval, separately handle directory publication under owner authorization, then retry ZIP migration if available. Verify published listing/version; do not create a duplicate.

Resume at **CI after latest safeguards, tariff freshness, P5/P6/R1/R2/R3 and video 0.3.1**, followed by attestations and submission. This list schedules no reminder.

## Package and skill state

The final local **0.3.1 package contains four skills**, weighs **1,290,534 bytes** and has SHA-256 `25158ede8c9e178012f069dbe9958d83be6574a37b2cbb981e58a3a9c58f19b6`. The individual email ZIP is **5,179 bytes**, SHA-256 `2e81b491ef3b2a86f9df8b37b2a206ab9c0f6a9594206c89213886e275c58166`. The email skill applies sensitive-data restrictions before reading/import/preparation and stops before review/approval/confirmation, including renewal, when the channel is disabled, unqualified or `review_prepare_only`. Final rebuild passed **32/32 focused tests**, official schema, determinism, CRC and privacy/private-binding checks. Its report stays outside the repository at `/Users/nclsppr/.codex/artifacts/guteneo-plugin-resubmission-2026-10-02/vitest-0.3.1-final-focused.json`. Base CI `015f7c3…` does not qualify these latest local changes. **No global 0.3.1 ZIP was imported or retried in the portal.**

The three get-started/fax-pdf/postal-pdf ZIPs are unchanged and Passed. The first 4,340-byte email ZIP passed before replacement; that result is historical. The final **5,179-byte** email ZIP, SHA-256 `2e81b491ef3b2a86f9df8b37b2a206ab9c0f6a9594206c89213886e275c58166`, replaced it. After Scanning, **email Passed was explicitly confirmed after reloading the editor and opening Skills**; get-started, fax-pdf and postal-pdf are also Passed. **All four individual scans are therefore Passed** on expected final bytes. Required YAML interface fields `display_name` and `short_description` are retained. Individual skill import/scan, metadata saving, submission and publication remain separate steps.

2 October history: the **1,283,344-byte** global 0.2.3 ZIP, SHA-256 `bf797190a6235d4886b63738454414a90ffa3071aee77333cbd2fa5e18fa6885`, was refused with **Keep the existing MCP connection / Publish the existing MCP app before updating its plugin ZIP**. This migration constraint is not a plugin-quality rejection. Corrected package 0.2.3 of **1,283,503 bytes**, SHA-256 `962b67688b7947724b28fe8846594ea3ce4fd3180db4971ed75cc9a92d861d13`, was not imported globally and is archived outside the repository at `/Users/nclsppr/.codex/artifacts/guteneo-plugin-resubmission-2026-10-02/guteneo-plugin-0.2.3.zip`. Its hash does not qualify package 0.3.1. Saved draft 0.2.3 and its three Passed scans are historical since saving 0.3.1.

The global **Metadata & Skills** panel had shown **No Skills in this version / Review Unavailable** for this old MCP application without an imported global package. This historical observation does not replace individual legacy results. Submit 0.2.3 no longer showed Skills incomplete and displayed six unchecked policy boxes; it does not qualify the fourth email skill added later.

## Checks and dependencies still open at that date

The MCP client was restored through **Plugin page → Reconnect → Continue** in ChatGPT Safari, with “Primary is now connected”. Actual `get_capabilities` at `2026-10-02T16:02:05.789Z` succeeded in Codex: production, no simulation, expert inactive. Expected reviewer account, tenant and client were exactly matched in D1 before import. P2 returned one PDF with `limit:5`, no next page; P3 imported the exact synthetic **4,290-byte**, two-page PDF, SHA-256 `d25de4f63db4cab316d4718638c9747cc11628035dc4045610fed89c5079adbc`, then `get_document` confirmed ready without simulation. Import deduplicated an existing PDF: no fresh antivirus scan is proved. These bounded calls used public server `a808307…`; the redacted report remains private, unversioned, permissions 0600. **P5/P6/R1/R2/R3 and automatic ChatGPT selection remain unqualified.**

Two partial observations followed in ChatGPT Work, GPT-6.1 Sol Light. R1 requested a PDF attachment and signature type without a visible Guteneo tool; the plugin mention had probably been removed when replacing composer text, so this result is unqualified. For R2, the blue **Guteneo Review** mention was retained and captured; the Gmail prompt invoked the host's already connected Gmail tool, then the host stated that Guteneo Review could not read Gmail. The attempt stopped once Gmail tool use was observed; a Gmail read had already occurred. No communication was sent and no retrieved content/metadata is recorded here. This Gmail read does not qualify an isolated Guteneo non-invocation test. **R1/R2/R3 must still run in a controlled host with only the Guteneo reviewer plugin available; R3 was not attempted**, to avoid use of a third-party communication service.

The reviewer tariff expired on **24 September**; historical Telnyx CSV association exceeds **168 hours**. The owner's Telnyx connection is still needed for read-only source inspection. Preparation authority can last 30 days, but extends neither observations nor quotes. [review_prepare_only rules](REVIEW_FAX_PREPARATION.md) and the [operator procedure](REVIEW_FAX_OPERATOR.md) remain applicable. Initial authentication errors and Missing OAuth callback data remain historical; missing refresh tokens in code and the one-hour age limit prove neither actual private Auth0 settings nor an exact cause.

The latest public read on **2 October at 16:19** confirms clean source `a808307c5687588eb8c0aab45c9e559aa70a03dc`, built at `2026-10-02T12:43:39.396Z`. The publicly served integration ZIP is **1,289,274 bytes**, SHA-256 `983e6fc7ca6f2f3f7bf603e2d05e2a50791ba8e9080e8b5410851b3774a9a8b4`; its bytes differ from the final local 1,290,534-byte package. The earlier morning read identified `5dec27555ea27035b66d0f51162fe75a9755c82f`, built at `2026-09-22T21:32:22.470Z`; this remains historical. Server publication occurred outside this resumption; the agent performed no deployment.

Public GETs also verified `/confidentialite/`, `/conditions/`, `/support/` and OAuth discovery at **200**, anonymous `/mcp` at the expected **401**. The [synthetic PDF](https://guteneo.com/review/reviewer-original.pdf) remains accessible with expected bytes; the [historical video](https://guteneo.com/review/guteneo-chatgpt-demo-20260921.mp4) weighs **2,367,095 bytes**, SHA-256 `8ff81c30eaefcb6bf319c8f8987cf543ffc300ba4e184eb7f3e83a0257928df2`. These GETs qualify neither tariff references, remaining cases nor a new video. Historical localized paths record the actual observations.

[PR #34](https://github.com/nclsppr/guteneo/pull/34) **merged externally on 2 October at 11:41:57** and is no longer a draft. Its **12/12 checks at `88ca887…`** remain historical evidence. The resumption concerns **PR #38**. Its CI at `015f7c3…` finished with **12/12 checks passed**, without qualifying email safeguards added after that commit.

## ZIP flow and existing MCP editor

The [submission flow](https://developers.openai.com/plugins/deploy/submission) uses the **ZIP as the source of imported fields**, read-only in that flow. [listing.json](../integrations/chatgpt/listing.json) remains an internal worksheet. Rationales are no longer required fields in the new ZIP flow; the legacy fallback nevertheless received all 24 triplets and rationales. Annotations must match actual tool effects.

Official **Plugin Creator v0.1.22** is installed in ChatGPT. Local skill `prepare-plugin-submission` and **all three references have been read in full** from `/Users/nclsppr/.codex/plugins/cache/openai-curated-remote/plugin-creator/0.1.22/skills/prepare-plugin-submission/SKILL.md`. The skill is available; local tool inventory does not yet expose Creator read/update actions. ChatGPT's visible actions concern private creation, updates and metadata; no Submit API was observed. Its instruction is “Have the authorized developer complete legal/policy attestations.” **Continue**, **Exit**, plugin installation and package preparation do not prove submission. Attestations, Submit and publication after approval remain distinct.

## Retained 21 September history

**State recorded then: draft created, no submission or publication yet observed.** The following sections describe that historical preparation, form requirements and blockers. Statements such as “to publish”, “no account”, “no scan”, “no video” and “no submission” do not describe 2 October state. Old 404 observations and catalog versions retain their provenance. [PR #14](https://github.com/nclsppr/guteneo/pull/14) was then presented as a candidate.

## Additional preparation on 21 September

The publisher explicitly authorized page publication, domain verification, review-account creation, tests, video and submission. They stated they had read the terms and authorized acceptance. This authorization does not replace evidence required for attestations.

Pages `/confidentialite/`, `/conditions/` and `/support/` were then implemented with shared links and indexable HTML. Local checks passed: types, focused lint, seven static tests and eight desktop/iPhone tests. Public availability still needed verification after deploying this candidate. The 404 observations below are historical. PDF import/creation descriptions, workflow and fax skill convey ChatGPT journey restrictions; no automatic content filter or new server consent is claimed.

The composer now has a [checked transparent derivative](../integrations/chatgpt/icon-audit.md), created from the emblem with ImageGen: RGBA PNG, 1,254 × 1,254 px, 977,001 bytes, SHA-256 `2dd792b032c4e244072494fef71344aa270893c4bf8e92c44600234eccb394cc`. The directory logo is unchanged. The derivative was uploaded for light/dark modes, previews inspected and persistence after reload confirmed. Rebuilt archive 0.2.1 with this image weighs 1,265,171 bytes, SHA-256 `18485c5a5215175f051873fb2db0c15ea145ae83ad54e8d58ac2b3b7df2885a1`; earlier archive hashes below remain historical.

The portal shows exact callback `https://chatgpt.com/connector/oauth/aAwc9dso12_L` for a predefined public client. A targeted script prepares an isolated review client/identity without changing Actions, MFA or tenant settings. Review replaced substring searches with exact comparison of both deployed Actions against generated sources. Nineteen Auth0/reviewer tests validate these safeguards offline; they do not prove actual connection. Auth0 administration reconnection expired while waiting for Touch ID and needs retrying. No account or new client had yet been created.

The sample PDF is synthetic and has no recipient; the [recording scenario](../integrations/chatgpt/demo-recording.md) is ready. Neither video nor qualification using a reviewer account is claimed. Cloudflare confirms the existing `guteneo.com` association with Worker `guteneo-app`. The exact OpenAI challenge token was subsequently received in the portal and committed in PR #23; public deployment and **Verify Domain** success remain to be established.

The three public URLs are entered and persist after reload. The portal uses an English base listing: subtitle “PDFs, fax quotes and tracking”, translated description mentioning the French web interface, and a separate French translation. Five positive scenarios and three negative cases are drafted as reviewer expectations without execution evidence; the exact fax-preparation prompt still needs the controlled recipient and ceiling. At this initial point, account, video and scan were missing; the challenge was subsequently received/committed without deployment/validation proof.

The candidate is reconciled with PR #20, merged into `main` (`406176933da9ad7d8c3d6265b26dbfa50e493c4b`). The complete server now declares 22 tools. `create_postal_address_page` has a title and closed-world annotation consistent with internal generation; the table covers all 22 tools, checked by 39 focused MCP tests. Production address-page release also needs migration 0033 and the private engine, tracked by the separate postal release.

## Portal state before these preparations

On 17 September in Safari, `https://platform.openai.com/plugins`, organization **Personal**, **Create plugin → With MCP** opened:

> Complete identity verification
>
> You need a verified developer identity before you can create or upload a plugin.

Visible buttons were **Cancel** and **Continue**. **Continue** opened `https://platform.openai.com/settings/organization/general`. No draft/plugin identifier had been created at this step. The **Guteneo** brand does not establish a registered or verified company.

The first reread on 21 September, Paris time, still showed this blocker. **After owner-completed verification, the portal showed a verified individual identity in organization Guteneo and allowed draft creation.** Full legal name and verification documents are not retained here.

- Plugin: `asdk_app_6ab05fbae9a881918dc6ee4e2f235d93`.
- Draft identifier: `asdk_app_v_6ab05fbc52b08191824184064aee539f`, version `0.2.1`.
- [Open the draft in the portal](https://platform.openai.com/plugins/edit/asdk_app_6ab05fbae9a881918dc6ee4e2f235d93/asdk_app_v_6ab05fbc52b08191824184064aee539f).

After reload, name, version, short/long descriptions, **Productivity** category, website and selected identity persist. Directory/composer logos also persist with light/dark modes in the interface. Three starters and release notes persist.

**MCP configuration awaits its scan before effective saving.** `https://guteneo.com/mcp` and OAuth were entered but absent after reload despite **Draft saved**. Three **Scan Tools** attempts, the last after full button loading, showed **Saving draft**, then **Draft saved**, without scan results. **MCP tools scan is required** remained visible: no OAuth connection, scanned tool or challenge token was obtained. After reentry and **Continue**, **Exit** explicitly requested scanning MCP changes before leaving. This prerequisite explains why entry alone is insufficient; no save bug is established. **Verify Domain** produced no observed success. The cause of missing scan results remains unknown. Attempts stopped; values left onscreen are neither qualified nor confirmed persisted.

The release note actually saved described a first directory version for PDF reading/import, fax preparation with estimate/ceiling and dispatch tracking, with available functions depending on Guteneo account permissions/channels. This is an English rendering of the recorded localized note; its entry did not publish the candidate.

Final **Submit for Review** was confirmed disabled. Visible messages requested **Customer support URL**, **MCP server URL**, **Test case scenario** and **Submit confirmation**. Default language **English (US)** and availability **Allow all** were not publisher-approved choices. With the dossier incomplete, the owner had not been asked for contractual confirmation; no contractual box or attestation was checked and no **Submit for review** or **Publish** performed.

## Content ready to transfer at that date

[listing.json](../integrations/chatgpt/listing.json) holds descriptions, starters, language, contact and public settings. **It is an internal worksheet, neither an OpenAI schema nor an official upload manifest.** `null` fields await actual portal information.

| Field | Value |
| --- | --- |
| Name | Guteneo |
| Short description | PDFs, quotes and dispatch tracking (English rendering of the historical localized draft) |
| Category / language | Productivity / French (`fr-FR`) |
| Website / support | `https://guteneo.com` / `guteneo@pieper.fr` |
| Universal MCP | `https://guteneo.com/mcp` |
| Transport / authentication | Streamable HTTP / per-user OAuth |
| Resource / OAuth authority | `https://guteneo.com/mcp` / `https://pieper.eu.auth0.com` |
| Logo | `https://guteneo.com/brand/guteneo-mark.png` |
| Native UI screenshots | None: the server provides no native MCP UI |
| Privacy policy | Full URL of actual policy still missing |
| Client/callback/reviewer | To configure and verify; no invented values |
| Demo recording | URL missing; do not substitute a website screenshot |
| Domain challenge | Token received and committed; deployment/verification not obtained |

Copy describes PDFs, quotes, ceilings, approval and tracking according to account functions. It promises neither all countries, active email/post, guaranteed delivery nor a journey entirely within ChatGPT. Standard mode uses browser approval; expert mode requires a prior administrator-granted mandate.

## Package and new logo

**Historical 17 September archive:** package `dist/integrations/guteneo-plugin.zip` **0.2.1** weighed **285,340 bytes**, SHA-256 `b3c6a1f7f1d933fcf548b66b48f90edd95ffc938e3452a2aa9c468d4a709dfe4`. These do not describe the rebuilt archive after resumption. A build is not publication. `integrations/chatgpt/` remains a submission worksheet separate from the portable package.

**Archive rebuilt on 21 September:** version **0.2.1**, **285,325 bytes**, SHA-256 `1c9fca3eca5551ccb3b34a862c84165dc5daa32fc8e745883c0f526e5c67eb79`. The [resumption report](../reports/chatgpt-marketplace-resume-2026-09-21.json) distinguishes public GETs, local checks and portal steps. Building this archive neither deploys nor submits it.

Under [BRAND_IDENTITY.md](BRAND_IDENTITY.md), the **simple emblem** serves MCP/small icons, transparent portrait serves headers/Auth0, and “guteneo.com” stamp serves the footer/external communications.

`apps/web/public/brand/guteneo-mark.png`: **512 × 512**, **249,823 bytes**, opaque background, SHA-256 `d6a83bbe53abb6ffac19d66a66d02b5992887a4796d909fb86043c356580e8c9`. On 17 September its public URL returned `200 image/png` with bytes matching the local file. No image creation/edit or false transparency is claimed.

## Public observation of 21 September

Public GETs from **20 September at 22:19 UTC, 21 September at 00:19 Paris**, were reread with `curl` and a browser User-Agent. An initial Python-client attempt received `403` on every route: access refusal established neither an outage nor missing pages.

| Route / field | Observed result |
| --- | --- |
| `/release.json` | `200`, source `ef417c7f187bd11e327881b2127eae653288ac58`, `sourceDirty:false`, build `2026-09-20T19:44:57.804Z`, application `0.2.0` |
| `/api/capabilities` | `200`, production without simulation, `urlImport:true`, scanner connected, fax/post with `liveSending:true`, email with `liveSending:false` |
| Approval and purchases | Standard browser mode; expert path available after prior account activation. Billing unconfigured, `chargingEnabled:false` |
| `/mcp` without Bearer | `401 AUTHENTICATION_REQUIRED`, expected protected-endpoint refusal |
| `/.well-known/oauth-protected-resource/mcp` | `200`, MCP audience, Auth0 authority and five advertised scopes |
| `/confidentialite/`, `/conditions/`, `/contact/` | `404` |
| `/mentions-legales/` | `200`, copy dated 20 September: connected workspace/post distinguished from the demonstration; data section still centered on the demonstration and Cloudflare |

These capabilities describe public configuration. They prove neither reviewer-account permissions, a qualified route, a new dispatch nor every tool's availability in ChatGPT. Older generic diagnostic fields do not replace dated evidence. Legal notices progressed since 17 September but were not a full authenticated-service processing policy.

## Historical evidence of 17 September

The public read and portal blocker are recorded in the [redacted report](../reports/chatgpt-marketplace-public.json).

Public read during 17 September preparation:

- `/release.json`: clean source `c3798f59cb6cff4e1dcaddb524f43d59b1009822`, built at `2026-09-17T14:32:49.407Z`, application version `0.2.0`.
- `/api/capabilities`: production without simulation, URL import active; **fax active**, email/post inactive; purchases disabled (`chargingEnabled:false`).
- OAuth discovery: `documents:read documents:write dispatches:prepare dispatches:send dispatches:read`. The OIDC authority advertises `openid`, `email` and `userinfo_endpoint`; the reviewer account's `email_verified` response is unqualified.
- `/mentions-legales` returns `200` but still describes the entire workspace as a fictional local demonstration without sending. `/confidentialite` and `/conditions` return `404`.

[CHATGPT_QUALIFICATION.md](CHATGPT_QUALIFICATION.md) retains three separate proofs: OAuth installation/reads; exact native import of **136,018 bytes**, then a ready document; one fax delivered on a Luxembourg route, followed by manual usage reconciliation. They qualify neither all routes/models, reviewer cases, OAuth refresh/revocation nor general automatic settlement.

Public fields (`not_tested_in_real_client`, `real login unverified`) and some `LIVE_RELEASE.md` notes describe earlier state. Reconcile them with dated evidence without presenting them as newly failed tests or extrapolating global qualification.

Local validation on **17 September**: **43 focused tests**, types, lint, web/package builds. [Redacted validation report](../reports/chatgpt-marketplace-validation.json). CI for `bd1fd01dc5188f1ed6aaf2271169c8e2f42dff9f` passed. On 21 September the candidate rebased onto `origin/main` at `89d126d288b86f16f9c3be2d51182135ae6907e0`; old results/ZIP hash do not validate this new candidate. Record resumption checks separately. None proves deployment of 0.2.1 or marketplace admission.

The **21 September** resumption also passed **43 focused tests**, types, lint, web/package builds according to its separate report. [CI for candidate `89b9bd79efc4040f3c6b05950e12203280a4fa9a`](https://github.com/nclsppr/guteneo/actions/runs/35541687278) then passed all checks, including `verify` and `scanner`. Local/CI evidence remains distinct from unexecuted reviewer-account qualification, deployment and OpenAI review.

## Submission fields checked on 21 September

The [final submission reference](https://developers.openai.com/plugins/deploy/submission-errors#final-directory-submission) requires a short description of **at most 30 characters**, **exactly five positive and three negative cases**, release notes, a demo-video URL, validated domain challenge, current scan and a rationale for all three annotations of every tool. HTTPS website/support/privacy/terms URLs are required for remote MCP. The listing retains `null` for unknown data.

Prepared selection is **P1, P2, P3, P5, P6 / R1, R2, R3** in [reviewer-tests.md](../integrations/chatgpt/reviewer-tests.md). The interface requests negative prompts for which the plugin must not be called: R1 asks for PDF electronic signature, R2 reads Gmail attachments, R3 sends an SMS. No Guteneo call is expected. N1, N2 and N4 remain internal authorization/isolation refusal checks. This adaptation is prepared, not qualified: all cases await reviewer-account execution; an expected result is not evidence.

The draft's observed challenge URL is `https://guteneo.com/.well-known/openai-apps-challenge`. The portal has supplied the exact token, committed in [PR #23's public asset](../apps/web/public/.well-known/openai-apps-challenge): 43 bytes, no newline. The build preserves those bytes and the local Worker returns `200 text/plain; charset=utf-8`; these local checks do not prove deployment. Publish the asset, verify public URL bytes, then obtain **Verify Domain** in the portal. Do not request/substitute a new token while this remains the draft's challenge. Never invent a token or overwrite another plugin's. [Submission documentation](https://developers.openai.com/plugins/deploy/submission#domain-verification) describes choosing the authorized origin. Reading the URL is not challenge success.

For each scanned tool, separately supply value and rationale for `readOnlyHint`, `openWorldHint` and `destructiveHint`. Rationales must explain real effects, including import, review writes, postal-draft transfer and irreversible sending. Renewal through `prepare_fax` can cancel the previous preparation: the candidate declares this destructive without implying dispatch. Rationales do not fix false server annotations. Current scan/video are not yet qualified for this submission.

[Rationales for the candidate's 22 tools](../integrations/chatgpt/tool-annotations.md) are prepared from code. They must match the published/scanned snapshot.

## Issues remaining at that historical point

1. **Finalize the draft:** verified individual identity, reviewed information, logos, starters and notes persist. Confirm language/countries; publisher validation of portal defaults is absent.
2. **Publish an actual policy:** the page did not cover authenticated-service data. The [working draft](CHATGPT_PRIVACY_DRAFT.md) provides facts to validate, rather than an adopted policy. The canonical page must stop describing real processing as mere tab memory.
3. **Reviewer:** no dedicated account with examples and access without an additional step had been supplied/tested for this dossier. Pass credentials only through private portal fields.
4. **Project/OAuth:** finish the required scan before effective MCP/OAuth URL saving, then qualify client/callback. No successful scan or OAuth flow for this submission was observed. The received/committed challenge still awaits deployment/portal validation. The cause of absent scan results is unknown. Also check project characteristics, including **Global** residency.
5. **Terms, support and availability:** publish the terms/support URLs required for submission and explicitly select plugin countries. Existing email contact does not replace a required URL. Distinguish plugin availability from actually qualified fax routes.
6. **Qualification/scan:** run five positive cases and negative R1/R2/R3 with the reviewer account under the “do not invoke the plugin” criterion. Verify domain challenge, scan published server tools and provide every annotation rationale. Keep authorization refusals as internal checks.
7. **Video/release notes:** record the actually available journey on advertised surfaces without secrets/sensitive data and provide a reviewer-accessible URL. Listing notes describe the candidate, rather than a published release.

Purchases are disabled. OpenAI rules allow access to existing-account functions but prohibit selling digital services/credits in the plugin and links triggering those purchases. Do not add top-ups, subscriptions or integrated payments. The publisher must confirm legal/commercial status; this dossier is not contractual authorization.

## After resolution

Complete the existing draft, qualify MCP/OAuth, obtain **Scan Tools**, fill fields/rationales from the actual server/tests, then **Submit for review**. After OpenAI approval, **Publish** is separate. Retain identifier, version, status and directory URL. Check no unestablished attestation.

This dossier targets ChatGPT. If the portal also distributes through Codex, qualify advertised functions on that surface before attesting. Do not attach website screenshots claiming native MCP UI.

Resumption sources opened on 21 September 2026: [submission](https://developers.openai.com/plugins/deploy/submission), [errors/final constraints](https://developers.openai.com/plugins/deploy/submission-errors#final-directory-submission). Historical references: [MCP review](https://developers.openai.com/plugins/deploy/app-review), [plugin rules](https://developers.openai.com/plugins/app-guidelines), [portal](https://platform.openai.com/plugins). OpenAI controls approval and its timing.
