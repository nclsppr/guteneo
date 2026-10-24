# Repository and interface standards

This is the source of truth for language, naming, documentation ownership and
interface consistency. [AGENTS.md](../AGENTS.md) makes these requirements part of
every change. The [documentation index](README.md) links the detailed contracts;
it does not replace them.

## English by default

Write repository-authored code, identifiers, comments, tests, commit and pull
request prose, documentation, diagrams, configuration descriptions, API messages,
examples and integration instructions in English. Use clear, natural sentences.
Proper names, published standards, immutable external identifiers, exact legal
quotations and third-party license text retain their original spelling. Explain
any quotation in English. Never translate a stored identifier or evidence value
merely to make its spelling English.

The only product-language exceptions are frontend internationalization and
localized video content. Keep French, English, German and Luxembourgish user
interface strings in the appropriate locale catalogs or explicitly localized
frontend resources. Video scripts, captions, narration and on-screen text may
use their declared language; production instructions and provenance descriptions
remain English. Localized App Store listing text belongs to frontend
internationalization. User-provided documents, addresses, names and content keep
their exact bytes; this policy is not a content translation service.

Do not put French prose in an English code comment, README, API explanation,
example prompt or integration skill. An assistant follows the user's language at
runtime; the instructions defining that behavior remain English.

## Stable English routes and contracts

Use English URL path segments for public pages, application navigation, account
actions, downloads, API endpoints and documentation resources. Use lowercase
kebab-case for multiword paths and descriptive English parameter names. A locale
is presentation state, not a second translated route tree: translating a label
must not translate its destination. Query names, JSON keys, enum values, error
codes, MCP tool names and authorization scopes remain stable English contracts.

Centralize route definitions and link construction. Update internal links,
canonical metadata, sitemap entries, discovery documents, API examples and tests
in the same change. Keep an explicit compatibility redirect or alias for an
existing published path where required; generate and document the canonical
English path. Do not silently rewrite historical URLs in dated proof or change
an immutable approval fingerprint. Route changes must preserve authentication,
origin checks, CSRF, tenant boundaries and authorization.
Known public hash bookmarks also resolve to their canonical English page while
retaining query values and section anchors. Private application hashes remain
separate; unknown or external-looking hashes must not become redirects.

## Terminology and interface hierarchy

| Concept | English term | Contract |
| --- | --- | --- |
| Product | guteneo | Lowercase ink-black brand lettering; see [brand identity](BRAND_IDENTITY.md). |
| Shared tenant | Workspace | A tenant-scoped organization; preserve existing `organization`/`organisation` wire identifiers. |
| Human roles | Administrator, Supervisor, Operator, Observer | The four membership roles in `packages/contracts/src/roles.ts`. |
| Connected assistant | Assistant | A separate actor with OAuth authority; never a fifth human role. |
| Immutable send operation | Dispatch | Preparation, approval, acceptance and delivery are distinct states. |
| Exact file | Document / PDF | Original and derived documents keep separate identities and hashes. |
| Document authoring | Studio | Templates, datasets, mappings and generated PDFs. |
| PDF diagnostics | Horizon | Automatic diagnostics, with their documented limits. |
| Platform oversight | Belvédère | The proper name is retained; platform authority is separate from workspace roles. |

Translate these concepts consistently in locale catalogs. Preserve a proper
product name across languages. Prefer the task's concrete verb in a button
(Import PDF, Prepare dispatch, Review document) and a concise noun in navigation.
Reuse shared controls, page shells, navigation, form patterns, empty states and
locale keys when they represent the same behavior. Avoid repeating a page title,
account identity, introductory paragraph, primary action or legal explanation in
the surrounding shell. Keep exact-price summaries, explicit consent and error
recovery at the decision where they are needed. Deduplication must not hide
security or financial information required to make that decision.

