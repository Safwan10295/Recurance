"""Build the reports tables from cached raw pages and PDFs.

Steps:
1. Parse every cached report page (metadata, body, PDF links).
2. Body text comes from the page HTML when it holds the concerns section,
   otherwise from the report PDF (pdfplumber, OCR fallback).
3. Mark republished duplicates (keep the earliest published copy).
4. Flag reports where the coroner says the issue was raised before.
"""
from __future__ import annotations

import json
import re
import time
from collections import defaultdict
from datetime import datetime, timezone

from .. import config, db
from ..scrape.http import cached_path
from .pdf import extract_text, ocr_text
from .report_page import parse_report_page
from .sections import concerns_and_circumstances
from .text import norm_for_match

PRIOR_RX = re.compile(
    r"previous(?:ly)?\s+(?:issued\s+|sent\s+|made\s+|written\s+)?(?:a\s+)?(?:regulation\s*28|reg\s*28|pfd|prevention\s+of\s+future\s+deaths?)"
    r"|(?:regulation\s*28|pfd|prevention\s+of\s+future\s+deaths?)\s+reports?\s+(?:was|were|has\s+been|have\s+been)\s+(?:previously\s+)?(?:issued|sent|made|written)"
    r"|(?:raised|identified|highlighted)\s+(?:these|this|similar|the\s+same)\s+(?:concerns?|issues?|matters?)\s+(?:before|previously|in\s+a\s+previous)"
    r"|previously\s+(?:raised|reported|highlighted|expressed)\s+(?:concerns?|this|these|similar)"
    r"|(?:second|third|further|another)\s+(?:\(possibly\s+third\)\s+)?(?:regulation\s*28|pfd|prevention\s+of\s+future\s+deaths?)"
    r"|(?:earlier|previous|prior)\s+(?:regulation\s*28|pfd|prevention\s+of\s+future\s+deaths?)\s+reports?",
    re.I,
)

MIN_CONCERNS_CHARS = 40


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def report_pdf(rp) -> str | None:
    for p in rp.pdfs:
        if p.kind == "report":
            return p.url
    return None


def body_from_pdf(url: str, allow_ocr: bool) -> tuple[str, str]:
    path = cached_path(url, "pdf")
    if not path:
        return "", "missing"
    data = path.read_bytes()
    text, _, scanned = extract_text(data)
    if scanned and allow_ocr:
        o = ocr_text(data)
        if o:
            return o, "ocr"
        return text, "scanned_no_ocr"
    return text, "pdf"


