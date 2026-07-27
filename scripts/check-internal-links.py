#!/usr/bin/env python3
"""Verify that every local href/src reference in the shipped HTML resolves to a real file.

Static-export sites have no build step to catch a typo'd path, so this is the only
safety net before a broken link reaches production.
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
HTML_FILES = sorted(ROOT.rglob("*.html"))
ATTR_RE = re.compile(r'(?:href|src)\\?="([^"]+)"')

SKIP_PREFIXES = ("http://", "https://", "mailto:", "tel:", "//", "#", "data:", "javascript:")


def resolve(path_part: str, base_dir: Path) -> Path | None:
    clean = path_part.split("#", 1)[0].split("?", 1)[0]
    if clean in ("", "/"):
        return ROOT / "index.html"
    base = ROOT if clean.startswith("/") else base_dir
    target = (base / clean.lstrip("/")).resolve()
    if target.is_dir():
        target = target / "index.html"
    elif target.suffix == "":
        candidate = Path(str(target) + "/index.html")
        if candidate.exists():
            target = candidate
    return target


def main() -> int:
    missing: list[tuple[Path, str]] = []
    for html_file in HTML_FILES:
        text = html_file.read_text(encoding="utf-8", errors="ignore")
        for match in ATTR_RE.finditer(text):
            ref = match.group(1)
            if ref.startswith(SKIP_PREFIXES):
                continue
            target = resolve(ref, html_file.parent)
            if target is not None and not target.exists():
                missing.append((html_file.relative_to(ROOT), ref))

    if missing:
        print(f"Found {len(missing)} broken local reference(s):")
        for source, ref in missing:
            print(f"  {source} -> {ref}")
        return 1

    print(f"Checked {len(HTML_FILES)} HTML file(s): all local href/src references resolve.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
