"""Stage A: atomic concern extraction with Nemotron Nano (handoff section 9.4)."""
from __future__ import annotations

import json
import random
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, field

from pydantic import BaseModel, Field, ValidationError

from .. import config, db
from ..llm import LLM, BudgetExceeded, RequestError, TransportError, confirm_full_run
from .quotes import UNVERIFIED, check_quote_any

STAGE = "A"
PROMPT_VERSION = "a2"  # a2: bounded schema (maxItems/maxLength) stops Nano repetition loops
MAX_CONCERNS_CHARS = 7000
MAX_CIRC_CHARS = 900
PEOPLE_ROLES = ["deceased", "family", "staff", "coroner", "other"]


class ConcernOut(BaseModel):
    quote: str
    hazard: str
    mechanism: str
    setting: str
    addressed_to: list[str] = Field(default_factory=list)


class PersonOut(BaseModel):
    name: str
    role: str


class StageAOut(BaseModel):
    concerns: list[ConcernOut]
    people: list[PersonOut] = Field(default_factory=list)


SCHEMA = {
    "type": "json_schema",
    "json_schema": {
        "name": "stage_a_concerns_v2",
        "strict": True,
        "schema": {
            "type": "object",
            "properties": {
                "concerns": {
                    "type": "array",
                    "maxItems": 6,
                    "items": {
                        "type": "object",
                        "properties": {
                            "quote": {"type": "string", "maxLength": 500},
                            "hazard": {"type": "string", "maxLength": 120},
                            "mechanism": {"type": "string", "maxLength": 200},
                            "setting": {"type": "string", "maxLength": 80},
                            "addressed_to": {"type": "array", "maxItems": 3, "items": {"type": "string", "maxLength": 120}},
                        },
                        "required": ["quote", "hazard", "mechanism", "setting", "addressed_to"],
                        "additionalProperties": False,
                    },
                },
                "people": {
                    "type": "array",
                    "maxItems": 12,
                    "items": {
                        "type": "object",
                        "properties": {
                            "name": {"type": "string", "maxLength": 80},
                            "role": {"type": "string", "enum": PEOPLE_ROLES},
                        },
                        "required": ["name", "role"],
                        "additionalProperties": False,
                    },
                },
            },
            "required": ["concerns", "people"],
            "additionalProperties": False,
        },
    },
}

SYSTEM = (
    "You extract the separate concerns from the CONCERNS section of a coroner's Prevention of Future "
    "Deaths report. Output one compact JSON object on a single line, no spaces between tokens, no newlines.\n"
    "Rules:\n"
    "1. One item per distinct concern (usually 1 to 6). Merge sentences that describe the same concern.\n"
    "2. quote: copy ONE contiguous passage from the CONCERNS text character for character, 10 to 45 words, "
    "the passage that best states that concern. Do not paraphrase, shorten, fix typos or join separate passages.\n"
    "3. hazard: neutral noun phrase of at most 12 words naming the risk, e.g. 'stopped vehicles in live lane "
    "without hard shoulder'. mechanism: at most 18 words on how harm happens. setting: at most 6 words.\n"
    "4. addressed_to: organisation names exactly as written in the text if the concern names who should act, else [].\n"
    "5. people: every personal name that appears in the given text, with role deceased, family, staff "
    "(clinicians, officers, employees, witnesses), coroner or other. Use [] if none.\n"
    "6. Neutral wording only. Do not judge blame."
)


def build_messages(concerns: str, circumstances: str, receivers: str | None) -> list[dict]:
    user = (
        f"REPORT SENT TO: {receivers or 'not stated'}\n\n"
        f"CIRCUMSTANCES (excerpt, context only):\n{(circumstances or '')[:MAX_CIRC_CHARS]}\n\n"
        f"CONCERNS:\n{concerns[:MAX_CONCERNS_CHARS]}"
    )
    return [{"role": "system", "content": SYSTEM}, {"role": "user", "content": user}]


