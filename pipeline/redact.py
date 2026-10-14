"""Redaction for displayed text (handoff section 4, rule 5).

Staff, clinician and family names are replaced with [name redacted]. Coroners
stay named. The deceased are referred to by the report title only, so their
names are left where the coroner's own words use them.
"""
from __future__ import annotations

import re

TITLE_RX = re.compile(
    r"\b(?:Dr|Doctor|Nurse|Sister|Matron|Professor|Prof|PC|DC|DS|DI|DCI|Sgt|Sergeant|Inspector|Constable|"
    r"Officer|Paramedic|Midwife|Consultant|Registrar|Mr|Mrs|Ms|Miss)\.?\s+((?:[A-Z][a-z'\-]+|[A-Z]\.?)(?:\s+[A-Z][a-z'\-]+)?)\b"
)
REDACTED = "[name redacted]"


def redact(text: str | None, people: list[dict], coroners: set[str] | None = None, deceased: set[str] | None = None) -> str:
    """people: [{name, role}] from people_mentions. Removes staff and family names."""
    if not text:
        return text or ""
    coroners = {c.lower() for c in (coroners or set()) if c}
    deceased_tokens = set()
    for d in deceased or set():
        deceased_tokens |= {t.lower() for t in re.findall(r"[A-Za-z'\-]{2,}", d or "")}
    out = text
    names = sorted({p["name"] for p in people if p.get("role") in ("staff", "family", "other") and p.get("name")},
                   key=len, reverse=True)
    for n in names:
        if n.lower() in coroners:
            continue
        toks = [t for t in re.findall(r"[A-Za-z'\-]{2,}", n)]
        if not toks or all(t.lower() in deceased_tokens for t in toks):
            continue
        out = re.sub(r"\b" + re.escape(n) + r"\b", REDACTED, out)
        # Surname-only references such as "Dr Smith" are covered by TITLE_RX below.

    def _title(m: re.Match) -> str:
        nm = m.group(1)
        full = m.group(0)
        if any(nm.lower() in c for c in coroners):
            return full
        if all(t.lower() in deceased_tokens for t in re.findall(r"[A-Za-z'\-]{2,}", nm)):
            return full
        return full[: m.start(1) - m.start(0)] + REDACTED

    return TITLE_RX.sub(_title, out)
