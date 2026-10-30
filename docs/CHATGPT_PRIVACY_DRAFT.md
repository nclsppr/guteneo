# Connector data — factual working draft

**Working document dated 17 September 2026, versioned for review and not adopted as a policy.** It records source observations and matters the publisher must clarify. It is neither legal advice, compliance evidence nor a contractual subprocessor inventory. Do not provide its GitHub path as a policy URL in the portal.

## Update of 21 September 2026

The publisher authorized preparation and publication of the public pages. The candidate is implemented in `apps/web/src/information-page.tsx` at the then canonical URLs `/confidentialite/`, `/conditions/` and `/support/`, linked from legal notices and public footers. Their presence in this repository does not prove publication: verify HTTP responses and content after deployment before reporting availability in the portal. These historical paths are retained as evidence; current canonical paths are recorded in [repository standards](REPOSITORY_STANDARDS.md).

The copy sets retention criteria based on account use, unresolved operations, applicable obligations and disputes; closure and erasure requests go through the published contact. It distinguishes eligible PDF file cleanup after 90 days from metadata without a general automatic purge. It promises neither instant deletion, processing entirely in Europe, certified compliance, nor nonexistent sales or registration. Fax and post depend on the account's actual authority and capabilities; email and paid top-ups remained closed at this date.

Primary sources consulted on 21 September 2026: [CNIL, informing individuals](https://www.cnil.fr/fr/informer-les-personnes), [CNIL, retention periods](https://www.cnil.fr/fr/passer-laction/les-durees-de-conservation-des-donnees), [CNIL, access requests](https://www.cnil.fr/fr/repondre-une-demande-de-droit-dacces), [GDPR, particularly Articles 6, 12–14, 28 and 44 onwards](https://eur-lex.europa.eu/legal-content/FR/TXT/?uri=CELEX:32016R0679).

Operational gaps: contractual provider inventory and transfers/safeguards, role assessment when the customer is an organization, actual manual closure/erasure process, and external log/backup retention. The pages do not attest that these checks are complete. The historical list below retains 17 September observations; it does not replace the 21 September candidate's public description.

## Publisher and categories

The legal page identifies Nicolas Pieper as publisher, with **guteneo@pieper.fr**, and states that the activity is unregistered. The controller, legal bases, contact details and applicable terms must be confirmed before adoption.

| Observed data | Purpose | Source |
| --- | --- | --- |
| Identity, name/profile, verified email, organization, membership and role | Sign-in and access control | `apps/api/src/auth.ts`, `account.ts` |
| OAuth connections, permissions, sessions and bounded mandates | Authorization, revocation and delegation limits | `auth.ts`, `account.ts`, `expert-status.ts` |
| Original PDF, name, size, hash, pages, source and analysis | Exact storage, antivirus, reading and preparation | `apps/api/src/documents.ts`, `mcp.ts` |
| Explicitly supplied HTML and page images | Requested PDF generation and review of the exact document | `documents.ts`, `expert-review-pages.ts` |
| Recipient, sender, channel, options, quote, ceiling and approval | Preparation, authorized transmission and tracking | `packages/domain/src/index.ts`, `apps/api/src/live-providers.ts` |
| Balance, reservation, usage, events and dispatch references | Spending, reconciliation and evidence | `packages/domain/src/live-fax-usage.ts`, `apps/api/src/webhooks.ts` |
| Audit and technical security data | Diagnostics, abuse limits and operation | `maintenance.ts`, `auth.ts`, `packages/observability/src/index.ts` |

MCP uses files/parameters explicitly passed to its tools, rather than the entire conversation history. Reads can return metadata, requested pages and relevant dispatch information to the client. These transfers must be explained before connection and collection.

Passwords are entered at the identity provider; tools do not ask the model for them. Project rules prohibit logs containing secrets, tokens, content, recipients or signed URLs. That principle alone does not prove that external services retain no technical data.

## Technical services to describe

- **Cloudflare** hosts the application, D1, R2, queues and private scanning/rendering services. D1/R2 use EU jurisdiction; this does not prove the location of all processing, logs and backups.
- **Auth0**, authority `https://pieper.eu.auth0.com`, processes authentication/OAuth. The hostname does not replace review of contracts, transfers and retention.
- **Connected clients, including ChatGPT/OpenAI**, transmit chosen inputs and receive authorized results. Their own terms/practices must be distinguished.
- **Telnyx** receives what an authorized fax needs. Only fax was active at the observation date.
- **Pingen** can receive a PDF and parameters for a postal draft under separate authority. Disabled postal sending does not imply absence of preparation transfers.
- **Amazon SES** is configured, but observed email sending is inactive. Describe exactly which functions are open at publication.

Legal roles, contracts, onward subprocessors, transfers and safeguards remain to be established. This technical list does not qualify their contractual status. Stripe was not configured for billing; future activation would require an updated description.

## Retention observed in source

| Data | Mechanism | Limit |
| --- | --- | --- |
| PDF bytes | Selection after 90 days or status `purged`, bounded batches; R2 deletion and filename replacement if no nonterminal dispatch retains the document | No guarantee of deletion on the exact 90th day. History/metadata and audit remain; unfinished dispatches and maintenance can extend retention. |
| Orphan R2 objects | Bounded inspection of objects older than 24 hours | Only objects with no corresponding document are deleted. |
| `content_usage` counters | Cleanup of days before the 31-day threshold | Covers neither PDFs nor all logs. |
| Browser sessions | One-hour session, cleanup after expiry | Sign-out/revocation does not erase business data. |
| Auth transactions and development tokens | Deletion at expiry | Development tokens are not production authentication. |
| `auth_flow_limits` | Bounded cleanup beyond 48 hourly windows | Does not cover external logs. |
| Temporary document authorizations | Checked expiry and bounded cleanup | Link expiry does not delete the PDF. |

Sources: `apps/api/src/maintenance.ts`, `auth.ts`, `live-providers.ts`. These thresholds do not demonstrate actual execution across all real data.

**Retention not established here:** accounts/profiles, organizations, recipients kept in dispatches, mandate and approval history, audit, accounting, callbacks, backups and external logs. No general automatic purge of these datasets has been qualified. The publisher must set justified periods or criteria and a process; do not invent statutory or contractual periods.

## Controls and requests

The account allows viewing/editing some profile details, revoking sessions/connections and disabling a mandate. Revocation blocks new actions under server checks; it neither cancels an accepted fax nor erases its evidence. No complete account-deletion button has been qualified. Requests can go to the published contact; the publisher must define the procedure, identity checks, deadlines and remedies.

## Submission requirements

The [OpenAI rules](https://developers.openai.com/plugins/app-guidelines#privacy) prohibit processing categories including PCI DSS data, protected health information (PHI), government identifiers and authentication secrets. Generic PDF import does not prove control of these categories. Define and present restrictions before import without claiming an unimplemented filter. Sensitive data permitted by policy requires a purpose, appropriate consent and explicit information; this draft establishes none of these.

A final policy must cover actual categories, purposes, recipients, retention and controls, replacing the “demonstration held only in memory” description on the canonical domain. The independent fixture preview remains a separate surface.
