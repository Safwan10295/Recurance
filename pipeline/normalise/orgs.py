"""Organisation normalisation.

1. Split each report's receiver string into individual organisations.
2. Normalise case, punctuation, HM/His Majesty's, NHS trust variants, role prefixes.
3. Apply manual aliases (aliases.yaml), then fuzzy-merge with rapidfuzz.
4. Flag national bodies and assign a coarse type.
5. Write a review CSV of low-confidence merges.
"""
from __future__ import annotations

import csv
import re
from collections import Counter, defaultdict
from pathlib import Path

import yaml
from rapidfuzz import fuzz, process

from .. import config, db

ALIASES = Path(__file__).with_name("aliases.yaml")

NATIONAL = {
    "Department of Health and Social Care", "NHS England", "Ministry of Justice",
    "His Majesty's Prison and Probation Service", "Care Quality Commission", "Home Office",
    "Department for Transport", "Medicines and Healthcare products Regulatory Agency",
    "National Institute for Health and Care Excellence", "National Highways", "Network Rail",
    "UK Health Security Agency", "Department for Education", "Department for Work and Pensions",
    "Driver and Vehicle Licensing Agency", "Health and Safety Executive", "General Medical Council",
    "Nursing and Midwifery Council", "Welsh Government", "College of Policing",
    "National Police Chiefs' Council", "Independent Office for Police Conduct", "Ofsted", "Ofcom",
    "Office of Rail and Road", "Department for Levelling Up, Housing and Communities",
    "Department for Environment, Food and Rural Affairs", "Department for Business and Trade",
    "Department for Science, Innovation and Technology", "NHS Resolution",
    "Health Services Safety Investigations Body", "NHS Digital", "British Transport Police",
    "Maritime and Coastguard Agency", "Chief Coroner", "Food Standards Agency",
}
NATIONAL_PREFIXES = ("Royal College", "Department for", "Department of", "Ministry of", "Secretary of State")

_ROLE_PREFIX = re.compile(
    r"^(?:the\s+)?(?:(?:interim|acting|deputy|joint)\s+)?"
    r"(?:chief\s+executives?(?:\s+officer)?|ceo|chief\s+constable|chair(?:man|woman|person)?|director(?:\s+general)?|"
    r"medical\s+director|chief\s+nurse|managing\s+director|registered\s+manager|manager|governor|"
    r"president|head|chief\s+officer|chief\s+fire\s+officer|commissioner|clerk|principal|"
    r"general\s+manager|group\s+chief\s+executive|executive\s+director|corporate\s+director|"
    r"strategic\s+director|chief\s+operating\s+officer|registrar|chief\s+medical\s+officer)"
    r"(?:\s+(?:and|&)\s+[a-z ]{2,30}?)?\s*(?:of|for|at|,|-)\s+(?:the\s+)?",
    re.I,
)
_STOP_SUFFIX = re.compile(r"\s*\((?:[^)]{0,60})\)\s*$")


def key(name: str) -> str:
    s = name.lower().replace("&", " and ")
    s = re.sub(r"\b(?:her|his)\s+majesty'?s\b", "hm", s)
    s = re.sub(r"\bh\.?\s?m\.?\b", "hm", s)
    s = re.sub(r"[^a-z0-9 ]+", " ", s)
    s = re.sub(r"\bthe\b", " ", s)
    s = re.sub(r"\bnhs\s+foundation\s+trust\b|\bfoundation\s+trust\b|\bnhs\s+ft\b|\bnhs\s+trust\b", " nhs trust ", s)
    s = re.sub(r"\buniversity\s+hospitals?\b", " university hospital ", s)
    s = re.sub(r"\b(ltd|limited|plc|llp|inc|uk)\b", " ", s)
    s = re.sub(r"\bcouncils?\b", " council", s)
    return re.sub(r"\s+", " ", s).strip()


