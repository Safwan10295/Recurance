"""Incremental ingestion while the scraper runs: OCR prepass, build, normalise, Stage A on new reports.

Stage A here is the authorised full run, at the cost per item measured in the pilot. The budget
guard in pipeline/llm.py still refuses any call that would cross the Stage A cap.
Usage: python scripts/incremental.py <cost_per_item> [--no-stage-a]
"""
from __future__ import annotations

import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from pipeline import config, db, env  # noqa: E402

env.load()


def main() -> None:
    cost = float(sys.argv[1])
    do_a = "--no-stage-a" not in sys.argv
    from pipeline.parse.build import build
    from pipeline.parse.pdftext import prepass
    from pipeline.parse.report_page import parse_report_page
    from pipeline.normalise.orgs import normalise
    from pipeline.scrape.http import cached_path

    t0 = time.time()
    urls = [u for u in json.loads((config.CACHE / "urls_sitemap.json").read_text()) if cached_path(u)]
    pdfs = []
    for u in urls:
        rp = parse_report_page(u, cached_path(u).read_text(encoding="utf-8", errors="replace"))
        pdfs += [x.url for x in rp.pdfs if x.kind == "report"]
    print("pdftext", prepass(pdfs, workers=12), flush=True)
    print("build", build(urls, verbose=False), flush=True)
    print("normalise", normalise(), flush=True)
    if do_a:
        from pipeline.extract import concerns as A
        from pipeline.llm import LLM

        llm = LLM()
        conn = db.connect()
        rows = A.eligible(conn)
        conn.close()
        print(f"stage A: {len(rows)} new reports; projected ${len(rows) * cost:.4f}", flush=True)
        if rows:
            res = A.full_run(llm, cost, confirm_spend=True)
            res.pop("errors", None)
            print("stage A", json.dumps(res, default=str), flush=True)
    print(f"done in {time.time() - t0:.0f}s", flush=True)


if __name__ == "__main__":
    main()
