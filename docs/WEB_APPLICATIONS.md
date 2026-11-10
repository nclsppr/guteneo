# Web applications

Guteneo's browser product is five applications: **Studio**, **Correspondence**,
**My documents**, **Administration** and **Belvédère**. Each one evolves on its own (code, styles,
loading and authority) and all of them follow one design system. This document
owns those rules. [`apps/web/applications.json`](../apps/web/applications.json)
records who owns each source file, and `npm run lint` enforces both sides
through [`scripts/check-applications.mjs`](../scripts/check-applications.mjs).

## The five applications

| Application    | Purpose                                                                 | Authority                                                                               | Internal id      |
| -------------- | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ---------------- |
| Studio         | Templates, data and generations                                         | Current workspace membership                                                            | `studio`         |
| Correspondence | Preparation, review, sending and tracking                               | Current workspace membership                                                            | `workshop`       |
| My documents   | Documents received and personal copies                                  | Personal session; no workspace required                                                 | `personal`       |
| Administration | One workspace's reports, exports, members, access, billing and settings | Current membership: administrators; report views for supervisors with report permission | `administration` |
| Belvédère      | Read-only platform observation                                          | Its separate global authority, checked per read                                         | `belvedere`      |

Renaming an application changes its localized label only. Internal ids, routes
(`/app/...`, `/app/studio/...`, `/app/my-documents`, `/app/administration/...`)
and API paths stay stable, as [repository standards](REPOSITORY_STANDARDS.md)
require. The 3 November 2026 recovery moves workspace management (members,
invitations, usage, billing, workspace name, channel controls and diagnostics)
from Correspondence and the personal profile into Administration; `/app/admin`,
`/app/usage` and `/app/billing` remain aliases. The
[administration contract](WORKSPACE_ADMINISTRATION.md) owns its authority,
exports and the decision to keep Belvédère platform-only.
Since 4 November 2026 the personal session projects a server-computed report
right per membership, so My documents and Use Guteneo offer Administration to
the same people the workspace switcher does (administrators, supervisors with
report permission) and stop as soon as that right is removed. Each
authenticated page also names its application in the browser tab
(`Administration | guteneo`, `My documents | guteneo`, …).

## Ownership layers

The [application-time contract](APPLICATION_TIME.md) owns the single explicit UTC
context shared by all five applications, including displayed instants, filters,
report buckets, exports and date/time entry. It advertises no user timezone
preference and preserves the existing financial calendar basis.

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

## Lifecycle tools and shared client foundations — 9 November 2026 candidate

Correspondence owns recipients, schedules and attention; Administration owns
customer-webhook configuration. The [roles matrix](WORKSPACE_ROLES.md),
[schedule contract](SCHEDULED_DISPATCHES.md) and
[callback contract](CUSTOMER_WEBHOOKS.md) own their server authority. Contact
selection takes an immutable snapshot, a schedule draft grants no future consent,
and callback configuration grants no provider sending authority. Source detail
projects its active schedule hold so ordinary approval/sending cannot appear
available while that hold exists. The future release window bounds acceptance
into the queue, with delivery timing determined separately by the provider.

The frame offers a navigation-only command palette and a metadata-only outcome
tray. Cmd/Ctrl+K searches permitted static destinations, with keyboard selection,
Escape/focus recovery and the existing unsaved-work veto. It performs no remote
search or mutation. An abandoned view can publish at most twenty confirmed
receipt references for fifteen minutes, never a guessed success, content,
recipient, credential or private URL. Authority replacement clears the tray.
Overview attention comes from its own authorized SQL queue and explicit cursor,
independently of the first dispatch page; links reread the actual resource.

`client-action.ts` synchronously excludes re-entry and makes every continuation
cross `view.wait()` before dependent writes, feedback, secrets or navigation.
`client-navigation.ts` owns one revision clock, including leave-and-return and
A→B→A visits. The canonical opaque authority identity includes person, workspace,
effective role/options, credential and document-policy facts. Route identity is
not a substitute for that authority revision. A stale failure cannot expire a
replacement session, and current authority refusals clear private UI models.

Application and workspace disclosure panels bind their open state to the accepted
navigation revision and current authority, rather than the route whose React
transition last finished. A menu opened after a navigation was accepted must
survive that earlier page's delayed code/render commit. A new accepted navigation
or authority replacement closes the old menu, including A→B→A; a vetoed dirty-form
intent preserves it. Main-content focus belongs to its initiating navigation and
must yield to a newer user interaction, including a pointer-opened panel on Safari
where clicking a button need not focus it. Escape, outside press, peer-panel
dismissal and normal route-focus recovery remain intact. These are local frame
rules: opening panels adds no API call or business authority. Qualify the deferred
commit boundary by deliberately holding a route module, not by adding sleeps or
weakening pointer/focus assertions.

