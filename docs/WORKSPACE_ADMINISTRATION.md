# Workspace administration

## Administration application — 3 November 2026 recovered candidate

Administrators manage their workspace in a dedicated **Administration**
application instead of their personal profile or the Correspondence
navigation. It reuses Belvédère's reading vocabulary (period presets, figures,
daily activity, channel/state breakdowns, server-paged tables) for one workspace
only, and adds downloadable CSV, Excel and PDF reports. This is a source
candidate: no deployment, provider activation or hosted qualification is claimed.

### Authority

| Viewer                                       | Views                                                                                               |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Administrator                                | Every view: overview, activity, consumption, reports, members, access, audit log, billing, settings |
| Supervisor with report permission            | Overview, activity, consumption and reports (full report without member data, activity and consumption exports)                 |
| Supervisor without reports, member, observer | None. The application is not offered; a direct address shows the role notice and issues no read     |

- Authority is the **current membership** of the authenticated browser session.
  Every `/api/administration/*` read recomputes permissions from the membership
  row; a session whose cached role no longer matches is refused with
  `MEMBERSHIP_CHANGED`. Bearer/OAuth/MCP and native callers are refused with
  `BROWSER_REQUIRED`: assistants cannot read administration reports or exports.
- Every statement binds the membership's organization. No parameter names a
  workspace; the existing workspace switcher changes the session first.
- Routes are read-only, except that each export records one `report.exported`
  audit entry (dataset, format, period and row count, never exported values).
  Role changes, access revocation, invitations, channel controls, billing and
  renaming keep their existing endpoints, CSRF and audit guarantees.

### Navigation and moved pages

`/app/administration` hosts the application. Earlier addresses are aliases that
keep links, bookmarks and the Stripe portal return working, with their query:

| Earlier address        | Now                               | Content                                                                                      |
| ---------------------- | --------------------------------- | -------------------------------------------------------------------------------------------- |
| `/app/admin`           | `/app/administration/members`     | Members, roles, supervisor options, access revocation, invitations, member activity          |
| `/app/usage`           | `/app/administration/consumption` | Posted consumption plus the former usage ledger and activity calendar                        |
| `/app/billing`         | `/app/administration/billing`     | Unchanged billing page                                                                       |
| Profile workspace name | `/app/administration/settings`    | Workspace name, channel controls, PDF analysis warm-up, incidents, dead letters, diagnostics |

The personal profile (`/app/account`) keeps the person's own name, language,
appearance, sessions and assistant delegation, and only displays the workspace
and role. Correspondence no longer lists Usage, Billing or Administration. The
application switcher offers Administration to administrators and to supervisors
with report permission in workspace and Belvédère sessions; the server rechecks
either way. My documents and Use Guteneo offer it from the personal-session
projection, which carries a server-computed `canViewReports` per membership
(4 November 2026): the same `workspacePermissions` rule as the workspace
session, read from the current membership row on every personal-session read.
A supervisor with report permission therefore finds Administration there too;
removing the permission or the membership removes the entry at the next
personal-session read, and the Administration API refuses in the meantime.
The hint grants nothing and adds no workspace read to the personal entry.
Without a workspace session, the entry goes through
`/app/services?next=/app/administration`: Use Guteneo preselects **Manage a
workspace**, lists only memberships whose projection allows reports, rotates
the workspace session for the chosen one and opens Administration. Only known
destinations (preparation, new share, Administration pages) are accepted as
`next`, with their query; anything else falls back to the workspace home.

### Period and response lifetime

Presets and custom UTC periods live in the address. Malformed, reversed or
unbounded URL dates fall back to the last 30 days. A manually entered range
longer than 366 days instead keeps both fields and reports a localized validation
error without changing the address or reading another report. API validation
still refuses invalid ranges. Presets and browser Back reset the visible date fields
to that address. A period or query change hides old results immediately and
aborts its obsolete read. Report refreshes hide previous metadata while the
server rechecks authority; errors cannot retain an already loaded report.
Workspace/account changes remount the application. Export requests are aborted
at navigation, when their period, member-management permission or identity changes, and even a
transport ignoring abort cannot trigger a late download.

Consumption has one refresh action. It rereads both the period summary and the
embedded monthly ledger/calendar without duplicating a second refresh button.
Start/end date labels, responsive controls and the application switcher use the
shared four-language resources.

### Views

