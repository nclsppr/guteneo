# Public homepage and navigation

25 October 2026 local candidate. The concise homepage introduces document
preparation, explicit review and channel choice, while durable detail pages own
setup, examples, prices and PDF checks. Source and local preview evidence do not
establish publication, provider availability, real sending or a registered/open
commercial offer. Existing beta/legal wording and capability gates are preserved.

## Information architecture and journeys

| Public entry        | Content and next action                                                                                                                                                                                                                           |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`                 | Existing Guteneo type/ink/paper/royal-blue identity; document → review → email/fax/post diagram, short workflow, direct/assistant entries, price/credit introduction, explicit default-off expert authority, beta/legal context and journal links |
| `/how-it-works/`    | Existing interactive fictional example and language-matched film; understand preparation/review/tracking, then choose Getting started                                                                                                             |
| `/getting-started/` | Direct Guteneo or assistant setup and the existing assistant guides; account entry still uses the established authentication journey                                                                                                              |
| `/pricing/`         | Existing channel prices, dates, assumptions, welcome-credit and quote terms; current qualified sources remain authoritative                                                                                                                       |
| `/pdf-checks/`      | Existing individual PDF/profile offer, limits, exact-price purchase conditions, automatic-report limitations and human review; no certification claim or activation by presentation                                                               |
| `/support/#faq`     | The complete eight-question FAQ, including preserved postal processing and PDF limitations                                                                                                                                                        |

The homepage creates no customer logo, testimonial, usage metric, availability or
delivery claim. Its functional diagram explains a workflow; it is not a prepared
communication, checked file or proof of sending. The interactive example stays
fully fictional and creates no API request, approval, credit reservation or outbox
entry. Films retain their own localized media; a language change stops earlier
playback. The tariff and paid-PDF contracts remain in
[welcome credit](WELCOME_CREDIT.md),
[live delivery quotes](LIVE_DELIVERY_QUOTES.md) and
[PDF verification pricing](PDF_VERIFICATION_PRICING.md), rather than being copied
into another price source.

Anonymous visitors can read these pages and choose a supported public language
or appearance. Account creation, personal/workshop membership, current roles,
provider gates, immutable document/recipient/options/cost review and human or
explicit bounded expert authority remain required at their existing decision
points. No frontend selection authorizes a send. No new REST/MCP/native business
action, service, paid resource, migration, automatic retry or external account is
introduced.

## Canonical routes, initial HTML and shared footer

`packages/contracts/src/public-site.json` is the single main-site public route
registry. The four detail paths above join the existing legal, support, role,
developer, assistant and journal routes there. `scripts/build-public-pages.mjs`
generates a generic page and French/English/German/Luxembourgish initial HTML for
**every registered route**, canonical/hreflang/sharing metadata and a sitemap
entry for the generic URL plus each explicit locale URL. Private/auth/API/MCP
paths and internal locale-asset paths are not invented public pages. Sitemap
presence proves neither indexing nor publication.

Paths remain English when labels change. The normal public language rules are
owned by [MULTILINGUAL.md](MULTILINGUAL.md); appearance is owned by
[THEMES.md](THEMES.md). Internal public links retain resolved language. Existing
home fragments `how`, `installation`, `pricing`, `pdf-checks`, `faq` and
`postal-cutoff-faq` retain meaningful destinations and focus behavior, with links
to the relevant detail/support content instead of silently losing old bookmarks.

Every main-site public route uses the same 1440 px maximum outer frame and
responsive gutters. Header, main and footer keep matching outer edges; long
legal/editorial prose may use a narrower readable measure inside that frame.

`PublicHeader` provides grouped public navigation, language and only one appearance
icon at every viewport. An unset preference follows the operating system; the
localized icon action chooses the opposite resolved light/dark mode. The head
bootstrap owns its activation before React is ready, so an early click is retained
through hydration. Escape and outside interaction preserve the shared
menu/focus contract. `PublicFooter` is the common navigable footer for public
React pages. `packages/contracts/src/public-footer.json` owns four groups and
sixteen canonical links with four-language labels; status and public HTTP-error
adapters consume the same source without adding a React dependency.

The homepage closes its main content with the existing localized “Ideas travel.
Ours start here.” invitation, first-dispatch call to action and large founding
stamp/postmark. The call to action retains the meaningful `/#installation`
destination and focus behavior; it prepares no dispatch. This invitation and stamp
sit above the homepage-only Luxembourg panorama, followed by the common sixteen-
link footer. That same `PublicFooter` remains unchanged on home and every other
main-site public React route: compact stamp/postmark, two original swallows,
sixteen links and maker colophon. The large home closing composition is additional
content above it, not a special footer variant. Status includes no city artwork.