Route acceptance guards cover both native `popstate` and its `hashchange`
acknowledgement, since WebKit/Chromium can emit the former before the latter for
a fragment change. A veto must restore the accepted address before the shared
navigation clock observes it. Fragment route rendering follows its paired native
hash acknowledgement. A focus claim survives until its transition is no longer
pending, then uses one owned render frame after the navigation clock settles.
The callback rechecks the claim, actual route, authority and visit revision,
plus the connected, current, non-inert main. New interaction, replacement or
unmount cancels it. Only one focus attempt is allowed; no timeout, polling/retry
loop, forced style flush or extra module/account request substitutes for readiness.

`client-resources.ts` shares only allowlisted collection reads in memory: five
seconds, at most sixty-four entries and 32,768 serialized characters per stored
value, partitioned by authority/locale/path. Every mutation attempt, including
an uncertain failure, invalidates lists. Identity changes abort obsolete readers;
each subscriber can cancel without cancelling another live subscriber. Detail,
readiness and approval models bypass this cache. Session bootstrap has a separate
entry-only handoff rather than becoming a long-lived authentication cache.
`client-polling.ts` pauses hidden pages, reads once on eligible visibility return
and backs off unchanged progress within its thirty-second default ceiling while
preserving an in-flight read. It polls observations, never business mutations.

