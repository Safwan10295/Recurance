"""Quote verification shared by every stage.

A quote is shown only when it is an exact substring of the source after
whitespace and typographic normalisation. Two repairs replace a near-miss with
the source's own words, flagged as snapped (2) rather than exact (1):

1. Alignment: the best-aligned source span is at least 90% similar (for example
   one dropped word).
2. Prefix anchor: the first 40 or more characters match exactly but the model
   then skipped words. The shown quote is the source text from that point to the
   end of the sentence, so it is still the report's own words.

Either way, what is displayed is always a verbatim substring of the source.
"""
from __future__ import annotations

import re

from rapidfuzz import fuzz

from ..parse.text import norm_for_match, verify_quote

EXACT, SNAPPED, UNVERIFIED = 1, 2, 0
MIN_ANCHOR = 40


def _word_bounds(s: str, start: int, end: int) -> tuple[int, int]:
    while start > 0 and s[start - 1].isalnum():
        start -= 1
    while end < len(s) and s[end].isalnum():
        end += 1
    return start, end


def _prefix_anchor(q: str, s: str) -> str | None:
    lo, hi = MIN_ANCHOR, len(q)
    if lo > hi or q[:lo] not in s:
        return None
    while lo < hi:  # longest prefix of q that occurs in s
        mid = (lo + hi + 1) // 2
        if q[:mid] in s:
            lo = mid
        else:
            hi = mid - 1
    i = s.find(q[:lo])
    target = i + max(len(q), 80)
    m = re.search(r"[.;!?](?:\s|$)", s[i + lo - 1 : target + 120])
    end = (i + lo - 1 + m.start() + 1) if m else min(len(s), target)  # stop at the full stop itself
    i, end = _word_bounds(s, i, end)
    span = s[i:end].strip()
    return span if len(span) >= 30 else None


def check_quote(quote: str | None, source: str, snap_threshold: float = 90.0) -> tuple[int, str | None]:
    if not quote or not source:
        return UNVERIFIED, None
    if verify_quote(quote, source):
        return EXACT, norm_for_match(quote)
    q = norm_for_match(quote)
    s = norm_for_match(source)
    if len(q) < 30 or len(s) < len(q) * 0.5:
        return UNVERIFIED, None
    al = fuzz.partial_ratio_alignment(q, s, score_cutoff=snap_threshold)
    if al is not None:
        start, end = _word_bounds(s, al.dest_start, al.dest_end)
        span = s[start:end].strip()
        if len(span) >= 20 and abs(len(span) - len(q)) <= max(12, 0.15 * len(q)):
            return SNAPPED, span
    span = _prefix_anchor(q, s)
    if span:
        return SNAPPED, span
    return UNVERIFIED, None


def check_quote_any(quote: str | None, *sources: str) -> tuple[int, str | None]:
    """Try each source in order (for example concerns, then circumstances)."""
    for src in sources:
        st, q = check_quote(quote, src or "")
        if st != UNVERIFIED:
            return st, q
    return UNVERIFIED, None
