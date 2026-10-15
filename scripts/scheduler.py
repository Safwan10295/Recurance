"""Worker loop for the server: keep the site's data current.

On start: publish once if the site has no data yet (first boot after copying data/).
Then: run the incremental refresh (scripts/refresh.py, which also publishes) every
REFRESH_EVERY_HOURS hours (default 168, weekly), with REFRESH_MAX_SPEND as the per-run ceiling.
Set REFRESH_PAUSED=1 to keep the worker idle.
"""
from __future__ import annotations

import os
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
STAMP = ROOT / "data" / "cache" / "last_scheduled_refresh"


def log(msg: str) -> None:
    print(f"{datetime.now(timezone.utc).isoformat(timespec='seconds')} {msg}", flush=True)


def site_has_data() -> bool:
    try:
        import psycopg

        with psycopg.connect(os.environ["DATABASE_URL"], connect_timeout=5) as c:
            return c.execute("SELECT COUNT(*) FROM pub_chains").fetchone()[0] > 0
    except Exception:
        return False


def wait_for_db(timeout: int = 120) -> None:
    import psycopg

    t0 = time.time()
    while time.time() - t0 < timeout:
        try:
            psycopg.connect(os.environ["DATABASE_URL"], connect_timeout=5).close()
            return
        except Exception:
            time.sleep(3)
    log("database not reachable yet; continuing anyway")


def main() -> None:
    every = float(os.environ.get("REFRESH_EVERY_HOURS", "168")) * 3600
    max_spend = os.environ.get("REFRESH_MAX_SPEND", "0.50")
    wait_for_db()
    if not site_has_data() and (ROOT / "data" / "recurrence.sqlite").exists():
        log("site has no data yet: publishing from data/recurrence.sqlite")
        subprocess.run([sys.executable, "-m", "pipeline.cli", "publish"], cwd=ROOT)
    while True:
        if os.environ.get("REFRESH_PAUSED") == "1":
            time.sleep(600)
            continue
        last = float(STAMP.read_text()) if STAMP.exists() else 0.0
        due = last + every
        if time.time() >= due:
            log("refresh starting")
            r = subprocess.run([sys.executable, "scripts/refresh.py", "--max-spend", max_spend], cwd=ROOT)
            log(f"refresh finished with exit code {r.returncode}")
            STAMP.parent.mkdir(parents=True, exist_ok=True)
            STAMP.write_text(str(time.time()))
        else:
            time.sleep(min(3600, max(60, due - time.time())))


if __name__ == "__main__":
    main()
