"""Stage B: response PDFs and promise extraction with Nemotron Nano (handoff section 9.6).

Scope: only responses attached to the earlier report of a surviving candidate
pair, plus every response in a flagship chain.
"""
from __future__ import annotations

import json
import re
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone

from pydantic import BaseModel, Field, ValidationError
from rapidfuzz import fuzz

from .. import config, db
from ..llm import LLM, BudgetExceeded, RequestError, TransportError, confirm_full_run
from ..parse.pdf import extract_text, ocr_text
from ..scrape.http import cached_path
from .quotes import UNVERIFIED, check_quote

STAGE = "B"
MAX_RESPONSE_CHARS = 9000

_FN_NOISE = re.compile(
    r"(?i)(?:\b20\d\d[-_ ]?\d{3,4}\b|\bresponses?\b|\bfrom\b|\bby\b|\bto\b|\breply\b|\bredacted\b|\bpublished\b|"
    r"\bupdate[d]?\b|\bfinal\b|\bletter\b|\bpfd\b|\breg(?:ulation)?\s?28\b|\bv\d\b|\b\d{1,2}\b|\.pdf$)"
)


def org_hint(filename: str) -> str:
    s = re.sub(r"\.pdf$", "", filename, flags=re.I)
    s = re.sub(r"[-_]+", " ", s)
    s = _FN_NOISE.sub(" ", s)
    return re.sub(r"\s+", " ", s).strip()


def match_org(conn, report_url: str, filename: str) -> int | None:
    recv = conn.execute(
        """SELECT o.id, o.canonical_name, rr.raw_text FROM report_receivers rr
           JOIN organisations o ON o.id = rr.organisation_id WHERE rr.report_url=?""",
        (report_url,),
    ).fetchall()
    if not recv:
        return None
    hint = org_hint(filename).lower()
    best, best_score = None, 0.0
    for r in recv:
        for name in {r["canonical_name"], r["raw_text"] or ""}:
            if not name:
                continue
            s = fuzz.token_set_ratio(hint, name.lower())
            if s > best_score:
                best, best_score = r["id"], s
    if best_score >= 70:
        return best
    if len(recv) == 1:
        return recv[0]["id"]
    return None


def scope_report_orgs(conn) -> dict[str, set[int]]:
    """Earlier report of each candidate pair -> the organisations it was linked through."""
    out: dict[str, set[int]] = {}
    for r in conn.execute(
        "SELECT c.report_url, p.organisation_id FROM candidate_pairs p JOIN concerns c ON c.id = p.earlier_concern_id"
    ):
        out.setdefault(r[0], set()).add(r[1])
    return out


def register_responses(conn, report_urls: list[str], orgs: dict[str, set[int]] | None = None) -> list[str]:
    """Insert response rows and return PDF URLs that still need fetching.

    With orgs, only responses from a linked organisation, or whose sender cannot be
    matched, are fetched; replies from other addressees are not needed for Stage B.
    """
    need = []
    for url in report_urls:
        for p in conn.execute("SELECT url, filename FROM report_pdfs WHERE report_url=? AND kind='response'", (url,)):
            org = match_org(conn, url, p["filename"] or "")
            conn.execute(
                """INSERT INTO responses (report_url, organisation_id, pdf_url, filename) VALUES (?,?,?,?)
                   ON CONFLICT(report_url, pdf_url) DO UPDATE SET organisation_id=excluded.organisation_id""",
                (url, org, p["url"], p["filename"]),
            )
            wanted = orgs is None or org is None or org in orgs.get(url, set())
            if wanted and not cached_path(p["url"], "pdf"):
                need.append(p["url"])
    conn.commit()
    return list(dict.fromkeys(need))


def extract_response_texts(conn, allow_ocr: bool = True, workers: int = 12) -> dict:
    from ..parse.pdftext import prepass, text_for

    stats = {"extracted": 0, "ocr": 0, "missing": 0, "empty": 0}
    rows = conn.execute("SELECT id, pdf_url FROM responses WHERE text IS NULL").fetchall()
    stats["prepass"] = prepass([r["pdf_url"] for r in rows], workers=workers, allow_ocr=allow_ocr)
    for r in rows:
        t = text_for(r["pdf_url"], allow_ocr=allow_ocr)
        if t is None:
            stats["missing"] += 1
            continue
        text = t["text"]
        used_ocr = int(t["how"] == "ocr")
        if not text:
            stats["empty"] += 1
        stats["extracted"] += 1
        stats["ocr"] += used_ocr
        conn.execute("UPDATE responses SET text=?, n_chars=?, ocr_used=?, extracted_at=? WHERE id=?",
                     (text, len(text), used_ocr, datetime.now(timezone.utc).isoformat(timespec="seconds"), r["id"]))
    conn.commit()
    return stats


