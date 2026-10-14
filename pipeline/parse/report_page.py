"""Parse one judiciary.uk PFD report page into structured fields.

Dates come from the page's metadata block ("Date of report: ..."), never from a
signature block (section 3 trap: report 2025-0585 has a wrong year in its signature).
"""
from __future__ import annotations

import re
from dataclasses import asdict, dataclass, field
from datetime import date, datetime
from urllib.parse import unquote, urlparse

from selectolax.lexbor import LexborHTMLParser

from .text import html_to_text, tidy

MONTHS = {m: i for i, m in enumerate(
    ["january", "february", "march", "april", "may", "june", "july", "august",
     "september", "october", "november", "december"], 1)}
MONTHS.update({k[:3]: v for k, v in list(MONTHS.items())})
MONTHS["sept"] = 9

_META_KEYS = {
    "date of report": "date_raw",
    "ref": "ref",
    "reference": "ref",
    "deceased name": "deceased_name",
    "deceased's name": "deceased_name",
    "coroner name": "coroner",
    "coroners name": "coroner",
    "coroner's name": "coroner",
    "coroner area": "area",
    "coroners area": "area",
    "coroner's area": "area",
    "category": "category_raw",
    "categories": "category_raw",
    "this report is being sent to": "receivers_raw",
}
_REF = re.compile(r"\b(20[0-3]\d)\s*[-/]\s*(\d{3,4})\b")


def parse_date(s: str | None) -> date | None:
    if not s:
        return None
    s = s.strip().lower().replace(",", " ")
    s = re.sub(r"(\d)(st|nd|rd|th)\b", r"\1", s)
    m = re.search(r"\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})\b", s)
    if m:
        d, mo, y = map(int, m.groups())
        if y < 100:
            y += 2000
        try:
            return date(y, mo, d)
        except ValueError:
            return None
    m = re.search(r"\b(\d{1,2})\s+([a-z]+)\.?\s+(\d{4})\b", s)
    if m and m.group(2) in MONTHS:
        try:
            return date(int(m.group(3)), MONTHS[m.group(2)], int(m.group(1)))
        except ValueError:
            return None
    m = re.search(r"\b([a-z]+)\s+(\d{1,2})\s+(\d{4})\b", s)
    if m and m.group(1) in MONTHS:
        try:
            return date(int(m.group(3)), MONTHS[m.group(1)], int(m.group(2)))
        except ValueError:
            return None
    return None


@dataclass
class PdfLink:
    url: str
    filename: str
    kind: str  # report | response


@dataclass
class ReportPage:
    url: str
    slug: str
    title: str
    published_at: str | None
    date_raw: str | None = None
    report_date: str | None = None
    ref: str | None = None
    deceased_name: str | None = None
    coroner: str | None = None
    area: str | None = None
    category_raw: str | None = None
    categories: list[str] = field(default_factory=list)
    receivers_raw: str | None = None
    body_text: str = ""
    pdfs: list[PdfLink] = field(default_factory=list)

    def to_dict(self) -> dict:
        d = asdict(self)
        return d


def classify_pdf(filename: str, deceased: str | None, index: int, has_report: bool) -> str:
    n = filename.lower()
    if re.search(r"publication-policy|guidance|privacy-notice", n):
        return "generic"
    if re.search(r"respon|reply|replies|letter|update|acknowledg", n):
        return "response"
    if re.search(r"prevention|pfd|regulation|reg-?28|report|future-death", n):
        return "report"
    if not has_report:
        # Unlabelled first file is almost always the report itself.
        surname = (deceased or "").split()[-1].lower() if deceased else ""
        if index == 0 or (surname and surname in n):
            return "report"
    # e.g. 2024-0267-Cornwall-Council.pdf: ref followed by an organisation name.
    return "response"


def parse_report_page(url: str, html: str) -> ReportPage:
    h = LexborHTMLParser(html)
    art = h.css_first("article") or h.body
    t = art.css_first("time")
    published = t.attributes.get("datetime") if t else None
    title_node = art.css_first("h1")
    title = tidy(title_node.text()) if title_node else ""
    slug = urlparse(url).path.rstrip("/").split("/")[-1]
    rp = ReportPage(url=url, slug=slug, title=title, published_at=published)

    flow = art.css_first("div.flow") or art
    flow_html = flow.html or ""
    # Metadata lines live in the leading <p> elements; the body is everything else.
    text = html_to_text(flow_html)
    lines = text.split("\n")
    body_start = 0
    for i, line in enumerate(lines[:40]):
        m = re.match(r"^\s*([A-Za-z' ]{2,40}?)\s*:\s*(.*)$", line)
        if m and m.group(1).strip().lower() in _META_KEYS:
            key = _META_KEYS[m.group(1).strip().lower()]
            if getattr(rp, key) in (None, ""):
                setattr(rp, key, m.group(2).strip() or None)
            body_start = i + 1
        elif line.strip().lower() == "skip to related content":
            body_start = i + 1
    rp.body_text = "\n".join(lines[body_start:]).strip()

    pills = [tidy(a.text()) for a in art.css("a") if "/pfd-types/" in (a.attributes.get("href") or "")]
    cats = list(dict.fromkeys(pills))
    if rp.category_raw:
        for c in re.split(r"\s*\|\s*|\s*;\s*|,\s+(?=[A-Z])", rp.category_raw):
            c = c.strip()
            if c and c not in cats:
                cats.append(c)
    rp.categories = cats

    d = parse_date(rp.date_raw)
    if d is None and published:
        try:
            d = datetime.fromisoformat(published.replace("Z", "+00:00")).date()
        except ValueError:
            d = None
    rp.report_date = d.isoformat() if d else None

    if rp.ref:
        m = _REF.search(rp.ref)
        rp.ref = f"{m.group(1)}-{m.group(2).zfill(4)}" if m else rp.ref.strip()
    if not rp.ref:
        m = _REF.search(rp.body_text[:3000])
        if m:
            rp.ref = f"{m.group(1)}-{m.group(2).zfill(4)}"

    links = []
    for a in art.css("a"):
        href = a.attributes.get("href") or ""
        if ".pdf" in href.lower() and "/wp-content/uploads/" in href:
            links.append(href)
    links = list(dict.fromkeys(links))
    has_report = False
    for i, href in enumerate(links):
        fn = unquote(href.rsplit("/", 1)[-1])
        kind = classify_pdf(fn, rp.deceased_name, i, has_report)
        has_report = has_report or kind == "report"
        rp.pdfs.append(PdfLink(href, fn, kind))
    if not rp.ref:
        for p in rp.pdfs:
            m = _REF.search(p.filename)
            if m:
                rp.ref = f"{m.group(1)}-{m.group(2).zfill(4)}"
                break
    return rp
