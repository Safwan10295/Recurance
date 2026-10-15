"""One real end-to-end test of the live brief on a local production server.

- The key is passed to the local server process only (server side, never sent to a browser).
- LIVE_COST_CEILING_USD is set to $0.05, so the TS wrapper's own guard caps the test.
- The test's spend is copied from the web store into the pipeline ledger (stage dev), so the
  budget accounting stays complete. The local web store is then deleted.
Nothing is deployed. Usage: python scripts/live_brief_test.py
"""
from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path

import httpx
from dotenv import dotenv_values

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from pipeline.llm import Ledger  # noqa: E402

WEB = ROOT / "web"
STORE = WEB / ".local"
PORT = 3124


def post(payload: dict) -> list[dict]:
    events = []
    with httpx.stream("POST", f"http://localhost:{PORT}/api/brief", json=payload, timeout=180) as r:
        for line in r.iter_lines():
            if line.strip():
                events.append(json.loads(line))
    return events


def main() -> None:
    vals = dotenv_values(ROOT / ".env")
    env = dict(os.environ)
    env.update({
        "NEBIUS_LIVE_API_KEY": vals.get("NEBIUS_API_KEY") or "",
        "SCRAPER_CONTACT_EMAIL": vals.get("SCRAPER_CONTACT_EMAIL") or "",
        "LIVE_COST_CEILING_USD": "0.05",
        "LIVE_GLOBAL_DAILY_CAP": "5",
        "LIVE_PER_IP_DAILY_CAP": "5",
    })
    shutil.rmtree(STORE, ignore_errors=True)
    npx = "npx.cmd" if os.name == "nt" else "npx"
    proc = subprocess.Popen([npx, "next", "start", "-p", str(PORT)], cwd=WEB, env=env,
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    results = {}
    try:
        for _ in range(60):
            try:
                httpx.get(f"http://localhost:{PORT}/", timeout=2)
                break
            except httpx.HTTPError:
                time.sleep(1)
        cases = json.loads(sys.argv[1]) if len(sys.argv) > 1 else []
        for name, payload in cases:
            t0 = time.time()
            ev = post(payload)
            results[name] = {
                "seconds": round(time.time() - t0, 1),
                "steps": [e["step"]["label"] + (" — " + e["step"].get("detail", "") if e["step"].get("detail") else "")
                          for e in ev if e["type"] == "step" and e["step"]["status"] == "done"],
                "final": next((e["type"] for e in ev if e["type"] in ("result", "paused")), None),
                "matches": len(next((e["result"]["matches"] for e in ev if e["type"] == "result"), [])),
                "notes": next((e["result"]["notes"] for e in ev if e["type"] == "result"), None),
                "paused_reason": next((e.get("reason") for e in ev if e["type"] == "paused"), None),
            }
            print(name, json.dumps(results[name], ensure_ascii=False)[:800], flush=True)
        # Repeat the first case: must be served from the response cache at no cost.
        if cases:
            ev = post(cases[0][1])
            results["repeat_cached"] = any(e["type"] == "step" and e["step"]["id"] == "cache" for e in ev)
            print("repeat served from cache:", results["repeat_cached"])
    finally:
        proc.terminate()
        subprocess.run(["taskkill", "/F", "/T", "/PID", str(proc.pid)], capture_output=True) if os.name == "nt" else None
    store = json.loads((STORE / "store.json").read_text()) if (STORE / "store.json").exists() else {}
    spent = float(store.get("spend:total", 0))
    rows = [r for k, v in store.items() if k.startswith("ledger:") for r in v]
    lg = Ledger()
    for r in rows:
        if not r.get("cache_hit") and r.get("success"):
            lg.record(stage="dev", model=r["model"], input_tokens=int(r.get("in") or 0), output_tokens=int(r.get("out") or 0),
                      cost=float(r.get("cost") or 0), cache_hit=0, request_hash=r.get("hash", "web"), success=1,
                      item_id=f"live-brief-test:{r.get('stage')}", key_label="pipeline")
    results["spend_usd"] = spent
    results["web_ledger_rows"] = len(rows)
    (ROOT / "data" / "exports" / "live_brief_test.json").write_text(json.dumps(results, indent=1, ensure_ascii=False))
    shutil.rmtree(STORE, ignore_errors=True)
    print(f"live brief test spend ${spent:.4f}, copied {len(rows)} ledger rows into the pipeline ledger")


if __name__ == "__main__":
    main()
