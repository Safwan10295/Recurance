"""Wording rules (handoff section 4, ethics). Used on every model-written sentence before display."""
from __future__ import annotations

import re

BANNED = re.compile(
    r"\b(ignor(?:e|ed|es|ing)|caus(?:e|ed|es|ing)\s+(?:the\s+)?death|failed\s+to\s+(?:act|respond|learn|address|implement)|"
    r"fail(?:ure|ed)\s+to|(?:is|are|was|were)\s+responsible|responsib(?:le|ility)\s+for\s+(?:the\s+)?death|"
    r"negligen(?:t|ce)|at\s+fault|to\s+blame|blame[sd]?|culpab(?:le|ility)|disregard(?:ed)?|neglect(?:ed)?|faults?\s+(?:the|its|their))\b",
    re.I,
)


def violations(text: str | None) -> list[str]:
    return [m.group(0) for m in BANNED.finditer(text or "")]


def is_clean(text: str | None) -> bool:
    return not violations(text)


_CAUSAL = [(re.compile(r"\bcausing\b", re.I), "leading to"), (re.compile(r"\bcaused by\b", re.I), "from"),
           (re.compile(r"\bcauses\b(?!\s+of)", re.I), "leads to")]


def neutral(text: str | None) -> str | None:
    """Hazard titles describe a mechanism; say "leading to", never "causing", so no title reads as a finding of cause."""
    for pat, rep in _CAUSAL:
        text = pat.sub(rep, text) if text else text
    return text