@dataclass
class ItemResult:
    url: str
    ok: bool
    concerns: list[dict] = field(default_factory=list)
    people: list[dict] = field(default_factory=list)
    n_quotes: int = 0
    n_verified: int = 0
    n_snapped: int = 0
    cost: float = 0.0
    error: str | None = None
    truncated_retry: bool = False


def extract_one(llm: LLM, row, stage: str = STAGE) -> ItemResult:
    url = row["url"]
    concerns_text = row["concerns"] or ""
    msgs = build_messages(concerns_text, row["circumstances"] or "", row["receivers_raw"])
    res = ItemResult(url=url, ok=False)
    max_tokens = config.MAX_TOKENS["extract"]
    for attempt in (1, 2):
        try:
            r = llm.chat(stage, "nano", msgs, max_tokens, response_format=SCHEMA, item_id=url)
        except (RequestError, TransportError) as e:
            res.error = f"{type(e).__name__}: {e}"
            return res
        res.cost += r.cost
        if r.finish_reason == "length" and attempt == 1:
            # Changing something before the one retry: more output room.
            max_tokens = 1400
            res.truncated_retry = True
            continue
        try:
            out = StageAOut.model_validate(r.parsed if isinstance(r.parsed, dict) else json.loads(r.content))
        except (ValidationError, ValueError, TypeError) as e:
            res.error = f"schema: {str(e)[:200]}"
            return res
        break
    else:
        res.error = "truncated twice"
        return res
    source = concerns_text[:MAX_CONCERNS_CHARS]
    seen: set[str] = set()
    uniq = []
    for c in out.concerns:
        k = c.quote.strip().lower()
        if k and k not in seen:
            seen.add(k)
            uniq.append(c)
    circ = (row["circumstances"] or "")[:MAX_CIRC_CHARS]
    for i, c in enumerate(uniq):
        # Quotes from the circumstances excerpt are still the report's own words.
        status, q = check_quote_any(c.quote, source, circ)
        res.n_quotes += 1
        if status != UNVERIFIED:
            res.n_verified += 1
            res.n_snapped += status == 2
        res.concerns.append({
            "idx": i, "quote": q if status != UNVERIFIED else c.quote, "verified": status,
            "hazard": c.hazard.strip()[:200], "mechanism": c.mechanism.strip()[:300],
            "setting": c.setting.strip()[:120], "addressed_to": c.addressed_to[:10],
        })
    res.people = [{"name": p.name.strip(), "role": p.role} for p in out.people if p.name.strip()]
    res.ok = True
    return res


def save(conn, res: ItemResult) -> None:
    conn.execute("DELETE FROM concerns WHERE report_url=?", (res.url,))
    for c in res.concerns:
        conn.execute(
            "INSERT INTO concerns (report_url, idx, text_quote, hazard, mechanism, setting, addressed_to, quote_verified) "
            "VALUES (?,?,?,?,?,?,?,?)",
            (res.url, c["idx"], c["quote"], c["hazard"], c["mechanism"], c["setting"],
             json.dumps(c["addressed_to"]), c["verified"]),
        )
    for p in res.people:
        conn.execute("INSERT OR IGNORE INTO people_mentions VALUES (?,?,?)", (res.url, p["name"], p["role"]))


def reverify(conn=None) -> dict:
    """Re-check unverified stored quotes with the current checker. No model calls."""
    own = conn is None
    conn = conn or db.connect()
    rows = conn.execute(
        """SELECT c.id, c.text_quote, r.concerns, r.circumstances FROM concerns c
           JOIN reports r ON r.url = c.report_url WHERE c.quote_verified = 0"""
    ).fetchall()
    fixed = 0
    for r in rows:
        st, q = check_quote_any(r["text_quote"], (r["concerns"] or "")[:MAX_CONCERNS_CHARS],
                                (r["circumstances"] or "")[:MAX_CIRC_CHARS])
        if st != UNVERIFIED:
            conn.execute("UPDATE concerns SET text_quote=?, quote_verified=? WHERE id=?", (q, st, r["id"]))
            fixed += 1
    conn.commit()
    total = conn.execute("SELECT COUNT(*), SUM(quote_verified>0) FROM concerns").fetchone()
    if own:
        conn.close()
    return {"rechecked": len(rows), "fixed": fixed, "concerns": total[0], "verified": total[1]}


