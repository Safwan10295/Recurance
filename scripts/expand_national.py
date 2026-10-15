"""Widen national-body retrieval from top-5 to top-10, judge only the new pairs, and refresh outputs.

Evidence (docs/DECISIONS.md D17): in the blind test most missed recurrences were national-body pairs
ranked 6th to 12th, which top-5 retrieval never sent to the judge. Stage C uses the c2 prompt that
already passed its pilot; the estimate is printed and checked against the remaining Stage C budget
(keeping the evaluation reserve) before any call.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from pipeline import config, db, env  # noqa: E402

env.load()

from pipeline.llm import LLM, Ledger, confirm_full_run, spend_report  # noqa: E402

COST_PER_PAIR = 0.00074  # measured over the full Stage C run of 3,245 pairs
EVAL_RESERVE = 0.35
TOP_K = 10


def main() -> None:
    from pipeline.dossier import ultra as D
    from pipeline.evaluate import labelling, metrics
    from pipeline.export import web
    from pipeline.judge import chains, recurrence as C
    from pipeline.link.candidates import build

    llm = LLM()
    before = db.connect().execute("SELECT COUNT(*) FROM candidate_pairs").fetchone()[0]
    r = build(national_top_k=TOP_K)
    r.pop("_pairs", None)
    conn = db.connect()
    ids = C.pending_pairs(conn)
    conn.close()
    print(f"candidates: {before} -> {r['pairs']}; {len(ids)} new pairs to judge", flush=True)
    room = llm.remaining("C") - EVAL_RESERVE
    n = min(len(ids), int(room / COST_PER_PAIR))
    if n < len(ids):
        print(f"budget covers {n} of {len(ids)} new pairs; judging the highest hybrid scores first", flush=True)
    ids = ids[:n]
    if ids:
        confirm_full_run(llm, "C", len(ids), COST_PER_PAIR, confirm_spend=True)
        res = C.run(llm, ids, threads=8)
        res.pop("errors", None)
        res.pop("results", None)
        print("stage C (expansion):", res, flush=True)
    print("chains:", chains.build(), flush=True)
    ev = metrics.evaluate(llm, judge=True)
    print("evaluate:", json.dumps({k: ev[k] for k in ("acknowledged", "systems")}, default=str), flush=True)
    print(labelling.prepare(n=80), flush=True)

    # Dossiers: keep those whose chain still exists; draft new ones for flagship chains without one,
    # so at most 25 current chains have a dossier. Orphans (chains that grew and changed key) are removed.
    conn = db.connect()
    live = {k for (k,) in conn.execute("SELECT chain_key FROM chains")}
    have = {k for (k,) in conn.execute("SELECT chain_key FROM dossiers")}
    orphans = have - live
    for k in orphans:
        conn.execute("DELETE FROM dossiers WHERE chain_key=?", (k,))
    conn.commit()
    flagship = D.select_flagship(conn, n=25)
    conn.close()
    kept = [k for k in flagship if k in have]
    todo = [k for k in flagship if k not in have]
    print(f"dossiers: {len(orphans)} orphaned removed, {len(kept)} kept, {len(todo)} to draft", flush=True)
    if todo and len(todo) * 0.016 <= llm.remaining("D"):
        print("dossiers:", D.run(llm, todo), flush=True)
    print("export:", web.export(), flush=True)
    print(spend_report(Ledger()), flush=True)


if __name__ == "__main__":
    main()
