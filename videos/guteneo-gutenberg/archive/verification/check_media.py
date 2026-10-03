#!/usr/bin/env python3
"""Inspect a video with ffprobe and extract five PNG review frames.

The input is read only. All generated inspection files live in a separate
directory (by default: <video-stem>_inspection beside this script).
"""

import argparse
from fractions import Fraction
import json
import math
from pathlib import Path
import shutil
import subprocess
import sys


def run(command):
    result = subprocess.run(command, capture_output=True, text=True)
    if result.returncode:
        raise RuntimeError(result.stderr.strip() or f"Command failed: {command[0]}")
    return result.stdout


def positive_number(value):
    try:
        number = float(value)
        return number if math.isfinite(number) and number > 0 else None
    except (TypeError, ValueError):
        return None


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("video", type=Path, help="Video file to inspect (never modified)")
    parser.add_argument("--output-dir", type=Path, help="Directory for JSON reports and five PNG frames")
    args = parser.parse_args()
    source = args.video.expanduser().resolve()
    if not source.is_file():
        parser.error(f"Video file not found: {source}")
    for executable in ("ffprobe", "ffmpeg"):
        if not shutil.which(executable):
            parser.error(f"Required executable not found: {executable}")

    metadata = json.loads(run([
        "ffprobe", "-v", "error", "-show_format", "-show_streams",
        "-of", "json", str(source),
    ]))
    streams = metadata.get("streams", [])
    video = next((stream for stream in streams
                  if stream.get("codec_type") == "video"
                  and not stream.get("disposition", {}).get("attached_pic")), None)
    if video is None:
        parser.error("No video stream found in the input file")
    duration = (positive_number(video.get("duration"))
                or positive_number(metadata.get("format", {}).get("duration")))
    if duration is None:
        parser.error("Unable to determine a positive video duration")

    try:
        fps = float(Fraction(video.get("avg_frame_rate", "0/1")))
    except (ValueError, ZeroDivisionError):
        fps = None
    if not fps or not math.isfinite(fps):
        fps = None

    output = (args.output_dir.expanduser().resolve() if args.output_dir else
              Path(__file__).resolve().parent / f"{source.stem}_inspection")
    output.mkdir(parents=True, exist_ok=True)
    timestamps = [duration * fraction for fraction in (0.05, 0.275, 0.5, 0.725, 0.95)]
    frames = [
        {"time_seconds": round(timestamp, 6),
         "file": f"frame_{index:02d}_{timestamp:08.3f}s.png"}
        for index, timestamp in enumerate(timestamps, start=1)
    ]
    destinations = [output / name for name in ("ffprobe.json", "report.json")]
    destinations.extend(output / frame["file"] for frame in frames)
    # Refuse pre-existing destinations, including symlinks, so neither the
    # source nor any existing file can be overwritten through an output path.
    if any(path.exists() or path.is_symlink() for path in destinations):
        parser.error(f"Inspection files already exist in {output}; choose a fresh --output-dir")

    audio = [{key: stream.get(key) for key in (
        "index", "codec_name", "sample_rate", "channels", "channel_layout", "duration"
    )} for stream in streams if stream.get("codec_type") == "audio"]
    report = {
        "input": str(source),
        "duration_seconds": duration,
        "width": video.get("width"),
        "height": video.get("height"),
        "video_codec": video.get("codec_name"),
        "video_stream_index": video["index"],
        "average_frame_rate": fps,
        "has_audio": bool(audio),
        "audio_streams": audio,
        "review_frames": frames,
    }
    for frame in frames:
        target = output / frame["file"]
        run([
            "ffmpeg", "-nostdin", "-hide_banner", "-loglevel", "error", "-n",
            "-ss", str(frame["time_seconds"]), "-i", str(source),
            "-map", f"0:{video['index']}", "-frames:v", "1",
            "-an", "-sn", "-dn", str(target),
        ])
        if not target.is_file() or target.stat().st_size == 0:
            raise RuntimeError(f"No frame extracted at {frame['time_seconds']} seconds")
    for name, content in (("ffprobe.json", metadata), ("report.json", report)):
        with (output / name).open("x", encoding="utf-8") as destination:
            json.dump(content, destination, ensure_ascii=False, indent=2)
            destination.write("\n")

    print(f"Input: {source}")
    print(f"Duration: {duration:.3f} s")
    print(f"Resolution: {report['width']} x {report['height']}")
    print(f"Video: {report['video_codec']}; average fps: {fps or 'unknown'}")
    print(f"Audio streams: {len(audio)}")
    for stream in audio:
        print(f"  #{stream['index']}: {stream['codec_name']}, "
              f"{stream['sample_rate']} Hz, {stream['channels']} channels")
    print(f"Reports and five PNG frames: {output}")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (OSError, RuntimeError, json.JSONDecodeError) as error:
        print(f"Error: {error}", file=sys.stderr)
        sys.exit(1)
