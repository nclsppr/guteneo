# Guteneo workspace illustration

## Destination and use

- SwiftUI asset: `Image("PrintWorkshop")`.
- File: `../Guteneo/Resources/Assets.xcassets/PrintWorkshop.imageset/illustration.png`.
- Role: decorative workspace illustration, hidden from VoiceOver by its presenting view.
- A manual press, blank sheet, roller and three unlettered type blocks evoke Gutenberg's printing workshop. This visual represents no user document or dispatch.
- Preserve original colors and alpha. Do not apply template mode: ivory surfaces and hatching belong to the illustration.

## Provenance

- Generation and inspection date: 22 September 2026.
- Tool: Codex's built-in `image_gen.imagegen`.
- Mode: one original generation without references, then one targeted edit to match the Guteneo logo's electric blue at the user's request.
- Underlying model: not disclosed by the tool; no model identifier is claimed.
- No existing logo was edited and no web image imported. The Guteneo portrait served only as the editing color reference and was not incorporated into the illustration.
- Initial generation source retained by the tool:
  `/Users/nclsppr/.codex/generated_images/01a0c63b-ed38-7e32-964e-e58de813043b/exec-c6c9448c-dfd1-466a-a54a-1d96a72af56d.png`.
- Initial version SHA-256: `8e142343cd7ce14b23732a0d93e34d35e8ae49cf36eb7136222de4d5a89c34bf`.
- Editing references, in order: that initial version, then `BrandPortrait.imageset/image.png` (SHA-256 `df22d2f73f7e281ece61a2c99b5331d30be344e647dc97c738d09f9df122fb9a`, unchanged by the edit).
- Final source retained by the tool:
  `/Users/nclsppr/.codex/generated_images/01a0c63b-ed38-7e32-964e-e58de813043b/exec-eda73303-f432-4317-9d27-340dff388ac1.png`.
- Byte-identical copy of the final output in the asset catalog; no software cropping, conversion, recoloring or background removal after generation.
- Final SHA-256: `6310e804ad2494f55e59db3d22007e7e2c4402a94815f487a07108e9a80781f3`.

## Properties and inspection

- RGBA PNG, 1,536 × 1,024 pixels, 3:2 ratio, 2,220,618 bytes.
- Requested color: electric blue `#0033F9`, present in the existing logo. Both logo and illustration contain shades; the file does not claim a single color in every pixel. It preserves ivory surfaces and hatching variations.
- Actual transparency: 1,000,845 pixels with alpha 0; 572,019 with intermediate alpha; maximum alpha 254.
- All four corners and samples outside and between the uprights have zero alpha. Invisible RGB values beneath alpha 0 were not removed.
- Original-size inspection: whole subject within the frame, no lettering, logo or face.
- Final browser inspection at 280 CSS pixels wide, compared with the logo on paper `#F6F5EF` and dark `#17191E`: consistent electric blue, recognizable silhouette, visible blank sheet and transparent background without a visible panel or halo. RGB beneath zero alpha retains invisible values and must not be shown without the alpha channel.
- The edit corrects the initial navy blue and explicitly requests removal of the exterior halo. Final in-app placement verification belongs to the SwiftUI integration.

## Exact initial prompt

```text
Use case: illustration-story.
Asset type: one original decorative editorial illustration for the Atelier screen of a native iOS correspondence application, not a UI mockup, not a logo, not a user's document.
Create a small manual letterpress printing workshop: one compact historic hand-operated screw press inspired by Gutenberg, its two upright posts, clear screw and platen, and one plain blank ivory sheet emerging from its bed. Beside it place just a small ink brayer and three simple wooden type blocks turned away so no letters or symbols are visible.
Style: exquisite restrained copperplate etching and editorial engraving, fine but confident cobalt-ink contours, sparse cross-hatching and delicate halftone. Mature and elegant, recognizable silhouette at 280 pixels wide, avoid overly dense tiny detail. Not a photograph, not a toy, not caricature, not glossy 3D.
Palette: rich cobalt ink #2450DB, with a little warm ivory #F6F5EF confined ONLY to the physical paper sheet and a few press surfaces. No other colors, no black ink. Airy horizontal 3:2 composition, 1536 by 1024 pixels if available; the entire press, brayer, blocks and sheet must remain inside the frame with generous clear margins. Three-quarter view, balanced, compact grouping, refined editorial character.
CRITICAL OUTPUT: isolated subject on a genuinely transparent alpha background. Every area outside the illustrated objects must have alpha=0, including space through the press. No white or ivory rectangular background, no checkerboard painted into the image, no full floor, no vignette, no backdrop, no enclosing badge or border. Preserve the ivory physical sheet while leaving the surroundings truly transparent. No text, no letters, no numbers, no logos, no watermark, no brands, no faces, no people, no interface. Produce exactly one finished illustration.
```

## Exact editing prompt

```text
Use case: illustration-story. EDIT the first reference image only. The second reference is the existing Guteneo portrait logo, supplied ONLY as a blue-color reference; never incorporate, redraw, or edit that logo.

Keep the first illustration's exact composition and subject: the manual Gutenberg-style screw printing press, blank ivory sheet, brayer and three blank wooden blocks. Preserve the elegant editorial copperplate engraving, confident contours, hatching, object shapes, perspective, margins and 3:2 layout. No new objects, no typography or letters, no faces, no brand or logo within the illustration.

Make this one targeted correction: replace the muted navy-blue ink with the same vivid electric blue as the Guteneo reference logo. Use #0033F9 (RGB 0,51,249) as the principal ink color, allowing modest lightness variations for engraved hatching while retaining the unmistakable saturated electric-blue appearance. Do not drift back into navy or purple. Keep warm ivory #F6F5EF only on the physical sheet and existing ivory object surfaces.

Remove ALL blue halos, blurred glows, fog, ground shadows and background tint outside the physical illustrated objects. Deliver genuine transparent PNG alpha, every exterior area and openings through the press fully alpha=0. Clean precise antialiased edges, no colored haze around the cutout. No white or ivory backdrop, no painted checkerboard, no enclosing border. The press, sheet and tools must remain fully inside the frame and recognizable at 280 pixels wide. Produce exactly one finished corrected illustration at 1536x1024 if available.
```
