"""Recurrence Watch pipeline: one entry point.

Usage: python -m pipeline.cli <command> [options]

Commands that spend money print an estimate first. Full runs need --confirm-spend.
"""
from __future__ import annotations

import argparse
import json
import sys

from . import config, db, env


def _llm():
    from .llm import LLM

    return LLM()


def cmd_spend(a):
    from .llm import spend_report

    print(spend_report())


def cmd_scrape(a):
    from .scrape import run

    run.main([a.what] + ([a.list] if a.list else []))


def cmd_build(a):
    from .parse.build import build

    print(json.dumps(build(allow_ocr=not a.no_ocr), indent=1))


def cmd_pdftext(a):
    import glob

    from .parse.pdftext import prepass

    lst = json.loads((config.CACHE / "urls_sitemap.json").read_text())
    from .scrape.http import cached_path
    from .parse.report_page import parse_report_page

    urls = []
    for u in lst:
        p = cached_path(u)
        if p:
            rp = parse_report_page(u, p.read_text(encoding="utf-8", errors="replace"))
            urls += [x.url for x in rp.pdfs if x.kind == "report"]
    print(json.dumps(prepass(urls, workers=a.workers), indent=1))


def cmd_normalise(a):
    from .normalise.orgs import normalise

    print(json.dumps(normalise(), indent=1))


def _print_stage(res: dict):
    res = {k: v for k, v in res.items() if k not in ("results",)}
    errs = res.pop("errors", [])
    print(json.dumps(res, indent=1, default=str))
    if errs:
        print(f"{len(errs)} errors, first 10:")
        for e in errs[:10]:
            print("  ", e)


def cmd_stage_a(a):
    from .extract import concerns as A

    llm = _llm()
    conn = db.connect()
    if a.pilot:
        rows = A.pilot_rows(conn, n=a.n, must_include=tuple(a.include or ()))
        conn.close()
        res = A.run(llm, rows, threads=4, stage="dev")
        n_full = len(A.eligible(db.connect(), only_missing=False))
        res["extrapolated_full_cost"] = res["cost_per_item"] * n_full
        res["full_items"] = n_full
        _print_stage(res)
    else:
        conn.close()
        _print_stage(A.full_run(llm, a.cost_per_item, a.confirm_spend, threads=a.threads))


def cmd_embed(a):
    from .link.embed import embed_concerns

    print("embedded", embed_concerns(_llm()))


def cmd_link(a):
    from .link.candidates import build

    res = build()
    res.pop("_pairs", None)
    print(json.dumps(res, indent=1))


def cmd_responses(a):
    from .extract import promises as B
    from .scrape.http import Fetcher

    conn = db.connect()
    urls = B.scope_report_urls(conn) if not a.all else [r[0] for r in conn.execute(
        "SELECT url FROM reports WHERE duplicate_of IS NULL")]
    need = B.register_responses(conn, urls, None if a.all else B.scope_report_orgs(conn))
    print(f"responses in scope for {len(urls)} reports; {len(need)} PDFs to fetch")
    if need and a.fetch:
        env.load()
        f = Fetcher()
        from .scrape.run import fetch_pdfs

        fetch_pdfs(f, need)
    print(json.dumps(B.extract_response_texts(conn, allow_ocr=not a.no_ocr), indent=1))
    conn.close()


def cmd_stage_b(a):
    from .extract import promises as B

    llm = _llm()
    conn = db.connect()
    rows = B.pending_responses(conn, B.scope_report_urls(conn))
    conn.close()
    if a.pilot:
        res = B.run(llm, rows[: a.n], threads=4, stage="dev")
        res["extrapolated_full_cost"] = res["cost_per_item"] * len(rows)
        res["full_items"] = len(rows)
        _print_stage(res)
    else:
        _print_stage(B.full_run(llm, rows, a.cost_per_item, a.confirm_spend))


def cmd_stage_c(a):
    from .judge import recurrence as C

    llm = _llm()
    conn = db.connect()
    ids = C.pending_pairs(conn)
    conn.close()
    if a.pilot:
        res = C.run(llm, ids[: a.n], threads=4, stage="dev")
        res["extrapolated_full_cost"] = res["cost_per_item"] * len(ids)
        res["full_items"] = len(ids)
        _print_stage(res)
    else:
        if a.limit:
            ids = ids[: a.limit]
        _print_stage(C.full_run(llm, ids, a.cost_per_item, a.confirm_spend))


def cmd_chains(a):
    from .judge.chains import build

    print(json.dumps(build(min_conf=a.min_conf), indent=1))


def cmd_dossiers(a):
    from .dossier import ultra as D

    conn = db.connect()
    keys = D.select_flagship(conn, n=a.n)
    conn.close()
    _print_stage(D.run(_llm(), keys))