def split_receivers(raw: str | None) -> list[str]:
    if not raw:
        return []
    s = raw.replace("’", "'")
    s = re.sub(r"\[\s*redacted\s*\]|\bredacted\b", " ", s, flags=re.I)
    s = re.sub(r"\(\s*\d+\s*\)|\b\d+[.)]\s+", ";", s)
    parts = re.split(r"\s*[;|\n]\s*|\s+/\s+|\s*,\s*(?:and\s+)?(?=(?:the\s+)?(?:[A-Z][a-z]|NHS|HM|DVLA|CQC|MHRA))", s)
    out = []
    for p in parts:
        p = p.strip(" .,:-\t")
        p = re.sub(r"^(?:and|also|cc|copy\s+to)\s+", "", p, flags=re.I)
        p = _ROLE_PREFIX.sub("", p).strip(" .,:-")
        p = _STOP_SUFFIX.sub("", p).strip()
        if len(p) < 3 or len(p) > 140:
            continue
        if re.fullmatch(r"(?i)\[?redacted\]?|n/?a|none|various|see\s+report", p):
            continue
        out.append(p)
    return out


def org_type(name: str, national: bool) -> str:
    n = name.lower()
    if national:
        return "national_body"
    rules = [
        ("police", r"police|constabulary"),
        ("ambulance", r"ambulance"),
        ("prison", r"\bhmp\b|prison|young offender|\bhmyoi\b|immigration removal"),
        ("commissioner", r"clinical commissioning|\bccg\b|integrated care board|\bicb\b|integrated care system"),
        ("nhs_trust", r"nhs|health board|hospital|healthcare|health care|mental health|partnership trust|trust\b"),
        ("council", r"council|borough|county|city of|local authority|metropolitan"),
        ("company", r"\bltd\b|limited|\bplc\b|\bllp\b|\binc\b|group|company|services|care home|homes"),
    ]
    for t, rx in rules:
        if re.search(rx, n):
            return t
    return "other"


GENERIC = {
    "nhs", "trust", "and", "of", "for", "the", "hospital", "hospitals", "university", "service", "services", "group",
    "council", "county", "borough", "city", "health", "healthcare", "care", "foundation", "partnership", "board",
    "metropolitan", "district", "hm", "royal", "general", "limited", "ltd", "department", "dept", "of", "teaching",
}


def distinctive_compatible(a: str, b: str) -> bool:
    """Block merges whose distinctive words differ (Southampton vs Northampton, Midlands vs Middlesex)."""
    da = [t for t in a.split() if t not in GENERIC]
    db_ = [t for t in b.split() if t not in GENERIC]
    if not da or not db_:
        return True

    def has_match(t: str, pool: list[str]) -> bool:
        return any(t == u or t.startswith(u) or u.startswith(t) or fuzz.ratio(t, u) >= 88 for u in pool)

    return all(has_match(t, db_) for t in da) and all(has_match(t, da) for t in db_)


def load_aliases() -> dict[str, str]:
    data = yaml.safe_load(ALIASES.read_text(encoding="utf-8")) or {}
    out = {}
    for canon, names in data.items():
        out[key(canon)] = canon
        for n in names or []:
            out[key(n)] = canon
    return out


def is_national(canon: str) -> bool:
    return canon in NATIONAL or canon.startswith(NATIONAL_PREFIXES)


