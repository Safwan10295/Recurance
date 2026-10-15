"""Publish display-safe data from the pipeline's SQLite database into PostgreSQL for the web app.

Display rules are not re-implemented here. The JSON export (pipeline/export/web.py) is run into a
temporary folder and its output is loaded, so the site in Postgres shows exactly what the export
allows: verified quotes, redaction, wording checks, reviewed dossiers only. Report-level rows for
search and report pages use the same Redactor and helpers.

Everything is replaced in one transaction, so the site never sees a half-finished refresh.
`first_seen` for each report is preserved across publishes, which drives the "new" badges.
"""
from __future__ import annotations

import base64
import json
import os
import tempfile
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import yaml

from .. import config, db
from ..export import web
from ..normalise.orgs import key as org_key

SCHEMA = config.ROOT / "pipeline" / "db" / "schema_publish.sql"
FEATURED = Path(__file__).with_name("featured.yaml")
PUB_TABLES = ["pub_meta", "pub_orgs", "pub_reports", "pub_report_orgs", "pub_responses", "pub_chains",
              "pub_chain_reports", "pub_links", "pub_systemic", "pub_brief_concerns", "pub_org_aliases"]


def dsn() -> str:
    url = os.environ.get("DATABASE_URL")
    if not url:
        raise RuntimeError("DATABASE_URL is not set")
    return url


def _read(path: Path, default=None):
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else default


def _vec(b64: str) -> str:
    v = np.frombuffer(base64.b64decode(b64), dtype=np.int8).astype(np.float32)
    n = float(np.linalg.norm(v)) or 1.0
    return "[" + ",".join(f"{x / n:.5f}" for x in v) + "]"


def featured_keys(chains: list[dict], details: dict[str, dict]) -> list[str]:
    """Resolve featured.yaml (lists of report slugs) to current chain keys."""
    spec = yaml.safe_load(FEATURED.read_text(encoding="utf-8")) if FEATURED.exists() else []
    out = []
    for item in spec or []:
        want = set(item.get("reports", []))
        best, score = None, 0
        for c in chains:
            slugs = {r["url"].rstrip("/").rsplit("/", 1)[-1] for r in details[c["key"]]["reports"]}
            s = len(want & slugs)
            if s > score or (s == score and best and c["n_reports"] > best["n_reports"]):
                best, score = c, s
        if best and score >= 2 and best["key"] not in out:
            out.append(best["key"])
    return out


