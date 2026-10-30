# Preparing a Pingen postal PDF

Official documentation checked **17 September 2026**; local version
`pingen-2026-09-17-v2`. This document separates provider rules, Guteneo beta
restrictions and missing evidence. Provider documentation remains authoritative
for provider acceptance.

## Format and account profile

PDFs must be A4, at most 100 pages and 8,000,000 bytes, with embedded fonts.
Duplex reduces sheets to `ceil(pages / 2)`, not PDF page count.
[Pingen letter standards](https://help.pingen.com/en/templates-and-postal-requirements/letter-standards).

The first qualified account profile was `default_country=LU`, left window. Never
infer this from a user's address; the server reads the Pingen organization. French
accounts require the right window; their French template applies to France-bound
letters, while other destinations use the general template. France-bound letters
from non-French accounts use DHL international rules and the general template,
rather than the local La Poste route.

## Final-document geometry

Coordinates are **millimeters from the top left**, before rotation, taken from
official pages rather than estimated from screenshots.

| Profile | Page 1 address: x, y, width, height | Page 1 reserved region: x, y, width, height | Reserved corner on every page |
| --- | --- | --- | --- |
| General, left window | 22; 60; 85.5; 25.5 | 20; 40; 89.5; 47.5 | Bottom left: 15 × 15 |
| General, right window | 118; 60; 85.5; 25.5 | 116; 40; 89.5; 47.5 | Bottom left: 15 × 15 |
| FR account, FR destination | 110; 50; 80; 28 | 90; 30; 115; 64 | Top right: 20 × 20 |

The reserved region includes the address rectangle: **only the recipient** belongs
inside that rectangle; the remainder must be white. Keep **5 mm blank on every
page edge**. Logos, lines, numbers, template marks, watermarks and gray pixels count
as content. Official corner diagrams were visually inspected.
[General layout](https://help.pingen.com/en/templates-and-postal-requirements/layout-requirements),
[French layout and international exception](https://help.pingen.com/en/templates-and-postal-requirements/layout-requirements-french-organisations).

For a new letter, use readable black regular sans-serif text, 10–12 pt, left aligned,
without blank lines. Add inner margin; do not put glyphs directly on window edges.
Convert bottom-origin PDF coordinates with
`y_bottom = page_height − y_top − block_height`. Final rendering determines
placement, rather than CSS or a prompt.

## Address and paper

The PDF must already contain its address. The original journey preserves exact
bytes without implicit repositioning, cover insertion, resizing or flattening.
Correction explicitly creates a new document, fingerprint and approval.

| Destination | Checks and limits |
| --- | --- |
| LU | 3–6 lines excluding country; street then number; four-digit postal code, recommended `L-` prefix, then locality. No country line for domestic LU; country required internationally. 8–12 pt, preferably 10–12. [bpost LU](https://help.pingen.com/en/templates-and-postal-requirements/address-requirements-bpost-luxembourg). |
| DE | Street then number; five-digit postal code then city; no `DE-`/`D-` prefix. Two-line large-recipient addresses exceed Guteneo's simplified profile. No country line for domestic DE. [Deutsche Post](https://help.pingen.com/en/templates-and-postal-requirements/address-requirements-deutsche-post). |
| Domestic FR | 3–6 lines, at most 38 characters per line; number then street; five-digit postal code then uppercase city. Remove punctuation from the street line onward; also check spacing and character height. [La Poste](https://help.pingen.com/en/templates-and-postal-requirements/address-requirements-la-poste). |
| FR from LU | DHL international route; final line `FRANCE`. Domestic French rules alone do not qualify this route. [DHL](https://help.pingen.com/en/templates-and-postal-requirements/address-requirements-dhl-international). |

The helper deliberately accepts only canonical final-country spellings `FRANCE`,
`GERMANY`, `LUXEMBOURG`. Other provider-recognized spellings require tests before
addition; conservative rejection does not imply provider invalidity.
[Pingen country names](https://help.pingen.com/en/templates-and-postal-requirements/supported-country-names)
currently omits LU from domestic exceptions; the more specific LU page requires
no country for domestic mail.

Beta options are `normal`, `simplex`/`duplex`, `grayscale`/`color`, `fast`/`cheap`
**when the account calculator accepts them**. No SEPA paper, QR invoice, registered
mail or automatic product substitution. Pingen detects paper types per page;
retain its returned array for pricing instead of inventing a sheet-count
substitution. [Paper types](https://help.pingen.com/en/printing-and-paper-options/supported-paper-types),
[print options](https://help.pingen.com/en/printing-and-paper-options/print-options).

Verified sender and return processing are separate from recipient checks. A
printed letterhead does not guarantee physical return: Pingen describes digital
processing and unopened destruction of undeliverable letters. Never promise postal
return to the sender. [Returns](https://help.pingen.com/en/submit-and-send-letters/digital-returns-processing).

## Delivered checks and integration

`packages/contracts/src/pingen-preflight.ts` exports:

- `preflightPingenPdf(bytes, options)`: exact bytes, hash, page/sheet count, A4, crop, rotation, PDF unit, forms, annotations and declared embedded fonts. No network, save or mutation. Returns `blocked` or `review_required`, always `canSend:false`. Annotation, rotation, crop and font restrictions are conservative Guteneo choices; font-file inspection does not certify program quality.
- `pingenLayout(options)`: profile and millimeter rectangles.
- `checkPingenAddress(lines, options)`: bounded syntax without silent normalization; proves neither address existence nor actual PDF text.
- `checkPingenRaster(input, options)`: trusted isolated-service opaque RGBA output, at least approximately 144 dpi, at most ten million pixels/page. Checks every page's borders/corners, postage region and page-1 window ink. Any nonwhite forbidden pixel blocks. Render hash must match the document.

Integrate **after qualified scanning and before provider upload** in the isolated
document service. Raster input must come from verified private bytes, never the
browser or LLM. Require every page, in order. Ink alone does not prove an address:
window-text extraction, normalized-recipient comparison and visual inspection
remain necessary. Images, outlined glyphs, invisible text, overlays and duplicates
need review. An LLM may assist but cannot alone attest geometry or identity.

Final review binds hash, page count, exact extracted address, country, window,
detected paper, options, qualified provider amount and frozen customer price to
one draft/manifest. Revalidate authority and document before every external
effect. A local result is no approval token; MCP tools grant no human consent.

The candidate integrates these checks with the private renderer and browser review.
Source presence alone establishes neither remote qualification nor Pingen upload.
The connector enforces 8,000,000 bytes. Expected address uses the qualified account's
default country and keeps a final country line internationally. See [document
service](DOCUMENT_POSTAL_PREFLIGHT.md) and [release proof](LIVE_RELEASE.md).

## MCP-readable instructions

`get_postal_requirements({country})` exposes FR/LU/DE `addressGuidance`: actual route
for the profile, line order, postal code/country, characters, typography, synthetic
example and dated official sources. `layout` holds rectangles; `limits` holds
ceilings. Read before generating a PDF, then check its exact final bytes. France
from LU uses DHL; do not extend domestic La Poste rules to that route.

**Current Guteneo limit:** `recipient` has only `name`, `line1`, `postalCode`, `city`,
`country`. Expected address is exactly three lines (name, street/post-office box,
postal code/city), plus canonical country internationally. There is no `line2`
or separate building, floor, department or delivery-reference line. Provider
3–6-line support does not mean Guteneo can represent those forms. Never delete a
required complement to bypass this limit. Fields are not automatically printed;
the PDF must already contain the address.

`verification.automatic`, `manual` and `provider` distinguish evidence. Guteneo
checks bytes, scan, all pages, geometry, reserved regions, extraction/matching and
bounded syntax. Version 2 adds Latin letters/digits 0–9 for LU/DE, explicitly
forbidden LU characters and `n°`/`nr` markers on the canonical street line, plus
domestic-FR street punctuation. Accents, permitted name apostrophes and German
`//` complements remain. Nothing is corrected or rewritten to pass.

Street/number order, completeness, existence, color, style, size, spacing and
actual visibility still need review. Glyph coordinates are approximate. Provider
analysis adds checks but does not certify all rules or delivery.

`get_postal_preflight` exposes `address.textVisibility: "not_verified"`,
`cropAccess: "authenticated_browser_session_only"` and
`mcpEmbeddedVisualEvidenceAvailable:false`. The crop needs a browser session;
MCP OAuth grants no embedded image access. Inspect the original with matching
hash or direct the user to `reviewUrl`; never claim an inaccessible crop was read.
`canTransfer` describes browser-button availability only; MCP `false` does not
determine expert eligibility. `transferPolicy` explains this without evaluating a mandate.

## REST and MCP candidate journey

1. Read `GET /api/postal/requirements?country=LU` or `get_postal_requirements` before PDF creation, using the recipient country. Organization profile is read at Pingen without document upload. `qualified:true` concerns that profile only.
2. After import/qualified scan, `POST /api/postal/preflights` or `preflight_postal_pdf` accepts document, sender, recipient, options and ceiling. Both OAuth scopes `documents:write` and `dispatches:prepare` are required. Idempotency also protects check-quota consumption.
3. `GET /api/postal/preflights/{id}` or `get_postal_preflight` exposes state, address text, private PNG link and `reviewUrl`. Neither reading nor preparation uploads to Pingen. `canSend:false` and visual limits remain.
4. The browser opens `/#/app/postal/{id}`, showing pages, expected/extracted address, anomalies and options. Explicit review/transfer declarations bind this version; private `/transfer` needs current session/CSRF. Distinct expert `transfer_postal_draft({preflightId,fingerprint})` needs a prior bounded active administrator mandate for this OAuth client explicitly covering Pingen transfer. It records delegated authority, never model-asserted human consent. An assistant cannot create/extend it; host confirmation is no substitute.
5. Transfer creates only `auto_send:false`. Lost responses require state rereading; `unknown` never reenables creation. A failed crop load blocks confirmation and can be retried through Refresh.
6. After consented upload, `POST /api/postal/preflights/{id}/quote` or `quote_postal_draft` prices the same draft. No client-supplied document, price or recipient is reused. If analysis remains pending, retain the same key. Quote approval and sending are separate steps.

`POSTAL_DRAFTS_ENABLED` gates provider preparation; `LIVE_SENDS_ENABLED` still gates
sending. Flags never replace scan/render proof, sender, profile or quote. The
candidate uses synthetic evidence; activation and real tests remain separate.

## Remote qualification without sending

Normative sources: [current Pingen OpenAPI](https://api.pingen.com/documentation/swagger-docs),
[documentation](https://api.pingen.com/documentation). Calculator examples sometimes
use `type: letters`; `LetterPriceCalculatorPOST` specifies `letter_price_calculator`,
which Guteneo uses.

1. **Without a PDF:** client-credentials OAuth with `letter`, then `POST /organisations/{id}/deliveries/letters/price-calculator`, JSON:API `country`, `paper_types`, `print_mode`, `print_spectrum`, `delivery_product`. `200` provides `data.attributes.currency`/`price`; `202` is indeterminate. No letter is created. The scope can send, so restrict probe methods/paths exactly; no arbitrary proxy or token logging.
2. **Separately authorized draft:** `GET /file-upload`, PUT only authorized bytes to the pinned provider origin, then `POST /organisations/{id}/deliveries/letters` with `auto_send:false`, no preset. This is external transfer without sending. Persist ID/idempotency before later work; uncertainty requires reconciliation, never repeat creation.
3. Bounded reads of `GET /organisations/{id}/deliveries/letters/{letterId}` inspect `address`, `country`, `file_pages`, `paper_types`, `fonts`, state and `meta.abilities.self.submit`. Creation `201` does not prove analysis completion. Inspect WebApp preview without correction/send actions. Never `PATCH .../send` in this test.
4. `/file-validation`, `/extract-text`, `/cost-details`, `/calculate-prices` had empty path objects in the observed public OpenAPI; invent no method or response. Qualify cleanup before automation; deletion and cancellation differ.
5. **Staging:** `identity-staging.pingen.com` and `api-staging.pingen.com`, separate account/credentials. Pingen states no letters are printed/distributed there. Production access proves no staging access. Separate staging proof, production draft proof and local simulation.

The calculator supplies a provider estimate. Qualify currency, tax, fees and
validity before freezing customer price at twice total provider cost. Unknown
credit or cost never permits a free send. Test logs exclude document identifiers,
secrets, signed URLs and addresses.

## V2 compatibility and validation

Version belongs to profile, report and frozen proof. V1 never becomes v2 implicitly:
explicitly redo checks without recreating an already transferred or uncertain
draft. Old evidence exposes `POSTAL_PREFLIGHT_VERSION_CHANGED` and `blocked` while
retaining transfer state, draft ID and crop for reconciliation; expired `preparing`
remains `unknown`. Writes, quotes and atomic send transitions reject old versions.
`0026_postal_address_rules_v2.sql` changes the expected version in the existing
guard without changing data, quota or delegation.

Publication needs migration 0026, private `guteneo-documents` and application built
from the same revision. Mixed versions reject new reports: allow this brief
closed outage, then requalify with synthetic PDFs. `scripts/qualify-postal-preflight.mjs`
requires v2 in all four cases and rejects v1 even if other results pass. App-only
publication is insufficient. Historical v1 renderer evidence qualifies v1 only.

Relevant tests: `postal-requirements`, `pingen-preflight`, `postal`, `postal-mcp`,
`live-providers`, `live-delivery-quotes`, `document-postal-preflight` (real Chromium),
typecheck, lint and local migration transport. Synthetic fixtures/intercepted
provider only; no real upload or letter was executed for this correction.
