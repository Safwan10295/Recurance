"""Group shown verdicts into chains: one hazard, one organisation, an ordered timeline.

A verdict is shown only if relation is identical or closely_related, its
confidence is at or above the threshold, and every quote verified.
"""
from __future__ import annotations

import hashlib
from collections import defaultdict

from .. import db

SHOWN_RELATIONS = ("identical", "closely_related")
DEFAULT_MIN_CONFIDENCE = 0.7


def shown_verdicts(conn, min_conf: float = DEFAULT_MIN_CONFIDENCE) -> list:
    return conn.execute(
        f"""SELECT v.*, p.organisation_id, ce.report_url AS e_url, cl.report_url AS l_url, ce.hazard AS e_hazard,
                   re.report_date AS e_date, rl.report_date AS l_date
            FROM recurrence_verdicts v JOIN candidate_pairs p ON p.id = v.pair_id
            JOIN concerns ce ON ce.id = p.earlier_concern_id JOIN concerns cl ON cl.id = p.later_concern_id
            JOIN reports re ON re.url = ce.report_url JOIN reports rl ON rl.url = cl.report_url
            WHERE v.relation IN ({','.join('?' * len(SHOWN_RELATIONS))}) AND v.confidence >= ? AND v.quotes_verified = 1
              AND v.same_hazard_explanation IS NOT NULL""",
        (*SHOWN_RELATIONS, min_conf),
    ).fetchall()


def build(min_conf: float = DEFAULT_MIN_CONFIDENCE) -> dict:
    conn = db.connect()
    conn.execute("DELETE FROM chain_members")
    conn.execute("DELETE FROM chains")
    rows = shown_verdicts(conn, min_conf)
    by_org: dict[int, list] = defaultdict(list)
    for r in rows:
        by_org[r["organisation_id"]].append(r)
    n_chains = 0
    for org, vs in by_org.items():
        parent: dict[str, str] = {}

        def find(x: str) -> str:
            parent.setdefault(x, x)
            while parent[x] != x:
                parent[x] = parent[parent[x]]
                x = parent[x]
            return x

        for v in vs:
            a, b = find(v["e_url"]), find(v["l_url"])
            if a != b:
                parent[b] = a
        groups: dict[str, list] = defaultdict(list)
        for v in vs:
            groups[find(v["e_url"])].append(v)
        for members in groups.values():
            members.sort(key=lambda v: (v["e_date"], v["l_date"]))
            dates = sorted({v["e_date"] for v in members} | {v["l_date"] for v in members})
            reports = {v["e_url"] for v in members} | {v["l_url"] for v in members}
            rel = "identical" if all(v["relation"] == "identical" for v in members) else "closely_related"
            # Organisation ids are reassigned when normalisation reruns, so the key uses the name.
            oname = conn.execute("SELECT canonical_name FROM organisations WHERE id=?", (org,)).fetchone()
            ckey = hashlib.sha1(f"{oname[0] if oname else org}|{'|'.join(sorted(reports))}".encode()).hexdigest()[:16]
            cur = conn.execute(
                "INSERT INTO chains (chain_key, organisation_id, hazard_label, kind, first_date, last_date, n_reports, "
                "min_confidence, relation) VALUES (?,?,?,?,?,?,?,?,?)",
                (ckey, org, members[0]["e_hazard"], "organisation", dates[0], dates[-1], len(reports),
                 min(v["confidence"] for v in members), rel),
            )
            for v in members:
                conn.execute("INSERT OR IGNORE INTO chain_members VALUES (?,?)", (cur.lastrowid, v["pair_id"]))
            n_chains += 1
    conn.commit()
    conn.close()
    return {"shown_verdicts": len(rows), "chains": n_chains}
