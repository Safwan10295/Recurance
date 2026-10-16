"""Honest evaluation report, from results already computed (no model calls, no threshold changes).

Adds to data/exports/evaluation.json:
  - 95% Wilson intervals for each system's recall on the coroner-acknowledged pairs;
  - each miss of the Nemotron system, split into "not in the candidate set" and "judge rejected";
  - cost per verified chain (all stages, and analysis only) and cost and tokens per model, from the ledger.
The thresholds stay exactly as they were set before the test (equal shown-link budget).
"""
from __future__ import annotations

import json
import math
import sqlite3
from collections import Counter
from datetime import datetime, timezone

from .. import config, db

EV = config.EXPORTS / "evaluation.json"
PAIRS = config.EXPORTS / "evaluation_pairs.json"


def wilson(k: int, n: int, z: float = 1.96) -> tuple[float, float]:
    """95% Wilson score interval for k successes out of n."""
    if n == 0:
        return (0.0, 0.0)
    p = k / n
    d = 1 + z * z / n
    c = (p + z * z / (2 * n)) / d
    h = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
    return (max(0.0, c - h), min(1.0, c + h))


def miss_reason(p: dict) -> tuple[str, str]:
    """(category, plain reason) for a pair the Nemotron system did not show."""
    if not p.get("hybrid_candidate"):
        return "not_candidate", (f"Never reached the judge: no single pair of concerns passed the candidate filter (similarity "
                                 f"thresholds and the per-organisation pair cap), although as whole reports it ranked "
                                 f"{p.get('emb_rank')} by meaning and {p.get('tfidf_rank')} by wording among "
                                 f"{p.get('n_candidates')} earlier reports to the organisation")
    j = p.get("judge") or {}
    if j.get("error"):
        return "judge_error", "The judge call did not return a usable verdict"
    rel = (j.get("relation") or "").replace("_", " ")
    if rel not in ("identical", "closely related"):
        return "judge_rejected", f"Judged {rel or 'no relation'} (confidence {j.get('confidence', 0):.2f}): a related but different hazard"
    if not j.get("quotes_verified"):
        return "quotes", "Judged the same hazard, but a quote could not be verified word for word, so it is not shown"
    return "judge_rejected", f"Judged {rel} with confidence {j.get('confidence', 0):.2f}, below the 0.70 shown threshold"


def enrich() -> dict:
    ev = json.loads(EV.read_text(encoding="utf-8"))
    pairs = json.loads(PAIRS.read_text(encoding="utf-8"))
    thr = ev["thresholds"]
    n = len(pairs)
    hits = {
        "TF-IDF only": sum(p["tfidf"] >= thr["tfidf_equal_budget"] for p in pairs),
        "Embeddings only": sum(p["emb"] >= thr["embedding_equal_budget"] for p in pairs),
    }
    for s in ev["systems"]:
        if s.get("post_hoc"):
            continue  # scored on its own pairs file (scripts/eval_post_hoc.py)
        k = hits.get(s["name"], sum(bool(p.get("judge_shown")) for p in pairs))
        lo, hi = wilson(k, n)
        s["hits"], s["n"], s["recall_ci95"] = k, n, [round(lo, 3), round(hi, 3)]

    conn = db.connect()
    title = dict(conn.execute("SELECT url, title FROM reports"))
    slug = dict(conn.execute("SELECT url, slug FROM reports"))
    org = dict(conn.execute("SELECT id, canonical_name FROM organisations"))
    n_chains = conn.execute("SELECT COUNT(*) FROM chains").fetchone()[0]
    conn.close()
    misses = []
    for p in pairs:
        if p.get("judge_shown"):
            continue
        cat, why = miss_reason(p)
        misses.append({
            "category": cat, "reason": why, "days_apart": p["days_apart"],
            "organisation": org.get((p.get("shared_orgs") or [None])[0], ""),
            "earlier": {"title": title.get(p["earlier_url"], ""), "slug": slug.get(p["earlier_url"], ""), "url": p["earlier_url"]},
            "later": {"title": title.get(p["later_url"], ""), "slug": slug.get(p["later_url"], ""), "url": p["later_url"]},
            "found_by_tfidf": p["tfidf"] >= thr["tfidf_equal_budget"], "found_by_embeddings": p["emb"] >= thr["embedding_equal_budget"],
        })
    ev["misses"] = misses
    ev["miss_summary"] = dict(Counter(m["category"] for m in misses))

    # Cost and tokens, from the ledger.
    lg = sqlite3.connect(config.LEDGER_PATH)
    by_stage = dict(lg.execute("SELECT stage, SUM(cost) FROM llm_calls GROUP BY stage"))
    models = [
        {"model": r[0], "calls": r[1], "input_tokens": r[2] or 0, "output_tokens": r[3] or 0, "reasoning_tokens": r[4] or 0, "cost": round(r[5] or 0, 4)}
        for r in lg.execute("""SELECT model, SUM(cache_hit = 0 AND success = 1), SUM(input_tokens), SUM(output_tokens),
                                      SUM(reasoning_tokens), SUM(cost) FROM llm_calls GROUP BY model ORDER BY SUM(cost) DESC""")
    ]
    lg.close()
    total = sum(v or 0 for v in by_stage.values())
    analysis = sum(by_stage.get(s, 0) or 0 for s in ("A", "B", "C", "embed"))
    ev["cost"] = {
        "total": round(total, 4), "by_stage": {k: round(v or 0, 4) for k, v in by_stage.items()},
        "analysis_cost": round(analysis, 4), "chains": n_chains,
        "per_chain": round(total / n_chains, 5) if n_chains else None,
        "per_chain_analysis": round(analysis / n_chains, 5) if n_chains else None,
    }
    ev["models"] = models
    ev["report_generated_at"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
    EV.write_text(json.dumps(ev, indent=1, ensure_ascii=False), encoding="utf-8")
    return {"systems": [(s["name"], s.get("hits"), s.get("recall_ci95")) for s in ev["systems"]], "misses": ev["miss_summary"], "cost": ev["cost"]}
