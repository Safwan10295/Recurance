"""Stage logic on a small synthetic database. Recorded-style fixtures only; no network."""
from __future__ import annotations

import json

import numpy as np
import pytest

from pipeline import config, db
from tests.conftest import Replay


@pytest.fixture
def mini_db(tmp_path, monkeypatch):
    p = tmp_path / "rw.sqlite"
    monkeypatch.setattr(config, "DB_PATH", p)
    monkeypatch.setattr(config, "LEDGER_PATH", tmp_path / "ledger.sqlite")
    conn = db.connect(p)
    reports = [
        ("https://www.judiciary.uk/prevention-of-future-death-reports/a/", "2019-0001", "2019-01-10", "Ann Coroner", "North",
         "Alan Able: Prevention of future deaths report",
         "There is no hard shoulder on the smart motorway so stopped vehicles are struck in the live lane at night."),
        ("https://www.judiciary.uk/prevention-of-future-death-reports/b/", "2021-0002", "2021-06-01", "Bob Coroner", "South",
         "Betty Baker: Prevention of future deaths report",
         "Stopped vehicles in the live lane of the smart motorway are at risk because there is no hard shoulder. "
         "A previous Regulation 28 report concerning Alan Able (2019-0001) raised this."),
        ("https://www.judiciary.uk/prevention-of-future-death-reports/c/", "2021-0003", "2021-07-01", "Cat Coroner", "East",
         "Carl Cook: Prevention of future deaths report", "Ward staffing levels at night were too low to observe patients."),
    ]
    for url, ref, d, cor, area, title, concerns in reports:
        conn.execute(
            "INSERT INTO reports (url, slug, ref, report_date, coroner, area, title, deceased_title, concerns, body_text, prior_reference) "
            "VALUES (?,?,?,?,?,?,?,?,?,?,?)", (url, url.rstrip('/').rsplit('/', 1)[-1], ref, d, cor, area, title, title,
                                               concerns, concerns, int("previous" in concerns.lower())))
    conn.execute("INSERT INTO organisations (id, canonical_name, type, is_national) VALUES (1,'National Highways','national_body',1)")
    for url, *_ in reports:
        conn.execute("INSERT INTO report_receivers VALUES (?,1,'National Highways')", (url,))
    rng = np.random.default_rng(0)
    base = rng.normal(size=1024).astype(np.float32)
    other = rng.normal(size=1024).astype(np.float32)
    vecs = [base, base + 0.05 * rng.normal(size=1024).astype(np.float32), other]
    for i, ((url, *_rest), v) in enumerate(zip(reports, vecs)):
        v = v / np.linalg.norm(v)
        conn.execute(
            "INSERT INTO concerns (id, report_url, idx, text_quote, hazard, mechanism, setting, quote_verified, embedding) "
            "VALUES (?,?,?,?,?,?,?,1,?)", (i + 1, url, 0, _rest[-1][:90], "stopped vehicles in live lane" if i < 2 else "night staffing",
                                           "collision", "motorway", v.astype(np.float32).tobytes()))
    conn.commit()
    conn.close()
    return reports


def test_candidates_keep_only_six_month_pairs(mini_db):
    from pipeline.link.candidates import build

    res = build(tfidf_min=0.05, embed_min=0.5)
    pairs = res["_pairs"]
    keys = {(p["earlier_concern_id"], p["later_concern_id"]) for p in pairs}
    assert (1, 2) in keys
    assert (2, 3) not in keys  # one month apart
    assert all(p["days_apart"] >= config.MIN_DAYS_APART for p in pairs)
    p12 = next(p for p in pairs if (p["earlier_concern_id"], p["later_concern_id"]) == (1, 2))
    assert p12["same_coroner"] == 0 and p12["same_area"] == 0


def test_acknowledged_pairs_and_mask(mini_db):
    from pipeline.evaluate.acknowledged import find_pairs, mask_text

    pairs = find_pairs()
    assert len(pairs) == 1
    p = pairs[0]
    assert p["earlier_url"].endswith("/a/") and p["later_url"].endswith("/b/")
    assert set(p["evidence"]) == {"ref", "name"} and p["in_scope"]
    masked = mask_text(mini_db[1][-1], {"title": mini_db[0][5], "ref": "2019-0001"})
    assert "Able" not in masked and "2019-0001" not in masked and "hard shoulder" in masked


def _verdict(relation="identical", conf=0.9, eq=None, lq=None):
    return {"relation": relation, "same_hazard_explanation": "Both concern stopped vehicles in a live lane. The setting matches.",
            "earlier_quote": eq or "no hard shoulder on the smart motorway so stopped vehicles are struck",
            "later_quote": lq or "Stopped vehicles in the live lane of the smart motorway are at risk",
            "promise_quote": None, "later_after_promise": False, "confidence": conf}


def _reply(obj):
    return {"choices": [{"message": {"content": json.dumps(obj), "reasoning_content": "brief"}, "finish_reason": "stop"}],
            "usage": {"prompt_tokens": 900, "completion_tokens": 120}}


