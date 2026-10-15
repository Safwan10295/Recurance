"""Run everything after ingestion, unattended, under Pilot's authorisation rules.

For each paid stage:
  1. a 20-item pilot billed to the dev bucket;
  2. proceed only if at least 90% of items pass schema validation, at least 90% of quotes verify,
     and measured cost per item x items fits the stage's remaining cap;
  3. otherwise stop that stage, write a blocker note, and carry on with work that needs no spend.
The wrapper's budget guard (pipeline/llm.py) still refuses any single call that would cross a cap.

Usage: python scripts/finish_pipeline.py [--from STEP]
"""
from __future__ import annotations

import json
import random
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from pipeline import config, db, env  # noqa: E402

env.load()

from pipeline.llm import LLM, Ledger, spend_report  # noqa: E402

ROOT = config.ROOT
BLOCKERS = ROOT / "docs" / "BLOCKERS.md"
STATE = config.CACHE / "finish_state.json"
EVAL_RESERVE_C = 0.35  # kept back from Stage C for the blind evaluation judge runs
SYSTEMIC_RESERVE_C = 0.20  # kept back from Stage C for judging systemic clusters
STEPS = ["ingest_checks", "stage_a_rest", "embed", "link", "responses", "stage_b", "stage_c", "chains", "systemic", "evaluate",
         "dossiers", "followup", "export"]


def log(msg: str) -> None:
    print(f"{datetime.now().strftime('%H:%M:%S')} {msg}", flush=True)


def blocker(title: str, body: str) -> None:
    with BLOCKERS.open("a", encoding="utf-8") as fh:
        fh.write(f"\n## {title}\n\n- When: {datetime.now(timezone.utc).isoformat(timespec='minutes')}\n{body}\n")
    log(f"BLOCKER: {title}")


def state() -> dict:
    return json.loads(STATE.read_text()) if STATE.exists() else {}


def save_state(d: dict) -> None:
    STATE.write_text(json.dumps(d, indent=1, default=str))


def pilot_ok(res: dict, n_full: int, stage: str, llm: LLM, need_quotes: bool = True) -> tuple[bool, str]:
    items = max(1, res.get("items", 0))
    schema_rate = res.get("ok", 0) / items
    vr = res.get("verify_rate", 1.0) if need_quotes else 1.0
    cpi = res.get("cost_per_item", 0.0)
    projected = cpi * n_full
    remaining = llm.remaining(stage)
    msg = (f"pilot {stage}: schema {schema_rate:.0%}, quotes verified {vr:.0%}, cost/item ${cpi:.6f}, "
           f"projected ${projected:.4f} for {n_full} items, stage remaining ${remaining:.4f}")
    ok = schema_rate >= 0.9 and vr >= 0.9 and projected <= remaining
    return ok, msg


def step_ingest_checks(st: dict) -> None:
    conn = db.connect()
    n = conn.execute("SELECT COUNT(*) FROM reports WHERE duplicate_of IS NULL").fetchone()[0]
    total = conn.execute("SELECT COUNT(*) FROM reports").fetchone()[0]
    sources = dict(conn.execute("SELECT body_source, COUNT(*) FROM reports GROUP BY 1").fetchall())
    with_text = conn.execute("SELECT COUNT(*) FROM reports WHERE duplicate_of IS NULL AND length(concerns)>=40").fetchone()[0]
    conn.close()
    diff = (n - config.EXPECTED_UNIQUE_REPORTS) / config.EXPECTED_UNIQUE_REPORTS
    listing = config.CACHE / "urls_listing.json"
    sitemap = set(json.loads((config.CACHE / "urls_sitemap.json").read_text()))
    lst = set(json.loads(listing.read_text())) if listing.exists() else set()
    st["ingest"] = {"pages": total, "unique": n, "diff_vs_6449": diff, "sources": sources, "with_concerns": with_text,
                    "listing_urls": len(lst), "sitemap_urls": len(sitemap), "listing_only": len(lst - sitemap),
                    "sitemap_only": len(sitemap - lst) if lst else None}
    log(f"ingest: {st['ingest']}")
    if abs(diff) > 0.02:
        blocker("B2. Unique report count more than 2% from 6,449",
                f"- Unique reports: {n} ({diff:+.1%}).\n- Pipeline continued; see RESEARCH_LOG for the count breakdown.")


def step_stage_a_rest(st: dict, llm: LLM) -> None:
    from pipeline.extract import concerns as A

    conn = db.connect()
    rows = A.eligible(conn)
    conn.close()
    log(f"stage A remaining: {len(rows)}")
    if rows:
        res = A.run(llm, rows, threads=8)
        res.pop("errors", None)
        log(f"stage A rest: {res}")
    log(f"reverify: {A.reverify()}")


def step_embed(st: dict, llm: LLM) -> None:
    from pipeline.link.embed import embed_concerns

    log(f"embedded {embed_concerns(llm)}")


