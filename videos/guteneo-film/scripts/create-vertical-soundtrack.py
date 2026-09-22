#!/usr/bin/env python3
"""Synthesize Guteneo's independent 56-second vertical-film score.

Python 3.9+ and NumPy are required; FFmpeg is used when available to measure
BS.1770 loudness and apply a conservative final gain. No sample, third-party
recording, remote service, model, or pre-existing composition is used. The first
46-second film and its assets are never imported or modified.

Run: python3 videos/guteneo-film/scripts/create-vertical-soundtrack.py
"""

from pathlib import Path
import hashlib
import json
import math
import re
import shutil
import subprocess
import wave

import numpy as np


SR = 48_000
SECONDS = 56
N = SR * SECONDS
RNG = np.random.default_rng(2026092256)
OUT = Path(__file__).resolve().parents[1] / "public" / "audio"
CUTS = [0, 3, 6, 10, 14, 18, 23, 29, 35, 40, 44, 49, 51]
MUSIC = np.zeros((N, 2))
BASS = np.zeros_like(MUSIC)
DRUMS = np.zeros_like(MUSIC)
FX = np.zeros_like(MUSIC)


def hz(midi):
    return 440 * 2 ** ((midi - 69) / 12)


def seconds(duration):
    return np.arange(round(duration * SR)) / SR


def smooth(x):
    x = np.clip(x, 0, 1)
    return x * x * (3 - 2 * x)


def noise(duration, low=200, high=8000):
    n = round(duration * SR)
    bins = np.fft.rfftfreq(n, 1 / SR)
    spectrum = np.fft.rfft(RNG.normal(size=n))
    spectrum *= (1 - np.exp(-(bins / low) ** 4)) * np.exp(-(bins / high) ** 4)
    result = np.fft.irfft(spectrum, n=n)
    return result / (np.std(result) + 1e-12)


def put(bus, signal, start, gain=1, pan=0):
    offset = round(start * SR)
    if offset >= N:
        return
    if offset < 0:
        signal = signal[-offset:]
        offset = 0
    length = min(len(signal), N - offset)
    if signal.ndim == 1:
        p = (np.clip(pan, -1, 1) + 1) * np.pi / 4
        bus[offset:offset + length] += signal[:length, None] * np.array([np.cos(p), np.sin(p)]) * gain
    else:
        bus[offset:offset + length] += signal[:length] * gain


def key(midi, velocity=.7, duration=2.6, luminous=False):
    """Felt/EP hybrid: two-string beating and short, soft tine harmonics."""
    t = seconds(duration)
    f = hz(midi)
    y = np.zeros_like(t)
    harmonics = [(1, 1, 1.7), (2, .23, .92), (3, .14, .65), (4, .049, .29), (5, .020, .17)]
    for h, amplitude, decay in harmonics:
        inharmonic = math.sqrt(1 + .00004 * h * h)
        envelope = np.exp(-t / (decay * (1.1 - (midi - 60) / 130)))
        phase = 2 * np.pi * f * h * inharmonic * t
        y += amplitude * envelope * (np.sin(phase) + .18 * np.sin(phase * 1.0013 + .13))
    if luminous:
        y += .045 * np.sin(2 * np.pi * f * 5.97 * t) * np.exp(-t / .13)
    y *= smooth(t / .0045) * smooth((duration - t) / .08)
    y += noise(duration, 500, 2400) * .013 * np.exp(-t / .009)
    return y * velocity * .24


def pad(midi, duration):
    t = seconds(duration)
    f = hz(midi)
    y = np.zeros_like(t)
    for harmonic, amplitude in ((1, 1), (2, .18), (3, .075), (4, .02)):
        for detune in (-.0016, .0017):
            phase = RNG.uniform(0, 2 * np.pi)
            wobble = .026 * np.sin(2 * np.pi * .18 * t + phase)
            y += .5 * amplitude * np.sin(2 * np.pi * f * harmonic * (1 + detune) * t + phase + wobble)
    y *= smooth(t / .38) * smooth((duration - t) / 1.3)
    return y * .053


def bass(midi, duration=.42):
    t = seconds(duration)
    f = hz(midi)
    phase = 2 * np.pi * f * t
    tone = np.sin(phase) + .35 * np.sin(phase * 2) * np.exp(-t / .16)
    tone += .10 * np.sin(phase * 3) * np.exp(-t / .07)
    tone = np.tanh(tone * 1.45) / 1.45
    return tone * smooth(t / .009) * np.exp(-t / .36) * smooth((duration - t) / .075) * .24


