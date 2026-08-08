#!/usr/bin/env python3
"""Package exactly the files covered by the release checksum manifest."""
from __future__ import annotations

from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

ROOT = Path(__file__).resolve().parent.parent
OUTPUT = ROOT.parent / "outputs" / "osoul_complete_launch" / "Osool-Hospitality-v15-Hostinger.zip"
MANIFEST = ROOT / ".checksums.sha256"

files = [line.split("  ", 1)[1] for line in MANIFEST.read_text(encoding="utf-8").splitlines() if "  " in line]
OUTPUT.parent.mkdir(parents=True, exist_ok=True)
with ZipFile(OUTPUT, "w", compression=ZIP_DEFLATED, compresslevel=9) as archive:
    for relative in files:
        archive.write(ROOT / relative, relative)
    archive.write(MANIFEST, MANIFEST.name)

print(f"Wrote {OUTPUT} with {len(files) + 1} files")
