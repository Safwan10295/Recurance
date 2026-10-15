"""Systemic clusters (handoff section 9.5, step 5): the same hazard raised with different organisations.

1. Deterministic: concerns from different organisations with embedding cosine >= SIM are joined;
   connected components spanning >= MIN_ORGS organisations and >= MIN_YEARS years become clusters.
2. Judged: each member is compared with the cluster's earliest concern by Nemotron Super (Stage C
   prompt, adapted for different organisations). Only members judged identical or closely related,
   confident, with both quotes verified, are shown.
"""
from __future__ import annotations

import json
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timezone

import numpy as np
from pydantic import BaseModel, ValidationError

from .. import config, db
from ..extract.quotes import UNVERIFIED, check_quote
from ..judge.chains import DEFAULT_MIN_CONFIDENCE, SHOWN_RELATIONS
from ..llm import LLM, BudgetExceeded, RequestError, TransportError
from ..wording import is_clean
from .embed import from_blob

SIM = 0.85
MIN_ORGS = 3
MIN_YEARS = 2
MAX_CLUSTERS = 30
MAX_MEMBERS = 8

SCHEMA = {
    "type": "json_schema",
    "json_schema": {
        "name": "systemic_verdict",
        "strict": True,
        "schema": {
            "type": "object",
            "properties": {
                "relation": {"type": "string", "enum": ["identical", "closely_related", "related", "different"]},
                "same_hazard_explanation": {"type": "string", "maxLength": 400},
                "earlier_quote": {"type": "string", "maxLength": 500},
                "later_quote": {"type": "string", "maxLength": 500},
                "confidence": {"type": "number"},
            },
            "required": ["relation", "same_hazard_explanation", "earlier_quote", "later_quote", "confidence"],
            "additionalProperties": False,
        },
    },
}

SYSTEM = (
    "You compare concerns from two coroners' Prevention of Future Deaths reports sent to different organisations, and "
    "decide whether the later concern raises the same hazard as the earlier one. Output one compact JSON object.\n"
    "relation: identical (same specific hazard and mechanism), closely_related (same specific hazard, different setting "
    "or emphasis), related (same broad area, different specific failure point), different.\n"
    "same_hazard_explanation: two short neutral sentences. Never say any organisation ignored, caused, failed, "
    "neglected or is responsible or to blame.\n"
    "earlier_quote and later_quote: copy one contiguous passage, 10 to 45 words, character for character from EARLIER "
    "and LATER respectively.\nconfidence: 0 to 1. Keep reasoning short. Do not count words."
)


class Out(BaseModel):
    relation: str
    same_hazard_explanation: str
    earlier_quote: str
    later_quote: str
    confidence: float


def find_clusters(conn) -> list[dict]:
    rows = conn.execute(
        """SELECT c.id, c.report_url, c.hazard, c.text_quote, c.embedding, r.report_date, r.title, r.concerns
           FROM concerns c JOIN reports r ON r.url=c.report_url
           WHERE r.duplicate_of IS NULL AND c.quote_verified>0 AND c.embedding IS NOT NULL AND r.report_date IS NOT NULL"""
    ).fetchall()
    orgs = defaultdict(set)
    for rr in conn.execute("SELECT report_url, organisation_id FROM report_receivers"):
        orgs[rr[0]].add(rr[1])
    E = np.vstack([from_blob(r["embedding"]) for r in rows]).astype(np.float32)
    parent = list(range(len(rows)))

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    for start in range(0, len(rows), 2000):
        S = E[start:start + 2000] @ E.T
        ii, jj = np.nonzero(S >= SIM)
        for i, j in zip(ii + start, jj):
            if j <= i:
                continue
            a, b = rows[i], rows[j]
            if a["report_url"] == b["report_url"] or (orgs[a["report_url"]] & orgs[b["report_url"]]):
                continue
            ra, rb = find(i), find(j)
            if ra != rb:
                parent[rb] = ra
    groups = defaultdict(list)
    for i in range(len(rows)):
        groups[find(i)].append(i)
    clusters = []
    for members in groups.values():
        if len(members) < MIN_ORGS:
            continue
        # Transitive joins can chain generic concerns together; keep only members directly
        # similar to the earliest concern of the component.
        members.sort(key=lambda i: rows[i]["report_date"])
        anchor = members[0]
        members = [anchor] + [i for i in members[1:] if float(E[anchor] @ E[i]) >= SIM]
        ms = [rows[i] for i in members]
        org_set = set().union(*(orgs[m["report_url"]] for m in ms))
        years = date.fromisoformat(ms[-1]["report_date"]).year - date.fromisoformat(ms[0]["report_date"]).year
        reports = {m["report_url"] for m in ms}
        if len(org_set) >= MIN_ORGS and years >= MIN_YEARS and len(reports) >= MIN_ORGS:
            clusters.append({"members": [dict(m) for m in ms], "n_orgs": len(org_set), "years": years})
    clusters.sort(key=lambda c: (-c["n_orgs"], -len(c["members"])))
    return clusters[:MAX_CLUSTERS]


