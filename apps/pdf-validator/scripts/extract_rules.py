"""Reproduce the allowlist from the already checksum-verified 1.30.2 CLI JAR."""

import json
from pathlib import Path
import sys
import xml.etree.ElementTree as ET
import zipfile

PROFILES = {"ua1": "PDFUA-1", "ua2": "PDFUA-2-ISO32005", "1b": "PDFA-1B", "2b": "PDFA-2B", "3b": "PDFA-3B", "4": "PDFA-4"}
SPECIFICATIONS = {
    "ISO_14289_1": "ISO 14289-1:2014", "ISO_14289_2": "ISO 14289-2:2024",
    "ISO_19005_1": "ISO 19005-1:2005", "ISO_19005_2": "ISO 19005-2:2011",
    "ISO_19005_3": "ISO 19005-3:2012", "ISO_19005_4": "ISO 19005-4:2020",
    "ISO_32005": "ISO 32005:2023",
}
rules = {}
with zipfile.ZipFile(sys.argv[1]) as archive:
    for profile, filename in PROFILES.items():
        root = ET.fromstring(archive.read("org/verapdf/pdfa/validation/" + filename + ".xml"))
        rules[profile] = [
            [SPECIFICATIONS[node.attrib["specification"]], node.attrib["clause"], int(node.attrib["testNumber"])]
            for node in root.iter() if node.tag.endswith("}id")
        ]
Path(sys.argv[2]).write_text(json.dumps(rules, separators=(",", ":")) + "\n", encoding="utf-8")
