"""Redaction for displayed text (handoff section 4, rule 5).

Rule 5: staff and clinician names are redacted, coroners stay named, and the deceased are
referred to by the report's published title only, with no added personal detail.

So in displayed quotes:
  - the deceased's full name, or first name on its own, becomes "[the deceased]";
  - an honorific with a surname ("Mr Levett"), or another first name with the deceased's
    surname (usually a relative), becomes "[name redacted]";
  - staff and family names become "[name redacted]": names recorded in people_mentions, names
    after a title (Dr, Nurse, PC...), and names next to a role word ("Jane Smith, the triage
    nurse", "his mother, Mary");
  - coroners stay named.
Quotes are verified against the source before redaction, so verification is unaffected.
"""
from __future__ import annotations

import re
from functools import lru_cache

REDACTED = "[name redacted]"
DECEASED = "[the deceased]"

HON = r"(?:Mr|Mrs|Ms|Miss|Master|Mx)"
TITLE_RX = re.compile(
    r"\b(?:Dr|Doctor|Nurse|Sister|Matron|Professor|Prof|PC|DC|DS|DI|DCI|Sgt|Sergeant|Inspector|Constable|"
    r"Officer|Paramedic|Midwife|Consultant|Registrar|Mr|Mrs|Ms|Miss)\.?\s+((?:[A-Z][a-z'\-]+|[A-Z]\.?)(?:\s+[A-Z][a-z'\-]+)?)\b"
)
CAP = r"[A-Z][a-z'\-]+"
ROLE = (r"nurse|doctor|GP|paramedic|call handler|call taker|clinician|consultant|registrar|surgeon|psychiatrist|"
        r"psychologist|anaesthetist|radiologist|radiographer|pharmacist|physiotherapist|midwife|health visitor|"
        r"healthcare assistant|support worker|care worker|carer|social worker|care coordinator|key ?worker|"
        r"officer|manager|practitioner|therapist|technician|dispatcher|mother|father|wife|husband|partner|son|"
        r"daughter|sister|brother|parents?|grandmother|grandfather|aunt|uncle|friend|cousin|fianc[ée]e?|"
        r"girlfriend|boyfriend|neighbour")
ROLE_BEFORE = re.compile(rf"\b(?:{ROLE}),?\s+({CAP}(?:\s+{CAP})?)\b")
ROLE_AFTER = re.compile(rf"\b({CAP}\s+{CAP}),\s+(?:a|an|the|his|her|their)\s+(?:[a-z\-]+\s+){{0,2}}(?:{ROLE})\b")

# Words that are never part of a person's name in these patterns.
NOT_NAME = {
    "and", "of", "the", "baby", "mr", "mrs", "ms", "miss", "master", "dr", "prevention", "future", "deaths", "death",
    "report", "regulation", "inquest", "into", "re", "in", "deceased", "coroner", "area", "pm", "st", "saint",
    "nhs", "trust", "county", "council", "police", "constabulary", "fire", "hospital", "university", "borough",
    "city", "health", "service", "services", "prison", "road", "street", "house", "court", "ward", "unit",
    "centre", "center", "park", "lane", "way", "school", "college", "ambulance", "practice", "surgery", "team",
    "clinic", "board", "partnership", "foundation", "group", "limited", "ltd", "home", "care", "on", "at", "when",
    "after", "before", "during", "however", "although", "this", "that", "there", "it", "he", "she", "they", "his",
    "her", "their", "a", "an", "i", "we", "following", "despite", "while", "whilst", "as", "if", "on", "by",
}
# First names that are also common words: not replaced at the start of a sentence.
COMMON = {"hope", "grace", "faith", "joy", "will", "may", "june", "april", "rose", "summer", "mark", "bill",
          "frank", "ray", "dean", "guy", "rich", "long", "young", "love", "star", "sky", "skye", "jack", "max",
          "victoria", "georgia", "carol", "page", "hunter", "mason", "chase", "ivy", "holly", "dawn", "eve"}


def _words(s: str) -> list[str]:
    return re.findall(r"[A-Z][A-Za-z'\-]+", s or "")


