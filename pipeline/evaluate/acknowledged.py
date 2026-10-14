"""Coroner-acknowledged pairs (handoff section 10, steps 1 and 2).

A later report L acknowledges an earlier report E when L's own text names E:
  - E's reference number (e.g. 2019-0123) appears in L, or
  - E's deceased full name (from E's published title) appears in L.
Only these deterministic matches are used. No labels are invented.

The blind test masks every sentence in L that carries the acknowledgement (the
"previously raised" phrasing, E's reference, E's name or surname) so the system
cannot find E by reading the citation.
"""
from __future__ import annotations

import re
from collections import defaultdict

from .. import db
from ..parse.build import PRIOR_RX

_SENT = re.compile(r"(?<=[.!?;])\s+|\n+")


def title_name(title: str | None) -> str | None:
    if not title:
        return None
    t = re.split(r"\s*[:–-]\s*(?:prevention|pfd|regulation|report)", title, flags=re.I)[0].strip()
    t = re.sub(r"\s*\(.*?\)\s*", " ", t).strip()
    if not re.fullmatch(r"[A-Za-z'\- ]{5,60}", t):
        return None
    toks = t.split()
    if len(toks) < 2 or len(toks) > 5:
        return None
    return t


def find_pairs(conn=None) -> list[dict]:
    own = conn is None
    conn = conn or db.connect()
    reports = conn.execute(
        "SELECT url, ref, title, report_date, body_text, concerns, prior_reference FROM reports "
        "WHERE duplicate_of IS NULL AND report_date IS NOT NULL"
    ).fetchall()
    by_ref = defaultdict(list)
    by_name = defaultdict(list)
    for r in reports:
        if r["ref"]:
            by_ref[r["ref"]].append(r)
        n = title_name(r["title"])
        if n:
            by_name[n.lower()].append(r)
    orgs = defaultdict(set)
    for rr in conn.execute("SELECT report_url, organisation_id FROM report_receivers"):
        orgs[rr[0]].add(rr[1])
    ref_rx = re.compile(r"\b(20[0-3]\d)\s*[-/]\s*(\d{4})\b")
    pairs: dict[tuple[str, str], dict] = {}
    for L in reports:
        text = L["body_text"] or ""
        if not text:
            continue
        own_name = (title_name(L["title"]) or "").lower()
        for m in ref_rx.finditer(text):
            ref = f"{m.group(1)}-{m.group(2)}"
            if ref == L["ref"]:
                continue
            for E in by_ref.get(ref, []):
                if E["url"] != L["url"] and E["report_date"] < L["report_date"]:
                    pairs.setdefault((E["url"], L["url"]), {"evidence": set()})["evidence"].add("ref")
        words = re.findall(r"[a-z'\-]+", text.lower())
        grams = {" ".join(words[i:i + k]) for k in (2, 3, 4, 5) for i in range(len(words) - k + 1)}
        for name in grams & by_name.keys():
            Es = by_name[name]
            if name == own_name or len(name) < 8:
                continue
            for E in Es:
                if E["url"] != L["url"] and E["report_date"] < L["report_date"]:
                    pairs.setdefault((E["url"], L["url"]), {"evidence": set()})["evidence"].add("name")
    out = []
    rmap = {r["url"]: r for r in reports}
    for (e, l), v in pairs.items():
        shared = orgs.get(e, set()) & orgs.get(l, set())
        out.append({
            "earlier_url": e, "later_url": l, "evidence": sorted(v["evidence"]), "shared_orgs": sorted(shared),
            "in_scope": bool(shared), "later_prior_flag": int(rmap[l]["prior_reference"] or 0),
            "days_apart": None,
        })
    if own:
        conn.close()
    return out


def mask_text(text: str, earlier: dict) -> str:
    """Remove sentences that carry the acknowledgement of the earlier report."""
    if not text:
        return text
    name = title_name(earlier.get("title")) or ""
    toks = [t for t in name.split() if len(t) > 2]
    surname = toks[-1] if toks else None
    ref = earlier.get("ref")
    keep = []
    for s in _SENT.split(text):
        if PRIOR_RX.search(s):
            continue
        if ref and ref in s:
            continue
        if name and name.lower() in s.lower():
            continue
        if surname and re.search(r"\b" + re.escape(surname) + r"\b", s):
            continue
        keep.append(s)
    return " ".join(keep)
