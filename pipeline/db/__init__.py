"""SQLite access for the corpus database."""
from __future__ import annotations

import sqlite3
from pathlib import Path

from .. import config

SCHEMA = Path(__file__).with_name("schema.sql")


def connect(path: Path | str | None = None) -> sqlite3.Connection:
    p = Path(path or config.DB_PATH)
    p.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(p))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.executescript(SCHEMA.read_text(encoding="utf-8"))
    return conn
