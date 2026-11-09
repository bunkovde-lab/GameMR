#!/usr/bin/env python3
"""Import the approved GameMR M00-B art package into this repository.

Usage: python scripts/import_m00b_assets.py /path/to/GameMR_M00B_Claude_Handoff_v1.zip

Stdlib only. Requires local ZIP; does NOT fetch from a sandbox URL and does not change existing art.
"""
from __future__ import annotations
import hashlib
import json
import sys
import zipfile
from pathlib import Path

PREFIX = "GameMR_M00B_Claude_Handoff_v1/"
TARGET = Path("assets/menu/m00b")
MAX_FILE_SIZE = 30 * 1024 * 1024


def main() -> int:
    if len(sys.argv) != 2:
        print(__doc__)
        return 2
    path = Path(sys.argv[1]).expanduser()
    if not path.is_file():
        raise FileNotFoundError(f"Art pack not found: {path}")
    with zipfile.ZipFile(path) as z:
        manifest = json.loads(z.read(PREFIX + "docs/manifest.json"))
        expected = {x["path"]: x["sha256"] for x in manifest["items"]}
        names = [n for n in z.namelist() if n.startswith(PREFIX + "assets/") and not n.endswith("/")]
        if not names:
            raise ValueError("No files found under expected assets/ directory")
        plan = []
        for name in names:
            rel = name.removeprefix(PREFIX + "assets/")
            out = TARGET / rel
            if out.is_absolute() or ".." in Path(rel).parts:
                raise ValueError(f"Unsafe path: {name}")
            info = z.getinfo(name)
            if info.file_size > MAX_FILE_SIZE:
                raise ValueError(f"Unexpected oversized file: {name}")
            raw = z.read(name)
            if "assets/" + rel in expected:
                sha = hashlib.sha256(raw).hexdigest()
                if sha != expected["assets/" + rel]:
                    raise ValueError(f"SHA-256 mismatch: {name}")
            plan.append((out, raw))
        for out, raw in plan:
            out.parent.mkdir(parents=True, exist_ok=True)
            if out.exists() and out.read_bytes() != raw:
                raise FileExistsError(f"Different file already exists: {out}; refusing overwrite")
        for out, raw in plan:
            out.write_bytes(raw)
            print(f"OK {out} ({len(raw)} bytes)")
        print(f"Imported {len(plan)} art files. Add only verified paths to assets/manifest.json.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
