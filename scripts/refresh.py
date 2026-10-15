"""Incremental refresh: pick up newly published PFD reports and update everything.

Steps (each paid step prints its estimate and is refused if it would cross the stage cap or the
per-refresh ceiling; the wrapper's own budget guard still applies to every call):
  1. discover new report URLs (sitemaps + the newest listing pages), fetch pages and report PDFs (1 req/s);
  2. parse, OCR, normalise, Stage A concerns for new reports, embeddings;
  3. rebuild candidate pairs; fetch and read responses for new in-scope earlier reports; Stage B;
  4. Stage C on pairs not yet judged; rebuild chains; export the site data.
Usage: python scripts/refresh.py [--max-spend 0.50] [--build]
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from pipeline import config, db, env  # noqa: E402

env.load()

from pipeline.llm import LLM, Ledger, confirm_full_run, spend_report  # noqa: E402

COST = {"A": 0.00013, "B": 0.00014, "C": 0.00075}  # measured per item in the full runs
EVAL_RESERVE_C = 0.35
LISTING_PAGES = 5  # the newest 50 reports; new reports always appear on page 1 first


def log(msg: str) -> None:
    print(f"{datetime.now().strftime('%H:%M:%S')} {msg}", flush=True)


def main() -> None:
    from pipeline.scrape.discover import from_listing, from_sitemaps
    from pipeline.scrape.http import Fetcher, cached_path
    from pipeline.scrape.run import fetch_interleaved, fetch_pdfs

    max_spend = float(sys.argv[sys.argv.index("--max-spend") + 1]) if "--max-spend" in sys.argv else 0.50
    if not config.contact_email():
        sys.exit("BLOCKED: SCRAPER_CONTACT_EMAIL is not set; not scraping")
    t0 = time.time()
    lg = Ledger()
    spent_before = lg.spent()
    llm = LLM(lg)
    summary: dict = {"started": datetime.now(timezone.utc).isoformat(timespec="seconds")}

    def room(stage: str) -> float:
        left_in_refresh = max_spend - (lg.spent() - spent_before)
        reserve = EVAL_RESERVE_C if stage == "C" else 0.0
        return min(llm.remaining(stage) - reserve, left_in_refresh)

    # 1. Discover and fetch
    f = Fetcher()
    urls_file = config.CACHE / "urls_sitemap.json"
    known = json.loads(urls_file.read_text())
    found = list(dict.fromkeys(from_sitemaps(f) + from_listing(f, max_pages=LISTING_PAGES)))
    new_urls = [u for u in found if u not in set(known)]
    log(f"discovered {len(found)} URLs, {len(new_urls)} new")
    summary["new_reports"] = len(new_urls)
    if new_urls:
        urls_file.write_text(json.dumps(known + new_urls, indent=0))
        log(f"fetch: {fetch_interleaved(f, new_urls, workers=1)}")

    # 2. Parse, normalise, Stage A, embeddings
    from pipeline.extract import concerns as A
    from pipeline.link.embed import embed_concerns
    from pipeline.normalise.orgs import normalise
    from pipeline.parse.build import build
    from pipeline.parse.pdftext import prepass
    from pipeline.parse.report_page import parse_report_page

    if new_urls:
        pdfs = []
        for u in new_urls:
            p = cached_path(u)
            if p:
                pdfs += [x.url for x in parse_report_page(u, p.read_text(encoding="utf-8", errors="replace")).pdfs
                         if x.kind == "report"]
        log(f"pdf text: {prepass(pdfs, workers=8)}")
    log(f"build: {build(verbose=False)}")
    log(f"normalise: {normalise()}")
    conn = db.connect()
    rows = A.eligible(conn)
    conn.close()
    if rows:
        n = min(len(rows), int(room("A") / COST["A"]))
        if n < len(rows):
            log(f"Stage A: budget covers {n} of {len(rows)} reports this refresh")
        if n:
            confirm_full_run(llm, "A", n, COST["A"], confirm_spend=True)
            res = A.run(llm, rows[:n], threads=8)
            log(f"Stage A: ok {res['ok']}, failed {res['failed']}, verified {res['verify_rate']:.0%}, ${res['cost']:.4f}")
    A.reverify()
    log(f"embedded {embed_concerns(llm)}")

    # 3. Candidates, responses, Stage B
    from pipeline.extract import promises as B
    from pipeline.link.candidates import build as build_candidates

    r = build_candidates()
    r.pop("_pairs", None)
    log(f"candidates: {r}")
    conn = db.connect()
    orgs = B.scope_report_orgs(conn)
    need = B.register_responses(conn, list(orgs), orgs)
    log(f"responses to fetch: {len(need)}")
    if need:
        fetch_pdfs(f, need, workers=1)
    log(f"response texts: {B.extract_response_texts(conn, workers=8)}")
    pending_b = B.pending_responses(conn, list(orgs))
    conn.close()
    if pending_b:
        n = min(len(pending_b), int(room("B") / COST["B"]))
        if n:
            confirm_full_run(llm, "B", n, COST["B"], confirm_spend=True)
            res = B.run(llm, pending_b[:n], threads=8)
            log(f"Stage B: ok {res['ok']}, promises {res['promises']}, ${res['cost']:.4f}")
    conn = db.connect()
    log(f"non-promises dropped: {B.drop_non_promises(conn)}")
    conn.close()

    # 4. Stage C, chains, export
    from pipeline.export import web
    from pipeline.judge import chains, recurrence as C

    conn = db.connect()
    ids = C.pending_pairs(conn)
    conn.close()
    summary["new_pairs"] = len(ids)
    if ids:
        n = min(len(ids), int(room("C") / COST["C"]))
        if n < len(ids):
            log(f"Stage C: budget covers {n} of {len(ids)} pairs this refresh; the rest wait for the next one")
        if n:
            confirm_full_run(llm, "C", n, COST["C"], confirm_spend=True)
            res = C.run(llm, ids[:n], threads=8)
            log(f"Stage C: ok {res['ok']}, {res['relations']}, ${res['cost']:.4f}")
    summary["chains"] = chains.build()
    from pipeline.judge.titles import generate as generate_titles

    summary["titles"] = generate_titles(llm)
    summary["export"] = web.export()
    if os.environ.get("DATABASE_URL"):
        from pipeline.publish.postgres import publish

        summary["publish"] = publish()
    log(f"chains: {summary['chains']}; export: {summary['export']}")
    summary["spent_this_refresh"] = round(lg.spent() - spent_before, 4)
    summary["finished"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
    (config.EXPORTS / "last_refresh.json").write_text(json.dumps(summary, indent=1))
    log(f"refresh spent ${summary['spent_this_refresh']:.4f} in {time.time() - t0:.0f}s")
    log(spend_report(lg).replace("\n", " | "))
    if "--build" in sys.argv:
        npm = "npm.cmd" if sys.platform == "win32" else "npm"
        subprocess.run([npm, "run", "build"], cwd=config.ROOT / "web", check=False)
        log("site rebuilt")


if __name__ == "__main__":
    main()