def test_judge_verifies_quotes_and_builds_chain(mini_db, tmp_path):
    from pipeline.judge import chains, recurrence
    from pipeline.link.candidates import build
    from pipeline.llm import LLM, Ledger

    build(tfidf_min=0.05, embed_min=0.5)
    conn = db.connect()
    ids = recurrence.pending_pairs(conn)
    conn.close()
    llm = LLM(Ledger(tmp_path / "l.sqlite"), transport=Replay(*[_reply(_verdict()) for _ in ids]))
    res = recurrence.run(llm, ids, threads=1)
    assert res["ok"] == len(ids) and res["verified"] == len(ids)
    out = chains.build()
    assert out["chains"] == 1
    # A second run must not re-judge anything (no blind retries, no double spend).
    conn = db.connect()
    assert recurrence.pending_pairs(conn) == []
    conn.close()


def test_unverified_quote_is_never_shown(mini_db, tmp_path):
    from pipeline.judge import chains, recurrence
    from pipeline.link.candidates import build
    from pipeline.llm import LLM, Ledger

    build(tfidf_min=0.05, embed_min=0.5)
    conn = db.connect()
    ids = recurrence.pending_pairs(conn)
    conn.close()
    bad = _verdict(eq="these words do not appear anywhere in the earlier report at all")
    llm = LLM(Ledger(tmp_path / "l.sqlite"), transport=Replay(*[_reply(bad) for _ in ids]))
    recurrence.run(llm, ids, threads=1)
    assert chains.build()["chains"] == 0


def test_blaming_explanation_is_withheld(mini_db, tmp_path):
    from pipeline.judge import chains, recurrence
    from pipeline.link.candidates import build
    from pipeline.llm import LLM, Ledger

    build(tfidf_min=0.05, embed_min=0.5)
    conn = db.connect()
    ids = recurrence.pending_pairs(conn)
    conn.close()
    v = _verdict()
    v["same_hazard_explanation"] = "The organisation ignored the earlier warning."
    llm = LLM(Ledger(tmp_path / "l.sqlite"), transport=Replay(*[_reply(v) for _ in ids]))
    recurrence.run(llm, ids, threads=1)
    assert chains.build()["chains"] == 0


def test_stage_a_extraction_verifies_and_marks(mini_db, tmp_path):
    from pipeline.extract import concerns as A
    from pipeline.llm import LLM, Ledger

    out = {"concerns": [
        {"quote": "Ward staffing levels at night were too low to observe patients.", "hazard": "night staffing",
         "mechanism": "unobserved patients", "setting": "ward", "addressed_to": []},
        {"quote": "an invented sentence that is not present in the report text", "hazard": "x", "mechanism": "y",
         "setting": "z", "addressed_to": []}],
        "people": [{"name": "Jane Doe", "role": "staff"}]}
    conn = db.connect()
    conn.execute("DELETE FROM concerns")
    conn.commit()
    rows = A.eligible(conn)
    conn.close()
    llm = LLM(Ledger(tmp_path / "l.sqlite"), transport=Replay(*[_reply(out) for _ in rows]))
    res = A.run(llm, rows, threads=1)
    assert res["ok"] == 3 and res["quotes"] == 6
    conn = db.connect()
    c3 = conn.execute("SELECT quote_verified FROM concerns WHERE report_url LIKE '%/c/' ORDER BY idx").fetchall()
    assert [r[0] for r in c3] == [1, 0]
    assert A.eligible(conn) == []  # marked as done
    conn.close()


def test_dossier_never_reviewed_by_default(mini_db, tmp_path):
    from pipeline.dossier import ultra
    from pipeline.judge import chains, recurrence
    from pipeline.link.candidates import build
    from pipeline.llm import LLM, Ledger

    build(tfidf_min=0.05, embed_min=0.5)
    conn = db.connect()
    ids = recurrence.pending_pairs(conn)
    conn.close()
    lg = Ledger(tmp_path / "l.sqlite")
    recurrence.run(LLM(lg, transport=Replay(*[_reply(_verdict()) for _ in ids])), ids, threads=1)
    chains.build()
    conn = db.connect()
    key = conn.execute("SELECT chain_key FROM chains").fetchone()[0]
    conn.close()
    dossier = {"timeline": [{"date": "2019-01-10", "event": "warning", "summary": "A concern was raised.",
                             "quote": None, "source_ref": "S1"}],
               "narrative": "A similar concern was raised again.", "questions": ["What changed?"]}
    res = ultra.run(LLM(lg, transport=Replay(_reply(dossier))), [key])
    assert res["ok"] == 1
    conn = db.connect()
    assert conn.execute("SELECT reviewed_by_human FROM dossiers").fetchone()[0] == 0
    conn.close()


