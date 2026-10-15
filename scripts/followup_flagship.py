"""Spend the remaining Stage F Tavily credits on flagship chains first, then refresh their dossiers.

1. Promises cited in the 25 flagship chains' verdicts, then any promise of those chains' earlier reports.
2. follow_up() stops at the 250-credit Stage F cap on its own.
3. Dossiers of flagship chains that gained follow-up evidence are redrafted (Stage D cap still applies),
   and stay unreviewed.
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from pipeline import config, db, env  # noqa: E402

env.load()

from pipeline.llm import LLM, Ledger, spend_report  # noqa: E402


def main() -> None:
    from pipeline.dossier import ultra as D
    from pipeline.export import web
    from pipeline.followup.tavily import Tavily, follow_up

    llm = LLM()
    conn = db.connect()
    flagship = D.select_flagship(conn, n=25)
    ordered: list[int] = []
    chain_of: dict[int, str] = {}
    for key in flagship:
        cid = conn.execute("SELECT id FROM chains WHERE chain_key=?", (key,)).fetchone()[0]
        cited = [r[0] for r in conn.execute(
            "SELECT DISTINCT v.promise_id FROM chain_members m JOIN recurrence_verdicts v ON v.pair_id=m.pair_id "
            "WHERE m.chain_id=? AND v.promise_id IS NOT NULL", (cid,))]
        others = [r[0] for r in conn.execute(
            """SELECT DISTINCT pr.id FROM chain_members m JOIN candidate_pairs p ON p.id=m.pair_id
               JOIN concerns ce ON ce.id=p.earlier_concern_id JOIN responses rs ON rs.report_url=ce.report_url
               JOIN promises pr ON pr.response_id=rs.id
               WHERE m.chain_id=? AND pr.quote_verified>0 AND (rs.organisation_id=p.organisation_id OR rs.organisation_id IS NULL)""",
            (cid,))]
        for pid in cited + others[:2]:
            if pid not in chain_of:
                chain_of[pid] = key
                ordered.append(pid)
    done = {r[0] for r in conn.execute("SELECT promise_id FROM followups")}
    conn.close()
    todo = [p for p in ordered if p not in done]
    tv = Tavily()
    room = config.TAVILY_STAGE_F_CAP_CREDITS - tv.ledger.tavily_credits("F")
    print(f"flagship promises: {len(ordered)}, already checked {len(ordered) - len(todo)}, credits left {room:.0f}", flush=True)
    res = follow_up(llm, tv, todo)
    print("followup:", res, flush=True)
    conn = db.connect()
    refreshed = sorted({chain_of[p] for p in todo
                        if conn.execute("SELECT 1 FROM followups WHERE promise_id=?", (p,)).fetchone()})
    conn.close()
    if refreshed and len(refreshed) * 0.016 <= llm.remaining("D"):
        print("redrafting dossiers:", D.run(llm, refreshed), flush=True)
    print("export:", web.export(), flush=True)
    print(spend_report(Ledger()), flush=True)


if __name__ == "__main__":
    main()
