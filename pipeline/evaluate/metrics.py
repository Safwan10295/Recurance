"""Evaluation (handoff section 10).

Test set: coroner-acknowledged pairs that share an organisation and are at least
six months apart. Blind test: the acknowledgement is masked out of the later report.

Three systems:
  1. TF-IDF only: report-level cosine of concerns text.
  2. Embeddings only: best concern-to-concern embedding cosine.
  3. Hybrid + Nemotron judge: the pipeline's candidate rule, then the Super judge,
     shown only if identical/closely_related, confidence >= threshold, quotes verified.

Equal-budget comparison: each baseline's threshold is set so it would show as many
links across the corpus as the hybrid + judge system does. Recall is then compared
on the blind test. Precision needs Pilot's hand labels and is reported as pending
until data/exports/hand_labels.csv has labels.
"""
from __future__ import annotations

import csv
import json
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timezone

import numpy as np
from sklearn.feature_extraction.text import ENGLISH_STOP_WORDS, TfidfVectorizer

from .. import config, db
from ..judge import chains as chains_mod
from ..judge import recurrence as C
from ..link.candidates import STOP_EXTRA
from ..link.embed import concern_text, embed_texts, from_blob
from ..llm import LLM, BudgetExceeded, Ledger
from .acknowledged import find_pairs, mask_text

MIN_DAYS = config.MIN_DAYS_APART


def _days(a: str, b: str) -> int:
    return (date.fromisoformat(b) - date.fromisoformat(a)).days


def _org_reports(conn) -> dict[int, set[str]]:
    d = defaultdict(set)
    for r in conn.execute("SELECT report_url, organisation_id FROM report_receivers"):
        d[r[1]].add(r[0])
    return d


def hand_label_precision() -> tuple[str, int, dict]:
    p = config.EXPORTS / "hand_labels.csv"
    if not p.exists():
        return "pending: Pilot has not labelled the candidate file yet", 0, {}
    rows = [r for r in csv.DictReader(p.open(encoding="utf-8")) if (r.get("label") or "").strip()]
    if not rows:
        return "pending: no labels filled in yet", 0, {}
    return "labelled", len(rows), {"rows": rows}


