# Repository and interface harmonization — 24 October 2026

This dated report records the initial local review checkpoint on `codex/harmonize-guteneo`.
Work was performed in an isolated worktree, preserving the original dirty
checkout. This branch has not been merged or deployed; this work sent no real
communication and activated no provider, paid service or delegation mandate.

## Delivered scope

- Public and authenticated web pages share navigation, legal links, page-heading
  patterns and existing brand tokens. Repeated titles, account explanations and
  operational instructions were consolidated. The status interface and native
  source/catalogs follow the same language and terminology policy.
- Repository-authored code, comments, API/MCP messages, integration instructions,
  technical video instructions and documentation use English. Frontend and video
  localization retain their declared languages; exact user content, external
  identifiers, proper names and immutable historical evidence retain their bytes.
  Dated provider, marketplace and release records remain historical evidence.
- Canonical public, application and API links use English independently of display
  language. Published legacy public paths have explicit redirects preserving
  query parameters. New generated dataset sheets use `Data` and `Data.<path>`;
  provenance-bound legacy aliases preserve generated-name mappings without
  rewriting source bytes, stored profiles or approval fingerprints. Uploaded
  XLSX names and explicitly named JSON tables require exact matching. See the [route registry](../packages/contracts/src/public-site.json)
  and [dataset compatibility contract](DATA_IMPORT.md#english-generated-sheet-names-and-saved-mapping-compatibility).
- Web source uses English `msg`/`msgIn` inputs with explicit contexts for ambiguous
  labels. Native source and all 261 catalog keys use English; the complete set of
  French, English, German and Luxembourgish display values is unchanged.
  Account/browser language selection remains separate from source language.
  See [multilingual behavior](MULTILINGUAL.md).

## Documentation and maintenance

The [documentation index](README.md) is the central entry point. The
[repository standards](REPOSITORY_STANDARDS.md) own language, terminology,
component reuse and documentation ownership; detailed contracts remain in their
existing authoritative documents. Integration instructions have one common
source with a generated Claude host overlay.

The [feature atlas](FEATURE_MAP.md) contains **21 domains, 222 features,
25 customer journeys, 67 REST operations and 67 MCP tools**, including availability
and role/authority boundaries. [feature-map.json](feature-map.json) generates
both Markdown and HTML views. These remain repository-only technical documents.
Every feature addition, change or removal must update this source and the affected
developer documentation in the same pull request, including affected permissions
and journeys. [AGENTS.md](../AGENTS.md) and [CI](CI.md) record the maintenance rules.

Documentation generation, source synchronization and English/routing regression
checks are blocking CI requirements. A passing deterministic language guard is
not proof of fluent prose, correct translation, complete semantic coverage or
hosted behavior; human review and rendered-interface checks remain necessary.

## Verification completed

| Check | Observed result | Boundary |
| --- | --- | --- |
| Final web build | Passed | Local output; no publication |
| Production build / Worker dry run | Passed | Compilation without production deployment |
| Generated documentation and host-copy synchronization | Passed | Feature/MCP views and Claude copies checked without drift |
| Typecheck and lint | Passed | Local source checks; exact-head remote CI is separate |
| Full `npm test` | 113 Vitest files, 2,272 application tests and 339 Node security tests passed; exit 0 | No failures, skips or cancellations in the final command |
| Native unit tests | Final 28/28 passed, including the accessibility-source correction | Simulator unit tests; physical-device qualification is separate |
| Native UI tests | Final 8/8 passed, including persisted English and the localized fingerprint accessibility label | iPhone simulator; existing Xcode warnings remain, no physical-device or distribution proof |
| Application Chromium E2E, five focused specs | 46 cases validated: 41 passed initially; all 5 affected cases passed after a focused rerun | Two stale test expectations corrected for shared public navigation and canonical home links; no business assertion removed |
| Public preview, Chromium and iPhone WebKit | Full suite: 158 passed, 6 intended desktop exclusions, no failures or flakes | Local browser fixtures; old public hashes covered on both engines |
| Final static metadata and public-language review | 34/34 passed after the final English shell/manifest build | Covers initial HTML, manifest identity, SSR/SEO, four languages, sharing, mobile controls and legacy legal links |
| Interface layout review | 38 desktop/mobile layout checks passed; feature atlas checked at 1440/390 px | Browser evidence and screenshots, not physical-device qualification |
| Status interface | 49 integration and 29 browser tests passed | English/French presentation and historical report compatibility; no provider activation |
| Authored Markdown links | 195 authored files, 1,150 local targets; no broken local files/anchors | External destinations were not refreshed by this review |
| Historical values and localization | Reviewed hashes/timestamps retained; native localized display objects unchanged | Not a new provider, marketplace or release qualification |

Local logs, browser results and screenshots are archived outside the repository at
`/Users/nclsppr/Documents/Codex/2026-10-24/guteneo-harmonization-evidence`.
Generated machine reports were not added to this change. The application baseline records 41 passes and five
stale-expectation failures; the focused rerun records five passes, no skips and
no flakes. Local application servers stopped after testing; no unexpected
configuration-required state was observed. These tests use local simulation or
bounded browser fixtures, including intercepted hosted sign-in journeys; they
do not qualify actual Auth0, reviewer or provider accounts.

## Findings resolved during verification

The initial full Vitest run found one stale French error expectation (2,270 of
2,271 passed). Initial security and application-browser checks also caught stale
translated-label expectations. Assertions were updated without removing their
behavior, privacy or authorization checks, then revalidated as recorded above.
The first preview run exposed a real legacy public-hash navigation regression
on both browser engines (156 passed, 6 intended exclusions, 2 failed). Its bounded
canonicalization fix passed the unchanged assertions in the full rerun. The first
native UI run had one stale French status expectation; after correction, all
eight cases passed, including the new English accessibility regression.

## Qualification boundaries

Remote exact-head CI, production release, real authenticated host/provider
qualification and marketplace publication remain separate from this local work.
Follow the existing [release procedure](MAIN_RELEASE.md) and the relevant dated
qualification records when those actions are authorized.
