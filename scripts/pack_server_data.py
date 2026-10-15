"""Pack the data the server needs into one archive: python scripts/pack_server_data.py

Includes the SQLite working database and ledger (with the paid-call cache), raw report pages,
the PDF text and OCR cache, and exports. Leaves out raw PDFs (their text is cached), test
snapshots and every env file. SQLite files are copied with the backup API so the archive is consistent.
"""
from __future__ import annotations

import sqlite3
import sys
import tarfile
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
OUT = ROOT / "server-data.tar.gz"
SKIP = {"snapshot.sqlite", "test_build.sqlite"}


def main() -> None:
    with tempfile.TemporaryDirectory() as td, tarfile.open(OUT, "w:gz") as tar:
        for name in ("recurrence.sqlite", "ledger.sqlite"):
            src = DATA / name
            dst = Path(td) / name
            s, d = sqlite3.connect(src), sqlite3.connect(dst)
            s.backup(d)
            d.close()
            s.close()
            tar.add(dst, arcname=f"data/{name}")
            print("added", name, flush=True)
        for sub in ("raw/html", "cache", "exports"):
            for p in sorted((DATA / sub).rglob("*")):
                if p.is_file() and p.name not in SKIP and not p.name.startswith(".env") and "-wal" not in p.name and "-shm" not in p.name:
                    tar.add(p, arcname=str(p.relative_to(ROOT)).replace("\\", "/"))
            print("added", sub, flush=True)
    print(f"wrote {OUT} ({OUT.stat().st_size / 1e6:.0f} MB)")


if __name__ == "__main__":
    sys.exit(main())