def mark(conn, item_id: str, status: str, detail: str | None) -> None:
    conn.execute("INSERT OR REPLACE INTO stage_items VALUES (?,?,?,?,?)",
                 (STAGE, item_id, status, detail, PROMPT_VERSION))


def eligible(conn, only_missing: bool = True) -> list:
    q = ("SELECT url, concerns, circumstances, receivers_raw FROM reports "
         "WHERE duplicate_of IS NULL AND concerns IS NOT NULL AND length(concerns) >= 40")
    if only_missing:
        q += (" AND url NOT IN (SELECT item_id FROM stage_items WHERE stage='A' AND "
              "(status='ok' OR prompt_version=?))")
        return conn.execute(q + " ORDER BY url", (PROMPT_VERSION,)).fetchall()
    return conn.execute(q + " ORDER BY url").fetchall()


def run(llm: LLM, rows: list, threads: int = 8, log_every: int = 100, stage: str = STAGE) -> dict:
    conn = db.connect()
    agg = {"items": 0, "ok": 0, "failed": 0, "quotes": 0, "verified": 0, "snapped": 0, "cost": 0.0,
           "truncated_retries": 0, "errors": []}
    stop = False
    with ThreadPoolExecutor(max_workers=threads) as ex:
        futs = {ex.submit(extract_one, llm, r, stage): r["url"] for r in rows}
        for f in as_completed(futs):
            try:
                res = f.result()
            except BudgetExceeded as e:
                agg["errors"].append(f"BUDGET: {e}")
                stop = True
                continue
            agg["items"] += 1
            agg["cost"] += res.cost
            agg["truncated_retries"] += res.truncated_retry
            if res.ok:
                agg["ok"] += 1
                agg["quotes"] += res.n_quotes
                agg["verified"] += res.n_verified
                agg["snapped"] += res.n_snapped
                save(conn, res)
                mark(conn, res.url, "ok", None)
            else:
                agg["failed"] += 1
                agg["errors"].append(f"{res.url}: {res.error}")
                mark(conn, res.url, "failed", res.error)
            if agg["items"] % log_every == 0:
                conn.commit()
                print(f"[A] {agg['items']}/{len(rows)} ok={agg['ok']} cost=${agg['cost']:.4f} "
                      f"verified={agg['verified']}/{agg['quotes']}", flush=True)
            if stop:
                for other in futs:
                    other.cancel()
    conn.commit()
    conn.close()
    agg["verify_rate"] = agg["verified"] / agg["quotes"] if agg["quotes"] else 0.0
    agg["cost_per_item"] = agg["cost"] / agg["items"] if agg["items"] else 0.0
    agg["budget_stopped"] = stop
    return agg


def pilot_rows(conn, n: int = 20, seed: int = 7, must_include: tuple[str, ...] = ()) -> list:
    rows = eligible(conn, only_missing=False)
    by_url = {r["url"]: r for r in rows}
    chosen = [by_url[u] for u in must_include if u in by_url]
    rest = [r for r in rows if r["url"] not in must_include]
    random.Random(seed).shuffle(rest)
    return (chosen + rest)[:n]


def full_run(llm: LLM, cost_per_item: float, confirm_spend: bool, threads: int = 8) -> dict:
    conn = db.connect()
    rows = eligible(conn)
    conn.close()
    confirm_full_run(llm, STAGE, len(rows), cost_per_item, confirm_spend)
    return run(llm, rows, threads=threads)
