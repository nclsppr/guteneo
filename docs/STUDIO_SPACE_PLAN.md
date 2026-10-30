# Studio space and space switcher plan

The consolidated 29 October reprise separates application and workspace selection.
[Current implementation and acceptance](STUDIO_SPACE_REPRISE.md) supersede the
earlier combined-switcher mockups and incomplete implementation table below;
[WEB_APPLICATIONS.md](WEB_APPLICATIONS.md) owns the four-application boundary.

Design plan dated **29 October 2026**. It records interface design and decisions only: no
application code, migration, communication or publication. The French working draft used for
the decision stayed outside Git.

Bases:

- measurements on `origin/main` `b2e454c`; `main` later reached `b131196` (focus styles in
  PR #102, dependency maintenance in PR #112) with no effect on this plan;
- presentation baseline: commit `b78b1d4` from the parallel V2 sidebar session (branch
  `claude/nostalgic-noyce-408fa2`, not merged, tests and documentation pending).

Measurements are single local observations: simulation demo, Chromium in the desktop app's
browser pane, fictional administrator `Camille · Demo`, temporary `?appearance=v2`. They are
neither hosted nor physical-device evidence. Figures based on `b78b1d4` are **calculated** from
its CSS values, not measured.

## Summary

- **Studio** becomes a space of the same workspace: same session, roles and V2 shell. It holds
  Templates, Data (formerly My data) and Generations. Studio authors; Workshop sends.
- A **space switcher** at the top of the sidebar replaces the organization block, the My
  documents link, the Switch workspace form on My account and the personal Use Guteneo detour
  (choose a workspace, then reload). The top of the sidebar says **where** the person works;
  the `b78b1d4` account menu at the bottom says **who** they are.
- The **Workshop** navigation drops from 15 entries to at most 9 (administrator). With the
  34 px rows of `b78b1d4`, everything fits at 1280×720 with about 115 px to spare
  (calculated); 44 px rows would still leave about 25 px.
- First-class handoffs: Send these PDFs (Studio → Workshop) and Open in Studio (generated PDF →
  Studio).
- Classic is retired in a separate, earlier pull request (decision D1).
- No MCP, scope, role or ChatGPT plugin change. REST is unchanged except the optional
  Belvédère indicator (D8). Server-generated links keep working.

## Findings

### Measured on `main` (V2, administrator)

| Viewport | Navigation area | Visible entries | Hidden entries |
| --- | --- | --- | --- |
| 1440×900, Overview | 565 px (content 782) | 10 | Senders, Usage, PDF checks, Billing, Administration |
| 1280×720, Overview | 384 px | 7 | 8, including **Dispatches** and Campaigns |
| 1280×720, Templates (with New dispatch) | 384 px (content 843) | 6 | 9 |

Fixed chrome: 335 px (brand 60, organization block 52 + 14, account block 135 because Switch
account and Service status wrap onto two lines, Sign out 40, padding 34). Classic at 1280×720
scrolls the whole sidebar (1,245 px for 720) and shows 9 of 16 entries.

Other verified findings: Administration is one 16,356 px page with seven sections; Usage and
Billing both open with the same credit panel; Switch workspace already exists on My account
(`GET /api/account/workspaces`, `POST /api/account/workspace`, no reload); the personal space
reloads the page after `POST /api/personal/workspace/select` (`personal-space.tsx`,
`window.location.reload()`). No Studio route is referenced by the API, MCP, integrations or
documentation, only by the web application and its tests.

### Brought by `b78b1d4` (baseline)

- 34 px rows with a 2 px gap above 1,024 px, 44 px below; a bottom fade while the list
  scrolls.
- Distinct icons shared with Classic: Documents `FilePdf`, Secure distribution `FileLock`, Data
  `Table`, Generations `Printer`; My documents keeps `Files`.
- New dispatch is always present as a secondary (outlined) button; on desktop its copy in the
  Overview and Dispatches headings is hidden.
- A one-row identity (avatar and name) opens a menu: profile and permissions, theme, switch
  account, service status and sign out. The V2 Sign out footer disappears.
- Compact chrome: 18/10 px padding, 56 px brand, 42 + 10 px organization block, 51 px account
  block.

## Principles

1. Studio and Workshop share `/api/session`, its CSRF token and the membership: no new
   authority and no extra bootstrap. My documents keeps its independent personal session;
   Belvédère keeps its host and guard.
2. One shell: the workspace sidebar and the personal sidebar (today two implementations,
   `App.tsx` and `personal-space.tsx`) become one component with brand, switcher, navigation
   and account-menu slots.
3. Context at the top, identity at the bottom: the switcher changes space or workspace; the
   account menu changes person, theme or session.
4. Studio authors, Workshop sends: any form that chooses recipients, channels, senders or
   ceilings belongs to the Workshop.
5. No speculative read: neither the switcher nor the account menu reads anything on page load.

## Spaces

| Space | Content | Session | Root |
| --- | --- | --- | --- |
| Workshop | send, approve, track, configure | workspace | `/app` |
| Studio | templates, data, generations | workspace (the same one) | `/app/studio/templates` |
| My documents | received documents, saved copies | personal | `/app/my-documents` |
| Belvédère | read-only platform oversight | dedicated host | `https://belvedere.guteneo.com/` |

## Space switcher

Closed: a 44 px button in place of the organization block, with the `b78b1d4` geometry:
workspace initial, space name, workspace name (Personal space for My documents) and a chevron.

Open: a non-modal panel anchored below the button.

```
┌───────────────────────────────────┐
│ Atelier Gutenberg                 │
│   Workshop                      ✓ │
│   Studio                          │
├───────────────────────────────────┤
│   My documents                    │
├───────────────────────────────────┤
│ Other workspaces                  │
│   P  Papeterie Moselle            │
│   +  Create or join a workspace   │
├───────────────────────────────────┤
│   Belvédère ↗          (Watcher)  │
└───────────────────────────────────┘
```

Split with the account menu:

| Action | Switcher (top) | Account menu (bottom, `b78b1d4`) |
| --- | --- | --- |
| Workshop, Studio, My documents | yes | no |
| Another workspace, create or join a workspace | yes | no |
| Belvédère | yes (Watcher) | no |
| Profile and permissions, theme | no | yes |
| Switch account (another Auth0 identity) | no | yes |
| Service status, sign out | no | yes |

Behavior:

- Workshop ↔ Studio is a route change with no session reread.
- Another workspace uses the existing `POST /api/account/workspace` and lands at the root of
  the **same space**, because identifiers belong to one workspace. Before the call, the
  switcher dispatches the existing cancelable `BEFORE_WORKSPACE_NAVIGATION` event so an unsaved
  template editor can refuse.
- From My documents: direct navigation when the current workspace session matches; otherwise
  `POST /api/personal/workspace/select`, then entry into the chosen space. Remove the full
  reload only after verifying and measuring remount by route.
- The workspace list is read on first opening (`GET /api/account/workspaces`); the personal
  session already contains it.
- Accessibility follows the `b78b1d4` account menu: `aria-expanded`/`aria-controls` button,
  Escape closes and restores focus, outside click and route change close it, native links and
  buttons, `aria-current="true"` plus a check mark on the current space, a
  `<nav aria-label="Spaces">` panel and 44 px touch targets. The two panels never stay open
  together.
- The public preview keeps a static block, without Studio or My documents, as today.
- Belvédère appears only when the server says so (an identity-derived boolean in session
  responses, D8). Inside Belvédère, the same slot holds a plain guteneo application link with
  no client read.

## Navigation mockups (desktop, 258 px)

```
WORKSHOP (administrator)        STUDIO                         MY DOCUMENTS
┌──────────────────────────┐    ┌──────────────────────────┐   ┌──────────────────────────┐
│ ▣ guteneo                │    │ ▣ guteneo                │   │ ▣ guteneo                │
│ ┌──────────────────────┐ │    │ ┌──────────────────────┐ │   │ ┌──────────────────────┐ │
│ │A Workshop          ▾ │ │    │ │A Studio            ▾ │ │   │ │CD My documents     ▾ │ │
│ │  Atelier Gutenberg   │ │    │ │  Atelier Gutenberg   │ │   │ │   Personal space     │ │
│ └──────────────────────┘ │    │ └──────────────────────┘ │   │ └──────────────────────┘ │
│ ( + New dispatch       ) │    │ » Templates              │   │ » Documents              │
│   Overview               │    │   Data                   │   │                          │
│   Dispatches             │    │   Generations            │   │                          │
│   Campaigns              │    │                          │   │                          │
│   Secure distribution    │    │                          │   │                          │
│ » Documents              │    │                          │   │                          │
│                          │    │                          │   │                          │
│   Senders                │    │                          │   │                          │
│   Assistants             │    │                          │   │                          │
│   Usage                  │    │                          │   │                          │
│   Administration         │    │                          │   │                          │
│ ──────────────────────── │    │ ──────────────────────── │   │ ──────────────────────── │
│ CD Camille · Demo      ⇕ │    │ CD Camille · Demo      ⇕ │   │ CD Camille · Demo      ⇕ │
└──────────────────────────┘    └──────────────────────────┘   └──────────────────────────┘
```

`( … )` is the outlined secondary button; `»` marks the current entry. Studio and My documents
have no New dispatch. In My documents, Account and security moves into the account menu, as My
account did in the V2 workspace; Use Guteneo appears only without a workspace (D9).

Account menu (`b78b1d4`, opens upwards on desktop):

```
┌───────────────────────────────────┐
│ Camille · Demo                    │
│ camille@example.invalid           │
├───────────────────────────────────┤
│ My profile and permissions        │  (Account and security in My documents)
│ Switch to dark mode               │
│ Switch account                    │
│ Service status ↗                  │
├───────────────────────────────────┤
│ Sign out                          │
└───────────────────────────────────┘
```

Mobile (up to 1,024 px): row 1 holds the brand and the switcher; row 2 the navigation
disclosure and, in Workshop only, New dispatch; row 3 the account trigger, which opens
downwards and stays visible with the menu closed. Studio stays listed on phones for viewing,
data entry and PDF checks; the template editor already explains that visual editing needs a
desktop screen.

## Reduced Workshop navigation

| Entry | Routes covered (`aria-current`) | Visible to |
| --- | --- | --- |
| Overview | `/app` | everyone |
| Dispatches (awaiting-approval badge, D10) | `/app/dispatches`, `/app/dispatch/…`, `/app/prepare`, `/app/postal/…`, `/app/distribution/…` | everyone |
| Campaigns | `/app/campaigns`, `/app/campaign/…` | everyone |
| Secure distribution | `/app/secure-distributions…`, `/app/secure-distribution/…` | as today |
| Documents (Library · PDF checks tabs) | `/app/documents`, `/app/pdf-checks`, `/app/plan` | everyone |
| Senders | `/app/senders` | everyone |
| Assistants | `/app/connection…` | everyone |
| Usage (Billing tab for administrators; credit panel shown once) | `/app/usage`, `/app/billing` | administrator; supervisor with reporting |
| Administration (Team · Channels · Operations · Diagnostics subpages) | `/app/admin`, `/app/admin/…` | administrator |

Entry counts: administrator 9, supervisor 7–8, operator 7, observer 7. The 10 px group gap of
`b78b1d4` remains only before Senders.

The French label `Consommation et facturation` measures 187 px for 177 px available, and
`Verbrauch und Abrechnung` 175 px for 151 px on compact desktop; hence the short Usage label.

Fit at 1280×720, calculated from `b78b1d4` CSS (189 px chrome, 531 px navigation area, New
dispatch 44 + 8 px, 28 px end fade):

| Case | 34 px rows | 44 px rows |
| --- | --- | --- |
| Workshop, administrator (9 entries and New dispatch) | 416 px, 115 spare | 506 px, 25 spare |
| Workshop, supervisor with reporting (8 and New dispatch) | 380 px, 151 spare | — |
| Workshop, operator (7 and New dispatch) | 344 px, 187 spare | — |
| Studio (3) | 136 px | — |
| My documents (1–2) | at most 100 px | — |

For reference, the throwaway prototype measured on `main` (same list, less compact chrome) cut
the last row by 15 px at 44 px rows and left 25 px at 40 px rows. Implementation must measure
the final version: the last entry fully visible at 1280×720 for every role.

## Handoffs between spaces

- **Studio → Workshop**: on a generation, Send these PDFs (n) replaces Prepare distribution (n)
  and opens `/app/distribution/new?generation=<id>` in the Workshop. Navigation state carries
  the selection; without it, all verified PDFs are shown and editable. The created plan keeps
  `/app/distribution/<id>` (unchanged URL, now under Dispatches) with a back link to the
  generation. For a single result, Send this PDF opens `/app/prepare?document=<id>` (existing).
  The form currently lives in the Studio module: measure its cost and move it to its own
  module if the Workshop loads too much code.
- **Workshop → Studio**: the switcher; the Overview and Documents links to create from a blank
  page or use a template; Open in Studio on a PDF opened from a generation
  (`&generation=…&record=…` in the URL, no new API call). A universal link needs a document
  origin exposed by the API, and therefore MCP and plugin changes: optional phase 2 (D12).

## URLs, aliases and `aria-current`

| Previous | New |
| --- | --- |
| `/app/templates` (keeps `?new=blank`) | `/app/studio/templates` |
| `/app/template/<id>` | `/app/studio/template/<id>` |
| `/app/datasets` | `/app/studio/datasets` |
| `/app/dataset/<id>` | `/app/studio/dataset/<id>` |
| `/app/generations` | `/app/studio/generations` |
| `/app/generation/<id>` | `/app/studio/generation/<id>` |
| `/app/studio` | `/app/studio/templates` |
| — | `/app/distribution/new` (new, Workshop; matched before `/app/distribution/<id>`) |

Aliases are permanent `history.replaceState` rewrites that keep the query and make no network
request. The segment stays `datasets`, the same noun as the API and MCP. One central route table
(`app-routes.ts`) provides space, aliases, current entry and preloading. It replaces the three
current copies of the route expressions (V2 sidebar, Classic sidebar, loader).

## Classic retirement (decided)

The user decided on 29 October 2026 to retire Classic in a separate pull request before the
shell work:

- the web renders V2 for every account in the workspace and personal documents, and the
  account's interface-version selector disappears;
- the stored `preferred_dashboard_appearance` value and API field stay accepted for
  compatibility, with no migration or row rewrite; `?appearance=classic` and the legacy
  `atelier` parameter no longer change the layout;
- Classic-only CSS, top bar, footer and tests are removed;
- `AGENTS.md`, `DASHBOARD_V2.md`, `ACCOUNT_IDENTITY.md`, `WORKSPACE_ROLES.md`,
  `docs/feature-map.json` and the engineering design-system guide are updated in that pull
  request;
- accounts saved as Classic, the default before 27 October, see V2 on their next load; no
  communication is sent without explicit authorization.

## Edge cases

- Switching workspaces never infers a workspace from a URL; a link to another workspace's
  object keeps the existing not-found state. When another tab switches workspace, the
  focus-return reread lands at the root of the current space (today always `/app`).
- An account without a workspace sees My documents and Create or join a workspace; the
  account menu is unchanged.
- An observer reads the Studio according to sharing, without creation or Send these PDFs.
- My account loses its Switch workspace form, replaced by the switcher.
- Labels to correct: the editor's `Studio documentaire` navigation name becomes
  `Sections du modèle`; `Quitter le studio et perdre…` becomes `Quitter ce modèle et perdre…`;
  `Ouvrir le studio` becomes `Modifier le modèle`; the workspace hint that imports data into
  the document studio names the Studio.
- Demo: `Studio Papier · Simulation` becomes `Papeterie Moselle · Simulation`, with an entry
  button for the Papeterie. The `org_studio` and `user_studio` identifiers stay. An idempotent
  `UPDATE` in `scripts/seed.sql` renames existing local databases. Tests that quote the name
  change with it (`tests/e2e/dashboard.spec.ts`, `journeys.spec.ts`, `login-entry.spec.ts`,
  `tests/distribution-e2e/fixtures.ts`, `personal-account.e2e.ts`).
- Server links that must keep working: `#/app/pdf-checks` (MCP capabilities), `#/app/billing`
  (Stripe return), `#/app/account` (expert mandate), `#/app/documents`, `#/app/dispatch/…`,
  `#/app/postal/…`, `#/app/secure-distribution…` and `#/app/my-documents`. All keep their URL.

## Naming

| FR | EN | DE (review) | LB (review) |
| --- | --- | --- | --- |
| `Atelier` | Workshop | `Werkstatt` | `Atelier` |
| `Studio` | Studio | `Studio` | `Studio` |
| `Mes documents` | My documents | `Meine Dokumente` | `Meng Dokumenter` |
| `Données` | Data | `Daten` | `Donnéeën` |
| `Consommation` | Usage | `Verbrauch` | `Verbrauch` |
| `Envoyer ces PDF (n)` | Send these PDFs (n) | `Diese PDFs senden (n)` | `Dës PDFe schécken (n)` |
| `Ouvrir dans le Studio` | Open in Studio | `Im Studio öffnen` | `Am Studio opmaachen` |
| `Envoi groupé` (plan title, formerly `Distribution préparée`) | Batch dispatch | `Sammelversand` | `Sammelversand` |
| `Changer d’espace` (switcher accessible name) | Switch space | `Bereich wechseln` | `Beräich wiesselen` |

Existing labels stay as they are: Templates, Generations, Dispatches, Campaigns, Secure
distribution, Documents, Senders, Assistants, Administration, Create or join a workspace and
the account-menu entries. In French, `atelier` names both the organization and the sending
space; the switcher's second line, the workspace name, removes the ambiguity. German and
Luxembourgish currently use two words for the organization (`Arbeitsbereich`/`Werkstatt`,
`Aarbechtsberäich`/`Atelier`); harmonize them during translation review.

## Unchanged

Roles and permissions (`packages/contracts/src/roles.ts`), REST routes, MCP tools and
annotations, OAuth scopes, expert mandates, the native app and the ChatGPT plugin. The only
API addition considered is the Belvédère indicator in session responses (D8).

## Proposed implementation, after approval

0. Merge `b78b1d4` (V2 sidebar session) first, then retire Classic in its own pull request.
1. Shared shell, central route table and switcher, with no visible architecture change beyond
   the top of the sidebar.
2. Studio space, `/app/studio/…` routes and aliases, the Data rename and the handoffs.
3. Workshop grouping: Documents and Usage tabs, Administration subpages.
4. Demo rename and tests: keyboard, four languages, 1280×720 per role, 320/390 px, aliases,
   editor veto and no read on load. Record loading measurements and update
   `docs/feature-map.json`, `DASHBOARD_V2.md`, `TEMPLATES_DATA_DISTRIBUTION.md`,
   `ACCOUNT_IDENTITY.md`, `WORKSPACE_ROLES.md`, `DEMO.md` and the design-system guide.

## Implementation status

On 29 October 2026 the user asked to merge what was ready and continue with this
plan, so the recommendations below are applied unless a row says otherwise.

| Step | State |
| --- | --- |
| 0. V2 sidebar | Merged in #116 |
| 0. Classic retirement | Pull request #118 |
| 1–2. Route table, space switcher, Studio space, Data rename, aliases | Pull request stacked on #118; the switcher keeps its workspace list per identity, so a list read for another account, workspace or authority is never shown |
| 2. Handoffs | Pending: Send these PDFs still opens the plan form inside the generation; Open in Studio is not built |
| 3. Workshop grouping | Pending |
| 4. Belvédère entry and demonstration rename | Pending |

One deviation from the mockups: the workshop keeps its current order, with
Assistants immediately after Overview, because [the assistant hub](ASSISTANT_HUB.md)
requires it. Without the Studio entries, an administrator's eleven entries and New
dispatch still fit at 1280 × 720.

## Decisions

| # | Decision | Status |
| --- | --- | --- |
| D1 | Classic future | **Decided 29 October 2026: retire it in an earlier pull request** |
| D2 | Switcher form: one menu, or visible Workshop · Studio tabs in addition (would now fit at 720 px, but adds a second control) | Applied: one menu |
| D3 | Batch-dispatch preparation (`/app/distribution/…`) in Workshop or Studio | Workshop: plans already highlight Dispatches; moving the form is pending |
| D4 | Location of this plan | **Decided 29 October 2026: English in `docs/`** |
| D5 | `/app/studio/…` URLs with aliases | Applied |
| D6 | Row height | Aligned with `b78b1d4`: 34 px above 1,024 px, 44 px below |
| D7 | Usage label with a Billing tab | Recommended: yes |
| D8 | Belvédère in the switcher through a server indicator | Recommended: yes |
| D9 | Use Guteneo only without a workspace | Applied |
| D10 | Awaiting-approval badge on Dispatches | Recommended: phase 2, after measuring its read cost |
| D11 | Papeterie Moselle demo name | Recommended: yes |
| D12 | Universal Open in Studio (API, MCP and plugin) | Recommended: phase 2 |
| D13 | Remember the last space and screen | Recommended: phase 2 |

Rows still marked recommended are applied when their step is built.