def build(urls: list[str] | None = None, allow_ocr: bool = True, verbose: bool = True) -> dict:
    conn = db.connect()
    urls = urls or json.loads((config.CACHE / "urls_sitemap.json").read_text())
    stats: dict[str, int] = defaultdict(int)
    needed_pdfs: list[str] = []
    t0 = time.time()
    for i, url in enumerate(urls, 1):
        hp = cached_path(url)
        if not hp:
            stats["page_missing"] += 1
            continue
        rp = parse_report_page(url, hp.read_text(encoding="utf-8", errors="replace"))
        concerns, circ, summary = concerns_and_circumstances(rp.body_text)
        source = "html"
        body = rp.body_text
        if len(concerns) < MIN_CONCERNS_CHARS:
            pdf_url = report_pdf(rp)
            if pdf_url:
                text, how = body_from_pdf(pdf_url, allow_ocr)
                if how == "missing":
                    needed_pdfs.append(pdf_url)
                    source = "none"
                else:
                    c2, ci2, s2 = concerns_and_circumstances(text)
                    if len(c2) >= MIN_CONCERNS_CHARS:
                        concerns, circ, summary, body = c2, ci2 or circ, s2 or summary, text
                        source = how
                    else:
                        source = f"{how}_unsectioned" if text else how
                        body = text or body
            else:
                source = "none"
        stats[f"source_{source}"] += 1
        prior = 1 if PRIOR_RX.search(concerns or "") or PRIOR_RX.search(body or "") else 0
        conn.execute(
            """INSERT INTO reports (url, slug, ref, report_date, published_at, title, deceased_title, coroner, area,
                   categories, receivers_raw, body_source, body_text, circumstances, concerns, summary,
                   report_pdf_url, raw_html_path, scraped_at, prior_reference)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
               ON CONFLICT(url) DO UPDATE SET ref=excluded.ref, report_date=excluded.report_date,
                   published_at=excluded.published_at, title=excluded.title, deceased_title=excluded.deceased_title,
                   coroner=excluded.coroner, area=excluded.area, categories=excluded.categories,
                   receivers_raw=excluded.receivers_raw, body_source=excluded.body_source,
                   body_text=excluded.body_text, circumstances=excluded.circumstances, concerns=excluded.concerns,
                   summary=excluded.summary, report_pdf_url=excluded.report_pdf_url,
                   raw_html_path=excluded.raw_html_path, prior_reference=excluded.prior_reference""",
            (url, rp.slug, rp.ref, rp.report_date, rp.published_at, rp.title, rp.title, rp.coroner, rp.area,
             json.dumps(rp.categories), rp.receivers_raw, source, body, circ, concerns, summary,
             report_pdf(rp), str(hp.relative_to(config.ROOT)), _now(), prior),
        )
        conn.execute("DELETE FROM report_pdfs WHERE report_url=?", (url,))
        for p in rp.pdfs:
            conn.execute("INSERT OR IGNORE INTO report_pdfs VALUES (?,?,?,?)", (p.url, url, p.filename, p.kind))
        if verbose and i % 500 == 0:
            conn.commit()
            print(f"build {i}/{len(urls)} {dict(stats)} {time.time() - t0:.0f}s", flush=True)
    conn.commit()
    stats["duplicates"] = mark_duplicates(conn)
    (config.CACHE / "pdfs_needed_reports.json").write_text(json.dumps(needed_pdfs, indent=0))
    stats["pdfs_needed"] = len(needed_pdfs)
    conn.commit()
    conn.close()
    return dict(stats)


def mark_duplicates(conn) -> int:
    """Republished copies share date and concerns text. Keep the earliest published URL."""
    conn.execute("UPDATE reports SET duplicate_of=NULL")
    rows = conn.execute(
        "SELECT url, slug, report_date, coroner, published_at, concerns FROM reports WHERE concerns IS NOT NULL AND length(concerns) >= ?",
        (MIN_CONCERNS_CHARS,),
    ).fetchall()
    groups: dict[tuple, list] = defaultdict(list)
    for r in rows:
        key = (r["report_date"], norm_for_match(r["concerns"]).lower()[:600])
        groups[key].append(r)
    n = 0
    for members in groups.values():
        if len(members) < 2:
            continue
        members.sort(key=lambda r: (r["published_at"] or "", len(r["slug"])))
        keep = members[0]["url"]
        for r in members[1:]:
            conn.execute("UPDATE reports SET duplicate_of=? WHERE url=?", (keep, r["url"]))
            n += 1
    # Pages without usable text: a "-2" slug with the same date and coroner as its base slug.
    by_slug = {r["slug"]: r for r in conn.execute("SELECT url, slug, report_date, coroner, published_at FROM reports")}
    for slug, r in by_slug.items():
        m = re.match(r"^(.*)-(\d)$", slug)
        if not m:
            continue
        base = by_slug.get(m.group(1))
        if base and base["report_date"] == r["report_date"] and (base["coroner"] or "") == (r["coroner"] or ""):
            cur = conn.execute("SELECT duplicate_of FROM reports WHERE url=?", (r["url"],)).fetchone()[0]
            if not cur:
                conn.execute("UPDATE reports SET duplicate_of=? WHERE url=?", (base["url"], r["url"]))
                n += 1
    return n
