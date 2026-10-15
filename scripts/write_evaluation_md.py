"""Render docs/EVALUATION.md from data/exports/evaluation.json. Numbers are never typed by hand."""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ev = json.loads((ROOT / "data" / "exports" / "evaluation.json").read_text(encoding="utf-8"))
pairs_p = ROOT / "data" / "exports" / "evaluation_pairs.json"
pairs = json.loads(pairs_p.read_text(encoding="utf-8")) if pairs_p.exists() else []


def pct(x):
    return "pending" if x is None else f"{x * 100:.0f}%"


a = ev["acknowledged"]
lm = ev["lost_memory"]
cost = ev["cost"]
lines = [
    "# Evaluation",
    "",
    f"Generated {ev['generated_at']} by scripts/write_evaluation_md.py from data/exports/evaluation.json.",
    "",
    "## Test set",
    "",
    "1. A later report acknowledges an earlier one when its own text names the earlier report's reference number or the earlier deceased person's full name. No labels were invented.",
    f"2. Pairs found: {a['total']}. Sharing an organisation: {a['in_scope']}. Of those, at least six months apart: {a['in_scope_6m']}. Evaluated (both reports have extracted concerns): {a.get('evaluated', 'n/a')}.",
    f"3. Evidence types: {', '.join(f'{k} {v}' for k, v in a.get('by_evidence', {}).items()) or 'none'}.",
    "4. Blind test: every sentence of the later report that carries the acknowledgement was removed before scoring and before judging.",
    "",
    "## Systems compared",
    "",
    "Each baseline is cut at the number of links the hybrid + Nemotron system shows across the whole corpus, so all three show the same number of links.",
    "",
    "| System | Recall on the blind test | Earlier report in the top 5 | Links shown | Precision |",
    "|---|---|---|---|---|",
]
for s in ev["systems"]:
    lines.append(f"| {s['name']} | {pct(s['recall_at_threshold'])} | {pct(s['recall_at_5'])} | {s['shown_pairs']} | {pct(s['precision'])} |")
lines += [
    "",
    f"Thresholds used: TF-IDF {ev['thresholds']['tfidf_equal_budget']:.3f}, embedding {ev['thresholds']['embedding_equal_budget']:.3f}.",
    "",
    "For the hybrid system, the top-5 column means the pair passed the candidate rule and reached the judge.",
    "",
    "## Precision",
    "",
    f"Status: {ev['hand_labels']['status']}. Labelled pairs: {ev['hand_labels']['n_labelled']}.",
    "",
    "1. Pilot labels the 80 pairs in data/exports/hand_labels.csv with python -m pipeline.cli label.",
    "2. Then python -m pipeline.cli evaluate recomputes everything. The judge calls are answered from the cache, so it costs nothing.",
    "3. Then python scripts/write_evaluation_md.py and python -m pipeline.cli export refresh this file and the site.",
    "",
    "## Lost memory among shown links",
    "",
    f"1. Links shown: {lm['links']}.",
    f"2. Later report from a different coroner: {pct(lm['diff_coroner'])}.",
    f"3. From a different coroner area: {pct(lm['diff_area'])}.",
    f"4. Later report does not cite the earlier one: {pct(lm['not_cited'])}.",
    f"5. All three at once: {pct(lm['all_three'])}.",
    "",
    "## Cost",
    "",
    f"1. Total Token Factory spend so far: ${cost['total']:.4f}.",
    f"2. Analysis cost (development, embeddings, Stages A to C): ${cost['analysis_cost']:.4f}.",
    f"3. Verified chains: {cost['chains']}. Cost per verified chain: " + (f"${cost['per_chain']:.4f}." if cost['per_chain'] is not None else "n/a."),
    "4. By stage: " + ", ".join(f"{k} ${v:.4f}" for k, v in sorted(cost["by_stage"].items())) + ".",
    "",
    "## Weak spots",
    "",
    "1. The acknowledged test set is small and skewed towards coroners who write cross-references, so recall on it may not match recall on silent recurrences.",
    "2. Many acknowledged pairs are under six months apart and fall outside the six-month rule from the handoff.",
    "3. Precision is pending hand labels, so the share of shown links that a person would accept is not yet measured.",
    "4. Linking is within one organisation, so recurrences after renames or across different bodies are missed unless a rename is known.",
]
for i, n in enumerate(ev.get("notes", []), 5):
    lines.append(f"{i}. {n}")
if pairs:
    missed = [p for p in pairs if not p.get("skipped") and not p.get("judge_shown")]
    lines += ["", "## Acknowledged pairs the full system did not show", ""]
    for p in missed[:15]:
        j = p.get("judge") or {}
        lines.append(f"- {p['earlier_url']} -> {p['later_url']}: TF-IDF rank {p.get('tfidf_rank')}, embedding rank {p.get('emb_rank')}, "
                     f"judge {j.get('relation', 'not judged')} {j.get('confidence', '')}")
(ROOT / "docs" / "EVALUATION.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
print("wrote docs/EVALUATION.md")
