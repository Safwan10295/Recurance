"""Verify the handoff's candidate demo chains (section 3) against the pipeline's output.

For each candidate chain: are the reports present with concerns, did a candidate pair form,
what did the judge say, and is the link shown? Writes data/exports/demo_chains.json.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from pipeline import config, db  # noqa: E402

B = "https://www.judiciary.uk/prevention-of-future-death-reports/"
CHAINS = {
    "Smart motorways (National Highways)": ["jamil-ahmed-2", "zoltan-torok-prevention-of-future-deaths-report",
                                             "david-levett-prevention-of-future-deaths-report"],
    "Unbarriered platform ends (Network Rail)": ["taiyah-grace-peebles", "jordan-aira", "callum-evans"],
    "Paraffin emollient fires": ["pauline-taylor-2", "brian-bicat"],
    "Online pharmacy self-certification (NHS England)": ["karl-willis", "joseph-gingell"],
    "Pennine Care (related, not identical)": ["david-power-prevention-of-future-deaths-report"],
}


def main() -> None:
    conn = db.connect()
    out = {}
    for name, slugs in CHAINS.items():
        urls = [B + s + "/" for s in slugs]
        reps = []
        for u in urls:
            r = conn.execute("SELECT report_date, coroner, body_source, length(concerns) n, duplicate_of FROM reports WHERE url=?",
                             (u,)).fetchone()
            nc = conn.execute("SELECT COUNT(*) FROM concerns WHERE report_url=?", (u,)).fetchone()[0]
            orgs = [x[0] for x in conn.execute(
                "SELECT o.canonical_name FROM report_receivers rr JOIN organisations o ON o.id=rr.organisation_id WHERE rr.report_url=?", (u,))]
            reps.append({"url": u, "present": r is not None, "date": r["report_date"] if r else None,
                         "coroner": r["coroner"] if r else None, "source": r["body_source"] if r else None,
                         "concerns_chars": r["n"] if r else 0, "concerns": nc, "orgs": orgs,
                         "duplicate_of": r["duplicate_of"] if r else None})
        links = []
        for i, a in enumerate(urls):
            for b in urls[i + 1:]:
                for p in conn.execute(
                    """SELECT p.id, p.hybrid_score, p.embed_score, p.tfidf_score, v.relation, v.confidence, v.quotes_verified
                       FROM candidate_pairs p JOIN concerns ce ON ce.id=p.earlier_concern_id JOIN concerns cl ON cl.id=p.later_concern_id
                       LEFT JOIN recurrence_verdicts v ON v.pair_id=p.id
                       WHERE (ce.report_url=? AND cl.report_url=?) OR (ce.report_url=? AND cl.report_url=?)""", (a, b, b, a)):
                    links.append({"a": a.rsplit("/", 2)[-2], "b": b.rsplit("/", 2)[-2], **dict(p)})
        chain = conn.execute(
            """SELECT DISTINCT c.chain_key FROM chains c JOIN chain_members m ON m.chain_id=c.id
               JOIN candidate_pairs p ON p.id=m.pair_id JOIN concerns ce ON ce.id IN (p.earlier_concern_id, p.later_concern_id)
               WHERE ce.report_url IN (%s)""" % ",".join("?" * len(urls)), urls).fetchall()
        out[name] = {"reports": reps, "pairs": links, "chain_keys": [c[0] for c in chain]}
    conn.close()
    (config.EXPORTS / "demo_chains.json").write_text(json.dumps(out, indent=1), encoding="utf-8")
    for name, d in out.items():
        print(f"\n{name}: chains {d['chain_keys']}")
        for r in d["reports"]:
            print(f"  {r['url'].rsplit('/', 2)[-2][:45]:45} {r['date']} src={r['source']} concerns={r['concerns']} orgs={r['orgs'][:3]}")
        for p in d["pairs"]:
            print(f"  pair {p['a'][:20]} -> {p['b'][:20]} hybrid={p['hybrid_score']:.3f} verdict={p['relation']} {p['confidence']}")


if __name__ == "__main__":
    main()