Three original blue swallows overlay the home panorama; the identical common
footer on every public React route also uses two small original sprite birds in
a clear margin. They are decorative,
hidden from assistive technology, ignore pointer input and do not enter the logged-
in application. Reduced-motion behavior remains respected.

Dark wordmarks and postmarks use approved ivory. The dark header uses the existing
transparent `guteneo-portrait-128.webp` and confines white paper inside the asset's
actual inner blue frame. The exterior and perforations stay transparent;
no outer white contour or paper panel extends behind the wordmark. The footer
uses a separate transparent-outer-edge stamp
derivative that retains its printed white interior. Original light artwork and
the opaque official stamp remain unchanged. Dedicated RGBA dark editorial and
panorama derivatives reveal the actual page navy through their alpha. They use
native pictures, normal blending and no CSS inversion/filter, added paper frame,
padding or background. Exact source assets, derivative provenance and brand roles
remain in [BRAND_IDENTITY.md](BRAND_IDENTITY.md).

Small public page components belong to the initial application graph. Registered
same-origin links change pages through browser history without another HTML or
route-code request. Static generation and client navigation share page metadata;
language, section anchors, focus and Back/Forward stay coherent. A delayed or
unavailable entry script must not erase useful static content or native links.
Dynamic capability reads are limited to the existing pricing/PDF
views and their current closed/unknown behavior; the homepage diagram performs
no business operation. See [FRONTEND_PERFORMANCE.md](FRONTEND_PERFORMANCE.md) for
loading boundaries and measurements.

## Sources, verification and remaining proof

| Source                                                                                            | Responsibility                                                                                                                                         |
| ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `apps/web/src/public-homepage.tsx`, `public-homepage.css`                                         | Concise homepage, meaningful fragment destinations and functional diagram                                                                              |
| `apps/web/src/public-site-pages.tsx`, `public-site-metadata.ts`, `public-site-pages.css`          | Four detail routes, metadata and appropriate existing content                                                                                          |
| `apps/web/src/public-support-faq.tsx`, `information-page.tsx`                                     | Complete FAQ on support and consistent public shell                                                                                                    |
| `apps/web/src/public-chrome.tsx`, `public-chrome.css`                                             | Header, shared navigation/footer, official stamp and responsive controls                                                                               |
| `apps/web/src/brand.tsx`, `theme-media.ts`                                                        | Original transparent dark portrait and native system/explicit-theme picture selection                                                                  |
| `apps/web/src/editorial/article-picture.tsx`, `editorial/pages.tsx`, `editorial/editorial.css`    | Shared responsive editorial pictures for home, journal and article, without added frames                                                               |
| `apps/web/public/editorial/{gutenberg-to-digital,luxembourg-printing}-dark{,-small}.webp`         | Dedicated 1536 × 1024 and 720 × 480 dark derivatives; original light exports remain                                                                    |
| `apps/web/public/brand/gutenberg-guteneo-stamp-transparent.webp`, `luxembourg-dark-panorama.webp` | Transparent-outer-edge footer stamp and home-only RGBA panorama; provenance remains separate from release proof                                        |
| Adjacent `*.webp.json` records for both dark editorial images, the panorama and transparent stamp | Generation/reference, alpha, source/conversion and hash provenance; original masters remain under `assets/brand/source/` or `assets/editorial/source/` |
| `packages/contracts/src/public-site.json`, `public-footer.json`                                   | Canonical route/sitemap and four-language navigation data                                                                                              |
| `apps/web/src/locales/messages-public-site.json`                                                  | Four-language public copy with English runtime lookup through the shared message catalog                                                               |
| `scripts/build-public-pages.mjs`, `apps/web/src/editorial/ssr.tsx`, `main.tsx`                    | Complete initial HTML, metadata/sitemap and safe detail-module handoff                                                                                 |

Local preview scenarios and screenshots cover the new hierarchy, four languages,
light/dark, desktop/mobile, fictional interaction isolation, film-language
handling, delayed detail loading and preserved fragments. They remain synthetic
browser evidence. The final source, exact-commit CI, built route/sitemap coverage,
shared footer/stamp adapters and served bytes require their own matching checks;
no older homepage pass qualifies those new paths automatically. No live hostname,
Auth0, scanner, PDF engine, provider delivery, paid operation or production release
is qualified by a local page render.

On 25 October, the public regression passed 104 local preview cases. Separate
reports passed 22 status-link SSR/locale assertions and 39 status-footer cases;
these are distinct scopes, not an additive total. The earlier 22-case film/preload
report remains separately dated. An independent craft review accepted the four
resolved findings: normal Tab access, Getting Started layout, localized postal
labels and the official footer stamp. It reviewed the required recaptures, not
live deployment or every interaction state.

