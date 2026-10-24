# Interface languages

Repository source, comments and documentation are authored in English.
Frontend/video localization is the exception; see
[repository standards](REPOSITORY_STANDARDS.md). URL paths, fragments and API
identifiers remain English regardless of displayed language. This document's
dated qualification sections are historical evidence, not renewed release
claims.

Presentation films and the role-guide film also follow resolved language and
personal preference. Every language has its own MP4/poster; language changes
stop previous playback. `AGENTS.md` records this rule. See `HOMEPAGE_FILM.md`
and `ROLES_FILM.md` for sources/regeneration. Such additions remain local
candidates until published with corresponding code.

The 22 September 2026 local candidate supports French (`fr`), English (`en`),
German (`de`) and Luxembourgish (`lb`) on website/iOS. This note proves no
deployment, remote migration, actual Auth0 login or App Store publication.

## Selection and retention

Public pages share `PublicHeader` in `apps/web/src/public-chrome.tsx`. A compact
globe control opens language selection on desktop and mobile; narrow screens
also expose the shared navigation disclosure. It overlays content without
expanding header height. Account configuration retains personal preference.
Languages use their own names without flags. Interface language changes
immediately without reloading or clearing forms. HTML `lang`, accessible
labels, dates, numbers and amounts follow the choice.

Before login, explicit public `?lang=de` takes precedence, followed by this
browser's saved selection and browser languages. Regional variants such as
`de-AT` are recognized. Unsupported languages fall back to French. Unavailable
browser storage does not block selection. Public explicit selection adds/
updates `lang` so copied links retain language. Internal public links retain
it even when local storage is blocked. Private routes keep existing behavior.
Automatic selection restores the first supported browser preference; on web
this usually reflects system settings without directly reading iOS language.
It removes device-saved choice/`lang` while preserving other URL parameters
and fragment. Explicitly selecting the displayed language also saves it.
Touch controls are at least 44 px; Escape closes disclosures/restores button
focus, and outside click/focus closes them.

After login, authenticated views expose their only selector in account
configuration. `user.preferredLocale` supplies personal preference on each
session read. People without one use browser languages without inheriting
public/other-account choices. Visitor choice stays separate and resumes after
logout. Public selectors save no account preference.

Belvédère follows the same French/English/German/Luxembourgish preference
without another selector. The server injects only a validated locale in private
HTML after the existing guard. Tab return rereads the session for profile
changes. Preference changes neither Watcher access nor workspace roles.
This 10 October contract supersedes temporary dashboard-page selection.

Profile preference saves only after explicit selector change and form save.
An account without one shows an explicit empty choice; selecting the currently
displayed language can save it for future logins. Name-only edits do not affect
an absent preference. Active language changes only after successful saving.
Preference is shared across the person's organizations, not organization-wide.
Clients reread it from the account; no real-time cross-device notification
is claimed.

## Contract and migration

`packages/contracts/src/locale.ts` defines four values and bounded regional/
`Accept-Language` negotiation. `GET /api/session` and `GET /api/account` expose
nullable `user.preferredLocale` for existing accounts. `PATCH /api/account`
accepts `preferredLocale` without requiring old clients' fields. The server
rejects other values, unknown fields and requests without valid session/CSRF.
Identity comes from authenticated session; preference grants no right.

Additive `0038_user_locale.sql` adds constrained columns in `users` and
`auth_transactions`. Number 0037 is reserved for the native candidate. Apply
0038 before publishing the server that reads them. No existing account is
rewritten. Account creation retains language in the single-use PKCE
transaction; later login does not replace an existing preference. Older
login journeys remain accepted.

Desired language reaches Auth0 through `ui_locales`. Hosted screens/messages
actually supporting it depends on provider configuration and is separate from
Guteneo translation. Private browser journeys remain separate from public
API OAuth operations.

## Catalogs and content

The current common catalog has 455 required text leaves for each language.
Additional catalogs translate account screens, guides, pricing notices,
validation/recovery, public pages and journal. Catalogs are versioned with
source. State-held labels translate at render; editorial groups are produced
on demand to avoid freezing language at module load.

