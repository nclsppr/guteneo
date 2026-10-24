# Submission icon audit

Audit dated **21 September 2026**, followed by the publisher-requested composer
adaptation. The directory original was unchanged. File acceptance, readability
and final ChatGPT appearance are separate checks.

## Documented constraints

The [official image-error reference](https://developers.openai.com/plugins/deploy/submission-errors#image-errors),
retrieved on 21 September, requires square interface.logo/interface.composerIcon.
It accepts PNG, JPEG, WebP and SVG; raster dimensions are **48 × 48** through
**4 096 × 4 096 px**, size at most **5 MiB**, with an extension matching the format.
The [submission guide](https://developers.openai.com/plugins/deploy/submission)
requires production-ready assets but the consulted text specified no different
sizes for these two uses. Neither reference established mandatory transparency,
monochrome backgrounds or separate light/dark variants. Recheck the actual form
and preview before concluding remote upload readiness. The MCP UI screenshot
width requirement of 706 px does not apply to brand icons.

## Examined directory original

| Property             | Observation                                                           |
| -------------------- | --------------------------------------------------------------------- |
| Source               | apps/web/public/brand/guteneo-mark.png                                |
| Format/dimensions    | PNG, 512 × 512 px                                                     |
| Size                 | 249 823 bytes                                                         |
| Transparency         | No alpha channel; opaque white background                             |
| SHA-256              | d6a83bbe53abb6ffac19d66a66d02b5992887a4796d909fb86043c356580e8c9      |
| Blue occupancy       | x=17–494 and y=19–491 inclusive under the inspection's blue threshold |
| Original package use | Same file for logo and composerIcon                                   |

The file met documented size/format constraints and follows
[brand asset roles](../../docs/BRAND_IDENTITY.md): simple emblem for small placements,
favicons and MCP; halftone portrait and text-bearing stamp have separate uses.
The 512 px PNG, 128 px WebP and 32/16 px favicons were opened. At 512/128 px the
portrait and perforations remained recognizable without reading text. Facial
detail/double borders became dense at 32/16 px; that does not establish a composer
defect without inspecting its actual host dimensions.

White corners can appear as a tile on dark backgrounds; this was not an
established specification violation. Making every white pixel transparent would
also change the portrait's internal negative spaces and contrast. No size/format
repair was required. The publisher instead requested a dedicated derivative:
real outer transparency and a simpler inner frame, preserving portrait, blue and
perforations. It replaces neither the directory asset nor website icons.

## Delivered composer derivative

image_gen produced a square PNG from the original. The generated file was
retained unchanged without alpha retouching or resizing. The
[master provenance](../../assets/brand/source/guteneo-composer-transparent.png.json)
records the actual prompt and copies.

| Property                 | Observation                                                                                |
| ------------------------ | ------------------------------------------------------------------------------------------ |
| Public candidate         | apps/web/public/brand/guteneo-composer.png                                                 |
| Packaged copy            | integrations/guteneo/assets/guteneo-composer.png                                           |
| Format/dimensions        | PNG RGBA, 1 254 × 1 254 px                                                                 |
| Size                     | 977 001 bytes                                                                              |
| SHA-256                  | 2dd792b032c4e244072494fef71344aa270893c4bf8e92c44600234eccb394cc                           |
| Fully transparent pixels | 515 191; all four corners have zero alpha                                                  |
| Artwork alpha            | Mostly 254/255 with antialiasing; white internal spaces remain visible on dark backgrounds |
| Visible bounds           | x=92–1 158 and y=94–1 155 inclusive                                                        |

A local CUA browser page compared white and #212121 backgrounds at **16, 24, 32,
48, 64 and 128 px**. Outer transparency removed the original's white tile; inner
spaces and simplified frame remained visible. The character remained recognizable,
with naturally limited facial detail at 16 px. Captures were inspected during
that session; local evidence: reports/icon-qa/proof.json and reports/icon-qa/index.html.

The manifest uses the derivative only for composerIcon. It was subsequently
uploaded to the OpenAI portal for both light and dark modes; both actual previews
were inspected and persisted after draft reload. This proves no directory
publication. Both assets satisfy the documented format/dimension constraints.

## Editing intent

The original PNG was the editing reference. The actual original-language prompt
remains in provenance. Its intent was to preserve Gutenberg's portrait,
orientation, silhouette, features, blue and perforations; add no text, shadows,
texture or gradients; make only the outer background genuinely transparent while
preserving internal white negative spaces; keep a centered square stamp without
cropping at least 512 × 512 px; and never simulate alpha with a checkerboard.

The result is a generated derivative with frame simplification, not an identical
export of the approved emblem. Local comparison was completed; final rendering
still depends on the host.
