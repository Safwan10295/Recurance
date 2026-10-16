"""Record real agent runs for chosen archive reports, so they replay instantly and at no cost on the site.

Runs a local production server with the pipeline key (never printed), a $0.40 ceiling and its own caps,
asks the live brief for each report, and keeps the final trace and result. Writes
data/exports/precomputed_briefs.json, which `python -m pipeline.cli publish` puts into pub_meta.
The web store's spend is copied into the pipeline ledger (stage dev), then the store is cleared.

Usage: python scripts/precompute_briefs.py slugs.json      (a JSON list of report slugs, or {name: [slugs]})
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import httpx
from dotenv import dotenv_values

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "scripts"))
from live_brief_test import PORT, WEB, clear_store, read_store  # noqa: E402
from pipeline.llm import Ledger  # noqa: E402

OUT = ROOT / "data" / "exports" / "precomputed_briefs.json"


def run_one(slug: str) -> dict | None:
    steps: dict[str, dict] = {}
    order: list[str] = []
    result = None
    with httpx.stream("POST", f"http://localhost:{PORT}/api/brief", json={"reportSlug": slug}, timeout=240) as r:
        for line in r.iter_lines():
            if not line.strip():
                continue
            ev = json.loads(line)
            if ev["type"] == "step":
                st = ev["step"]
                if st["id"] not in steps:
                    order.append(st["id"])
                steps[st["id"]] = st
            elif ev["type"] == "result":
                result = ev["result"]
            elif ev["type"] == "paused":
                print(f"  {slug}: paused ({ev.get('reason')})", flush=True)
                return None
    if not result:
        return None
    trace = [steps[i] for i in order if steps[i].get("status") == "done"]
    return {"slug": slug, "title": (result.get("report") or {}).get("title", slug), "result": result, "steps": trace,
            "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds")}


def main() -> None:
    spec = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    slugs = sorted({s for v in (spec.values() if isinstance(spec, dict) else [spec]) for s in v})
    have = json.loads(OUT.read_text(encoding="utf-8")) if OUT.exists() else {}
    todo = [s for s in slugs if s not in have]
    print(f"{len(slugs)} reports, {len(todo)} to record", flush=True)
    vals = dotenv_values(ROOT / ".env")
    env = dict(os.environ)
    env.update({
        "NEBIUS_LIVE_API_KEY": vals.get("NEBIUS_API_KEY") or "",
        "TAVILY_API_KEY": vals.get("TAVILY_API_KEY") or "",
        "SCRAPER_CONTACT_EMAIL": vals.get("SCRAPER_CONTACT_EMAIL") or "",
        "DATABASE_URL": vals.get("DATABASE_URL") or "",
        "LIVE_COST_CEILING_USD": "0.40",
        "LIVE_GLOBAL_DAILY_CAP": "80",
        "LIVE_PER_IP_DAILY_CAP": "80",
        "LIVE_TAVILY_DAILY_CREDITS": "12",
    })
    clear_store()
    proc = subprocess.Popen(["npx.cmd" if os.name == "nt" else "npx", "next", "start", "-p", str(PORT)], cwd=WEB, env=env,
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        for _ in range(90):
            try:
                httpx.get(f"http://localhost:{PORT}/api/health", timeout=2)
                break
            except httpx.HTTPError:
                time.sleep(1)
        for s in todo:
            t0 = time.time()
            rec = run_one(s)
            if rec:
                have[s] = rec
                OUT.write_text(json.dumps(have, ensure_ascii=False), encoding="utf-8")
                print(f"  {s}: {len(rec['result']['matches'])} matches, {len(rec['steps'])} steps, "
                      f"${rec['result'].get('cost', 0):.4f}, {time.time() - t0:.0f}s", flush=True)
    finally:
        subprocess.run(["taskkill", "/F", "/T", "/PID", str(proc.pid)], capture_output=True) if os.name == "nt" else proc.terminate()
    store = read_store()
    spent = float(store.get("spend:total", 0))
    rows = [r for k, v in store.items() if k.startswith("ledger:") for r in v]
    lg = Ledger()
    for r in rows:
        if r.get("model", "").startswith("tavily"):
            continue
        if not r.get("cache_hit") and r.get("success"):
            lg.record(stage="dev", model=r["model"], input_tokens=int(r.get("in") or 0), output_tokens=int(r.get("out") or 0),
                      cost=float(r.get("cost") or 0), cache_hit=0, request_hash=r.get("hash", "web"), success=1,
                      item_id=f"precompute:{r.get('stage')}", key_label="pipeline")
    clear_store()
    print(f"recorded {len(have)} briefs; spend ${spent:.4f}; {len(rows)} ledger rows copied")


if __name__ == "__main__":
    main()
