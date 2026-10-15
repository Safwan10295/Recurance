"""Split Regulation 28 report text into its numbered sections.

Two template generations exist. The 2013 form runs CORONER, LEGAL POWERS,
INVESTIGATION, CIRCUMSTANCES, CONCERNS, ACTION, RESPONSE, COPIES. The newer
form puts DATE OF REPORT, SENT TO, RESPONSE and SUMMARY first. So headings are
found by position and each section runs to the next heading, whatever it is.
"""
from __future__ import annotations

import re

_LEAD = r"(?:^|\n)[ \t]*(?:\(?\d{1,2}[.)]?|[IVX]{1,4}[.)])?[ \t]*"

HEADINGS: dict[str, str] = {
    "summary": r"SUMMARY\s+OF\s+(?:THE\s+)?CORONER'?S?'?\s+CONCERNS?|BRIEF\s+OVERVIEW\s+OF\s+CONCERNS?",
    "concerns": r"(?:THE\s+)?CORONER'?S?'?\s+CONCERNS?|CORONERS\s+CONCERNS?|DETAIL\s+OF\s+CONCERNS?|MATTERS\s+OF\s+CONCERN(?!\s+are)",
    "circumstances": r"CIRCUMSTANCES\s+(?:OF|SURROUNDING)\s+(?:THE\s+)?DEATH",
    "investigation": r"INVESTIGATION\s+(?:AND|&)\s+INQUEST",
    "action": r"ACTION\s+SHOULD\s+BE\s+TAKEN",
    "response": r"YOUR\s+RESPONSE",
    "copies": r"COPIES\s+(?:AND|&)\s+PUBLICATION",
    "legal": r"(?:CORONER'?S?'?\s+)?LEGAL\s+POWERS",
    "sent_to": r"THIS\s+REPORT\s+IS\s+BEING\s+SENT\s+TO",
    "date": r"DATE\s+OF\s+REPORT",
    "coroner": r"CORONER(?=[ \t]*\n)",
}

_COMPILED = {k: re.compile(_LEAD + r"(" + v + r")[ \t:.-]*", re.I) for k, v in HEADINGS.items()}

BOILERPLATE = [
    r"During\s+the\s+course\s+of\s+(?:the|my)\s+(?:investigation|inquest)s?(?:\s+and\s+inquest)?,?\s+(?:my\s+inquiries|the\s+evidence|evidence)\s+revealed\s+(?:matters|a\s+matter)\s+giving\s+rise\s+to\s+(?:the\s+following\s+)?concerns?\.?",
    r"(?:In\s+my\s+opinion,?\s+)?there\s+is\s+a\s+risk\s+that\s+future\s+deaths?\s+(?:could|will|may)\s+occur\s+unless\s+action\s+is\s+taken\.?",
    r"In\s+the\s+circumstances?,?\s+it\s+is\s+my\s+statutory\s+duty\s+to\s+report\s+(?:to\s+you|(?:the\s+)?matters?\s+of\s+concern\s+to\s+you)\.?",
    r"The\s+MATTERS?\s+OF\s+CONCERN\s+(?:are|is)\s+as\s+follows\s*[:.-]*",
    r"\(\s*brief\s+summary\s+of\s+matters\s+of\s+concern\s*\)",
    r"In\s+my\s+opinion,?\s+action\s+should\s+be\s+taken\s+to\s+prevent\s+future\s+deaths\s+and\s+I\s+believe\s+you\s*(?:\[?\(?\s*AND/OR\s+your\s+organisation\s*\)?\]?|\(?and/or\s+your\s+organisation\)?)?\s+have\s+the\s+power\s+to\s+take\s+such\s+action\.?",
]
_BOILER = [re.compile(p, re.I) for p in BOILERPLATE]
_TRAILING_NUM = re.compile(r"(?:\n[ \t]*\(?\d{1,2}[.)]?[ \t]*)+\s*$")


def find_headings(text: str) -> list[tuple[int, int, str]]:
    """Return (start, end_of_heading, name) for every heading occurrence, in order."""
    hits: list[tuple[int, int, str]] = []
    for name, rx in _COMPILED.items():
        for m in rx.finditer(text):
            hits.append((m.start(1), m.end(), name))
    hits.sort()
    # When two patterns match at the same place (e.g. SUMMARY OF CORONER'S CONCERN
    # and CORONER'S CONCERN) keep the longer one.
    out: list[tuple[int, int, str]] = []
    for h in hits:
        if out and h[0] < out[-1][1]:
            if (h[1] - h[0]) > (out[-1][1] - out[-1][0]):
                out[-1] = h
            continue
        out.append(h)
    return out


def split_sections(text: str) -> dict[str, str]:
    """Map section name to its text. The first occurrence of each heading wins."""
    hs = find_headings(text)
    out: dict[str, str] = {}
    for i, (start, end, name) in enumerate(hs):
        nxt = hs[i + 1][0] if i + 1 < len(hs) else len(text)
        body = _TRAILING_NUM.sub("", text[end:nxt]).strip()
        if name not in out and body:
            out[name] = body
        elif name in out and name == "concerns" and len(body) > len(out[name]) * 3:
            # A false early hit (e.g. a cross-reference) is replaced by the real section.
            out[name] = body
    return out


def is_boilerplate_quote(q: str | None) -> bool:
    """True when a quote is only template text (nothing left after removing boilerplate)."""
    rest = strip_boilerplate(q or "")
    return len(re.sub(r"[^A-Za-z]+", "", rest)) < 20


def strip_boilerplate(s: str) -> str:
    for rx in _BOILER:
        s = rx.sub(" ", s)
    s = re.sub(r"[ \t]+", " ", s)
    s = re.sub(r"\n\s*\n+", "\n\n", s)
    return s.strip(" \n:-")


_MATTERS = re.compile(r"MATTERS?\s+OF\s+CONCERN\s+(?:are|is)\s+as\s+follows\s*[:.-]*", re.I)
_LETTER_START = re.compile(r"\n\s*Dear\b[^\n]*\n", re.I)
_LETTER_END = re.compile(r"\n\s*Yours\s+(?:sincerely|faithfully)", re.I)


def _fallback_concerns(text: str) -> str:
    """Reports without a CONCERNS heading.

    1. A numbered section whose heading was dropped but which keeps the template line
       "The MATTERS OF CONCERN are as follows:".
    2. Pre-2013 Rule 43 letters: the letter body between "Dear" and "Yours sincerely".
    """
    m = _MATTERS.search(text)
    if m:
        later = [h for h in find_headings(text) if h[0] > m.end()]
        return text[m.end() : later[0][0] if later else len(text)].strip()
    if re.search(r"Rule\s+43", text, re.I):
        a = _LETTER_START.search(text)
        b = _LETTER_END.search(text, a.end() if a else 0)
        if a:
            return text[a.end() : b.start() if b else a.end() + 6000].strip()
    return ""


def concerns_and_circumstances(text: str) -> tuple[str, str, str]:
    """Return (concerns, circumstances, summary), boilerplate removed."""
    sec = split_sections(text)
    raw = sec.get("concerns", "")
    if len(raw) < 40:
        raw = _fallback_concerns(text) or raw
    concerns = strip_boilerplate(raw)
    circ = strip_boilerplate(sec.get("circumstances", ""))
    summary = strip_boilerplate(sec.get("summary", ""))
    return concerns, circ, summary
