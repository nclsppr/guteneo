# Roles-film score

`roles-soundtrack.wav` edits original Guteneo `vertical-soundtrack.wav`, whose
provenance/generator remain here and in `scripts/create-vertical-soundtrack.py`.
Take first 31.2 s plus last five seconds with 0.2-second triangular crossfade:
36 seconds, stereo PCM16/48 kHz. Final cadence remains V5's.
`scripts/render-localized.mjs` regenerates using FFmpeg before rendering, without
external samples, synthesized voices or remote services.
