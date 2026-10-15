"""Human review of Stage D dossiers. Only a person typing "approve" sets reviewed_by_human.

export_markdown(): write every dossier to data/exports/dossiers_for_review.md for reading.
interactive(): show each unreviewed dossier and ask approve / reject / skip.
"""
from __future__ import annotations

import json
import textwrap

from .. import config, db

OUT = config.EXPORTS / "dossiers_for_review.md"


def _render(conn, row) -> str:
    d = json.loads(row["ultra_output"])
    ch = conn.execute(
        "SELECT c.hazard_label, o.canonical_name FROM chains c LEFT JOIN organisations o ON o.id=c.organisation_id "
        "WHERE c.chain_key=?", (row["chain_key"],)).fetchone()
    lines = [f"## {ch[0] if ch else row['chain_key']} ({ch[1] if ch else ''})", "",
             f"Chain key: {row['chain_key']}. Reviewed: {'yes' if row['reviewed_by_human'] else 'no'}.", "",
             "### Narrative", "", d.get("narrative", ""), "", "### Timeline", ""]
    for t in d.get("timeline", []):
        q = f' Quote: "{t["quote"]}"' if t.get("quote") else ""
        lines.append(f"- {t['date']} ({t['event']}): {t['summary']}{q} [{t.get('source_url') or t.get('source_ref')}]")
    lines += ["", "### Questions a coroner might ask", ""]
    lines += [f"- {q}" for q in d.get("questions", [])]
    if d.get("wording_flags"):
        lines += ["", f"Wording flags to check: {', '.join(d['wording_flags'])}"]
    return "\n".join(lines) + "\n"


def export_markdown() -> str:
    conn = db.connect()
    rows = conn.execute("SELECT * FROM dossiers ORDER BY created_at").fetchall()
    parts = ["# Dossiers for review", "",
             "Read each one against the linked sources. Approve only if every statement is supported and neutral.", ""]
    parts += [_render(conn, r) for r in rows]
    conn.close()
    OUT.write_text("\n".join(parts), encoding="utf-8")
    return f"wrote {len(rows)} dossiers to {OUT}"


def interactive() -> None:
    conn = db.connect()
    rows = conn.execute("SELECT * FROM dossiers WHERE reviewed_by_human = 0 ORDER BY created_at").fetchall()
    print(f"{len(rows)} dossiers awaiting review.")
    for r in rows:
        print("\n" + "=" * 78)
        print(textwrap.indent(_render(conn, r), "  "))
        ans = input('Type "approve" to publish, "reject" to keep hidden, Enter to skip, q to quit: ').strip().lower()
        if ans == "q":
            break
        if ans == "approve":
            conn.execute("UPDATE dossiers SET reviewed_by_human = 1 WHERE chain_key = ?", (r["chain_key"],))
            conn.commit()
            print("approved")
        elif ans == "reject":
            conn.execute("UPDATE dossiers SET reviewed_by_human = 0 WHERE chain_key = ?", (r["chain_key"],))
            conn.commit()
            print("kept hidden")
    conn.close()
    print("Run python -m pipeline.cli export to update the site.")
