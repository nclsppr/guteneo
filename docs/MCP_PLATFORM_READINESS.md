# MCP installation and plugin distribution — 13 October 2026

Internal technical document. HTTP access, OAuth connection, PDF journey,
renewal and catalog publication are separate evidence. User instructions:
[LLM_SETUP.md](LLM_SETUP.md). All observations below are dated historical
snapshots, not a claim of current portal/provider state.

## Production, review and candidate

| Object | Observed state | Limit |
| --- | --- | --- |
| Production | Source `6a27eff665cd1fe9a330448f0dd92864650f7354`, build `2026-10-13T18:36:46.854Z`; anonymous `/mcp`: 401, OAuth metadata: 200. | Anonymous refusal protects service, not successful installation evidence. |
| Main at observation | `6a27eff665cd1fe9a330448f0dd92864650f7354`, after Dashboard V2 (#61)/stabilization (#62). MCP/integrations unchanged since initial audit; auth/profile/mobile/UI evolved. | This main deployed; local issuer correction remains candidate. |
| Initial audit | `1e5ab18a464adfdb22af85d71f291600149ff330` matched production MCP/API/integrations at pass start. | Historical reference; its CI does not qualify latest base/rebuilt candidate. |
| Public package | **0.3.2**, 1,310,328 bytes, SHA-256 `4a098e789b480b54713c2ddd448b8c32d172267f1d8eb58047140fe9080e1f4c`; manifest/rebuilt initial `1e5ab18` agree. | Preserved archive; download differs from installation/directory listing. |
| OpenAI portal | **0.3.2 · In review · Not published · Not live**. **13 October 13:56:30 CEST** scan: **67 tools**, no findings; six skills passed checks. | No replacement/review cancellation/publication this pass. Scan success qualifies neither reviewer journey nor OAuth lifetime. |
| Local candidate | **0.3.4**, separate from PR #52's 0.3.3 draft, rebased onto `6a27eff`. Source archive unchanged during resumption: 1,315,169 bytes, SHA-256 `3749a558dd4bb36dedea813348dd534947e997a202c20945f002e7991f327474`. | Rebuild/CI on latest base pending; no deployment/import/submission; archive activates no Auth0. |

CI on `6b80d0a` passed 13 jobs; guides pass 22/22 desktop/iPhone checks in four
languages. Later reviewer-callback fix passes 96/96 targeted tests; check new
PR #63 commit CI separately. That script fix changes no 0.3.4 package file.

Final public GET on 13 October at 18:56 UTC confirms release `6a27eff…`, after
Dashboard V2 stabilization (#62). Discovery still lacks trailing issuer slash.
Two bounded D1 SELECTs reread at 18:58 UTC confirm **0053 in ledger and
`users.preferred_dashboard_appearance` present**. That release prerequisite
is met; this pass applied no migration. Earlier `f1a2681…` and absent
0053/column at 16:18 UTC remain historical, not current-at-pass-end state.
Public ZIP reread at 18:59 UTC: 0.3.2, 19 files, unchanged bytes/SHA-256.
Future MCP release still needs its own authorization, exact CI/canonical
manifest verification.

**Guteneo Review** reconnected this pass; `get_capabilities`, `list_documents`,
`expert_status` returned production `simulation:false` without expert activation.
Six documents were observed; none matched expected fixture SHA-256. Exact
issuer/subject and D1 restriction were not reconciled. This is the development
reviewer connector in **Codex, 24 tools**, distinct from the scanned 67-tool
server: **P3/full qualification remain unqualified**. See
[reviewer tests](../integrations/chatgpt/reviewer-tests.md).

## Distribution paths

Official sources reread on 13 October. A documented path describes platform
capability, not Guteneo OAuth completion/publication.

| Surface | Documented installation | Public distribution/remaining work |
| --- | --- | --- |
| ChatGPT | [Custom MCP/personal plugin](https://developers.openai.com/plugins/deploy/connect-chatgpt), per-user OAuth | 0.3.2 in review; qualify account/cases/renewal; approval/publication separate. |
| Claude web/Desktop; connector on mobile | [Custom connector](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp); web/Desktop ZIP upload and OAuth separate | [Two submissions](https://claude.com/docs/directory/publish): remote connector/GitHub plugin, same organization. Prepare review/test account/privacy/paid-operation eligibility; only 17 September Claude qualification. |
| Claude Code/Grok Build | [Claude Code plugins](https://code.claude.com/docs/en/plugins-reference), [Grok Build compatibility](https://docs.x.ai/build/features/skills-plugins-marketplaces) | Local/GitHub packages/configurable marketplaces, not consumer Claude/Grok listing; CLI OAuth separately unqualified. |
| Grok web/mobile | [New Connector → Custom](https://docs.x.ai/grok/connectors), public URL/authentication; plan-dependent admin authorization | Guteneo guide in production. No public submission process/static OAuth callback/client verified in sources; observe actual flow before registration. |
| Consumer Gemini | [Custom connected app](https://support.google.com/gemini/answer/17209137), personal account, 18+, US, English/activity enabled at observation; supplied client possible without DCR | No general plugin publication path verified; conditional guide/eligible-account qualification pending. |
| Perplexity | [Remote connector](https://www.perplexity.ai/help-center/en/articles/13915507-adding-custom-remote-connectors), Pro/Max/Enterprise, Streamable HTTP/SSE, DCR/supplied client | No verified public submission portal; guide/registered client/individual qualification pending; consumer/Enterprise callbacks differ. |
| Mistral/Le Chat/Work | [Custom MCP](https://docs.mistral.ai/vibe/work/connectors/mcp-connectors), admin, HTTPS Streamable HTTP, OAuth 2.1 with **DCR** | Directory exists, public procedure unverified; no documented static fallback, needs usable DCR; no automatic resources/prompts. |
| Cursor | [Remote OAuth MCP](https://cursor.com/docs/mcp), static client possible | Plugin remains proprietary; public open-source catalog excluded. Local/private install and manifest precedence unqualified. |
| GitHub Copilot | [IDE/CLI MCP](https://docs.github.com/en/copilot/concepts/context/mcp), host/policy-specific configuration | Separate public/organization registries. [Cloud agent/code review lack remote OAuth](https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/configure-mcp-servers), incompatible with chosen Guteneo journey. |
| Microsoft 365 Copilot | Federated MCP connector, OAuth/admin consent | [ISV/Partner Center](https://learn.microsoft.com/en-us/microsoft-365/copilot/connectors/submit-federated-connector), search/fetch tools, separate dossier/certification. No general consumer custom-MCP path verified. |
| Windsurf/Devin Desktop | [Remote OAuth MCP](https://docs.devin.ai/desktop/cascade/mcp); Windsurf docs redirected to Devin, legacy Cascade manual configuration | Devin Local-specific marketplace/one-click flow; third-party publication unverified; product-specific guide/actual testing pending. |
| Gemini CLI | [OAuth MCP](https://geminicli.com/docs/tools/mcp-server/), discovery/supplied client, configurable localhost callback | [Gallery](https://geminicli.com/docs/extensions/releasing/): public repository, `gemini-cli-extension` topic, root `gemini-extension.json`, daily indexing. Package/CLI testing pending; distinct from consumer Gemini. |

Portable packages replace no catalog-specific submission format/policy.
[Claude Directory policy](https://support.claude.com/en/articles/13145358-anthropic-software-directory-policy)
requires written authorization for financial transactions and prohibits
extracting files uploaded to Claude. Obtain review of Guteneo's paid scope;
never promise that transfer in a listing.

## Package/catalog prerequisites

OpenAI package [OAuth metadata](https://developers.openai.com/plugins/build/plugins)
`extensions.com.openai.auth` is not enabled in 0.3.4. MCP configuration
integration is unresolved: locally validated
[portable 1.0.0 schema](../integrations/schemas/mcp.schema.json) forbids extra
HTTP fields (`additionalProperties:false`), including `extensions`. Adding
it without resolving the contract breaks the builder; weakening the official
schema copy or assuming client/DCR qualifies nothing. Successful scan covers
**existing portal OAuth**, distinct from **new-package OAuth installation**.
Conformance/actual package test remain distribution prerequisites.

Cursor public submission requires open source. On 13 October the owner chose
to **keep the plugin proprietary**, excluding that submission. Local/private
installation remains unqualified. No open-source license is added to plugin/
SaaS. Observed repository clone is about **1.8 GB**, versus **1.3 MB** ZIP;
root marketplace indexes are not added in this candidate. Later prepare a
small host-indexed distribution repository after resolving OAuth; never
present `main` as marketplace-ready installation.

## OAuth durability and reviewer activation

Public discovery at observation advertises `https://pieper.eu.auth0.com`,
but exact Auth0 issuer is `https://pieper.eu.auth0.com/`. The slash-preserving
fix is **local**, with MCP client tests; authorized deployment remains required.
Manual reconnection proves neither discovery conformance nor automatic renewal.

Authenticated Auth0 dashboard read confirmed three reviewer blocks:
`refresh_token` grant disabled, API `allow_offline_access:false`, deployed
identity Action accepting only initial S256 PKCE protocol. Access remains
one hour. After explicit authorization, CLI was reauthenticated on the exact
tenant, separately from Dashboard. First GET exposed a candidate bug:
generic callback constant versus actual/historical connector-specific callback.
Strict refusal preceded mutation. Candidate now retains the exact URL.
Complete GET inspection passed: both draft/deployed Actions/history, API,
four connections/bindings recognized. Plan: update/deploy both Actions,
API offline access, then rotating refresh for reviewer only. Independent
copy/corrected source produce identical summary/fingerprint. No apply occurred.

The [targeted migrator](../scripts/enable-openai-review-renewal.mjs) prepares
only public reviewer client `2vjfO7mSnP8TPMh4RRyZCx6r9D8ADXzX`, owner
`guteneo-openai-review-v1`, component `openai-review`, exact callback
`https://chatgpt.com/connector/oauth/aAwc9dso12_L`. It preserves historical
Action clients, adds only reviewer renewal allowlist, deploys both Actions
before issuance, and bounds rotation to **30 idle days, 90 absolute days,
3-second tolerance**. No other refresh-enabled Guteneo client changes;
unrecognized state is refused. No secret, binding, account, mandate, D1 or
Wrangler configuration changes.

Operator journey, not applied in this pass:

1. Restore expected-tenant CLI inspection, then
   `node scripts/enable-openai-review-renewal.mjs --inspect`. Review redacted
   plan/fingerprint; fixtures certify no live configuration.
2. Obtain explicit authorization for that exact plan before
   `--apply --expect REVIEWED_FINGERPRINT`. After failure, no automatic mutation
   retry: inspect/review a new fingerprint; only recognized exact partial
   state can resume remaining steps.
3. Inspect final state, then qualify without mutation:
   `node scripts/prepare-chatgpt-reviewer.mjs --qualify-client https://chatgpt.com/connector/oauth/aAwc9dso12_L --expect-renewal REVIEWED_FINAL_FINGERPRINT`.
4. Separately reconcile issuer/subject, account, tenant, client and D1
   `prepare_only`; restore synthetic data/run the intended-host journey.
   Observe actual expiry/refresh/revocation. No send/channel/mandate activation
   is needed.
5. Keep 0.3.2 in review until a decision or separate replacement authorization.
   Fix deployment, candidate submission/directory publication each need
   independent authorization/evidence.

Initial local evidence: **95 targeted tests** for migrator/reviewer/Claude
regression passed, lint/formatting passed; independent migrator/reviewer
review **65/65**. These are fixtures, without Auth0 modification/renewal
qualification. They predate resumption on `54639e7` and do not qualify final
candidate CI on the new base. Exact-callback fix passes **96/96 targeted
tests**. A positive fixture independent of the constant plus no-write refusal
of the old callback cover the live-GET defect. Independent review preserves
strict equality/confirms client patches never include `callbacks`.
Redacted reports remain outside the repository in the private 13 October
audit folder; no identity/document data or raw provider response is copied here.
