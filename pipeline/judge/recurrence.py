"""Stage C: recurrence judge with Nemotron Super (handoff section 9.7)."""
from __future__ import annotations

import json
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date, datetime, timezone

from pydantic import BaseModel, ValidationError

from .. import config, db
from ..extract.quotes import UNVERIFIED, check_quote
from ..llm import LLM, BudgetExceeded, RequestError, TransportError, confirm_full_run
from ..wording import is_clean

STAGE = "C"
PROMPT_VERSION = "c2"  # c2: clearer closely_related definition, shorter reasoning
CONTEXT_CHARS = 1800
RELATIONS = ["identical", "closely_related", "related", "different"]


class VerdictOut(BaseModel):
    relation: str
    same_hazard_explanation: str
    earlier_quote: str
    later_quote: str
    promise_quote: str | None = None
    later_after_promise: bool
    confidence: float


SCHEMA = {
    "type": "json_schema",
    "json_schema": {
        "name": "stage_c_verdict",
        "strict": True,
        "schema": {
            "type": "object",
            "properties": {
                "relation": {"type": "string", "enum": RELATIONS},
                "same_hazard_explanation": {"type": "string", "maxLength": 400},
                "earlier_quote": {"type": "string", "maxLength": 500},
                "later_quote": {"type": "string", "maxLength": 500},
                "promise_quote": {"type": ["string", "null"], "maxLength": 500},
                "later_after_promise": {"type": "boolean"},
                "confidence": {"type": "number"},
            },
            "required": ["relation", "same_hazard_explanation", "earlier_quote", "later_quote", "promise_quote",
                         "later_after_promise", "confidence"],
            "additionalProperties": False,
        },
    },
}

SYSTEM = (
    "You compare two coroners' Prevention of Future Deaths reports sent to the same organisation and decide whether "
    "the later report raises the same hazard as the earlier one. Output one compact JSON object on one line.\n"
    "relation:\n"
    "- identical: the same specific hazard and the same mechanism; in substance the same concern.\n"
    "- closely_related: the same specific hazard (the same product, procedure, equipment, type of location or failure "
    "point) where the channel, setting detail or emphasis differs. Example: no limit on buying a medicine in shops, "
    "then no limit on buying it online.\n"
    "- related: the same broad area (for example staffing, communication, training) but a different specific failure point.\n"
    "- different: not the same hazard.\n"
    "Shared generic words alone are not enough for identical or closely_related.\n"
    "same_hazard_explanation: two short neutral sentences describing what the two concerns share or how they differ. "
    "Never say an organisation ignored, caused, failed, neglected, faults or is responsible or to blame.\n"
    "earlier_quote and later_quote: copy one contiguous passage, 10 to 45 words, character for character from the "
    "EARLIER CONCERNS and LATER CONCERNS text respectively.\n"
    "promise_quote: copy, character for character, the one listed promised action most relevant to the hazard, or null.\n"
    "later_after_promise: true if the later report concerns events after the earlier promise was made.\n"
    "confidence: 0 to 1, your confidence in the relation label.\n"
    "Keep your reasoning short. Do not count words."
)


