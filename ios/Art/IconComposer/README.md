# Guteneo icon for Icon Composer

The native [AppIcon.icon](../../Guteneo/Resources/AppIcon.icon) document combines
two layers: opaque ivory paper `#F6F5EF` and the transparent **official halftone
portrait**. The portrait appears once. Its blue comes from the existing brand
file; no other hue was generated for normal mode. Tinted renders follow the
color chosen by the user in iOS.

The classic `AppIcon.appiconset` remains in the repository for comparison.
Xcode selects the Icon Composer document with the same `AppIcon` name and
builds compatibility renders for the application's older supported systems.

## Sources and preparation

- Portrait source: `../../Guteneo/Resources/Assets.xcassets/BrandPortrait.imageset/image.png`,
  512 × 512, SHA-256 `df22d2f73f7e281ece61a2c99b5331d30be344e647dc97c738d09f9df122fb9a`.
- Paper: [01-paper.svg](01-paper.svg), a 1024 × 1024 vector rectangle covering
  the full canvas; the native document contains the identical SVG.
- [prepare-portrait.swift](prepare-portrait.swift) centers the unchanged color
  portrait at 840 × 840 on a 1024 × 1024 RGBA canvas. The script neither redraws
  nor removes the logo background. The resulting layer has a real alpha
  channel and 92-pixel margins on each side.
- The two-layer document was explored in **Icon Composer**, installed with
  Xcode 27; the editable `.icon` package was then retained in the repository.
  Its official `ictool` 27.0 (129) binary produced five unedited local previews.

## Verification on 22 September 2026

- [Normal 1024 px render](previews/default.png) and
  [64 px render](previews/small.png): the single portrait remains recognizable
  and its blue matches the logo. Dark, tinted and generation-26 modes were
  also exported and inspected locally; their outputs are not the icon source.
- iOS simulator build passed with Xcode 27. The compiled catalog contains
  `AppIcon.iconstack` with three planes (system background and two groups),
  plus 1024 px iPhone/iPad renders in light and dark modes. Compiled renders
  are opaque. The binary manifest references `AppIcon` as the primary icon
  for both families. `assetutil --validate-file` validates the catalog.
- Transparent rounded corners in **system previews** come from the iOS mask;
  the document's paper covers the icon canvas. Transparent-logo requirements
  apply to the interface portrait and this icon's foreground, not to the
  distribution bitmap composed by Xcode.

This local verification does not replace testing the installed icon on a
physical device or validating a signed distribution archive.

[Apple Icon Composer guide](https://developer.apple.com/documentation/xcode/creating-your-app-icon-using-icon-composer).
