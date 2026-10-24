# Guteneo video narration

The user's selected **method C: three contextual blocks** uses complete sentences
for twelve public films: horizontal/iPhone introductions and four-role overview
in FR/EN/DE/LB. Introduction formats share narration; roles use their own script.

## Editorial rules

Narrate like a person presenting slides, rather than reading isolated visual
headlines. Permissions follow [WORKSPACE_ROLES.md](WORKSPACE_ROLES.md) and
`packages/contracts/src/roles.ts`; style changes no authority.
Prefer **Manon Voix française spontanée sérieuse**, `m5U7XCsc8v988k2RJAqN`, when
suitable for the language. Otherwise select/record a female language-specific voice.
Set `fr|en|de|lb` explicitly; playback follows resolved UI/account language.

Run the full script through native ElevenLabs **Enhance**, accept **Keep**, check
wording/permissions and archive exact output in `enhancement.json`. For calm
presentation, harmonize tags to `[thoughtful]`/`[short pause]` and remove nonverbal
effects only with recorded `editorialEdits`. Do not confuse native output and final
edited script. Group eleven introduction paragraphs **4/4/3**, six role paragraphs
**2/2/2**; repeat tone at each block start and add interblock pauses during editing.

## ElevenLabs generation

Creative Studio plugin is the preferred synthesis path: find voice, inspect actual
model schema, create `eleven_v4` TTS nodes with `voice_id` and
`model_parameters.language_code`, generate **two variations/block**, and retain the
second by session/generation IDs, not returned-media ordering.

Unknown outcomes require flow/session inspection without regeneration. Archive
original MP3s with hashes, sizes, durations and filtered receipts, never tokens or
signed URLs. Generation estimates are not usage receipts. Current provenance:
`elevenlabs-creative-plugin`, `variationIndex:2`; historical George web provenance
`elevenlabs-web`, `webGeneration:2` remains distinct.

Connector lacks native Enhance; authorized Safari account UI supplies it. Native
Scribe exports may qualify boundaries when connector/local ASR lacks independent
usable timestamps. [TTS guidance](https://elevenlabs.io/docs/overview/capabilities/text-to-speech/best-practices)
uses sentences/punctuation/tags for rhythm: prompt timecodes do not guarantee speech
duration. Edit to actual speech and inspect live schema/[model docs](https://elevenlabs.io/docs/overview/models).

## Timing and immutable library

Decode full MP3s into mono PCM24/44.1 kHz. Recognize words without expected-text
prompting. Boundaries combine timestamped words/acoustic pauses; preserve actual
transcription differences, especially proper names. Unreliable ASR never justifies
invented words/timestamps. Qualified cuts preserve all samples/order at
`tempoFactor:1`; lengthen scenes with readable minimums. Introductions retain two
silent Signature seconds; all twelve logos retain **five silent seconds**.

Each `narration/releases/{introduction,roles}-{fr,en,de,lb}-natural-c-v1/` snapshot
contains script/native enhancement/receipts/three MP3s/six or eleven WAVs/
transcriptions/cut proof/timeline/hashes. Builder refuses existing-library overwrite.
User-approved FR roles stay byte-identical at V3.

MP3/WAV/canonical PCM hashes are strict; cuts reconstruct complete canonical signal.
Some macOS/Linux MP3 decoders differ in quantization: require equal sample count,
at most **eight PCM24 LSB** documented difference. Scalar FFmpeg `-cpuflags 0`
avoids CPU-specific optimized paths. `tests/fixtures/natural-c-scalar-qualification.json`
retains 24-source arm64/x86_64 Ubuntu measurements. Canonical WAVs/published media
stay unchanged; decoders are not declared bit-identical.

## Music and offline regeneration

Constant musical gain **0.22** throughout speech, pauses and logo, preserving score
cadence/end fade. Voice normalization/mixing is separate; retain audio metrics/limits.

```sh
npm --prefix videos/guteneo-film ci
npm run test:videos:narration
npm run videos:render
```

Renderer qualifies libraries before public writes, renders natural music bases,
remixes local voices while retaining H.264 packets, then captions/posters/manifest.
Requires FFmpeg/ffprobe/cwebp; no ElevenLabs call. For first library initialization,
`render-natural-sources.mjs` writes `out/` only, without catalog/manifest/public
writes; install qualified sources only at explicitly snapshot-bound natural paths.

Select `--locales de,lb --kind introduction` or `--kind roles`.
`--skip-existing` requires manifest hash, matching poster/captions. Retain historical
V5/V1 and George `fr-en-g2/`; historical fitter/web import documentation is not the
current natural path. Local `narration:generate` remains blocked before network by
`API_ADAPTER_UNQUALIFIED`; plugin access qualifies neither old adapter nor API key.

## Proof and distribution

[Published narration evidence](VIDEO_NARRATION_PUBLISHED.md) owns asset hashes/durations.
Shared catalog covers exactly twelve MP4s and actual durations, selecting film,
poster/captions per locale. New languages need all three before release. FR roles
were listened to/approved by the user; other technical proof does not claim human
listening or physical-phone testing. Retain proper-name/accent limits.
Follow [MAIN_RELEASE.md](MAIN_RELEASE.md): merged-commit CI, clean main, canonical
asset/range verification and separate closed-host checks. Older two-origin evidence
remains historical. No business communication is triggered.
