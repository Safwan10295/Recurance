"""Quote verification shared by every stage.

A quote is shown only when it is an exact substring of the source after
whitespace and typographic normalisation. If the model's quote is a near miss
(for example one dropped word), it is snapped to the exact source span when the
alignment is at least 90% similar; the stored quote is then the source's own
text, flagged as snapped (2) rather than exact (1).
"""
from __future__ import annotations

from rapidfuzz import fuzz

from ..parse.text import norm_for_match, verify_quote

EXACT, SNAPPED, UNVERIFIED = 1, 2, 0


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
    if al is None:
        return UNVERIFIED, None
    span = s[al.dest_start : al.dest_end]
    # Extend to word boundaries so a snapped quote never starts or ends mid-word.
    start, end = al.dest_start, al.dest_end
    while start > 0 and s[start - 1].isalnum():
        start -= 1
    while end < len(s) and s[end].isalnum():
        end += 1
    span = s[start:end].strip()
    if len(span) < 20 or abs(len(span) - len(q)) > max(12, 0.15 * len(q)):
        return UNVERIFIED, None
    return SNAPPED, span
