"""Hand-labelling set for Pilot (handoff section 10, step 3).

prepare(): sample about 80 candidate pairs stratified across hybrid-score bands and
write data/exports/hand_labels.csv with an empty label column. The model's verdict
is deliberately not shown, so labels are not anchored on it.

interactive(): a small terminal loop. Labels: i = identical, c = closely related,
r = related, d = different, s = skip, q = quit. Progress is saved after every answer.
"""
from __future__ import annotations

import csv
import random
import textwrap

from .. import config, db

FIELDS = ["pair_id", "organisation", "earlier_date", "earlier_url", "earlier_quote", "later_date", "later_url",
          "later_quote", "hybrid_score", "band", "label", "note"]
LABELS = {"i": "identical", "c": "closely_related", "r": "related", "d": "different"}
OUT = config.EXPORTS / "hand_labels.csv"


def prepare(n: int = 80, seed: int = 11, bands: int = 8) -> str:
    conn = db.connect()
    rows = conn.execute(
        """SELECT p.id, p.hybrid_score, o.canonical_name AS org, ce.text_quote AS eq, cl.text_quote AS lq,
                  re.report_date AS ed, rl.report_date AS ld, ce.report_url AS eu, cl.report_url AS lu
           FROM candidate_pairs p JOIN concerns ce ON ce.id=p.earlier_concern_id JOIN concerns cl ON cl.id=p.later_concern_id
           JOIN reports re ON re.url=ce.report_url JOIN reports rl ON rl.url=cl.report_url
           LEFT JOIN organisations o ON o.id=p.organisation_id
           WHERE ce.quote_verified>0 AND cl.quote_verified>0 ORDER BY p.hybrid_score"""
    ).fetchall()
    conn.close()
    if not rows:
        return "no candidate pairs yet"
    rnd = random.Random(seed)
    per = max(1, n // bands)
    chosen = []
    size = len(rows) / bands
    for b in range(bands):
        band = rows[int(b * size): int((b + 1) * size)]
        chosen += [(b, r) for r in rnd.sample(band, min(per, len(band)))]
    existing = {}
    if OUT.exists():
        existing = {r["pair_id"]: r for r in csv.DictReader(OUT.open(encoding="utf-8"))}
    OUT.parent.mkdir(parents=True, exist_ok=True)
    with OUT.open("w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=FIELDS)
        w.writeheader()
        for b, r in chosen:
            prev = existing.get(str(r["id"]), {})
            w.writerow({"pair_id": r["id"], "organisation": r["org"], "earlier_date": r["ed"], "earlier_url": r["eu"],
                        "earlier_quote": r["eq"], "later_date": r["ld"], "later_url": r["lu"], "later_quote": r["lq"],
                        "hybrid_score": f"{r['hybrid_score']:.3f}", "band": b, "label": prev.get("label", ""),
                        "note": prev.get("note", "")})
    return f"wrote {len(chosen)} pairs to {OUT}"


def interactive() -> None:
    if not OUT.exists():
        print("Run: python -m pipeline.cli label-prepare")
        return
    rows = list(csv.DictReader(OUT.open(encoding="utf-8")))
    todo = [r for r in rows if not r["label"]]
    print(f"{len(rows) - len(todo)} of {len(rows)} labelled. Keys: i identical, c closely related, r related, d different, s skip, q quit.")
    for r in todo:
        print("\n" + "=" * 78)
        print(f"Pair {r['pair_id']}  {r['organisation']}")
        print(f"EARLIER {r['earlier_date']}  {r['earlier_url']}")
        print(textwrap.fill(r["earlier_quote"], 78, initial_indent="  ", subsequent_indent="  "))
        print(f"LATER   {r['later_date']}  {r['later_url']}")
        print(textwrap.fill(r["later_quote"], 78, initial_indent="  ", subsequent_indent="  "))
        while True:
            k = input("label [i/c/r/d/s/q]: ").strip().lower()
            if k in LABELS or k in ("s", "q"):
                break
        if k == "q":
            break
        if k == "s":
            continue
        r["label"] = LABELS[k]
        r["note"] = input("note (optional): ").strip()
        with OUT.open("w", newline="", encoding="utf-8") as fh:
            w = csv.DictWriter(fh, fieldnames=FIELDS)
            w.writeheader()
            w.writerows(rows)
    print("Saved.")
