# Vertical campaign image provenance

Generated on 2026-09-22 using the built-in image_gen tool. No direct API calls or external image source. This is a generated advertising illustration of a paper campaign, not evidence of a real campaign or delivery.

## Artifact

- File: campaign-paper.png
- Native dimensions: 941 × 1672 px (within 0.1% of 9:16)
- Encoding: PNG, RGB
- Size: 1,849,451 bytes
- Native output retained without pixel manipulation or upscaling.
- Source: /Users/nclsppr/.codex/generated_images/01a0c645-c22e-73e2-9525-77ddceda3294/exec-2ddf6b63-dddc-4e35-aac7-6bb52db95268.png

## Visual QA

Inspected the complete output. Several physical ivory envelopes and letters form an elegant fan in depth across the lower roughly 65% of the frame, with one cobalt envelope. The top roughly 35% is dark ink/cobalt and clear for a title. Fine paper texture, lighting, folds and shadows are credible. Blurred ink and shadows on the paper contain no discernible personal information or pseudo-typography. No logo or watermark is visible. The actual Guteneo halftone brand should be layered natively in Remotion.

At 1080 × 1920 export, the native photograph receives approximately 1.148× enlargement. Keep extra zoom subtle (no more than roughly 5–7%) to preserve the visible material texture. The near paper crosses the bottom/left frame naturally; keep the main cobalt envelope and rear layers in view.

## Existing canonical artwork inspected (read-only)

- apps/web/public/brand/gutenberg-portrait-stamp.webp: 640 × 640 RGB; recommended final halftone stamp, without embedded domain. It has an opaque pale background. Add guteneo.com below in Remotion.
- apps/web/public/brand/guteneo-portrait.png: 512 × 512 indexed PNG with real transparency (alpha 0–255), same portrait identity. Alternative for compositing directly over ivory; transparency changes contrast according to background.
- apps/web/public/brand/gutenberg-guteneo-stamp.webp: 640 × 640 RGB; includes guteneo.com in the lower banner. Avoid when a separate domain below the logo is desired.
- apps/web/public/luxembourg-blue-panorama.webp: 2172 × 724 RGB, 3:1. Its location is outside the brand directory.

## Luxembourg panorama composition notes

The full image at 1080px width occupies a 360px-high panel, preserving the bridge, skyline and historic center. This works well as a bottom illustration on an ivory portrait canvas. A taller 1080 × 600 panel can use a center crop approximately 1303 × 724px, retaining about 60% of the width; favor center-right to retain both the cathedral towers and lower city. A full 9:16 cover would keep only about 407 × 724px (18.75% of the source width) and enlarge the image 2.65× at 1080 × 1920. Prefer the full panorama or a moderate crop for sharpness and narrative clarity. A slow horizontal reveal can preserve the complete panorama over time without distorting it. Do not stretch the 3:1 original.

## Exact generation prompt

Use case: ads-marketing.
Asset type: ONE premium photographic background for a vertical 9:16 TikTok commercial for Guteneo. Tall portrait image, ideally 2160x3840. Native titles and the real brand's halftone logo will be added in Remotion, so generate no text or logos.
Primary subject: an elegant fan-like arrangement of several individually prepared paper letters and matching ivory envelopes, on a real paper workshop tabletop. Each letter feels individually composed for its own recipient through subtly different margins, varied placements of delicate out-of-focus ink blocks, and small variation in the folds; no actual words, names, numbers, signatures, addresses or discernible pseudo-characters. Six or seven physical pieces layered gracefully at different depths, mostly pristine ivory paper, one very restrained cobalt card or envelope among them, emphasizing one thoughtful campaign reaching different people.
Composition: sophisticated close macro still-life photography looking diagonally over the desk, lens close to the front edge of the fan. The paper arrangement occupies the LOWER 60 to 65 percent with an elegant sweeping rhythm from bottom left toward middle right; top 35 percent is uninterrupted dark ink and subtle cobalt shadow, quiet clean title-safe space. Keep the key paper edges inside a central 80 percent safe area for a vertical video. Believable thickness, letter folds, optical perspective, depth of field and shadows; no floating paper.
Lighting and color: a controlled luminous blade of natural light grazes the folded ivory #f6f5ef paper, a restrained cobalt #2450db reflection enters one side, beautiful black-blue ink shadows. Tactile laid paper fibers, luxurious editorial cinema, genuine medium-format photograph, subtle fine grain, refined contrast, restrained richness. Nothing plastic or glossy.
Constraints: no hands, no pens or decorative clutter, no printed or invented logo, no typography, no watermark, no collage, no infographic. Photo-real physical paper and envelopes. Make distinct letters feel personal and carefully arranged, without relying on any readable content.


## Revision 2 — footer movement and postmark

- Swallows are unchanged `apps/web/public/luxembourg-blue-swallow-sheet.webp` copies in `public/brand/`, four frame-synchronized poses. Three scales appear at Luxembourg/ending start and leave before final hold.
- SVG postmark geometry/text/founding date16.09.2026/grain come from `FoundingPostage` in `apps/web/src/landing-sections.tsx`. This brand motif proves no actual postage.
- Halftone stamps use that postmark; ending cancellation appears after stamp placement, retaining face readability.
- Vertical visual clap/impact/end label removed; duration stays 56 seconds.

## Revision 4 — miniature logos

Stamps at most 80 optical units on 1080-wide stage use unchanged canonical
`apps/web/public/brand/guteneo-mark.png`, already in `public/brand/`. Large final
keeps `guteneo-halftone.webp`. Selection uses nominal size/parent scale rather
than small animated zooms, avoiding midtransition motif switches.

`mobile-web.png`/provenance remain unretouched originals. Only advertising
composition `Access` overlays the tiny header logo with simplified asset: site
CSS x22 / y16.5 / square44 at viewport 390. This changes no public website.

## Revision 5 — opening and landscape adaptation

First scene uses only simplified canonical logo without postmark on brand/document;
ending retains halftone/postmark. Landscape recomposes the same scenes at 1920 × 1080,
reusing photos/music and showing Luxembourg once. No new generated asset.
