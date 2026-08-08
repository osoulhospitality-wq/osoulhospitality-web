#!/usr/bin/env python3
"""Generate a deterministic SHA-256 manifest for release and source assets."""
from __future__ import annotations

import hashlib
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUTPUT = ROOT / ".checksums.sha256"
EXCLUDED_DIRS = {".git", "__pycache__", "automation", "content", "docs", "node_modules", "scripts", "src"}
EXCLUDED_FILES = {
    ".checksums.sha256",
    ".gitignore",
    "DEPLOYMENT.md",
    "package.json",
    "package-lock.json",
    "command-center/enterprise/README.md",
    "command-center/enterprise/config.example.js",
    "command-center/enterprise/schema.sql",
}


def included(path: Path) -> bool:
    relative = path.relative_to(ROOT)
    return (
        path.is_file()
        and not any(part in EXCLUDED_DIRS for part in relative.parts)
        and relative.as_posix() not in EXCLUDED_FILES
    )


lines: list[str] = []
for file_path in sorted((item for item in ROOT.rglob("*") if included(item)), key=lambda item: item.relative_to(ROOT).as_posix()):
    digest = hashlib.sha256(file_path.read_bytes()).hexdigest()
    lines.append(f"{digest}  {file_path.relative_to(ROOT).as_posix()}")

OUTPUT.write_text("\n".join(lines) + "\n", encoding="utf-8")
print(f"Wrote {len(lines)} checksums to {OUTPUT.name}")