Those runs predate the final home closing invitation, public swallow placements,
transparent identity/stamp and dark RGBA artwork amendments. The earlier added
paper-frame direction is superseded. Their source and visual checks require dated evidence;
earlier counts do not automatically qualify the amended candidate.
`tests/preview-e2e/public-artwork.spec.ts` records that amendment's regression
contract; declaring it does not establish a passing run.

Reports and captures remain outside Git under `/tmp/guteneo-public-review/`:
`final-public-playwright.json`, `status-locale-playwright.json`,
`status-footer-playwright.json` and `final/public-site/`. A later preview compilation
and HTML generation completed, but its snapshot guard rejected concurrent input
changes. That refusal is retained as a guarded-build limit, not a passing release;
the final source freeze still needs exact-source CI.

A later guarded preview build completed at `2026-10-25T10:38:26.410Z` with the
transparent-asset, closing-section and confined white-interior inputs, from dirty baseline commit
`8067b8687ee128482a7bbf1bc712fb635f115008`, source snapshot
`89300128a9aea532a4f441c1083c32531b5fa84f9a594ea5e4ec4de9c444eb0f`.
Its log is `inset-closing-preview-build.log` in the same evidence directory.
The final amended browser matrix and any changes after that snapshot require
their own checks; a successful local preview build is not publication.
In particular, that snapshot predates the final actual-inner-frame paper
correction, icon-only public header, common outer frame and identical home
footer. A later source/browser alpha audit found white bleed when the different
main portrait copied engineering's 5% paper inset; the geometry-specific correction
and final visual matrix need their own proof.

The earlier 20 September design and measurements below are retained as history;
they do not describe the current homepage layout or qualify this candidate.

## Historical correspondence journey — 20 September 2026 candidate

This records the initial homepage candidate and its verification. The subsequent
[assistant hub iteration](ASSISTANT_HUB.md) replaces the inline installation
panel with the choice of assistant-guided or direct sending, and shared public
and dashboard guides. The original visual proof below remains historical.

The homepage implements the approved target design: an explicit assistant-to-send
hero, one guided fictional example, one assistant selector and installation
panel, existing customer prices, four essential questions, a compact journal,
and the original Luxembourg footer. It is a local frontend candidate, not a
production release or qualification of assistant/provider availability.

## Behavior and boundaries

- Hero, example and footer calls to action focus the installation section.
  Shared footers on other public pages return to the homepage section; initial
  fragment focus is restored after React mounts, including on WebKit.
- The three example steps and channels use component-local state only. Prices,
  recipients and outcomes are labelled fictional; simulation never makes an API
  call, records consent, reserves credit or sends a document.
- Assistant stamps select one guide. Configuration instructions open explicitly;
  copying the first message never claims to install or connect anything.
- Customer tariff amounts and their dated qualifications are unchanged. The
  operational account, billing, approval and provider gates are unchanged.
- Mobile navigation exposes the principle, installation, pricing and account.
  Escape returns focus to the menu button. The footer retains reduced-motion
  support, its wording, its founding stamp, panorama and birds.

## Artwork

The original press and footer images are unchanged. The new press background was
extracted with the built-in image generation tool. Responsive transparent WebP
exports are 1200 and 640 pixels wide; the RGBA master, exact prompt, pixel-alpha
proof and ivory/white/dark composites are retained under
`assets/brand/source/press-halftone-transparent*`.

## Local verification

- TypeScript, ESLint, diff whitespace and the Impeccable detector passed.
- Both preview and production bundles built successfully. Existing large-bundle
  warnings remain; this change does not claim a performance benchmark.
- Full application and security suite: 1,087 Vitest tests and 132 Node security
  tests passed, with no failures. Vitest report:
  `reports/homepage-redesign-vitest.json`.
- Preview browser suite: 38 passed, four intentional desktop exclusions, zero
  failures. Includes desktop Chromium, iPhone WebKit, keyboard tabs, example
  isolation, clipboard/configuration journeys, menu, shared-footer navigation
  and reduced motion. Report: `reports/homepage-redesign-playwright.json`.
- Visual inspection at 1280 × 720, 390 × 844 and 320 × 740; no document-width
  overflow at 320 pixels. Final captures are in
  `reports/screenshots/homepage-redesign/`. Historical captures were preserved.

No real communication, payment, production activation, merge or deployment was
performed. The saved visual proof concerns the isolated preview model; production
publication and end-to-end provider qualification remain separate work.
