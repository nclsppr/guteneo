# Guteneo engineering documentation

Start with the [repository standards](REPOSITORY_STANDARDS.md) for English-first
language, canonical English routes, terminology and documentation ownership.
These rules apply to code, comments and documentation as well as interfaces.
Frontend internationalization, recipient-facing transactional interface copy and
localized video content are the product-language exceptions.

The [technical atlas](FEATURE_MAP.md) maps features, role permissions and customer
journeys to their source and detailed contracts. Open [the visual atlas](FEATURE_MAP.html)
locally for a searchable, printable view. Its five actor columns distinguish four
human membership roles and a connected assistant; they create no additional authority.
Edit [feature-map.json](feature-map.json), then run:

```sh
node docs/build-feature-map.mjs
node docs/build-feature-map.mjs --check
```

CI rejects stale generated views, inconsistent permissions, missing references and
incomplete journeys. Review also checks the semantic coverage of each change.
The raw atlas, internal runbooks and private evidence remain in the repository.
The [engineering site](ENGINEERING_SITE.md) defines the separately curated Nimbus
publication at `engineering.guteneo.com`: readable guides, generated feature pages
and brand-aligned diagrams. `docs.guteneo.com` is reserved for customer documentation.
Run `npm run docs:build` and `npm run docs:check` to synchronize both views.

The [document email contract](PROTECTED_EMAIL.md) links the account invitation, V2 template and [recipient feedback lifecycle](EMAIL_RECIPIENT_FEEDBACK.md).
The [private original transport](PRIVATE_DOCUMENT_UPLOAD.md) owns binary, bounded
inline and the default-off App selected-original transport; the
[dated Claude qualification](CLAUDE_QUALIFICATION.md) owns Desktop exact private
storage/readiness proof and its failed model-ID handoff. Mobile and other hosts
require independent qualification.

## Current sources of truth

