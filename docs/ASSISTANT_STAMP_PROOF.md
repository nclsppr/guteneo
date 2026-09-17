# Assistant stamps — 17 September 2026

The user requested postage-stamp framing for the four assistant logos, preserving their original colors and adding a light dither treatment consistent with Guteneo's printing workshop.

The implementation changes only the homepage logo component and its CSS. Each logo sits on a clean ivory center, surrounded by a blue dotted print border and a perforated paper edge. The marks retain their original SVG files, proportions and native colors. Texture and perforation masks belong to a separate decorative paper layer; no filter, tint, opacity, blending or texture is applied to the logo images. Official asset sources and hashes remain documented in [ASSISTANT_BRAND_ASSETS.md](ASSISTANT_BRAND_ASSETS.md).

The four stamps share the same dimensions and centered alignment. Desktop shows four columns; mobile shows two. Product names stay on the clean center, with connection availability outside the decorative frame. The framing has no hover behavior or interaction, its paper layers ignore pointer events and are hidden from assistive technology. This decoration does not claim postage validity, partnership, endorsement or an active assistant connection.

Validation for this slice:

- Preview build, TypeScript and scoped ESLint passed.
- Both existing homepage browser cases passed: desktop Chromium and iPhone WebKit. They verify four image loads, correct availability, installation interactions, customer pricing, runtime errors and horizontal overflow.
- The refreshed installation screenshots were visually inspected directly and by an independent reviewer. Both passed: balanced perforations, clear marks and labels, no visible clipping or overlap.
- No generated image or modified logo was needed; the stamp is a responsive HTML/CSS decoration. Original SVG source bytes are unchanged.

Screenshots: `reports/screenshots/homepage/installation-desktop.png` and `installation-iphone.png`. These are local candidate checks; deployment is handled separately.
