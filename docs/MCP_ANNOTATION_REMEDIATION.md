# Guteneo 0.3.2 rejection remediation — 23 October 2026

## Dated status — 23 October 2026

[PR #65](https://github.com/nclsppr/guteneo/pull/65) merged into main as
`5b5041ab04b235b57fccfa60814e7efa5683e17d`; **thirteen main CI checks** passed on
that exact commit ([39914778387](https://github.com/nclsppr/guteneo/actions/runs/39914778387)).
Application publication succeeded as Worker `0334ff69-f89e-419c-ba11-6cf4d035cd88`.
Unchanged full verifier passed **23 October 08:11:41 UTC**: **266 public assets**
matched exact sizes/SHA-256; dynamic robots/security headers matched; `_headers`
was recognized as configuration. Manifest had expected clean commit; snapshot
`733ca2fd31ec81bc537b055800364f8707d270066a9e3b365ddcd4dabb57710b`.
Old `/videos/guteneo-vertical-v6-en.mp4`, initially HTTP 500, recovered exact bytes
without purge/configuration change; canonical/proof URLs matched. Authenticated
MCP catalog still needed separate reconciliation.

Existing portal showed **0.3.2 — Changes required — Not published**, MCP setup
unavailable, no new scan control. ZIP 0.3.5 import was refused:
“Configure the existing MCP app before updating its plugin ZIP.” No successful
import, new scan, resubmission or approval was established. 0.3.5 passed schema,
19-file inventory, CRC and deterministic rebuilding; SHA-256
`717748d2b61b0ea3aee64d329fa3ad35c95a650f02106188bffd287790feae88`, preserving
existing plugin/server identity.

Two full requirements audits found privacy/document restrictions to clarify,
presentation link to replace with information page, and missing reviewer evidence.
Server/page corrections merged as PR #67, `f5d7c9aea1f938719bede15f4a6edd4892520ff1`,
not yet deployed at that observation. Package corrections/32 tests were complete;
publication with corrected pages was explicitly authorized. Authorized support
email was sent **10:03 Paris** after audit and verified in Sent. No response/resolution
was established; runtime qualification remained separate.

Private scanner initially HTTP 503/SIGNATURES_STALE was restored/qualified
**08:27:39 UTC**: ClamAV 1.5.4, signatures 28162 dated 23 October 06:24:08 UTC,
Worker `6f9f4e2d-ade1-4c67-abc2-d490988a9fe0`, 100% private traffic. Clean/negative
synthetic checks targeted actual served image without customer document/send.
Initial run remained failed after premature control-plane read; postconvergence
qualification repeated no deployment. PR #66 fixed waiting/prepared independent
monitoring. Authorized 90-day credential was in GitHub; daily activation awaited
successful manual run/watchdog proof. Initial failure email was actually received.
App publication never proves scanner freshness.

Reviewer prepare_only restriction was restored/reread 23 October: exactly one protected
private insert; target_guard_matches/exact_restriction_present/intended_user_prepare_only
all 1. No channel/mandate/balance/send changed. Current Guteneo Review connector
targeted another tenant, so did not qualify submission account.
P5 explicit authority at **11:19:24 UTC** was applied/independently verified
**11:31:58**: exactly one expired old tariff revoked, old authority retained,
one review_prepare_only authority/tariff created. Authority expiry
`2026-11-22T00:00:00Z`; tariff expiry `2026-10-30T11:10:26.278Z`, earliest association
bound. Limits: **seven pages, 200 cents, 900 seconds/quote**; upper reference estimate
**166 cents**. No send/channel/mandate/balance change. P5 host case remained
unqualified until correct reviewer connection was restored.

Auth0 renewal configuration was already applied 13 October; actual host refresh
remained unqualified. Earlier disabled-renewal statements are historical rather
than current configuration. [Persistent resumption list](OPENAI_RESUBMISSION_TODO.md)
orders remaining proof/cases. Local/unpublished descriptions below belong to 20 October
and do not supersede these dated observations.

## Historical audit — 20 October

Owner supplied rejection email for **0.3.2**: at least one annotation mismatched
behavior; values must be explicit booleans and each justified. It named no tool
or scan ID. This superseded prior In review tracking, without independent portal
reread during that remediation.

Inspected local base `473ddb3d3c58dd702daebd2f513f8a3371effedb`; audit covers
**67 tools** with all optional services/activatable production paths. Prepare-only
reviewer behavior cannot describe another fully authorized account. Local source,
currently deployed server, developer connector catalog and submission snapshot are
four different evidence sets.

Pre-fix local catalog already had 268 explicit nonnull booleans, not proof of the
OpenAI-inspected snapshot. Local table covered 66 tools, missing dry_run_dispatch.
4 October history also lacked four justifications: update_template/archive_template/
share_template/cancel_generation_job.13 October No findings did not establish those
fields completed in the later rejected snapshot.

## Official sources and interpretation

OpenAI Developers sources consulted 20 October:

- [Correct annotations](https://developers.openai.com/plugins/plugin-guidelines#correct-annotation).
- [Remote MCP review requirements](https://developers.openai.com/plugins/deploy/app-review).
- [Submission errors](https://developers.openai.com/plugins/deploy/submission-errors).
- [Annotation reference](https://developers.openai.com/plugins/reference#annotations).

Pages differed: guidelines announced justification removal, while review/error
reference still described them. Explicit email request was addressed with **all
four hints/tool**, including reference-optional idempotentHint. Rationale never
changes server values; future Scan Tools must capture corrected server metadata.

Destructive classification applies our reading of demonstrated revocation/
irreversible closure effects, not confirmation of OpenAI's precise reason.
Counter writes, already-expired policy closure and temporary-artifact cleanup are
not automatically destructive user-content changes.

## Prepared corrections

| Contract | Before | Corrected candidate | Demonstrated effect |
| --- | --- | --- | --- |
| review_dispatch.destructiveHint | false | true | Completed new review replaces still-valid token hash; prior token refused. |
| prepare_distribution.destructiveHint | false | true | Plan permanently freezes failed-record retry for whole source batch, including excluded records. |
| Rationale coverage |66 tools / three explicit columns|67 tools / four values/rationales|Exact actual tools/list comparison.|
| Read/AI descriptions |Uneven activity disclosure/overabsolute wording|Shared persistent-activity notice, explicit AI quota/mapping validation|Describes possible server paths.|
| Postal setup |Initial activation/renewal unclear|Describe initial channel opening/expired-policy closure only|No sender replacement/current-quote revocation.|

Business behavior stays identical: no added/relaxed scope, role, mandate, approval,
debit or provider call. Hints may change host confirmations; descriptions disclose
consequences beforehand.

All readOnlyHint/idempotentHint remain false: successful validated production tools
may update currently authorized connection activity, visible in connection state.
Branches without writes do not erase that possible effect. Business idempotency
keys still deduplicate operations without making the whole tool free of extra effects.
Bounded private-provider reads differ from arbitrary-public-domain imports/external
recipient sends; matrix documents each case.

transfer_postal_draft remains destructive because starting consumes the preflight's
transfer attempt irreversibly, without reset/retry after unknown. Provider draft
is separate from postal send. Classification is not simply third-party data
transfer: AI suggestions neither overwrite templates nor close retry. AI store:false
is never a no-retention guarantee.

## Regression prevention

- Local declaration type requires all four booleans, stricter than optional SDK fields.
- [Structured matrix](../integrations/chatgpt/tool-annotations.json) holds values/English rationale/source references.
- [Generated readable matrix](../integrations/chatgpt/tool-annotations.md) is checked in CI.
- audit:mcp reads actual SDK tools/list with optional services present and business stubs failing if called. Rejects absent/null/string values, undocumented/stale/duplicate tools, mismatches or missing rationale/references.
- Behavior tests reproduce valid-token replacement/partial-batch freeze; refusal of old token adds no acceptance/send effect.

Symbol presence alone proves no classification correctness; structural checks
complement handler review/behavior tests. Local proof qualifies neither reviewer
OAuth nor production server.

## Reproducible local results — 20 October

- Actual SDK catalog: **67 tools,268 booleans, 268 rationales, 216 checked references**, no anomaly.
- Compared with executed base catalog, only review_dispatch/prepare_distribution destructive flags change; 67 descriptions add observation notice. Names/titles/schema/security metadata/other descriptor fields unchanged.
- Nine focused suites: **260 passed**, no failure/skip, covering hints/review/tokens/batches/postal setup/journeys/PDF diagnostics.
- Three focused authentication cases passed: observation only after authenticated success; rebinding/revocation/workspace isolation preserved. Other 46 file cases were not run in that selection.
- One focused postal post-upload-location revocation case passed without byte transfer/automatic unknown retry. Other nine file cases not run in that selection.
- Full typecheck/lint, generated docs and diff whitespace checks passed.

This is not full exact-commit CI. External work artifacts:
`/workspace/guteneo-annotation-evidence/`, catalog/structural report/focused results,
not website assets. Report hashes cover JSON.stringify(parsed catalog/matrix),
not formatted-file bytes, identifying normalized data independent of indentation.

Normalized candidate hashes:

- Catalog: `c0ea3d3d737b762a08dd843f657fe603869ef7d74f01917174957b5ff213e3c5`.
- Matrix: `747656fe125ad7fc7669ab57abf3987d2788fb4f01b1bdda3da110357ad966d4`.

```sh
npm run audit:mcp -- --output-dir /workspace/guteneo-annotation-evidence
node scripts/build-mcp-annotation-docs.mjs --check
node docs/build-feature-map.mjs --check
npm run typecheck
npm run lint
./node_modules/.bin/vitest run \
  tests/unit/mcp-integrations.test.ts \
  tests/integration/expert-approval.test.ts \
  tests/integration/expert-review-pages.test.ts \
  tests/integration/template-workflow.test.ts \
  tests/unit/postal-setup.test.ts \
  tests/unit/postal.test.ts \
  tests/unit/postal-address-page.test.ts \
  tests/unit/pdf-validation.test.ts \
  tests/unit/mcp-annotation-audit.test.ts
```

## Server and portal transition

Plugin ZIP alone cannot fix separately hosted MCP annotations. No manifest/version
change is needed merely to prove hints locally. Package candidates 0.3.3/0.3.4
are distinct from rejected 0.3.2 and never implicitly promoted by this remediation.

1. Review correction/exact-commit CI, then follow existing publication procedure after explicit production authorization.
2. Capture authenticated deployed tools/list and match names/descriptions/schemas/hints. Local fixture-origin catalog is no production-discovery evidence.
3. In existing submission run Scan Tools; check 67 tools / two changed destructive flags/all rationale against actual recorded catalog, especially four historical omissions/dry_run_dispatch.
4. Run existing reviewer cases in correct account/host. Successful scan is not successful journey; marketplace OAuth/qualification gaps remain separate.
5. Owner completes attestations; resubmit only with authority. Review outcome/publication are separate steps.

At 20 October pass end no deployment, portal mutation, attestation, sent email,
resubmission or approval was established; then-deployed source/exact reviewed
snapshot had not been recovered. 23 October status is above. Historical clarification
draft remains [annotation-review-response.en.md](../integrations/chatgpt/annotation-review-response.en.md).
