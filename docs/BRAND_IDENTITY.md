# Guteneo visual identity

The user clarified these rules on 17 September 2026 and subsequently explicitly
authorized publication. This note describes local candidate validation;
publication evidence is recorded separately after delivery.

## Composition rules clarified on 3 October 2026

The brand lettering **guteneo**, and **guteneo.com** when used as a graphic
signature, remains lowercase and defaults to **ink black `#181b22`**, never cobalt blue.
This is already the site's color: `--ink: #181b22` in
`apps/web/src/styles.css`, applied to `.brand` and inherited by
`.brand-wordmark`. The wordmark retains EB Garamond. Blue belongs to the
official portrait, illustrations and decorative elements.

Unless the explicit engineering-header exception below applies, this rule
applies to every new or revised brand template: website and
application, email, sharing card, social post, video and other promotional
material. On a dark background, place the black signature on a light paper
panel using the site's ivory `#f6f5ef`; do not create a white or blue wordmark.

### Engineering-header dark-mode exception (24 October 2026)

The engineering documentation header uses a transparent background in both themes.
The existing portrait already contains transparency; never flatten it onto paper.
Keep the lowercase wordmark ink black in light mode. In dark mode, the explicitly
approved exception uses ivory `#f6f5ef` for the wordmark and its Engineering label,
without a light cartouche. Preserve the portrait's original blue and EB Garamond
lettering. This exception is scoped to the engineering documentation header;
other templates retain their established composition rules.

A standalone promotional card carries **one signature**: `guteneo` or
`guteneo.com`. Do not combine the wordmark with a second `guteneo.com`.
Sharing cards use one `guteneo.com` signature with the portrait without text.
A domain already present in an official stamp counts as that signature; do
not repeat it elsewhere in the composition. Website headers retain their
`guteneo` wordmark alongside the portrait, as described below.

The **blue footer swallows** also belong to the brand language. Where space
permits, reuse a few subtle birds from
`apps/web/public/luxembourg-blue-swallow-sheet.webp`, varying their scale for
natural perspective and preserving their original blue. A static sprite pose
suits sharing cards. Keep the motif decorative (`aria-hidden="true"` in HTML)
and clear of text and the portrait; do not substitute generic birds or add
logos. The existing footer in `landing-sections.tsx` and `.swallow-wingbeat`
in `styles.css` are the references, preserved by the
[homepage redesign](HOMEPAGE_REDESIGN.md).

Preserve the official source images and the distinct roles of portrait,
stamp and emblem. This clarification does not require recoloring historical
sources. Promotional and role films retain the approved ending card with
the official V5 halftone stamp, postmark and `guteneo.com`, and the approved
montage. Revisions follow the repository's Remotion sources and locked
dependencies. Historical evidence below is not renewed validation or
publication of those media.

## Video playback control

Presentation and role-guide film posters use a centered flat play button:
cobalt `#2450db` rounded rectangle and white triangle, without shadow or
volume effects. The label and actual duration remain readable below the
symbol in the active language. Use the shared player in
`apps/web/src/homepage-film.tsx` for a consistent control across films.
The button disappears during playback, returns for replay and remains
keyboard accessible with a visible focus indicator. This symbol is an
interface control; it does not replace the Guteneo logo or video content.

## Three distinct uses

| Visual | Use | Resources |
| --- | --- | --- |
| **Stamp with “guteneo.com”** | Public footer and external communications. Preserve its original stamp, paper background and decorative postmark. | `apps/web/public/brand/gutenberg-guteneo-stamp.webp` (640 px), `guteneo-stamp.png` (512 px) |
| **Transparent halftone portrait without text** | Website, journal, article, documentation, login and workspace headers. | `apps/web/public/brand/guteneo-portrait-128.webp`, `guteneo-portrait-192.webp`, `guteneo-portrait.png` (512 px) |
| **Simple flat emblem** | Favicon, shortcuts, MCP icon and small placements. This is the first image in the original request. | `apps/web/public/brand/guteneo-mark[-128].webp`, `guteneo-mark.png` and favicon family |

The HTML wordmark beside the portrait remains **guteneo**, with a lowercase
g, in the existing EB Garamond face. Do not add “guteneo.com” to the header
artwork. The communication stamp already contains that text. Headings and
body copy may retain “Guteneo”.

`apps/web/src/brand.tsx` explicitly supports `portrait` and `simple` variants.
The public footer retains its separate stamp component. Desktop header
portraits measure 48 px; the shared public header uses 40 px on small mobile
screens, as does the workspace. Small emblems measure 28 px. Keep square
proportions and reserve image dimensions in HTML.

