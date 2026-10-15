"""Stage D: flagship dossiers with Nemotron Ultra (handoff section 9.10).

Every dossier is stored with reviewed_by_human = 0. Only a person may change it
(pipeline/cli.py has no command that sets it). Unreviewed dossiers never display.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone

from pydantic import BaseModel, ValidationError

from .. import config, db
from ..extract.quotes import UNVERIFIED, check_quote
from ..llm import LLM, BudgetExceeded, RequestError, TransportError
from ..wording import violations

STAGE = "D"
MAX_CHAINS = 25


class TimelineItem(BaseModel):
    date: str
    event: str
    summary: str
    quote: str | None = None
    source_ref: str


class DossierOut(BaseModel):
    timeline: list[TimelineItem]
    narrative: str
    questions: list[str]


SCHEMA = {
    "type": "json_schema",
    "json_schema": {
        "name": "stage_d_dossier",
        "strict": True,
        "schema": {
            "type": "object",
            "properties": {
                "timeline": {
                    "type": "array",
                    "maxItems": 30,
                    "items": {
                        "type": "object",
                        "properties": {
                            "date": {"type": "string"},
                            "event": {"type": "string", "enum": ["warning", "response", "promise", "recurrence", "followup"]},
                            "summary": {"type": "string", "maxLength": 300},
                            "quote": {"type": ["string", "null"], "maxLength": 500},
                            "source_ref": {"type": "string", "maxLength": 8},
                        },
                        "required": ["date", "event", "summary", "quote", "source_ref"],
                        "additionalProperties": False,
                    },
                },
                "narrative": {"type": "string", "maxLength": 1500},
                "questions": {"type": "array", "maxItems": 6, "items": {"type": "string", "maxLength": 300}},
            },
            "required": ["timeline", "narrative", "questions"],
            "additionalProperties": False,
        },
    },
}

SYSTEM = (
    "You write a neutral, cited dossier about one recurring hazard in coroners' Prevention of Future Deaths reports "
    "sent to one organisation. Readers are coroners, lawyers, families and safety teams. Output one compact JSON object.\n"
    "Rules:\n"
    "1. timeline: every report, response, promised action and follow-up finding given, in date order. Each item has "
    "event (warning for the first report, recurrence for later reports, response, promise, followup), a one-sentence "
    "neutral summary, an optional quote copied character for character from the given SOURCE text, and source_ref "
    "set to the S-number of the source.\n"
    "2. narrative: at most 180 words, plain and neutral. Describe what was raised, what was promised and what was "
    "raised again. Use phrases like 'a similar concern was raised again' or 'no published response was found'.\n"
    "3. Never write that an organisation ignored, caused, failed, neglected, is responsible or is to blame. "
    "Do not speculate about why. Do not add facts that are not in the sources.\n"
    "4. Do not name clinicians, staff or family members. Refer to the deceased only by the report title.\n"
    "5. questions: 3 to 6 neutral questions a coroner might ask at a future inquest about this hazard."
)


def chain_sources(conn, chain_key: str) -> tuple[dict, list[dict]]:
    ch = dict(conn.execute(
        "SELECT c.*, o.canonical_name AS org FROM chains c LEFT JOIN organisations o ON o.id=c.organisation_id "
        "WHERE c.chain_key=?", (chain_key,)).fetchone())
    pairs = conn.execute(
        """SELECT v.*, ce.report_url AS e_url, cl.report_url AS l_url FROM chain_members m
           JOIN recurrence_verdicts v ON v.pair_id = m.pair_id JOIN candidate_pairs p ON p.id = m.pair_id
           JOIN concerns ce ON ce.id = p.earlier_concern_id JOIN concerns cl ON cl.id = p.later_concern_id
           WHERE m.chain_id = ?""", (ch["id"],)).fetchall()
    urls = sorted({p["e_url"] for p in pairs} | {p["l_url"] for p in pairs})
    sources: list[dict] = []
    for u in urls:
        r = conn.execute("SELECT url, title, report_date, coroner, area, concerns FROM reports WHERE url=?", (u,)).fetchone()
        sources.append({"kind": "report", "url": u, "date": r["report_date"],
                        "label": f"Report '{r['title']}', coroner {r['coroner']}, {r['area']}",
                        "text": (r["concerns"] or "")[:2500]})
        for pr in conn.execute(
            """SELECT pr.*, rs.pdf_url FROM promises pr JOIN responses rs ON rs.id = pr.response_id
               WHERE rs.report_url=? AND pr.quote_verified > 0 AND (rs.organisation_id = ? OR rs.organisation_id IS NULL)""",
            (u, ch["organisation_id"])):
            sources.append({"kind": "promise", "url": pr["pdf_url"], "date": r["report_date"],
                            "label": f"Response to '{r['title']}' (timescale: {pr['stated_date_or_deadline'] or 'not stated'})",
                            "text": pr["action_quote"], "promise_id": pr["id"]})
            for fu in conn.execute("SELECT * FROM followups WHERE promise_id=?", (pr["id"],)):
                for s in json.loads(fu["sources"] or "[]")[:3]:
                    sources.append({"kind": "followup", "url": s.get("url"), "date": s.get("date") or "",
                                    "label": f"Follow-up source: {s.get('title', '')} ({fu['classification']})",
                                    "text": s.get("quote") or ""})
        if not conn.execute("SELECT 1 FROM responses WHERE report_url=? AND (organisation_id=? OR organisation_id IS NULL)",
                            (u, ch["organisation_id"])).fetchone():
            sources.append({"kind": "no_response", "url": u, "date": r["report_date"],
                            "label": f"No published response from {ch['org']} found for '{r['title']}'", "text": ""})
    for i, s in enumerate(sources, 1):
        s["ref"] = f"S{i}"
    return ch, sources


def build_messages(ch: dict, sources: list[dict]) -> list[dict]:
    parts = [f"ORGANISATION: {ch['org']}\nHAZARD: {ch['hazard_label']}\n"]
    for s in sources:
        parts.append(f"[{s['ref']}] {s['kind'].upper()} {s['date']}: {s['label']}\nSOURCE TEXT: {s['text']}\n")
    return [{"role": "system", "content": SYSTEM}, {"role": "user", "content": "\n".join(parts)}]


def write_dossier(llm: LLM, chain_key: str) -> dict:
    conn = db.connect()
    ch, sources = chain_sources(conn, chain_key)
    msgs = build_messages(ch, sources)
    try:
        r = llm.chat(STAGE, "ultra", msgs, config.MAX_TOKENS["dossier"], response_format=SCHEMA, item_id=chain_key)
    except (RequestError, TransportError) as e:
        conn.close()
        return {"chain_key": chain_key, "ok": False, "error": str(e)}
    try:
        d = DossierOut.model_validate(r.parsed if isinstance(r.parsed, dict) else json.loads(r.content))
    except (ValidationError, ValueError, TypeError) as e:
        conn.close()
        return {"chain_key": chain_key, "ok": False, "error": f"schema: {e}", "cost": r.cost}
    by_ref = {s["ref"]: s for s in sources}
    timeline = []
    for t in d.timeline:
        s = by_ref.get(t.source_ref)
        item = {"date": t.date, "event": t.event, "summary": t.summary, "source_ref": t.source_ref,
                "source_url": s["url"] if s else None, "quote": None, "quote_verified": 0}
        if t.quote and s and s["text"]:
            st, q = check_quote(t.quote, s["text"])
            if st != UNVERIFIED:
                item["quote"], item["quote_verified"] = q, st
        timeline.append(item)
    flags = violations(d.narrative) + [v for q in d.questions for v in violations(q)] + \
        [v for t in timeline for v in violations(t["summary"])]
    output = {"timeline": timeline, "narrative": d.narrative, "questions": d.questions, "wording_flags": flags,
              "sources": [{k: s[k] for k in ("ref", "kind", "url", "date", "label")} for s in sources]}
    conn.execute(
        "INSERT INTO dossiers (chain_key, ultra_output, cost, reviewed_by_human, created_at) VALUES (?,?,?,0,?) "
        "ON CONFLICT(chain_key) DO UPDATE SET ultra_output=excluded.ultra_output, cost=excluded.cost, "
        "reviewed_by_human=0, created_at=excluded.created_at",
        (chain_key, json.dumps(output, ensure_ascii=False), r.cost, datetime.now(timezone.utc).isoformat(timespec="seconds")),
    )
    conn.commit()
    conn.close()
    return {"chain_key": chain_key, "ok": True, "cost": r.cost, "flags": flags}


def select_flagship(conn, n: int = MAX_CHAINS) -> list[str]:
    """Strongest chains first: more reports, identical relation, higher confidence, different coroners."""
    rows = conn.execute(
        """SELECT c.chain_key, c.n_reports, c.relation, c.min_confidence,
                  (SELECT COUNT(DISTINCT r.coroner) FROM chain_members m JOIN candidate_pairs p ON p.id=m.pair_id
                   JOIN concerns cc ON cc.id IN (p.earlier_concern_id, p.later_concern_id)
                   JOIN reports r ON r.url = cc.report_url WHERE m.chain_id = c.id) AS coroners
           FROM chains c"""
    ).fetchall()
    rows = sorted(rows, key=lambda r: (-(r["n_reports"] or 0), r["relation"] != "identical", -(r["coroners"] or 0),
                                       -(r["min_confidence"] or 0)))
    return [r["chain_key"] for r in rows[:n]]


def run(llm: LLM, chain_keys: list[str]) -> dict:
    chain_keys = chain_keys[:MAX_CHAINS]
    agg = {"items": 0, "ok": 0, "cost": 0.0, "errors": [], "flagged": 0}
    for k in chain_keys:
        try:
            res = write_dossier(llm, k)
        except BudgetExceeded as e:
            agg["errors"].append(f"BUDGET: {e}")
            break
        agg["items"] += 1
        agg["cost"] += res.get("cost", 0.0)
        if res["ok"]:
            agg["ok"] += 1
            agg["flagged"] += bool(res["flags"])
        else:
            agg["errors"].append(f"{k}: {res['error']}")
    return agg
