from __future__ import annotations

import re
from pathlib import Path

import pytest

from pipeline.llm import (
    LLM,
    BudgetExceeded,
    RequestError,
    SpendNotConfirmed,
    TransportError,
    confirm_full_run,
    parse_json_content,
    request_hash,
)
from tests.conftest import Replay, recorded

HELLO = [{"role": "user", "content": "Reply with the single word OK."}]


def test_recorded_call_is_costed_and_ledgered(ledger):
    t = Replay(recorded("hello_super"))
    llm = LLM(ledger, transport=t)
    r = llm.chat("dev", "super", HELLO, 8)
    assert r.content == "OK"
    assert not r.cache_hit
    assert r.cost == pytest.approx(r.input_tokens * 0.30e-6 + r.output_tokens * 0.90e-6)
    rows = ledger.rows()
    assert len(rows) == 1 and rows[0]["success"] == 1 and rows[0]["stage"] == "dev"
    body = t.requests[0][1]
    assert body["max_tokens"] == 8
    assert body["chat_template_kwargs"] == {"enable_thinking": False}


def test_second_identical_call_is_a_free_cache_hit(ledger):
    t = Replay(recorded("hello_nano"))
    llm = LLM(ledger, transport=t)
    first = llm.chat("dev", "nano", HELLO, 8)
    second = llm.chat("dev", "nano", HELLO, 8)
    assert second.cache_hit and second.cost == 0 and second.content == first.content
    assert len(t.requests) == 1
    assert ledger.spent("dev") == pytest.approx(first.cost)
    assert [r["cache_hit"] for r in ledger.rows()] == [1, 0]


def test_hash_changes_with_any_param():
    a = request_hash({"model": "m", "messages": HELLO, "max_tokens": 8})
    b = request_hash({"model": "m", "messages": HELLO, "max_tokens": 9})
    c = request_hash({"max_tokens": 8, "messages": HELLO, "model": "m"})
    assert a != b and a == c


def test_schema_response_is_parsed(ledger):
    llm = LLM(ledger, transport=Replay(recorded("schema_nano")))
    r = llm.chat("dev", "nano", HELLO, 24, response_format={"type": "json_schema"})
    assert r.parsed == {"colour": "blue"}


def test_reasoning_content_is_captured(ledger):
    llm = LLM(ledger, transport=Replay(recorded("think_super_low")))
    r = llm.chat("dev", "super", HELLO, 96, thinking=True, low_effort=True)
    assert r.reasoning and r.content.strip() == "OK"
    assert r.reasoning_tokens > 0


def test_thinking_flags_are_sent(ledger):
    t = Replay(recorded("think_super_low"))
    LLM(ledger, transport=t).chat("C", "super", HELLO, 96, thinking=True, low_effort=True)
    assert t.requests[0][1]["chat_template_kwargs"] == {"enable_thinking": True, "low_effort": True}


def test_stage_cap_blocks_before_sending(ledger):
    t = Replay(recorded("hello_ultra"))
    llm = LLM(ledger, transport=t, stage_caps={"D": 0.0001})
    with pytest.raises(BudgetExceeded):
        llm.chat("D", "ultra", HELLO, 4000)
    assert t.requests == []


def test_total_hard_stop_blocks(ledger):
    ledger.record(stage="A", model="x", cost=19.99999, cache_hit=0, request_hash="h", success=1)
    llm = LLM(ledger, transport=Replay(recorded("hello_super")))
    with pytest.raises(BudgetExceeded, match="hard stop"):
        llm.chat("C", "super", HELLO, 1500)


def test_unknown_stage_refused(ledger):
    with pytest.raises(BudgetExceeded, match="unknown stage"):
        LLM(ledger, transport=Replay()).chat("zzz", "nano", HELLO, 8)


def test_max_tokens_required(ledger):
    with pytest.raises(ValueError):
        LLM(ledger, transport=Replay()).chat("dev", "nano", HELLO, 0)


def test_one_retry_on_transport_error_then_success(ledger, monkeypatch):
    monkeypatch.setattr("pipeline.llm.time.sleep", lambda s: None)
    t = Replay(TransportError("ReadTimeout"), recorded("hello_nano"))
    r = LLM(ledger, transport=t).chat("dev", "nano", HELLO, 8)
    assert r.content == "OK" and len(t.requests) == 2


def test_gives_up_after_one_retry(ledger, monkeypatch):
    monkeypatch.setattr("pipeline.llm.time.sleep", lambda s: None)
    t = Replay(TransportError("a"), TransportError("b"), recorded("hello_nano"))
    with pytest.raises(TransportError):
        LLM(ledger, transport=t).chat("dev", "nano", HELLO, 8)
    assert len(t.requests) == 2
    assert ledger.rows()[0]["success"] == 0


def test_bad_request_never_retried(ledger):
    t = Replay((400, {"error": {"message": "bad schema"}}, {}), recorded("hello_nano"))
    with pytest.raises(RequestError):
        LLM(ledger, transport=t).chat("dev", "nano", HELLO, 8)
    assert len(t.requests) == 1


def test_truncated_response_not_cached(ledger):
    resp = recorded("hello_nano")
    resp["choices"][0]["finish_reason"] = "length"
    t = Replay(resp, recorded("hello_nano"))
    llm = LLM(ledger, transport=t)
    llm.chat("dev", "nano", HELLO, 8)
    r2 = llm.chat("dev", "nano", HELLO, 8)
    assert not r2.cache_hit and len(t.requests) == 2


def test_offline_mode_refuses_cache_miss(ledger):
    with pytest.raises(RuntimeError, match="offline"):
        LLM(ledger, transport=Replay(), offline=True).chat("dev", "nano", HELLO, 8)


def test_confirm_gate(ledger, capsys):
    llm = LLM(ledger, transport=Replay())
    with pytest.raises(SpendNotConfirmed):
        confirm_full_run(llm, "A", 6449, 0.0001, confirm_spend=False)
    assert "estimated" in capsys.readouterr().out
    with pytest.raises(BudgetExceeded):
        confirm_full_run(llm, "A", 6449, 0.01, confirm_spend=True)
    assert confirm_full_run(llm, "A", 6449, 0.0001, confirm_spend=True) == pytest.approx(0.6449)


def test_parse_json_content_tolerates_think_and_fences():
    assert parse_json_content('<think>x</think>\n```json\n{"a": 1}\n```') == {"a": 1}
    assert parse_json_content("noise {\"b\": 2} tail") == {"b": 2}
    assert parse_json_content("not json") is None


def test_embed_cached(ledger):
    resp = {"data": [{"index": 0, "embedding": [0.1, 0.2]}], "usage": {"prompt_tokens": 5}}
    t = Replay(resp)
    llm = LLM(ledger, transport=t)
    assert llm.embed("embed", ["x"]) == [[0.1, 0.2]]
    assert llm.embed("embed", ["x"]) == [[0.1, 0.2]]
    assert len(t.requests) == 1


def test_only_the_wrapper_talks_to_token_factory():
    """Rule 1: no other pipeline module may build its own Token Factory client."""
    root = Path(__file__).resolve().parent.parent / "pipeline"
    offenders = []
    for p in root.rglob("*.py"):
        if p.name in {"llm.py", "config.py"}:
            continue
        text = p.read_text(encoding="utf-8")
        if re.search(r"tokenfactory|from openai import|import openai|NEBIUS_API_KEY", text):
            offenders.append(str(p))
    assert offenders == []