class PromiseOut(BaseModel):
    action_quote: str
    action_summary: str
    stated_date_or_deadline: str | None = None
    owner: str | None = None
    concern_index: int | None = None


class StageBOut(BaseModel):
    promises: list[PromiseOut] = Field(default_factory=list)


SCHEMA = {
    "type": "json_schema",
    "json_schema": {
        "name": "stage_b_promises",
        "strict": True,
        "schema": {
            "type": "object",
            "properties": {
                "promises": {
                    "type": "array",
                    "maxItems": 6,
                    "items": {
                        "type": "object",
                        "properties": {
                            "action_quote": {"type": "string", "maxLength": 500},
                            "action_summary": {"type": "string", "maxLength": 150},
                            "stated_date_or_deadline": {"type": ["string", "null"], "maxLength": 80},
                            "owner": {"type": ["string", "null"], "maxLength": 100},
                            "concern_index": {"type": ["integer", "null"]},
                        },
                        "required": ["action_quote", "action_summary", "stated_date_or_deadline", "owner", "concern_index"],
                        "additionalProperties": False,
                    },
                }
            },
            "required": ["promises"],
            "additionalProperties": False,
        },
    },
}

SYSTEM = (
    "You read an organisation's published response to a coroner's Prevention of Future Deaths report and list "
    "the concrete actions it says it has taken or will take. Output one compact JSON object on a single line.\n"
    "Rules:\n"
    "1. One item per distinct action (usually 0 to 6). General sympathy, background or descriptions of existing "
    "policy without change are not actions.\n"
    "2. action_quote: copy ONE contiguous passage from the RESPONSE text character for character, 8 to 45 words, "
    "that states the action. No paraphrase, no joining of passages.\n"
    "3. action_summary: at most 15 neutral words. stated_date_or_deadline: any date or timescale given for the "
    "action, as written, else null. owner: team or body said to own it, else null.\n"
    "4. concern_index: the number of the listed concern this action addresses, else null.\n"
    "5. If the response states no action, return {\"promises\":[]}."
)


NO_ACTION_RX = re.compile(
    r"\bno\s+(?:further\s+)?(?:action|changes?)\s+(?:is|are|was|will\s+be)?\s*(?:required|needed|necessary|proposed|planned)", re.I)


def _none(v: str | None) -> str | None:
    v = (v or "").strip()
    return None if v.lower() in ("", "null", "none", "n/a", "na", "not stated", "unknown") else v


def build_messages(response_text: str, concerns: list[dict]) -> list[dict]:
    clist = "\n".join(f"{i}. {c['hazard']}" for i, c in enumerate(concerns)) or "(not available)"
    user = f"CONCERNS RAISED:\n{clist}\n\nRESPONSE:\n{response_text[:MAX_RESPONSE_CHARS]}"
    return [{"role": "system", "content": SYSTEM}, {"role": "user", "content": user}]


def extract_one(llm: LLM, resp_row, concerns: list[dict], stage: str = STAGE) -> dict:
    text = resp_row["text"] or ""
    out = {"response_id": resp_row["id"], "ok": False, "promises": [], "cost": 0.0, "quotes": 0, "verified": 0,
           "error": None}
    if len(text) < 200:
        out["error"] = "response text too short (likely unreadable scan)"
        return out
    msgs = build_messages(text, concerns)
    max_tokens = config.MAX_TOKENS["promise"]
    for attempt in (1, 2):
        try:
            r = llm.chat(stage, "nano", msgs, max_tokens, response_format=SCHEMA, item_id=str(resp_row["id"]))
        except (RequestError, TransportError) as e:
            out["error"] = f"{type(e).__name__}: {e}"
            return out
        out["cost"] += r.cost
        if r.finish_reason == "length" and attempt == 1:
            max_tokens = 1400
            continue
        break
    try:
        parsed = StageBOut.model_validate(r.parsed if isinstance(r.parsed, dict) else json.loads(r.content))
    except (ValidationError, ValueError, TypeError) as e:
        out["error"] = f"schema: {str(e)[:200]}"
        return out
    source = text[:MAX_RESPONSE_CHARS]
    for p in parsed.promises:
        if NO_ACTION_RX.search(p.action_quote or ""):
            continue  # a statement that no action is needed is not a promise
        status, q = check_quote(p.action_quote, source)
        out["quotes"] += 1
        out["verified"] += status != UNVERIFIED
        cid = None
        if p.concern_index is not None and 0 <= p.concern_index < len(concerns):
            cid = concerns[p.concern_index]["id"]
        out["promises"].append({
            "action_quote": q if status != UNVERIFIED else p.action_quote, "verified": status,
            "action_summary": p.action_summary.strip()[:300],
            "stated_date_or_deadline": _none(p.stated_date_or_deadline),
            "owner": _none(p.owner), "concern_id": cid,
        })
    out["ok"] = True
    return out


