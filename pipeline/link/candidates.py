"""Deterministic linking (handoff section 9.5).

Within each organisation, compare concerns from reports at least six months
apart, earlier to later, with TF-IDF cosine and embedding cosine. Keep the best
concern pair per report pair, then cap pairs per organisation. Large (national)
organisations use top-k retrieval per later concern instead of all pairs.
"""
from __future__ import annotations

from collections import defaultdict
from datetime import date

import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer

from .. import config, db
from .embed import from_blob

STOP_EXTRA = [
    "coroner", "coroners", "concern", "concerns", "inquest", "evidence", "death", "deaths", "future",
    "risk", "action", "report", "deceased", "mr", "mrs", "ms", "dr", "miss", "trust", "nhs",
]


def _days(a: str, b: str) -> int:
    return (date.fromisoformat(b) - date.fromisoformat(a)).days


def load_concerns(conn, mask: dict[int, str] | None = None):
    rows = conn.execute(
        """SELECT c.id, c.report_url, c.text_quote, c.hazard, c.mechanism, c.embedding,
                  r.report_date, r.coroner, r.area, r.concerns AS report_concerns
           FROM concerns c JOIN reports r ON r.url = c.report_url
           WHERE r.duplicate_of IS NULL AND r.report_date IS NOT NULL AND c.embedding IS NOT NULL"""
    ).fetchall()
    return rows


def tfidf_matrix(texts: list[str]):
    from sklearn.feature_extraction.text import ENGLISH_STOP_WORDS

    small = len(texts) < 200  # tiny corpora (tests, pilots) cannot use document-frequency cut-offs
    vec = TfidfVectorizer(stop_words=list(ENGLISH_STOP_WORDS.union(STOP_EXTRA)), ngram_range=(1, 2),
                          min_df=1 if small else 2, max_df=1.0 if small else 0.3, sublinear_tf=True)
    X = vec.fit_transform(texts)
    return X, vec


