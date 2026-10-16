"""Stage F: promise follow-up with Tavily search and extract, classified by Nano (handoff section 9.8).

Every Tavily call is cached by query hash and written to tavily_calls. The stage
stops at TAVILY_STAGE_F_CAP_CREDITS. "No evidence found" never means "did not happen".
"""
from __future__ import annotations

import json
import os
import time
from datetime import datetime, timezone

import httpx
from pydantic import BaseModel, ValidationError

from .. import config, db
from ..extract.quotes import UNVERIFIED, check_quote
from ..llm import LLM, Ledger, RequestError, TransportError, request_hash
from ..wording import is_clean

STAGE = "F"
CREDITS = {"search_basic": 1, "search_advanced": 2, "extract_basic_per5": 1}


class TavilyBudgetExceeded(RuntimeError):
    pass


class Tavily:
    def __init__(self, ledger: Ledger | None = None, cap: int = config.TAVILY_STAGE_F_CAP_CREDITS,
                 transport=None, stage: str = STAGE):
        self.ledger = ledger or Ledger()
        self.cap = cap
        self.stage = stage
        self._transport = transport

    def _post(self, path: str, body: dict) -> dict:
        if self._transport:
            return self._transport(path, body)
        key = os.environ.get("TAVILY_API_KEY")
        if not key:
            raise RuntimeError("TAVILY_API_KEY is not set")
        r = httpx.post(f"https://api.tavily.com/{path}", json=body, headers={"Authorization": f"Bearer {key}"},
                       timeout=60)
        if r.status_code >= 400:
            raise RequestError(f"Tavily HTTP {r.status_code}: {r.text[:200]}")
        return r.json()

    def _call(self, endpoint: str, body: dict, credits: float) -> dict:
        h = request_hash({"endpoint": endpoint, **body})
        cached = self.ledger.tavily_cache_get(h)
        if cached is not None:
            self.ledger.tavily_record(stage=self.stage, endpoint=endpoint, query_hash=h, credits=0, cached=1, success=1)
            return cached
        used = self.ledger.tavily_credits(self.stage)
        if used + credits > self.cap:
            raise TavilyBudgetExceeded(f"Tavily stage {self.stage} would reach {used + credits} credits, cap {self.cap}")
        try:
            data = self._post(endpoint, body)
        except Exception as e:
            self.ledger.tavily_record(stage=self.stage, endpoint=endpoint, query_hash=h, credits=0, cached=0, success=0,
                                      error=str(e)[:300])
            raise
        self.ledger.tavily_record(stage=self.stage, endpoint=endpoint, query_hash=h, credits=credits, cached=0, success=1)
        self.ledger.tavily_cache_put(h, endpoint, data)
        return data

    def search(self, query: str, max_results: int = 5, depth: str = "basic") -> dict:
        body = {"query": query, "search_depth": depth, "max_results": max_results, "include_answer": False,
                "include_raw_content": False}
        return self._call("search", body, CREDITS["search_advanced" if depth == "advanced" else "search_basic"])

    def extract(self, urls: list[str]) -> dict:
        urls = urls[:5]
        return self._call("extract", {"urls": urls, "extract_depth": "basic"}, CREDITS["extract_basic_per5"])


def queries_for(org: str, summary: str, quote: str) -> list[str]:
    s = summary.strip().rstrip(".")
    return [
        f"{org} {s}",
        f"{org} board papers {s}",
        f"{org} {s} implemented OR introduced OR completed",
    ]


class ClassOut(BaseModel):
    classification: str
    summary: str
    evidence: list[dict]


SCHEMA = {
    "type": "json_schema",
    "json_schema": {
        "name": "stage_f_followup",
        "strict": True,
        "schema": {
            "type": "object",
            "properties": {
                "classification": {"type": "string", "enum": ["evidence_found", "not_found", "contradicting"]},
                "summary": {"type": "string", "maxLength": 400},
                "evidence": {
                    "type": "array",
                    "maxItems": 3,
                    "items": {
                        "type": "object",
                        "properties": {"source": {"type": "integer"}, "quote": {"type": "string", "maxLength": 400}},
                        "required": ["source", "quote"],
                        "additionalProperties": False,
                    },
                },
            },
            "required": ["classification", "summary", "evidence"],
            "additionalProperties": False,
        },
    },
}

SYSTEM = (
    "You check web sources for evidence about whether a promised action by an organisation was carried out. "
    "Output one compact JSON object.\n"
    "classification: evidence_found if a source states the action (or a clearly equivalent one) was carried out; "
    "contradicting if a source states it was not carried out, was withdrawn or was paused; otherwise not_found. "
    "Lack of evidence is not_found, never contradicting.\n"
    "summary: one or two neutral sentences. Never say the organisation ignored, failed or is to blame.\n"
    "evidence: up to 3 items, each with the source number and a passage of 8 to 40 words copied character for "
    "character from that source. Use [] for not_found."
)


def classify(llm: LLM, org: str, promise: dict, sources: list[dict]) -> dict:
    blocks = "\n\n".join(f"[{i}] {s['title']} ({s['url']})\n{s['content'][:1500]}" for i, s in enumerate(sources))
    user = (f"ORGANISATION: {org}\nPROMISED ACTION: \"{promise['action_quote']}\"\n"
            f"STATED TIMESCALE: {promise.get('stated_date_or_deadline') or 'not stated'}\n\nSOURCES:\n{blocks}")
    r = llm.chat(STAGE, "nano", [{"role": "system", "content": SYSTEM}, {"role": "user", "content": user}],
                 config.MAX_TOKENS["followup"], response_format=SCHEMA, item_id=str(promise["id"]))
    try:
        out = ClassOut.model_validate(r.parsed if isinstance(r.parsed, dict) else json.loads(r.content))
    except (ValidationError, ValueError, TypeError) as e:
        return {"ok": False, "error": f"schema: {e}", "cost": r.cost}
    ev = []
    for e in out.evidence[:3]:
        i = e.get("source")
        if isinstance(i, int) and 0 <= i < len(sources):
            st, q = check_quote(e.get("quote", ""), sources[i]["content"])
            if st != UNVERIFIED:
                ev.append({"url": sources[i]["url"], "title": sources[i]["title"], "quote": q})
    cls = out.classification
    if cls != "not_found" and not ev:
        cls = "not_found"  # a claim without a verified quote is not shown as evidence
    summary = out.summary if is_clean(out.summary) else None
    return {"ok": True, "classification": cls, "summary": summary, "evidence": ev, "cost": r.cost}


