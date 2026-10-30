# guteneo — Your words in the real world

Twelve public films use natural Manon Eleven v4 narration in FR/EN/DE/LB: horizontal/
iPhone introductions and roles overview. Original speech is never accelerated.
Current source-of-truth documentation:

- [Narration procedure](../../docs/VIDEO_NARRATION.md): method C, native Enhance, second plugin variation, immutable snapshots, constant music and offline rendering.
- [Published media/proof](../../docs/VIDEO_NARRATION_PUBLISHED.md): exact versions, durations, hashes and qualification limits.
- [Homepage player](../../docs/HOMEPAGE_FILM.md) and [roles player](../../docs/ROLES_FILM.md): locale selection, gestures, accessibility and publication checks.

Introductions are V8; roles V4 EN/DE/LB and user-approved V3 FR. All keep five silent
logo seconds/constant 0.22 music; introductions retain two silent Signature seconds.
Eight immutable `narration/releases/` libraries hold MP3/PCM24/receipts/scripts/
Enhance results/timelines, preserving every sample in order.

From this directory:

```sh
npm ci
npm run test:narration
npm run render:localized
```

Requires FFmpeg/ffprobe/cwebp. Inputs qualify before public writes. Historical
`narration/source-videos.json` preserves V5/V1; natural libraries bind their own music
bases. `scripts/render-natural-sources.mjs` initializes sources only in ignored
`out/`; snapshots cannot be replaced. Plugin supplies synthesis; Safari supplies
native Enhance/Scribe. Old API adapter stays blocked before network, independently
of plugin access. Only FR roles were user-listened/approved; other proof is technical.

## Historical films

Original independent French brand film: **46 seconds, 1920 × 1080, 30 fps**,
H.264/AAC stereo, `out/guteneo-film-1080p.mp4`. Ignored `out/`/`node_modules/` contain
outputs/dependencies; tracked source/media/fonts/lockfiles reproduce it.

Second **56-second** iPhone/TikTok future-product film:
`out/guteneo-vertical-vision-1080x1920.mp4`; [storyboard](docs/VERTICAL_FILM.md).
First film remained intact. Revision4 native exports:
`out/guteneo-v4-iphone-18-pro.mp4` 1206 × 2622 and
`out/guteneo-v4-iphone-18-pro-max.mp4` 1320 × 2868, one Luxembourg scene, simplified
miniature logo, halftone/postmarked large final stamp. Earlier exports retained.

## Instrumental V5 sources

The 56-second campaign has landscape `Guteneo-Horizontal-Vision` 1920 × 1080 and
`Guteneo-iPhone-18-Pro-Max` 1320 × 2868, individually recomposed scenes/shared score.
Both open with simplified unpostmarked logo; large ending retains halftone/postmark.
Masters: `out/guteneo-v5-horizontal-1080p.mp4`, `out/guteneo-v5-vertical-iphone.mp4`.
Optimized web MP4s/posters live at repository `apps/web/public/videos/`.

```sh
npm run render:horizontal
npm run render:iphone:pro-max
```

## Review and edit

```sh
cd videos/guteneo-film
npm ci
npm run dev
npm run lint
npm run render
```

Open **Guteneo-Film** in Remotion Studio. `src/scenes/` contains editable React
text/motion/framing/duration. Animation is frame-driven, never real-time CSS.
`render:review` creates 960 × 540 proof; full original is exactly 1,380 frames
including transitions.

| Time | Original scene meaning |
| --- | --- |
| 0–5 s | Words in the real world: document/stamp/identity |
| 5–13 s | Reconstructed ChatGPT/PDF/preparation/icon |
| 13–20 s | Actual workspace/synthetic-letter review captures |
| 20–25 s | Generated printed-paper photo/camera motion |
| 25–31 s | Generated envelope-handover photo |
| 31–36 s | Generated fax photo |
| 36–40 s | Invitation to give words reach |
| 40–41 s | Visual clap, closure/impact at 40.500 s |
| 41–46 s | Official stamp and guteneo.com only |

## Brand, media and claim boundaries

Official `apps/web/public/brand/guteneo-mark.png`/`guteneo-portrait.png` copies supply
stamp/icon; compose ending URL separately. Paper #f6f5ef, ink #181b22, blue #2450db;
local EB Garamond/IBM Plex Sans/Mono with licenses. Three generated images have
[provenance](public/images/PROVENANCE.md). Frontend captures have no customer data/
DOM retouching and retain native demo disclosures; [capture provenance](public/frontend/provenance.md).
ChatGPT is an explicitly labeled advertising reconstruction, not an actual chat
recording/published-widget proof. [Local synthetic instrumental/audio](public/audio/README.md)
uses no third-party music extracts; clap is already in the master.

Physical scenes illustrate uses with staging disclosures, not actual delivery.
Workspace data/prices/addresses are synthetic. Original film promises no ChatGPT
Store availability, guaranteed postal receipt or entirely in-chat standard journey.
Production creates no business approval/send/deployment/publication; renderer has
no business binding/secret/customer account and needs no remote assets after install.

Historical checks: video TypeScript/lint, repository lint, full review render,
nine-scene/framing inspection, duration/tracks/codec and full MP4 decoding.
Audio metrics are automated, without human-listening claim.