def evaluate(llm: LLM, judge: bool = True, max_judge: int = 400) -> dict:
    conn = db.connect()
    rep = {r["url"]: dict(r) for r in conn.execute(
        "SELECT url, ref, title, report_date, coroner, area, concerns FROM reports WHERE duplicate_of IS NULL AND report_date IS NOT NULL")}
    ack = [p for p in find_pairs(conn) if p["earlier_url"] in rep and p["later_url"] in rep]
    for p in ack:
        p["days_apart"] = _days(rep[p["earlier_url"]]["report_date"], rep[p["later_url"]]["report_date"])
    test = [p for p in ack if p["in_scope"] and p["days_apart"] >= MIN_DAYS]
    (config.EXPORTS).mkdir(parents=True, exist_ok=True)
    (config.EXPORTS / "acknowledged_pairs.json").write_text(json.dumps(ack, indent=1), encoding="utf-8")

    org_reps = _org_reports(conn)
    report_orgs = defaultdict(set)
    for o, us in org_reps.items():
        for u in us:
            report_orgs[u].add(o)

    # Masked later texts (report level and concern level).
    masked_report: dict[tuple[str, str], str] = {}
    for p in test:
        masked_report[(p["earlier_url"], p["later_url"])] = mask_text(rep[p["later_url"]]["concerns"] or "", rep[p["earlier_url"]])

    # ---------- System 1: TF-IDF on report concerns ----------
    urls = [u for u in rep if (rep[u]["concerns"] or "").strip()]
    uidx = {u: i for i, u in enumerate(urls)}
    small = len(urls) < 200
    vec = TfidfVectorizer(stop_words=list(ENGLISH_STOP_WORDS.union(STOP_EXTRA)), ngram_range=(1, 2),
                          min_df=1 if small else 2, max_df=1.0 if small else 0.3, sublinear_tf=True)
    X = vec.fit_transform([rep[u]["concerns"] for u in urls])

    def candidates_for(later: str) -> list[str]:
        out = set()
        for o in report_orgs.get(later, ()):
            for u in org_reps[o]:
                if u in uidx and u != later and _days(rep[u]["report_date"], rep[later]["report_date"]) >= MIN_DAYS:
                    out.add(u)
        return sorted(out)

    # Corpus-wide report pair scores (unmasked) for the equal-budget threshold.
    all_tfidf: list[float] = []
    for o, us in org_reps.items():
        us = [u for u in us if u in uidx]
        if len(us) < 2:
            continue
        sub = X[[uidx[u] for u in us]]
        sim = (sub @ sub.T).toarray()
        for i, a in enumerate(us):
            for j, b in enumerate(us):
                if _days(rep[a]["report_date"], rep[b]["report_date"]) >= MIN_DAYS:
                    all_tfidf.append(float(sim[i, j]))

    # ---------- System 2: embeddings, best concern pair ----------
    cons = defaultdict(list)
    for c in conn.execute("SELECT id, report_url, hazard, mechanism, text_quote, embedding FROM concerns WHERE embedding IS NOT NULL"):
        cons[c["report_url"]].append(c)
    # Re-embed masked versions of the later reports' concerns (cheap, cached).
    masked_vecs: dict[tuple[str, str], np.ndarray] = {}
    to_embed, keys = [], []
    for p in test:
        E = rep[p["earlier_url"]]
        for c in cons.get(p["later_url"], []):
            t = mask_text(concern_text(c), E)
            if t != concern_text(c):
                to_embed.append(t or ".")
                keys.append((p["earlier_url"], p["later_url"], c["id"]))
    emb_override: dict[tuple, np.ndarray] = {}
    if to_embed:
        V = embed_texts(llm, to_embed)
        for k, v in zip(keys, V):
            emb_override[k] = v

    def later_matrix(e_url: str, l_url: str) -> np.ndarray | None:
        cs = cons.get(l_url, [])
        if not cs:
            return None
        return np.vstack([emb_override.get((e_url, l_url, c["id"]), from_blob(c["embedding"])) for c in cs])

    def emb_score(e_url: str, L: np.ndarray) -> float:
        cs = cons.get(e_url, [])
        if not cs or L is None:
            return -1.0
        Em = np.vstack([from_blob(c["embedding"]) for c in cs])
        return float((Em @ L.T).max())

    shown_links = len(chains_mod.shown_verdicts(conn))
    budget_n = max(shown_links, 1)
    tf_thr = sorted(all_tfidf, reverse=True)[min(budget_n, len(all_tfidf)) - 1] if all_tfidf else 1.0
    # Embedding equal-budget threshold from the candidate table's embed scores (best pair per report pair).
    emb_all = sorted((r[0] for r in conn.execute("SELECT embed_score FROM candidate_pairs")), reverse=True)
    emb_thr = emb_all[min(budget_n, len(emb_all)) - 1] if emb_all else 1.0

    per_pair = []
    for p in test:
        e, l = p["earlier_url"], p["later_url"]
        cands = candidates_for(l)
        if e not in uidx or l not in uidx or e not in cands:
            per_pair.append({**p, "tfidf_rank": None, "emb_rank": None, "skipped": "no concerns text"})
            continue
        q = vec.transform([masked_report[(e, l)]])
        tf_scores = {u: float((X[uidx[u]] @ q.T).toarray()[0, 0]) for u in cands}
        L = later_matrix(e, l)
        em_scores = {u: emb_score(u, L) for u in cands}
        tf_rank = 1 + sum(1 for u, s in tf_scores.items() if s > tf_scores[e])
        em_rank = 1 + sum(1 for u, s in em_scores.items() if s > em_scores[e])
        per_pair.append({**p, "n_candidates": len(cands), "tfidf": tf_scores[e], "tfidf_rank": tf_rank,
                         "emb": em_scores[e], "emb_rank": em_rank})

    # ---------- System 3: hybrid candidate rule + judge, blind ----------
    judged = []
    if judge:
        jobs = []
        for pp in per_pair:
            if pp.get("skipped"):
                continue
            e, l = pp["earlier_url"], pp["later_url"]
            # Best concern pair under the hybrid score, masked.
            L = later_matrix(e, l)
            ecs, lcs = cons.get(e, []), cons.get(l, [])
            if not ecs or L is None:
                continue
            Em = np.vstack([from_blob(c["embedding"]) for c in ecs])
            S = Em @ L.T
            i, j = np.unravel_index(int(np.argmax(S)), S.shape)
            hybrid = 0.6 * float(S[i, j]) + 0.4 * pp["tfidf"]
            passes = float(S[i, j]) >= config.EMBED_MIN or pp["tfidf"] >= config.TFIDF_MIN
            pp["hybrid"] = hybrid
            pp["hybrid_candidate"] = bool(passes and pp["emb_rank"] <= max(config.NATIONAL_TOP_K, 5))
            if pp["hybrid_candidate"]:
                org = sorted(set(pp["shared_orgs"]))[0]
                d = C.pair_dict(conn, ecs[i]["id"], lcs[j]["id"], org, None)
                d["id"] = f"eval:{ecs[i]['id']}:{lcs[j]['id']}"
                d["l_concerns"] = masked_report[(e, l)]
                d["l_quote"] = mask_text(d["l_quote"], rep[e]) or d["l_quote"]
                jobs.append((pp, d))
        jobs = jobs[:max_judge]

        def run_one(job):
            pp, d = job
            try:
                return pp, C.judge_one(llm, d, stage="C")
            except BudgetExceeded as ex:
                return pp, {"ok": False, "error": f"BUDGET {ex}"}

        with ThreadPoolExecutor(max_workers=6) as ex:
            for pp, res in ex.map(run_one, jobs):
                shown = bool(res.get("ok") and res["relation"] in chains_mod.SHOWN_RELATIONS
                             and res["confidence"] >= chains_mod.DEFAULT_MIN_CONFIDENCE and res["quotes_verified"])
                pp["judge"] = {k: res.get(k) for k in ("relation", "confidence", "quotes_verified", "error")}
                pp["judge_shown"] = shown
                judged.append(pp)

    valid = [p for p in per_pair if not p.get("skipped")]
    n = len(valid)

    def rate(xs):
        return (sum(1 for x in xs if x) / n) if n else None

    hl_status, hl_n, hl = hand_label_precision()
    prec = {"tfidf": None, "emb": None, "judge": None}
    if hl:
        pos = {"identical", "closely_related"}
        shown_ids = {v["pair_id"] for v in chains_mod.shown_verdicts(conn)}
        sc = {r["id"]: (r["tfidf_score"], r["embed_score"]) for r in conn.execute(
            "SELECT id, tfidf_score, embed_score FROM candidate_pairs")}

        def precision(pred):
            sel = [r for r in hl["rows"] if pred(int(r["pair_id"]))]
            return (sum(r["label"] in pos for r in sel) / len(sel)) if sel else None

        prec["tfidf"] = precision(lambda i: i in sc and (sc[i][0] or 0) >= tf_thr)
        prec["emb"] = precision(lambda i: i in sc and (sc[i][1] or 0) >= emb_thr)
        prec["judge"] = precision(lambda i: i in shown_ids)
    systems = [
        {"name": "TF-IDF only", "description": f"Report-level cosine, shown if at least {tf_thr:.3f} (equal-budget threshold)",
         "recall_at_threshold": rate(p["tfidf"] >= tf_thr for p in valid),
         "recall_at_5": rate(p["tfidf_rank"] <= 5 for p in valid), "shown_pairs": budget_n, "precision": prec["tfidf"]},
        {"name": "Embeddings only", "description": f"Best concern pair cosine, shown if at least {emb_thr:.3f} (equal-budget threshold)",
         "recall_at_threshold": rate(p["emb"] >= emb_thr for p in valid),
         "recall_at_5": rate(p["emb_rank"] <= 5 for p in valid), "shown_pairs": budget_n, "precision": prec["emb"]},
        {"name": "Hybrid + Nemotron Super judge", "description": "Candidate rule, then judged; shown if identical or closely related, confident, quotes verified",
         "recall_at_threshold": rate(p.get("judge_shown") for p in valid) if judge else None,
         "recall_at_5": rate(p.get("hybrid_candidate") for p in valid) if judge else None,
         "shown_pairs": shown_links, "precision": prec["judge"]},
    ]

    # Lost memory among shown links.
    ack_set = {(p["earlier_url"], p["later_url"]) for p in ack}
    lm = {"links": 0, "diff_coroner": 0, "diff_area": 0, "not_cited": 0, "all_three": 0}
    for v in chains_mod.shown_verdicts(conn):
        e, l = v["e_url"], v["l_url"]
        dc = (rep[e]["coroner"] or "").lower() != (rep[l]["coroner"] or "").lower()
        da = (rep[e]["area"] or "").lower() != (rep[l]["area"] or "").lower()
        nc = (e, l) not in ack_set
        lm["links"] += 1
        lm["diff_coroner"] += dc
        lm["diff_area"] += da
        lm["not_cited"] += nc
        lm["all_three"] += dc and da and nc
    for k in ("diff_coroner", "diff_area", "not_cited", "all_three"):
        lm[k] = lm[k] / lm["links"] if lm["links"] else 0.0

    by_stage = Ledger().spend_by_stage()
    n_chains = conn.execute("SELECT COUNT(*) FROM chains").fetchone()[0]
    analysis_cost = sum(by_stage.get(s, 0.0) for s in ("dev", "embed", "A", "B", "C"))
    by_evidence = defaultdict(int)
    for p in ack:
        for ev in p["evidence"]:
            by_evidence[ev] += 1
    out = {
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "acknowledged": {"total": len(ack), "in_scope": sum(p["in_scope"] for p in ack), "in_scope_6m": len(test),
                         "evaluated": n, "by_evidence": dict(by_evidence)},
        "systems": systems,
        "thresholds": {"tfidf_equal_budget": tf_thr, "embedding_equal_budget": emb_thr},
        "lost_memory": lm,
        "cost": {"total": sum(by_stage.values()), "by_stage": by_stage, "analysis_cost": analysis_cost,
                 "per_chain": (analysis_cost / n_chains) if n_chains else None, "chains": n_chains},
        "hand_labels": {"status": hl_status, "n_labelled": hl_n},
        "notes": [],
    }
    (config.EXPORTS / "evaluation.json").write_text(json.dumps(out, indent=1), encoding="utf-8")
    (config.EXPORTS / "evaluation_pairs.json").write_text(json.dumps(per_pair, indent=1, default=str), encoding="utf-8")
    conn.close()
    return out