## Sources and optimization

Public HTTP error pages reuse the existing portrait and wordmark, with three
original decorative illustrations: atlas and magnifier, archive box and idle
press. PNG masters and exact built-in Imagegen prompts are stored in
`assets/editorial/source/error-{navigation,access,service}.{png,json}`.
Square 640/960 px WebP exports are in `apps/web/public/errors/`.
They contain no signature, interface text or customer data. The title,
short introduction and links remain accessible HTML; see the
[public error contract](PUBLIC_HTTP_ERRORS.md). These illustrations replace
none of the official portrait, stamp or swallow sources.

Original JPEGs of both stamps remain in `assets/brand/source/`. The footer
WebP is preserved **byte for byte**, with SHA-256:
`6e04f5f1d744942be176843ef0a0cb41ce7e4c710b1d36c22257a33f3679225f`.

The attached JPEGs and historical portrait WebP had no alpha channel.
Transparency was extracted with **image_gen**, requesting preservation of
the blue portrait, halftone and serrated outline, conversion of white to
transparency and no added text. The raw 1254 × 1254 RGBA result is retained
at `assets/brand/source/guteneo-portrait-transparent.png`, with provenance
and prompt in the adjacent `.png.json` file.

Exports are resized and encoded with Sharp 0.35.4 **without flattening the
background**. Headers serve 128 or 192 px WebP files according to screen
density: 15,068 and 33,534 bytes. The transparent 512 px PNG for integrations
is 179,923 bytes. Headers do not load the 512 px images.

`docs/brand/assets.json` retains source and export fingerprints. The
standalone SVG favicon embeds the simple-emblem PNG; it is not a vector
tracing. ICO 16/32/48 px, PNG 16/32 px, Apple Touch 180 px and shortcut
192/512 px exports retain that emblem.

**Fictional demonstration PDFs** use the stamp with text through
`apps/web/src/assets/guteneo-stamp-preview.jpg`, embedded without a network
request. User-imported PDFs are not modified. The organization logo in
public metadata also uses the “guteneo.com” stamp. Historical illustrations
remain illustrations.

## Correction evidence

- Real transparency was verified in the PNG master and three exports: the
  128/192 px WebPs contain 1,931 and 7,692 fully transparent pixels; the
  512 px PNG contains 64,315. All four corners of each final export have
  zero alpha. Images have transparent CSS backgrounds.
- Checks on paper and dark backgrounds, then at actual website/workspace
  sizes; reviewed captures are in `reports/screenshots/brand-correction/`.
- 21 views checked: six public pages and the workspace on desktop, iPhone
  and at 320 px. Correct portrait loaded, browser transparency verified,
  lowercase wordmark, correct footer stamp, no distortion or horizontal
  overflow.
- `npm run typecheck`, `npm run lint`, `git diff --check`,
  `npm run build:preview` and `npm run build:live` passed.
- 9 demonstration unit tests and 21 Node Auth0/public-page tests passed;
  30 browser tests passed, with 4 mobile cases intentionally skipped by
  the desktop project.
- Correction reports: `reports/brand-correction-alpha.json`,
  `reports/brand-correction-browser.json`, `reports/brand-correction-unit.json`
  and `reports/brand-correction-playwright.json`. Evidence under
  `test-results/brand/first-pass/` predates this correction and no longer
  describes the current identity.

## External services

Auth0 scripts prepare the **transparent portrait** for login and the
application icon, with the distinct simple favicon. The MCP server advertises
the simple emblem through the installed SDK's recognized `icons` field;
host display is host dependent. No undocumented manifest field was added.

The 21 September submission candidate adds a **ChatGPT composer** derivative,
`apps/web/public/brand/guteneo-composer.png`: preserved portrait and serration,
simplified inner frame, transparent exterior. Directory and website icons
retain the original emblem. The generated master and prompt remain in
`assets/brand/source/guteneo-composer-transparent.png` and its `.json` file.
The [icon audit](../integrations/chatgpt/icon-audit.md) distinguishes documented
constraints, actual alpha, readability on light/dark backgrounds and the final
portal preview still awaiting verification.

No real communication is needed for this delivery. After merge and CI for
the exact commit, publish from `main`, verify new asset URLs on the canonical
domain, then apply and inspect the authorized Auth0 presentation. Reports
`reports/brand-publication-*.json` retain that phase's evidence; successful
local tests do not replace it.
