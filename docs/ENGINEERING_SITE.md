# Engineering documentation site

## Purpose and audience

`engineering.guteneo.com` is the public engineering documentation for guteneo:
contributors, integrators and engineers evaluating its technical boundaries.
It is distinct from the future `docs.guteneo.com` customer help site. Describe
implementation and contracts clearly without turning a local candidate, capability
flag or successful HTTP response into a claim of verified live operation.

Curated engineering publication is an explicit exception to the repository-only
technical atlas rule. The repository atlas, private operational records and
historical proof do not become public by default. The
[repository standards](REPOSITORY_STANDARDS.md) own this publication boundary.

## Structure and ownership

The site uses the official Cloudflare Nimbus scaffold with English MDX in
`apps/engineering/src/content/docs/`, static output, native local search and
English canonical paths. The layout renders the frontmatter title; authored
pages must not add another H1 or duplicate page introductions in callouts.

| Area | Authoritative files |
| --- | --- |
| Site configuration, Nimbus layout and navigation | `apps/engineering/astro.config.ts`, `src/content.config.ts`, `src/layouts/`, `src/styles/` and `src/components.ts` |
| Publication contract and authored explanations | This document and `apps/engineering/src/content/docs/`, excluding generated `features/` |
| Technical diagram facts, SVGs and Mermaid sources | `apps/engineering/src/components/diagrams/`, with published assets under `public/illustrations/` |
| Gutenberg editorial images and reusable notes | `apps/engineering/public/gutenberg/` and `src/components/GutenbergNote.astro` |
| Feature publication | `docs/feature-map.json` and `scripts/build-engineering-content.mjs`; generated pages are not hand-authored |
| Build and release validation | `scripts/build-engineering.mjs`, `engineering-release.mjs`, `deploy-engineering.mjs`, `verify-engineering.mjs` and the required CI checks |

Authored navigation:

| Group | Pages | Reader outcome |
| --- | --- | --- |
| Home | Engineering overview | Find the architecture, implementation inventory and first development steps |
| Getting started | Overview; local development; repository map | Run the actual local application and locate the right implementation boundary |
| Architecture | System; data model; dispatch lifecycle; authority and tenancy; diagrams | Understand persistence, ownership, asynchronous work and the distinction between identity, permission and approval |
| Workflows | Documents; Studio and data; delivery channels; PDF diagnostics; secure distribution | Follow original bytes, generated versions, mapping provenance and gated provider transitions |
| Integrations | REST API; MCP | Discover the real contracts and integrate without bypassing human/delegated authority |
| Administration | Belvédère | Understand restricted platform oversight, its seven views and the boundary with workspace administration |
| Engineering | Security and reliability; testing; contributing; releases; troubleshooting; video production; CI/release evidence; provider maintenance; design system; AI contributions; background jobs | Maintain invariants, qualify changes through publication and investigate failures without unsafe retries |
| Feature atlas | Generated index, domain pages, permissions and journeys | Inspect the complete feature inventory with its availability and actor boundaries |

## Source inventory and curation

Use current code/contracts for names, paths and control flow. Topic documents
explain constraints but also contain dated history; extract the current contract
without copying historical production status, account details or proof appendices.

| Public subject | Repository authority |
| --- | --- |
| Runtime and trust boundaries | `docs/ARCHITECTURE.md`, `apps/api/src/`, `apps/documents/`, `apps/scanner/`, `apps/pdf-validator/`, Wrangler bindings |
| Business commitments and permissions | `packages/domain/`, `packages/contracts/src/roles.ts`, migrations, `docs/WORKSPACE_ROLES.md`, `docs/EXPERT_APPROVAL.md` |
| Documents, templates and data | `packages/templates/`, `packages/data/`, `apps/api/src/documents.ts`, `template-workflow.ts`, topic contracts |
| REST and MCP | `apps/web/public/openapi.json`, `apps/api/src/mcp.ts`, shared contracts, annotation audit |
| Local development and validation | Root `package.json`, Playwright/Vitest configuration, native scripts, CI |
| Changes, publication and recovery | `docs/MAIN_RELEASE.md`, `CI.md`, `D1_MIGRATION.md`, `RESTORE_PROOF.md`, current release/migration helpers and workflow definitions |
| Troubleshooting and error recovery | `docs/DOCUMENT_ANALYSIS_RECOVERY.md`, `PUBLIC_PDF_IMPORT.md`, `PUBLIC_HTTP_ERRORS.md`, current auth/document/error contracts and returned recovery fields |
| Feature coverage and journeys | `docs/feature-map.json` only; generated repository and public views |
| Brand and source-language rules | `docs/BRAND_IDENTITY.md`, `docs/REPOSITORY_STANDARDS.md`, `docs/MULTILINGUAL.md` |

