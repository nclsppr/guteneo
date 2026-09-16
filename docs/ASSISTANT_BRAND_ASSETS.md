# Assistant brand assets

Fetched and checked on **2026-09-17, Europe/Paris** (2026-09-16 UTC). These files identify the named products in Guteneo's assistant choices and setup information. Their presence does not assert a partnership, endorsement, provider approval, or a working/qualified integration.

All four SVG files are **unchanged source bytes**: only their local filenames differ. No third-party icon library, traced artwork, generated imitation, recoloring, path simplification, cropping, or added texture was used. Apply Guteneo's blue/ivory surfaces and dither to surrounding UI only. Preserve each SVG's aspect ratio and internal spacing; render as an image with the product's visible name nearby.

## ChatGPT

- Local file: `apps/web/public/brands/chatgpt.svg` — 2,969 bytes; black OpenAI Blossom.
- First-party guidance: <https://openai.com/brand/>.
- Source archive: <https://cdn.openai.com/brand/OpenAI-Logos-2025.zip>.
- Exact member: `OpenAI-logos(new)/SVGs/OpenAI-black-monoblossom.svg`.
- ChatGPT identification context: <https://help.openai.com/en/articles/7905742-what-does-the-official-chatgpt-ios-app-icon-look-like> identifies the black OpenAI symbol as the official ChatGPT app mark.
- SHA-256: `7be72f1fea831d3ba81a545cee79b7e0ae69449d5d7837c9571ccbfb4aa1e00b`.

OpenAI owns this mark. Its published guidelines allow use subject to their terms, only in relation to OpenAI services, with the original appearance and clear space. They prohibit recoloring, modifications, misleading endorsement, and making the mark more prominent than the site's own brand. The Blossom must not become Guteneo's primary branding. This is a product identifier, not a partnership lockup; no partnership approval is claimed.

## Claude

- Local file: `apps/web/public/brands/claude.svg` — 2,580 bytes; Claude Spark in its supplied Clay color.
- Official discovery page: <https://www.anthropic.com/news>, under Media assets / Download press kit.
- Source link: <https://www.anthropic.com/press-kit>.
- Resolved first-party archive: <https://www-cdn.anthropic.com/ae59ca4ca194dac9c9dc3bc78c5829468cb0e8af.zip>.
- Exact member: `Anthropic media resources/Anthropic logos/Claude logos/3 Claude Spark/SVG/Claude Spark - Clay.svg`.
- SHA-256: `6d53db4be375e899c937c26cf16684a80d6e869b1928d72b37748bef2560e219`.

Anthropic supplies this standalone symbol in its public media kit. The downloaded kit did not include a standalone logo-use license or detailed branding rules; broad marketing-use permission has therefore not been established by this acquisition. Preserve the supplied color and geometry, identify Claude accurately, and do not imply endorsement or incorporate the Spark into Guteneo's own mark. No specific permission or approval from Anthropic is claimed.

## Grok

- Local file: `apps/web/public/brands/grok.svg` — 9,758 bytes; the official white slashed-ring mark on its supplied dark rounded square.
- Official discovery page: <https://grok.com/>, whose icon link references `/images/favicon.svg`.
- Direct source: <https://grok.com/images/favicon.svg>.
- First-party guidance: <https://x.ai/legal/brand-guidelines>.
- Brand-pack link exposed by those guidelines: <https://data.x.ai/logos/SpaceXAI_Grok_Assets.zip>.
- SHA-256: `c3db0dfaf760b702b8490c6cbefe07fd8bfe00db43cae6a0acccf768f44d6179`.

The brand-pack download returned HTTP 403, so this is the current first-party website icon, copied without edits. Equivalence to a member of the downloadable brand pack has **not** been established. The guidelines permit accurate references under their usage terms, prohibit misleading sponsorship and altered logos, and specifically refer to the supplied pack for logo use. The favicon's reuse under that pack-specific provision remains unclear; official provenance alone is not a separate permission grant. No endorsement or active integration is claimed.

The original favicon includes one inert `foreignObject` for its vendor-authored backdrop-blur styling. It contains no script, event handlers, or external resource references. Preserve the original file and load it with an image element rather than copying its markup into the document.

## Cursor

- Local file: `apps/web/public/brands/cursor.svg` — 793 bytes; the supplied dark 2D cube for light backgrounds.
- First-party guidance and download page: <https://cursor.com/brand>.
- Archive linked directly from that page: <https://ptht05hbb1ssoooe.public.blob.vercel-storage.com/assets/brand/cursor-brand-assets.zip>.
- Exact member: `General Logos/Cube/SVG/CUBE_2D_LIGHT.svg` (`LIGHT` denotes the background variant; the supplied mark is dark).
- SHA-256: `c483c02f78eb2619778fdd959e72a9adfac4844854472cd2653d4cbfd60e4d71`.

Cursor's official page explicitly offers its standalone cube and describes 2D as the default logo style. It asks that the product be called Cursor, rather than Cursor AI or Cursor Code. The page and archive did not provide a comprehensive reuse license; no separate trademark permission or partnership is claimed. Preserve the provided form and use it only to identify Cursor.

## Verification and limits

- Compared each local file byte-for-byte to its source archive member or direct download and recorded its SHA-256 above.
- Parsed all four as SVG XML; checked for scripts, event handlers, embedded execution elements, and external `href`/`src` references. None were found. Grok's original inert `foreignObject` is documented above.
- Rasterized all four originals together for visual inspection on an ivory background: recognizable symbols, intact proportions, no clipped paths, and visible native colors.
- Source artwork remains separate from Guteneo artwork and is not relicensed by this repository. The applicable marks remain their respective owners' property. Asset acquisition does not establish runtime compatibility, connection status, or production readiness.
- This asset-only change does not modify the application or deploy it. Integrated page layout, accessibility, and production proof belong to the homepage change.
