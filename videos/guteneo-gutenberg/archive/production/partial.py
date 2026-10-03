#!/usr/bin/env python3
"""Assemble clearly named partial Pixar 2 samples from the completed Sync3 clips.

  python3 partial.py --prepare
  python3 partial.py --format both
  python3 partial.py --format vertical --wait-seconds 600

The optional bounded wait starts automatically when all requested clips are readable.
No generation, API request, download or credit expenditure is performed.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys
import time

import assemble as a

SELECTION = {"vertical": [4, 5, 6, 7], "horizontal": [7]}
NAMES = {"vertical": "Extrait-Pixar2-Instagram-43s.mp4",
         "horizontal": "Extrait-Pixar2-Horizontal-17s.mp4"}


def required_clips(manifest: dict, kinds: list[str]) -> list[Path]:
    result = []
    for kind in kinds:
        if len(manifest.get(kind, [])) != 7:
            raise ValueError(f"Seven ordered paths are required in the {kind} manifest.")
        result.extend(a.resolve(manifest[kind][scene - 1]) for scene in SELECTION[kind])
    return result


def wait_for_clips(paths: list[Path], seconds: int) -> None:
    deadline = time.monotonic() + seconds
    while True:
        unavailable = []
        for path in paths:
            if not path.is_file() or path.stat().st_size < 1024:
                unavailable.append(str(path))
                continue
            try:
                info = a.probe(path)
                if not any(s.get("codec_type") == "video" for s in info["streams"]):
                    unavailable.append(str(path))
            except (RuntimeError, ValueError, KeyError):
                unavailable.append(str(path))
        if not unavailable:
            return
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise FileNotFoundError("Partial sample is waiting for readable Sync3 clips:\n" + "\n".join(unavailable))
        print(f"Waiting for {len(unavailable)} clip(s); at most {remaining:.0f} seconds remain.", flush=True)
        time.sleep(min(5, remaining))


def partial_one(manifest: dict, kind: str, crf: int,
                endings: dict[str, Path], audio_parts: list[Path]) -> dict:
    scenes = SELECTION[kind]
    seconds = sum(a.DURATIONS[s - 1] for s in scenes) + a.END_DURATION
    clips = [a.resolve(manifest[kind][s - 1]) for s in scenes]
    video_parts = [a.conform_video(source, a.WORK / f"scene-{scene:02d}-{kind}.mp4", kind,
                                   a.DURATIONS[scene - 1], crf,
                                   product_insert=a.product_insert_for(manifest, scene, kind))
                   for scene, source in zip(scenes, clips)]
    video_parts.append(endings[kind])
    listing = a.WORK / f"partial-{kind}-video.concat.txt"
    listing.write_text("".join(f"file '{a.concat_escape(p)}'\n" for p in video_parts))
    silent = a.WORK / f"partial-{kind}-silent.mp4"
    a.ffmpeg(["-f", "concat", "-safe", "0", "-i", str(listing), "-map", "0:v:0",
              "-an", "-c:v", "copy", "-movflags", "+faststart", str(silent)])
    chosen_audio = [audio_parts[s - 1] for s in scenes] + [audio_parts[-1]]
    audio = a.concatenate_audio(chosen_audio, a.WORK / f"partial-{kind}-audio.wav")
    target = a.OUT / NAMES[kind]
    mux = ["-i", str(silent), "-i", str(audio), "-map", "0:v:0", "-map", "1:a:0",
           "-c:v", "copy", "-c:a", "aac", "-b:a", "320k", "-ar", str(a.RATE),
           "-ac", "2", "-metadata", "title=Extrait partiel — Guteneo Pixar 2",
           "-metadata", "comment=Échantillon partiel des scènes terminées. Le film historique complet attend les autres plans.",
           "-metadata:s:a:0", "language=fra", "-t", str(seconds), "-movflags", "+faststart"]
    a.ffmpeg([*mux, str(target)])
    qa = a.qa_file(target, kind, expected_seconds=seconds)
    if qa["true_peak_dbfs"] > -1.0:
        correction = -1.3 - qa["true_peak_dbfs"]
        a.ffmpeg([*mux, "-af", f"volume={correction}dB", str(target)])
        qa = a.qa_file(target, kind, expected_seconds=seconds)
        qa["aac_peak_correction_db"] = correction
    qa["product_capture_checks"] = a.qa_product_inserts(target, kind, manifest, scene_order=scenes)
    qa["sample_type"] = "partial, not the full historical film"
    qa["source_scene_numbers"] = scenes
    qa["source_clips"] = [str(p) for p in clips]
    qa["original_voice_files"] = [str(a.voices(manifest)[s - 1]) for s in scenes] + [str(a.voices(manifest)[7])]
    qa["official_ending_duration_seconds"] = a.END_DURATION
    qa["narration_and_sfx"] = "Original ElevenLabs narration, no time-stretch; dialogue -16 LUFS, subtle foley -34 LUFS."
    if not all(qa["checks"].values()):
        raise RuntimeError("Partial sample failed technical QA: " + json.dumps(qa))
    # These frames are for review, not new artwork or substituted footage.
    frame_dir = a.OUT / "qa-frames"
    frame_dir.mkdir(exist_ok=True)
    times = [(f"scene-{s:02d}", sum(a.DURATIONS[t - 1] for t in scenes[:i]) + min(2, a.DURATIONS[s - 1] / 2))
             for i, s in enumerate(scenes)]
    times.extend([("endcard-blue", seconds - 6), ("endcard-logo", seconds - 2)])
    qa["review_frames"] = []
    for label, t in times:
        frame = frame_dir / f"partial-{kind}-{label}.png"
        a.ffmpeg(["-ss", str(t), "-i", str(target), "-frames:v", "1", "-update", "1", str(frame)])
        qa["review_frames"].append({"time_seconds": t, "file": str(frame)})
    (a.OUT / f"qa-extrait-pixar2-{kind}.json").write_text(json.dumps(qa, ensure_ascii=False, indent=2))
    print(f"Partial sample ready: {target} ({seconds:.0f}s).", flush=True)
    return qa


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--prepare", action="store_true", help="Prepare shared voice/SFX/ending assets only; do not assemble samples.")
    parser.add_argument("--format", choices=("both", "vertical", "horizontal"), default="both")
    parser.add_argument("--wait-seconds", type=int, default=0, help="Bounded wait for Sync3 files, default 0 (fail immediately if absent).")
    parser.add_argument("--manifest", type=Path, default=a.BASE / "assembly-manifest.json")
    parser.add_argument("--crf", type=int, choices=(18, 19), default=18)
    args = parser.parse_args()
    if not 0 <= args.wait_seconds <= 3600:
        parser.error("--wait-seconds must be between 0 and 3600.")
    manifest = json.loads(args.manifest.read_text())
    kinds = ["vertical", "horizontal"] if args.format == "both" else [args.format]
    a.WORK.mkdir(exist_ok=True)
    a.OUT.mkdir(exist_ok=True)
    if not args.prepare:
        wait_for_clips(required_clips(manifest, kinds), args.wait_seconds)
    endings = a.prepare_endcards(manifest, args.crf)
    audio_parts = a.prepare_audio(manifest)
    if args.prepare:
        print("Partial sample finishing assets ready; no sample assembled.")
        return
    reports = [partial_one(manifest, kind, args.crf, endings, audio_parts) for kind in kinds]
    (a.OUT / "qa-extraits-pixar2.json").write_text(json.dumps({"status": "Partial samples only; full films remain incomplete.",
        "outputs": reports}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, ValueError, FileNotFoundError) as exc:
        sys.exit(str(exc))