Public content may describe private-service boundaries and privileged capabilities
at a conceptual level. It must not publish a private operator URL, authorized
person's identity, tenant/client/account identifiers, tokens, signed URLs,
recipients, customer documents, credential workflows or internal recovery steps.
Use synthetic examples and conventional placeholder environment variables.

## Feature publication contract

Generate `/features/` and `/features/<domain-id>/` from
`docs/feature-map.json`; do not maintain a second feature list in MDX. Planning
started from 21 domains, 222 feature descriptions, 25 journeys, 67 REST operations
and 67 MCP tools. The site adds its own documentation domain to that source.
Current counts and headings are computed at build time, not copied into multiple
authored pages.

The public generator must:

1. Read and validate the existing schema and unique domain identifiers.
2. Project an explicit reviewed allowlist: domain title/category, availability,
   feature descriptions, relevant surfaces and documented actor/authority limits.
3. Keep every cataloged feature represented; describe private operational
   capabilities without publishing private addresses or identities. If source
   content becomes unsafe, fail publication for review instead of silently
   dropping a feature or inventing a sanitized capability.
4. Derive stable English domain routes and feature anchors. Keep operation/tool
   names exact and link to curated integration contracts.
5. Omit repository-only proof locations, private dated reports, local filesystem
   paths and raw internal runbook links. Do not copy the repository HTML atlas
   wholesale into static assets.
6. Emit an unmistakable generated-source notice. A `--check` mode must reject
   drift and incomplete domain/feature coverage using computed source values.
7. Keep implementation, activation gates and verified live qualification separate.
   Feature presence never grants an actor permission or enables a channel.

The public generation check joins existing documentation checks. Every added,
changed or removed feature updates `feature-map.json`, affected developer
contracts and both generated projections in the same pull request.

## Opportunity register

| Opportunity | Intended result | Boundary / acceptance condition |
| --- | --- | --- |
| Central engineering entry point | One structured route into architecture, workflows, contracts and contributions | No duplicated customer help tree or private report dump |
| Generated complete feature atlas | All cataloged features stay discoverable as implementation evolves | Computed coverage; one source; review unsafe content before publication |
| Readable technical diagrams | Explain system boundaries and irreversible transitions at a glance | SVG and Mermaid agree with code; accessible text and small-screen rendering |
| Gutenberg editorial notes | Connect precise engineering decisions with guteneo's printing heritage | A reusable component, factual copy, sparse imagery and no repeated explanation |
| Search and machine-readable reading | Find one authoritative topic from browser search or Markdown/LLM discovery | Local static search; public curated content only; no account/business bindings |
| Safer integration examples | Separate reading, preparation, approval, confirmation and delivery | Synthetic values; no embedded credentials or executable-send widgets |
| Explicit evidence vocabulary | Readers can distinguish implementation from runtime qualification | No global availability promise from tests, packaging or metadata |
| Continuous documentation maintenance | Code and technical explanations evolve together | Build, links, generated coverage, source language and accessibility checks |
| Data ownership and relationship guide | Understand tenant keys, immutable versions, Studio lineage, accounting and retention | Explain actual schema and policy separately; diagrams are selective, not a complete schema dump |
| Changes and releases guide | Follow local work, review, exact-source CI, authorized publication and served verification | Separate code, schema, private services and provider effects; expose no operational credentials or recovery bookmarks |
| Symptom-based troubleshooting | Choose safe checks, explicit recovery or escalation from the returned state | Preserve original references and unknown outcomes; no blind retry, authority bypass or private runbook publication |
| Future customer documentation | Later publish task-oriented product help at its own domain | Out of this engineering site's first scope; reuse contracts by reference |

