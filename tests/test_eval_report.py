"""The honest evaluation report: intervals and miss reasons (no model, no data files)."""
from pipeline.evaluate.report import miss_reason, wilson


def test_wilson_interval():
    lo, hi = wilson(15, 29)
    assert 0.33 < lo < 0.35 and 0.68 < hi < 0.70  # 15 of 29 is 52%, with a wide range on 29 pairs
    assert wilson(0, 0) == (0.0, 0.0)
    lo, hi = wilson(29, 29)
    assert hi == 1.0 and lo > 0.85


def test_miss_reasons_separate_candidate_gate_from_judge():
    assert miss_reason({"hybrid_candidate": False, "emb_rank": 7, "tfidf_rank": 2, "n_candidates": 586})[0] == "not_candidate"
    cat, why = miss_reason({"hybrid_candidate": True, "judge": {"relation": "related", "confidence": 0.8, "quotes_verified": 1}})
    assert cat == "judge_rejected" and "different hazard" in why
    assert miss_reason({"hybrid_candidate": True, "judge": {"relation": "identical", "confidence": 0.9, "quotes_verified": 0}})[0] == "quotes"
    assert miss_reason({"hybrid_candidate": True, "judge": {"error": "timeout"}})[0] == "judge_error"