def select_promises(conn) -> list[tuple[int, str, str]]:
    """Promises to check, in priority order, as (promise_id, chain_key, reason).

    Only stated actions in responses to the earlier reports of a chain (the last report's response
    cannot be followed by a recurrence yet). Order: the demo chains, the chains with a dossier, then
    the chains with the most recurrences.
    """
    chains = conn.execute(
        """SELECT c.id, c.chain_key, c.organisation_id, c.n_reports FROM chains c ORDER BY c.n_reports DESC, c.chain_key"""
    ).fetchall()
    dossier_keys = {r[0] for r in conn.execute("SELECT chain_key FROM dossiers")}
    tiers: list[tuple[str, list]] = [
        ("demo chain", [c for c in chains if c["chain_key"] in config.FEATURED_CHAIN_KEYS]),
        ("chain with a dossier", [c for c in chains if c["chain_key"] in dossier_keys]),
        ("chain with the most recurrences", list(chains)),
    ]
    out, seen = [], set()
    for reason, group in tiers:
        for c in group:
            urls = [r[0] for r in conn.execute(
                """SELECT DISTINCT ce.report_url FROM chain_members m JOIN candidate_pairs p ON p.id = m.pair_id
                   JOIN concerns ce ON ce.id = p.earlier_concern_id WHERE m.chain_id = ?""", (c["id"],))]
            for u in urls:
                for (pid,) in conn.execute(
                    """SELECT pr.id FROM promises pr JOIN responses rs ON rs.id = pr.response_id
                       WHERE rs.report_url = ? AND (rs.organisation_id = ? OR rs.organisation_id IS NULL)
                         AND pr.quote_verified > 0 ORDER BY pr.id""", (u, c["organisation_id"])):
                    if pid not in seen:
                        seen.add(pid)
                        out.append((pid, c["chain_key"], reason))
    return out


def follow_up(llm: LLM, tv: Tavily, promise_ids: list[int], searches_per_promise: int = 2) -> dict:
    conn = db.connect()
    agg = {"promises": 0, "ok": 0, "credits_before": tv.ledger.tavily_credits(STAGE), "errors": [],
           "classes": {}, "cost": 0.0}
    for pid in promise_ids:
        if conn.execute("SELECT 1 FROM followups WHERE promise_id=?", (pid,)).fetchone():
            continue
        p = dict(conn.execute(
            """SELECT pr.*, o.canonical_name AS org FROM promises pr JOIN responses rs ON rs.id = pr.response_id
               LEFT JOIN organisations o ON o.id = rs.organisation_id WHERE pr.id=?""", (pid,)).fetchone())
        org = p["org"] or ""
        sources: dict[str, dict] = {}
        try:
            for q in queries_for(org, p["action_summary"] or "", p["action_quote"])[:searches_per_promise]:
                res = tv.search(q)
                for item in res.get("results", [])[:5]:
                    u = item.get("url")
                    if u and "judiciary.uk" not in u and u not in sources:
                        sources[u] = {"url": u, "title": item.get("title", ""), "content": item.get("content", ""),
                                      "score": item.get("score", 0)}
            top = sorted(sources.values(), key=lambda s: -s["score"])[:3]
            if top:
                ex = tv.extract([s["url"] for s in top])
                for item in ex.get("results", []):
                    u = item.get("url")
                    if u in sources and item.get("raw_content"):
                        sources[u]["content"] = item["raw_content"][:6000]
        except TavilyBudgetExceeded as e:
            agg["errors"].append(str(e))
            break
        except Exception as e:
            agg["errors"].append(f"{pid}: {type(e).__name__}: {e}")
            continue
        top = sorted(sources.values(), key=lambda s: -s["score"])[:5]
        agg["promises"] += 1
        if not top:
            cls = {"ok": True, "classification": "not_found", "summary": None, "evidence": [], "cost": 0.0}
        else:
            try:
                cls = classify(llm, org, p, top)
            except (RequestError, TransportError) as e:
                agg["errors"].append(f"{pid}: {e}")
                continue
        agg["cost"] += cls.get("cost", 0.0)
        if not cls["ok"]:
            agg["errors"].append(f"{pid}: {cls['error']}")
            continue
        agg["ok"] += 1
        agg["classes"][cls["classification"]] = agg["classes"].get(cls["classification"], 0) + 1
        conn.execute(
            "INSERT INTO followups (promise_id, query, findings, sources, classification, created_at) VALUES (?,?,?,?,?,?)",
            (pid, json.dumps(queries_for(org, p["action_summary"] or "", p["action_quote"])[:searches_per_promise]),
             cls["summary"], json.dumps(cls["evidence"], ensure_ascii=False), cls["classification"],
             datetime.now(timezone.utc).isoformat(timespec="seconds")),
        )
        conn.commit()
        time.sleep(0.3)
    conn.close()
    agg["credits_used"] = tv.ledger.tavily_credits(STAGE) - agg["credits_before"]
    return agg