def _ctx(full: str, quote: str) -> str:
    full = full or ""
    if len(full) <= CONTEXT_CHARS:
        return full
    i = full.find((quote or "")[:60])
    if i < 0:
        return full[:CONTEXT_CHARS]
    start = max(0, i - CONTEXT_CHARS // 3)
    return full[start : start + CONTEXT_CHARS]


def pair_dict(conn, e_cid: int, l_cid: int, org_id: int | None, pair_id: int | None = None) -> dict:
    p = conn.execute(
        """SELECT ce.report_url AS e_url, ce.text_quote AS e_quote, ce.hazard AS e_hazard,
                  cl.report_url AS l_url, cl.text_quote AS l_quote, cl.hazard AS l_hazard,
                  re.report_date AS e_date, re.coroner AS e_coroner, re.area AS e_area, re.concerns AS e_concerns,
                  rl.report_date AS l_date, rl.coroner AS l_coroner, rl.area AS l_area, rl.concerns AS l_concerns
           FROM concerns ce, concerns cl JOIN reports re ON re.url = ce.report_url JOIN reports rl ON rl.url = cl.report_url
           WHERE ce.id=? AND cl.id=?""",
        (e_cid, l_cid),
    ).fetchone()
    d = dict(p)
    d.update({"id": pair_id, "earlier_concern_id": e_cid, "later_concern_id": l_cid, "organisation_id": org_id})
    o = conn.execute("SELECT canonical_name FROM organisations WHERE id=?", (org_id,)).fetchone()
    d["org"] = o[0] if o else "the organisation"
    d["promises"] = [dict(r) for r in conn.execute(
        """SELECT pr.id, pr.action_quote, pr.stated_date_or_deadline, pr.concern_id, rs.organisation_id
           FROM promises pr JOIN responses rs ON rs.id = pr.response_id
           WHERE rs.report_url=? AND pr.quote_verified > 0
           ORDER BY (rs.organisation_id IS ?) DESC, (pr.concern_id = ?) DESC, pr.id LIMIT 6""",
        (d["e_url"], org_id, e_cid),
    )]
    d["has_response"] = conn.execute(
        "SELECT COUNT(*) FROM responses WHERE report_url=? AND (organisation_id=? OR organisation_id IS NULL)",
        (d["e_url"], org_id),
    ).fetchone()[0] > 0
    return d


def load_pair(conn, pair_id: int, later_text_override: dict[str, str] | None = None) -> dict:
    p = conn.execute("SELECT earlier_concern_id, later_concern_id, organisation_id FROM candidate_pairs WHERE id=?",
                     (pair_id,)).fetchone()
    d = pair_dict(conn, p[0], p[1], p[2], pair_id)
    if later_text_override and d["l_url"] in later_text_override:
        d["l_concerns"] = later_text_override[d["l_url"]]
    return d


def build_messages(d: dict) -> list[dict]:
    prom = "\n".join(f"- \"{p['action_quote']}\" (timescale: {p['stated_date_or_deadline'] or 'not stated'})"
                     for p in d["promises"]) or "(no published promised action found)"
    user = (
        f"ORGANISATION: {d['org']}\n\n"
        f"EARLIER REPORT: dated {d['e_date']}, coroner {d['e_coroner']}, area {d['e_area']}\n"
        f"Earlier key concern: {d['e_quote']}\n"
        f"EARLIER CONCERNS:\n{_ctx(d['e_concerns'], d['e_quote'])}\n\n"
        f"PROMISED ACTIONS IN THE ORGANISATION'S RESPONSE:\n{prom}\n\n"
        f"LATER REPORT: dated {d['l_date']}, coroner {d['l_coroner']}, area {d['l_area']}\n"
        f"Later key concern: {d['l_quote']}\n"
        f"LATER CONCERNS:\n{_ctx(d['l_concerns'], d['l_quote'])}"
    )
    return [{"role": "system", "content": SYSTEM}, {"role": "user", "content": user}]


def judge_one(llm: LLM, d: dict, stage: str = STAGE) -> dict:
    out = {"pair_id": d["id"], "ok": False, "cost": 0.0, "error": None}
    msgs = build_messages(d)
    max_tokens = config.MAX_TOKENS["judge"]
    for attempt in (1, 2):
        try:
            r = llm.chat(stage, "super", msgs, max_tokens, response_format=SCHEMA, thinking=True, low_effort=True,
                         item_id=str(d["id"]))
        except (RequestError, TransportError) as e:
            out["error"] = f"{type(e).__name__}: {e}"
            return out
        out["cost"] += r.cost
        if r.finish_reason == "length" and attempt == 1:
            max_tokens = 2600  # changed before the single retry
            continue
        break
    try:
        v = VerdictOut.model_validate(r.parsed if isinstance(r.parsed, dict) else json.loads(r.content))
    except (ValidationError, ValueError, TypeError) as e:
        out["error"] = f"schema: {str(e)[:200]}"
        return out
    if v.relation not in RELATIONS:
        out["error"] = f"bad relation {v.relation}"
        return out
    e_status, e_q = check_quote(v.earlier_quote, d["e_concerns"] or "")
    l_status, l_q = check_quote(v.later_quote, d["l_concerns"] or "")
    p_status, p_q, p_id = UNVERIFIED, None, None
    if v.promise_quote:
        for p in d["promises"]:
            s, q = check_quote(v.promise_quote, p["action_quote"])
            if s != UNVERIFIED:
                p_status, p_q, p_id = s, p["action_quote"], p["id"]
                break
    after = None
    if p_id is not None:
        # Deterministic: a response is due 56 days after the report; later events must postdate it.
        after = int((date.fromisoformat(d["l_date"]) - date.fromisoformat(d["e_date"])).days > 56)
    explanation = v.same_hazard_explanation.strip()
    out.update({
        "ok": True, "relation": v.relation, "confidence": max(0.0, min(1.0, float(v.confidence))),
        "explanation": explanation if is_clean(explanation) else None,
        "earlier_quote": e_q if e_status else v.earlier_quote, "later_quote": l_q if l_status else v.later_quote,
        # A shown link needs verified quotes from both reports. The promise quote is optional:
        # if it does not verify it is simply not shown (p_q stays None), the link still can be.
        "promise_quote": p_q, "promise_id": p_id, "after_promise": after,
        "quotes_verified": int(bool(e_status and l_status)),
        "reasoning_summary": (r.reasoning or "")[:600] or None,
    })
    return out


def reverify(conn=None) -> dict:
    """Re-check stored verdict quotes against the report texts. No model calls."""
    own = conn is None
    conn = conn or db.connect()
    rows = conn.execute("SELECT pair_id, earlier_quote, later_quote, quotes_verified FROM recurrence_verdicts").fetchall()
    changed = 0
    for r in rows:
        d = pair_dict(conn, *conn.execute(
            "SELECT earlier_concern_id, later_concern_id, organisation_id FROM candidate_pairs WHERE id=?",
            (r["pair_id"],)).fetchone(), r["pair_id"])
        ok = int(bool(check_quote(r["earlier_quote"], d["e_concerns"] or "")[0]
                      and check_quote(r["later_quote"], d["l_concerns"] or "")[0]))
        if ok != r["quotes_verified"]:
            conn.execute("UPDATE recurrence_verdicts SET quotes_verified=? WHERE pair_id=?", (ok, r["pair_id"]))
            changed += 1
    conn.commit()
    if own:
        conn.close()
    return {"verdicts": len(rows), "changed": changed}


def save(conn, res: dict, model_id: str) -> None:
    conn.execute(
        """INSERT OR REPLACE INTO recurrence_verdicts (pair_id, relation, confidence, same_hazard_explanation,
               earlier_quote, later_quote, promise_quote, promise_id, after_promise, quotes_verified,
               reasoning_summary, model, cost, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        (res["pair_id"], res["relation"], res["confidence"], res["explanation"], res["earlier_quote"],
         res["later_quote"], res["promise_quote"], res["promise_id"], res["after_promise"], res["quotes_verified"],
         res["reasoning_summary"], model_id, res["cost"], datetime.now(timezone.utc).isoformat(timespec="seconds")),
    )


def mark(conn, pair_id: int, status: str, detail: str | None) -> None:
    conn.execute("INSERT OR REPLACE INTO stage_items VALUES (?,?,?,?,?)",
                 (STAGE, str(pair_id), status, detail, PROMPT_VERSION))


def pending_pairs(conn, ids: list[int] | None = None) -> list[int]:
    q = ("SELECT id FROM candidate_pairs WHERE CAST(id AS TEXT) NOT IN "
         "(SELECT item_id FROM stage_items WHERE stage='C' AND (status='ok' OR (status='failed' AND prompt_version=?)))")
    rows = [r[0] for r in conn.execute(q + " ORDER BY hybrid_score DESC", (PROMPT_VERSION,))]
    if ids is not None:
        s = set(ids)
        rows = [r for r in rows if r in s]
    return rows


def run(llm: LLM, pair_ids: list[int], threads: int = 8, later_text_override: dict[str, str] | None = None,
        write: bool = True, stage: str = STAGE) -> dict:
    conn = db.connect()
    agg = {"items": 0, "ok": 0, "failed": 0, "verified": 0, "cost": 0.0, "relations": {}, "errors": [],
           "budget_stopped": False, "results": []}
    data = [load_pair(conn, pid, later_text_override) for pid in pair_ids]
    model_id = config.MODELS["super"].id
    with ThreadPoolExecutor(max_workers=threads) as ex:
        futs = [ex.submit(judge_one, llm, d, stage) for d in data]
        for f in as_completed(futs):
            try:
                res = f.result()
            except BudgetExceeded as e:
                agg["errors"].append(f"BUDGET: {e}")
                agg["budget_stopped"] = True
                for o in futs:
                    o.cancel()
                continue
            agg["items"] += 1
            agg["cost"] += res["cost"]
            if res["ok"]:
                agg["ok"] += 1
                agg["verified"] += res["quotes_verified"]
                agg["relations"][res["relation"]] = agg["relations"].get(res["relation"], 0) + 1
                agg["results"].append(res)
                if write:
                    save(conn, res, model_id)
                    mark(conn, res["pair_id"], "ok", None)
            else:
                agg["failed"] += 1
                agg["errors"].append(f"{res['pair_id']}: {res['error']}")
                if write:
                    transient = (res["error"] or "").startswith("TransportError")
                    mark(conn, res["pair_id"], "transient" if transient else "failed", res["error"])
            if agg["items"] % 100 == 0:
                conn.commit()
                print(f"[C] {agg['items']}/{len(data)} cost=${agg['cost']:.4f} {agg['relations']}", flush=True)
    conn.commit()
    conn.close()
    agg["verify_rate"] = agg["verified"] / agg["ok"] if agg["ok"] else 0.0
    agg["cost_per_item"] = agg["cost"] / agg["items"] if agg["items"] else 0.0
    return agg


def full_run(llm: LLM, pair_ids: list[int], cost_per_item: float, confirm_spend: bool) -> dict:
    confirm_full_run(llm, STAGE, len(pair_ids), cost_per_item, confirm_spend)
    return run(llm, pair_ids)