def save(conn, res: dict) -> None:
    conn.execute("DELETE FROM promises WHERE response_id=?", (res["response_id"],))
    conn.execute("UPDATE responses SET stage_b_done=1 WHERE id=?", (res["response_id"],))
    for p in res["promises"]:
        conn.execute(
            "INSERT INTO promises (response_id, concern_id, action_quote, action_summary, stated_date_or_deadline, owner, quote_verified) "
            "VALUES (?,?,?,?,?,?,?)",
            (res["response_id"], p["concern_id"], p["action_quote"], p["action_summary"],
             p["stated_date_or_deadline"], p["owner"], p["verified"]),
        )


def scope_report_urls(conn) -> list[str]:
    rows = conn.execute(
        """SELECT DISTINCT c.report_url FROM candidate_pairs p JOIN concerns c ON c.id = p.earlier_concern_id"""
    ).fetchall()
    return [r[0] for r in rows]


def pending_responses(conn, report_urls: list[str]) -> list:
    """Responses for the given reports that have text and have not been through Stage B yet."""
    if not report_urls:
        return []
    q = ",".join("?" for _ in report_urls)
    rows = conn.execute(
        f"SELECT * FROM responses WHERE report_url IN ({q}) AND text IS NOT NULL AND stage_b_done = 0",
        report_urls,
    ).fetchall()
    orgs = scope_report_orgs(conn)
    return [r for r in rows if r["organisation_id"] is None or r["organisation_id"] in orgs.get(r["report_url"], set())]


def run(llm: LLM, rows: list, threads: int = 8, stage: str = STAGE) -> dict:
    conn = db.connect()
    agg = {"items": 0, "ok": 0, "failed": 0, "quotes": 0, "verified": 0, "cost": 0.0, "promises": 0,
           "errors": [], "budget_stopped": False}
    concern_cache: dict[str, list[dict]] = {}

    def concerns_for(url: str) -> list[dict]:
        if url not in concern_cache:
            concern_cache[url] = [dict(r) for r in conn.execute(
                "SELECT id, hazard FROM concerns WHERE report_url=? ORDER BY idx", (url,))]
        return concern_cache[url]

    jobs = [(r, concerns_for(r["report_url"])) for r in rows]
    with ThreadPoolExecutor(max_workers=threads) as ex:
        futs = [ex.submit(extract_one, llm, r, c, stage) for r, c in jobs]
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
                agg["quotes"] += res["quotes"]
                agg["verified"] += res["verified"]
                agg["promises"] += len(res["promises"])
                save(conn, res)
            else:
                agg["failed"] += 1
                agg["errors"].append(f"{res['response_id']}: {res['error']}")
                # 2 = attempted and failed; never retried without a change to the prompt or input.
                conn.execute("UPDATE responses SET stage_b_done=2 WHERE id=?", (res["response_id"],))
            if agg["items"] % 100 == 0:
                conn.commit()
                print(f"[B] {agg['items']}/{len(rows)} cost=${agg['cost']:.4f}", flush=True)
    conn.commit()
    conn.close()
    agg["verify_rate"] = agg["verified"] / agg["quotes"] if agg["quotes"] else 0.0
    agg["cost_per_item"] = agg["cost"] / agg["items"] if agg["items"] else 0.0
    return agg


def full_run(llm: LLM, rows: list, cost_per_item: float, confirm_spend: bool) -> dict:
    confirm_full_run(llm, STAGE, len(rows), cost_per_item, confirm_spend)
    return run(llm, rows)
