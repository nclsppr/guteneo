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


## Révision 2 — mouvements du footer et oblitération

- Hirondelles : copie inchangée de `apps/web/public/luxembourg-blue-swallow-sheet.webp` dans `public/brand/`, quatre poses synchronisées aux images Remotion. Trois oiseaux de tailles différentes sur les plans Luxembourg et au début du final. Ils quittent le cadre avant la tenue finale.
- Cachet : géométrie SVG, textes, date fondatrice du 16.09.2026 et grain repris du composant `FoundingPostage` de `apps/web/src/landing-sections.tsx`. Ce motif de marque ne constitue pas un affranchissement postal réel.
- Les timbres tramés sont composés avec ce cachet ; l’oblitération du final apparaît après la pose du timbre, laissant le visage lisible.
- Le clap visuel, son impact et la mention « fin » sont supprimés de la composition verticale. La durée demeure 56 secondes.

## Révision 4 — logos miniatures

Les timbres d’au plus 80 unités optiques dans le stage de 1080 de large utilisent l’asset canonique inchangé `apps/web/public/brand/guteneo-mark.png`, déjà présent dans `public/brand/`. Le grand timbre final conserve `guteneo-halftone.webp`. La sélection dépend de la taille nominale et du facteur de réduction du parent, pas des petits zooms animés, ce qui évite un changement de motif en pleine transition.

`mobile-web.png` et son fichier de provenance restent des captures originales non retouchées. Dans la composition vidéo `Access` uniquement, une couche native Remotion couvre le logo d’en-tête (position CSS du site : x22, y16.5, carré44 dans un viewport390) et le remplace par l’asset simplifié. Cette composition publicitaire ne constitue pas un changement du site public.

## Révision 5 — ouverture et adaptation horizontale

La première scène utilise uniquement le logo simplifié canonique, sans cachet postal, dans la marque et sur le document. Le final conserve le timbre tramé et son cachet. Le nouveau spot horizontal recompose les mêmes séquences en 1920 × 1080, réutilise les mêmes photographies et la même musique, et ne montre Luxembourg qu’une fois. Aucun nouvel asset généré.