## Administration section

`/administration/belvedere/` is an authored engineering guide and an explicit
Administration navigation entry. It explains the existing private control tower
rather than exposing its private application entry. Workspace roles remain owned
by the authority/tenancy guide; no duplicate workspace-administration workflow is
introduced.

The page is curated from `docs/BELVEDERE.md`, `BELVEDERE_CLOUDFLARE.md`, shared
projection contracts and the actual server, client, connector and telemetry
modules. It covers the seven views, current browser-identity guard, operational
read-only boundaries and audit side effects, finance time bases, coarse country
provenance, independent infrastructure sources and safe read-error recovery.
The public prose excludes private operator addresses, identities, account IDs,
credentials, activation instructions and dated proof dumps. One Gutenberg note
explains the observation/authority distinction; shared diagrams are linked rather
than repeated.

This section is included in the final local 46-page candidate, with source/link,
readable Markdown, navigation and responsive checks recorded below. Earlier
41-page results remain separate historical evidence. Application access and
production publication are not established by a documentation check.

## Additional engineering coverage

The architecture data-model guide explains source-verified entities, ownership,
immutability, lineage, financial records and retention, using a compact logical
diagram rather than a full database dump. The diagram reference exposes the
technical figures and Mermaid sources with contextual links from relevant guides.

`/engineering/releases/` follows an implementation through local validation,
review, exact-source CI, authorized publication and served-byte verification.
It distinguishes application, preview, engineering, status and private-service
surfaces, plus the separate scope of schema changes and restoration. It links
the testing/contribution/lifecycle contracts instead of repeating their suites
or publishing private release procedures.

`/engineering/troubleshooting/` is organized by observable symptom: authentication,
source refusal, quarantine, reader failure, interrupted confirmation, uncertain
provider outcome and capability/quota limits. Safe canonical reads and existing
returned recovery fields guide the next step. No source URL, operator account,
credential, customer payload, private evidence or activation procedure is copied
into public content.

The homepage links these subjects directly; Architecture and Engineering
navigation expose the corresponding pages. Repository decision records remain
internal. They are excluded from the public site at the user's request.

## Publication and verification boundaries

The engineering deployment is a static documentation surface with no D1, R2,
queue, scanner, provider or business API binding. Reading it must not start an
OAuth flow, execute business API calls, expose local development authentication or cause
a document/communication mutation. Site build/search/Markdown generation operate
only on reviewed public content.

Before publication, verify the Nimbus build, all authored and generated routes,
local search, link targets, diagrams, keyboard navigation, contrast and desktop/
phone layouts. Check that generated output contains no private identifiers,
secrets, local paths, internal report directories or copied private runbooks.
Record the exact source/build and verify the resulting public origin separately.

### Dedicated release contract

The dedicated entry point is:

```sh
npm run deploy:engineering -- --confirm-production --commit <reviewed-full-sha>
```

The flags identify an explicitly authorized engineering publication and its full
40-character reviewed commit. They do not replace authorization. The release
script uses the shared `verifyMainSource` guard: local `main` must be completely
clean, with no hidden index flags, and match freshly fetched `origin/main` and
the reviewed commit. Fetch failure or drift blocks publication. It validates the
dedicated asset-only configuration, runs documentation/build/browser checks, then
repeats the fresh-main check immediately before artifact verification and Wrangler.

The configuration allowlist permits only static assets on
`engineering.guteneo.com`, with the separate `guteneo-engineering` service,
`workers_dev` and preview URLs disabled, trailing-slash HTML and a real 404 page.
Runtime entry points, environment variables and business bindings are rejected.
The build manifest inventories asset paths, byte lengths and SHA-256 hashes,
rejects symlinks/restricted repository assets, and records the source commit,
dirty state, explicit source scope/digest and aggregate asset-list hash. The build
refuses a source change during validation. After browser checks, publication
rereads every asset and compares its path, size and hash, the complete list and
aggregate hash, the current source snapshot and the original build manifest. A
replaced manifest is rejected even if it is internally consistent with replaced
files. None of these checks is bypassed by a CLI option; local regression tests
inject command execution against temporary Git remotes without publishing.

