#!/usr/bin/env python3
"""Original deterministic score for Guteneo's 46-second brand film.

No samples, pretrained models, remote services, or third-party compositions are
used. Every sound is synthesized here from oscillators and seeded noise.
Requires Python 3.9+ and numpy. Run from any directory:
    python3 videos/guteneo-film/scripts/create-soundtrack.py

The stereo 48 kHz PCM master includes the closing clap at exactly 40.500 seconds
and the final D-major brand chord at exactly 41.000 seconds. Do not add a second
clap in the video. The standalone clap is supplied for optional editorial use.
"""

from pathlib import Path
import json
import math
import wave

import numpy as np


SR = 48_000
DURATION = 46.0
N = round(SR * DURATION)
RNG = np.random.default_rng(20260922)
OUT = Path(__file__).resolve().parents[1] / "public" / "audio"
MUSIC = np.zeros((N, 2), dtype=np.float64)
PERCUSSION = np.zeros_like(MUSIC)
FOLEY = np.zeros_like(MUSIC)
CLAP = np.zeros_like(MUSIC)


def frequency(midi):
    return 440.0 * 2 ** ((midi - 69) / 12)


def smoothstep(x):
    x = np.clip(x, 0, 1)
    return x * x * (3 - 2 * x)


def times(duration):
    return np.arange(round(SR * duration), dtype=np.float64) / SR


def colored_noise(duration, lo=150, hi=4500):
    """Smooth frequency-domain bandpass; the signal has no reused recordings."""
    count = round(duration * SR)
    spectrum = np.fft.rfft(RNG.normal(0, 1, count))
    bins = np.fft.rfftfreq(count, 1 / SR)
    response = (1 - np.exp(-(bins / lo) ** 4)) * np.exp(-(bins / hi) ** 4)
    noise = np.fft.irfft(spectrum * response, n=count)
    return noise / (np.std(noise) + 1e-12)


def add(bus, signal, start, level=1, pan=0):
    start = round(start * SR)
    if start < 0 or start >= N:
        return
    count = min(len(signal), N - start)
    # Equal-power stereo placement, gently bounded for headphone comfort.
    angle = (np.clip(pan, -1, 1) + 1) * np.pi / 4
    gains = np.array([np.cos(angle), np.sin(angle)])
    if signal.ndim == 1:
        bus[start:start + count] += signal[:count, None] * gains * level
    else:
        bus[start:start + count] += signal[:count] * level


def felt_key(midi, velocity=0.75, duration=4.0):
    """Soft hammer, differently decaying partials, slight string inharmonicity."""
    t = times(duration)
    fundamental = frequency(midi)
    y = np.zeros_like(t)
    # Natural partial decay leaves a warm rounded note instead of a sine beep.
    for harmonic, amplitude, decay in (
        (1, 1, 2.00), (2, .34, 1.25), (3, .15, .85),
        (4, .07, .48), (5, .034, .30), (7, .012, .18),
    ):
        hz = fundamental * harmonic * np.sqrt(1 + .000085 * harmonic ** 2)
        env = np.exp(-t / (decay * (1.22 - (midi - 48) / 100)))
        partial = np.sin(2 * np.pi * hz * t)
        # Two very subtly detuned strings add an organic beating texture.
        partial += .18 * np.sin(2 * np.pi * hz * 1.0009 * t + .14)
        y += amplitude * env * partial
    attack = smoothstep(t / .007)
    hammer = colored_noise(duration, 300, 2600) * np.exp(-t / .011)
    y = (y * attack + .028 * hammer) * velocity
    y *= smoothstep((duration - t) / .08)
    return y * .22