def judge_clusters(llm: LLM, clusters: list[dict], stage: str = "C") -> dict:
    conn = db.connect()
    out = []
    cost = 0.0

    def one(args):
        anchor, m = args
        user = (f"EARLIER REPORT dated {anchor['report_date']}\nEARLIER:\n{(anchor['concerns'] or '')[:1500]}\n\n"
                f"LATER REPORT dated {m['report_date']}\nLATER:\n{(m['concerns'] or '')[:1500]}")
        try:
            r = llm.chat(stage, "super", [{"role": "system", "content": SYSTEM}, {"role": "user", "content": user}],
                         1500, response_format=SCHEMA, thinking=True, low_effort=True, item_id=f"sys:{m['id']}")
            v = Out.model_validate(r.parsed if isinstance(r.parsed, dict) else json.loads(r.content))
        except (RequestError, TransportError, ValidationError, ValueError, TypeError) as e:
            return m, None, 0.0, str(e)
        es, eq = check_quote(v.earlier_quote, anchor["concerns"] or "")
        ls, lq = check_quote(v.later_quote, m["concerns"] or "")
        shown = (v.relation in SHOWN_RELATIONS and v.confidence >= DEFAULT_MIN_CONFIDENCE and es != UNVERIFIED
                 and ls != UNVERIFIED and is_clean(v.same_hazard_explanation))
        return m, {"relation": v.relation, "confidence": round(float(v.confidence), 2),
                   "explanation": v.same_hazard_explanation, "earlier_quote": eq, "later_quote": lq,
                   "shown": shown}, r.cost, None

    for c in clusters:
        ms = c["members"]
        # One member per report, earliest is the anchor.
        seen, uniq = set(), []
        for m in ms:
            if m["report_url"] not in seen:
                seen.add(m["report_url"])
                uniq.append(m)
        anchor, rest = uniq[0], uniq[1:MAX_MEMBERS]
        try:
            with ThreadPoolExecutor(max_workers=6) as ex:
                res = list(ex.map(one, [(anchor, m) for m in rest]))
        except BudgetExceeded:
            break
        judged = []
        for m, v, c_, err in res:
            cost += c_
            if v and v["shown"]:
                judged.append({"url": m["report_url"], "title": m["title"], "date": m["report_date"], **v})
        if len(judged) >= MIN_ORGS - 1:
            out.append({"hazard": anchor["hazard"], "anchor": {"url": anchor["report_url"], "title": anchor["title"],
                                                               "date": anchor["report_date"], "quote": anchor["text_quote"]},
                        "members": judged, "n_orgs": c["n_orgs"], "years": c["years"]})
    conn.close()
    path = config.EXPORTS / "systemic.json"
    path.write_text(json.dumps({"generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                                "clusters": out}, ensure_ascii=False, indent=1), encoding="utf-8")
    return {"clusters_found": len(clusters), "clusters_shown": len(out), "cost": cost}
