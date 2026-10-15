"""Export precomputed, redacted JSON for the web app (web/data/).

Display rules enforced here, so the web app cannot show anything that breaks them:
  - a link is exported only if relation is identical or closely_related, confidence is at
    or above the threshold, and every quote verified as an exact source substring;
  - every quote and model sentence passes redaction (staff and family names) and the
    wording check;
  - dossiers are exported only when reviewed_by_human = 1;
  - response PDFs are linked, never copied.
"""
from __future__ import annotations

import base64
import json
import re
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

from .. import config, db
from ..judge.chains import DEFAULT_MIN_CONFIDENCE
from ..llm import Ledger
from ..normalise.orgs import key as org_key
from ..redact import redact
from ..wording import is_clean

WEB_DATA = config.ROOT / "web" / "data"
BRIEF_DIM = 256


def _write(path: Path, obj) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


def _people(conn, url: str) -> list[dict]:
    return [dict(r) for r in conn.execute("SELECT name, role FROM people_mentions WHERE report_url=?", (url,))]


class Redactor:
    def __init__(self, conn):
        self.conn = conn
        self.coroners = {r[0] for r in conn.execute("SELECT DISTINCT coroner FROM reports WHERE coroner IS NOT NULL")}
        self._cache: dict[str, tuple[list, set]] = {}

    def __call__(self, text: str | None, *urls: str) -> str | None:
        if text is None:
            return None
        people, deceased = [], set()
        for u in urls:
            if u not in self._cache:
                t = self.conn.execute("SELECT title FROM reports WHERE url=?", (u,)).fetchone()
                name = re.split(r"\s*:\s*", (t[0] if t else "") or "")[0]
                self._cache[u] = (_people(self.conn, u), {name} if name else set())
            p, d = self._cache[u]
            people += p
            deceased |= d
        return redact(text, people, self.coroners, deceased)


def report_card(conn, url: str) -> dict:
    r = conn.execute("SELECT url, title, report_date, coroner, area, ref, categories FROM reports WHERE url=?",
                     (url,)).fetchone()
    return {"url": r["url"], "title": r["title"], "date": r["report_date"], "coroner": r["coroner"],
            "area": r["area"], "ref": r["ref"], "categories": json.loads(r["categories"] or "[]")}


def responses_for(conn, url: str, org_id: int | None, red: Redactor) -> list[dict]:
    out = []
    for rs in conn.execute(
        "SELECT id, pdf_url, filename, organisation_id FROM responses WHERE report_url=? ORDER BY id", (url,)
    ):
        if org_id is not None and rs["organisation_id"] not in (org_id, None):
            continue
        proms = [{"id": p["id"], "quote": red(p["action_quote"], url), "summary": p["action_summary"],
                  "timescale": p["stated_date_or_deadline"]}
                 for p in conn.execute("SELECT * FROM promises WHERE response_id=? AND quote_verified>0", (rs["id"],))]
        out.append({"pdf_url": rs["pdf_url"], "filename": rs["filename"], "promises": proms})
    if not out:
        # Still link any response PDFs that could not be matched to an organisation.
        for p in conn.execute("SELECT url, filename FROM report_pdfs WHERE report_url=? AND kind='response'", (url,)):
            out.append({"pdf_url": p["url"], "filename": p["filename"], "promises": [], "unmatched": True})
    return out


def followups_for(conn, promise_ids: list[int]) -> list[dict]:
    out = []
    for pid in promise_ids:
        for f in conn.execute("SELECT * FROM followups WHERE promise_id=?", (pid,)):
            out.append({"promise_id": pid, "classification": f["classification"], "summary": f["findings"],
                        "sources": json.loads(f["sources"] or "[]")})
    return out


def brief_examples(chain_list: list[dict], n: int = 3) -> list[dict]:
    """Precomputed briefs for the paused state: the latest report of a chain, with its verified links.

    Built from Stage C verdicts already in the database, so no model call is needed.
    """
    out = []
    picks = sorted(chain_list, key=lambda c: (-c["n_reports"], c["relation"] != "identical", c["last_date"]),)
    for c in picks:
        if len(out) >= n:
            break
        d = json.loads((WEB_DATA / "chains" / f"{c['key']}.json").read_text(encoding="utf-8"))
        latest = d["reports"][-1]
        links = [l for l in d["links"] if l["later"] == latest["url"]]
        if not links:
            continue
        by = {r["url"]: r for r in d["reports"]}
        matches = []
        for l in links:
            e = by[l["earlier"]]
            proms = [p for rs in e["responses"] for p in rs["promises"]][:2]
            matches.append({
                "earlier": {k: e.get(k) for k in ("url", "title", "date", "coroner", "area")},
                "relation": l["relation"], "confidence": l["confidence"], "explanation": l["explanation"],
                "earlier_quote": l["earlier_quote"], "later_quote": l["later_quote"], "promises": proms,
                "chains": [c["key"]],
            })
        out.append({
            "title": latest["title"],
            "input": {"reportUrl": latest["url"]},
            "result": {"organisation": {"id": c["org"]["id"], "name": c["org"]["name"]},
                       "report": {"url": latest["url"], "title": latest["title"], "date": latest["date"]},
                       "concerns": latest.get("concerns", [])[:3], "matches": matches, "other_earlier": [],
                       "notes": ["Precomputed example from the verified analysis."]},
        })
    return out


