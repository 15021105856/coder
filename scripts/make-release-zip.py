#!/usr/bin/env python3
"""Create a Windows-friendly UTF-8 ZIP (EFS flag) with Chinese source filenames."""
from __future__ import annotations

import os
import sys
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "pku346-recall-v222-source-and-html.zip")

INCLUDE_TOP = [
    "README.md",
    "package.json",
    "package-lock.json",
    "tsconfig.json",
    "vite.config.ts",
    "index.html",
    "dist/index.html",
    "MRC_V2.1.1.html",
    "MRC_V2.2_沉浸诵读版.html",
    "MRC_V2.2.1_沉浸诵读版.html",
    "MRC_V2.2.2_沉浸诵读冻结版.html",
]

INCLUDE_DIRS = ["src", "sources", "scripts", "tests", "reports"]

SKIP_DIR_NAMES = {"node_modules", ".git", "dist"}


def add_path(zf: zipfile.ZipFile, abs_path: str, arcname: str) -> None:
    if not os.path.exists(abs_path):
        return
    zf.write(abs_path, arcname)


def main() -> None:
    required = [
        os.path.join(ROOT, "sources", "管理学A册_完整转换.md"),
        os.path.join(ROOT, "sources", "管理学B册_完整转换.md"),
    ]
    for path in required:
        if not os.path.isfile(path):
            raise SystemExit(f"missing required source: {path}")

    with zipfile.ZipFile(OUT, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as zf:
        for rel in INCLUDE_TOP:
            add_path(zf, os.path.join(ROOT, rel), rel.replace("\\", "/"))

        for dir_name in INCLUDE_DIRS:
            base = os.path.join(ROOT, dir_name)
            if not os.path.isdir(base):
                continue
            for dirpath, dirnames, filenames in os.walk(base):
                dirnames[:] = [d for d in dirnames if d not in SKIP_DIR_NAMES]
                for filename in filenames:
                    abs_path = os.path.join(dirpath, filename)
                    rel_path = os.path.relpath(abs_path, ROOT).replace("\\", "/")
                    add_path(zf, abs_path, rel_path)

    with zipfile.ZipFile(OUT, "r") as zf:
        names = zf.namelist()
        for need in (
            "sources/管理学A册_完整转换.md",
            "sources/管理学B册_完整转换.md",
        ):
            if need not in names:
                raise SystemExit(f"zip missing entry: {need}")
        for name in names:
            if name.startswith("sources/#U"):
                raise SystemExit(f"zip contains escaped source name: {name}")

    print(OUT)


if __name__ == "__main__":
    main()
