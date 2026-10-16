"""Stable chain keys (SQLite only) and publishing to PostgreSQL (needs a local Postgres; skipped otherwise)."""
from __future__ import annotations

import json
import os
import uuid

import pytest

from pipeline import config, db
from tests.conftest import Replay
from tests.test_pipeline_db import _reply, _verdict, mini_db  # noqa: F401  (fixture reused)


def _judge_all(tmp_path):
    from pipeline.judge import recurrence
    from pipeline.link.candidates import build
    from pipeline.llm import LLM, Ledger

    build(tfidf_min=0.05, embed_min=0.5)
    conn = db.connect()
    ids = recurrence.pending_pairs(conn)
    conn.close()
    recurrence.run(LLM(Ledger(tmp_path / "l.sqlite"), transport=Replay(*[_reply(_verdict()) for _ in ids])), ids, threads=1)


def test_chain_keys_are_stable_across_rebuilds(mini_db, tmp_path):
    from pipeline.judge import chains

    _judge_all(tmp_path)
    chains.build()
    conn = db.connect()
    first = [r[0] for r in conn.execute("SELECT chain_key FROM chains")]
    conn.close()
    out = chains.build()
    conn = db.connect()
    second = [r[0] for r in conn.execute("SELECT chain_key FROM chains")]
    conn.close()
    assert first == second and out["redirected"] == 0


def _local_pg_url():
    from pipeline import env

    env.load()
    url = os.environ.get("DATABASE_URL", "")
    if "localhost" not in url and "127.0.0.1" not in url:
        return None
    try:
        import psycopg

        psycopg.connect(url, connect_timeout=3).close()
        return url
    except Exception:
        return None


@pytest.fixture
def pg_schema():
    url = _local_pg_url()
    if not url:
        pytest.skip("no local PostgreSQL available")
    import psycopg

    schema = f"rwtest_{uuid.uuid4().hex[:8]}"
    with psycopg.connect(url) as c:
        c.execute(f"CREATE SCHEMA {schema}")
        c.commit()
    sep = "&" if "?" in url else "?"
    yield f"{url}{sep}options=-csearch_path%3D{schema},public"
    with psycopg.connect(url) as c:
        c.execute(f"DROP SCHEMA {schema} CASCADE")
        c.commit()


def test_publish_only_display_safe_rows(mini_db, tmp_path, monkeypatch, pg_schema):
    import psycopg

    from pipeline.dossier import ultra
    from pipeline.judge import chains
    from pipeline.llm import LLM, Ledger
    from pipeline.publish.postgres import publish

    monkeypatch.setattr(config, "EXPORTS", tmp_path / "exports")
    conn = db.connect()
    conn.execute("INSERT INTO people_mentions VALUES (?, 'Dana Staff', 'staff')", (mini_db[1][0],))
    conn.execute("UPDATE concerns SET text_quote = 'Dana Staff said stopped vehicles in the live lane of the smart motorway' WHERE id=2")
    conn.commit()
    conn.close()
    _judge_all(tmp_path)
    chains.build()
    conn = db.connect()
    key = conn.execute("SELECT chain_key FROM chains").fetchone()[0]
    conn.close()
    dossier = {"timeline": [], "narrative": "A similar concern was raised again.", "questions": ["What changed?"]}
    ultra.run(LLM(Ledger(tmp_path / "l2.sqlite"), transport=Replay(_reply(dossier))), [key])

    res = publish(pg_schema)
    assert res["rows"]["pub_chains"] == 1 and res["rows"]["pub_links"] >= 1
    with psycopg.connect(pg_schema) as c:
        detail = c.execute("SELECT detail FROM pub_chains").fetchone()[0]
        reports = [r[0] for r in c.execute("SELECT concerns FROM pub_reports")]
        assert detail["dossier"] is None  # unreviewed dossiers are never published
        text = json.dumps(detail) + json.dumps(reports)
        assert "Dana Staff" not in text and "[name redacted]" in text
        assert c.execute("SELECT COUNT(*) FROM pub_reports").fetchone()[0] == 3
        hits = c.execute("SELECT COUNT(*) FROM pub_chains WHERE search @@ websearch_to_tsquery('english', 'motorway')").fetchone()[0]
        assert hits == 1
        first_seen = c.execute("SELECT first_seen FROM pub_reports ORDER BY url LIMIT 1").fetchone()[0]
        # Hazard map: one point per verified concern, and the shown link drawn between two of them.
        assert c.execute("SELECT COUNT(*) FROM pub_hazard_points").fetchone()[0] == 3
        assert c.execute("SELECT COUNT(*) FROM pub_hazard_links").fetchone()[0] >= 1
        pipeline = c.execute("SELECT value FROM pub_meta WHERE key = 'pipeline'").fetchone()[0]
        assert pipeline["funnel"]["reports"] == 3 and pipeline["funnel"]["links"] >= 1

    publish(pg_schema)  # a second publish keeps first_seen
    with psycopg.connect(pg_schema) as c:
        assert c.execute("SELECT first_seen FROM pub_reports ORDER BY url LIMIT 1").fetchone()[0] == first_seen
