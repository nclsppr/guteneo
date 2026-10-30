# Web applications

Guteneo's browser product is four applications: **Studio**, **Correspondence**,
**My documents** and **Belvédère**. Each one evolves on its own (code, styles,
loading and authority) and all of them follow one design system. This document
owns those rules. [`apps/web/applications.json`](../apps/web/applications.json)
records who owns each source file, and `npm run lint` enforces both sides
through [`scripts/check-applications.mjs`](../scripts/check-applications.mjs).

## The four applications

| Application    | Purpose                                                    | Authority                                       | Internal id |
| -------------- | ---------------------------------------------------------- | ----------------------------------------------- | ----------- |
| Studio         | Templates, data and generations                            | Current workspace membership                    | `studio`    |
| Correspondence | Preparation, review, sending, tracking and workspace setup | Current workspace membership                    | `workshop`  |
| My documents   | Documents received and personal copies                     | Personal session; no workspace required         | `personal`  |
| Belvédère      | Read-only platform observation                             | Its separate global authority, checked per read | `belvedere` |

Renaming an application changes its localized label only. Internal ids, routes
(`/app/...`, `/app/studio/...`, `/app/my-documents`) and API paths stay stable, as
[repository standards](REPOSITORY_STANDARDS.md) require.

## Ownership layers

Every file under `apps/web/src` belongs to exactly one owner:

| Owner           | Contains                                                                                                                                                                                                           | May import                                       |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------ |
| One application | Its pages, components and styles                                                                                                                                                                                   | Itself and the shared layer                      |
| `shared`        | Design system (`theme.css`, `styles.css`, `fonts.css`, `dashboard-v2.css`), shared frame (application and workspace switchers, account menu), API clients, locale catalogs and components several applications use | The shared layer only                            |
| `public`        | Public website, sign-in and public tools                                                                                                                                                                           | Itself and the shared layer                      |
| `host`          | Composition root (`main.tsx`, `App.tsx`, `workspace-route-loader.ts`, SSR entry)                                                                                                                                   | Everything; applications only through `import()` |

Consequences:

- An application never imports another application. Code two applications need
  moves to the shared layer, with a name that says what it does, not who uses it.
- The shared layer never depends on an application or the public site, so a
  change inside one application cannot break another through a shared file.
- The host loads each application on demand, so an application's code and styles
  ship in its own chunks and one application's growth does not slow another.
- A new source file must be added to the manifest; an unowned file fails the check.

## From Studio to Correspondence

Studio selects verified generated PDFs, then opens
`/app/distribution/new?generation=<id>&selected=<recordId>…` in Correspondence.
The query contains identifiers only. Correspondence owns the single preparation
form and the existing `/app/distribution/<id>` frozen-plan detail, including their
styles; its direct entry loads no Studio module or stylesheet. Shared table
keyboard behavior belongs to `table-keyboard.ts`.

Navigation performs no preparation write. Arrival rechecks the job and every
selected ready document through authorized reads, in pages of 50 (up to the
existing 500-record bound), stopping when the selection is resolved. Missing,
blocked or inaccessible selections cannot expose the form. The Studio history
entry retains the selected IDs, so Back, Forward, reload and the explicit return
link preserve the context. Each new destination starts with zero documents,
including a selection of one PDF. Unsaved changes may veto departure. Preparation
and postal-check replies cannot navigate an obsolete visit, including a return
to the same URL while another route's module is still pending. These browser
navigation changes add no backend or MCP authority.

## Design rules

The shared frame and the design system are the only places that define how the
product looks. In every stylesheet owned by an application or by the shared
components (the design-system files excepted):

| Rule             | Meaning                                                                                                                   |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `raw-color`      | No hexadecimal, `rgb()`, `hsl()` or similar literal: use theme tokens, or `color-mix()` of tokens                         |
| `font-family`    | Only `var(--font-body)`, `var(--font-display)`, `var(--font-code)` or `inherit`                                           |
| `token-override` | Never redefine a root design token such as `--radius` or `--blue`                                                         |
| `shell-selector` | An application never restyles the shared frame (`.sidebar`, `.space-switcher`, `.workspace-navigation`, the account menu) |

