# guteneo — the final product promise

Second independent spot: **56 seconds / 30 fps**. Revision 5 simplifies first scene
logo without postmark, including paper. Historical master
`out/guteneo-v5-vertical-iphone.mp4`1320 × 2868; `Guteneo-Horizontal-Vision` recomposes
1920 × 1080. Retained revision 4 exports:

| Export | Dimensions | Composition |
| --- | --- | --- |
| `out/guteneo-v4-iphone-18-pro.mp4` | 1206 × 2622 | Guteneo-iPhone-18-Pro |
| `out/guteneo-v4-iphone-18-pro-max.mp4` | 1320 × 2868 | Guteneo-iPhone-18-Pro-Max |

Dimensions came from [Apple specs](https://www.apple.com/iphone-18-pro/specs/),
consulted 22 September 2026. Historical 1080 × 1920 social `Guteneo-Vertical-Vision`
and V1/V2/V3 exports remain. Stage width 1080/proportional height recomposes positions,
full-height photos and original text/stamp/document proportions without stretching
old MP4/adding bars.

## Chosen creative scope

The user explicitly chose the finished-product vision: no availability caveat,
coming-soon/project/staging labels inside this advertisement. This is not actual
availability qualification. Prior [claims audit](vertical-claims.md) stays separate;
no send/business change/deployment occurred.

The film portrays 10,000+ documents, campaign personalization, original/template PDF,
ChatGPT/Claude/Copilot, assistant generation, document/quote review, ordinary/encrypted
email, fax, printing/European post, web and proposed iOS app. Conversation/review/iOS
screens are original React advertising concepts, not deployed-feature recordings.
The mobile homepage is an actual public capture with provenance; revision 4 only
overlays simplified tiny header logo for readability.

## Visual and audio direction

Ivory/ink/cobalt; official `gutenberg-portrait-stamp.webp` for large/final 425-unit
stamp. Miniatures ≤80 optical units on 1080-wide stage (~27–33 target-iPhone points)
use official `guteneo-mark.png`; no reconstruction. Stamps retain postmarks.
Capture PNG is untouched; Remotion overlays only its tiny header logo.
Footer Luxembourg panorama appears once in Europe sequence at native aspect with
moderate crop/camera movement.

Numeric scale, perspective documents, arriving letters/personalized names/fast
panels/zooms/pan/web-to-app phone transition/official swallow movement animate the
story. Footer Luxembourg postmark retains grain/waves. Text stays clear of social
side controls/captions: working lateral margins 80/160 px, primary content above 1600 px.
Original **120 BPM/56 s** music removes clap/end label and starts logo signature at
**51 s** after blue typographic card. [Audio provenance](../public/audio/vertical-provenance.md).

## Edit

| Time | Scene meaning |
| --- | --- |
| 0–3 | Everything starts with a document |
| 3–6 | Scale1→10,000+ |
| 6–10 | Simple/personalized campaigns |
| 10–14 | Existing PDF/template |
| 14–18 | ChatGPT/Claude/Copilot |
| 18–23 | Assistant creates/prepares |
| 23–29 | Document/recipient/quote before consent |
| 29–35 | Fax/post/ordinary and encrypted email |
| 35–40 | Europe/blue Luxembourg |
| 40–44 | Printing/handover/fax photo scenes |
| 44–49 | Website/proposed iOS interface |
| 49–51 | Ivory typographic signature/blue/swallow card |
| 51–56 | Subtle flight, postmarked halftone/guteneo.com; birds leave before hold |

## Reproduce/edit

From `videos/guteneo-film`:

```sh
npm ci
npm run dev
npm run lint
npm run render:iphone:pro
npm run render:iphone:pro-max
# Social 9:16 variant
npm run render:vertical
```

Studio compositions above; `src/vertical/`; quick `render:vertical:review`.
Images/fonts/logos/audio are local `public/`, needing no account/business service.
Generated vertical paper image has [provenance](../public/vertical/PROVENANCE.md).
No additional software/plugin/service purchase.

Checks: video lint/TypeScript, extracted-frame composition, independent reading-area/
rhythm audit,1,680-frame audio synchronization, codec/dimensions/tracks/pixel aspect/
full decode. Native exports were checked through rendered frames, not physical
iPhone playback. Audio proof is technical, not human listening.