def kick():
    t = seconds(.32)
    phase = 2 * np.pi * (45 * t + 80 * .014 * (1 - np.exp(-t / .014)))
    y = np.sin(phase) * np.exp(-t / .092)
    y += noise(.32, 800, 4400) * np.exp(-t / .007) * .06
    return y * smooth(t / .001) * smooth((.32 - t) / .06) * .29


def rim():
    t = seconds(.16)
    body = np.sin(2 * np.pi * 920 * t) * .7 + np.sin(2 * np.pi * 1440 * t) * .3
    y = body * np.exp(-t / .012) + noise(.16, 1500, 6500) * np.exp(-t / .017) * .20
    return y * smooth(t / .001) * .075


def snare():
    t = seconds(.19)
    envelope = np.exp(-t / .035) * smooth(t / .0008)
    y = noise(.19, 1200, 8200) * envelope * .063
    y += (.55 * np.sin(2 * np.pi * 183 * t) + .15 * np.sin(2 * np.pi * 328 * t)) * np.exp(-t / .032) * .04
    return y * smooth((.19 - t) / .04)


def hat(open_hat=False):
    duration = .18 if open_hat else .085
    t = seconds(duration)
    return noise(duration, 4800, 11000) * np.exp(-t / (.055 if open_hat else .018)) * smooth(t / .001) * smooth((duration - t) / .035) * .017


def sweep(duration=.34, weight=1):
    """A short textured camera movement, rather than a pitched electronic beep."""
    t = seconds(duration)
    airy = noise(duration, 650, 9000)
    body = noise(duration, 100, 1000)
    envelope = np.sin(np.pi * t / duration) ** 2.3
    grain = .77 + .14 * np.sin(2 * np.pi * 61 * t)
    return (airy * .72 + body * .28) * envelope * grain * .044 * weight


def impact():
    t = seconds(.56)
    phase = 2 * np.pi * (44 * t + 48 * .035 * (1 - np.exp(-t / .035)))
    y = np.sin(phase) * np.exp(-t / .14) * .15
    y += noise(.56, 700, 7500) * np.exp(-t / .026) * .08
    return y * smooth(t / .001) * smooth((.56 - t) / .09)


def paper(duration=.32):
    t = seconds(duration)
    return noise(duration, 1600, 9500) * np.sin(np.pi * t / duration) ** 2 * (.75 + .20 * np.sin(2 * np.pi * 85 * t)) * .023


def diffusion(bus, amount=1):
    result = bus.copy()
    for k in range(61):
        delay = .018 + k * .019 + RNG.uniform(-.005, .005)
        shift = round(delay * SR)
        level = .021 * np.exp(-delay / .41) * amount
        result[shift:, 0] += bus[:-shift, k % 2] * level
        result[shift:, 1] += bus[:-shift, 1 - k % 2] * level * .96
    return result


def wav(path, samples):
    pcm = np.round(np.clip(samples, -1, 1) * 32767).astype('<i2')
    with wave.open(str(path), 'wb') as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())


