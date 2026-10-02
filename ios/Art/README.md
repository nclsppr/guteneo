# Illustration de l’atelier Guteneo

## Destination et usage

- Asset SwiftUI : `Image("PrintWorkshop")`.
- Fichier : `../Guteneo/Resources/Assets.xcassets/PrintWorkshop.imageset/illustration.png`.
- Rôle : illustration décorative de l’Atelier, masquée à VoiceOver par la vue qui la présente.
- Une presse manuelle, une feuille vierge, un rouleau et trois blocs de caractères vus sans inscription évoquent l’imprimerie de Gutenberg. Ce visuel ne représente aucun document ni envoi utilisateur.
- Conserver les couleurs originales et le canal alpha. Ne pas appliquer le mode template : les surfaces ivoire et les hachures participent à l’illustration.

## Provenance

- Date de génération et de contrôle : 22 septembre 2026.
- Outil : outil intégré `image_gen.imagegen` de Codex.
- Mode : une génération originale sans référence, puis une unique édition ciblée pour reprendre le bleu électrique du logo Guteneo à la demande de l’utilisateur.
- Modèle sous-jacent : non indiqué par l’outil ; aucun identifiant de modèle n’est revendiqué.
- Aucun logo existant retouché, aucune image web importée. Le portrait Guteneo a servi uniquement de référence de couleur lors de l’édition, sans être incorporé à l’illustration.
- Source de la génération initiale, conservée par l’outil :
  `/Users/nclsppr/.codex/generated_images/01a0c63b-ed38-7e32-964e-e58de813043b/exec-c6c9448c-dfd1-466a-a54a-1d96a72af56d.png`.
- SHA-256 de cette première version : `8e142343cd7ce14b23732a0d93e34d35e8ae49cf36eb7136222de4d5a89c34bf`.
- Références de l’édition, dans cet ordre : cette première version, puis `BrandPortrait.imageset/image.png` (SHA-256 `df22d2f73f7e281ece61a2c99b5331d30be344e647dc97c738d09f9df122fb9a`, inchangé après l’édition).
- Source finale conservée par l’outil :
  `/Users/nclsppr/.codex/generated_images/01a0c63b-ed38-7e32-964e-e58de813043b/exec-eda73303-f432-4317-9d27-340dff388ac1.png`.
- Copie binaire identique de cette sortie finale dans le catalogue d’assets ; aucun recadrage, conversion, recoloriage ou détourage logiciel après génération.
- SHA-256 final : `6310e804ad2494f55e59db3d22007e7e2c4402a94815f487a07108e9a80781f3`.

## Caractéristiques et contrôle

- PNG RGBA, 1 536 × 1 024 pixels, ratio 3:2, 2 220 618 octets.
- Couleur demandée : bleu électrique `#0033F9`, présent dans le logo existant. Le logo et l’illustration ont des nuances ; le fichier ne revendique pas une couleur unique sur chaque pixel. Le résultat conserve les surfaces ivoire et les variations des hachures.
- Transparence réelle : 1 000 845 pixels avec alpha 0 ; 572 019 pixels à alpha intermédiaire ; maximum alpha 254.
- Les quatre coins et des échantillons dans les espaces extérieurs et entre les montants ont un alpha nul. Les valeurs RGB invisibles sous alpha 0 n’ont pas été supprimées.
- Inspection à taille originale : sujet entier dans le cadre, aucune inscription, aucun logo ni visage.
- Rendu navigateur de contrôle de la version finale à 280 pixels CSS de large, comparée au logo, sur papier `#F6F5EF` et sombre `#17191E` : bleu électrique cohérent, silhouette reconnaissable, feuille vierge visible, fond transparent sans cartouche ni halo visible. Le canal RGB sous alpha nul conserve des valeurs invisibles, qui ne doivent pas être affichées sans le canal alpha.
- L’édition corrige le bleu marine de la première version et demande explicitement la suppression du halo extérieur. Le contrôle du placement final dans l’application appartient à l’intégration SwiftUI.

## Prompt initial exact

```text
Use case: illustration-story.
Asset type: one original decorative editorial illustration for the Atelier screen of a native iOS correspondence application, not a UI mockup, not a logo, not a user's document.
Create a small manual letterpress printing workshop: one compact historic hand-operated screw press inspired by Gutenberg, its two upright posts, clear screw and platen, and one plain blank ivory sheet emerging from its bed. Beside it place just a small ink brayer and three simple wooden type blocks turned away so no letters or symbols are visible.
Style: exquisite restrained copperplate etching and editorial engraving, fine but confident cobalt-ink contours, sparse cross-hatching and delicate halftone. Mature and elegant, recognizable silhouette at 280 pixels wide, avoid overly dense tiny detail. Not a photograph, not a toy, not caricature, not glossy 3D.
Palette: rich cobalt ink #2450DB, with a little warm ivory #F6F5EF confined ONLY to the physical paper sheet and a few press surfaces. No other colors, no black ink. Airy horizontal 3:2 composition, 1536 by 1024 pixels if available; the entire press, brayer, blocks and sheet must remain inside the frame with generous clear margins. Three-quarter view, balanced, compact grouping, refined editorial character.
CRITICAL OUTPUT: isolated subject on a genuinely transparent alpha background. Every area outside the illustrated objects must have alpha=0, including space through the press. No white or ivory rectangular background, no checkerboard painted into the image, no full floor, no vignette, no backdrop, no enclosing badge or border. Preserve the ivory physical sheet while leaving the surroundings truly transparent. No text, no letters, no numbers, no logos, no watermark, no brands, no faces, no people, no interface. Produce exactly one finished illustration.
```

## Prompt d’édition exact

```text
Use case: illustration-story. EDIT the first reference image only. The second reference is the existing Guteneo portrait logo, supplied ONLY as a blue-color reference; never incorporate, redraw, or edit that logo.

Keep the first illustration's exact composition and subject: the manual Gutenberg-style screw printing press, blank ivory sheet, brayer and three blank wooden blocks. Preserve the elegant editorial copperplate engraving, confident contours, hatching, object shapes, perspective, margins and 3:2 layout. No new objects, no typography or letters, no faces, no brand or logo within the illustration.

Make this one targeted correction: replace the muted navy-blue ink with the same vivid electric blue as the Guteneo reference logo. Use #0033F9 (RGB 0,51,249) as the principal ink color, allowing modest lightness variations for engraved hatching while retaining the unmistakable saturated electric-blue appearance. Do not drift back into navy or purple. Keep warm ivory #F6F5EF only on the physical sheet and existing ivory object surfaces.

Remove ALL blue halos, blurred glows, fog, ground shadows and background tint outside the physical illustrated objects. Deliver genuine transparent PNG alpha, every exterior area and openings through the press fully alpha=0. Clean precise antialiased edges, no colored haze around the cutout. No white or ivory backdrop, no painted checkerboard, no enclosing border. The press, sheet and tools must remain fully inside the frame and recognizable at 280 pixels wide. Produce exactly one finished corrected illustration at 1536x1024 if available.
```