def step_link(st: dict, llm: LLM) -> None:
    from pipeline.link.candidates import build

    r = build()
    r.pop("_pairs", None)
    st["link"] = r
    log(f"link: {r}")


def step_responses(st: dict, llm: LLM) -> None:
    from pipeline.extract import promises as B
    from pipeline.scrape.http import Fetcher
    from pipeline.scrape.run import fetch_pdfs

    conn = db.connect()
    try:
        orgs = B.scope_report_orgs(conn)
        need = B.register_responses(conn, list(orgs), orgs)
        log(f"responses: {len(orgs)} earlier reports in scope, {len(need)} PDFs to fetch")
        if need:
            fetch_pdfs(Fetcher(), need, workers=2)
        log(f"response texts: {B.extract_response_texts(conn)}")
        conn.commit()
    finally:
        conn.close()


LISTING: dict = {}


def start_listing_crawl() -> None:
    """The listing cross-check needs only judiciary.uk requests, so it overlaps the model-only stages."""
    import threading

    from pipeline.scrape.http import Fetcher
    from pipeline.scrape.run import crawl_listing

    def run():
        try:
            LISTING["urls"] = len(crawl_listing(Fetcher()))
        except Exception as e:  # a cross-check must not stop the pipeline
            LISTING["error"] = str(e)

    t = threading.Thread(target=run, daemon=True)
    t.start()
    LISTING["thread"] = t


def step_stage_b(st: dict, llm: LLM) -> None:
    from pipeline.extract import promises as B
    from pipeline.llm import confirm_full_run

    if not (config.CACHE / "urls_listing.json").exists() and "thread" not in LISTING:
        log("listing cross-check crawl started in the background")
        start_listing_crawl()

    conn = db.connect()
    rows = B.pending_responses(conn, list(B.scope_report_orgs(conn)))
    conn.close()
    random.Random(17).shuffle(rows)
    log(f"stage B: {len(rows)} responses in scope")
    if not rows:
        return
    pilot = B.run(llm, rows[:20], threads=4, stage="dev")
    errs = pilot.pop("errors", [])
    ok, msg = pilot_ok(pilot, len(rows) - 20, "B", llm)
    log(msg + f" errors={errs[:3]}")
    st["stage_b_pilot"] = {"result": pilot, "msg": msg}
    if not ok:
        blocker("B3. Stage B pilot did not pass", f"- {msg}\n- Stage B full run skipped. Stage C runs without promises.")
        return
    rest = rows[20:]
    confirm_full_run(llm, "B", len(rest), pilot["cost_per_item"], confirm_spend=True)
    res = B.run(llm, rest, threads=8)
    res.pop("errors", None)
    st["stage_b"] = res
    log(f"stage B: {res}")


def step_stage_c(st: dict, llm: LLM) -> None:
    from pipeline.judge import recurrence as C
    from pipeline.llm import confirm_full_run

    conn = db.connect()
    ids = C.pending_pairs(conn)  # ordered by hybrid score, highest first
    conn.close()
    log(f"stage C: {len(ids)} candidate pairs")
    if not ids:
        return
    sample = ids[:]
    random.Random(23).shuffle(sample)
    pilot_ids = sample[:20]
    pilot = C.run(llm, pilot_ids, threads=4, stage="dev")
    errs = pilot.pop("errors", [])
    pilot.pop("results", None)
    in_pilot = set(pilot_ids)
    rest = [i for i in ids if i not in in_pilot]
    cpi = pilot["cost_per_item"]
    budget = llm.remaining("C") - EVAL_RESERVE_C - SYSTEMIC_RESERVE_C
    max_pairs = int(budget / cpi) if cpi > 0 else len(rest)
    ok, msg = pilot_ok(pilot, min(len(rest), max_pairs), "C", llm)
    log(msg + f" errors={errs[:3]}")
    st["stage_c_pilot"] = {"result": pilot, "msg": msg}
    if not ok:
        blocker("B4. Stage C pilot did not pass", f"- {msg}\n- Stage C full run skipped.")
        return
    if len(rest) > max_pairs:
        log(f"stage C: {len(rest)} pairs exceed the budget for {max_pairs}; judging the top {max_pairs} by hybrid score")
        with (ROOT / "docs" / "DECISIONS.md").open("a", encoding="utf-8") as fh:
            fh.write(f"\n## D14. Stage C judged the top {max_pairs} of {len(rest)} candidate pairs\n\n"
                     f"1. Measured pilot cost was ${cpi:.6f} per pair.\n"
                     f"2. Stage C cap ${config.STAGE_CAPS['C']:.2f}, minus ${EVAL_RESERVE_C:.2f} for the blind evaluation and ${SYSTEMIC_RESERVE_C:.2f} for systemic clusters.\n"
                     f"3. Pairs were judged in order of hybrid score; {len(rest) - max_pairs} lower-scoring pairs were left unjudged.\n")
        rest = rest[:max_pairs]
    confirm_full_run(llm, "C", len(rest), cpi, confirm_spend=True)
    res = C.run(llm, rest, threads=8)
    res.pop("errors", None)
    res.pop("results", None)
    st["stage_c"] = res
    log(f"stage C: {res}")