- **Overview**: a primary row (dispatches, consumption, needing attention,
  promotional credit) above a secondary row (members, imported documents,
  activated secure shares); daily activity (dispatches, consumption, sign-ins)
  with an equivalent data table; channels; states linking to the filtered
  activity; incident notices. Simulation is stated once by the workspace
  notice, not repeated per page.
- **Activity**: every dispatch of the period, filtered on the server by channel,
  state, "needing attention" or reference, 50 per page. Columns: reference,
  creation, channel, state, pages, coarse destination country, consumption,
  reservation, approver. The reference opens the existing Correspondence detail.
- **Consumption**: posted charges by service, channel and month, using the same
  ledger semantics as Belvédère's finance view (production: settled ledger and
  hosting by charge date; simulation: confirmed reservations), current
  dispatch and PDF-check reservations and promotional credit, followed by the monthly usage ledger.
- **Members**: the existing member administration and invitations, plus member
  activity (active access, last sign-in, approvals in the period, last recorded
  action).
- **Access**: open browser/native sessions and assistant authorizations, and
  recorded sign-ins (90-day retention). Revocation stays in Members.
- **Audit log**: action, actor, resource identifier and time. `details_json` is
  never projected because it can contain message or recipient context.
- **Reports**: downloads for the chosen period.

### Exports

`GET /api/administration/exports/:dataset?format=csv|xlsx|pdf&from&to&locale`

| Dataset       | Permission    | CSV                 | Excel                                                                                       | PDF                                             |
| ------------- | ------------- | ------------------- | ------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| `report`      | reports       | refused (one table) | Summary, channels, states, activity, charges, and for administrators members, access, audit | Same, charges summarized by service/channel/day |
| `activity`    | reports       | Activity            | Activity                                                                                    | Activity                                        |
| `consumption` | reports       | Every posted charge | Service, channel, day and every charge                                                      | Service, channel, day, charges                  |
| `members`     | administrator | Members             | Members                                                                                     | Members                                         |
| `connections` | administrator | Access and sign-ins | Same                                                                                        | Same                                            |
| `audit`       | administrator | Audit log           | Audit log                                                                                   | Audit log                                       |

- Contents are metadata only. Recipients, subjects, document titles, message
  bodies, supplier costs and connection countries are never exported.
- Amounts are computed from integer minor units into exact decimal strings
  (no floating-point rounding); Excel cells carry them as numbers with a money
  format and refuse values beyond its 15-significant-digit precision, directing
  the user to exact CSV. JSON reports refuse unsafe integer aggregates. Times are UTC. The exports preserve the ledger amounts; they are not
  tax invoices and do not assert one uniform tax basis across different services.
- An export is refused with `EXPORT_TOO_LARGE` when a dataset or the combined
  file exceeds 10,000 rows (including summary tables), a cell exceeds 4,096
  characters, or cumulative raw text exceeds 4 MiB. CSV/Excel keep every row
  within those limits. PDF draws at most 500 rows across the whole file and
  explicitly states shown/total counts for every omitted table, pointing to
  Excel or CSV. The budget is shared: every table receives up to the same
  share, so small tables print whole and the largest ones divide the rest
  (the local fictional report with 809 dispatches and 235 audit entries
  prints about 145 rows of each large table, never "0 of N"). Narrow the period or choose an
  individual dataset to recover.
- CSV is UTF-8 with a byte-order mark, CRLF and quoted fields. Cells starting
  with `=`, `+`, `-`, `@`, tab or carriage return are prefixed with `'` so a
  spreadsheet never evaluates a member name or reference as a formula.
- Excel is genuine Office Open XML (inline strings, frozen header, filters),
  zipped with the existing pinned `fflate`. Column widths follow the longest
  label or value (10–60 characters). The report summary stores counts as
  integers, amounts as money numbers and the generation time as a UTC
  date-time cell, so spreadsheets can compute with them.
- PDF uses `pdf-lib` Helvetica while every drawn string is WinAnsi. When a
  workspace name, member, actor or other drawn value is not, the file embeds
  the pinned Roboto font already bundled for document templates
  (`packages/templates/font-coverage.json`, SHA-256 checked by
  `scripts/build-administration-pdf-font.mjs --check`) through `fontkit` 2.0.4,
  loaded lazily only for such files. Latin Extended, Greek and Cyrillic then
  render; characters outside that font (for example CJK) still become `?`.
  Columns are sized from their content (headers wrap onto two lines, values
  keep one line and are shortened with an ellipsis only when the page is too
  narrow); headers repeat on each page. The header localizes its punctuation,
  period dates and generation time (four-digit year, 24-hour UTC clock).
