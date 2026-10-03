#!/usr/bin/env python3
"""Generate a deterministic, noncustomer PDF near the supported size limit.

Only Python's standard library is used. A fixed xorshift32 generator and explicit
stored DEFLATE blocks make the PDF bytes independent of compressor heuristics,
platform, time and Python's random implementation. The document is deliberately
ordinary PDF 1.7, not a PDF/A or PDF/UA conformance fixture.
"""

import argparse
import hashlib
import json
from pathlib import Path
import struct
import zlib


PAGE_COUNT = 100
IMAGE_WIDTH = 200
IMAGE_HEIGHT = 160
MAXIMUM_BYTES = 10 * 1024 * 1024
MINIMUM_BYTES = 95 * 1024 * 1024 // 10
GENERATOR_VERSION = 1


def rgb_noise(page_number):
    """Stable 96,000-byte image; each page has its own nonzero PRNG seed."""
    state = (0x47555445 ^ (page_number * 0x9E3779B9)) & 0xFFFFFFFF
    result = bytearray(IMAGE_WIDTH * IMAGE_HEIGHT * 3)
    for offset in range(0, len(result), 4):
        state ^= (state << 13) & 0xFFFFFFFF
        state ^= state >> 17
        state ^= (state << 5) & 0xFFFFFFFF
        struct.pack_into("<I", result, offset, state)
    return bytes(result)


def stored_flate(data):
    """A valid RFC 1950 stream containing canonical RFC 1951 stored blocks."""
    result = bytearray(b"\x78\x01")
    for offset in range(0, len(data), 65535):
        block = data[offset:offset + 65535]
        final = offset + len(block) == len(data)
        result.append(int(final))
        result.extend(struct.pack("<HH", len(block), len(block) ^ 0xFFFF))
        result.extend(block)
    result.extend(struct.pack(">I", zlib.adler32(data) & 0xFFFFFFFF))
    return bytes(result)


def text(x, y, size, value):
    escaped = value.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
    return f"BT /F1 {size} Tf {x} {y} Td ({escaped}) Tj ET\n"


def page_content(page_number):
    commands = [
        "0.12 0.14 0.18 rg\n",
        text(40, 806, 14, "Guteneo synthetic PDF validator benchmark"),
        text(40, 784, 9, f"Page {page_number:03d} / 100 - generated test data, no customer content"),
        text(40, 765, 8, "Ordinary PDF 1.7. Not an accessibility or archival compliance example."),
        "q 200 0 0 160 355 580 cm /Im1 Do Q\n",
        text(40, 725, 8, "100 A4 pages; unique RGB noise image on each page."),
        text(40, 710, 8, "Vector text and table; fixed values and reproducible bytes."),
        text(40, 695, 8, "Technical performance fixture for a private diagnostic service."),
        "0.4 w 0.25 0.3 0.35 RG\n",
    ]
    top = 555
    row_height = 17
    rows = 24
    for row in range(rows + 1):
        y = top - row * row_height
        commands.append(f"40 {y} m 555 {y} l S\n")
    for column in range(5):
        x = 40 + column * 128.75
        commands.append(f"{x:g} {top} m {x:g} {top - rows * row_height} l S\n")
    for row in range(rows):
        for column in range(4):
            value = page_number * 1000 + row * 4 + column
            label = f"row {row + 1:02d} col {column + 1:02d} data {value:06d}"
            commands.append(text(f"{45 + column * 128.75:g}", top - row * row_height - 11, 7, label))
    commands.extend([
        text(40, 105, 8, "Attribution: Guteneo. All text, values and image pixels were generated."),
        text(40, 90, 8, "This fixture contains no accounts, identifiers, attachments or real records."),
        text(40, 75, 8, f"Generator version {GENERATOR_VERSION}; deterministic xorshift32 page seed {page_number:03d}."),
    ])
    return "".join(commands).encode("ascii")


def stream(dictionary, data):
    return dictionary + f" /Length {len(data)} >>\nstream\n".encode("ascii") + data + b"\nendstream"


def generate_pdf():
    pages = [5 + page * 3 for page in range(PAGE_COUNT)]
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        f"<< /Type /Pages /Count {PAGE_COUNT} /Kids [".encode("ascii")
        + " ".join(f"{number} 0 R" for number in pages).encode("ascii") + b"] >>",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
        b"<< /Title (Guteneo synthetic 100-page PDF benchmark) /Author (Guteneo) "
        b"/Creator (Guteneo deterministic standard-library generator v1) >>",
    ]
    for index, page_object in enumerate(pages):
        content_object = page_object + 1
        image_object = page_object + 2
        objects.append(
            f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] "
            f"/Resources << /Font << /F1 3 0 R >> /XObject << /Im1 {image_object} 0 R >> >> "
            f"/Contents {content_object} 0 R >>".encode("ascii")
        )
        objects.append(stream(b"<<", page_content(index + 1)))
        image = stored_flate(rgb_noise(index + 1))
        objects.append(stream(
            f"<< /Type /XObject /Subtype /Image /Width {IMAGE_WIDTH} /Height {IMAGE_HEIGHT} "
            "/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode".encode("ascii"),
            image,
        ))
    pdf = bytearray(b"%PDF-1.7\n%\xe2\xe3\xcf\xd3\n")
    offsets = [0]
    for number, body in enumerate(objects, start=1):
        offsets.append(len(pdf))
        pdf.extend(f"{number} 0 obj\n".encode("ascii"))
        pdf.extend(body)
        pdf.extend(b"\nendobj\n")
    xref_offset = len(pdf)
    pdf.extend(f"xref\n0 {len(offsets)}\n0000000000 65535 f \n".encode("ascii"))
    for offset in offsets[1:]:
        pdf.extend(f"{offset:010d} 00000 n \n".encode("ascii"))
    pdf.extend(
        f"trailer\n<< /Size {len(offsets)} /Root 1 0 R /Info 4 0 R >>\n"
        f"startxref\n{xref_offset}\n%%EOF\n".encode("ascii")
    )
    if not MINIMUM_BYTES <= len(pdf) <= MAXIMUM_BYTES:
        raise ValueError("The benchmark PDF must remain between 9.5 and 10 MiB")
    return bytes(pdf)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path, help="Destination PDF, normally a temporary directory")
    parser.add_argument("--manifest", type=Path, help="Verify bytes against the checked-in fixture manifest")
    args = parser.parse_args()
    data = generate_pdf()
    digest = hashlib.sha256(data).hexdigest()
    if args.manifest:
        manifest = json.loads(args.manifest.read_text(encoding="utf-8"))
        fixture = manifest["fixtures"][0]
        if fixture["sha256"] != digest or fixture["sizeBytes"] != len(data):
            raise ValueError("The generated benchmark does not match its reviewed fixture manifest")
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_bytes(data)
    print(json.dumps({"sha256": digest, "sizeBytes": len(data), "pageCount": PAGE_COUNT}))


if __name__ == "__main__":
    main()