def build_rows(tmp: Path) -> dict:
    """Run the export into tmp and assemble every row to publish."""
    web.WEB_DATA = tmp
    stats = web.export()
    site = _read(tmp / "site.json", {})
    chains = _read(tmp / "chains.json", [])
    details = {c["key"]: _read(tmp / "chains" / f"{c['key']}.json") for c in chains}
    feat = featured_keys(chains, details)

    conn = db.connect()
    red = web.Redactor(conn)
    rows: dict[str, list] = {t: [] for t in PUB_TABLES}

    # Reports (all unique reports, so search and report pages cover the whole archive).
    link_count: dict[str, int] = {}
    for c in chains:
        for l in details[c["key"]]["links"]:
            link_count[l["earlier"]] = link_count.get(l["earlier"], 0) + 1
            link_count[l["later"]] = link_count.get(l["later"], 0) + 1
    report_dates = {}
    for r in conn.execute(
        "SELECT url, slug, title, report_date, coroner, area, ref, categories FROM reports WHERE duplicate_of IS NULL"
    ):
        concerns = [{"quote": red(c["text_quote"], r["url"]), "hazard": c["hazard"]} for c in conn.execute(
            "SELECT text_quote, hazard FROM concerns WHERE report_url=? AND quote_verified>0 ORDER BY idx", (r["url"],))]
        report_dates[r["url"]] = r["report_date"]
        rows["pub_reports"].append((r["url"], r["slug"], r["title"] or r["slug"], r["report_date"], r["coroner"], r["area"],
                                    r["ref"], r["categories"] or "[]", json.dumps(concerns, ensure_ascii=False),
                                    link_count.get(r["url"], 0)))

    # Organisations that received at least one unique report, with counts.
    chain_count: dict[int, int] = {}
    for c in chains:
        chain_count[c["org"]["id"]] = chain_count.get(c["org"]["id"], 0) + 1
    for o in conn.execute(
        """SELECT o.id, o.canonical_name, o.type, o.is_national, COUNT(DISTINCT rr.report_url) n
           FROM organisations o JOIN report_receivers rr ON rr.organisation_id=o.id
           JOIN reports r ON r.url=rr.report_url AND r.duplicate_of IS NULL GROUP BY o.id"""
    ):
        rows["pub_orgs"].append((o["id"], o["canonical_name"], o["type"], bool(o["is_national"]), o["n"],
                                 chain_count.get(o["id"], 0)))

    # Receivers and the responses each receiver published.
    for rr in conn.execute(
        """SELECT rr.report_url, rr.organisation_id FROM report_receivers rr
           JOIN reports r ON r.url=rr.report_url AND r.duplicate_of IS NULL"""
    ):
        url, org = rr[0], rr[1]
        rows["pub_report_orgs"].append((url, org))
        for rs in web.responses_for(conn, url, org, red):
            rows["pub_responses"].append((url, org, rs["pdf_url"], rs["filename"], bool(rs.get("unmatched")),
                                          json.dumps(rs["promises"], ensure_ascii=False)))

    # Chains and links.
    for c in chains:
        d = details[c["key"]]
        detail = {k: d[k] for k in ("reports", "links", "followups", "dossier", "coroners", "areas")}
        rows["pub_chains"].append((c["key"], c["org"]["id"], c["org"]["name"], c["org"]["type"], c["hazard"],
                                   c["relation"], c["confidence"], c["first_date"], c["last_date"], c["n_reports"],
                                   len(c["coroners"]), c["theme"], c["has_dossier"], c["any_no_response"],
                                   (feat.index(c["key"]) if c["key"] in feat else None),
                                   json.dumps(detail, ensure_ascii=False)))
        for r in d["reports"]:
            rows["pub_chain_reports"].append((c["key"], r["url"]))
        for l in d["links"]:
            rows["pub_links"].append((c["key"], l["earlier"], l["later"], report_dates.get(l["later"]), l["relation"],
                                      l["confidence"], json.dumps({**l, "hazard": c["hazard"]}, ensure_ascii=False)))

    for s in _read(tmp / "systemic.json", []):
        rows["pub_systemic"].append((json.dumps(s, ensure_ascii=False),))

    # Live brief retrieval rows.
    report_rows = _read(tmp / "brief" / "reports.json", [])
    for f in (tmp / "brief").glob("*.json"):
        if f.name == "reports.json":
            continue
        org = int(f.stem)
        for cid, ri, quote, hazard, e in _read(f, []):
            rr = report_rows[ri]
            rows["pub_brief_concerns"].append((cid, org, rr[0], rr[2], quote, hazard, _vec(e)))
    idx = _read(tmp / "brief_index.json", {})
    for alias, oid in (idx.get("aliases") or {}).items():
        rows["pub_org_aliases"].append((alias, oid))

    last_refresh = _read(config.EXPORTS / "last_refresh.json", None)
    meta = {
        "site": site,
        "evaluation": _read(tmp / "evaluation.json", None),
        "brief_examples": _read(tmp / "brief_examples.json", []),
        "featured": feat,
        "published_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "last_refresh": last_refresh,
        "brief_dim": web.BRIEF_DIM,
    }
    rows["pub_meta"] = [(k, json.dumps(v, ensure_ascii=False)) for k, v in meta.items()]
    redirects = [tuple(r) for r in conn.execute("SELECT old_key, new_key FROM chain_redirects")]
    conn.close()
    return {"rows": rows, "redirects": redirects, "stats": stats}