def warm_pad(midi, duration):
    t = times(duration)
    hz = frequency(midi)
    y = np.zeros_like(t)
    for harmonic, amplitude in ((1, 1), (2, .24), (3, .08), (4, .025)):
        for detune, amount in ((-.0014, .27), (0, .46), (.0015, .27)):
            phase = RNG.uniform(0, 2 * np.pi)
            drift = .018 * np.sin(2 * np.pi * .19 * t + phase)
            y += amplitude * amount * np.sin(2 * np.pi * hz * harmonic * (1 + detune) * t + phase + drift)
    attack = smoothstep(t / 1.15)
    release = smoothstep((duration - t) / 1.75)
    return y * attack * release * .055


def round_bass(midi, duration=.85):
    t = times(duration)
    hz = frequency(midi)
    body = np.sin(2 * np.pi * hz * t) + .21 * np.sin(2 * np.pi * hz * 2 * t)
    body += .045 * np.sin(2 * np.pi * hz * 3 * t)
    env = smoothstep(t / .026) * np.exp(-t / .64) * smoothstep((duration - t) / .16)
    return body * env * .17


def kick():
    t = times(.36)
    phase = 2 * np.pi * (47 * t + 27 * .020 * (1 - np.exp(-t / .020)))
    body = np.sin(phase) * np.exp(-t / .095)
    body *= smoothstep(t / .003) * smoothstep((.36 - t) / .06)
    return body * .13


def shaker(strength=1):
    t = times(.12)
    noise = colored_noise(.12, 4200, 9000)
    env = smoothstep(t / .004) * np.exp(-t / .031) * smoothstep((.12 - t) / .03)
    return noise * env * .014 * strength


def wooden_tick():
    t = times(.15)
    noise = colored_noise(.15, 750, 5200)
    body = .35 * np.sin(2 * np.pi * 790 * t) + .2 * np.sin(2 * np.pi * 1270 * t)
    env = smoothstep(t / .0015) * np.exp(-t / .014)
    return (body + noise * .4) * env * .033


def paper(duration=.72):
    t = times(duration)
    noise = colored_noise(duration, 1400, 9000)
    env = np.sin(np.pi * t / duration) ** 2
    grain = .5 + .28 * np.sin(2 * np.pi * 37 * t) + .15 * np.sin(2 * np.pi * 81 * t)
    return noise * env * grain * .018


def closing_clap():
    """Single dry wooden clapper with a short physical room reflection."""
    t = times(.75)
    noise = colored_noise(.75, 300, 8700)
    # Impact begins on the exact edit. No look-ahead or pre-ringing is added.
    crack = noise * np.exp(-t / .017)
    body = (.5 * np.sin(2 * np.pi * 720 * t) + .28 * np.sin(2 * np.pi * 1340 * t)) * np.exp(-t / .022)
    result = crack + body
    for delay, attenuation in ((.028, .11), (.052, .055), (.081, .025)):
        shift = round(SR * delay)
        result[shift:] += crack[:-shift] * attenuation
    result *= smoothstep((.75 - t) / .08)
    result /= max(abs(result))
    return result


def room(bus):
    """Quiet, decorrelated diffusion; deliberately keeps transients legible."""
    wet = np.zeros_like(bus)
    # Random taps form a continuous decaying room without audible rhythmic echo.
    for k in range(74):
        delay = .024 + k * .022 + RNG.uniform(-.007, .007)
        shift = round(SR * delay)
        level = .022 * np.exp(-delay / .57)
        wet[shift:, 0] += bus[:-shift, k % 2] * level
        wet[shift:, 1] += bus[:-shift, 1 - k % 2] * level * .95
    return bus + wet


def write_wav(path, samples):
    pcm = np.round(np.clip(samples, -1, 1) * 32767).astype('<i2')
    with wave.open(str(path), 'wb') as wav:
        wav.setnchannels(2)
        wav.setsampwidth(2)
        wav.setframerate(SR)
        wav.writeframes(pcm.tobytes())


def stats(samples):
    peak = float(np.max(np.abs(samples)))
    rms = float(np.sqrt(np.mean(samples ** 2)))
    return {
        "peak_dbfs": round(20 * math.log10(peak + 1e-15), 3),
        "rms_dbfs": round(20 * math.log10(rms + 1e-15), 3),
        "sample_peak": round(peak, 6),
        "clipped_samples": int(np.count_nonzero(np.abs(samples) >= 1)),
    }


