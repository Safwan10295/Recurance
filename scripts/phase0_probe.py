"""Phase 0 capability probes. Every call goes through pipeline.llm and is a few tokens.

Writes raw responses to tests/fixtures/recorded/ for offline tests, and prints a
summary (never the key).
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

from dotenv import load_dotenv

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
load_dotenv()

from pipeline import config  # noqa: E402
from pipeline.llm import LLM, Ledger, RequestError, spend_report  # noqa: E402

OUT = config.FIXTURES / "recorded"
OUT.mkdir(parents=True, exist_ok=True)
llm = LLM(Ledger())
results: dict[str, dict] = {}

SCHEMA = {
    "type": "json_schema",
    "json_schema": {
        "name": "probe",
        "strict": True,
        "schema": {
            "type": "object",
            "properties": {"colour": {"type": "string", "enum": ["red", "blue"]}},
            "required": ["colour"],
            "additionalProperties": False,
        },
    },
}


def run(name: str, **kw) -> None:
    try:
        r = llm.chat("dev", **kw)
        results[name] = {
            "ok": True, "content": r.content, "reasoning_present": bool(r.reasoning),
            "reasoning_chars": len(r.reasoning or ""), "in": r.input_tokens, "out": r.output_tokens,
            "reasoning_tokens": r.reasoning_tokens, "cost": r.cost, "cache_hit": r.cache_hit,
            "finish": r.finish_reason, "parsed": r.parsed, "headers": r.headers,
        }
        if not r.cache_hit:
            (OUT / f"{name}.json").write_text(json.dumps(r.raw, indent=2, ensure_ascii=False), encoding="utf-8")
    except RequestError as e:
        results[name] = {"ok": False, "error": str(e)}


hello = [{"role": "user", "content": "Reply with the single word OK."}]
which = [{"role": "user", "content": "Is the sky on a clear day red or blue? Answer as JSON."}]

# The three tiny wrapper calls.
for key in ("nano", "super", "ultra"):
    run(f"hello_{key}", model=key, messages=hello, max_tokens=8)

# json_schema support per Nemotron model.
for key in ("nano", "super", "ultra"):
    run(f"schema_{key}", model=key, messages=which, max_tokens=24, response_format=SCHEMA)

# Reasoning toggles pass through.
run("think_nano", model="nano", messages=hello, max_tokens=96, thinking=True)
run("think_super_low", model="super", messages=hello, max_tokens=96, thinking=True, low_effort=True)

# Cache: identical request again must be a free hit.
run("hello_nano_repeat", model="nano", messages=hello, max_tokens=8)

# Embedding model, with and without a reduced dimension.
try:
    v = llm.embed("embed", ["stopped vehicle in live lane"])
    v2 = llm.embed("embed", ["stopped vehicle in live lane"], dimensions=256)
    results["embed"] = {"ok": True, "dims_default": len(v[0]), "dims_256": len(v2[0])}
except RequestError as e:
    results["embed"] = {"ok": False, "error": str(e)}

Path("data/cache/phase0_probe.json").write_text(json.dumps(results, indent=2, ensure_ascii=False), encoding="utf-8")
for k, v in results.items():
    print(k, json.dumps(v, ensure_ascii=False)[:600])
print()
print(spend_report())