Business parameters/technical values never translate: paths, identifiers,
internal states, standardized ARIA attributes, APIs, provider options, PDF
content, entered names/contact details, amounts and approval fingerprints.
Proper names, bibliographic titles and stamp inscriptions are preserved.
Translated fictional examples never alter user-prepared communications.

Amount formatting preserves integer/nano-EUR quote precision. Browsers whose
ICU lacks `lb-LU` use `de-LU` regional formatting with Luxembourgish text.
Since the 3 October candidate, explicitly localized public URLs also serve
initial HTML in that language, with adapted sharing metadata, canonical URLs,
language alternatives and structured data. The generic link remains initial
French HTML with neutral logo/domain sharing artwork, then the client applies
visitor preference. Sitemap variants do not prove indexing. See
[TECHNICAL_SEO.md](TECHNICAL_SEO.md) for contract/evidence limits.

## Maintaining translations

Common text lives in `apps/web/src/locales/{fr,en,de,lb}.ts`; `i18n.ts`
provides the shared `Copy` structure. Public/operational code calls
`msg("English source", ...values)` during rendering, or uses `t` for common
catalog entries. `message-catalog.ts` derives canonical English lookup from
existing localized `messages-*.json` catalogs. Their legacy French keys are
localization data, not the language for new application source. Legacy
server-message inputs remain readable for compatibility.

Use `msgIn("stable-context", "English source", ...values)` only when identical
English wording has distinct grammatical/terminology translations; maintain
those variants in `locales/message-contexts.json`. Do not collapse them into
whichever catalog entry happens to load first. Keep `{0}`, `{1}` parameters
identical across languages. Never call `msg` on identifiers, form values,
names or user content. Construct label-bearing arrays at render or through a
getter so language changes need no reload.

`tests/unit/web-locale.test.ts` checks catalog parity/parameters. Browser
`locale.spec.ts` and `locale-boundaries.spec.ts` check visitor/account selection.
Native translations are bundled in
`ios/Guteneo/Resources/Localizable.xcstrings`. The current catalog contains
261 entries with `sourceLanguage: en`; Swift source uses English lookup keys.
All existing French, English, German and Luxembourgish display values are
retained. The semantic key `Privacy settings` disambiguates a lookup collision
while its English display remains `Privacy`.

English source keys are an authoring convention across web `msg`/`msgIn`,
Belvédère and the native catalog. They do not select the displayed language or
replace the account/browser locale rules above. These catalog/source facts
alone establish no fresh native build, simulator, device or distribution result;
keep the dated verification below separate.

## iOS client

The original native multilingual candidate was isolated on
`codex/multilingual-ios`, based on existing native work, to preserve concurrent
changes. Native/multilingual work was subsequently reconciled into the shared
repository; see `ios/README.md` and `ios/QA/READINESS.md` for dated integration
evidence. It provides welcome/account selectors, complete bundled catalogs,
localized formatting and the same server preference. SwiftUI changes language
without recreating navigation or drafts. Mobile validation/browser authorization
also retain it. Public links pass `?lang=…`.

Native controls/profile contract are documented in `ios/README.md` and
`docs/IOS_API.md`. Branch references below retain their historical context;
they do not imply current separation of source trees.

## Verification

- Server: persistence, user isolation, reads across organizations, strict
  validation, CSRF, concurrent revocation, old clients and signup negotiation.
- Catalogs: recursive parity, nonempty entries and interpolation parameters
  in all three translations.
- Browser: welcome selection, reload, successful/failed saves, retained forms,
  late session responses, logout, no implicit changes, unchanged usernames
  and ARIA values.
- Native: unsigned simulator/device build, XCTest and initial/profile selection
  UI journeys. These checks qualify no physical device, TestFlight or App Store.

### Compact navigation — 2 October 2026 candidate

