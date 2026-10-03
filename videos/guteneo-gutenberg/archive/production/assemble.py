#!/usr/bin/env python3
"""Deterministic finishing only: ElevenLabs footage/voices + official Guteneo ending.

No uploads, network calls, generations, or source mutations are performed here.
Prepare/preview the official ending:
  python3 assemble.py --prepare-endcards
Finish both formats once the manifest's fourteen clips exist:
  python3 assemble.py --assemble --manifest assembly-manifest.json
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path
import re
import subprocess
import sys

BASE = Path(__file__).resolve().parent
BRAND = BASE.parent / "brand-reference"
WORK = BASE / "finishing"
OUT = BASE / "deliverables"
DURATIONS = [10, 11, 10, 8, 9, 9, 10]
END_START = 59.5
END_DURATION = 7.0
FPS = 30
RATE = 48000
FORMATS = {"horizontal": (1920, 1080), "vertical": (1080, 1920)}
EFFECTS = ["stone", "papyrus", "press", "fax", "digital", "digital", None]
# The foley is deliberately quiet; original speech starts at its original timestamp.
EFFECT_STARTS = [0.25, 0.35, 0.45, 0.45, 0.5, 0.65, 0.0]


def run(args: list[str], capture: bool = False) -> subprocess.CompletedProcess:
    proc = subprocess.run([str(a) for a in args], stdout=subprocess.PIPE,
                          stderr=subprocess.PIPE, text=True)
    if proc.returncode:
        raise RuntimeError("Command failed: " + " ".join(map(str, args)) + "\n" + proc.stderr[-12000:])
    return proc


def ffmpeg(args: list[str]) -> subprocess.CompletedProcess:
    return run(["ffmpeg", "-hide_banner", "-nostdin", "-y", *args])


def probe(path: Path) -> dict:
    return json.loads(run(["ffprobe", "-v", "error", "-show_streams", "-show_format",
                           "-of", "json", str(path)]).stdout)


def duration(path: Path) -> float:
    return float(probe(path)["format"]["duration"])


def resolve(path: str | Path) -> Path:
    p = Path(path)
    return p if p.is_absolute() else BASE / p


def fingerprint(sources: list[Path], settings: dict) -> str:
    state = {"sources": [(str(p), p.stat().st_size, p.stat().st_mtime_ns) for p in sources],
             "settings": settings, "script": Path(__file__).stat().st_mtime_ns}
    return hashlib.sha256(json.dumps(state, sort_keys=True).encode()).hexdigest()


def cached(path: Path, sources: list[Path], settings: dict) -> tuple[bool, str]:
    key = fingerprint(sources, settings)
    sidecar = path.with_suffix(path.suffix + ".cache")
    return path.exists() and sidecar.exists() and sidecar.read_text() == key, key


def mark(path: Path, key: str) -> None:
    path.with_suffix(path.suffix + ".cache").write_text(key)


def loudness(path: Path, target: float = -16, trim: tuple[float, float] | None = None) -> dict:
    filters = ""
    if trim:
        filters += f"atrim=start={trim[0]}:duration={trim[1]},asetpts=PTS-STARTPTS,"
    filters += f"aformat=sample_rates={RATE}:channel_layouts=stereo,loudnorm=I={target}:TP=-2:LRA=11:print_format=json"
    result = ffmpeg(["-i", str(path), "-vn", "-af", filters, "-f", "null", "-"])
    found = re.findall(r'\{\s*"input_i"[\s\S]*?\}', result.stderr)
    if not found:
        raise RuntimeError(f"No loudness result for {path}")
    return json.loads(found[-1])


def normalise(source: Path, destination: Path, target: float = -16,
              trim: tuple[float, float] | None = None) -> Path:
    settings = {"target_lufs": target, "true_peak_db": -2, "trim": trim}
    hit, key = cached(destination, [source], settings)
    if hit:
        return destination
    stats = loudness(source, target, trim)
    values = [float(stats[k]) for k in ("input_i", "input_tp", "input_lra", "input_thresh", "target_offset")]
    if not all(math.isfinite(v) for v in values):
        raise RuntimeError(f"Silent or unmeasurable audio: {source}")
    filters = ""
    if trim:
        filters += f"atrim=start={trim[0]}:duration={trim[1]},asetpts=PTS-STARTPTS,"
    filters += (
        f"aformat=sample_rates={RATE}:channel_layouts=stereo,"
        f"loudnorm=I={target}:TP=-2:LRA=11:"
        f"measured_I={stats['input_i']}:measured_TP={stats['input_tp']}:"
        f"measured_LRA={stats['input_lra']}:measured_thresh={stats['input_thresh']}:"
        f"offset={stats['target_offset']}:linear=true,aresample={RATE}"
    )
    ffmpeg(["-i", str(source), "-vn", "-af", filters, "-ar", str(RATE),
            "-ac", "2", "-c:a", "pcm_s24le", str(destination)])
    destination.with_suffix(".loudness.json").write_text(json.dumps({"source": str(source),
        "target_lufs": target, "source_measurement": stats}, indent=2))
    mark(destination, key)
    return destination


def effect_path(name: str | None, manifest: dict) -> Path | None:
    if name is None:
        return None
    if name in manifest.get("sfx", {}):
        p = resolve(manifest["sfx"][name])
        if not p.exists():
            raise FileNotFoundError(p)
        return p
    for ext in ("wav", "mp3", "flac", "m4a"):
        p = BASE / "sfx" / f"{name}.{ext}"
        if p.exists():
            return p
    return None


def mix_audio(parts: list[tuple[Path, float, float | None]], destination: Path,
              seconds: float) -> Path:
    """parts = (already-normalized file, start offset, optional fade-in seconds)."""
    hit, key = cached(destination, [x[0] for x in parts], {"parts": [(x[1], x[2]) for x in parts], "seconds": seconds})
    if hit:
        return destination
    inputs: list[str] = []
    filters: list[str] = []
    for i, (path, offset, fade_in) in enumerate(parts):
        inputs.extend(["-i", str(path)])
        branch = f"[{i}:a]asetpts=PTS-STARTPTS"
        if fade_in:
            branch += f",afade=t=in:st=0:d={fade_in}"
        if i > 0:
            available = min(duration(path), seconds - offset)
            branch += f",afade=t=out:st={max(0, available - 0.35)}:d=0.35"
        branch += f",adelay={round(offset * 1000)}:all=1,apad,atrim=duration={seconds}[a{i}]"
        filters.append(branch)
    filters.append("".join(f"[a{i}]" for i in range(len(parts))) +
        f"amix=inputs={len(parts)}:duration=longest:dropout_transition=0:normalize=0,"
        f"aresample=192000,alimiter=limit=0.794328:attack=1:release=40:level=false:latency=true,"
        f"aresample={RATE},apad,atrim=duration={seconds}[mix]")
    ffmpeg([*inputs, "-filter_complex", ";".join(filters), "-map", "[mix]",
            "-ar", str(RATE), "-ac", "2", "-c:a", "pcm_s24le", str(destination)])
    mark(destination, key)
    return destination


def voices(manifest: dict) -> list[Path]:
    paths = manifest.get("voices", [f"audio/{i:02d}-voix.mp3" for i in range(1, 9)])
    if len(paths) != 8:
        raise ValueError("Exactly eight source voices are required.")
    return [resolve(p) for p in paths]


def prepare_audio(manifest: dict, endings_only: bool = False) -> list[Path]:
    source_voices = voices(manifest)
    chosen = [7] if endings_only else range(8)
    normal = {}
    for i in chosen:
        normal[i] = normalise(source_voices[i], WORK / f"voice-{i+1:02d}.wav")
    result = []
    if not endings_only:
        for i, seconds in enumerate(DURATIONS):
            if duration(source_voices[i]) > seconds - 0.15:
                raise ValueError(f"Scene {i+1} cannot contain its full voice with a safe ending margin.")
            parts = [(normal[i], 0, None)]
            effect = effect_path(EFFECTS[i], manifest)
            if effect:
                soft = normalise(effect, WORK / f"sfx-{EFFECTS[i]}.wav", target=-34)
                parts.append((soft, EFFECT_STARTS[i], 0.04))
            elif EFFECTS[i]:
                print(f"WARNING: No {EFFECTS[i]} effect. Voice remains complete.", file=sys.stderr)
            result.append(mix_audio(parts, WORK / f"scene-{i+1:02d}-audio.wav", seconds))
    music_source = BRAND / "guteneo-homepage-horizontal-v8-fr.mp4"
    music = normalise(music_source, WORK / "official-ending-music.wav", target=-34,
                      trim=(END_START, END_DURATION))
    parts = [(normal[7], 0.55, None), (music, 0, 0.2)]
    swallow = effect_path("swallows", manifest)
    if swallow:
        soft = normalise(swallow, WORK / "sfx-swallows.wav", target=-37)
        parts.append((soft, 1.8, 0.12))
    result.append(mix_audio(parts, WORK / "endcard-audio.wav", END_DURATION))
    return result


def video_options(crf: int) -> list[str]:
    return ["-c:v", "libx264", "-preset", "slow", "-crf", str(crf),
            "-profile:v", "high", "-level:v", "4.1", "-pix_fmt", "yuv420p",
            "-r", str(FPS), "-video_track_timescale", "15360", "-g", "60",
            "-keyint_min", "30", "-sc_threshold", "0", "-color_range", "tv",
            "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709"]


def product_insert_for(manifest: dict, scene: int, kind: str) -> dict | None:
    matches = [dict(item) for item in manifest.get("product_inserts", [])
               if int(item["scene"]) == scene and item.get(kind)]
    if len(matches) > 1:
        raise ValueError(f"Only one product insert is supported in scene {scene}/{kind}.")
    if not matches:
        return None
    item = matches[0]
    item["path"] = str(resolve(item[kind]))
    start = float(item.get("start_seconds", 6.0))
    length = float(item.get("duration_seconds", 3.0))
    fade = int(item.get("fade_frames", 6))
    if start < 0 or length <= 0 or start + length > DURATIONS[scene - 1] + 0.001:
        raise ValueError(f"Product insert exceeds scene {scene}'s fixed duration.")
    if fade < 0 or fade / FPS > length:
        raise ValueError("Product fade must fit within its insert.")
    item.update(start_seconds=start, duration_seconds=length, fade_frames=fade)
    if not Path(item["path"]).is_file():
        raise FileNotFoundError(item["path"])
    return item


def conform_video(source: Path, destination: Path, kind: str, seconds: float,
                  crf: int, ending: bool = False, product_insert: dict | None = None) -> Path:
    info = probe(source)
    stream = next(s for s in info["streams"] if s["codec_type"] == "video")
    w, h = FORMATS[kind]
    sw, sh = stream["width"], stream["height"]
    source_seconds = float(stream.get("duration", info["format"]["duration"]))
    if not ending:
        if abs(sw / sh - w / h) > 0.015:
            raise ValueError(f"Wrong native aspect ratio for {kind}: {source} ({sw}×{sh}).")
        if min(sw, sh) < 1080:
            raise ValueError(f"Not a native 1080p clip: {source} ({sw}×{sh}).")
        if source_seconds < seconds - 0.5:
            raise ValueError(f"Clip {source} is too short: {source_seconds}s for {seconds}s.")
    cache_sources = [source]
    if product_insert:
        if ending:
            raise ValueError("The official ending must not receive a product insert.")
        cache_sources.append(Path(product_insert["path"]))
    hit, key = cached(destination, cache_sources, {"format": kind, "seconds": seconds,
        "crf": crf, "ending": ending, "product_insert": product_insert})
    if hit:
        return destination
    vf = []
    if ending:
        vf.extend([f"trim=start={END_START}:duration={seconds}", "setpts=PTS-STARTPTS"])
    else:
        vf.extend(["setpts=PTS-STARTPTS", f"tpad=stop_mode=clone:stop_duration=0.5", f"trim=duration={seconds}"])
    if ending and kind == "vertical":
        # Original official portrait is 1320×2868. Remove only empty top/bottom space.
        # Crop uses an even integer height for 4:2:0; the scale preserves every logo's shape.
        vf.append("crop=iw:trunc(iw*16/9/2)*2:0:(ih-oh)/2")
    color = ":in_range=pc:in_color_matrix=bt601" if ending else ""
    vf.extend([f"scale={w}:{h}:flags=lanczos{color}:out_range=tv:out_color_matrix=bt709",
               "setsar=1", f"fps={FPS}", "format=yuv420p"])
    inputs = ["-i", str(source)]
    render = ["-map", "0:v:0", "-vf", ",".join(vf)]
    if product_insert:
        capture = Path(product_insert["path"])
        capture_info = next(s for s in probe(capture)["streams"] if s["codec_type"] == "video")
        iw, ih = capture_info["width"], capture_info["height"]
        # Native captures are used pixel for pixel; other ratios fit inside an ivory canvas.
        # There is no crop, invented interface, text overlay, zoom, or pan.
        image_filter = f"scale={w}:{h}:flags=lanczos:force_original_aspect_ratio=decrease:out_range=tv:out_color_matrix=bt709"
        if (iw, ih) != (w, h):
            image_filter += f",pad={w}:{h}:(ow-iw)/2:(oh-ih)/2:color=0xF7F5EF"
        image_filter += ",setsar=1,format=yuva420p"
        start = product_insert["start_seconds"]
        end = start + product_insert["duration_seconds"]
        if product_insert["fade_frames"]:
            image_filter += f",fade=t=in:st={start}:d={product_insert['fade_frames']/FPS}:alpha=1"
        graph = (f"[0:v]{','.join(vf)}[scene];[1:v]{image_filter}[capture];"
                 f"[scene][capture]overlay=0:0:enable='gte(t,{start})*lt(t,{end})':"
                 "eof_action=pass:format=yuv420,format=yuv420p[video]")
        inputs.extend(["-loop", "1", "-framerate", str(FPS), "-i", str(capture)])
        render = ["-filter_complex", graph, "-map", "[video]"]
    ffmpeg([*inputs, *render, "-an",
            *video_options(crf), "-frames:v", str(round(seconds * FPS)),
            "-movflags", "+faststart", str(destination)])
    mark(destination, key)
    return destination


def prepare_endcards(manifest: dict, crf: int) -> dict[str, Path]:
    end_audio = prepare_audio(manifest, endings_only=True)[0]
    endings = {}
    for kind in FORMATS:
        source = BRAND / f"guteneo-homepage-{kind}-v8-fr.mp4"
        silent = conform_video(source, WORK / f"endcard-{kind}-silent.mp4", kind, END_DURATION, crf, ending=True)
        preview = WORK / f"endcard-{kind}-preview.mp4"
        ffmpeg(["-i", str(silent), "-i", str(end_audio), "-map", "0:v:0", "-map", "1:a:0",
                "-c:v", "copy", "-c:a", "aac", "-b:a", "320k", "-ar", str(RATE),
                "-t", str(END_DURATION), "-movflags", "+faststart", str(preview)])
        for second in (1, 3, 5):
            frame = WORK / f"endcard-{kind}-at-{second}s.png"
            ffmpeg(["-ss", str(second), "-i", str(preview), "-frames:v", "1", "-update", "1", str(frame)])
        endings[kind] = silent
    return endings


def concat_escape(path: Path) -> str:
    return str(path).replace("'", "'\\''")


def concatenate_audio(paths: list[Path], target: Path | None = None) -> Path:
    target = target or WORK / "complete-audio.wav"
    listing = target.with_suffix(".concat.txt")
    listing.write_text("".join(f"file '{concat_escape(p)}'\n" for p in paths))
    ffmpeg(["-f", "concat", "-safe", "0", "-i", str(listing), "-c:a", "pcm_s24le", str(target)])
    return target


def qa_file(path: Path, kind: str, expected_seconds: float | None = None) -> dict:
    info = probe(path)
    video = next(s for s in info["streams"] if s["codec_type"] == "video")
    audio = next(s for s in info["streams"] if s["codec_type"] == "audio")
    stats = loudness(path)
    expected = expected_seconds if expected_seconds is not None else sum(DURATIONS) + END_DURATION
    qa = {"file": str(path), "duration": float(info["format"]["duration"]),
          "width": video["width"], "height": video["height"],
          "fps": video["avg_frame_rate"], "codec": video["codec_name"],
          "profile": video.get("profile"), "pixel_format": video["pix_fmt"],
          "sample_rate": int(audio["sample_rate"]), "channels": audio["channels"],
          "audio_codec": audio["codec_name"], "audio_bitrate": audio.get("bit_rate"),
          "integrated_lufs": float(stats["input_i"]), "true_peak_dbfs": float(stats["input_tp"]),
          "bytes": path.stat().st_size}
    qa["checks"] = {"expected_resolution": (qa["width"], qa["height"]) == FORMATS[kind],
                    "expected_duration": abs(qa["duration"] - expected) < 0.06,
                    "thirty_fps": qa["fps"] == "30/1",
                    "true_peak_below_minus_one": qa["true_peak_dbfs"] <= -1.0,
                    "stereo_48khz": qa["channels"] == 2 and qa["sample_rate"] == RATE}
    decode = run(["ffmpeg", "-v", "error", "-i", str(path), "-f", "null", "-"])
    qa["checks"]["decodes_without_errors"] = not decode.stderr.strip()
    return qa


def qa_product_inserts(path: Path, kind: str, manifest: dict,
                       scene_order: list[int] | None = None) -> list[dict]:
    checks = []
    frame_dir = OUT / "qa-frames"
    frame_dir.mkdir(exist_ok=True)
    order = scene_order or list(range(1, 8))
    starts = {}
    elapsed = 0.0
    for scene in order:
        starts[scene] = elapsed
        elapsed += DURATIONS[scene - 1]
    for scene in order:
        item = product_insert_for(manifest, scene, kind)
        if not item:
            continue
        local = item["start_seconds"] + item["fade_frames"] / FPS
        local += min(0.5, (item["duration_seconds"] - item["fade_frames"] / FPS) / 2)
        absolute = starts[scene] + local
        prefix = "partial-" if scene_order is not None else ""
        frame = frame_dir / f"{prefix}product-scene-{scene:02d}-{kind}.png"
        ffmpeg(["-ss", str(absolute), "-i", str(path), "-frames:v", "1", "-update", "1", str(frame)])
        capture = Path(item["path"])
        source = next(s for s in probe(capture)["streams"] if s["codec_type"] == "video")
        result = {"scene": scene, "time_in_final_seconds": absolute,
                  "source": str(capture), "source_sha256": hashlib.sha256(capture.read_bytes()).hexdigest(),
                  "review_frame": str(frame), "no_crop": True}
        if (source["width"], source["height"]) == FORMATS[kind]:
            stats = ffmpeg(["-i", str(capture), "-i", str(frame), "-lavfi", "ssim", "-f", "null", "-"])
            score = re.search(r"All:([\d.]+)", stats.stderr)
            if not score:
                raise RuntimeError("Product capture similarity could not be measured.")
            result["ssim_to_real_capture"] = float(score.group(1))
            result["matches_real_capture"] = result["ssim_to_real_capture"] >= 0.97
            if not result["matches_real_capture"]:
                raise RuntimeError("Product screenshot failed final visual similarity check: " + json.dumps(result))
        checks.append(result)
    return checks


def assemble(manifest: dict, crf: int) -> None:
    all_clips = {}
    for kind in FORMATS:
        entries = manifest.get(kind)
        if not entries or len(entries) != 7:
            raise ValueError(f"Manifest requires seven {kind} clip paths.")
        all_clips[kind] = [resolve(p) for p in entries]
        for p in all_clips[kind]:
            if not p.is_file():
                raise FileNotFoundError(p)
    # No final assembly is started until all fourteen source clips are present.
    endings = prepare_endcards(manifest, crf)
    audio = concatenate_audio(prepare_audio(manifest))
    reports = []
    for kind in FORMATS:
        video_parts = [conform_video(p, WORK / f"scene-{i+1:02d}-{kind}.mp4", kind,
                                    DURATIONS[i], crf,
                                    product_insert=product_insert_for(manifest, i + 1, kind))
                       for i, p in enumerate(all_clips[kind])]
        video_parts.append(endings[kind])
        listing = WORK / f"video-concat-{kind}.txt"
        listing.write_text("".join(f"file '{concat_escape(p)}'\n" for p in video_parts))
        silent = WORK / f"complete-{kind}-silent.mp4"
        ffmpeg(["-f", "concat", "-safe", "0", "-i", str(listing), "-map", "0:v:0",
                "-c:v", "copy", "-an", "-movflags", "+faststart", str(silent)])
        target = OUT / ("Guteneo-Gutenberg-1080p.mp4" if kind == "horizontal" else "Guteneo-Gutenberg-Instagram-1080x1920.mp4")
        mux = ["-i", str(silent), "-i", str(audio), "-map", "0:v:0", "-map", "1:a:0",
               "-c:v", "copy", "-c:a", "aac", "-b:a", "320k", "-ar", str(RATE),
               "-ac", "2", "-metadata", "title=Guteneo — Gutenberg à travers les âges",
               "-metadata:s:a:0", "language=fra", "-t", str(sum(DURATIONS) + END_DURATION),
               "-movflags", "+faststart"]
        ffmpeg([*mux, str(target)])
        report = qa_file(target, kind)
        if report["true_peak_dbfs"] > -1:
            # AAC reconstruction can add a small peak: one fixed-gain correction, no re-encoding of video.
            attenuation = -1.3 - report["true_peak_dbfs"]
            ffmpeg([*mux, "-af", f"volume={attenuation}dB", str(target)])
            report = qa_file(target, kind)
            report["aac_peak_correction_db"] = attenuation
        report["product_capture_checks"] = qa_product_inserts(target, kind, manifest)
        reports.append(report)
        if not all(report["checks"].values()):
            raise RuntimeError("Final output failed technical QA: " + json.dumps(report))
        print(f"Finished {target} ({report['duration']:.2f}s, {report['width']}×{report['height']})", flush=True)
    report = {"outputs": reports,
        "scene_durations": DURATIONS, "ending_source_start": END_START, "ending_duration": END_DURATION,
        "source_clips": {k: [str(p) for p in v] for k, v in all_clips.items()},
        "speech_sources": [str(p) for p in voices(manifest)],
        "voice_target_lufs": -16, "foley_target_lufs": -34,
        "product_inserts": manifest.get("product_inserts", []),
        "product_insert_review": "Native real website captures, no crop or generated interface; check final frames from 54.2 to 57.0 seconds.",
        "speech_timing": "Original ElevenLabs audio retained at t=0 in scenes; no time-stretch or wording changes.",
        "ending_voice_offset_seconds": 0.55,
        "visual_review_required": "Review identity continuity, lip sync, framing and SFX timing on the finished exports."}
    (OUT / "qa-assembly.json").write_text(json.dumps(report, ensure_ascii=False, indent=2))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    action = parser.add_mutually_exclusive_group(required=True)
    action.add_argument("--prepare-endcards", action="store_true")
    action.add_argument("--assemble", action="store_true")
    parser.add_argument("--manifest", type=Path, default=BASE / "assembly-manifest.json")
    parser.add_argument("--crf", type=int, choices=(18, 19), default=18)
    args = parser.parse_args()
    WORK.mkdir(exist_ok=True)
    OUT.mkdir(exist_ok=True)
    manifest = json.loads(args.manifest.read_text()) if args.manifest.exists() else {}
    if args.assemble:
        assemble(manifest, args.crf)
    else:
        prepare_endcards(manifest, args.crf)
        report = {k: {"silent": str(WORK / f"endcard-{k}-silent.mp4"),
                      "preview": str(WORK / f"endcard-{k}-preview.mp4"),
                      "probe": probe(WORK / f"endcard-{k}-preview.mp4")}
                  for k in FORMATS}
        (WORK / "endcard-qa.json").write_text(json.dumps(report, indent=2))
        print("Official ending previews and frames ready in", WORK)


if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, ValueError, FileNotFoundError) as exc:
        sys.exit(str(exc))
