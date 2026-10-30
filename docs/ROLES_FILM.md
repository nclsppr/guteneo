# Roles overview video

Public `/roles/` has FR/EN/DE/LB **Manon Eleven v4** films. Player/poster/captions
follow site/account language; displayed actual catalog duration varies by natural
speech. All screens use landscape and the shared homepage click/native/fullscreen/
error-recovery player.

Wording follows `packages/contracts/src/roles.ts`/[WORKSPACE_ROLES.md](WORKSPACE_ROLES.md):
administrator manages/approves; supervisor prepares with independent default-off
approval/reporting; operator imports/prepares without approval; observer reads
without mutation/approval. Standard review is an authorized browser-person action.
Film changes no authority/migration.

## Narration and editing

[VIDEO_NARRATION.md](VIDEO_NARRATION.md) owns method C, native Enhance, second
plugin variation, recorded IDs/MP3s, explicit tag edits and immutable PCM24 cuts.
Six cuts preserve all three two-paragraph takes without acceleration; compositions
are `Guteneo-Roles-{FR,EN,DE,LB}-Natural-C`.

Approved FR keeps V3 exact bytes, **44.8667 seconds**. Others use V4;
[asset evidence](VIDEO_NARRATION_PUBLISHED.md) owns durations/hashes. Historical
36-second compositions stay archived.

| FR scene start | Message meaning |
| --- | --- |
| 0 s | Introduce four roles and their rights |
| 4.53 s | Administrator manages workspace, prepares, approves, reads reports |
| 11.60 s | Supervisor prepares; approval/reporting are distinct and initially off |
| 19.27 s | Operator imports/prepares without approval |
| 25.13 s | Observer reads without mutation/approval |
| 34.33 s | An authorized person approves in browser |
| 39.87–44.87 s | Same official stamp/guteneo.com; five silent seconds |

Each locale directly reuses `src/landscape/End.tsx`/V5 logo, constant music **0.22**,
score cadence/end fade. Immutable offline snapshots call no provider.

```sh
npm run videos:render -- --kind roles
```

Assets `guteneo-roles-v3-fr.mp4`, `guteneo-roles-v4-{en,de,lb}.mp4` are 1920 × 1080,
H.264/AAC stereo, 30 fps, fast-start, with WebP/VTT. Manifest contains exactly these
four plus eight introductions. No business send; new-language technical proof is
not human listening.

Real-file player tests check progress/end seek per locale. Linux CI uses official
`WEBKIT_GST_USE_PLAYBIN3=1`: prior GStreamer stalled three files near 0.14 seconds
despite full FFmpeg/native-Safari playback. Current pipeline uses original bytes,
unchanged media/assertions; this is Linux test-browser configuration, not published
player/macOS/iOS Safari.
[WebKit selector source](https://github.com/WebKit/WebKit/blob/4d05d732e5a84f32675bef4cc135a2e7a9269a87/Source/WebCore/platform/graphics/gstreamer/MediaPlayerPrivateGStreamer.cpp).

Roles/invitations were already published in `8b060bb` (PR #37). This adds localized
media/playback without permissions/migration changes. Migrations 0042/0043 remain
in the role contract. Local preparation/publication proof remain distinct; video
publication sends no communication.