| Need                                                   | Start here                                                                                                                                                                                                                                                                                                                                                |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Engineering publication and visual documentation       | [Site plan and contract](ENGINEERING_SITE.md), [authored guides](../apps/engineering/src/content/docs/index.mdx)                                                                                                                                                                                                                                          |
| Scope, behavior and accepted journeys                  | [Product](PRODUCT.md), [feature atlas](FEATURE_MAP.md)                                                                                                                                                                                                                                                                                                    |
| Current work, evidence and open gates                  | [Execution plan](EXECUTION_PLAN.md), [verification](VERIFICATION.md), [24 October harmonization review](HARMONIZATION.md)                                                                                                                                                                                                                                 |
| System and data boundaries                             | [Architecture](ARCHITECTURE.md), [data model](DATA_MODEL.md), [ADR](adr/0001-reliable-modular-monolith.md)                                                                                                                                                                                                                                                |
| Language, routes, terminology and content ownership    | [Repository standards](REPOSITORY_STANDARDS.md)                                                                                                                                                                                                                                                                                                           |
| Brand and localization                                 | [Brand identity](BRAND_IDENTITY.md), [multilingual behavior](MULTILINGUAL.md), [video narration](VIDEO_NARRATION.md)                                                                                                                                                                                                                                      |
| Public navigation, themes and loading                  | [Homepage and detail pages](HOMEPAGE_REDESIGN.md), [appearance](THEMES.md), [frontend loading](FRONTEND_PERFORMANCE.md), [workspace presentation](DASHBOARD_V2.md), [Studio space and switcher plan](STUDIO_SPACE_PLAN.md), [local reprise acceptance](STUDIO_SPACE_REPRISE.md), [web applications](WEB_APPLICATIONS.md) |
| Shared web, REST and assistant contract                | [API contract](API_CONTRACT.md), [developer API](DEVELOPER_API.md), [identity and MCP](IDENTITY_MCP.md)                                                                                                                                                                                                                                                   |
| Workspace roles and account management                 | [Roles](WORKSPACE_ROLES.md), [account administration](ACCOUNT_ADMIN.md), [identity](ACCOUNT_IDENTITY.md), [deletion](ACCOUNT_DELETION.md)                                                                                                                                                                                                                 |
| Sensitive distribution and personal receipt            | [Current implementation](SECURE_DISTRIBUTION_IMPLEMENTATION.md), [journeys and recovery](SECURE_DISTRIBUTION_JOURNEYS.md), [pricing](SECURE_DISTRIBUTION_PRICING.md), [unified-account historical plan](UNIFIED_ACCOUNT_AND_VAULT_PLAN.md)                                                                                                                |
| Documents and authoring                                | [Studio workflow](TEMPLATES_DATA_DISTRIBUTION.md), [template engine](TEMPLATE_ENGINE.md), [data import](DATA_IMPORT.md), [private original PDF transport](PRIVATE_DOCUMENT_UPLOAD.md), [verification recovery](DOCUMENT_ANALYSIS_RECOVERY.md)                                                                                                             |
| PDF verification                                       | [Current contract](PDF_ACCESSIBILITY.md), [unit pricing and release gates](PDF_VERIFICATION_PRICING.md), [validator](PDF_VALIDATOR.md), [dated cost model](PDF_VERIFICATION_COSTS.md)                                                                                                                                                                     |
| Dispatch channels and provider setup                   | [Provider contracts](PROVIDERS.md), [live activation](LIVE_ACTIVATION.md), [Telnyx](TELNYX_READINESS.md), [Resend](RESEND_SETUP.md), [SES](SES_SETUP.md), [Pingen](PINGEN_SETUP.md)                                                                                                                                                                       |
| Document-email templates, defaults and protected links | [Email preparation](PROTECTED_EMAIL.md), [recipient access and recovery](PROTECTED_DOCUMENTS.md)                                                                                                                                                                                                                                                          |
| Postal review, price and transfer                      | [Postal review](POSTAL_REVIEW.md), [streamlined journey](POSTAL_STREAMLINED.md), [preflight](PINGEN_PREFLIGHT.md), [address pages](POSTAL_ADDRESS_PAGE.md)                                                                                                                                                                                                |
| Approval and assistant authority                       | [Expert approval](EXPERT_APPROVAL.md), [expert journey](EXPERT_CHAT_JOURNEY.md), [assistant installation](LLM_SETUP.md)                                                                                                                                                                                                                                   |
| Claude directory publication and resumption            | [Current portal observation and ordered checklist](CLAUDE_DIRECTORY.md)                                                                                                                                                                                                                                                                                   |
| Assistant packages and host qualification              | [Current client compatibility](MCP_CLIENT_COMPATIBILITY.md), [bounded MCP Apps probe](MCP_UI_CAPABILITY_PROBE.md), [Claude package](CLAUDE_PLUGIN.md), [Claude qualification](CLAUDE_QUALIFICATION.md), [ChatGPT marketplace](CHATGPT_MARKETPLACE.md), [OpenAI follow-up](OPENAI_RESUBMISSION_TODO.md), [dated platform audit](MCP_PLATFORM_READINESS.md) |
| Native app and distribution                            | [iOS API](IOS_API.md), [native README](../ios/README.md), [review policy](../ios/AppStore/REVIEW_POLICY.md)                                                                                                                                                                                                                                               |
| Billing, costs and plans                               | [Billing](BILLING.md), [costs](COSTS.md), [retired subscription history](MONTHLY_PLAN.md), [welcome credits](WELCOME_CREDIT.md)                                                                                                                                                                                                                           |
| Local development and verification                     | [Root README](../README.md), [CI and artifact provenance](CI.md), [dependency maintenance and redelivery](DEPENDENCY_UPDATES.md), [offline tests](TESTING_OFFLINE.md), [dated test results](TEST_RESULTS.md)                                                                                                                                              |
| Cloud development bootstrap and provider diagnostics  | [Repository helper contract](CODEX_CLOUD.md), [dated setup evidence](CODEX_CLOUD_PROOF.md), [AI contribution guide](../apps/engineering/src/content/docs/engineering/ai-contributions.mdx) |
| Publication and migrations                             | [Main release](MAIN_RELEASE.md), [D1 migrations](D1_MIGRATION.md), [current candidate](V1_RELEASE_CANDIDATE.md), [dated release proof](LIVE_RELEASE.md)                                                                                                                                                                                                   |
| Operations, security and restoration                   | [Runbook](RUNBOOK.md), [operations](OPERATIONS.md), [threats](THREATS.md), [secure setup](SECURE_CONFIGURATION.md), [restore proof](RESTORE_PROOF.md)                                                                                                                                                                                                     |
| Scanner maintenance                                    | [Scanner](SCANNER.md), [CI maintenance](SCANNER_CI.md), [rescan](SCANNER_RESCAN.md)                                                                                                                                                                                                                                                                       |
| Public service status                                  | [Status service](STATUS_SERVICE.md), [production dry run](PRODUCTION_DRY_RUN.md)                                                                                                                                                                                                                                                                          |
| Public design preview                                  | [Preview contract](PUBLIC_PREVIEW.md)                                                                                                                                                                                                                                                                                                                     |
| Platform oversight                                     | [Belvédère](BELVEDERE.md), [Cloudflare reads](BELVEDERE_CLOUDFLARE.md)                                                                                                                                                                                                                                                                                    |

Topic documents own their detailed contracts. Dated proof records what was observed
at that time; it is not an alternative source of current policy. Link to an existing
authoritative section instead of copying it. Every feature change must update the
atlas, affected permissions and customer journeys in the same pull request, as
required by [AGENTS.md](../AGENTS.md).