@lru_cache(maxsize=4096)
def _deceased(names: tuple[str, ...]):
    """From report titles: (full-name patterns, first names, surnames, all tokens)."""
    fulls, firsts, surnames = [], set(), set()
    for title in names:
        head = re.split(r"\s*(?::| - | – )\s*", title or "")[0]
        for person in re.split(r"\s*(?:,|&|\band\b)\s*", head):
            ws = [w for w in _words(person) if w.lower() not in NOT_NAME and len(w) > 1]
            if not ws or len(ws) > 5:
                continue
            firsts.add(ws[0])
            if len(ws) >= 2:
                surnames.add(ws[-1])
                fulls.append(ws)
    pats = []
    for ws in sorted(fulls, key=len, reverse=True):
        variants = {r"\s+".join(map(re.escape, ws)), rf"{re.escape(ws[0])}\s+{re.escape(ws[-1])}"}
        for v in variants:
            pats.append(re.compile(rf"(?:\b{HON}\.?\s+)?\b{v}\b"))
    return pats, firsts, surnames, firsts | surnames


def _sentence_start(text: str, i: int) -> bool:
    before = text[:i].rstrip()
    return not before or before[-1] in ".!?\"“(:;"


def redact_deceased(text: str, names: set[str] | tuple[str, ...]) -> str:
    pats, firsts, surnames, _ = _deceased(tuple(sorted(n for n in names if n)))
    if not firsts:
        return text
    out = text
    for p in pats:
        out = p.sub(DECEASED, out)
    if surnames:
        sur = "|".join(map(re.escape, sorted(surnames, key=len, reverse=True)))
        # "Mr Levett" may be the deceased or a relative: neutral redaction.
        out = re.sub(rf"\b({HON})\.?\s+(?:{sur})\b", lambda m: f"{m.group(1)} {REDACTED}", out)
        # Another first name with the deceased's surname is usually a relative.
        out = re.sub(rf"\b{CAP}\s+(?:{sur})\b",
                     lambda m: m.group(0) if m.group(0).split()[0].lower() in NOT_NAME else REDACTED, out)

    fst = "|".join(map(re.escape, sorted(firsts, key=len, reverse=True)))

    def first(m: re.Match) -> str:
        w = m.group(0)
        prev = out[: m.start()].rstrip()
        if re.search(r"\b(?:St|Saint)\.?$", prev):
            return w  # St John Ambulance
        if w.lower() in COMMON and _sentence_start(out, m.start()):
            return w
        return DECEASED

    # A first name on its own: not followed by another capitalised word (that would be another
    # person or a place, such as "John Radcliffe Hospital").
    return re.sub(rf"\b(?:{fst})\b(?!\s+[A-Z][a-z])(?!-)", first, out)


def redact(text: str | None, people: list[dict], coroners: set[str] | None = None, deceased: set[str] | None = None) -> str:
    """people: [{name, role}] from people_mentions; deceased: report titles (or names) of the deceased."""
    if not text:
        return text or ""
    coroners_l = {c.lower() for c in (coroners or set()) if c}
    deceased_names = set(deceased or set()) | {p["name"] for p in people if p.get("role") == "deceased" and p.get("name")}
    d_tokens = {t.lower() for t in _deceased(tuple(sorted(n for n in deceased_names if n)))[3]}

    def keep(name: str) -> bool:
        ws = [w.lower() for w in _words(name)]
        if not ws or any(w in NOT_NAME for w in ws):
            return True
        return name.lower() in coroners_l or any(name.lower() in c for c in coroners_l)

    out = text
    # Recorded staff and family names (a name made only of the deceased's names is left to the deceased pass).
    names = sorted({p["name"] for p in people if p.get("role") in ("staff", "family", "other") and p.get("name")},
                   key=len, reverse=True)
    for n in names:
        # Extraction sometimes records a team acronym ("HTT") or a role as a name: skip those.
        if not re.search(r"\b[A-Z][a-z]", n):
            continue
        if not keep(n) and not all(w.lower() in d_tokens for w in _words(n)):
            out = re.sub(r"\b" + re.escape(n) + r"\b", REDACTED, out)

    # Titled names and names next to a role word come first: such a person is not the deceased.
    def _title(m: re.Match) -> str:
        nm, full = m.group(1), m.group(0)
        if keep(nm):
            return full
        return full[: m.start(1) - m.start(0)] + REDACTED

    def _role(m: re.Match) -> str:
        if keep(m.group(1)):
            return m.group(0)
        return m.group(0)[: m.start(1) - m.start(0)] + REDACTED + m.group(0)[m.end(1) - m.start(0):]

    out = TITLE_RX.sub(_title, out)
    out = ROLE_BEFORE.sub(_role, out)
    out = ROLE_AFTER.sub(_role, out)
    out = redact_deceased(out, deceased_names)
    # Source PDFs sometimes run words together ("Mr JohnClarke's"); a capitalised word glued to a
    # redaction marker is the rest of the same name.
    return re.sub(r"(\[name redacted\]|\[the deceased\])[A-Z][a-z'\-]+", r"\1", out)
