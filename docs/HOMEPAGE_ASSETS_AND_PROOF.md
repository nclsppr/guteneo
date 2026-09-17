# Homepage: customer tariffs, assistant brands and blue Luxembourg

Updated 17 September 2026 for the user's revised direction. This frontend slice starts from `ef305e7` in the isolated `guteneo-homepage` worktree. It does not attest deployment, registration, external assistant connection or a real dispatch.

## Public product content

The homepage keeps Guteneo's printing-house typography and blue/ivory palette. ChatGPT, Claude and Cursor have preparation guides; Grok is visibly marked as an unavailable integration. The original official logo files retain their shapes and colors. Their first-party URLs, archive members, hashes and trademark-use limitations are recorded in [ASSISTANT_BRAND_ASSETS.md](ASSISTANT_BRAND_ASSETS.md). No partnership or working integration is asserted.

The public tariff section now presents customer prices and material conditions, without discussing supplier margins or multipliers. `apps/web/src/customer-pricing.ts` holds structured display data, separate from operational quote authorization:

- E-mail: approximately €0.28 per 1,000 single-recipient messages, Essentials. Attachments add approximately €0.21 per GB.
- Fax: approximately €0.03–0.12 for a specific indicative scenario: one page to a Luxembourg fixed number, 1–3 minutes, EEA-origin number. The visible text states that routing/surcharges change the total and that this is not a guaranteed ceiling. Other destinations and durations require a quote.
- Post: examples starting at €2.50 to France and €3.02 to Luxembourg, one monochrome page on normal paper, economic postage, under 500 letters/month and the corresponding local postal grid. Other routes/options/pages require a quote.

All figures are indicative and exclude taxes. Dollar conversions use the ECB rate dated 16 September 2026, €1 = US$1.1537. The final quote, supplements and taxes must be shown before approval. The homepage and downloadable installation guide both retain the preview's closed-live-send status. The €50 credit is announced for service opening; top-up remains disabled. The footer links to `#/mentions-legales`, whose route is implemented separately by the parent.

Official evidence supplied by the parallel pricing review and checked for this display: [SES](https://aws.amazon.com/ses/pricing/), [Telnyx Fax](https://telnyx.com/pricing/fax), [Pingen France](https://www.pingen.fr/fr/tarifs/), [Pingen Luxembourg](https://www.pingen.lu/fr/tarifs/) and [ECB USD reference](https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/eurofxref-graph-usd.en.html). The fax scenario also relies on the separately reviewed Telnyx destination and surcharge evidence; the marketing page alone is not a complete fax tariff.

## Image generation and originals

The actual built-in OpenAI `image_gen` tool generated both new rasters. Before editing, the earlier Luxembourg panorama and the existing cobalt press image were viewed. The panorama edit uses the prior panorama as its composition target and the printing press as its style reference. The four-pose swallow sheet uses the press as a style reference. The result is an artistic Luxembourg impression, not documentary geographical evidence.

The original tool outputs are preserved unchanged under `assets/brand/source/`. Original PNGs and public WebPs have JSON sidecars with the complete exact prompt, references, date, dimensions, conversion command and SHA-256 hashes. The private source sidecars additionally retain the original tool-output path. A provenance scan found no missing prompts on the six original/current raster files scanned. Original dimensions below are the actual outputs, not the requested tool size.

| Asset | Original | Public derivative | WebP bytes |
| --- | --- | --- | --- |
| Blue Luxembourg panorama | `assets/brand/source/luxembourg-blue-panorama.png`, 2172 × 724 RGB | `apps/web/public/luxembourg-blue-panorama.webp`, 2172 × 724 | 675,208 |
| Blue swallow cycle | `assets/brand/source/luxembourg-blue-swallow-sheet.png`, 1254 × 1254 RGBA | `apps/web/public/luxembourg-blue-swallow-sheet.webp`, 600 × 600, four 300 × 300 cells | 72,336 |

Original panorama SHA-256: `8b70874c89257e11e73b51a4642a0d96234b46e145ed9c925f098e4f73f78d34`.

Original swallow sheet SHA-256: `6e67c4d2d5e7d7b299caca6257e48224d3dba26529c49745608d4f0c941f00cf`.

Conversion used `cwebp -q 88`; the sheet also uses `-resize 600 600`. The WebP sheet's actual alpha channel contains 284,171 fully transparent and 75,829 partially transparent pixels, with no fully opaque pixels. This preserves fine blue ink and soft antialiased edges. It was inspected on the intended ivory surface. Guteneo has no dark theme in this slice.

The earlier grayscale originals remain in `assets/brand/source/` as provenance history. Their unused public WebPs are removed. The panorama uses CSS darken blending so its ivory paper does not form a darker rectangle against the page. The current scene and birds use the printer's cobalt dither language; official third-party logos are not recolored or retextured.

## Motion and accessibility

Three small decorative birds follow separate flight timings. Their four generated poses cycle through raised, intermediate, lowered and intermediate wings, rather than merely scaling a still image. Flight uses transforms; wing animation changes one small sprite's background position. Birds are hidden from the accessibility tree and cannot intercept input.

The visible pause/animation button is removed at the user's explicit request. `prefers-reduced-motion: reduce` stops flight and wing cycles and leaves stationary birds in the sky. This preference updates through the native CSS media query. No comprehensive WCAG conformance claim is made for continuous decorative motion without a visible pause control.

## Local evidence

- TypeScript typecheck, scoped ESLint and preview build passed.
- Ten preview browser cases passed on desktop Chromium and iPhone WebKit. The new checks cover all four official image loads, Grok's unavailable status, absence of public multiplier copy in page and downloadable guide, displayed customer tariffs and fax caveat, legal-link target, actual flight movement and sprite-frame changes, absence of animation controls and OS reduced-motion behavior.
- Existing fixture-only workspace, credit, e-mail and PDF cases also passed. The tests continue to check no backend requests, runtime errors or horizontal overflow from the homepage.
- Impeccable's scoped UI detector returned no findings.
- Normal and reduced-motion screenshots are retained under `reports/screenshots/homepage/`; installation and pricing captures show desktop/mobile layout and visible qualifications.
- An independent visual review passed the desktop/iPhone installation, pricing and footer captures. The two reduced-motion browser cases were rerun after adding an explicit wait for the lazy panorama before capturing it; both passed and the static birds remain visible.

These are local candidate checks. A deployed release and real provider/assistant evidence must be recorded separately.