After deployment, `scripts/verify-engineering.mjs` compares the served release
manifest with the clean local build, checks representative page/index/image bytes
against their hashes, and confirms an unknown route returns HTTP 404. A passing
manifest is bounded release evidence; content, accessibility and authenticated
application behavior retain their own checks. Do not claim every published asset
was fetched when the verifier checks a representative selection.

Publishing engineering documentation does not authorize application deployment,
production migrations, provider activation, paid provisioning, expert mandates,
real communications or marketplace submissions. Those keep their existing
explicit authority and qualification requirements.

## Main reconciliation and expanded coverage — pending qualification

The reconciliation with incoming main `4f033e2` preserves the unified personal
account and sensitive-distribution contracts, including the explicitly selected
`verified_account` profile, default `strong` behavior, browser-only sensitive
approval, independent recipient association and separate acquired-copy ownership.
The feature source includes all incoming REST/MCP operations and current human/
assistant permissions; generated counts remain computed from that source.

New authored guides explain `/workflows/secure-distribution/`,
`/engineering/ci-and-release/`, `/engineering/provider-maintenance/` and
`/engineering/background-jobs/`. Current system/authority/data-model/MCP pages
link these contracts rather than duplicate full procedures. The system guide
explicitly distinguishes configured Workers/D1/R2/Queues/Cron/private browser
services, external Auth0/Telnyx/Pingen/Resend/Stripe, legacy SES/SNS, and unconfigured
Workers AI/Durable Objects proposals. Provider prices are not copied into public
prose; the maintenance procedure preserves qualification/expiry and immutable
approved terms.

The design-system, AI-contribution and video-production guides document current
brand, i18n, accessibility, review and narration contracts. Editorial artwork preserves the approved Gutenberg character identity from the
video reference; a service-release Mermaid
separates main application release from private-service/provider qualification.
Every affected CI, cloud, service, tariff, design, AI, locale, accessibility or
video change updates its source contract, feature node and authored engineering
guide in the same change. The repository standards and CI guard own this rule.

**All results below precede this reconciliation.** New source coverage, generated
views, English review, build, public-output/link/fragment audit, browser behavior,
responsive rendering, exact-commit CI and authorized served publication remain
pending for the expanded candidate. Do not reuse earlier pass counts as proof of
new content or merged code.

## Prior local candidate acceptance — 24 October 2026

The extended site builds 46 documentation routes: 21 authored MDX pages and 25
generated Markdown pages. Its manifest inventories 333 static assets. The shared
source produces 22 domains, 230 features, 26 journeys, 67 REST operations and 67
MCP tools. These are measured local build results; earlier measurements remain
historical below.

The homepage and navigation expose Administration, the data model, technical
diagrams, releases and troubleshooting. Repository decision records are not
published. The independent output audit found no stale public decision routes or
references in the built text assets.

| Area | State | Evidence and limits |
| --- | --- | --- |
| Content and generated coverage | Passed locally | Every built feature anchor matches the source; all authored pages lint clean and Nimbus reports no findings. Build/type diagnostics have no errors/warnings and four hints in vendored figure tooling. Generated Markdown retains its separate generation/coverage check |
| Markdown and diagrams | Passed locally | Fourteen semantic checks cover all six Gutenberg notes, three gallery Mermaid sources, the data-model schema/policy distinction, Belvédère authority, release/troubleshooting recovery guidance and all five new homepage destinations |
| Static links and headings | Passed locally | Across 47 HTML files including the error document: 4,182 internal links and 229 fragments, with no missing navigation/assets, duplicate IDs or H1-count issues. The noindex error document's canonical `/404/` metadata remains an explicit non-navigation exception |
| Public-output curation | Bounded scan passed | 165 text assets have no restricted-pattern or stale public-decision findings. Pattern scanning is a regression heuristic and manual curation aid, not universal proof that every sensitive value is absent |
| Asset provenance | Passed on the final local candidate | All 333 manifest asset hashes and byte lengths match the rebuilt stable output after the shared keyboard/search-focus corrections. The manifest truthfully records `dirty:true`; this is not a clean committed publication |
| Browser behavior | 21 cases passed locally | Desktop Chromium, mobile Chromium and desktop WebKit on Cloudflare static serving: reading/themes/reduced motion, headers and business-route isolation, feature/matrix navigation, Markdown indexes, search/focus, figure keyboard steps, downloads and new-page discovery |
| WebKit interaction regressions | Corrected and verified | Permanent checks now cover Mermaid ArrowRight scrolling and focus return after native search closes. The expanded 21-case suite passes; independent focused retakes also pass eight contexts and sixteen figures. These interaction checks are separate from layout measurements |
| Responsive rendering | 40 views, no reported issues | Chromium/WebKit checks include phone/desktop and dark mode; eight data-model retakes replace their earlier entries. This is browser-emulation evidence, not a physical-device or public-origin check |
| Repository checks | Passed locally | TypeScript, ESLint and documentation checks; fourteen focused Node guards (four engineering, seven standards, three CI). Earlier targeted API verification passed 84 cases; it is a separate check of the API wording change |
| Public origin and remote CI | Not qualified by this work | A local commit/build, exact-source CI and any authorized publication retain their separate release gates; no remote CI, merge or deployment is claimed here |