def cmd_followup(a):
    from .followup.tavily import Tavily, follow_up

    conn = db.connect()
    rows = conn.execute(
        """SELECT DISTINCT v.promise_id FROM recurrence_verdicts v JOIN chain_members m ON m.pair_id = v.pair_id
           WHERE v.promise_id IS NOT NULL"""
    ).fetchall()
    conn.close()
    ids = [r[0] for r in rows][: a.n]
    print(json.dumps(follow_up(_llm(), Tavily(), ids), indent=1, default=str))


def cmd_evaluate(a):
    from .evaluate import metrics

    print(json.dumps(metrics.evaluate(_llm(), judge=not a.no_judge), indent=1, default=str))


def cmd_label_prepare(a):
    from .evaluate import labelling

    print(labelling.prepare(n=a.n))


def cmd_label(a):
    from .evaluate import labelling

    labelling.interactive()


def cmd_dossiers_export(a):
    from .dossier import review

    print(review.export_markdown())


def cmd_review(a):
    from .dossier import review

    review.interactive()


def cmd_export(a):
    from .export import web

    print(json.dumps(web.export(), indent=1))


def main(argv=None):
    env.load()
    p = argparse.ArgumentParser(prog="pipeline")
    sub = p.add_subparsers(dest="cmd", required=True)

    sub.add_parser("spend", help="spend report from the ledger").set_defaults(fn=cmd_spend)
    s = sub.add_parser("scrape", help="polite scrape of judiciary.uk")
    s.add_argument("what", choices=["all", "interleaved", "reports", "reportpdfs", "listing", "pdfs"])
    s.add_argument("list", nargs="?", help="for pdfs: JSON list file in data/cache")
    s.set_defaults(fn=cmd_scrape)
    s = sub.add_parser("build", help="parse cached pages into the database")
    s.add_argument("--no-ocr", action="store_true")
    s.set_defaults(fn=cmd_build)
    sub.add_parser("normalise", help="organisation normalisation").set_defaults(fn=cmd_normalise)
    s = sub.add_parser("pdftext", help="parallel PDF text and OCR cache for report PDFs")
    s.add_argument("--workers", type=int, default=12)
    s.set_defaults(fn=cmd_pdftext)

    for name, fn in (("stage-a", cmd_stage_a), ("stage-b", cmd_stage_b), ("stage-c", cmd_stage_c)):
        s = sub.add_parser(name)
        s.add_argument("--pilot", action="store_true", help="run a small pilot and extrapolate cost")
        s.add_argument("--n", type=int, default=20)
        s.add_argument("--include", nargs="*", help="report URLs that must be in the pilot (stage A)")
        s.add_argument("--confirm-spend", action="store_true")
        s.add_argument("--cost-per-item", type=float, default=0.0, help="measured pilot cost per item")
        s.add_argument("--threads", type=int, default=8)
        s.add_argument("--limit", type=int, default=0)
        s.set_defaults(fn=fn)

    sub.add_parser("embed", help="embed concerns").set_defaults(fn=cmd_embed)
    sub.add_parser("link", help="build candidate pairs").set_defaults(fn=cmd_link)
    s = sub.add_parser("responses", help="register, fetch and extract response PDFs in Stage B scope")
    s.add_argument("--fetch", action="store_true")
    s.add_argument("--all", action="store_true")
    s.add_argument("--no-ocr", action="store_true")
    s.set_defaults(fn=cmd_responses)
    s = sub.add_parser("chains")
    s.add_argument("--min-conf", type=float, default=0.7)
    s.set_defaults(fn=cmd_chains)
    s = sub.add_parser("dossiers")
    s.add_argument("--n", type=int, default=25)
    s.set_defaults(fn=cmd_dossiers)
    s = sub.add_parser("followup")
    s.add_argument("--n", type=int, default=60)
    s.set_defaults(fn=cmd_followup)
    s = sub.add_parser("evaluate")
    s.add_argument("--no-judge", action="store_true")
    s.set_defaults(fn=cmd_evaluate)
    s = sub.add_parser("label-prepare", help="write the hand-labelling candidate file")
    s.add_argument("--n", type=int, default=80)
    s.set_defaults(fn=cmd_label_prepare)
    sub.add_parser("label", help="interactive labelling for Pilot").set_defaults(fn=cmd_label)
    sub.add_parser("export", help="export JSON for the web app").set_defaults(fn=cmd_export)
    sub.add_parser("dossiers-export", help="write all dossiers to a Markdown file for reading").set_defaults(
        fn=cmd_dossiers_export)
    sub.add_parser("review", help="Pilot only: approve or reject dossiers for publication").set_defaults(fn=cmd_review)

    a = p.parse_args(argv)
    a.fn(a)


if __name__ == "__main__":
    main(sys.argv[1:])