def main():
    OUT.mkdir(parents=True, exist_ok=True)

    # D major, an original three-note signature and an airy nine-bar development.
    # The first phrase leaves room for the opening page before a pulse enters.
    for midi, offset, level in ((50, .28, .58), (62, .60, .55), (66, 1.04, .50), (69, 1.52, .57), (76, 2.3, .62), (74, 3.42, .5)):
        add(MUSIC, felt_key(midi, level, 5), offset, pan=(midi - 65) / 50)
    for midi, pan in ((50, -.2), (57, .2), (64, -.35), (66, .35)):
        add(MUSIC, warm_pad(midi, 6.6), .15, .72, pan)
    add(FOLEY, paper(.9), .05, .8, -.25)

    # Harmonic progression uses open voicings to avoid crowding the product copy.
    chords = [
        (5, 38, [57, 62, 66, 69, 76]),   # D major 9
        (8, 33, [57, 61, 64, 71]),       # A add 9
        (11, 35, [54, 57, 62, 66, 69]),  # B minor 7
        (14, 31, [55, 59, 62, 66, 69]),  # G major 9
        (17, 30, [57, 62, 66, 69]),      # D over F sharp
        (20, 33, [57, 61, 64, 71]),      # A add 9
        (23, 35, [54, 57, 62, 66, 73]),  # B minor 9
        (26, 31, [55, 59, 62, 66, 69]),  # G major 9
        (29, 38, [57, 62, 66, 69, 76]),  # D major 9
        (32, 33, [57, 61, 64, 71]),      # A add 9
        (35, 31, [55, 59, 62, 66, 69]),  # G major 9
        (38, 33, [57, 62, 64, 69, 71]),  # A sus 4, suspended before the clap
    ]

    for i, (start, root, notes) in enumerate(chords):
        strength = .74 + .16 * min(i / 6, 1)
        for j, note in enumerate(notes):
            pan = -.45 + j / max(len(notes) - 1, 1) * .9
            add(MUSIC, warm_pad(note - 12 if j < 2 else note, 4.45), start - .30, .78, pan)
            add(MUSIC, felt_key(note, .47, 3.7), start + j * .04, .82, pan * .75)
        if start < 38:
            for offset, scale in ((0, .88), (1.5, .6), (2.25, .34)):
                add(MUSIC, round_bass(root, 1.05), start + offset, strength * scale, 0)
        else:
            add(MUSIC, round_bass(root, 1.8), start, .70)

    # Original refrain. The same contour returns with restrained harmonic changes.
    melody = [
        (5.15, 69, .66), (5.9, 74, .69), (7.025, 76, .54),
        (8.15, 73, .65), (9.275, 71, .52), (10.4, 69, .46),
        (11.15, 66, .57), (11.9, 69, .61), (13.025, 73, .60),
        (14.15, 71, .60), (15.275, 69, .5), (16.025, 66, .48),
        (17.15, 69, .69), (17.9, 74, .7), (19.025, 76, .56),
        (20.15, 73, .65), (21.275, 71, .55), (22.4, 69, .50),
        (23.15, 66, .59), (23.9, 69, .62), (25.025, 73, .59),
        (26.15, 74, .67), (27.275, 71, .55), (28.025, 69, .48),
        (29.15, 69, .68), (29.9, 74, .74), (31.025, 78, .58),
        (32.15, 76, .65), (33.275, 73, .54), (34.4, 71, .48),
        (35.15, 74, .63), (36.275, 71, .57), (37.025, 69, .51),
        (38.15, 76, .55), (39.275, 73, .43),
    ]
    for k, (start, midi, velocity) in enumerate(melody):
        add(MUSIC, felt_key(midi, velocity, 4.4), start, .91, .10 * np.sin(k * 1.7))
        # A sparse low response provides musical phrasing, not a mechanical loop.
        if k % 6 == 0 and start >= 17:
            add(MUSIC, felt_key(midi - 12, .30, 3), start + .375, .55, -.28)

    # 80 BPM brushed pulse: tiny variations are deterministic and remain in time.
    for k in range(44):
        start = 5 + k * .75
        if start >= 37.5:
            break
        entry = min(1, .35 + max(0, start - 5) / 12)
        if k % 4 in (0, 2):
            add(PERCUSSION, kick(), start, entry * (.70 if k % 4 else 1))
        if k % 4 in (1, 3) and start >= 11:
            add(PERCUSSION, wooden_tick(), start + .006, entry, .2)
        for offset in (0, .375):
            amount = (.58 if offset == 0 else .85) * RNG.uniform(.88, 1.10)
            add(PERCUSSION, shaker(amount), start + offset, entry, -.35 if offset == 0 else .35)

    # Delicate tactile accents for printed paper, hand-over and fax emergence.
    for start, duration, pan, gain in ((20.06, .72, -.28, .6), (25.05, .62, .18, .7), (31.07, .8, -.1, .5)):
        add(FOLEY, paper(duration), start, gain, pan)

    music = room(MUSIC) + room(PERCUSSION) * .90 + FOLEY
    # The music falls away before the decisive closing clap.
    t = np.arange(N) / SR
    stop = 1 - smoothstep((t - 39.6) / .65)
    music *= stop[:, None]

    # Final signature lands under the logo at 41.000 s, then decays to true silence.
    logo = np.zeros_like(MUSIC)
    for j, (midi, velocity) in enumerate(((38, .64), (50, .62), (57, .48), (62, .57), (66, .53), (69, .55), (74, .52))):
        add(logo, felt_key(midi, velocity, 5), 41 + j * .014, .97, -.30 + j * .1)
    for midi, pan in ((50, -.25), (57, .25), (66, -.4), (69, .4)):
        add(logo, warm_pad(midi, 4.8), 41, .73, pan)
    music += room(logo)
    music *= smoothstep(t / .025)[:, None]
    music *= smoothstep((DURATION - t) / 1.1)[:, None]
    music -= np.mean(music, axis=0, keepdims=True)

    # Gentle peak rounding, then conservative gain staging below digital clipping.
    music = np.tanh(music * 1.1) / 1.1
    music *= .72 / np.max(np.abs(music))
    clap = closing_clap()
    add(CLAP, clap, 40.500, 1.10)
    master = music + CLAP
    master *= 10 ** (-1.0 / 20) / np.max(np.abs(master))
    master *= smoothstep((DURATION - t) / .03)[:, None]
    master[:24] *= smoothstep(np.arange(24) / 24)[:, None]
    # Independent clap has a local zero-second onset; master already includes it.
    standalone = np.column_stack((clap, clap)) * 10 ** (-2 / 20)

    write_wav(OUT / 'soundtrack.wav', master)
    write_wav(OUT / 'clap.wav', standalone)
    measurements = {
        "duration_seconds": DURATION,
        "sample_rate": SR,
        "channels": 2,
        "pcm_bits": 16,
        "tempo_bpm": 80,
        "tonality": "D major",
        "clap_onset_seconds": 40.5,
        "clap_onset_sample": round(40.5 * SR),
        "logo_chord_onset_seconds": 41,
        "origin": "Original deterministic synthesis from oscillators and seeded noise; no third-party samples, recording, model or service.",
        "master": stats(master),
        "standalone_clap": stats(standalone),
        "last_100ms_rms_dbfs": round(20 * math.log10(float(np.sqrt(np.mean(master[-4800:] ** 2))) + 1e-15), 3),
    }
    (OUT / 'soundtrack-measurements.json').write_text(json.dumps(measurements, indent=2) + '\n')
    print(json.dumps(measurements, indent=2))


if __name__ == '__main__':
    main()