Dirty Studio, distribution and schedule editors retain a synchronous route veto
while the shared navigation confirmation shows a localized question. An explicit
discard resumes the exact destination once under the same authority, visit and
editor scope; Escape preserves the draft and existing action. Workspace preflight
waits for all deferred decisions without overriding an independent hard veto,
then rechecks its original identity and visit before the membership POST.
Tab close retains native `beforeunload`. The
[clarity recovery contract](CLARITY_FOUNDATION.md#consequential-actions) owns these
client-only semantics; they create no business consent or new permission.

Browser locale packs are generated from maintained source catalogues and load
only the active French/English/German/Luxembourgish language before translated
content mounts. SSR and tooling retain synchronous source access; Belvédère has
independent per-locale packs. A catalog or route-load failure retains explicit
recovery instead of rendering another language as a successful replacement.
The [performance contract](FRONTEND_PERFORMANCE.md) records actual transfer,
requests and first useful content separately from this implementation boundary.

Three oversized areas now have explicit modules. `dispatch-pages.tsx` keeps
compatibility exports while routed overview/documents/prepare/list/detail entries
load their own module. `belvedere.tsx` composes lazy overview, workshops, members,
jobs, connections, finance and infrastructure views through shared typed data and
view components; every API read still applies platform authority. `styles.css`
imports ordered foundation, workspace, documents, operations, responsive, public
and adaptation styles. The shared frame remains shared and applications retain
their own components/styles. These splits create no server permission or request.

The manifest currently has zero import exceptions and zero design exceptions.
Chart colors, elevation and V2 frame geometry use shared tokens. Automated Axe
fixtures cover four languages and both themes alongside keyboard, modal and
responsive journeys; their actual run scope belongs in the
[lifecycle execution record](LIFECYCLE_EXPERIENCE_EXECUTION.md). Synthetic browser
checks establish neither complete accessibility nor hosted/physical-device proof.

## My documents list modules

My documents owns separate route, claim, list, reader and status modules. The
list's filters, category, sort and page size belong to its address; its cursor
stack belongs to the current account and query. A query change discards the old
page, cancels its request and disables stale pagination. The summary read runs
alongside the page; unavailable counts do not block documents. All rows keep the
shared controls, typography, color tokens and responsive geometry. The
[recipient journey](SECURE_DISTRIBUTION_JOURNEYS.md#find-documents-and-discover-services)
owns the API and authority contract.

The 10 November presentation candidate applies owner search after a 250 ms typing
pause or Enter, keeping the committed query in the URL. Navigation, category or
authority changes cancel an uncommitted search. Each title is one native link
whose target covers the row; keyboard focus and returning scroll position retain
that same link. Only available documents inside the server's expiry window gain
a warning badge. The reader keeps controls above the pages and puts optional
access history in a responsive side panel with the shared disclosure. List reads
refresh on a visible-tab return, while hidden remembered lists remain idle.

## Studio library presentation

The template, data and generation libraries use the shared empty state and native
file drop zones. **New template** names the template action; the user's library
precedes one compact row of example-copy actions and one fictional-data notice.
Template thumbnails are disposable local renders of sample data, loaded only
after their row enters the viewport. One bounded job runs at a time, with package
fonts and the existing template/resource and guarded-PDF validation. No preview
endpoint, document registration, content cache or persistent image is involved;
account/workspace replacement and unmount discard late results and revoke local
image URLs. Large, unsupported or invalid samples retain their file glyph. The
[Studio contract](TEMPLATES_DATA_DISTRIBUTION.md#local-library-thumbnails--10-november-2026-candidate)
owns the decorative limits and the distinction from a verified generated PDF.

Returning to a visible Studio library rereads its authorized list; template names,
data-import settings and selected files remain unsubmitted. Editor models are not
silently replaced by this list refresh. The ordinary public design preview exposes
Studio through the application switcher with bounded viewer-only fixtures and
read-only details. Creation, imports, template preview writes, editing, publication,
AI-policy changes and generation stay disabled; direct browser-adapter writes are
refused. [The preview contract](PUBLIC_PREVIEW.md#what-is-interactive) owns this
fictional surface and its zero-business-transport tests.

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

Application text is never set below 12 px. Stamp and postmark lettering, the
public header and the public footer keep their own sizes. The floor was applied
to the shared and application stylesheets on 10 November 2026; `npm run lint`
does not enforce it yet.

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
access and Belvédère's separate platform authority remain unchanged.
Administration's report and export routes are server-paged and browser-only;
its tables disable browser search and pagination like Belvédère's. Controls
organize rows already supplied by the authorized page; they grant no tenant
access, approval, paid operation, mandate or new REST/MCP/native capability.
Search, loaded rows and cursor state stay transient. Explicit saved views may
persist at most eight named presentation presets per authenticated person,
workspace, table and application area in bounded local storage. Each preset has
only a schema-validated sort, categorical filter choices and page size, plus its
user-supplied label; it contains no rows, recipient fields, free-text search,
cursor or credential. A changed schema drops invalid values. Missing/unrecognized
or fixture identity disables persistence rather than creating a shared account.
Belvédère's escaped authenticated-principal hint partitions platform presentation
only; it is never an API authorization input. Keep caller identity/unmount guards
intact so a new account or workspace never inherits prior records. These local
preferences are not account synchronization or business state.

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
event observed by public sharing. The 9 November candidate removes the remaining
chart-color, shadow and V2-radius exceptions in Belvédère, the film frame, the
language menu and protected reader through shared tokens. Both exception arrays
are now empty; future work must preserve that boundary.

## Checking

```
npm run lint                                   # ESLint, then the application check
node --test tests/security/check-applications.test.mjs
```

The fixture in `tests/fixtures/applications` proves that a cross-application
import, an eager application load and each design rule are refused.

## Contextual interface copy

The [interface-copy contract](INTERFACE_COPY.md) owns review of headings, captions,
state messages and source translations. The [dated audit](CLEAN_COPY_AUDIT.md)
records the 1.2.1 cleanup and qualification. Functional page names stay aligned
with navigation, while price, consent, units and recovery retain their existing
meaning. The four roles, personal/workspace boundaries, routes and application
ownership are unchanged.

## Shared clarity components — 10 November 2026 candidate

`StatTile` is the shared label/value/detail figure for Administration,
Correspondence's overview and Belvédère. Card and plain variants change only
presentation; each caller supplies already authorized values and localized text.

A loaded table below five rows hides unneeded search/pagination only while no
filter is active. Its named loaded/page count and scoped saved-view disclosure
remain available. Applying a saved filter restores search and clear-filter
recovery even for a short list; a source shrink cannot strand the filter. Counts
retain the distinction between loaded rows, the current page and full-dataset
aggregates.

The dispatch list reads `/overview` once alongside its initial list only when
`viewReports` is current in the supplied session. This adds one bounded metadata
read for truthful full-dataset status-chip counts. An unprivileged caller reads
no aggregate and displays no inferred counts. Focus refresh uses the existing
shared hook, without polling; ordinary refresh is omitted while explicit error
and extended-cursor recovery remain. No server permission, tenant visibility,
price, consent, assistant/native surface or provider operation changes.

The short-list saved-view browser regression lives in
`tests/preview-e2e/data-tables.spec.ts`; current-authority request-budget UI
fixtures live in `tests/e2e/workspace-roles.spec.ts`. These fixtures do not prove
production behavior. Exact local results and request/transfer measurements are
recorded by the final candidate qualification.