INSERT_SQL = {
    "pub_meta": "INSERT INTO pub_meta (key, value) VALUES (%s, %s::jsonb)",
    "pub_orgs": "INSERT INTO pub_orgs (id, name, type, national, n_reports, n_chains) VALUES (%s,%s,%s,%s,%s,%s)",
    "pub_reports": "INSERT INTO pub_reports (url, slug, title, date, coroner, area, ref, categories, concerns, n_links) "
                   "VALUES (%s,%s,%s,%s,%s,%s,%s,%s::jsonb,%s::jsonb,%s)",
    "pub_report_orgs": "INSERT INTO pub_report_orgs VALUES (%s,%s) ON CONFLICT DO NOTHING",
    "pub_responses": "INSERT INTO pub_responses (report_url, org_id, pdf_url, filename, unmatched, promises) "
                     "VALUES (%s,%s,%s,%s,%s,%s::jsonb)",
    "pub_chains": "INSERT INTO pub_chains (key, org_id, org_name, org_type, hazard, relation, confidence, first_date, "
                  "last_date, n_reports, n_coroners, theme, has_dossier, any_no_response, featured, detail) "
                  "VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s::jsonb)",
    "pub_chain_reports": "INSERT INTO pub_chain_reports VALUES (%s,%s) ON CONFLICT DO NOTHING",
    "pub_links": "INSERT INTO pub_links (chain_key, earlier_url, later_url, later_date, relation, confidence, payload) "
                 "VALUES (%s,%s,%s,%s,%s,%s,%s::jsonb)",
    "pub_systemic": "INSERT INTO pub_systemic (payload) VALUES (%s::jsonb)",
    "pub_brief_concerns": "INSERT INTO pub_brief_concerns (id, org_id, report_url, date, quote, hazard, embedding) "
                          "VALUES (%s,%s,%s,%s,%s,%s,%s::vector) ON CONFLICT DO NOTHING",
    "pub_org_aliases": "INSERT INTO pub_org_aliases VALUES (%s,%s) ON CONFLICT DO NOTHING",
}

SEARCH_SQL = [
    """UPDATE pub_reports SET search =
         setweight(to_tsvector('english', coalesce(title,'')), 'A') ||
         setweight(to_tsvector('english', coalesce((SELECT string_agg(coalesce(x->>'hazard','') || ' ' || coalesce(x->>'quote',''), ' ')
                                                    FROM jsonb_array_elements(concerns) x), '')), 'B') ||
         setweight(to_tsvector('english', coalesce(coroner,'') || ' ' || coalesce(area,'') || ' ' || coalesce(ref,'')), 'C')""",
    "UPDATE pub_orgs SET search = setweight(to_tsvector('english', name), 'A')",
    """UPDATE pub_chains SET search =
         setweight(to_tsvector('english', hazard), 'A') || setweight(to_tsvector('english', org_name), 'A') ||
         setweight(to_tsvector('english', coalesce((SELECT string_agg(coalesce(l->>'earlier_quote','') || ' ' ||
                     coalesce(l->>'later_quote','') || ' ' || coalesce(l->>'explanation',''), ' ')
                   FROM jsonb_array_elements(detail->'links') l), '')), 'B') ||
         setweight(to_tsvector('english', coalesce(theme,'')), 'C')""",
]


def publish(conninfo: str | None = None) -> dict:
    import psycopg

    original = web.WEB_DATA
    try:
        with tempfile.TemporaryDirectory() as td:
            built = build_rows(Path(td))
    finally:
        web.WEB_DATA = original
    rows = built["rows"]
    with psycopg.connect(conninfo or dsn()) as pg:
        with pg.cursor() as cur:
            cur.execute(SCHEMA.read_text(encoding="utf-8"))
            first_seen = dict(cur.execute("SELECT url, first_seen FROM pub_reports").fetchall())
            for t in PUB_TABLES:
                cur.execute(f"DELETE FROM {t}")
            for t in PUB_TABLES:
                if rows[t]:
                    cur.executemany(INSERT_SQL[t], rows[t])
            # Keep the first time each report appeared; brand-new reports get now().
            if first_seen:
                cur.executemany("UPDATE pub_reports SET first_seen=%s WHERE url=%s",
                                [(ts, url) for url, ts in first_seen.items()])
            for sql in SEARCH_SQL:
                cur.execute(sql)
            for old, new in built["redirects"]:
                cur.execute("INSERT INTO chain_redirects VALUES (%s,%s) ON CONFLICT (old_key) DO UPDATE SET new_key=EXCLUDED.new_key",
                            (old, new))
            cur.execute("DELETE FROM chain_redirects WHERE old_key IN (SELECT key FROM pub_chains)")
        pg.commit()
    counts = {t: len(v) for t, v in rows.items()}
    return {"export": built["stats"], "rows": counts, "redirects": len(built["redirects"])}
