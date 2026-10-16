"""Render docs/MORNING_REPORT.md from the ledger, pipeline state, evaluation and blocker notes."""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from pipeline import config, db  # noqa: E402
from pipeline.llm import Ledger  # noqa: E402

ROOT = config.ROOT
notes_file = ROOT / "docs" / "morning_notes.md"  # hand-written observations, merged in
st = json.loads((config.CACHE / "finish_state.json").read_text()) if (config.CACHE / "finish_state.json").exists() else {}
ev_p = config.EXPORTS / "evaluation.json"
ev = json.loads(ev_p.read_text(encoding="utf-8")) if ev_p.exists() else None
lg = Ledger()
by = lg.spend_by_stage()
total = sum(by.values())
conn = db.connect()


def q(sql, *a):
    return conn.execute(sql, a).fetchone()[0]


counts = {
    "reports": q("SELECT COUNT(*) FROM reports"),
    "unique": q("SELECT COUNT(*) FROM reports WHERE duplicate_of IS NULL"),
    "with_concerns": q("SELECT COUNT(DISTINCT report_url) FROM concerns"),
    "concerns": q("SELECT COUNT(*) FROM concerns"),
    "verified_concerns": q("SELECT COUNT(*) FROM concerns WHERE quote_verified>0"),
    "orgs": q("SELECT COUNT(DISTINCT organisation_id) FROM report_receivers"),
    "pairs": q("SELECT COUNT(*) FROM candidate_pairs"),
    "judged": q("SELECT COUNT(*) FROM recurrence_verdicts"),
    "responses": q("SELECT COUNT(*) FROM responses WHERE text IS NOT NULL"),
    "promises": q("SELECT COUNT(*) FROM promises WHERE quote_verified>0"),
    "chains": q("SELECT COUNT(*) FROM chains"),
    "dossiers": q("SELECT COUNT(*) FROM dossiers"),
    "approved": q("SELECT COUNT(*) FROM dossiers WHERE reviewed_by_human=1"),
    "followups": q("SELECT COUNT(*) FROM followups"),
}
rel = dict(conn.execute("SELECT relation, COUNT(*) FROM recurrence_verdicts GROUP BY 1").fetchall())
conn.close()

L = ["# Morning report", "", "Written for Pilot. Numbers below are generated from the ledger and database by scripts/write_morning_report.py.", ""]
L += ["## Spend", "", f"Total Token Factory spend: ${total:.4f} of the $20.00 pipeline hard stop. The $5 live reserve and the $9.50 margin are untouched.", "",
      "| Bucket | Spent | Cap | Remaining |", "|---|---|---|---|"]
for k, cap in config.STAGE_CAPS.items():
    s = by.get(k, 0.0)
    L.append(f"| {k} | ${s:.4f} | ${cap:.2f} | ${cap - s:.4f} |")
L += ["", f"Tavily credits used by Stage F: {lg.tavily_credits('F'):.0f} of its cap of {config.TAVILY_STAGE_F_CAP_CREDITS} (ledger count; D28). The live agent has its own allowance.", ""]
L += ["## What the pipeline produced", ""]
L += [f"1. Report pages parsed: {counts['reports']} ({counts['unique']} unique after removing republished copies).",
      f"2. Reports with extracted concerns: {counts['with_concerns']}. Concerns: {counts['concerns']}, of which {counts['verified_concerns']} have a verified quote.",
      f"3. Organisations after normalisation: {counts['orgs']}.",
      f"4. Candidate pairs: {counts['pairs']}. Judged by Nemotron Super: {counts['judged']} ({', '.join(f'{k} {v}' for k, v in sorted(rel.items(), key=lambda x: str(x[0])))}).",
      f"5. Response documents read: {counts['responses']}. Promises with verified quotes: {counts['promises']}.",
      f"6. Verified chains: {counts['chains']}. Dossiers drafted: {counts['dossiers']}, of which you have approved {counts['approved']}. Follow-up checks: {counts['followups']}.", ""]
diff = (counts["unique"] - config.EXPECTED_UNIQUE_REPORTS) / config.EXPECTED_UNIQUE_REPORTS
L += [f"Unique reports vs the expected 6,449: {counts['unique']} ({diff:+.1%}). The listing pages and sitemaps were cross-checked (docs/RESEARCH_LOG.md).", ""]
if ev:
    L += ["## Evaluation headline", ""]
    for s in ev["systems"]:
        r = s["recall_at_threshold"]
        L.append(f"- {s['name']}{' (post-hoc, D30)' if s.get('post_hoc') else ''}: blind-test recall {'pending' if r is None else f'{r:.0%}'}, links shown {s['shown_pairs']}.")
    L += [f"- Test set: {ev['acknowledged']['in_scope_6m']} coroner-acknowledged pairs (same organisation, six months or more apart).",
          f"- Precision: {ev['hand_labels']['status']}.", "", "Full detail: docs/EVALUATION.md.", ""]
if notes_file.exists():
    L += [notes_file.read_text(encoding="utf-8").strip(), ""]
blk = ROOT / "docs" / "BLOCKERS.md"
L += ["## Blockers", "", "See docs/BLOCKERS.md for each note in full." if blk.exists() else "None.", ""]
if blk.exists():
    L += ["- " + ln[3:] for ln in blk.read_text(encoding="utf-8").splitlines() if ln.startswith("## ")] + [""]
L += ["## Things only you can do", "",
      "Each step is written out in docs/SUBMISSION_CHECKLIST.md.", "",
      "1. Approve the featured dossiers that are waiting. Platform ends is among them again because its chain key changed when the second route added links.",
      "   - Run .venv\Scripts\python -m pipeline.cli dossiers-export.",
      "   - Read data/exports/dossiers_for_review.md.",
      "   - Run .venv\Scripts\python -m pipeline.cli review --featured. It offers the four waiting, platform ends first.",
      "2. Check the credit expiry date in the Token Factory console. It cannot be read from the API.",
      "3. Create the server (deploy/README.md) and a separate Token Factory key for it.",
      "4. Optional: label the 80 test pairs (.venv\Scripts\python -m pipeline.cli label) to fill in precision.",
      "5. Make the repo public when you submit. Its history was already purged; run the scan in the checklist first.",
      "6. Record the video from docs/VIDEO_SHOT_LIST.md and make it public on YouTube.",
      "7. Submit on Devpost with docs/DEVPOST_DRAFT.md and docs/FEEDBACK.md.",
      "8. After the hackathon, rotate the keys that were pasted into a chat.", ""]
(ROOT / "docs" / "MORNING_REPORT.md").write_text("\n".join(L) + "\n", encoding="utf-8")
print("wrote docs/MORNING_REPORT.md")
