#!/usr/bin/env python3
"""No-cost local rough cut from existing approved-style footage.

Excludes both computer shots with physically inconsistent screens.
No network requests or model generations.
"""
import json
from pathlib import Path

import assemble as a
import partial

BASE = Path(__file__).resolve().parent
manifest = json.loads((BASE / "assembly-manifest.json").read_text())
partial.SELECTION["vertical"] = [4, 6, 7]
partial.NAMES["vertical"] = "Guteneo-apercu-court-sans-plan-ordinateur-34s.mp4"
partial.wait_for_clips(partial.required_clips(manifest, ["vertical"]), 0)

# Reuse the finished, exact official ending and already mixed original voices.
ending = a.WORK / "endcard-vertical-silent.mp4"
if not ending.is_file():
    raise FileNotFoundError(ending)
audio_parts = [a.WORK / f"scene-{i:02d}-audio.wav" for i in range(1, 8)]
audio_parts.append(a.WORK / "endcard-audio.wav")
for path in audio_parts:
    if not path.is_file():
        raise FileNotFoundError(path)

report = partial.partial_one(manifest, "vertical", 18,
                             {"vertical": ending}, audio_parts)
report["purpose"] = "Short salvage preview using existing footage only."
report["excluded_scenes"] = [5]
report["exclusion_reason"] = "Incorrect monitor geometry: interface appears on the back."
report["additional_generation_credits"] = 0
(a.OUT / "qa-apercu-court-34s.json").write_text(
    json.dumps(report, ensure_ascii=False, indent=2))

# Keep the previous 43-second sample's report associated with its own file.
old_bundle = a.OUT / "qa-extraits-pixar2.json"
if old_bundle.is_file():
    previous = json.loads(old_bundle.read_text())
    for item in previous.get("outputs", []):
        if item.get("file", "").endswith("Extrait-Pixar2-Instagram-43s.mp4"):
            (a.OUT / "qa-extrait-pixar2-vertical.json").write_text(
                json.dumps(item, ensure_ascii=False, indent=2))
