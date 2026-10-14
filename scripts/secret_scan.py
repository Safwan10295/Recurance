"""Pre-commit secret scan.

1. Fails if any tracked or staged file contains a value from .env (compared in
   memory; values are never printed).
2. Fails on common key patterns (Nebius JWT-like strings, tvly-, lsv2_).
3. Fails if .env or env1 is tracked.
Usage: python scripts/secret_scan.py   (exit code 1 on any finding)
"""
from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PATTERNS = [
    re.compile(r"tvly-[A-Za-z0-9_-]{20,}"),
    re.compile(r"lsv2_[A-Za-z0-9_]{20,}"),
    re.compile(r"eyJ[A-Za-z0-9_-]{30,}\.[A-Za-z0-9_-]{30,}"),
    re.compile(r"sk-[A-Za-z0-9]{32,}"),
]


def env_values() -> list[str]:
    vals = []
    for name in (".env",):
        p = ROOT / name
        if not p.exists():
            continue
        for line in p.read_text(encoding="utf-8-sig").splitlines():
            if "=" in line and not line.strip().startswith("#"):
                v = line.split("=", 1)[1].strip().strip('"').strip("'")
                if len(v) >= 12 and "@" not in v:
                    vals.append(v)
    return vals


def candidate_files() -> list[str]:
    out = subprocess.run(["git", "ls-files", "--cached", "--others", "--exclude-standard"],
                         cwd=ROOT, capture_output=True, text=True, check=True).stdout
    return [f for f in out.splitlines() if f]


def main() -> int:
    files = candidate_files()
    problems = []
    for bad in (".env", "env1"):
        if bad in files:
            problems.append(f"{bad} would be committed")
    secrets = env_values()
    for f in files:
        p = ROOT / f
        if not p.is_file() or p.stat().st_size > 5_000_000:
            continue
        try:
            text = p.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            continue
        if any(s in text for s in secrets):
            problems.append(f"{f}: contains a value from .env")
        for pat in PATTERNS:
            if pat.search(text):
                problems.append(f"{f}: matches key pattern {pat.pattern[:12]}...")
    if problems:
        print("SECRET SCAN FAILED")
        for pr in problems:
            print(" -", pr)
        return 1
    print(f"secret scan clean ({len(files)} files)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
