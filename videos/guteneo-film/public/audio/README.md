# Guteneo soundtrack

`soundtrack.wav`: complete **46-second**, stereo PCM16/48 kHz master, including
music, paper textures and final clap. Original score/melody/timbres are procedural
`scripts/create-soundtrack.py` oscillator, fixed-seed noise, envelope, harmonic and
stereo synthesis. No third-party sample/recording/music/audio model/paid service.
Piano/pad/percussion describe synthesized timbres, not acoustic recordings.

## Edit timing

| Time | Sound |
| --- | --- |
| 0–5 s | Paper rustle, sparse notes, bright harmonic opening |
| 5–13 s | First melody, gradual pulse |
| 13–20 s | Piano/soft pad/bass/subtle percussion |
| 20–25 s | Paper accent at 20.06, music builds |
| 25–31 s | Paper accent at 25.05, motif returns |
| 31–36 s | Paper accent at 31.07, last melodic expansion |
| 36–40.25 s | Pulse/music gradually withdraw |
| **40.500 s** | **Dry clap**, attack sample 1,944,000 |
| **41.000 s** | **Final logo chord**, D major/resonance |
| 44.9–46 s | Soft fade to silence |

D major/80 BPM, start at film frame0, normal speed/volume 1. **Do not add another
clap**: `clap.wav` is only a standalone re-edit alternative, 0.75 s/attack at0.

## Reproduce and inspect

Repository root, Python3.9+/NumPy, no network:

```sh
python3 videos/guteneo-film/scripts/create-soundtrack.py
ffmpeg -hide_banner -i videos/guteneo-film/public/audio/soundtrack.wav \
  -af loudnorm=I=-16:TP=-1:LRA=11:print_format=json -f null -
```

Generator writes both WAVs/`soundtrack-measurements.json`. FFmpeg inspection does
not change master. Recorded values: 46.000 s/2,208,000 samples-channel; peak
−1.000 dBFS; stereo RMS −16.439 dBFS; integrated −14.33 LUFS; true peak −0.95 dBTP;
range 2.20 LU; zero clipped samples; final 100 ms RMS −68.982 dBFS.
Automated format/duration/signal/level/attack proof claims no human listening.