def export(min_conf: float = DEFAULT_MIN_CONFIDENCE) -> dict:
    conn = db.connect()
    red = Redactor(conn)
    WEB_DATA.mkdir(parents=True, exist_ok=True)
    for sub in ("chains", "orgs", "brief"):
        d = WEB_DATA / sub
        if d.exists():
            for f in d.glob("*.json"):
                f.unlink()

    chains = conn.execute(
        "SELECT c.*, o.canonical_name AS org, o.type AS org_type, o.is_national FROM chains c "
        "LEFT JOIN organisations o ON o.id=c.organisation_id ORDER BY c.first_date"
    ).fetchall()
    chain_list = []
    pair_stats = {"links": 0, "diff_coroner": 0, "diff_area": 0, "no_response": 0, "not_cited": 0}
    org_chains: dict[int, list[str]] = defaultdict(list)
    for ch in chains:
        members = conn.execute(
            """SELECT v.*, p.tfidf_score, p.embed_score, p.hybrid_score, p.days_apart, p.same_coroner, p.same_area,
                      ce.report_url AS e_url, cl.report_url AS l_url, ce.hazard AS e_hazard, cl.hazard AS l_hazard
               FROM chain_members m JOIN recurrence_verdicts v ON v.pair_id=m.pair_id
               JOIN candidate_pairs p ON p.id=m.pair_id
               JOIN concerns ce ON ce.id=p.earlier_concern_id JOIN concerns cl ON cl.id=p.later_concern_id
               WHERE m.chain_id=?""", (ch["id"],)).fetchall()
        links = []
        for v in members:
            if not (v["quotes_verified"] and v["confidence"] >= min_conf and is_clean(v["same_hazard_explanation"])):
                continue
            later_text = conn.execute("SELECT body_text FROM reports WHERE url=?", (v["l_url"],)).fetchone()[0] or ""
            cites = bool(re.search(r"previous|previously|before|earlier|prior", later_text, re.I)) and (
                (conn.execute("SELECT ref FROM reports WHERE url=?", (v["e_url"],)).fetchone()[0] or "~~") in later_text)
            has_resp = conn.execute("SELECT 1 FROM responses WHERE report_url=? AND (organisation_id=? OR organisation_id IS NULL)",
                                    (v["e_url"], ch["organisation_id"])).fetchone() is not None
            links.append({
                "earlier": v["e_url"], "later": v["l_url"], "relation": v["relation"],
                "confidence": round(v["confidence"], 2),
                "explanation": red(v["same_hazard_explanation"], v["e_url"], v["l_url"]),
                "earlier_quote": red(v["earlier_quote"], v["e_url"]), "later_quote": red(v["later_quote"], v["l_url"]),
                "promise_quote": red(v["promise_quote"], v["e_url"]) if v["promise_quote"] else None,
                "after_promise": v["after_promise"], "scores": {
                    "tfidf": round(v["tfidf_score"] or 0, 3), "embedding": round(v["embed_score"] or 0, 3),
                    "hybrid": round(v["hybrid_score"] or 0, 3)},
                "days_apart": v["days_apart"], "same_coroner": bool(v["same_coroner"]), "same_area": bool(v["same_area"]),
                "later_cites_earlier": cites, "earlier_has_response": has_resp, "model": v["model"],
            })
            pair_stats["links"] += 1
            pair_stats["diff_coroner"] += not v["same_coroner"]
            pair_stats["diff_area"] += not v["same_area"]
            pair_stats["no_response"] += not has_resp
            pair_stats["not_cited"] += not cites
        if not links:
            continue
        urls = sorted({l["earlier"] for l in links} | {l["later"] for l in links},
                      key=lambda u: conn.execute("SELECT report_date FROM reports WHERE url=?", (u,)).fetchone()[0])
        reports = []
        for u in urls:
            card = report_card(conn, u)
            card["responses"] = responses_for(conn, u, ch["organisation_id"], red)
            card["concerns"] = [{"quote": red(c["text_quote"], u), "hazard": c["hazard"]} for c in conn.execute(
                "SELECT text_quote, hazard FROM concerns WHERE report_url=? AND quote_verified>0 ORDER BY idx", (u,))]
            reports.append(card)
        pids = [p["id"] for r in reports for rs in r["responses"] for p in rs["promises"]]
        dossier = conn.execute("SELECT ultra_output, reviewed_by_human FROM dossiers WHERE chain_key=?",
                               (ch["chain_key"],)).fetchone()
        dossier_out = None
        if dossier and dossier["reviewed_by_human"] == 1:
            d = json.loads(dossier["ultra_output"])
            d["narrative"] = red(d["narrative"], *urls)
            dossier_out = d
        coroners = sorted({r["coroner"] for r in reports if r["coroner"]})
        summary = {
            "key": ch["chain_key"], "org": {"id": ch["organisation_id"], "name": ch["org"], "type": ch["org_type"],
                                            "national": bool(ch["is_national"])},
            "hazard": hazard_title(ch["hazard_label"]), "relation": ch["relation"],
            "confidence": round(min(l["confidence"] for l in links), 2),
            "first_date": reports[0]["date"], "last_date": reports[-1]["date"], "n_reports": len(reports),
            "coroners": coroners, "areas": sorted({r["area"] for r in reports if r["area"]}),
            "different_coroner": len(coroners) > 1, "theme": (reports[0]["categories"] or ["Other"])[0],
            "has_dossier": dossier_out is not None,
            "any_no_response": any(not l["earlier_has_response"] for l in links),
        }
        chain_list.append(summary)
        org_chains[ch["organisation_id"]].append(ch["chain_key"])
        _write(WEB_DATA / "chains" / f"{ch['chain_key']}.json", {
            **summary, "reports": reports, "links": links, "followups": followups_for(conn, pids), "dossier": dossier_out,
        })

    # Organisation pages: only organisations that appear in a chain or have 2+ reports.
    orgs_out = []
    for o in conn.execute(
        """SELECT o.id, o.canonical_name, o.type, o.is_national, COUNT(rr.report_url) n FROM organisations o
           JOIN report_receivers rr ON rr.organisation_id=o.id GROUP BY o.id HAVING n >= 2 OR o.id IN
           (SELECT organisation_id FROM chains)"""
    ):
        reps = []
        for r in conn.execute(
            """SELECT r.url FROM report_receivers rr JOIN reports r ON r.url=rr.report_url
               WHERE rr.organisation_id=? AND r.duplicate_of IS NULL ORDER BY r.report_date""", (o["id"],)):
            card = report_card(conn, r["url"])
            card["responses"] = responses_for(conn, r["url"], o["id"], red)
            reps.append(card)
        entry = {"id": o["id"], "name": o["canonical_name"], "type": o["type"], "national": bool(o["is_national"]),
                 "n_reports": len(reps), "n_chains": len(org_chains.get(o["id"], []))}
        orgs_out.append(entry)
        _write(WEB_DATA / "orgs" / f"{o['id']}.json", {**entry, "reports": reps, "chains": org_chains.get(o["id"], [])})

    # Brief retrieval data (compact).
    # brief/reports.json: one row per report [url, title, date, coroner, area, promises, chains],
    #   where promises are {id, o (organisation id), q (quote), t (timescale)}.
    # brief/<org>.json: rows [concern_id, report_index, quote, hazard, base64 int8 embedding].
    alias_index = {}
    for a in conn.execute("SELECT alias_text, organisation_id FROM org_aliases"):
        alias_index[org_key(a["alias_text"])] = a["organisation_id"]
    for o in conn.execute("SELECT id, canonical_name FROM organisations"):
        alias_index.setdefault(org_key(o["canonical_name"]), o["id"])
    chain_by_report = defaultdict(list)
    for s in chain_list:
        for r in json.loads((WEB_DATA / "chains" / f"{s['key']}.json").read_text(encoding="utf-8"))["reports"]:
            chain_by_report[r["url"]].append(s["key"])
    report_rows: list[list] = []
    report_idx: dict[str, int] = {}

    def ridx(url: str) -> int:
        if url not in report_idx:
            r = conn.execute("SELECT title, report_date, coroner, area FROM reports WHERE url=?", (url,)).fetchone()
            proms = [{"id": p["id"], "o": p["organisation_id"], "q": red(p["action_quote"], url), "t": p["stated_date_or_deadline"]}
                     for p in conn.execute(
                         """SELECT pr.id, pr.action_quote, pr.stated_date_or_deadline, rs.organisation_id FROM promises pr
                            JOIN responses rs ON rs.id = pr.response_id WHERE rs.report_url=? AND pr.quote_verified>0""", (url,))]
            report_idx[url] = len(report_rows)
            report_rows.append([url, r["title"], r["report_date"], r["coroner"], r["area"], proms[:6], chain_by_report.get(url, [])])
        return report_idx[url]

    shard_rows = defaultdict(list)
    for c in conn.execute(
        """SELECT c.id, c.report_url, c.text_quote, c.hazard, c.embedding, rr.organisation_id
           FROM concerns c JOIN reports r ON r.url=c.report_url JOIN report_receivers rr ON rr.report_url=c.report_url
           WHERE r.duplicate_of IS NULL AND c.quote_verified>0 AND c.embedding IS NOT NULL"""
    ):
        v = np.frombuffer(c["embedding"], dtype=np.float32)[:BRIEF_DIM]
        n = np.linalg.norm(v)
        v = v / n if n else v
        q = np.clip(np.round(v * 127), -127, 127).astype(np.int8)
        shard_rows[c["organisation_id"]].append(
            [c["id"], ridx(c["report_url"]), red(c["text_quote"], c["report_url"]), c["hazard"],
             base64.b64encode(q.tobytes()).decode()])
    for org, rows in shard_rows.items():
        _write(WEB_DATA / "brief" / f"{org}.json", rows)
    _write(WEB_DATA / "brief" / "reports.json", report_rows)
    _write(WEB_DATA / "brief_index.json", {"aliases": alias_index,
                                           "orgs": {o["id"]: o["canonical_name"] for o in conn.execute(
                                               "SELECT id, canonical_name FROM organisations")},
                                           "dim": BRIEF_DIM})

    # Site-wide numbers, always computed from data.
    ledger = Ledger()
    by_stage = ledger.spend_by_stage()
    n_reports = conn.execute("SELECT COUNT(*) FROM reports WHERE duplicate_of IS NULL").fetchone()[0]
    n_resp_reports = conn.execute(
        "SELECT COUNT(DISTINCT report_url) FROM report_pdfs WHERE kind='response'").fetchone()[0]
    links = max(1, pair_stats["links"])
    site = {
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "n_reports": n_reports,
        "n_reports_with_response": n_resp_reports,
        "n_organisations": conn.execute("SELECT COUNT(*) FROM organisations").fetchone()[0],
        "n_concerns": conn.execute("SELECT COUNT(*) FROM concerns").fetchone()[0],
        "n_candidate_pairs": conn.execute("SELECT COUNT(*) FROM candidate_pairs").fetchone()[0],
        "n_judged": conn.execute("SELECT COUNT(*) FROM recurrence_verdicts").fetchone()[0],
        "n_chains": len(chain_list),
        "n_links": pair_stats["links"],
        "share_diff_coroner": pair_stats["diff_coroner"] / links,
        "share_diff_area": pair_stats["diff_area"] / links,
        "share_no_response": pair_stats["no_response"] / links,
        "share_not_cited": pair_stats["not_cited"] / links,
        "spend": {"total": sum(by_stage.values()), "by_stage": by_stage},
        "models": {k: m.id for k, m in config.MODELS.items()},
        "min_confidence": min_conf,
        "flagship": sorted(chain_list, key=lambda c: (-c["n_reports"], c["relation"] != "identical", -c["confidence"]))[0]["key"]
        if chain_list else None,
        "themes": dict(Counter(c["theme"] for c in chain_list).most_common()),
    }
    _write(WEB_DATA / "site.json", site)
    _write(WEB_DATA / "chains.json", chain_list)
    _write(WEB_DATA / "orgs.json", sorted(orgs_out, key=lambda o: o["name"]))
    _write(WEB_DATA / "brief_examples.json", brief_examples(chain_list))
    ev = config.EXPORTS / "evaluation.json"
    if ev.exists():
        _write(WEB_DATA / "evaluation.json", json.loads(ev.read_text(encoding="utf-8")))
    conn.close()
    return {"chains": len(chain_list), "orgs": len(orgs_out), "brief_shards": len(shard_rows), "links": pair_stats["links"]}


def hazard_title(label: str | None) -> str:
    """Model-written hazard labels are titles on the site, so they pass the wording check too."""
    t = (label or "").strip().rstrip(".")
    if not t or not is_clean(t):
        return "Recurring hazard (see the quoted concerns)"
    return t[0].upper() + t[1:]