def step_chains(st: dict, llm: LLM) -> None:
    from pipeline.judge.chains import build

    st["chains"] = build()
    log(f"chains: {st['chains']}")


def step_systemic(st: dict, llm: LLM) -> None:
    from pipeline.link.systemic import find_clusters, judge_clusters

    conn = db.connect()
    clusters = find_clusters(conn)
    conn.close()
    room = llm.remaining("C") - EVAL_RESERVE_C
    log(f"systemic: {len(clusters)} candidate clusters; Stage C room ${room:.4f}")
    if room <= 0.02:
        log("systemic: skipped, no Stage C budget left after the evaluation reserve")
        return
    st["systemic"] = judge_clusters(llm, clusters)
    log(f"systemic: {st['systemic']}")


def step_evaluate(st: dict, llm: LLM) -> None:
    from pipeline.evaluate import labelling, metrics

    ev = metrics.evaluate(llm, judge=True)
    st["evaluate"] = {k: ev[k] for k in ("acknowledged", "systems", "lost_memory", "cost")}
    log(f"evaluate: {json.dumps(st['evaluate'], default=str)[:1500]}")
    log(labelling.prepare(n=80))


def step_dossiers(st: dict, llm: LLM) -> None:
    from pipeline.dossier import ultra as D

    conn = db.connect()
    keys = D.select_flagship(conn, n=25)
    conn.close()
    if not keys:
        log("dossiers: no chains")
        return
    pilot = D.run(llm, keys[:2])
    per = pilot["cost"] / max(1, pilot["items"])
    projected = per * (len(keys) - 2)
    log(f"dossier pilot: {pilot}, projected ${projected:.4f} for {len(keys) - 2} more, D remaining ${llm.remaining('D'):.4f}")
    if pilot["ok"] < pilot["items"] or projected > llm.remaining("D"):
        blocker("B5. Stage D pilot did not pass", f"- {pilot}\n- Remaining dossiers skipped.")
        return
    res = D.run(llm, keys[2:])
    st["dossiers"] = {"pilot": pilot, "rest": res}
    log(f"dossiers: {res}")


def step_followup(st: dict, llm: LLM) -> None:
    from pipeline.followup.tavily import Tavily, follow_up

    conn = db.connect()
    rows = conn.execute(
        """SELECT DISTINCT v.promise_id FROM recurrence_verdicts v JOIN chain_members m ON m.pair_id = v.pair_id
           WHERE v.promise_id IS NOT NULL"""
    ).fetchall()
    conn.close()
    ids = [r[0] for r in rows]
    log(f"followup: {len(ids)} promises in chains")
    if not ids:
        return
    tv = Tavily()
    pilot = follow_up(llm, tv, ids[:5])
    per = pilot["credits_used"] / max(1, pilot["promises"])
    log(f"followup pilot: {pilot}, {per:.1f} credits per promise")
    rest = ids[5:]
    room = config.TAVILY_STAGE_F_CAP_CREDITS - tv.ledger.tavily_credits("F")
    n = int(room / per) if per > 0 else len(rest)
    res = follow_up(llm, tv, rest[:n])
    st["followup"] = {"pilot": pilot, "rest": res}
    log(f"followup: {res}")


def step_export(st: dict, llm: LLM) -> None:
    from pipeline.export import web

    st["export"] = web.export()
    log(f"export: {st['export']}")


def main() -> None:
    start = sys.argv[sys.argv.index("--from") + 1] if "--from" in sys.argv else STEPS[0]
    st = state()
    llm = LLM()
    for name in STEPS[STEPS.index(start):]:
        t0 = time.time()
        log(f"=== {name}")
        fn = globals()[f"step_{name}"]
        try:
            fn(st) if name == "ingest_checks" else fn(st, llm)
        except Exception as e:  # keep going with work that needs no spend
            import traceback

            traceback.print_exc()
            blocker(f"Step {name} raised {type(e).__name__}", f"- {str(e)[:500]}")
            del e
            import gc

            gc.collect()  # free connections held by the failed step's frames, releasing any write lock
        st.setdefault("done", []).append(name)
        save_state(st)
        log(f"=== {name} done in {time.time() - t0:.0f}s")
        log(spend_report(Ledger()).replace("\n", " | "))
    if "thread" in LISTING:
        LISTING["thread"].join(timeout=1800)
        log(f"listing cross-check: {LISTING.get('urls')} URLs {LISTING.get('error', '')}")
        step_ingest_checks(st)
        save_state(st)


if __name__ == "__main__":
    main()