- Headers follow the account language (fr/en/de/lb). Excel/PDF also localize
  coded values; CSV preserves the original codes for machine use. Responses
  are `private, no-store`, `noindex`, `no-referrer`, attachment-only and are
  fetched through the session, never through a shareable URL.
- Simulation workspaces are labelled in the summary, the PDF header and the
  file name (`-simulation`), keeping simulated and real evidence apart.

### Belvédère scope decision

Belvédère stays the publisher's platform control tower under its separate
Watcher authority. It is not opened to workspace administrators:

- Its reads are deliberately cross-tenant (all workspaces, global finance,
  supplier costs, Cloudflare infrastructure). Opening it would require scoping
  every query by tenant on a surface designed for the opposite, so a single
  missed filter would leak other customers' data.
- Its authority (pinned verified identity, signed evidence, dedicated host) is
  stronger and narrower than a workspace role; mixing both on one surface would
  make each harder to reason about.
- Administration provides the tenant-scoped counterparts, with exports, under
  ordinary membership authority. Presentation is shared through the shared
  `activity-chart.tsx` (daily chart, figures, breakdown bars), never queries.
  Belvédère can adopt that shared presentation later without changing its
  authority.

### Sources and proof

API `apps/api/src/administration.ts`, `administration-exports.ts`,
`locales/administration-exports.json`; contract
`packages/contracts/src/administration.ts`; web `apps/web/src/administration*.ts(x)`,
`activity-chart.tsx`; moved `billing-page.tsx`, `team-invitations.tsx`,
`invitation-csv.ts`, `usage-activity.tsx`.

[The dated evidence record](evidence/workspace-administration-2026-11-03.json)
binds the local source, browser assets and API qualification. The three
`administration*.test.ts` suites pass 22 tests covering migrated Miniflare D1,
two fictional workspaces, permission matrix, late role/session revocation,
production-mode synthetic posting-date ledger semantics, 10,000/10,001 export
bounds, exact money, unsafe-integer refusal and serializers. A further 27 client,
route and billing tests cover URL dates, obsolete exports and old addresses.
Independent openpyxl reads the actual 10,000-row workbook; actual local workerd
renders the 500-row PDF, whose last included/first omitted row and notice are
verified from decoded text. The browser qualification and measured loading path
are detailed in [frontend performance](FRONTEND_PERFORMANCE.md).

[The 4 November 2026 record](evidence/mydocuments-administration-2026-11-04.json)
adds the personal-session report hint, the services-bridge destinations, the
preview fixtures and the export readability changes. Real files downloaded from
a local workerd server (fictional workspace, 809 dispatches, members named in
Turkish, Polish/Czech and Russian) were opened with macOS Quick Look: CSV, the
Excel summary/activity/members sheets and PDF first, middle and last pages in
French, German and Luxembourgish. Unit tests decode the PDF text with pdf.js
and check the embedded font is absent from WinAnsi-only files. Native
Excel/LibreOffice/Acrobat acceptance is still not claimed.

### Known gaps

- No hosted, production-data or physical-device qualification. Independent
  openpyxl reads verify the 10,000-row workbook, but native Excel/LibreOffice and
  Acrobat acceptance remains unqualified. Local Node memory/timing measurements
  do not qualify the deployed Worker memory limit.
- The public preview derives overview, activity, consumption, members, access
  and audit from its own fictional workspace (`preview-administration.ts`,
  same permission split as the server; large generated volumes refuse with
  `PREVIEW_ADMINISTRATION_DEFAULT_ONLY`). Its export buttons are disabled and
  say so: the preview has no server to generate files.
- PDF Unicode cost, measured once in local Node 24 for a 500-row, 14-column
  activity export: WinAnsi-only files keep the main-branch cost (about
  190 ms, 80 MB RSS growth, 161 KB); a file needing the embedded font takes
  about 340 ms, 99 MB RSS growth and 241 KB. The Worker bundle grows from
  5,131 to 6,033 KiB (gzip 1,141 to 1,411 KiB), within Cloudflare's compressed Worker size limits. Deployed Worker memory and
  CPU limits remain unqualified for that path.
- Activity does not attribute a dispatch to its preparer (dispatches record no
  creator); it shows the approver. Connection countries are not shown to
  administrators.
- Belvédère still renders its own chart; adopting the shared presentation is a
  separate change.