Public pages share `apps/web/src/public-chrome.tsx` and `public-chrome.css` for
header, mobile navigation, footer and section navigation. Legal/support/status
links are owned by `apps/web/src/legal-links.tsx`; page titles/actions use the
shared `PageHeading`. Extend these sources rather than adding a second shell.
Use the established paper/ink/cobalt palette, EB Garamond display type and IBM
Plex body type through shared style tokens (`--font-body`, `--font-display`,
`--font-code`, `--content-measure`, `--control-height`). Preserve approved assets
and the black lowercase wordmark. The [brand contract](BRAND_IDENTITY.md) owns
visual identity; public shell code owns its implementation.

## Documentation ownership

Give each current rule one authoritative home. Link to it from summaries instead
of copying the same operational instructions into multiple files.

| Source | Owns |
| --- | --- |
| [Repository standards](REPOSITORY_STANDARDS.md) | Language, naming, terminology, content ownership and consistency. |
| [Product contract](PRODUCT.md) | Product scope, actors, user-visible behavior and business boundaries. |
| [Architecture](ARCHITECTURE.md) | System boundaries, trust, persistence, atomicity and runtime design. |
| [API contract](API_CONTRACT.md) | Shared web/REST/MCP contract and interface discovery. |
| [Feature-map source](feature-map.json) | Feature tree, role matrix, journeys, references and availability. |
| [Brand identity](BRAND_IDENTITY.md) | Approved assets, colors, lettering and composition. |
| [Multilingual contract](MULTILINGUAL.md) | Locale resolution, persistence, translation parity and boundaries. |
| [Main release procedure](MAIN_RELEASE.md) | Publication sequence and exact-source release gates. |
| [Execution plan](EXECUTION_PLAN.md) | Current work, blockers and links to dated evidence. |
| Topic contracts and dated proof | Their bounded technical details and observations, linked from the index. |

Keep historical proof dated and faithful. A passing fixture test, an exact-source
CI run, a served release, a current provider configuration, an authenticated host
journey and real delivery are separate observations. Never convert a candidate
into a publication claim through an editorial rewrite. Retain exact test counts,
versions, hashes, command names, paths and evidence locations. Mark superseded
operational advice as historical and link to the current contract.

When adding, changing or removing a feature, update both its feature-map node
and the affected developer documentation in the same pull request, including
the role matrix and customer journeys. Regenerate the Markdown/HTML atlas
and verify it with `node docs/build-feature-map.mjs --check`. Generated documents
are outputs: edit their source. The technical atlas stays repository-only and
must not become an official website asset, page, navigation item or sitemap URL.

Portable integration instructions are authored once under `integrations/guteneo/`.
Claude-specific host constraints are an explicit overlay; run
`node integrations/sync-claude-workflows.mjs` after changes and `node integrations/sync-claude-workflows.mjs --check` to
verify generated copies. Do not edit a generated host copy independently. Shared
instructions describe authority and behavior in English while each host retains
its own permission prompts and transfer limits.

## Repository checks

`npm run docs:build` regenerates the feature atlas and MCP annotation matrix;
`npm run docs:check` rejects
stale views, missing references and incomplete interface coverage. Run
`npm run check:standards` for language/routing/source-ownership regression checks.
CI runs these as blocking checks. The change-base comparison requires a feature
change to update both feature-map source and relevant developer documentation in
the same pull request. These deterministic checks are regression heuristics,
not proof of fluent English, correct translation, full semantic coverage or actual
hosted behavior; review the meaning and rendered interface as well.

## Review requirements

1. Check English prose and identifiers, with localized content kept in its declared resource.
2. Use the canonical route helper and the existing terminology, components and locale keys.
3. Update the authoritative contract, affected feature-map entries and all live references.
4. Remove superseded duplication while preserving explicit consent and historical proof.
5. Run the repository language, documentation, formatting and relevant behavior checks.
6. Record what was checked and what still requires CI, hosted or human qualification.

A language check is a guard against regression, not proof that prose is clear or
that every translation is correct. Review meaning, links and the rendered result.
