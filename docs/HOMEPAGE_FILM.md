# Homepage introduction films

Home offers **1920 × 1080** landscape and **1320 × 2868** phone portrait. Four
languages use natural **Manon Eleven v4**, method C, native Enhance and second
plugin variation. Scenes follow original speech without acceleration. First shot
uses official simplified logo; final halftone/postmark stamp lasts five seconds.
Signature keeps two silent seconds. Music stays **0.22** through pauses/logo with
score cadence/end fade. [Narration procedure](VIDEO_NARRATION.md) owns generation;
[published evidence](VIDEO_NARRATION_PUBLISHED.md) owns exact hashes/durations.

## Presentation and playback

Choose format on click for narrow windows/touch phones in landscape; retain it
through session/rotation. No MP4 attaches before click. Posters are responsive/lazy.
User gesture starts playback/fullscreen; Safari uses `webkitEnterFullscreen`.
Fullscreen refusal keeps inline playback. Resume/close/replay are keyboard-accessible;
no autoplay.

Film/poster/captions follow resolved UI/account language. Changing language stops
and unloads old film; new one waits for click. Shared
`packages/contracts/src/public-videos.json` drives player/tests/server allowlist.
Displayed duration rounds actual timeline `durationSeconds`. Assistant/iOS scenes
illustrate the user's chosen final promise, not deployed-feature qualification.
Photos/captures retain provenance; depicted actions send nothing.

## Regeneration and media

Natural compositions reuse V5 scenes/fonts/media/animation with speech-specific
timelines. French postmark text belongs to the unchanged official logo.
Introductions V8; roles V4 EN/DE/LB, approved V3 FR. Eight qualified snapshots render
offline without keys/ElevenLabs; historical V5/V1 instrumentals remain.

```sh
npm --prefix videos/guteneo-film ci
npm run videos:render
```

Selections, dependencies and strict `--skip-existing` rules are in
[VIDEO_NARRATION.md](VIDEO_NARRATION.md). Qualification precedes writes; ignored
`videos/guteneo-film/out/` keeps masters/proof. H.264/AAC stereo, 30 fps, fast-start,
under 25 MiB/file; posters come from new scenes.

| Language | Landscape | iPhone | Four roles |
| --- | --- | --- | --- |
| French | [MP4](../apps/web/public/videos/guteneo-horizontal-v8-fr.mp4) | [MP4](../apps/web/public/videos/guteneo-vertical-v8-fr.mp4) | [MP4](../apps/web/public/videos/guteneo-roles-v3-fr.mp4) |
| English | [MP4](../apps/web/public/videos/guteneo-horizontal-v8-en.mp4) | [MP4](../apps/web/public/videos/guteneo-vertical-v8-en.mp4) | [MP4](../apps/web/public/videos/guteneo-roles-v4-en.mp4) |
| German | [MP4](../apps/web/public/videos/guteneo-horizontal-v8-de.mp4) | [MP4](../apps/web/public/videos/guteneo-vertical-v8-de.mp4) | [MP4](../apps/web/public/videos/guteneo-roles-v4-de.mp4) |
| Luxembourgish | [MP4](../apps/web/public/videos/guteneo-horizontal-v8-lb.mp4) | [MP4](../apps/web/public/videos/guteneo-vertical-v8-lb.mp4) | [MP4](../apps/web/public/videos/guteneo-roles-v4-lb.mp4) |

## Serving and validation

Range adapter is limited to catalog's twelve MP4s, serving Safari/seeking `bytes`
with 206 without buffering whole files. Existing security/indexing/private-document
storage stays unchanged. Player tests cover click loading, formats/rotation,
fullscreen/refusal, errors/recovery. Mocked API tests differ from actual MP4 playback/
seek checks. Server tests cover ranges/suffixes/bounds/If-Range/workerd. No physical
iPhone claim.

Historical instrumental candidate, 2 October 2026:

- TypeScript, application/Remotion lint, app/Worker dry-run and preview build passed.
- 93 language/range/role-permission/migration tests plus 215 security checks passed.
- 57 player tests passed on desktop Chromium/iPhone WebKit; one phone-only case skipped on desktop. Eight locale/film combinations actually decoded/searched to final card in both browsers, without video API mocks.
- Three personal-preference tests passed in desktop/mobile Chromium/iPhone WebKit. Mock sessions check media choice, not real Auth0.
- All twelve MP4s fully FFmpeg-decoded; size/hash/fast-start/30 fps/H.264-AAC checked; largest 11.77 MiB.
- Two FR V5 MP4s stayed exact. Twenty-four sampled source frames matched V5; six sampled translated end cards matched French.

Masters/captures/browser/render/decode proof:
`videos/guteneo-film/out/localized/`. Local preparation preceded publication and
performed no deployment, remote migration or provider activation. No full critical
listening/physical-phone qualification claimed. Release follows
[MAIN_RELEASE.md](MAIN_RELEASE.md), exact assets plus 206 bytes/MIME/length/seek;
current canonical-origin procedure supersedes dated two-origin instructions.