def normalise(conn=None, fuzzy_threshold: int = 92, review_band: tuple[int, int] = (88, 95)) -> dict:
    own = conn is None
    conn = conn or db.connect()
    aliases = load_aliases()
    rows = conn.execute("SELECT url, receivers_raw FROM reports WHERE duplicate_of IS NULL").fetchall()
    per_report: dict[str, list[str]] = {}
    spellings: Counter = Counter()
    for r in rows:
        names = split_receivers(r["receivers_raw"])
        per_report[r["url"]] = names
        spellings.update(names)

    # Group spellings by normalised key; manual aliases first.
    by_key: dict[str, Counter] = defaultdict(Counter)
    canon_for_key: dict[str, str] = {}
    for name, n in spellings.items():
        k = key(name)
        if not k:
            continue
        by_key[k][name] += n
        if k in aliases:
            canon_for_key[k] = aliases[k]

    # Fuzzy-merge remaining keys into more frequent keys.
    keys_by_freq = sorted(by_key, key=lambda k: -sum(by_key[k].values()))
    merged_into: dict[str, str] = {}
    review: list[tuple] = []
    anchors: list[str] = []
    for k in keys_by_freq:
        if k in canon_for_key:
            anchors.append(k)
            continue
        if anchors:
            best = process.extractOne(k, anchors, scorer=fuzz.token_sort_ratio)
            if best:
                cand, score, _ = best
                # Never merge two different numbered or place-qualified bodies on fuzz alone
                # when their distinguishing tokens differ (e.g. "north" vs "south").
                dif = set(k.split()) ^ set(cand.split())
                directional = dif & {"north", "south", "east", "west", "central", "inner", "outer", "mid", "greater"}
                if score >= fuzzy_threshold and not directional and distinctive_compatible(k, cand):
                    merged_into[k] = cand
                    if review_band[0] <= score < review_band[1]:
                        review.append((k, cand, score))
                    continue
                if review_band[0] <= score < fuzzy_threshold:
                    review.append((k, cand, score))
        anchors.append(k)

    def root(k: str) -> str:
        while k in merged_into:
            k = merged_into[k]
        return k

    canon_name: dict[str, str] = {}
    for k in keys_by_freq:
        r = root(k)
        if r in canon_for_key:
            canon_name[k] = canon_for_key[r]
        else:
            canon_name[k] = by_key[r].most_common(1)[0][0]

    conn.execute("DELETE FROM report_receivers")
    conn.execute("DELETE FROM org_aliases")
    # Upsert by name so organisation ids stay stable across reruns (pairs and responses refer to them).
    org_id: dict[str, int] = {}
    for canon in sorted(set(canon_name.values())):
        nat = is_national(canon)
        conn.execute(
            "INSERT INTO organisations (canonical_name, type, is_national) VALUES (?,?,?) "
            "ON CONFLICT(canonical_name) DO UPDATE SET type=excluded.type, is_national=excluded.is_national",
            (canon, org_type(canon, nat), int(nat)),
        )
        org_id[canon] = conn.execute("SELECT id FROM organisations WHERE canonical_name=?", (canon,)).fetchone()[0]
    for k, spell in by_key.items():
        src = "manual" if root(k) in canon_for_key else ("fuzzy" if k in merged_into else "exact")
        for name in spell:
            conn.execute("INSERT OR IGNORE INTO org_aliases VALUES (?,?,?,?)",
                         (name, org_id[canon_name[k]], src, None))
    for url, names in per_report.items():
        for nm in names:
            k = key(nm)
            if k in canon_name:
                conn.execute("INSERT OR IGNORE INTO report_receivers VALUES (?,?,?)",
                             (url, org_id[canon_name[k]], nm))
    conn.commit()

    out = config.DATA / "exports" / "org_merge_review.csv"
    out.parent.mkdir(parents=True, exist_ok=True)
    with out.open("w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(["spelling_key", "merged_or_nearest_key", "score", "merged"])
        for k, cand, score in sorted(review, key=lambda x: x[2]):
            w.writerow([k, cand, score, k in merged_into])
    stats = {
        "raw_spellings": len(spellings),
        "organisations": len(org_id),
        "fuzzy_merges": len(merged_into),
        "review_rows": len(review),
        "national": sum(1 for c in org_id if is_national(c)),
        "orgs_with_2plus_reports": conn.execute(
            "SELECT COUNT(*) FROM (SELECT organisation_id FROM report_receivers GROUP BY organisation_id HAVING COUNT(*)>=2)"
        ).fetchone()[0],
    }
    if own:
        conn.close()
    return stats