The historical homepage header measured under WebKit at 430 × 932 px (iPhone
15 Pro Max width) is 77 px with menu open/closed. At 320 px it retains one
line without horizontal overflow. Secondary public-page language menus also
stay within the viewport at both widths. These measurements precede the
shared public header described above.

- `npm run typecheck`, `npm run lint`, `npm run build`,
  `npm run build:preview`: passed; Worker `--dry-run` compilation.
- `web-locale.test.ts`/`locale.test.ts`: 25/25 passed.
- `locale.spec.ts`/`locale-boundaries.spec.ts`: 36/36 passed on desktop/mobile
  Chromium and iPhone WebKit.
- New `language-navigation.spec.ts`: 12/12 passed on Chromium/WebKit,
  covering detection, retention, automatic reset, URL, keyboard opening,
  closing and mobile-menu bounds.
- Security: 216/216 passed.

Preview navigation/SEO/film checks exercised 94 cases: after targeted rerun,
92 pass and one is conditionally skipped. English role-film playback remains
blocked around 0.15 s under local WebKit; the original test reproduces the
same failure in a clean `dda97f2` checkout before this change. Video files
are identical and the player unchanged. This does not qualify that film's
Safari playback. Closed/open menu captures:
`reports/screenshots/language-navigation/`. These checks use examples/simulated
sessions and claim no publication or real-account changes.

### Web results on 22 September 2026

- `npm run typecheck`, `npm run lint`, `npm run build`,
  `npm run build:preview`: passed; Worker uses only local `--dry-run`.
- Vitest: 68 suites/1,343 exercised cases. Full run passed 1,324; 19 failures
  involved three historical-schema fixtures. Fixtures were corrected without
  changing business assertions; all three suites reran with 35/35 passes.
  Catalog/monetary-precision tests reran after final text: 13/13.
- `node --test tests/security/*.test.mjs`: 162/162 passed.
- `npm run test:e2e`: 324 passed, 3 expected conditional exclusions. After
  mobile-header/explicit-old-profile selection adjustments, both language
  suites reran: 33/33 on desktop/mobile Chromium and iPhone WebKit.
- `npm run test:preview -- --workers=2` on final build: 59 passed, 5 expected
  conditional desktop/mobile exclusions.
- Visual desktop/iPhone welcome inspection; homepage/support/developer pages
  at 320 px: no horizontal overflow, selector within header.

Local Luxembourgish captures:
[desktop](screenshots/multilingual/web-desktop-lb.png),
[iPhone WebKit](screenshots/multilingual/web-iphone-lb.png),
[320 px screen](screenshots/multilingual/web-320-lb.png).
Displayed data are examples, not real-dispatch evidence.

### iOS results on 22 September 2026

Native candidate recorded at `384d0d0`; latest native source tested at
`ec8fe77` before evidence/documentation commit. The multilingual candidate
was reconciled with three later native changes through `fea555d`. Fax
restrictions, reference quotes without sending, privacy/review clarifications
were preserved. Native catalog: 234 entries in four languages.

- New iPhone 17 Pro Max/iOS 27.0 simulator run: 23 unit tests and 7 UI journeys
  passed (`run-QUTBZd`).
- iOS candidate server: 82 passed; explicit reference-quote protections in
  all four languages, all 16 native API tests passed. Typecheck/targeted lint
  passed.
- New unsigned device Release archive: passed (`run-b967tj`), including
  Debug-marker exclusion. Unsigned archives qualify neither physical
  installation nor TestFlight/App Store publication.

Historical delivery branches were `codex/multilingual` (web/shared preference)
and `codex/multilingual-ios` (native client/API with the same preference).
That task performed no remote migration, main merge or publication.

### Narrow-header browser readiness

The preview language-panel check waits for the actual header to be visible
before measuring its closed height, then reads geometry through the attached
locator. This addresses the null bounding box observed during initial iPhone
WebKit header mount in documentation PR #47 CI. It retains exact closed-height
comparison, both 320/430 px widths, all five public subpages and panel/overflow
assertions; it changes no product behavior and excludes no browser.
