"""The quality gate for what the site puts forward (featured.yaml).

A chain may be featured only if every one of its links is identical or closely related, at the gate's
confidence or above, with both quotes verified, and it is not on the exclusion list. Deterministic: no
model calls. The result is written for Pilot to review in docs/FEATURED.md.
"""
from __future__ import annotations

from pathlib import Path

import yaml

SPEC = Path(__file__).with_name("featured.yaml")


def load() -> dict:
    spec = yaml.safe_load(SPEC.read_text(encoding="utf-8")) if SPEC.exists() else {}
    if isinstance(spec, list):  # the earlier format: a plain list of featured entries
        spec = {"featured": spec}
    spec.setdefault("gate", {"min_confidence": 0.85, "relations": ["identical", "closely_related"]})
    for k in ("featured", "start_here", "exclude"):
        spec.setdefault(k, [])
    return spec


def resolve(entry: dict, chains: list[dict], details: dict[str, dict]) -> str | None:
    """A key, or the chain sharing the most of the listed report slugs (at least two)."""
    if entry.get("key"):
        return entry["key"] if entry["key"] in details else None
    want = set(entry.get("reports", []))
    best, score = None, 0
    for c in chains:
        slugs = {r["url"].rstrip("/").rsplit("/", 1)[-1] for r in details[c["key"]]["reports"]}
        s = len(want & slugs)
        if s > score:
            best, score = c, s
    return best["key"] if best and score >= 2 else None


def gate(detail: dict, spec: dict) -> list[str]:
    """Reasons a chain fails the gate; an empty list means it passes."""
    g = spec["gate"]
    reasons = []
    links = detail.get("links") or []
    if not links:
        reasons.append("no shown links")
    weak = [l for l in links if l["confidence"] < g["min_confidence"]]
    if weak:
        reasons.append(f"{len(weak)} of {len(links)} links below {g['min_confidence']:.2f} (lowest {min(l['confidence'] for l in weak):.2f})")
    other = [l for l in links if l["relation"] not in g["relations"]]
    if other:
        reasons.append(f"{len(other)} links not identical or closely related")
    if any(not (l.get("earlier_quote") and l.get("later_quote")) for l in links):
        reasons.append("a link without both quotes")
    return reasons


def select(chains: list[dict], details: dict[str, dict]) -> dict:
    """Featured and start-here keys that pass, the exclusion list, and a report of every decision."""
    spec = load()
    excluded = {}
    for e in spec["exclude"]:
        k = resolve(e, chains, details)
        if k:
            excluded[k] = e.get("reason", "")
    report, out = [], {"featured": [], "start_here": []}
    for section in ("featured", "start_here"):
        for e in spec[section]:
            k = resolve(e, chains, details)
            reasons = ["chain not found"] if not k else gate(details[k], spec)
            if k in excluded:
                reasons.append(f"excluded: {excluded[k]}")
            if k and not reasons and k not in out[section]:
                out[section].append(k)
            report.append({"section": section, "name": e.get("name", k), "key": k, "passes": not reasons, "reasons": reasons})
    return {**out, "excluded": excluded, "report": report, "gate": spec["gate"]}


def write_report(sel: dict, chains_by_key: dict[str, dict], path: Path) -> None:
    g = sel["gate"]
    lines = [
        "# Featured chains",
        "",
        "Written by python -m pipeline.cli featured-report from pipeline/publish/featured.yaml. Edit that file to change what is featured, then publish.",
        "",
        f"The gate: every link identical or closely related, every link at {g['min_confidence']:.2f} or above, both quotes verified, and not on the exclusion list.",
        "",
    ]
    for section, title in (("featured", "Home page: Featured recurrences (the first is the See a recurrence button)"), ("start_here", "Chains page: Start here")):
        lines += [f"## {title}", ""]
        for r in [x for x in sel["report"] if x["section"] == section]:
            c = chains_by_key.get(r["key"] or "", {})
            facts = f"{c.get('org', {}).get('name', '')}, {c.get('n_reports', '?')} reports, lowest link {c.get('confidence', 0):.2f}" if c else "not found"
            status = "shown" if r["passes"] else "not shown: " + "; ".join(r["reasons"])
            lines.append(f"- {r['name']} ({r['key']}): {facts}. {status}.")
        lines.append("")
    lines += ["## Never featured", ""]
    for k, why in sel["excluded"].items():
        c = chains_by_key.get(k, {})
        lines.append(f"- {c.get('hazard', k)} ({k}, {c.get('org', {}).get('name', '')}): {why}")
    lines += ["", "Latest recurrences on the home page show only links at the gate's confidence or above, from chains not on this list.", ""]
    path.write_text("\n".join(lines), encoding="utf-8")
