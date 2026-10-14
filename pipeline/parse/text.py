"""Text utilities shared by every stage: HTML to text, normalisation, quote checks."""
from __future__ import annotations

import html as htmllib
import re
import unicodedata

_BLOCK_TAGS = re.compile(r"(?i)<\s*(br|/p|/tr|/li|/h[1-6]|/div|/thead|/tbody|/table|/figure|/blockquote)\b[^>]*>")
_CELL_END = re.compile(r"(?i)<\s*/t[dh]\s*>")
_TAG = re.compile(r"<[^>]+>")
_SCRIPT = re.compile(r"(?is)<(script|style)\b.*?</\1>")

_TRANSLATE = str.maketrans({
    "‘": "'", "’": "'", "‚": "'", "‛": "'", "′": "'",
    "“": '"', "”": '"', "„": '"', "″": '"',
    "–": "-", "—": "-", "‒": "-", "−": "-", "­": "",
    " ": " ", " ": " ", "​": "", " ": " ", "﻿": "",
    "•": "-", "": "-", "●": "-",
})


def html_to_text(fragment: str) -> str:
    s = _SCRIPT.sub("", fragment)
    s = _CELL_END.sub(" \n", s)
    s = _BLOCK_TAGS.sub("\n", s)
    s = _TAG.sub("", s)
    s = htmllib.unescape(s)
    return tidy(s)


def tidy(s: str) -> str:
    """Canonical stored form: typographic quotes/dashes unified, spaces collapsed, paragraphs kept."""
    s = unicodedata.normalize("NFKC", s).translate(_TRANSLATE)
    s = s.replace("\r\n", "\n").replace("\r", "\n")
    s = re.sub(r"[ \t\f\v]+", " ", s)
    s = re.sub(r" *\n *", "\n", s)
    s = re.sub(r"\n{3,}", "\n\n", s)
    return s.strip()


def norm_for_match(s: str) -> str:
    """Whitespace-insensitive form used to verify quotes as exact substrings."""
    s = unicodedata.normalize("NFKC", s or "").translate(_TRANSLATE)
    return re.sub(r"\s+", " ", s).strip()


def verify_quote(quote: str | None, source: str) -> bool:
    """True when quote is an exact substring of source after whitespace normalisation.

    Very short quotes are rejected because they prove nothing.
    """
    q = norm_for_match(quote or "")
    if len(q) < 20:
        return False
    return q in norm_for_match(source)


def locate_quote(quote: str, source: str) -> str | None:
    """Return the original span of source that matches quote (for display), or None."""
    q = norm_for_match(quote)
    if not q:
        return None
    words = q.split(" ")
    pattern = r"\s+".join(re.escape(w) for w in words)
    m = re.search(pattern, unicodedata.normalize("NFKC", source).translate(_TRANSLATE))
    return m.group(0) if m else None