def build(tfidf_min: float = config.TFIDF_MIN, embed_min: float = config.EMBED_MIN,
          max_pairs_per_org: int = config.MAX_PAIRS_PER_ORG, national_top_k: int = config.NATIONAL_TOP_K,
          min_days: int = config.MIN_DAYS_APART, write: bool = True, text_override: dict[int, str] | None = None,
          emb_override: dict[int, np.ndarray] | None = None, report_top_k: int = config.REPORT_ROUTE_TOP_K,
          report_tfidf_min: float = config.REPORT_ROUTE_TFIDF_MIN) -> dict:
    """Build candidate pairs. text_override / emb_override let the blind test swap in masked texts."""
    conn = db.connect()
    rows = load_concerns(conn)
    idx = {r["id"]: i for i, r in enumerate(rows)}
    texts = []
    for r in rows:
        t = f"{r['hazard'] or ''} {r['mechanism'] or ''} {r['text_quote'] or ''}"
        if text_override and r["id"] in text_override:
            t = text_override[r["id"]]
        texts.append(t)
    X, _ = tfidf_matrix(texts)
    E = np.vstack([from_blob(r["embedding"]) for r in rows]).astype(np.float32)
    if emb_override:
        for cid, v in emb_override.items():
            if cid in idx:
                E[idx[cid]] = v

    org_reports: dict[int, set[str]] = defaultdict(set)
    for rr in conn.execute(
        "SELECT rr.report_url, rr.organisation_id, o.is_national FROM report_receivers rr "
        "JOIN organisations o ON o.id = rr.organisation_id"
    ):
        org_reports[rr["organisation_id"]].add(rr["report_url"])
    national = {r[0] for r in conn.execute("SELECT id FROM organisations WHERE is_national=1")}
    concerns_by_report: dict[str, list[int]] = defaultdict(list)
    for i, r in enumerate(rows):
        concerns_by_report[r["report_url"]].append(i)

    pairs: list[dict] = []
    for org, reps in org_reports.items():
        reps = [u for u in reps if u in concerns_by_report]
        if len(reps) < 2:
            continue
        ids = [i for u in reps for i in concerns_by_report[u]]
        sub_e = E[ids]
        sub_x = X[ids]
        emb = sub_e @ sub_e.T
        tf = (sub_x @ sub_x.T).toarray()
        dates = [rows[i]["report_date"] for i in ids]
        urls = [rows[i]["report_url"] for i in ids]
        ords = np.array([date.fromisoformat(d).toordinal() for d in dates])
        best: dict[tuple[str, str], dict] = {}
        big = org in national or len(reps) > 60
        for b in range(len(ids)):
            # candidates a: earlier than b by at least min_days (so never the same report)
            ok = (ords[b] - ords) >= min_days
            ok &= (emb[:, b] >= embed_min) | (tf[:, b] >= tfidf_min)
            cands = np.nonzero(ok)[0]
            if cands.size == 0:
                continue
            if big:
                score = emb[cands, b] + tf[cands, b]
                cands = cands[np.argsort(-score)[:national_top_k]]
            for a in cands:
                e, t = float(emb[a, b]), float(tf[a, b])
                if e < embed_min and t < tfidf_min:
                    continue
                hybrid = 0.6 * e + 0.4 * t
                key = (urls[a], urls[b])
                if key not in best or hybrid > best[key]["hybrid_score"]:
                    ra, rb = rows[ids[a]], rows[ids[b]]
                    best[key] = {
                        "earlier_concern_id": ra["id"], "later_concern_id": rb["id"], "organisation_id": org,
                        "tfidf_score": t, "embed_score": e, "hybrid_score": hybrid,
                        "days_apart": _days(dates[a], dates[b]),
                        "same_coroner": int((ra["coroner"] or "").strip().lower() == (rb["coroner"] or "").strip().lower()),
                        "same_area": int((ra["area"] or "").strip().lower() == (rb["area"] or "").strip().lower()),
                        "source": "national" if org in national else "org",
                    }
        # The cap grows with the organisation's size, so bodies with hundreds of reports are not
        # limited to the same 30 pairs as a single hospital trust (D18).
        cap = max(max_pairs_per_org, int(config.PAIRS_PER_REPORT * len(reps)))
        chosen = sorted(best.values(), key=lambda p: -p["hybrid_score"])[:cap]
        pairs.extend(chosen)

    # Second route (D30): whole-report wording. Each later report's top earlier reports by report-level
    # TF-IDF reach the judge even if no single concern pair passed the thresholds. Report texts are built
    # from the same (possibly masked) concern texts, so the blind test stays blind.
    if report_top_k > 0:
        covered = {(rows[idx[p["earlier_concern_id"]]]["report_url"], rows[idx[p["later_concern_id"]]]["report_url"]) for p in pairs}
        rep_urls = list(concerns_by_report)
        ridx = {u: i for i, u in enumerate(rep_urls)}
        R, _ = tfidf_matrix([" ".join(texts[i] for i in concerns_by_report[u]) for u in rep_urls])
        rdate = {u: date.fromisoformat(rows[concerns_by_report[u][0]]["report_date"]).toordinal() for u in rep_urls}
        for org, reps in org_reports.items():
            reps = sorted(u for u in reps if u in ridx)
            if len(reps) < 2:
                continue
            sim = (R[[ridx[u] for u in reps]] @ R[[ridx[u] for u in reps]].T).toarray()
            for j, b in enumerate(reps):
                cand = [(sim[i, j], a) for i, a in enumerate(reps)
                        if rdate[b] - rdate[a] >= min_days and sim[i, j] >= report_tfidf_min]
                for _s, a in sorted(cand, reverse=True)[:report_top_k]:
                    if (a, b) in covered:
                        continue
                    covered.add((a, b))
                    # The best concern pair between the two reports, by the same hybrid score.
                    best_p = None
                    for ia in concerns_by_report[a]:
                        for ib in concerns_by_report[b]:
                            e = float(E[ia] @ E[ib])
                            t = float((X[ia] @ X[ib].T).toarray()[0, 0])
                            h = 0.6 * e + 0.4 * t
                            if best_p is None or h > best_p[0]:
                                best_p = (h, ia, ib, e, t)
                    h, ia, ib, e, t = best_p
                    ra, rb = rows[ia], rows[ib]
                    pairs.append({
                        "earlier_concern_id": ra["id"], "later_concern_id": rb["id"], "organisation_id": org,
                        "tfidf_score": t, "embed_score": e, "hybrid_score": h,
                        "days_apart": _days(ra["report_date"], rb["report_date"]),
                        "same_coroner": int((ra["coroner"] or "").strip().lower() == (rb["coroner"] or "").strip().lower()),
                        "same_area": int((ra["area"] or "").strip().lower() == (rb["area"] or "").strip().lower()),
                        "source": "report_route",
                    })

    # One pair of reports may be shared by several organisations; keep the highest-scoring copy.
    dedup: dict[tuple[int, int], dict] = {}
    for p in pairs:
        k = (p["earlier_concern_id"], p["later_concern_id"])
        if k not in dedup or p["hybrid_score"] > dedup[k]["hybrid_score"]:
            dedup[k] = p
    pairs = list(dedup.values())
    if write:
        conn.execute("DELETE FROM candidate_pairs WHERE id NOT IN (SELECT pair_id FROM recurrence_verdicts)")
        for p in pairs:
            conn.execute(
                """INSERT INTO candidate_pairs (earlier_concern_id, later_concern_id, organisation_id, tfidf_score,
                       embed_score, hybrid_score, days_apart, same_coroner, same_area, source)
                   VALUES (:earlier_concern_id, :later_concern_id, :organisation_id, :tfidf_score, :embed_score,
                           :hybrid_score, :days_apart, :same_coroner, :same_area, :source)
                   ON CONFLICT(earlier_concern_id, later_concern_id) DO UPDATE SET
                       tfidf_score=excluded.tfidf_score, embed_score=excluded.embed_score,
                       hybrid_score=excluded.hybrid_score, organisation_id=excluded.organisation_id""",
                p,
            )
        conn.commit()
    conn.close()
    return {"pairs": len(pairs), "orgs_with_pairs": len({p["organisation_id"] for p in pairs}), "_pairs": pairs}
