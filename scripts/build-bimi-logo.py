#!/usr/bin/env python3
"""Convert the existing compact emblem to a bounded, noninteractive SVG candidate.

Generation needs Pillow. --check uses only Python's standard library and never
changes files. This is a narrow local asset check, not certificate validation.
"""

import argparse
from collections import defaultdict
import hashlib
import json
from pathlib import Path
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "apps/web/public/brand/guteneo-mark.png"
OUTPUT = ROOT / "apps/web/public/brand/guteneo-bimi.svg"
PROOF = ROOT / "assets/brand/source/guteneo-bimi-proof.json"
NS = "http://www.w3.org/2000/svg"


def digest(content):
    return hashlib.sha256(content).hexdigest()


def simplify(points, tolerance):
    if len(points) <= 2:
        return points
    (ax, ay), (bx, by) = points[0], points[-1]
    vx, vy = bx - ax, by - ay
    denominator = vx * vx + vy * vy
    distances = []
    for x, y in points[1:-1]:
        ratio = max(0, min(1, ((x-ax)*vx + (y-ay)*vy) / denominator)) if denominator else 0
        distances.append((x-ax-ratio*vx)**2 + (y-ay-ratio*vy)**2)
    distance = max(distances, default=0)
    if distance <= tolerance * tolerance:
        return [points[0], points[-1]]
    pivot = distances.index(distance) + 1
    return simplify(points[:pivot+1], tolerance)[:-1] + simplify(points[pivot:], tolerance)


def simplify_loop(points, tolerance):
    x, y = points[0]
    pivot = max(range(len(points)), key=lambda i: (points[i][0]-x)**2 + (points[i][1]-y)**2)
    return (simplify(points[:pivot+1], tolerance)[:-1]
            + simplify(points[pivot:] + [points[0]], tolerance)[:-1])


def build():
    from PIL import Image

    source = SOURCE.read_bytes()
    image = Image.open(SOURCE).convert("RGB")
    if image.size != (512, 512):
        raise ValueError("The reviewed compact source must remain 512 by 512.")
    width, height = image.size
    mask = [blue-red > 40 and blue-green > 30 for red, green, blue in image.getdata()]
    edges = defaultdict(list)
    for y in range(height):
        for x in range(width):
            if not mask[y*width+x]:
                continue
            if y == 0 or not mask[(y-1)*width+x]:
                edges[(x, y)].append((x+1, y))
            if x == width-1 or not mask[y*width+x+1]:
                edges[(x+1, y)].append((x+1, y+1))
            if y == height-1 or not mask[(y+1)*width+x]:
                edges[(x+1, y+1)].append((x, y+1))
            if x == 0 or not mask[y*width+x-1]:
                edges[(x, y+1)].append((x, y))
    paths = []
    while edges:
        start = current = next(iter(edges))
        previous = (start[0]-1, start[1])
        points = [start]
        while True:
            dx, dy = current[0]-previous[0], current[1]-previous[1]

            def rank(point):
                ex, ey = point[0]-current[0], point[1]-current[1]
                cross, dot = dx*ey-dy*ex, dx*ex+dy*ey
                return 3 if dot == -1 else {1: 0, 0: 1, -1: 2}.get(cross, 3)

            following = min(edges[current], key=rank)
            edges[current].remove(following)
            if not edges[current]:
                del edges[current]
            previous, current = current, following
            if current == start:
                break
            points.append(current)
        paths.append(simplify_loop(simplify_loop(points, 0.45), 0.6))
    data = "".join("M" + " ".join(f"{x} {y}" for x, y in points) + "Z" for points in paths)
    svg = (f'<svg xmlns="{NS}" version="1.2" baseProfile="tiny-ps" width="512" height="512" viewBox="0 0 512 512">'
           '<title>guteneo</title><desc>Guteneo blue Gutenberg stamp emblem on white paper.</desc>'
           '<rect width="512" height="512" fill="#fff"/>'
           f'<path fill="#0149e9" fill-rule="evenodd" d="{data}"/></svg>\n')
    content = svg.encode()
    if len(content) > 32_000:
        raise ValueError("The candidate exceeds the conservative 32,000-byte limit.")
    OUTPUT.write_bytes(content)
    PROOF.write_text(json.dumps({
        "status": "local_vector_candidate_not_certified",
        "source": str(SOURCE.relative_to(ROOT)),
        "sourceSha256": digest(source),
        "output": str(OUTPUT.relative_to(ROOT)),
        "outputSha256": digest(content),
        "outputBytes": len(content),
        "conversion": "Deterministic blue-mask boundary trace; closed-contour RDP at 0.45 then 0.6 source pixels; original preserved.",
        "color": "#0149e9, the source's most frequent blue; background normalized to solid white.",
        "contours": len(paths),
        "points": sum(map(len, paths)),
        "limits": "Technical derivative only; not a new logo, trademark proof, CA approval, certificate or Gmail display qualification."
    }, indent=2) + "\n")


def check():
    content = OUTPUT.read_bytes()
    if len(content) > 32_000 or b"<!" in content or b"<?" in content:
        raise ValueError("The candidate exceeds the local subset or byte limit.")
    root = ET.fromstring(content)
    if root.tag != f"{{{NS}}}svg" or root.attrib != {
        "version": "1.2", "baseProfile": "tiny-ps", "width": "512", "height": "512", "viewBox": "0 0 512 512"
    }:
        raise ValueError("Unexpected BIMI SVG root.")
    children = list(root)
    if [child.tag for child in children] != [f"{{{NS}}}{tag}" for tag in ("title", "desc", "rect", "path")]:
        raise ValueError("Unexpected active, external, raster or unsupported SVG content.")
    if any(list(child) for child in children) or children[0].text != "guteneo" or not children[1].text:
        raise ValueError("Unexpected nested content or missing accessible identity.")
    if children[0].attrib or children[1].attrib or children[2].attrib != {"width": "512", "height": "512", "fill": "#fff"}:
        raise ValueError("Unexpected SVG metadata or background.")
    path = children[3]
    if set(path.attrib) != {"fill", "fill-rule", "d"} or path.attrib["fill"] != "#0149e9" or path.attrib["fill-rule"] != "evenodd":
        raise ValueError("Unexpected SVG path attributes.")
    if not path.attrib["d"] or any(character not in "MZ 0123456789" for character in path.attrib["d"]):
        raise ValueError("Unexpected SVG path commands.")
    proof = json.loads(PROOF.read_text())
    if proof["sourceSha256"] != digest(SOURCE.read_bytes()) or proof["outputSha256"] != digest(content):
        raise ValueError("The reviewed source or candidate has changed.")
    return {"localAssetValid": True, "bytes": len(content), "certificateValidated": False, "gmailDisplayQualified": False}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Check the existing candidate without writing.")
    arguments = parser.parse_args()
    if not arguments.check:
        build()
    print(json.dumps(check()))