def test_export_hides_unreviewed_dossier_and_redacts(mini_db, tmp_path, monkeypatch):
    from pipeline.dossier import ultra
    from pipeline.export import web
    from pipeline.judge import chains, recurrence
    from pipeline.link.candidates import build
    from pipeline.llm import LLM, Ledger

    monkeypatch.setattr(web, "WEB_DATA", tmp_path / "webdata")
    monkeypatch.setattr(config, "EXPORTS", tmp_path / "exports")
    build(tfidf_min=0.05, embed_min=0.5)
    conn = db.connect()
    conn.execute("INSERT INTO people_mentions VALUES (?, 'Dana Staff', 'staff')", (mini_db[1][0],))
    conn.execute("UPDATE concerns SET text_quote = 'Dana Staff said stopped vehicles in the live lane of the smart motorway' WHERE id=2")
    conn.commit()
    ids = recurrence.pending_pairs(conn)
    conn.close()
    lg = Ledger(tmp_path / "l.sqlite")
    recurrence.run(LLM(lg, transport=Replay(*[_reply(_verdict()) for _ in ids])), ids, threads=1)
    chains.build()
    conn = db.connect()
    key = conn.execute("SELECT chain_key FROM chains").fetchone()[0]
    conn.close()
    dossier = {"timeline": [], "narrative": "A similar concern was raised again.", "questions": ["What changed?"]}
    ultra.run(LLM(lg, transport=Replay(_reply(dossier))), [key])
    res = web.export()
    assert res["chains"] == 1
    detail = json.loads((tmp_path / "webdata" / "chains" / f"{key}.json").read_text(encoding="utf-8"))
    assert detail["dossier"] is None  # unreviewed stays hidden
    text = json.dumps(detail)
    assert "Dana Staff" not in text and "[name redacted]" in text
    assert all(l["relation"] in ("identical", "closely_related") for l in detail["links"])


def test_transport_failure_is_retryable_but_schema_failure_is_not(mini_db, tmp_path, monkeypatch):
    from pipeline.extract import concerns as A
    from pipeline.llm import LLM, Ledger, TransportError

    monkeypatch.setattr("pipeline.llm.time.sleep", lambda s: None)
    conn = db.connect()
    rows = A.eligible(conn)[:2]
    conn.close()
    bad_schema = {"choices": [{"message": {"content": "{\"nope\": 1}"}, "finish_reason": "stop"}],
                  "usage": {"prompt_tokens": 10, "completion_tokens": 3}}
    t = Replay(TransportError("a"), TransportError("b"), bad_schema)
    A.run(LLM(Ledger(tmp_path / "l.sqlite"), transport=t), rows, threads=1)
    conn = db.connect()
    left = {r["url"] for r in A.eligible(conn)}
    status = dict(conn.execute("SELECT item_id, status FROM stage_items").fetchall())
    conn.close()
    assert sorted(status.values()) == ["failed", "transient"]
    transient_url = next(u for u, s in status.items() if s == "transient")
    failed_url = next(u for u, s in status.items() if s == "failed")
    assert transient_url in left and failed_url not in left


def test_rate_limiter_paces_by_tokens(monkeypatch):
    from pipeline.config import MODELS
    from pipeline.llm import _RateLimiter

    slept = []
    monkeypatch.setattr("pipeline.llm.time.sleep", lambda s: slept.append(s))
    rl = _RateLimiter()
    for _ in range(3):
        rl.wait(MODELS["super"], est_tokens=40_000)  # 40k of a 160k/min budget: one call per 15 s
    assert slept and max(slept) > 20


def test_systemic_clusters_span_organisations(tmp_path, monkeypatch):
    from pipeline.link import systemic

    p = tmp_path / "s.sqlite"
    monkeypatch.setattr(config, "DB_PATH", p)
    conn = db.connect(p)
    rng = np.random.default_rng(1)
    base = rng.normal(size=1024).astype(np.float32)
    other = rng.normal(size=1024).astype(np.float32)
    rows = [("u1", "2016-01-01", 1, base), ("u2", "2018-01-01", 2, base + 0.01), ("u3", "2021-01-01", 3, base + 0.02),
            ("u4", "2021-02-01", 4, other)]
    for i, (u, d, org, v) in enumerate(rows, 1):
        url = f"https://www.judiciary.uk/prevention-of-future-death-reports/{u}/"
        conn.execute("INSERT INTO reports (url, slug, report_date, title, concerns) VALUES (?,?,?,?,?)",
                     (url, u, d, f"{u} title", "Paraffin based emollients soaked into clothing increase fire risk"))
        conn.execute("INSERT OR IGNORE INTO organisations (id, canonical_name) VALUES (?,?)", (org, f"Org {org}"))
        conn.execute("INSERT INTO report_receivers VALUES (?,?,?)", (url, org, f"Org {org}"))
        v = v / np.linalg.norm(v)
        conn.execute("INSERT INTO concerns (id, report_url, idx, text_quote, hazard, quote_verified, embedding) "
                     "VALUES (?,?,0,?,?,1,?)", (i, url, "Paraffin based emollients soaked into clothing", "emollient fires",
                                                v.astype(np.float32).tobytes()))
    conn.commit()
    clusters = systemic.find_clusters(conn)
    conn.close()
    assert len(clusters) == 1
    c = clusters[0]
    assert c["n_orgs"] == 3 and c["years"] == 5
    assert {m["report_url"].rsplit("/", 2)[-2] for m in c["members"]} == {"u1", "u2", "u3"}
