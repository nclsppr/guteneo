# Workspace layout and V2

The 28 October loading refinement applies to both saved layouts. Requested
screen code starts alongside session verification; accepted route transitions
retain the current page until ready, preserve unsaved-work vetoes and move
scroll/focus on commit. Private reads still require current authority. Secure
document prices retain their existing padding and consent with a one-pixel
cobalt side rule. See the [loading contract and measured environment](FRONTEND_PERFORMANCE.md#route-dependencies-follow-the-requested-task).

## Classic retirement — 29 October 2026 candidate

On 29 October 2026 the product owner decided to retire the Classic layout before
the Studio space and space-switcher work. Every account now sees V2 in the
workshop and in personal documents:

- The workshop and personal shells render V2 whatever the stored
  `preferredDashboardAppearance`. My account and Account and security offer
  language and color only; the **Interface version** selector is gone.
- The stored value and the API field stay accepted for compatibility: no
  migration, no row rewrite, and the native client keeps reading it. Profile
  saves from the web omit the field, so an earlier choice remains data only.
- `?appearance=classic`, `?appearance=v2` and legacy `atelier` links still open
  the application and change nothing. The web no longer reads or writes the
  `guteneo.dashboard.appearance` browser cache.
- Classic-only presentation is removed: the top bar, application footer,
  sidebar footer and navigation sign-out, the **My account** navigation entry
  and their CSS. The V2 account menu keeps profile, color, account switching,
  service status and sign-out.
- Accounts saved as Classic, the default before 27 October, see V2 on their next
  load. No communication is sent.

Browser regressions cover the retirement: the shared fixture stores `classic` on
the demonstration accounts, and dedicated cases open old links and a stored
`classic` value in the workshop and in personal documents. Rights, consent,
REST, MCP and native contracts are unchanged. CI, publication and an
authenticated hosted check remain to be qualified for this candidate.

## Compact sidebar and account menu — 29 October 2026 candidate

A UI review measured the V2 sidebar on `b2e454c` (local simulation, Chromium,
French, administrator). At 1440 × 900 Senders, Usage, PDF checks, Billing and
Administration sat below the visible list with no cue; even 1920 × 1080 hid
Administration. **New dispatch** disappeared on Overview, Prepare dispatch and
Dispatches, moving every entry by 61 px. Documents and Templates showed two filled
blue buttons, three icons were reused and the identity block took 135 px.

The candidate keeps the same destinations, order, permissions and Classic layout:

- Desktop rows (≥ 1025 px) are 34 px with 2 px gaps and a more compact brand
  and workshop block. My documents and **New dispatch** keep 44 px; touch layouts
  keep 44 px rows. While entries remain below, a sticky fade covers the cut-off
  row; it disappears at the end of the list and in forced colors. Keyboard focus
  is drawn inside each row, as in Belvédère, because the scrolling list clips
  an outer ring.
- **New dispatch** stays in the sidebar on every page for members who can
  prepare, with the shared secondary outline. The page's own primary action
  remains the only filled button. Overview and Dispatches keep their heading copy
  only below 1025 px, where the sidebar shortcut is inside the collapsed menu.
- Each destination has one icon: Documents `FilePdf`, Secure distribution
  `FileLock`, My data `Table`, Generations `Printer`; My documents keeps `Files`
  as in the personal space. The icon list is shared, so Classic shows the same
  glyphs; its layout and actions are unchanged.
- The V2 account block is one row (initials and name) opening a disclosure
  menu: name and login email, **My profile and permissions**, the shared
  `ThemeToggle` with its visible action, **Switch account** (not in the preview),
  **Service status** and **Sign out**. The trigger reports its expanded state;
  Escape closes the menu and returns focus to it, and an outside pointer, focus
  leaving the area or a committed route change closes it. It opens upward on
  desktop, may overhang the page for long translations, and opens downward
  with 44 px items below 1025 px. V2 no longer renders the sidebar footer or the
  mobile navigation sign-out; Classic keeps both.

Measured after the change on the same fixture and browser (fr, light and dark):
the first entry stays at 234 px on Overview, Documents, Templates, Prepare
dispatch, Dispatches and Administration at 1280 × 720, 1440 × 900, 1536 × 864 and
1920 × 1080; no entry is hidden at the last three sizes; at 1280 × 720 the list
scrolls with the fade over Usage. The account row is 51 px high on desktop and
53 px on phones. Each measured screen has at most one filled action. In all four
languages every menu item fits on one line: the menu is 233–256 px wide on
desktop and 358 px at 390 px, with 36 px items on desktop and 44 px on phones.
Desktop WebKit reproduces the same entry positions, hidden entries and fade.
Captures and metrics stay outside Git with the session evidence.

Against `649ac8d`, built with the same locked dependencies, the 19 JS/CSS files
that `index.html` loads grow from 1,700,747 to 1,717,478 raw bytes and from
512,579 to 516,055 gzip bytes (level 9): +3,476, mostly the seven new Phosphor
icons. File and request counts are unchanged; no speed gain is claimed.

Local checks on the candidate: typecheck, lint and documentation checks pass.
Six application e2e files (`dashboard-v2`, `account-identity`, `locale-boundaries`,
`login-entry`, `workspace-route-performance`, `dashboard`) pass 181 cases on
Chromium, mobile Chromium and iPhone WebKit, with 2 project skips; the public
language case that needs prerendered public pages fails only on the `build:web`
development bundle and passes 3/3 on the CI-equivalent `build:live` bundle. The
preview `mobile-workspace` and `dashboard-v2` files pass 22 cases with 4 project
skips. The change adds no request, route, API field, role or authority; logout,
account switching and theme preference keep their existing contracts. CI,
publication and physical devices remain unqualified.

Historical candidate status on 14 October 2026: **V2 simplification locally validated;
exact-commit CI and publication still require qualification, with publication
authorized after validation**. Results dated 11–13 October below are historical,
separate from that candidate. V2 is a complete web workspace version, selectable
beside language in the account. It has no trial label.

## New-account default — 27 October 2026 candidate

New verified accounts, including invitation signups, persist `v2` when the user
row is created. The browser fallback also uses V2. Existing saved Classic/V2
choices remain unchanged; the original migration default is historical and no
existing row is rewritten. Both layouts remain selectable in account settings.
The server account preference overrides the browser cache after authentication.
Local regression tests cover first registration, returning Classic accounts and
blocked/invalid browser storage; exact-source publication remains separate.

Local validation on 27 October: 206 unit/integration cases passed across personal
identity, authentication, account preferences and invitations. Fifteen new browser
cases passed on desktop/mobile Chromium and iPhone WebKit emulation, covering
ordinary application entry, the create/join choice and invalid-link recovery in
all four languages. The built local page used synthetic intercepted API responses;
its desktop entry measured 37 resource entries, 629,766 transferred bytes and a
188 ms first contentful paint. Mobile Chromium measured 37/629,766/132 ms and WebKit
38/647,873/203 ms. These are single local observations, not a before/after speed
claim, a production signup or physical-device qualification. The form reuses
existing personal session/workspace endpoints and adds no business request.
Reports are outside Git under `/tmp/guteneo-onboarding-browser*`.

V2 keeps the account destination in its dedicated identity block outside the
collapsible navigation. At mobile widths its account row and, since 29 October,
the menu's profile link have a minimum 44 px height, matching navigation touch
targets. The preview regression checks exact destinations in Classic and V2,
44 px targets, account navigation and page focus, the account menu's Escape and
outside-pointer closing, and the existing menu keyboard/focus behavior. These
presentation changes add no resource request, account mutation or authority.

The mobile navigation keeps native `<details>` keyboard behavior. Escape closes
its DOM `open` property synchronously as well as the React state, then returns
focus to the summary. A native summary activation changes the DOM before its
queued `toggle` event reaches React; during that interval React may still hold
`false`, making a state-only close a no-op. A deterministic same-task regression
reproduced the open menu after Escape in both layouts on Chromium and WebKit.
The fix preserves route focus, menu destinations and touch targets, with no timer,
extra request or authority change. Source/local proof does not replace final CI.

This document and the feature map are repository-only. Never import, copy,
publish or link them in the official website. Source, tests and illustrations
prove neither remote migration, deployment nor authenticated hosted usage.

The canonical account/session contract is maintained in
[ACCOUNT_IDENTITY.md](ACCOUNT_IDENTITY.md); membership authority is maintained
in [WORKSPACE_ROLES.md](WORKSPACE_ROLES.md). This page owns V2 presentation,
appearance-specific behavior and dated evidence rather than duplicating those
complete contracts.

## Current presentation — 25 October 2026

The release from `03daa4136de8999cc79018f33f2a22038917c621` removes decorative `DashboardArtwork` panels and their
swallows from overview, empty Documents and the assistant introduction. The
component is retired; historical artwork/provenance below remains a record of
its earlier candidate. Official identity, actual document previews, controls,
metrics, dates, consent and permission-specific recovery remain. No replacement
illustration, business API, role or activation is introduced.

System/light/dark appearance now follows the shared browser preference in
[THEMES.md](THEMES.md), with visible keyboard/forced-color states and royal-blue
browser chrome. That choice is independent of the saved `classic`/`v2` workspace
version: choosing dark mode neither changes the account's workspace version nor
writes its profile. The existing account save and temporary version-override
contracts below remain unchanged.

Personal documents start from their personal session without waiting for a
workshop bootstrap, and discard obsolete workspace/account results across
navigation. [FRONTEND_PERFORMANCE.md](FRONTEND_PERFORMANCE.md) owns that lifecycle,
regression protocol and bounded local timing evidence. The initial presentation/loading changes were published from that release.
The personal-space and Belvédère alignment below is a subsequent source change;
older illustration measurements and release proof do not qualify it.

## Email preparation geometry — 25 October candidate

V2 keeps its existing 10 px enclosing-panel and 7 px control radii. The protected
link choice, protected-delivery review summary, email preview and PDF viewer frame
participate in that same panel rule; they no longer inherit square Classic framing alongside
rounded V2 panels. The actual PDF page and customer-authored email/document content
retain their original paper geometry. Classic presentation remains unchanged.

This CSS refinement adds no component, business request or eager dependency. It
preserves document selection, password actions, exact-cost review, consent,
keyboard behavior and the four-language form. Measured browser observations
belong to this candidate; earlier V2 performance or production proof cannot
qualify these new selectors. The behavior source is `dashboard-v2.css`, with
protected-email regression coverage in `tests/e2e/protected-email.spec.ts`.

The synthetic Chromium comparison covered 1440, 768 and 390 px widths in light
and dark themes. Previously square protection/summary/email frames measured
0 px; the candidate measures 10 px, with no observed horizontal overflow or page
errors in those six views. A built local Chromium run at 1440 × 1100 px used
fictional intercepted business responses and measured 50 resource entries,
1,009,646 transferred bytes and four API GETs (session, capabilities, documents,
senders) after PDF selection and message entry. Its single first-contentful-paint
sample was 236 ms. These are candidate observations, not evidence of a speed gain
or a production-performance qualification; the CSS change introduces no additional
module or request. Nine existing localized-control and protection-duration/price
cases passed across desktop Chromium, mobile Chromium and iPhone WebKit. These
synthetic browser checks establish preserved form behavior, not real sending or
physical-device qualification.

## Scope and entry

V2 uses the signed-in account, current workspace, actual data available to
that person and existing operations. It creates neither fictional copies nor
a parallel business environment. Session, current membership, resource rights
and server capabilities remain required.

Presentation covers navigation, overview, documents, dispatch preparation/
review/tracking, assistants, account, Studio, PDF verification, credits, tables and forms.
Belvédère shares the V2 visual vocabulary while retaining its separate platform
authority and read-only data. Business
contracts remain unchanged.

Preserve the official portrait and lowercase `guteneo` wordmark: ink-black
`#181b22` on light surfaces and the approved ivory `#f6f5ef` on dark surfaces,
using the original transparent portrait with white paper confined inside its
actual inner blue frame. The exterior and perforations remain transparent,
without an outer white contour or a cartouche behind the wordmark.
[Brand identity](BRAND_IDENTITY.md) owns the exact shared roles. Small restored
public-page swallows do not enter authenticated application views.
The current candidate mounts no decorative DashboardArtwork panel. Historical
engraving placements and resource measurements below describe the earlier version. For workspaces with dispatch history,
alerts and recent activity precede the introduction; metrics remain subject
to reporting rights. Assistants become a compact shortcut. Empty workspaces
retain the full welcome. Review content precedes approval actions in reading
and keyboard order.

## Personal documents and account customization — follow-up

Superseded on 29 October 2026 by the Classic retirement: personal documents now
always use V2, and account customization offers language and color only. The
earlier contract follows.

The personal documents application applies the same authenticated account's
saved `preferredDashboardAppearance`: Classic keeps its compact top navigation,
while V2 uses the workshop's sidebar, account utilities, page geometry and shared
controls. The personal shell remains independently loaded and works without any
workshop membership or workshop bootstrap. Both layouts expose the same documents,
services, account/security and sign-out routes. The header/page appearance action
is the shared single light/dark icon; color and layout preferences remain separate.

Both authenticated personal layouts fill the available viewport width, including
1920 px and 3440 px displays, with no outer maximum-width frame. Retain responsive
gutters and the V2 sidebar; document lists use the available main area. The public
site's 1440 px frame remains separate. Narrow internal text, 780 px form fields
and 950 px document-page previews retain readable measures instead of constraining
the shell. Small-screen navigation and content must fit at 320 px and 390 px.

Personal account customization reuses the workshop's small preference controls
for language, system/light/dark color and Classic/V2 layout, with matching identity,
profile and session panels. It does not import the full workshop account page.
Explicit layout edits use the existing Origin/CSRF-protected personal account
PATCH, apply only after success and reconcile the returned authenticated identity.
Failed saves retain the draft for correction without changing the saved layout.
Changing a name or language alone must not accidentally save a temporary URL
layout override. No migration, new API or assistant authority is introduced.

Regression sources include `tests/e2e/personal-appearance.spec.ts` and
`tests/e2e/personal-document-performance.spec.ts`; executed results and hosted
proof remain separate from the source contract. The existing saved-layout
regression checks full-shell geometry, gutters and overflow in both layouts and
palettes at 1920/3440/320/390 px; this changes no read, save or authority contract.
Local production-built synthetic fixtures passed 27/27 personal appearance cases
on 25 October 2026 across Chromium, mobile Chromium and iPhone WebKit, including
those sixteen geometry combinations in the existing save/reload regression.
No page overflow occurred; no authenticated production account was mutated.

## Navigation and action clarity — 14 October 2026

V2 no longer repeats a section title above the page title or displays an
application footer. The official logo stays at navigation top; workspace name
has its own block. Account utilities retain person name/email; the role and
rights are detailed on My account rather than repeated throughout the shell
or overview. Active navigation and main
heading serve distinct purposes and remain.

### Form and navigation corrections — 25 October 2026 candidate

My documents is a compact navigation entry into the personal space, using the
shared `.personal-context-link` in Classic and V2. The 27 October source candidate
uses a one-pixel blue outline, ink label, existing blue icon and minimum 44 px
target on desktop and inside the mobile navigation. It keeps its personal-space
accessible description and existing destination without a separate oversized
card. The rule adds no asset, request, route, session read or authority; it keeps
the independently authenticated personal entry. Rendered checks and publication
remain separate from this source contract. The account page
continues to show the current workshop role and permissions; operational access
and permission-specific recovery messages still follow server authority.

Shared `FileInput` controls author the chooser and empty-state text in the
resolved interface language, independently of the browser's language. They keep
the native file input for keyboard access, file restrictions, validation and
exact original bytes. Literal filenames are never translated. PDF, template,
dataset, campaign and invitation imports share the control.

Workspace selects use an authored face and explicit control height, including
desktop Safari. Protected-link explanations sit below the expiry field with
positive spacing. Pointer activation does not leave a native blue outline;
keyboard focus uses a visible two-pixel ink outline. Selected dispatch channels
and checked options retain visible ink states. Forced-colors mode retains the
native select arrow. These presentation changes grant no authority, prepare no
dispatch and change no consent or price.

The consumption page offers stored monthly history rather than implying that
an empty current month means an empty account. Its read contract and accounting
boundaries are documented in [welcome credit](WELCOME_CREDIT.md).

Local synthetic browser evidence and static checks are recorded in
[executed verification](TEST_RESULTS.md). Production read-only observation
confirmed a nonzero balance with an empty current-month view; publication of
this candidate and authenticated verification after release remain separate.

**Service status** joins **Switch account** in identity utilities, at navigation
bottom on desktop and accessible with the mobile menu closed; since 29 October
both sit in the V2 account menu. **Times shown:
…** announces browser timezone near dated lists/sections instead of a distant
footer. It uses the existing display timezone, changing neither stored times
nor account preference.

Details retain contextual back links. Global **New dispatch** is secondary
navigation. Since 29 October it keeps one outlined place on every V2 page, so
the entries below never move; Overview and Dispatches repeat it in their heading
only below 1025 px, where the shortcut opens with the collapsed menu. Primary
action belongs to the current page/step and differs from back/read/global
shortcuts. Summaries, explicit consent and rights remain; button styling creates
no authority.

On **Generations**, **Create a document** remains primary. The introduction
explains finding generated PDFs and that generation sends nothing. Exact PDF
IDs/versions/details remain in the detail journey. Template and preparation
entries serve different tasks and remain permission dependent.

These changes target V2; Classic retains its shell. Labels exist in FR/EN/DE/LB.
No illustration, API, business request, automatic retry, provider resource,
migration or permission is introduced. Private-document access and server guards remain. The later 25 October
artwork-removal candidate above supersedes the earlier engraving placement.

### Candidate qualification

| Evidence                                                     | State at implementation                                                                                                                                                                                  |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Source, feature map and permission matrix                    | Affected journeys updated; generation/check passed: 21 domains, 183 features, 22 journeys                                                                                                                |
| Desktop/mobile navigation, titles, actions and dates         | 18/18 browser cases passed, no failures/skips/flakes, on desktop/mobile Chromium and iPhone WebKit; 15 root routes in Classic/V2 at each project's viewport and 320 px; no physical-device inference     |
| Roles, detail return, account/status with menu closed        | Included in 18 cases: permissions, explicit consent, persistence, returns, account outside closed mobile menu, primary action/timezone with populated list; local simulation API or fixtures by scenario |
| Local checks                                                 | Typecheck, lint, web build and feature map passed; 40/40 locale/appearance unit tests without failure/skip                                                                                               |
| Local visual verification                                    | Generations at 1440 × 1000 and 390 × 844, overview at 1025 × 900 inspected; consistent landmarks/actions/account areas                                                                                   |
| Exact-commit CI                                              | Qualify on PR and merged commit before publication                                                                                                                                                       |
| Postpublication fingerprint, served assets and human session | Verify separately after authorized deployment                                                                                                                                                            |
| Cost/resources                                               | Six bounded local trials: same 9 simulated API reads, one fewer static asset, no request during 10 s idle; loaded JS/CSS +836 gzip bytes. Limits below; no hosted Worker CPU/billing measurement         |
| Real communication, provider activation/debit                | None needed for presentation qualification                                                                                                                                                               |

Final local results remain outside the repository at
`/tmp/guteneo-v2-clarity/dashboard-v2.json` (18 cases, 76.7 s) and `unit.json`
(40 tests). `desktop-generations.jpg`/`mobile-generations.jpg` document local
visual review. Simulation tests, public-asset checks and authenticated
verification are distinct evidence classes. No old success proves the current
commit; local qualification implies neither CI nor publication.

### Candidate resources — local measurement on 14 October

Comparison against `b12ef2c4789b2acfcbc7de63a7fb846d61910050`, rebuilt from a
clean `main` clone with unchanged locked dependencies. Candidate: final
14 October web build at 13:12, captured before measurement with file fingerprints
and source-diff SHA-256
`c436508125be761b736212c521fdb739abfc17d6a5af8371b2bcd99702dec06a`.
That diff still matched source afterward; subsequent changes invalidate it.

Three cold-cache trials per V2 variant, alternating order, Chromium
`153.0.8010.12`, 1440 × 1000, French, Europe/Paris. Journeys: empty overview,
empty documents, synthetic generation and assistants. All API reads use
intercepted fixtures; external origins/non-GET methods are blocked. Files
are served only at `127.0.0.1:4481/4482`, then servers stop. No backend,
provider, private document, dispatch or subscription is used.

| Median of three trials                               | Base V2         | Candidate V2    |
| ---------------------------------------------------- | --------------- | --------------- |
| Startup to visible title, fonts/initial images ready | 138.1 ms        | 129.9 ms        |
| Controlled journey including four 500 ms pauses      | 2,155.0 ms      | 2,147.3 ms      |
| Renderer work at journey end (`TaskDuration`)        | 133.5 ms        | 129.6 ms        |
| Renderer work at startup                             | 99.2 ms         | 91.6 ms         |
| JavaScript heap at journey end                       | 6,623,332 bytes | 6,614,704 bytes |
| Renderer work during 10 s idle                       | 0.572 ms        | 0.659 ms        |
| Journey requests, including simulated API reads      | 36, including 9 | 35, including 9 |
| Requests during 10 s idle                            | 0               | 0               |

No JavaScript error, failed HTTP response or forbidden request attempt in six
trials. Removed asset: compact footer emblem `brand/guteneo-mark-128.webp`
(8,798 bytes); the principal official portrait remains loaded. Eight actually
loaded JS/CSS files grow from 1,782,877 to 1,786,178 raw bytes (**+3,301**) and
524,152 to 524,988 gzip bytes (**+836**). Across all twenty build chunks,
delta is +3,291 raw/+838 gzip bytes; that includes chunks absent from these
four journeys.

Three trials per variant prove neither CPU savings nor production latency
improvement. Host load is uncontrolled; no network/CPU throttling, small
corpus. `TaskDuration` measures renderer, not hosted Worker; JS heap excludes
native memory, decoded images and GPU. Journey times include two seconds of
pauses and are not user-task latency. Idle observation lasts only ten seconds.
Gzip sums compare builds; production Brotli/cache differ. No billable hosted
request, Worker memory or invoice is measured. This change adds no service,
binding, polling or provider call. Historical prices/measurements below are
not reassigned to this candidate.

Scripts, file manifests, source diff, base-build log, raw trials and summary
remain outside the repository at `/tmp/guteneo-v2-clarity/resources/`, including
`measurements.json`/`summary.json`. This controlled evidence is distinct from
navigation scenarios, final-commit CI and authenticated postpublication
qualification.

## Document-review stability

On mobile, Classic/V2 review presents PDF before consent. Its preview frame
retains fixed height while the module loads, pages render or an error displays.
The document scrolls inside it, including keyboard scrolling. PDF controls
and download remain available. Dispatch review and the document page above paid
PDF-verification consent use this frame. Other previews retain their layout.

This prevents a PDF loading midgesture from moving the targeted checkbox.
The issue was reproduced with a local document response held between pointer
down/up: 281 px vertical movement and unchecked consent before correction.
Regression holds the response through the gesture and checks position/consent
in Classic/V2. Existing explicit-approval/same-dispatch recovery assertions
remain. The full file passes 36/36 cases on desktop/mobile Chromium and iPhone
WebKit: 12 new/24 existing, without automatic retry. Full Tab order is checked
in Chromium; WebKit checks frame exit, scrolling and Space activation of the
focused button because native Tab skips some controls. This is not physical
iPhone keyboard evidence. Reports/captures:
`/tmp/guteneo-v2-qa/stable-review/final.json` and `final/`.

Document access remains subject to current rights for all four roles; preview
grants no approval permission. PDF bytes/renderer, consent, fingerprints,
requests and idempotency are unchanged. Native/REST/MCP acquire no action;
native/assistant browser-review returns use the same frame. Read errors remain
explicit and grant no consent.

This presentation fix adds no illustration, request, endpoint, polling, binding
or hosted resource. Cost figures below remain dated measures of their stated
candidate, not the fix; they still do not measure hosted Worker CPU.

## Selecting the version in account settings (historical)

Superseded on 29 October 2026 by the Classic retirement: the selector and the
temporary override below no longer exist. This section records the earlier
contract.

The desktop account block sits at left-navigation bottom and remains accessible
on mobile, retaining actual identity, current role, profile and account switching.

1. Open **My account** from the block (in V2, open the account menu first);
   Classic also retains Account navigation.
2. In **My profile**, choose **Classic** or **V2** under **Interface version**,
   beside language.
3. Select **Save changes**.
4. After server success, apply appearance and show **Your profile has been saved.**

Selection only prepares a profile edit. Persistence/application follows
successful `PATCH /api/account`; failure remains explicit. Appearance never
authorizes sending or resets documents/dispatches. It follows the same person
across memberships/sessions/devices on authenticated session reread, not
another user sharing the browser. Language remains independent; both can save
together. Labels are available in all four languages.

Canonical appearance entry points are:

- `https://guteneo.com/?appearance=v2#/app`;
- `https://guteneo.com/?appearance=classic#/app`.

`appearance` is a **temporary presentation override**, not a profile write.
Legacy `atelier` links are accepted inbound for compatibility. Save explicitly
in My account for persistence. Only successful saving after explicit appearance
selection removes the override; name/language-only saving neither persists
nor removes it. The selector shows saved account preference, not temporary
override. Detected identity change also drops an old override; other parameters
and route remain.

## Server contract and reconciliation

| Item                  | Contract                                                                                                                                     |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Values                | `classic`/`v2`, `packages/contracts/src/dashboard-appearance.ts`                                                                             |
| Durable storage       | Personal `users.preferred_dashboard_appearance`, not organization preference                                                                 |
| Migration             | `0053_user_dashboard_appearance.sql`; historical SQL default `classic`, `CHECK` on both values; new account inserts explicitly persist `v2`                                              |
| Browser reads         | `user.preferredDashboardAppearance` in `GET /api/session` and `GET /api/account`                                                             |
| Write                 | Optional `preferredDashboardAppearance` in existing strict `PATCH /api/account` body                                                         |
| Authority             | Current browser session, Origin/CSRF; older clients may still change their own value, the web no longer offers it                            |
| Target                | Session identity/workspace; no body `userId`/`organizationId` targeting                                                                      |
| Omitted field         | Preserves preference, including older name/language clients                                                                                  |
| Audit                 | `account.updated`, changed field names without values/document data                                                                          |
| Refusal               | Invalid value/unknown field: `INVALID_INPUT`; invalid CSRF: `CSRF_REJECTED`; revoked authority: `ACCESS_CHANGED`, no partial update          |
| Authenticated account | Session rereads preference; same user retained across workspace switching, different identity reconciled                                     |
| URL                   | Ignored since the Classic retirement; old `appearance` and `atelier` links open V2 without persistence                                       |
| Browser cache         | No longer read or written; old `guteneo.dashboard.appearance` entries are ignored                                                            |
| Unavailable cache     | Not applicable since the Classic retirement                                                                                                  |
| Unavailable history   | Not applicable since the Classic retirement                                                                                                  |

Before the retirement, the cache contained appearance only: no content,
recipient, token or signed URL. Existing session
reads are reused; no polling/real-time cross-tab synchronization. Remote
changes appear on a new session read, including tab return. Account responses
remain private `Cache-Control: no-store`; preference crosses same-person
memberships without sharing content/rights/private documents. Mutation/audit
recheck authority in the existing transaction.

## Rights, consent and other clients

The four human roles remain those in `packages/contracts/src/roles.ts`;
a connected assistant is a distinct OAuth actor, not a fifth membership role.
All browser roles may save their own appearance. Existing resource access,
preparation, independently optional supervisor approval/reporting, administrator
management and assistant member/scope/mandate restrictions remain those in
[WORKSPACE_ROLES.md](WORKSPACE_ROLES.md).

Review binds immutable content, recipient, options, cost and fingerprint;
presentation is not consent. Acceptance/reservation/outbox remain atomic.
Unknown provider outcomes require reconciliation without automatic retry.
Preparation/send requests gain no appearance field; only profile/session
schema extends. Business REST, scopes, MCP tools and mandates remain unchanged.
OAuth tokens do not become browser sessions; no assistant tool edits appearance.

Native session/account reads also expose `preferredDashboardAppearance`, but
the native client offers no V2 setting and `PATCH /api/mobile/v1/account`
rejects it. Existing native language PATCH preserves it. Authenticated browser
review uses personal preference; native gains no approval/send right.

This delivery authorizes its assistant to perform neither real communication,
channel activation, mandate grant/extension nor server-check bypass. See
[API_CONTRACT.md](API_CONTRACT.md) and [ACCOUNT_IDENTITY.md](ACCOUNT_IDENTITY.md).

## Journeys and recovery

| Journey                                     | Expected result                                                  | Error/recovery                                                                             |
| ------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Login/tab return                            | Actual identity/current workspace/personal appearance reconciled | Normal Auth0 recovery; no other-user private data                                          |
| Account → language/version → save           | Same person; durable preference after success                    | Network/CSRF/authority failure explicit; no invented success                               |
| Appearance link                             | Temporary override without profile PATCH                         | Unknown parameter ignored; save explicitly for persistence                                 |
| Workspace switch                            | Same preference, current membership rights/data                  | No previous-workspace privilege retained                                                   |
| Account switch                              | Returned account preference; old override discarded              | Old local cache never presented as new account preference                                  |
| Documents → preparation → review → tracking | Same resources/requests/guards, new presentation                 | Existing quarantine, quote-expiry, closed-channel, permission and unknown-outcome recovery |
| Studio/PDF verification/credits             | Coherent presentation, unchanged authority                       | No appearance-created subscription/quota/debit/transfer                                    |
| Assistant → browser review                  | Same scopes/consent, browser preference                          | No added tool, mandate or implicit consent                                                 |

Journeys/matrix are also maintained in [feature-map.json](feature-map.json).
Public mockup remains fictional/backend isolated; its settings change no
server account. It retains simulation banners, as do genuinely simulated
sessions. Removing real V2's experimental label removes no simulation cue.

## Historical illustrations and resources — 11–14 October 2026

These resources describe the earlier illustrated V2. Their source assets and
provenance are retained, but the 25 October candidate no longer mounts the
retired DashboardArtwork component or loads its decorative panels for those
routes. Do not reuse these historical transfer figures as a current benchmark.

Three illustrations were generated with actual `image_gen`, then resized/
WebP encoded. Masters/prompts/fingerprints: `assets/brand/dashboard-v2/`.
The official portrait was not regenerated.

| Served asset                                               | Dimensions | Bytes   | Export verification           |
| ---------------------------------------------------------- | ---------- | ------- | ----------------------------- |
| `apps/web/public/brand/dashboard-v2/atelier.webp`          | 1280 × 853 | 158,328 | Original/440 px use inspected |
| `apps/web/public/brand/dashboard-v2/documents.webp`        | 1280 × 960 | 75,294  | Original/320 px use inspected |
| `apps/web/public/brand/dashboard-v2/pdf-verification.webp` | 1280 × 427 | 105,592 | Original/600 px use inspected |

Display evidence: `/tmp/guteneo-v2-qa/artwork/`, outside the repository.
Decorative images have empty alt text on opaque ivory; no consent/delivery
information is embedded. The PDF verification illustration evokes Luxembourg without claiming geographic
accuracy. Business information/document previews remain separate accessible
content.

The engravings total 339,214 bytes. Two decorative swallows reuse official
72,336-byte `luxembourg-blue-swallow-sheet.webp` without animation. A journey
loading all four resources consumes 411,550 bytes excluding headers.
Engravings use `loading=lazy`/`decoding=async`; the CSS sprite has no guaranteed
lazy loading. Classic mounts none of these decorations.

## Resource and cost qualification — 13 October 2026

The configuration reuses existing Worker/D1: zero newly provisioned service,
container or instance, no size/sleep/cron/queue-consumer change. It adds neither
periodic polling nor on-demand image generation. Focus-return session
reconciliation predates the PR. This avoids dedicated presentation infrastructure
without proving zero cost.

### Reproducible local measurement and limits

Comparison: `1e5ab18a464adfdb22af85d71f291600149ff330` against
`7ffff9e242d8e1359716d7f93908567726be50f0` with reviewed swallow supplement
(diff SHA-256
`3ec28206ce4595d8756cc496174f83056c9a1f69768059477f35d84ca06a838b`).
Separate production Vite builds, identical locked dependencies, Chromium
153.0.8010.12 on macOS arm64, 1440 × 1000, three trials/variant. Each opens a
fresh context, visits empty overview → empty documents → connections, then
idles ten seconds. Eight API reads use identical fictional interceptions;
all writes/external destinations are forbidden. No backend/provider is called.

| Median of three local trials                         | Base Classic | Candidate Classic | Candidate V2 |
| ---------------------------------------------------- | -----------: | ----------------: | -----------: |
| Startup to visible title/fonts ready, ms             |        112.7 |             121.4 |        121.4 |
| Chromium renderer `TaskDuration`, full journey, ms   |        112.1 |             110.5 |        118.1 |
| Controlled journey including three 500 ms pauses, s  |        1.627 |             1.635 |        1.641 |
| End-of-journey JavaScript heap, decimal MB           |         6.55 |              6.54 |         6.56 |
| Renderer work during ten idle seconds, ms            |        0.675 |             0.715 |        0.485 |
| Browser requests, including eight synthetic API GETs |           30 |                30 |           34 |
| Extra requests during ten idle seconds               |            0 |                 0 |            0 |

Zero JavaScript/HTTP errors in nine trials. V2 adds four resources: three
engravings and sprite. Actually loaded shared JS/CSS chunks, including API,
add 5,062 JS and 14,619 CSS raw bytes, totaling +4,243 gzip bytes. Static imports
also affect Classic/public pages. Three trials justify no CPU-gain claim.
Renderer `TaskDuration` is not Worker CPU; JS heap excludes native memory,
decoded images/GPU. Empty corpus without network/CPU throttling qualifies
neither large workspaces, phones nor production latency. Controlled duration
includes 1.5 s pauses and is not user latency.

A second measurement runs actual account/session handlers against two isolated
Miniflare databases with migrations and synthetic user/workspace/session.
Three runs/operation, outside global HTTP middleware. `.first()` uses the same
`.all()` query to preserve D1 metadata without logging bound SQL, identity
or content.

| Local operation                                                                | Base: statements / rows read / written | Candidate: statements / rows read / written |
| ------------------------------------------------------------------------------ | -------------------------------------- | ------------------------------------------- |
| GET session                                                                    | 1 / 4 / 0                              | 1 / 4 / 0                                   |
| GET account                                                                    | 4 / 7–8 / 1–2                          | 4 / 7–8 / 1–2                               |
| Minimal `preferredLocale` PATCH, plus candidate `preferredDashboardAppearance` | 6 / 13 / 5                             | 7 / 15 / 6                                  |

Measured joint-save delta: one UPDATE, two rows read, one written. UI retains
one PATCH then session reread, without an extra round trip. Cumulative local
SQL time is 0–1 ms/operation, too coarse to infer gain/regression. Median
handler wall times are 5.0 / 19.8 / 23.5 ms for base and 5.0 / 18.7 / 27.8 ms
for candidate; they include Node/Miniflare bridging, not billable CPU.

`wrangler deploy --dry-run --config wrangler.live.jsonc` passes: Worker bundle
4,071.63 KiB, gzip 935.93 KiB. Dry-run publishes nothing and supplies **no**
Worker startup time. Active Worker CPU, memory, hosted cold startup,
active/idle time, D1 rows and actually billed requests remain **unknown before
publication**. Retain deployment-reported Wrangler startup and subsequent
Cloudflare metrics separately; HTTP time is not CPU. Infer no resource/sleep
change from browser benchmarks.

Sources/reproduction/raw output outside repository:
`/tmp/guteneo-v2-qa/cost-qualification/measure.mjs`, `measurements.json`,
`d1-measure.mts`, `d1-measurements.json`, `swallow-source.diff`, build logs and
`worker-dry-run.log`. Vite uses `VITE_PUBLIC_PREVIEW=false` with separate
`base-bundle`/`candidate-bundle` outputs; rerun browser script with Node and D1
script with locked repository `tsx`. Scripts retain exact fixtures/bounds,
without actual database/session access.

### Prices, shared allowances and per-operation cost

Official prices checked **13 October 2026**, USD before tax, assuming Workers
Paid/Standard: $5/account/month minimum; 10 million requests and 30 million
CPU-ms included, then $0.30/million requests and $0.02/million CPU-ms.
Wall time is not billed as CPU. Other account usage shares allowances;
remaining allowance and any Enterprise contract are not established here.
[Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/).

D1 Paid includes 25 billion rows read, 50 million written and 5 GB/month;
overage $0.001/million reads, $1/million writes, $0.75/GB-month. Indexes/other
databases share allowances. One extra column does not alone multiply read
rows; observe physical size/migration cost instead of assuming seven billed
bytes/user. [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/).

**Images are not assumed exempt from Worker requests**:
`wrangler.live.jsonc` sets `assets.run_worker_first: true`. Each network download
passes through the app Worker even for static assets; network-avoiding browser
cache may avoid that invocation. Assets storage has no documented added cost.
[Static Assets billing](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/).

After shared allowances are exhausted, a cold journey loading four decorations
adds `4 × 0.30 / 1,000,000 = 0.00000120 USD` in request cost. At **1 ms Worker
CPU/asset**, an unmeasured assumption, requests+CPU total $0.00000128/journey;
at **10 ms**, $0.00000200. That is $1.28/$2.00 per million such journeys,
neither cap nor invoice. Warm cache, viewport/shorter journey change it.
Existing API/request, storage, provider and whole-account costs are excluded.

The measured joint language/appearance-save D1 delta, `+2 reads, +1 write`,
corresponds outside allowances to
`2 × 0.001 / 1,000,000 + 1 / 1,000,000 = 0.000001002 USD`, or $1.002/million
comparable saves, **before CPU/storage**. Appearance-only saves retain full
PATCH/session-GET cost; the delta does not make them free. Complete profile,
workspace cardinality and remote D1 metrics may differ from the minimal fixture.

This qualification supplies a bounded budget/explicit limits, not an invoice.
Publication must preserve service scope and reconcile hosted observations
with period metrics; unavailable values remain unknown. V2 requires no new
instrumentation, content collection or provider permission activation.

## Sources and evidence

| Source                                                                 | Role                                                                                 |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `packages/contracts/src/dashboard-appearance.ts`                       | Shared values/default                                                                |
| `migrations/0053_user_dashboard_appearance.sql`                        | User column/constraints                                                              |
| `apps/api/src/account.ts`, `auth.ts`, `mobile.ts`                      | Browser save, account/session reads, native boundary                                 |
| `apps/web/src/App.tsx`, `account-page.tsx`, `personal-space.tsx`       | V2 shells; account saves without a layout field                                      |
| `apps/web/src/workspace-identity.tsx`, `theme-toggle.tsx`              | Account menu at navigation bottom                                                    |
| `apps/web/src/dashboard-v2.css`                                        | Current workspace styles and shared theme tokens; `dashboard-artwork.tsx` is retired |
| `apps/web/src/dispatch-pages.tsx`, `assistant-workspace.tsx`           | Daily hierarchy, review, assistants                                                  |
| `apps/web/src/locales/messages-dashboard-v2.json`                      | FR/EN/DE/LB translations                                                             |

Earlier evidence is retained without extending it to server preference:

- Before the last scope change, full Vitest passed 2,052 tests in 108 files.
- The previous navigation-direct version control passed 14 preview/9 application
  cases; account settings replaced it, so those 23 do not qualify the final
  journey.
- Earlier 7 bootstrap unit tests/62 release-security tests alone do not prove
  personal saving.

| Historical qualification, 11–13 October 2026                                                        | State                                                                                                                                         |
| --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Account/session, migration, roles, OAuth/CSRF refusal, revocation/native read                       | 91 targeted local tests: 27 `tests/unit/account.test.ts`, 47 `tests/unit/auth.test.ts`, 17 `tests/integration/mobile.test.ts`                 |
| Bootstrap, temporary URL, unavailable storage/translations                                          | 7/7 `tests/unit/dashboard-appearance.test.ts` passed                                                                                          |
| Isolated mockup: account control, language proximity, four languages, reading/mobile order          | 14/14 passed: 8 V2, 6 baseline; desktop/iPhone WebKit without business backend                                                                |
| Local app: personal save, fresh browser, name-only forced URL, draft, consent, roles/account bottom | 15/15: five scenarios on three browsers; local simulation API/intercepted sessions by scenario                                                |
| Fifteen workspace routes at 320 px including Studio/PDF verification/credits                        | Included in Classic/V2 app suite; overflow/account access checked, no physical-device qualification                                           |
| Narrow navigation, long identity, fax quote/PDF and test-interception closure regressions           | 122/122 after fixes: 105 on three browsers, 17 additional iPhone WebKit; quote/PDF captures reviewed                                          |
| Historical quote migration with new user schema                                                     | 16/16; fixture copies four historical-schema columns without changing business assertions                                                     |
| Transient local test-database lock                                                                  | 18/18 bounded-reset tests, 5/5 Chromium V2 scenarios; only explicit `SQLITE_BUSY` retries idempotent reset, never scenario/business operation |
| Preview/live builds                                                                                 | Passed after navigation/name-only-save fixes; `release-build-preview.log`, `release-build-live.log`                                           |
| Typecheck/lint                                                                                      | Final run passed after final changes; `/tmp/guteneo-v2-qa/release-lint.log`                                                                   |
| Developer feature map                                                                               | Generation/sync passed: 20 domains, 166 features, 21 journeys                                                                                 |
| Full Vitest                                                                                         | 2,052/2,052 in 108 files before final changes; 91 targeted after profile extension, no renewed full-suite proof                               |
| Release security                                                                                    | 62 `main-only-release`/`preview-release-assets` passed before account extension; release code unchanged, bounded evidence                     |
| Manual local account                                                                                | French/V2 selected/saved, historical `atelier` parameter removed, route retained/subsequent pages use server V2; simulation API only          |
| Stable PDF review, consent, error, multipage/keyboard                                               | 36/36 `protected-email.spec.ts` cases across three projects; typecheck/lint/web build passed. Fix CI pending.                                 |
| Exact-commit CI                                                                                     | PR #61: 13/13 green on `207cf04`; merged main `54639e7`: iPhone PDF-stability failure during consent. Publication held for fix/new-main CI.   |
| Remote D1 migration/canonical deployment                                                            | Not performed for that candidate at writing                                                                                                   |
| Authenticated human use on actual data/other devices                                                | Not qualified by local tests                                                                                                                  |
| Real communication/provider delivery                                                                | None performed                                                                                                                                |

Account reports outside repository:
`/tmp/guteneo-v2-qa/account-preview-results.json` (14 cases, 9.1 s),
`/tmp/guteneo-v2-qa/account-app-results.json` (15 cases, 51.6 s), zero failures,
skips or flakes; HTML: `/tmp/guteneo-v2-qa/account-app-html/`. Build logs share
the evidence folder and do not prove publication.

Follow-up checks after initial CI:
`/tmp/guteneo-v2-qa/ci-fix/focused-results.json`,
`/tmp/guteneo-v2-qa/ci-fix/iphone-regressions.json`,
`/tmp/guteneo-v2-qa/trusted-fax-quotes-v2.json`. Web build/typecheck/full lint
also passed afterward; local results do not replace final-commit CI.

Fresh-browser tests qualify local server-preference reread with the same
identity, not two actual devices on hosted service. Scenarios distinguish
D1/queue simulation from intercepted rights/surface projections. They verify
that name-only edits from a V2 link do not save temporary appearance and
preserve preparation/consent/fingerprint/idempotency contracts. Simulation/
projections are neither communication, provider proof nor physical-iPhone
qualification.

### Waiting for profile-save confirmation

Review-fix CI also exposed a temporary-V2-link test race. The helper awaited
PATCH headers then appearance already active through URL, not save completion.
Trace: URL assertion starts at 81,015.604 ms, before full body arrives at
81,047.457 ms. A later capture shows save confirmation.

The helper now awaits visible **Your profile has been saved.**, displayed
after response, appearance application and account reread. URL/payload/server-
preference assertions remain. No arbitrary delay, scenario retry or account-code
change. This test synchronization changes no role/right/business operation.
All fifteen `dashboard-v2.spec.ts` cases then pass on three browsers, with lint/
diff checks; report `/tmp/guteneo-v2-qa/account-save-sync/final.json` outside
repository.

### Preserving input when an auxiliary read fails

A late contacts-directory error could steal profile-field focus before text
insertion. Held-contact-response reproduction: 404 → focus moves to alert →
input lost; valid response → text retained/save available. Incomplete-workspace
test fixture unintentionally omitted that second endpoint.

The directory now keeps its accessible alert/retry without automatic focus.
This option is local to `WorkspaceContacts`; action errors retain default
`ErrorNotice` behavior. Role fixture returns valid contacts and explicitly
checks entered name. A separate Classic/V2 regression triggers failure while
editing without account write, checking focus/input/recovery. Permissions,
private data, native/MCP surfaces remain unchanged.

The new scenario fails on the old build precisely after alert display/focus
loss. With the fix, full `account-identity.spec.ts` and `workspace-roles.spec.ts`
pass **69/69** on three browsers, including twelve Classic/V2 × server-error/
malformed-response focus regressions. Keyboard input resumes without
refocusing; retry reloads contacts without account write. Web build/typecheck/
lint/diff pass. Outside-repository reports:
`/tmp/guteneo-v2-qa/workspace-form-diagnostic/red.json`, `verified.json`.
This local evidence replaces neither final-commit CI nor authenticated hosted
qualification.

## Publication and return

On 13 October 2026 the user authorized PR merge and publication after validation.
That does not replace final-candidate/merged-commit CI. Apply/verify remote
`0053_user_dashboard_appearance.sql` before publishing code reading the new
column; follow [MAIN_RELEASE.md](MAIN_RELEASE.md) from clean synchronized
`main` with exact verified commit. The former application `workers.dev` host
and application preview URLs remain closed; parallel publication there does
not replace the canonical journey.

Separately verify D1 migration, CI, manifest/served assets on `guteneo.com`,
then authenticated human journey/account persistence. That historical publication did not
enable V2 by default; the 27 October candidate above changes new-account creation. Saving **Classic** in My account restores the old
presentation durably; `?appearance=classic#/app` returns temporarily without
changing server preference. Appearance reversal deletes no data or dispatch.

## Document email presentation — 26 October 2026 candidate

New individual PDF emails default to account access in My documents. The shared
control uses existing V2 panel/control geometry; the attachment remains an
explicit choice. The review freezes the final HTML, access policy, recipient and
quote. Custom HTML may place its own styled `{{document_url}}` anchor; default
content uses the workshop name and the actual document title as a quotation.

The email uses ivory paper, an ink lowercase wordmark, a white 10 px panel,
serif heading/quotation and a blue 7 px action. Small underlined footer links
explain Guteneo and open recipient controls. Four-language sanitized templates
were checked at desktop and 320 px width without overflow or remote resources.
The preference page reuses the shared public header and complete footer. Email
client CSS support remains separate from local Chromium/WebKit rendering.

Local fixtures passed 90 email/UI scenarios and 12 preference scenarios across
Chromium, mobile Chromium and iPhone WebKit emulation, including two successive
recipient links in one tab. Screenshots and reports are outside Git in
`/Users/nclsppr/Documents/Codex/Reports/guteneo-account-email-2026-10-26/`.
See [measured loading](FRONTEND_PERFORMANCE.md) and the authoritative
[recipient feedback lifecycle](EMAIL_RECIPIENT_FEEDBACK.md). This is source and
local fixture evidence, not production deployment or real email delivery.

## Nested capability diagnostics — 26 October 2026 candidate

The account-email content-limit metadata adds a deeper object to the current
administrator's `/admin` diagnostics. The prior recursive two-column grid imposed
a 90 px label minimum plus gap at every level. CI on `e805b10` exposed page width
1,316 px at a 1,280 px viewport; a local Classic reproduction reached 1,307 px.
The exact path was `capabilities.channels[].content.accountDelivery.contentLimits`:
its leaf DD values had zero width and their spans escaped the viewport. This is
a layout observation, not a new diagnostic-data or permission failure.

The shared stylesheet preserves outer key/value columns and stacks nested rows.
Every current authorized key/value remains visible and wraps within its parent.
Classic and V2 retain the same scoped read-only administration data, normal
loading/retry, keyboard navigation and account access. No API request, native/MCP
authority, migration, provider action or activation gate is added.

Sources: `apps/web/src/styles.css` and the existing `Diagnostics` renderer in
`workspace-pages.tsx`. The unchanged all-routes responsive test in
`tests/e2e/dashboard-v2.spec.ts` covers each appearance at its native width and
320 px; request/transfer/useful-content observations are recorded in
[frontend performance](FRONTEND_PERFORMANCE.md). The failed CI artifact remains
in the external evidence directory; local repair and final CI are separate proof.
