# French roles narration — Manon, method C

This release contains three genuine ElevenLabs Creative plugin MP3 outputs and
six derived mono PCM24 WAV clips at 44,100 Hz. Each selected provider output is
variation **2** of Eleven v4 with French explicitly selected and Manon's public
voice ID `m5U7XCsc8v988k2RJAqN`. Plugin variation numbers are separate from the
web UI's Generation 2 choice. No API request or provider price is invented.

The French sentences were submitted to ElevenLabs' native **Améliorer** action
and accepted with **Garder**. It preserved all spoken wording and added
`[thoughtful]` plus `[short pause]` tags. Three two-slide prompts carry that style;
the gaps between blocks are represented by the video edit. `enhancement.json`
records the original and enhanced text, and `provider-receipts/` records the real
selected outputs. The enhancement tags do not appear in the captions.

The canonical decoded source samples are preserved in full, once each and in order.
Every WAV is an exact slice of the original FFmpeg 9 canonical PCM, without speeding up, clipping words
or re-encoding to MP3. `library.json` records file hashes, full decoded hashes,
sample bounds and a derived fingerprint binding the source hash, enhanced prompt,
cue text, voice, language and sample bounds. `cut-proof.json` records the cuts.
The offline ASR proof in `alignment/` uses no expected-text prompt, has 20 ms word
timestamp resolution and explicitly lists homophone/proper-name limitations.
Portable proof copies retain their original proof hashes as provenance.

Floating-point MP3 decoders can differ in their least-significant PCM24 bits.
Mac FFmpeg 9.0.1 and Ubuntu FFmpeg 6.1.1 were measured with identical sample counts
and a maximum difference of 3 units; `decoder-equivalence.json` records all three
blocks. Replay keeps every MP3/WAV hash strict, reconstructs the full canonical
PCM hash from the WAVs, then compares every decoded MP3 sample with a maximum
portability bound of 8 units on the 24-bit scale. A missing sample or larger
difference is rejected. `decoder-proof.json` records the actual replay differences.
This permits decoder rounding differences while preserving the canonical voice
clips and all scene limits exactly.

The six scenes follow the actual voice duration. `timeline.json` and `scripts.json`
describe 1,346 frames at 30 fps (44.8667 seconds), including the original logo card
for the last 150 frames. Each scene has 12 entry frames and at least 15 exit frames.
The separate instrumental source is
`/videos/guteneo-roles-natural-c-v1-fr-music.mp4`; the active voice output is
`/videos/guteneo-roles-v3-fr.mp4` with `/videos/guteneo-roles-v3.fr.vtt`.
The historical `narration/source-videos.json` and all 34 legacy MP3 fingerprints
remain unchanged.

The new mix applies a constant **0.22 music gain** through the film, including
speech gaps and the logo. It retains the score's own final cadence and fade.
The original mixer default and historical replay still use their recorded ducking;
new public versions select constant gain explicitly in `published-narration.mjs`.

From the repository root, reproduce the complete active French roles video with:

```sh
npm run videos:render -- --locales fr --kind roles
```

This renderer verifies hashes, codecs, all decoded samples, exact cuts, native
tempo, scene windows and the five-second logo before replacing the local public
candidate. It rebuilds the instrumental composition and then mixes the checked-in
WAV cache, without calling ElevenLabs. `--skip-existing` additionally checks the
active file hash, poster and exact captions before reuse.

Verification tests:

```sh
cd videos/guteneo-film
node --test tests/natural-narration.test.mjs tests/published-narration.test.mjs
```

The local replay is byte-identical with the same instrumental source and FFmpeg
build. Different Remotion, FFmpeg or H.264 encoder builds can change final MP4
bytes while preserving the qualified voice samples and timing. Complete decoding
and ASR are technical checks; critical human listening remains **pending**.
