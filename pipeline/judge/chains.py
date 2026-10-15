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
        f"""SELECT v.*, p.organisation_id, p.earlier_concern_id AS e_cid, p.later_concern_id AS l_cid,
                   ce.idx AS e_idx, cl.idx AS l_idx,
                   ce.report_url AS e_url, cl.report_url AS l_url, ce.hazard AS e_hazard,
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
    previous = chain_concerns(conn)
    conn.execute("DELETE FROM chain_members")
    conn.execute("DELETE FROM chains")
    rows = shown_verdicts(conn, min_conf)
    by_org: dict[int, list] = defaultdict(list)
    for r in rows:
        by_org[r["organisation_id"]].append(r)
    n_chains = 0
    used_keys: set[str] = set()
    for org, vs in by_org.items():
        # Join links through shared concerns, not shared reports: one report can raise several
        # hazards, and joining on the report would merge unrelated hazards into one chain (D19).
        parent: dict[int, int] = {}

        def find(x: int) -> int:
            parent.setdefault(x, x)
            while parent[x] != x:
                parent[x] = parent[parent[x]]
                x = parent[x]
            return x

        for v in vs:
            a, b = find(v["e_cid"]), find(v["l_cid"])
            if a != b:
                parent[b] = a
        groups: dict[int, list] = defaultdict(list)
        for v in vs:
            groups[find(v["e_cid"])].append(v)
        for members in groups.values():
            members.sort(key=lambda v: (v["e_date"], v["l_date"]))
            dates = sorted({v["e_date"] for v in members} | {v["l_date"] for v in members})
            reports = {v["e_url"] for v in members} | {v["l_url"] for v in members}
            rel = "identical" if all(v["relation"] == "identical" for v in members) else "closely_related"
            # Organisation ids are reassigned when normalisation reruns, so the key uses the name.
            oname = conn.execute("SELECT canonical_name FROM organisations WHERE id=?", (org,)).fetchone()
            # Stable key: the organisation and the chain's earliest link (D20). Later reports joining the
            # chain do not change it, so shared links and the demo script keep working after a refresh.
            a = members[0]
            seed = f"{oname[0] if oname else org}|{a['e_url']}#{a['e_idx']}|{a['l_url']}#{a['l_idx']}"
            ckey = hashlib.sha1(seed.encode()).hexdigest()[:16]
            n = 1
            while ckey in used_keys:  # two chains with the same earliest link: keep keys unique
                n += 1
                ckey = hashlib.sha1(f"{seed}|{n}".encode()).hexdigest()[:16]
            used_keys.add(ckey)
            cur = conn.execute(
                "INSERT INTO chains (chain_key, organisation_id, hazard_label, kind, first_date, last_date, n_reports, "
                "min_confidence, relation) VALUES (?,?,?,?,?,?,?,?,?)",
                (ckey, org, members[0]["e_hazard"], "organisation", dates[0], dates[-1], len(reports),
                 min(v["confidence"] for v in members), rel),
            )
            for v in members:
                conn.execute("INSERT OR IGNORE INTO chain_members VALUES (?,?)", (cur.lastrowid, v["pair_id"]))
            n_chains += 1
    redirected = carry_over(conn, previous, chain_concerns(conn))
    conn.commit()
    conn.close()
    return {"shown_verdicts": len(rows), "chains": n_chains, "redirected": redirected}


def chain_concerns(conn) -> dict[str, set[int]]:
    """Chain key -> the concern ids its links use."""
    out: dict[str, set[int]] = defaultdict(set)
    for r in conn.execute(
        """SELECT c.chain_key, p.earlier_concern_id, p.later_concern_id FROM chains c
           JOIN chain_members m ON m.chain_id = c.id JOIN candidate_pairs p ON p.id = m.pair_id"""
    ):
        out[r[0]].update((r[1], r[2]))
    return dict(out)


def carry_over(conn, old: dict[str, set[int]], new: dict[str, set[int]]) -> int:
    """For keys that disappeared, redirect to the new chain sharing most concerns, and move its dossier.

    A dossier keeps its human review only if the chain's contents are unchanged; otherwise it goes
    back to unreviewed so a person reads the grown chain again.
    """
    moved = 0
    for k, cids in old.items():
        if k in new or not cids:
            continue
        best, overlap = None, 0
        for nk, ncids in new.items():
            o = len(cids & ncids)
            if o > overlap:
                best, overlap = nk, o
        if not best:
            continue
        conn.execute("INSERT OR REPLACE INTO chain_redirects VALUES (?,?)", (k, best))
        # Earlier redirects that pointed at k now point at its successor.
        conn.execute("UPDATE chain_redirects SET new_key=? WHERE new_key=?", (best, k))
        has = conn.execute("SELECT 1 FROM dossiers WHERE chain_key=?", (best,)).fetchone()
        if not has:
            same = cids == new[best]
            conn.execute("UPDATE dossiers SET chain_key=?, reviewed_by_human = CASE WHEN ? THEN reviewed_by_human ELSE 0 END "
                         "WHERE chain_key=?", (best, int(same), k))
        moved += 1
    conn.execute("DELETE FROM chain_redirects WHERE old_key IN (SELECT chain_key FROM chains)")
    return moved