Final reports live outside Git in
`/Users/nclsppr/Documents/Codex/2026-10-24/guteneo-engineering-evidence/`:
`documentation-audit.json`, `build.log`, `browser.log`, and
`visual-final/review.json`, with diagram/render captures in their own folders.
The documentation audit records the stable output hash, exact manifest comparison,
per-domain feature coverage, semantic checks and limitations. Its final manifest/
JavaScript refresh follows both WebKit corrections; the pre-fix audit files remain
alongside it as historical evidence. An authorized
publication still requires the clean reviewed commit and served verification
described above; this local acceptance does not activate a business capability.

### Prior candidate: 41 documentation routes, 24 October 2026

This earlier candidate contained sixteen authored English pages, five Gutenberg
notes, three isometric figures and one complementary Mermaid pipeline. Its source
feature coverage was 228 descriptions across 22 domains. The following local
checks apply to that candidate only; they do not qualify newly added routes.

| Check | State | Evidence / remaining work |
| --- | --- | --- |
| Authored content and navigation | Source review complete | Sixteen substantive pages, English canonical routes and concise sidebar labels; no body H1 duplication |
| Feature projection | Local coverage verified | Built anchors match every source feature: 22 domains and 228 features; permissions and journeys are generated from the same source |
| Diagrams and text alternatives | Source facts and Markdown verified | Three isometric figures and one complementary Mermaid are embedded; exact approval/unknown-outcome semantics, downloads and all five Gutenberg note titles/prose survive the readable Markdown projection |
| Nimbus type/build/content checks | Local build passed; lint scope explicit | Astro: 0 errors, 0 warnings, 4 hints in vendored diagram tooling; 41/41 documentation routes built and indexed by Pagefind. All 16 MDX files lint clean. Nimbus reports `ok:true`, 0 errors/warnings and `status:partial` because its authoring linter does not cover the 25 generated `.md` files; generation/coverage and built-link checks cover those separately |
| Internal links and public-output privacy | Local built audit passed, with bounded scope | 42 HTML files including the error page, 3,484 internal links and 194 fragment targets: no missing navigation/assets, duplicate IDs or heading-count issues. The noindex error document's canonical `/404/` metadata is an explicit exception. Across 145 text assets, no restricted-pattern findings; this scan is a regression heuristic and curation aid, not universal privacy proof |
| Desktop, phone, keyboard and search | Verified locally | 12 Playwright cases pass on desktop/mobile with local Cloudflare asset serving: reading, search/focus, permissions, Markdown, diagram keyboard steps/SVG downloads, headers and application-route isolation. Independent visual review covers 28 Chromium/WebKit renders at 320/390/1440 pixels and dark mode, with no overflow, page errors or H1 issues. |
| Public engineering origin | Not published or verified | Record an authorized deployment and resulting exact-source observation separately |

The independent local output audit is retained outside Git at
`/tmp/guteneo-engineering-documentation-final-audit.json`. It records the stable
output snapshot, feature coverage, semantic Markdown checks and its limitations.
The build/type/lint/Nimbus reports use the matching
`/tmp/guteneo-engineering-*-final.*` paths. These are local candidate observations
from 24 October 2026, not remote CI or publication evidence.
