# Transparent printing press

Created on 2026-09-20 with the built-in `image_gen` tool (`background-extraction`).

The input was the existing `apps/web/public/press-halftone.webp`; that source remains unchanged. The generated PNG master preserves the recognizable press, curved ivory sheet, envelope, cobalt engraving, and overall composition. As an image-model edit, this is a regenerated cutout rather than a guarantee of pixel-identical foreground preservation.

## Deliverables

| File | Format | Dimensions | Bytes |
| --- | --- | --- | ---: |
| `assets/brand/source/press-halftone-transparent-master.png` | PNG RGBA | 1254 × 1254 | 2430928 |
| `apps/web/public/press-halftone-transparent.webp` | WebP alpha | 1200 × 1200 | 501584 |
| `apps/web/public/press-halftone-transparent-640.webp` | WebP alpha | 640 × 640 | 153662 |

Sharp performed resizing, WebP encoding (`quality: 90`, `alphaQuality: 100`, `effort: 6`), and flat-background QA composites only. No script performed extraction, recoloring, alpha replacement, or other creative editing.

## Verification

- Master: 699302 fully transparent pixels of 1572516 (44.47%); both WebP files retain a real alpha channel.
- The generator produced most foreground pixels at alpha 252–254. The ivory paper remains visually solid on all tested backgrounds; the generated alpha was preserved without thresholding.
- The final 1200-pixel WebP was visually checked at original dimensions, via 640-pixel composites on ivory `#f6f5ef`, white `#ffffff`, and dark `#172033`, and again as a full-size 1200-pixel dark composite. The exterior rectangle and background holes are transparent; the curved sheet, envelope, engraved surfaces, and wheel remain intact. No obvious cutout halo or clipped subject was observed.
- The three full-size 1200-pixel composites are `press-halftone-transparent-on-ivory.png`, `press-halftone-transparent-on-white.png`, and `press-halftone-transparent-on-dark.png` in this folder.
- Exact hashes, dimensions, file sizes, and alpha counts are recorded in `press-halftone-transparent-proof.json`.
- Browser integration is verified separately by the homepage implementation task.

## Exact generation prompt

Use case: background-extraction. Asset type: transparent website hero artwork, square 1200x1200 or larger. Input image 1 is the EDIT TARGET: the existing Guteneo blue halftone printing press. Primary request: remove ONLY the exterior warm ivory background and replace it with a genuinely transparent alpha channel, creating a clean faithful cutout. Preserve the existing illustration exactly: same printing press, wheel spokes, gears, roller, feet, large round upper plate, fine cobalt-blue etched lines, curved ivory sheet rising into the envelope at upper right, blue colors, silhouette, perspective, placement, margins, and composition. The ivory paper INSIDE the sheet and envelope and the light engraved surfaces INSIDE the machine must remain opaque ivory. Empty holes between wheel spokes, legs, and empty spaces through the machine must become transparent wherever they are background. Keep delicate blue halftone contour details, with natural partially transparent anti-aliased edges. Remove the external paper rectangle, and only the external background. No new artwork, no new objects, no text, no white outline or halo, no drop shadow, no glow, no recoloring, no 3D effects, no crop, no rearrangement. Deliver a PNG with real transparent pixels, not a checkerboard or solid background.
