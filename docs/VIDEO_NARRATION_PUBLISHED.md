# Natural narration — 3 October 2026 batch

All twelve active catalog films use **Manon Voix française spontanée sérieuse**,
Eleven v4 and method C: three complete-sentence contextual blocks in the declared
language. Introductions are V8; EN/DE/LB roles V4; approved FR roles retain V3 exact
bytes. Film/poster/captions/displayed duration follow resolved UI/account language;
never substitute another language's media.

Native ElevenLabs Enhance, accepted with Keep in Safari, processed eight complete
scripts. Each immutable snapshot retains exact native output; later calm-tone/pause
changes are recorded in `editorialEdits`. Creative plugin generated two variations/
block with explicit language, selecting second by actual session/generation IDs.
Provenance `elevenlabs-creative-plugin`, `variationIndex:2` differs from historical
second web generation.

Eight `narration/releases/*-natural-c-v1/` snapshots retain **24 selected MP3s and
68 PCM24 WAVs**. Cuts exactly reconstruct three canonical sources without missing
words/acceleration. Scenes follow actual speech. FR/EN/DE use Whisper word timing;
LB uses native Scribe JSON without expected script/keyterms after inadequate local
transcription. Archived lexical ASR variants are not human listening evidence.

Music stays at **0.22** through speech/pauses/logo, retaining score cadence/end fade.
Each film reuses official conclusion component/media for **150 frames at 30 fps**
without narration; introductions also retain two silent Signature seconds. All
twelve logo frames at matched local position equal corresponding historical ones.
Mixing preserves new music-base H.264 packets. Exports: H.264/AAC stereo, 30 fps,
fast-start, below 25 MiB/file. Both introduction formats share one locale VTT;
roles have a separate track. Posters come from new scenes; qualified timelines
supply exact catalog duration.

| Public file                         | Duration     | Bytes   | SHA-256                                                            |
| -------------------------------------- | --------- | -------- | ------------------------------------------------------------------ |
| `/videos/guteneo-horizontal-v8-fr.mp4` | 66.5000 s | 11244768 | `43316dde6e0a8cfabb667b782ef09aae26d35db79287b1e597908fa8b7ce6eb9` |
| `/videos/guteneo-vertical-v8-fr.mp4`   | 66.5000 s | 13753772 | `594a2eb91aeab05419a721451d204eecb47335be05bdaf8f6653e46e382463c9` |
| `/videos/guteneo-roles-v3-fr.mp4`      | 44.8667 s | 2332702  | `59342f77a5ca4b6e8975c34ca7b72fdd53cd408c486f9565d3785a145fb9e88e` |
| `/videos/guteneo-horizontal-v8-en.mp4` | 65.8000 s | 11200999 | `af02ff096911c16957a42e250572b227931db600dff3da5f781bbdc51f01f79e` |
| `/videos/guteneo-vertical-v8-en.mp4`   | 65.8000 s | 13748532 | `ffea64cc53445e85932c2dab298c2400643707bcfbf1e1e8b0500698fb6edfd3` |
| `/videos/guteneo-roles-v4-en.mp4`      | 47.3000 s | 2348260  | `3dab17cd2fbc4f341c4e6dd36d72150050ea08edb98250133b339650efd4b36b` |
| `/videos/guteneo-horizontal-v8-de.mp4` | 64.8667 s | 11071478 | `2b9a157420797739e2a254daccae1821879dbe81ceeaf4a6a001005f9322b8a3` |
| `/videos/guteneo-vertical-v8-de.mp4`   | 64.8667 s | 13335809 | `b18c9dee9f74f41e32fc7ca8a4a4fe1c33d70c67f31cab4c515d06c96149be5c` |
| `/videos/guteneo-roles-v4-de.mp4`      | 49.1333 s | 2477503  | `a1b7c2a74bc78709d4569795c6fb0ac914fb58c92b88d4e4848241347479325c` |
| `/videos/guteneo-horizontal-v8-lb.mp4` | 67.4667 s | 11662999 | `07e9c738ae13e8621b755868d29917e377b8d1ad9c30f1c31cb7508a3964438b` |
| `/videos/guteneo-vertical-v8-lb.mp4`   | 67.4667 s | 14098855 | `35dea41eac0431a7102709299d3a3bc19b3fa78e6b161ceb1d136e03b213960c` |
| `/videos/guteneo-roles-v4-lb.mp4`      | 50.4000 s | 2515634  | `4af8832d5a8aacd377044e91cce4af0f33c36fb8b3330546b9e75de27cce669c` |

## Replay and proof

`npm run videos:render` qualifies eight libraries, renders musical bases and remixes
local voices/posters/VTT/manifest without ElevenLabs. V5/V1 sources and historical
George library remain immutable; server manifest covers exactly twelve active MP4s.

