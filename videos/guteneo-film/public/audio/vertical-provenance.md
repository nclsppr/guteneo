# Guteneo vertical-film music

`vertical-soundtrack.wav` is an original **56-second/120 BPM**, PCM16 stereo/48 kHz
composition independent of the untouched 46-second score. Three-note motif,
synthesized soft electric piano/open chords/warm pad/syncopated bass/precise kick/
dry percussion/air transitions; F-sharp minor resolves to A major at logo.
`scripts/create-vertical-soundtrack.py` generates every musical/sound element with
oscillators/envelopes/fixed-seed filtered noise/stereo synthesis, without samples,
recordings, third-party excerpts, audio models, downloads or paid services.
Instrument names describe synthesized timbres.

## Timing

| Time | Sound |
| --- | --- |
| 0–1 s | Subtle impact/chord/immediate motif |
| 3/6/10/14/18 s | Short air cuts/progressive groove |
| 23/29/35 s | Camera/percussion/paper accents |
| 40–44 s | Less density/musical breath |
| 44 s | Groove returns/final melodic peak |
| 49–51.35 s | Groove fades/harmonic continuity |
| 50.15–51.30 s | Continuous soft breath/no impact |
| **51.000 s** | **Logo signature chord**, softened attack/five-second hold |
| 55.1–56 s | Gentle fade/final sample zero |

Start master at 0, normal speed/volume 1. Clap/preparatory silence removed. Visual
49–51 s signature continues straight to51–56 s final stamp with unpercussive chord.
Pre49 s groove/events retained; static global gain recalculated for new ending.

## Reproduction and measurements

Root Python3.9+/NumPy/FFmpeg:

```sh
python3 videos/guteneo-film/scripts/create-vertical-soundtrack.py
```

Script analyzes loudnorm then conservative static gain, without tempo change/
loudness limiter. Actual delivered PCM: **56.000 s**, 2,688,000 samples-channel;
**−15.00 LUFS**; true peak **−1.92 dBTP**; digital **−1.920 dBFS**;
stereo RMS **−16.812 dBFS**; range **3.50 LU**; **zero clipped samples**;
final 100 ms RMS **−68.967 dBFS**; SHA-256
`3a62ed43b423d900debfcb54a841037a9867378634e0d83c552ebcaac3af28bb`.
`vertical-measurements.json` stores values. Format/duration/attacks/clipping/levels
are computed, without human-listening claim.
