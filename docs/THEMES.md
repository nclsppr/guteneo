# Interface appearance

This document owns the browser appearance contract. [Brand identity](BRAND_IDENTITY.md)
owns the artwork and lettering rules; [multilingual behavior](MULTILINGUAL.md) owns
language selection. Appearance is presentation state, independent of language,
account identity and workspace membership. The former Classic/V2 layout choice
was retired on 29 October 2026; every account uses the V2 layout.

The initial 25 October 2026 theme and public-site release was published from
`03daa4136de8999cc79018f33f2a22038917c621`. The personal-space and Belvédère alignment below
is a follow-up source change; its deployed state is established separately by
exact-source CI, publication and browser evidence.

## Preference and first paint

`packages/contracts/src/theme.ts` defines `system`, `light` and `dark` preferences
and the resolved `light`/`dark` value. System follows `prefers-color-scheme`, including
changes while the page is open; an explicit choice overrides it. The main web
application shares `theme.ts` and `theme.css` across public pages, personal space,
the workshop and Belvédère; surfaces with three-way settings use `ThemeSelect`.
A change applies in place without
reloading, navigating, saving the profile or clearing a draft.

The public and personal headers and Belvédère page actions share the same
`ThemeToggle` appearance icon at
every viewport. It follows
the operating system by default; activating it stores the opposite resolved
light/dark choice with a localized action name. The head bootstrap owns this
native-button activation before React loads, and React adopts that state without
flipping it again. Personal navigation retains its identity, document access and
account routes in both saved layouts. The authenticated personal shell fills the
available width with responsive gutters, following the
[application layout contract](DASHBOARD_V2.md#personal-documents-and-account-customization--follow-up);
the public site's 1440 px outer frame does not constrain it. The saved V2 layout
uses the workshop navigation geometry without requesting its resources.
Belvédère adopts the V2 visual shell while keeping its independent platform guard
and read-only data. Existing
three-way account settings and independent status/engineering controls remain.

The same-origin `/theme-init.js` runs in the document head before styles and the
application module. It reads a valid `guteneo.theme` local-storage value first,
then the presentation cookie, then uses system. The application adopts that
initial state and subscribes once to system changes and same-origin storage
events. Clearing or invalidating the stored value through another tab restores
system. Blocked storage or cookies do not prevent an in-page choice; retention
after closing the page requires an available persistence mechanism.

The main web HTML, standalone browser documents, status HTML and engineering
layout declare a fixed cobalt `theme-color` of `#2450db`. The web manifest uses the
same value. This requests blue supporting browser chrome, including Safari;
the browser controls the final rendering. It is separate from the resolved page
palette and is not changed to the page's dark background.

## Presentation cookie and trust

The main web runtime writes `guteneo_theme=system|light|dark` with `Path=/`,
`Max-Age=31536000` and `SameSite=Lax`; HTTPS adds `Secure`. No `Domain` is set,
so this is a host-only cookie. It is deliberately JavaScript-readable and contains
only a nonsecret appearance enum. Interactive appearance changes, system updates and same-origin storage changes
refresh this cookie. The initial head bootstrap reads the bounded preference
without requiring a cookie write.

The shared cookie parser accepts exactly one matching cookie with one literal
supported value. Missing, invalid, quoted, encoded, duplicate or oversized input
(a cookie header over 8,192 characters) falls back to system; two identical
matching cookies are also duplicates. It never interpolates cookie text into HTML.
A valid local-storage value has priority when the browser bootstrap reads both.

`apps/api/src/standalone-theme.ts` reads this bounded cookie for script-free
server HTML. An explicit choice adds only a validated `data-theme` attribute;
system leaves the attribute absent. It writes no cookie and performs no account
or database lookup. Its self-contained CSS uses `prefers-color-scheme` when the
attribute is absent, so system still works with JavaScript disabled or prohibited
by CSP. The ordinary web stylesheet has the same CSS system fallback.

The cookie grants no authentication, document access, review, consent, role,
mandate or dispatch authority. Existing guards, CSRF, private caching and CSP
remain owned by each route. A theme preference must never change their outcome.

Local storage is scoped to an origin; the cookie is scoped to its host. Neither
mechanism shares a choice automatically between `guteneo.com`, Belvédère's host,
`status.guteneo.com`, `engineering.guteneo.com` or a preview host. No account
color-preference synchronization or cross-origin theme transfer is claimed. The
stored Classic/V2 value stays readable for older clients but no longer changes the
web layout.

## Surface ownership

| Surface                                                                                                                      | Entry and current behavior                                                                                                                                                                                             |
| ---------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public homepage, product pages, journal, legal, support and assistant/developer guides                                       | Shared head bootstrap and tokens; `PublicHeader` exposes only the localized light/dark action icon at every viewport, with system as the default and activation available before React.                                |
| Personal space                                                                                                               | Shared `ThemeToggle` icon, runtime and tokens; shared account language and color controls retain independent personal document authority.                                                                              |
| Workshop, including account, documents, dispatches, Studio and PDF controls                                                  | Shared runtime and tokens; account configuration exposes `ThemeSelect`, and the V2 account menu shows the shared `ThemeToggle` with its visible action. Classic/V2 is a separate account layout setting.               |
| Belvédère                                                                                                                    | Shared `ThemeToggle` in page actions, V2 navigation geometry and shared tokens. Platform guard, read-only data and injected account locale remain independent.                                                         |
| Server-rendered public HTTP errors, protected-document forms, native browser authorization/review and denied Belvédère entry | `standalone-theme.ts` supplies fixed blue metadata, bounded cookie selection and CSS-only system fallback without adding scripts or asset requests. These pages do not expose a new appearance selector.               |
| Independent status site                                                                                                      | `apps/status/public/theme.js` applies system/light/dark before styles, keeps `guteneo.theme` on that origin and handles system/storage changes. Its CSS follows system without scripts. It reads and writes no cookie. |
| Curated engineering site                                                                                                     | A three-way control uses `guteneo.theme` on that origin, resolved datasets and Nimbus `data-mode` styling, with system/storage updates and script-free CSS system fallback. It reads and writes no cookie.             |

Engineering migrates a valid earlier `ui-mode` light/dark choice only when the
new key is absent. It retains an in-page choice when a storage write is blocked,
synchronizes controls after Astro view transitions and never imports an account
preference. Its content remains English; shared appearance semantics do not imply
a translated documentation catalog.

## Content and controls

Themes use shared surface, text, border, focus, warning, success and error tokens.
Controls, placeholders, select options, dialogs, selection, caret and scrollbars
must remain readable in both palettes. Use the shared tokens instead of freezing
an interface surface to white. Keep focus indicators and non-color status labels.
The localized native select remains keyboard-operable and at least 44 px high.

Original PDF canvases, embedded PDFs, email previews, document images and postal
address crops retain their light paper and original colors. Theme their surrounding
controls; never invert/filter document content or change its bytes, quote,
recipient, approval fingerprint or provider options. Brand lettering follows the
separate [brand contract](BRAND_IDENTITY.md), including its engineering exception.

Embedded template-designer chrome observes the shared resolved theme and updates
designer options in place. Property controls, lists and toolbars follow the page
palette; the template page and original PDF output retain their document
appearance. Local integration and its browser checks are separate from deployed
designer or native Safari qualification.

## Public identity and image selection

The final visual direction removes added artwork frames and outer white logo
backings, while preserving white paper inside every header/app stamp in both
themes. `apps/web/src/brand.tsx` selects the existing transparent
`/brand/guteneo-portrait-128.webp` for dark mode; the lowercase wordmark and
postmark use ivory directly on the page. White paper stays inside each asset's
actual inner blue frame, leaving exterior/perforations and the surrounding
wordmark group transparent. A full-image white rectangle or outer contour is not
added. The current main 128 px source uses a 10.5% inset; status/API use centered
79% paper. Engineering's existing approved 5% `StampPaper` remains unchanged for
its different geometry. The
footer stamp has an approved transparent outer edge and preserves its printed
white interior as part of the image.

`apps/web/src/theme-media.ts` supplies `useDarkImageMedia` for Brand, the home-only
panorama and `apps/web/src/editorial/article-picture.tsx`. System emits native
`prefers-color-scheme` media selection, including initial script-free rendering;
explicit light/dark choices select their matching picture source. `ArticlePicture`
serves journal/article images and homepage thumbnails with 1536 × 1024 and
720 × 480 exports. The dedicated `-dark.webp`/`-dark-small.webp` RGBA derivatives
and alpha panorama reveal the actual navy page surface, with no added frame,
padding, background, CSS inversion or filter. Original light exports and the
opaque official stamp remain separate and unchanged; derivative source/provenance
records do not qualify publication. [Brand identity](BRAND_IDENTITY.md) owns those
assets and approvals.

## Verification boundary

Relevant regression sources are `tests/preview-e2e/theme.spec.ts`,
`tests/preview-e2e/theme-toggle.spec.ts`,
`tests/e2e/personal-document-performance.spec.ts`,
`tests/e2e/personal-appearance.spec.ts`,
`tests/belvedere-e2e/control-tower.spec.ts`,
`tests/belvedere-e2e/locale.spec.ts`,
`tests/unit/standalone-theme.test.ts`, the public HTTP-error and mobile tests,
and status/engineering browser suites. They cover distinct surfaces and must be
reported with their actual run results. The presence of a test is not a passing
run. The integrated feature/annotation/engineering projections and repository
language/link/documentation checks passed through `docs:build` and `docs:check`.
Eight focused status theme/unknown-state checks also passed in the separately
reported status scope. Engineering passed nine browser cases across desktop
Chromium, simulated iPhone WebKit and desktop WebKit; its isolated 55-page build
and six light/dark/no-JavaScript render checks passed without overflow. These
local browser engines do not establish physical-device Safari rendering.
Their evidence remains in `/tmp/guteneo-engineering-theme-proof/` (`results.json`,
`renders.json`, `build.log`) and `/tmp/guteneo-theme-final-status.json`. These
scopes predate the final inner-frame paper correction, public icon/shared-frame/
footer and artwork amendments; they do not
retroactively qualify the amended visual source.
The full template image-authoring scenario passed once in desktop Chromium and
three repeated desktop-WebKit runs. It covered the same focused native input,
invalid/pending edits, theme changes, undo, save/reload and original uploaded/PDF
image bytes. The reports are
`/tmp/guteneo-template-theme-sol-chromium-final.json` and
`/tmp/guteneo-template-theme-sol-webkit.json`; these are controlled local scenarios,
not physical-device or hosted template qualification.
Coordinated final-source browser checks, CI and deployed bytes remain separate
evidence.
