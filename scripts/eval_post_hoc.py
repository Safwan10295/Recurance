"""Evaluate the report route (D30) as a post-hoc change, beside the original, pre-registered comparison.

1. Keeps the original evaluation (evaluation.json, evaluation_pairs.json) as it was.
2. Reruns the blind test with the route in place (judge calls are cached; only new pairs cost).
3. Adds the result as a separate, clearly marked post-hoc system. Nothing is tuned on the 29 pairs.

Usage: python scripts/eval_post_hoc.py
"""
from __future__ import annotations

import json
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from pipeline import config, env  # noqa: E402
from pipeline.evaluate import metrics  # noqa: E402
from pipeline.evaluate.report import enrich, wilson  # noqa: E402
from pipeline.llm import LLM  # noqa: E402

EV, PAIRS = config.EXPORTS / "evaluation.json", config.EXPORTS / "evaluation_pairs.json"
PRE_EV, PRE_PAIRS = config.EXPORTS / "evaluation_pre_route.json", config.EXPORTS / "evaluation_pairs_pre_route.json"
POST_PAIRS = config.EXPORTS / "evaluation_pairs_post_hoc.json"


def main() -> None:
    env.load()
    if not PRE_EV.exists():
        shutil.copy(EV, PRE_EV)
        shutil.copy(PAIRS, PRE_PAIRS)
    metrics.evaluate(LLM(), judge=True)
    post = json.loads(EV.read_text(encoding="utf-8"))
    shutil.copy(PAIRS, POST_PAIRS)
    pre_pairs = json.loads(PRE_PAIRS.read_text(encoding="utf-8"))
    post_pairs = json.loads(POST_PAIRS.read_text(encoding="utf-8"))
    # Restore the original evaluation, then add the post-hoc system beside it.
    shutil.copy(PRE_EV, EV)
    shutil.copy(PRE_PAIRS, PAIRS)
    ev = json.loads(EV.read_text(encoding="utf-8"))
    ev["systems"] = [s for s in ev["systems"] if not s.get("post_hoc")]
    hybrid = post["systems"][-1]
    n = len(post_pairs)
    k = sum(bool(p.get("judge_shown")) for p in post_pairs)
    lo, hi = wilson(k, n)
    recovered = sum(1 for a, b in zip(pre_pairs, post_pairs) if not a.get("judge_shown") and b.get("judge_shown"))
    lost = sum(1 for a, b in zip(pre_pairs, post_pairs) if a.get("judge_shown") and not b.get("judge_shown"))
    ev["systems"].append({
        "name": "Hybrid + report route + Nemotron Super judge",
        "description": "Adds a second candidate route: each later report's top 3 earlier reports by whole-report wording. Added after seeing the misses",
        "recall_at_threshold": k / n if n else None, "recall_at_5": hybrid.get("recall_at_5"),
        "shown_pairs": hybrid.get("shown_pairs"), "precision": None, "hits": k, "n": n,
        "recall_ci95": [round(lo, 3), round(hi, 3)], "post_hoc": True,
    })
    base = {s["name"]: s.get("recall_at_threshold") for s in post["systems"][:-1]}
    ev["post_hoc_note"] = (
        f"Post-hoc: the report route was added after seeing that most misses never reached the judge, so its result "
        f"is not an independent test. It finds {k} of {n} ({k / n:.0%}): {recovered} more than before, {lost} fewer. "
        f"It shows {hybrid.get('shown_pairs')} links; at that larger budget the baselines find "
        + ", ".join(f"{name.lower()} {v:.0%}" for name, v in base.items() if v is not None)
        + ". No other test set of coroner-acknowledged pairs exists, so it has not been validated on held-out pairs."
    )
    EV.write_text(json.dumps(ev, indent=1, ensure_ascii=False), encoding="utf-8")
    enrich()
    print(ev["post_hoc_note"])


if __name__ == "__main__":
    main()
