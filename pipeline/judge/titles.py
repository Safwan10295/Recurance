"""Short, neutral display titles for chains (Nano), cached by chain contents.

The chain's stored hazard label is the earliest concern's fragment, which can miss what the chain
is about. Nano writes a title of at most 9 words from the chain's hazards and the judge's
explanations. Titles pass the wording check and contain no personal names; otherwise the hazard
label is kept. A title is regenerated only when the chain's links change.
"""
from __future__ import annotations

import hashlib
import json
from concurrent.futures import ThreadPoolExecutor

from .. import db
from ..llm import LLM, BudgetExceeded, RequestError, TransportError
from ..wording import is_clean

STAGE = "dev"

SCHEMA = {
    "type": "json_schema",
    "json_schema": {
        "name": "chain_title",
        "strict": True,
        "schema": {
            "type": "object",
            "properties": {"title": {"type": "string", "maxLength": 80}},
            "required": ["title"],
            "additionalProperties": False,
        },
    },
}

SYSTEM = (
    "Write a short title for a recurring safety hazard raised in several coroners' reports to one organisation. "
    "Output compact JSON. The title: at most 9 words, sentence case, names the specific hazard (what goes wrong "
    "and where), neutral, no blame, no people's names, no organisation name, no dates, no full stop."
)


def ensure_table(conn) -> None:
    conn.execute("CREATE TABLE IF NOT EXISTS chain_titles (chain_key TEXT PRIMARY KEY, content_hash TEXT NOT NULL, title TEXT NOT NULL)")


def _inputs(conn, chain_id: int) -> tuple[str, dict]:
    rows = conn.execute(
        """SELECT p.id, ce.hazard eh, cl.hazard lh, v.same_hazard_explanation ex FROM chain_members m
           JOIN candidate_pairs p ON p.id=m.pair_id JOIN recurrence_verdicts v ON v.pair_id=p.id
           JOIN concerns ce ON ce.id=p.earlier_concern_id JOIN concerns cl ON cl.id=p.later_concern_id
           WHERE m.chain_id=? ORDER BY v.confidence DESC""", (chain_id,)).fetchall()
    h = hashlib.sha1(",".join(str(r["id"]) for r in sorted(rows, key=lambda r: r["id"])).encode()).hexdigest()
    hazards = list(dict.fromkeys([r["eh"] for r in rows] + [r["lh"] for r in rows]))[:6]
    return h, {"hazards": hazards, "explanations": [r["ex"] for r in rows[:2] if r["ex"]]}


def generate(llm: LLM, limit: int | None = None, threads: int = 6) -> dict:
    conn = db.connect()
    ensure_table(conn)
    have = {r[0]: r[1] for r in conn.execute("SELECT chain_key, content_hash FROM chain_titles")}
    todo = []
    for ch in conn.execute("SELECT id, chain_key FROM chains").fetchall():
        h, inp = _inputs(conn, ch["id"])
        if have.get(ch["chain_key"]) != h:
            todo.append((ch["chain_key"], h, inp))
    todo = todo[:limit] if limit else todo

    def one(item):
        key, h, inp = item
        user = "HAZARDS:\n- " + "\n- ".join(inp["hazards"]) + "\n\nHOW THE REPORTS MATCH:\n" + "\n".join(inp["explanations"])
        try:
            r = llm.chat(STAGE, "nano", [{"role": "system", "content": SYSTEM}, {"role": "user", "content": user}],
                         60, response_format=SCHEMA, item_id=f"title:{key}")
        except (RequestError, TransportError):
            return key, h, None, 0.0
        t = ((r.parsed or {}).get("title") or "").strip().rstrip(".")
        ok = 3 <= len(t.split()) <= 12 and is_clean(t)
        return key, h, (t[0].upper() + t[1:]) if ok else None, r.cost

    done, cost = 0, 0.0
    try:
        with ThreadPoolExecutor(max_workers=threads) as ex:
            for key, h, title, c in ex.map(one, todo):
                cost += c
                if title:
                    conn.execute("INSERT OR REPLACE INTO chain_titles VALUES (?,?,?)", (key, h, title))
                    done += 1
    except BudgetExceeded as e:
        conn.commit()
        conn.close()
        return {"todo": len(todo), "written": done, "cost": cost, "stopped": str(e)}
    conn.commit()
    conn.close()
    return {"todo": len(todo), "written": done, "cost": round(cost, 5)}


def title_for(conn, chain_key: str) -> str | None:
    try:
        r = conn.execute("SELECT title FROM chain_titles WHERE chain_key=?", (chain_key,)).fetchone()
    except Exception:
        return None
    return r[0] if r else None