MP3/WAV/canonical PCM hashes are strict. Portable library qualification passed on
macOS and Ubuntu/FFmpeg 6.1.1. Scalar `-cpuflags 0` preserves sample counts/canonical
media hashes. Ubuntu arm64/x86_64 maximum over 24 sources: **3 PCM24 LSB**, below
unchanged eight-LSB limit. `tests/fixtures/natural-c-scalar-qualification.json`
archives both; initial arm64 `natural-c-linux-qualification.json` had maximum four
LSB. MP3 decoders are not claimed bit-identical.

The user listened to/approved French roles. Its MP4 SHA `59342f77…`, VTT, poster
and music base exactly match approved preview. Other proofs retain
`criticalListening:pending`; proper names, accents and ASR variants are not human-certified.
No physical phone test is claimed.

Independent audit of twelve MP4s confirms full decoding, music-base-identical
H.264 packets, formats/durations/exact manifest. Measured musical gain across
speech/pauses/logo: **0.217734–0.219883**, consistent with 0.22 after AAC.
Reconstructed premix peaks **0.6301–0.69235**, below 0.95; limiter stays inactive
without changing music level. Local checks cover PCM/timing/logo/catalog/player
in Chromium/WebKit. Publication needs merged-commit CI and exact current
[release checks](MAIN_RELEASE.md); historical procedures used two origins. Deployment
proof stays outside Git. Videos trigger no business delivery.

# Historical V6/V2 — published 3 October 2026

The previous five-film batch (FR/EN introductions in both formats and EN roles)
used male **George — Warm, Captivating Storyteller**, Eleven v4, selected web
**Generation 2**. That means the second result, not Multilingual v2. Eleven
introductory sentences per language were reused across formats; six EN role
sentences were separate. Snapshot retains 34 generation receipts, including six
historical FR roles excluded during natural-three-block rewriting. Receipts retain
`webGeneration:2`, MP3 hash and scene-compatible duration. Local fitting preserved
all words. Voice targeted −18 LUFS; music ducked to 22% during speech and returned
to normal between sentences/conclusion. Playback made no provider call.

| Public file                         | Duration | Bytes   | SHA-256                                                            |
| -------------------------------------- | ----- | -------- | ------------------------------------------------------------------ |
| `/videos/guteneo-horizontal-v6-fr.mp4` | 56 s  | 10347697 | `7c2535462e5314ad741b5a82b10f88c087290c96cd42e76cbb97de7994683cee` |
| `/videos/guteneo-vertical-v6-fr.mp4`   | 56 s  | 12240339 | `e2d32af8b85b540073cc8a7feee59b837b30b1fefc9ab6431f5c74f3442c8b70` |
| `/videos/guteneo-horizontal-v6-en.mp4` | 56 s  | 10270654 | `f40d811d4123c383cda80ad6db241d11987b26af85cd6f12c5554d1601b6fc2b` |
| `/videos/guteneo-vertical-v6-en.mp4`   | 56 s  | 12162130 | `93b75943f6128d5bef295bbee9ad10486f24aff21d2ca62ddd1be8991973147e` |
| `/videos/guteneo-roles-v2-en.mp4`      | 36 s  | 2052663  | `2cf94bce41d9981ef95342cf8a44d8fd9bafda2b5585b9b015e962ef31751a5c` |

H.264 packets match instrumental V5/V1; framing/animation/final logo remain.
Introductions: 1,680 frames; roles: 1,080. Last FR introduction phrase ends
46.730 s, EN introduction 47.540 s, EN roles 30.738 s. Final five-second silent
logos start 51/31 s respectively. H.264/AAC stereo, 30 fps, fast-start, under 25 MiB.

The shared catalog selected resolved language on home/roles. Posters retained V5/V1.
Old instrumentals remained regeneration sources. DE/LB retained prior videos while
voices were prepared; FR roles stayed instrumental V1, excluding old FR V2 voice
candidate/VTT from that publication. Both introduction formats shared eleven-sentence
`/videos/guteneo-v6.{fr,en}.vtt`; EN roles used six-sentence
`/videos/guteneo-roles-v2.en.vtt`, timed to actual clips/native controls. V5 music
tracks remained instrumental sources.

[FR/EN Generation 2 snapshot](../videos/guteneo-film/narration/releases/fr-en-g2/README.md)
tracks 34 audio sources/scripts/filtered receipts. Offline replay of five selected
assets exactly reproduced hashes above. Historical `videos:render` rendered V5/V1
bases, remixed that snapshot to then-active V6/V2 paths and regenerated VTT/manifest,
qualifying inputs before public writes without changing snapshot/provider calls.
Detailed mix/review evidence stays outside Git. Both languages passed full FFmpeg
and independent hash/packet/receipt/music-ending checks, without full human-listening
or physical-phone claims. Publication followed merged-commit CI/two then-public
origins; current origin procedure is [MAIN_RELEASE.md](MAIN_RELEASE.md).