def loudness(path):
    executable = shutil.which('ffmpeg')
    if not executable:
        return None
    result = subprocess.run([executable, '-hide_banner', '-i', str(path), '-af', 'loudnorm=I=-15:TP=-1.2:LRA=8:print_format=json', '-f', 'null', '-'], capture_output=True, text=True, check=True)
    blocks = re.findall(r'\{\s*"input_i"[\s\S]*?\}', result.stderr)
    return json.loads(blocks[-1]) if blocks else None


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    path = OUT / 'vertical-soundtrack.wav'

    # F-sharp minor -> D major -> A major -> E. Open ninths give light and warmth.
    harmonies = [
        (30, [54, 57, 61, 64, 68]),
        (38, [54, 57, 61, 64, 66]),
        (33, [52, 57, 59, 61, 64]),
        (28, [52, 56, 59, 61, 66]),
    ]
    chord_starts = list(range(0, 49, 4))
    for index, start in enumerate(chord_starts):
        root, notes = harmonies[index % 4]
        if start == 48:
            notes = [52, 56, 59, 61, 66]
            root = 28
        energy = .83 if start < 4 else 1.0
        if 40 <= start < 44:
            energy = .66
        for j, note in enumerate(notes):
            pan = -.45 + j * .225
            put(MUSIC, pad(note - 12 if j == 0 else note, 5.35), start, .91 * energy, pan)
            put(MUSIC, key(note, .48, 3.5), start + j * .017, .85 * energy, pan * .7)
            if 6 <= start < 48:
                put(MUSIC, key(note, .30, 2), start + 2.5 + j * .013, .58, -pan * .6)

        # Syncopated round bass, with occasional upper pickup into the next bar.
        pattern = [(0, 1, .39), (.75, .67, .31), (1.5, .88, .38), (2.25, .65, .26), (2.75, .75, .26), (3.5, .88, .34)]
        for offset, strength, duration in pattern:
            at = start + offset
            if at >= 49 or (40 <= at < 42 and offset not in (0, 1.5)):
                continue
            note = root + (12 if offset == 2.75 and index % 2 else 0)
            put(BASS, bass(note, duration), at, strength * energy)

    # A short original rising signature appears immediately, then develops.
    # No endlessly repeating arpeggiator; each four-second phrase has breathing room.
    phrases = [
        [(0.08, 69, .82), (.58, 73, .76), (1.08, 76, .69), (2.33, 73, .56)],
        [(.08, 73, .72), (.83, 74, .63), (1.58, 76, .68), (2.83, 73, .55)],
        [(.08, 71, .65), (.58, 73, .70), (1.58, 76, .61), (3.08, 73, .56)],
        [(.08, 71, .66), (.83, 68, .59), (1.58, 66, .58), (2.83, 68, .55)],
    ]
    for index, start in enumerate(range(0, 48, 4)):
        for j, (offset, midi, velocity) in enumerate(phrases[index % 4]):
            if 40 <= start < 44 and j in (1, 3):
                continue
            if start in (16, 32, 44) and j == 2:
                midi += 12
                velocity *= .70
            put(MUSIC, key(midi, velocity, 2.6, luminous=True), start + offset, .91, .12 * np.sin(index + j))
            if j in (0, 2) and start >= 8:
                put(MUSIC, key(midi - 12, .27, 2), start + offset + .75, .45, -.3)

    # Restrained rhythmic chord details: tactile, unquantized by a few milliseconds.
    for index, start in enumerate(range(8, 48, 4)):
        notes = harmonies[(start // 4) % 4][1]
        for offset, note in ((.25, notes[2]), (1.25, notes[3]), (2.75, notes[1]), (3.25, notes[3])):
            if 40 <= start < 44:
                continue
            put(MUSIC, key(note, .28, 1.1), start + offset + .008, .65, -.45 if offset < 2 else .45)

    # Precision 120 BPM drum groove, with small gaps before larger visual cuts.
    for beat in range(98):
        at = beat * .5
        if at >= 49:
            break
        energy = .84 if at < 3 else 1
        if 40 <= at < 44:
            energy = .42
        if at >= 48.5:
            energy *= .65
        if beat % 4 in (0, 2) or (beat % 4 == 3 and 18 <= at < 40):
            put(DRUMS, kick(), at, energy * (.56 if beat % 4 == 3 else 1))
        if beat % 2:
            put(DRUMS, rim(), at + .004, energy, -.13)
            if at >= 6:
                put(DRUMS, snare(), at + .002, energy * .63, .13)
        for offset in (0, .25):
            strength = (.56 if offset == 0 else .84) * RNG.uniform(.9, 1.1)
            put(DRUMS, hat(open_hat=beat % 8 == 7 and offset == .25), at + offset, strength * energy, -.34 if offset == 0 else .34)

    # Four-note soft brushed fills mark big shifts without crowding the film.
    for start in (13.5, 22.5, 34.5, 43.5):
        for k in range(4):
            put(DRUMS, rim(), start + k * .125, .28 + k * .10, -.2 + k * .13)

    put(FX, impact(), 0, .80)
    for i, cut in enumerate(CUTS[1:-1]):
        duration = .31 if cut not in (23, 35, 44) else .44
        whoosh = sweep(duration, .82 if cut < 10 else 1)
        # The sweep crests shortly before the edit; the new shot receives a dry hit.
        put(FX, whoosh, cut - duration * .72, .86, -.3 if i % 2 else .3)
        if cut in (6, 18, 29, 44):
            put(FX, impact(), cut, .43)
        if cut in (18, 23, 29, 35):
            put(FX, paper(.32), cut + .04, .65, .12)

    # Very quiet stereo eighth-delay adds a physical room to the melodic notes.
    music = diffusion(MUSIC)
    delay = round(.375 * SR)
    music[delay:, 0] += MUSIC[:-delay, 1] * .08
    music[delay:, 1] += MUSIC[:-delay, 0] * .065
    t = np.arange(N) / SR
    quarter = np.mod(t, .5)
    duck = 1 - .18 * np.exp(-quarter / .062)
    music *= duck[:, None]
    score = music + BASS + diffusion(DRUMS, .20) + FX

    # The groove releases into one fluid breath. There is no clap, hard hit,
    # or silent gap: the outgoing harmony overlaps the five-second logo chord.
    score -= np.mean(score[:round(49 * SR)], axis=0, keepdims=True)
    score *= (1 - smooth((t - 49.20) / 2.15))[:, None]
    put(score, sweep(1.15, .38), 50.15, .62, -.12)

    # Brand chord starts exactly at 51 s, with softened attacks and a long tail.
    ending = np.zeros_like(MUSIC)
    for j, (note, velocity) in enumerate(((33, .70), (45, .66), (52, .55), (57, .60), (61, .57), (64, .55), (69, .52))):
        tone = key(note, velocity, 5) * smooth(seconds(5) / .032)
        put(ending, tone, 51 + j * .012, 1, -.30 + j * .1)
    for note, pan in ((45, -.25), (52, .25), (61, -.4), (64, .4)):
        put(ending, pad(note, 5), 51, .77, pan)
    score += diffusion(ending)
    score *= smooth((SECONDS - t) / .9)[:, None]

    # Gentle saturation rounds musical peaks. No hard clipping or loudness brickwall.
    master = np.tanh(score * 1.12) / 1.12
    master *= 10 ** (-1.6 / 20) / np.max(np.abs(master))
    master[0] = 0
    master[-1] = 0
    wav(path, master)
    before = loudness(path)
    gain_db = 0
    if before:
        # Target -15 LUFS while reserving >=1.2 dB true-peak headroom.
        gain_db = min(-15 - float(before['input_i']), -1.2 - float(before['input_tp']))
        master *= 10 ** (gain_db / 20)
        wav(path, master)
    measured = loudness(path)

    # Re-read the delivered PCM, so reported values include quantization.
    with wave.open(str(path), 'rb') as w:
        decoded = np.frombuffer(w.readframes(w.getnframes()), dtype='<i2').reshape(-1, 2) / 32768
    peak = float(np.max(np.abs(decoded)))
    rms = float(np.sqrt(np.mean(decoded ** 2)))
    report = {
        "file": path.name,
        "origin": "Original procedural composition and sound design from oscillators, envelopes, filtered seeded noise and stereo diffusion; no third-party recordings, samples, models, APIs or services.",
        "duration_seconds": SECONDS,
        "frames_per_channel": len(decoded),
        "sample_rate": SR,
        "channels": 2,
        "pcm_bits": 16,
        "tempo_bpm": 120,
        "key": "F-sharp minor, resolving to A major",
        "visual_cut_times_seconds": CUTS,
        "clap_present": False,
        "closing_transition": "Soft continuous air sweep at 50.15 s, no impact or silent gap",
        "logo_chord_onset_seconds": 51,
        "logo_chord_duration_seconds": 5,
        "sample_peak_dbfs": round(20 * math.log10(peak), 3),
        "rms_dbfs": round(20 * math.log10(rms), 3),
        "clipped_samples": int(np.count_nonzero(np.abs(decoded) >= 1)),
        "final_gain_db": round(gain_db, 3),
        "loudness_integrated_lufs": float(measured['input_i']) if measured else None,
        "true_peak_dbtp": float(measured['input_tp']) if measured else None,
        "loudness_range_lu": float(measured['input_lra']) if measured else None,
        "last_100ms_rms_dbfs": round(20 * math.log10(float(np.sqrt(np.mean(decoded[-4800:] ** 2))) + 1e-15), 3),
        "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
    }
    (OUT / 'vertical-measurements.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    main()
