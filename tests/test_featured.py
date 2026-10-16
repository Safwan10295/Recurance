"""The featured-chain quality gate (no model calls, no database)."""
from pipeline.publish import featured


def link(rel="identical", conf=0.9, q=True):
    return {"relation": rel, "confidence": conf, "earlier_quote": "a" if q else "", "later_quote": "b"}


def detail(*links, slugs=("one", "two")):
    return {"links": list(links), "reports": [{"url": f"https://x/pfd/{s}/"} for s in slugs]}


SPEC = {"gate": {"min_confidence": 0.85, "relations": ["identical", "closely_related"]}}


def test_gate_passes_clear_chain():
    assert featured.gate(detail(link(), link("closely_related", 0.85)), SPEC) == []


def test_gate_rejects_weak_related_and_unquoted_links():
    reasons = featured.gate(detail(link(conf=0.8), link("related"), link(q=False)), SPEC)
    assert any("below 0.85" in r for r in reasons)
    assert any("not identical or closely related" in r for r in reasons)
    assert any("both quotes" in r for r in reasons)
    assert featured.gate(detail(), SPEC) == ["no shown links"]


def test_resolve_by_key_or_slugs():
    details = {"k1": detail(slugs=("a", "b", "c")), "k2": detail(slugs=("d", "e"))}
    chains = [{"key": "k1"}, {"key": "k2"}]
    assert featured.resolve({"key": "k2"}, chains, details) == "k2"
    assert featured.resolve({"key": "gone"}, chains, details) is None
    assert featured.resolve({"reports": ["a", "c", "z"]}, chains, details) == "k1"
    assert featured.resolve({"reports": ["d"]}, chains, details) is None  # one shared slug is not enough


def test_select_drops_excluded_and_failing(monkeypatch):
    spec = {**SPEC, "featured": [{"key": "good"}, {"key": "weak"}, {"key": "bad"}], "start_here": [{"key": "good"}],
            "exclude": [{"key": "bad", "reason": "quotes point in opposite directions"}]}
    monkeypatch.setattr(featured, "load", lambda: spec)
    details = {"good": detail(link()), "weak": detail(link(conf=0.7)), "bad": detail(link())}
    sel = featured.select([{"key": k} for k in details], details)
    assert sel["featured"] == ["good"] and sel["start_here"] == ["good"]
    assert sel["excluded"] == {"bad": "quotes point in opposite directions"}
    assert {r["key"]: r["passes"] for r in sel["report"] if r["section"] == "featured"} == {"good": True, "weak": False, "bad": False}