Component-scoped custom properties (for example `--day-size`) remain allowed when
their values come from tokens. The visual vocabulary itself (portrait, blue rule,
typography, geometry, controls, tables and forms) is described in the
[design-system guide](../apps/engineering/src/content/docs/engineering/design-system.mdx).

## Operational tables — 30 October 2026 candidate

`apps/web/src/data-table.tsx`, `data-table-model.ts` and `data-table.css` own the
shared read-only presentation controls. Operational lists reuse them for
accent-insensitive multiword search, categorical filters where useful, column
sorting and bounded browser pages. Column definitions provide raw numeric/date
sort values and separate localized search text. Exact decimal-string source columns
opt into bounded decimal comparison without floating-point conversion or exponent
expansion, retaining their raw display/search text. Renderers retain the original
links, statuses, forms and business actions. No table-control change issues a
business request or changes the initial authorized read.

The layout follows the table's available container width, including space taken
by navigation and adjacent panels. Above 40 rem (640 px at the default root size),
keep aligned columns in a contained horizontal scroll region when needed.
Narrower operational tables become labelled cards with one consistent row inset,
readable values and full-width action groups. A visible column/direction selector
keeps sorting available when column headers are visually hidden. All controls
retain keyboard focus, 44 px targets, four-language labels and light/dark tokens.
Scroll regions have distinct table-prefixed names, and source-range captions own
the table accessible name. Keyboard checks traverse added search/sort controls;
wide tabular views may scroll inside their region while active cards and pages
remain free of horizontal overflow.
Static reference tables, technical reports and editable spreadsheet grids retain
their appropriate contained scrolling and specialized keyboard behavior.

Search and sort apply only to supplied, currently authorized rows. A cursor-based
page keeps its existing explicit **Load more** control; unloaded rows are not
searched or silently fetched. Changing the search, a filter, the sort or the page
size returns to the first browser page; shrinking results clamps the page. Empty
results offer clearing filters without dropping the surrounding page or actions.
Server-paged Belvédère lists retain their server search, filters and paginator,
disable the duplicate browser search/pagination and identify local sorting as
applying to the current server page. Complete chart/finance detail arrays use the
shared browser controls.

The four human membership roles, independent supervisor permissions, personal
access and Belvédère's separate platform authority remain unchanged. Controls
organize rows already supplied by the authorized page; they grant no tenant
access, approval, paid operation, mandate or new REST/MCP/native capability.
State stays inside the mounted table and is not written to account preferences,
URLs or persistent storage. Keep caller identity/unmount guards intact so a new
account or workspace never inherits prior records.

The table model's unit tests and `tests/preview-e2e/data-tables.spec.ts` qualify the
source candidate with synthetic loaded rows. Rendered checks, measured loading,
CI and publication evidence are recorded separately in the
[frontend performance contract](FRONTEND_PERFORMANCE.md); source implementation
alone establishes no hosted, authenticated-provider or physical-device proof.

## Loopback simulation profiles

The [local simulation contract](PUBLIC_PREVIEW.md#local-roles-and-large-volume-fixtures--30-october-2026-candidate)
owns fictional role/platform profiles, seeded bounded metadata and the separate
read-only Belvédère fixture. The composition root loads the control bar only for
DEV + public-preview + loopback. Shared API/personal adapters preserve actual
production authority and never interpret fixture profiles as real accounts. A
scenario change honours the existing unsaved-navigation veto and replaces the
application identity rather than retaining previous account data.

## Exceptions are dated debt

`importExceptions` and `designExceptions` in the manifest record what does not
follow these rules yet, each with its reason and the way out. The check fails
when an exception grows, when a count falls below its allowance (lower it), and
when an exception no longer occurs (remove it). Never add an exception to make a
new feature pass; fix the boundary instead.

The 29 October reprise removes all four import exceptions: My documents and
its session start in parallel, the preference helper belongs to Correspondence,
the entry-link rule belongs to shared styles and locale presentation uses an
event observed by public sharing. A few dated chart-color, shadow and V2-radius
design exceptions remain in Belvédère, the film frame, the language menu and the
protected reader; the manifest records their exact remaining allowances.

## Checking

```
npm run lint                                   # ESLint, then the application check
node --test tests/security/check-applications.test.mjs
```

The fixture in `tests/fixtures/applications` proves that a cross-application
import, an eager application load and each design rule are refused.
