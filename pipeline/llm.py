"""The single wrapper for every Nebius Token Factory call.

Rules enforced here (handoff section 6.3):
  1. Every call goes through LLM.chat or LLM.embed. Nothing else creates a client.
  2. Every call, including cache hits and failures, is written to llm_calls.
  3. Responses are cached by a hash of (model, messages, params). A cache hit costs nothing.
  4. Before each call the worst-case cost is reserved against the stage cap and the
     $20 pipeline hard stop. A call that could cross either is refused.
  5. max_tokens is mandatory.
  6. At most one retry, and only on transport errors. Bad requests are never retried.

The API key is read from the environment only and is never logged or stored.
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import sqlite3
import threading
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

from . import config
from .config import MODELS, STAGE_CAPS, TOTAL_HARD_STOP, Model


class BudgetExceeded(RuntimeError):
    pass


class SpendNotConfirmed(RuntimeError):
    pass


class TransportError(RuntimeError):
    """Network, timeout, 429 or 5xx. Eligible for exactly one retry."""


class RequestError(RuntimeError):
    """4xx other than 429. Never retried."""


LEDGER_SCHEMA = """
CREATE TABLE IF NOT EXISTS llm_calls (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts TEXT NOT NULL,
    stage TEXT NOT NULL,
    model TEXT NOT NULL,
    input_tokens INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0,
    reasoning_tokens INTEGER NOT NULL DEFAULT 0,
    cost REAL NOT NULL DEFAULT 0,
    cache_hit INTEGER NOT NULL,
    request_hash TEXT NOT NULL,
    success INTEGER NOT NULL,
    error TEXT,
    latency_ms INTEGER,
    item_id TEXT,
    key_label TEXT NOT NULL DEFAULT 'pipeline'
);
CREATE INDEX IF NOT EXISTS llm_calls_stage ON llm_calls(stage);
CREATE TABLE IF NOT EXISTS llm_cache (
    request_hash TEXT PRIMARY KEY,
    model TEXT NOT NULL,
    response_json TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS tavily_calls (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts TEXT NOT NULL,
    stage TEXT NOT NULL,
    endpoint TEXT NOT NULL,
    query_hash TEXT NOT NULL,
    credits REAL NOT NULL DEFAULT 0,
    cached INTEGER NOT NULL,
    success INTEGER NOT NULL,
    error TEXT
);
CREATE TABLE IF NOT EXISTS tavily_cache (
    query_hash TEXT PRIMARY KEY,
    endpoint TEXT NOT NULL,
    response_json TEXT NOT NULL,
    created_at TEXT NOT NULL
);
"""


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def request_hash(payload: dict[str, Any]) -> str:
    canonical = json.dumps(payload, sort_keys=True, ensure_ascii=False, separators=(",", ":"))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def estimate_tokens(text: str) -> int:
    # Deliberately pessimistic (about 3 chars per token) so reservations over-estimate.
    return max(1, len(text) // 3 + 8)


def cost_of(model: Model, input_tokens: int, output_tokens: int) -> float:
    return input_tokens * model.input_price + output_tokens * model.output_price


class Ledger:
    """SQLite ledger and response cache. Safe to share across threads."""

    def __init__(self, path: Path | str | None = None):
        self.path = Path(path or config.LEDGER_PATH)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()
        self._conn = sqlite3.connect(str(self.path), check_same_thread=False, isolation_level=None)
        self._conn.execute("PRAGMA journal_mode=WAL")
        self._conn.executescript(LEDGER_SCHEMA)

    def close(self) -> None:
        self._conn.close()

    def spent(self, stage: str | None = None, key_label: str = "pipeline") -> float:
        q = "SELECT COALESCE(SUM(cost),0) FROM llm_calls WHERE cache_hit=0 AND key_label=?"
        args: list[Any] = [key_label]
        if stage is not None:
            q += " AND stage=?"
            args.append(stage)
        with self._lock:
            return float(self._conn.execute(q, args).fetchone()[0])

    def spend_by_stage(self, key_label: str = "pipeline") -> dict[str, float]:
        with self._lock:
            rows = self._conn.execute(
                "SELECT stage, COALESCE(SUM(cost),0) FROM llm_calls WHERE cache_hit=0 AND key_label=? GROUP BY stage",
                (key_label,),
            ).fetchall()
        return {s: float(c) for s, c in rows}

    def record(self, **row: Any) -> None:
        row.setdefault("ts", _now())
        cols = ",".join(row)
        qs = ",".join("?" for _ in row)
        with self._lock:
            self._conn.execute(f"INSERT INTO llm_calls ({cols}) VALUES ({qs})", list(row.values()))

    def cache_get(self, h: str) -> dict | None:
        with self._lock:
            r = self._conn.execute("SELECT response_json FROM llm_cache WHERE request_hash=?", (h,)).fetchone()
        return json.loads(r[0]) if r else None

    def cache_put(self, h: str, model: str, response: dict) -> None:
        with self._lock:
            self._conn.execute(
                "INSERT OR REPLACE INTO llm_cache VALUES (?,?,?,?)",
                (h, model, json.dumps(response, ensure_ascii=False), _now()),
            )

    def rows(self, limit: int = 50) -> list[dict]:
        with self._lock:
            cur = self._conn.execute("SELECT * FROM llm_calls ORDER BY id DESC LIMIT ?", (limit,))
            names = [d[0] for d in cur.description]
            return [dict(zip(names, r)) for r in cur.fetchall()]

    # Tavily helpers share the same file so all external spend is in one place.
    def tavily_credits(self, stage: str | None = None) -> float:
        q = "SELECT COALESCE(SUM(credits),0) FROM tavily_calls WHERE cached=0"
        args: list[Any] = []
        if stage:
            q += " AND stage=?"
            args.append(stage)
        with self._lock:
            return float(self._conn.execute(q, args).fetchone()[0])

    def tavily_record(self, **row: Any) -> None:
        row.setdefault("ts", _now())
        cols = ",".join(row)
        qs = ",".join("?" for _ in row)
        with self._lock:
            self._conn.execute(f"INSERT INTO tavily_calls ({cols}) VALUES ({qs})", list(row.values()))

    def tavily_cache_get(self, h: str) -> dict | None:
        with self._lock:
            r = self._conn.execute("SELECT response_json FROM tavily_cache WHERE query_hash=?", (h,)).fetchone()
        return json.loads(r[0]) if r else None

    def tavily_cache_put(self, h: str, endpoint: str, response: dict) -> None:
        with self._lock:
            self._conn.execute(
                "INSERT OR REPLACE INTO tavily_cache VALUES (?,?,?,?)",
                (h, endpoint, json.dumps(response, ensure_ascii=False), _now()),
            )


@dataclass
class ChatResult:
    content: str
    reasoning: str | None
    parsed: Any
    input_tokens: int
    output_tokens: int
    reasoning_tokens: int
    cost: float
    cache_hit: bool
    request_hash: str
    finish_reason: str | None
    headers: dict[str, str] = field(default_factory=dict)
    raw: dict = field(default_factory=dict)


# A transport takes (path, json_body) and returns (status, response_json, headers).
Transport = Callable[[str, dict], tuple[int, dict, dict]]


def _default_transport(api_key: str) -> Transport:
    import httpx

    client = httpx.Client(
        base_url=config.BASE_URL,
        headers={"Authorization": f"Bearer {api_key}"},
        timeout=httpx.Timeout(180.0, connect=20.0),
    )

    def send(path: str, body: dict) -> tuple[int, dict, dict]:
        try:
            r = client.post(path, json=body)
        except httpx.TransportError as e:  # connection, read timeout, etc.
            raise TransportError(type(e).__name__) from None
        headers = {k.lower(): v for k, v in r.headers.items() if k.lower().startswith("x-ratelimit")}
        try:
            data = r.json()
        except ValueError:
            data = {"error": {"message": r.text[:500]}}
        return r.status_code, data, headers

    return send


_THINK_RE = re.compile(r"<think>.*?</think>", re.S)
_FENCE_RE = re.compile(r"^```(?:json)?\s*|\s*```$", re.S)


def parse_json_content(text: str) -> Any:
    """Parse model output as JSON, tolerating a <think> block or code fences."""
    t = _THINK_RE.sub("", text or "").strip()
    t = _FENCE_RE.sub("", t).strip()
    try:
        return json.loads(t)
    except ValueError:
        pass
    start, end = t.find("{"), t.rfind("}")
    if start != -1 and end > start:
        try:
            return json.loads(t[start : end + 1])
        except ValueError:
            return None
    return None


class _RateLimiter:
    """Paces calls under both the requests-per-minute and tokens-per-minute limits (at 80%)."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._next: dict[str, float] = {}

    def wait(self, model: Model, est_tokens: int = 0, fraction: float = 0.8) -> None:
        by_requests = 60.0 / max(1.0, model.rpm * fraction)
        by_tokens = est_tokens * 60.0 / max(1.0, model.tpm * fraction)
        interval = max(by_requests, by_tokens)
        with self._lock:
            now = time.monotonic()
            slot = max(now, self._next.get(model.key, now))
            self._next[model.key] = slot + interval
        delay = slot - time.monotonic()
        if delay > 0:
            time.sleep(delay)


class LLM:
    def __init__(
        self,
        ledger: Ledger | None = None,
        transport: Transport | None = None,
        key_label: str = "pipeline",
        hard_stop: float = TOTAL_HARD_STOP,
        stage_caps: dict[str, float] | None = None,
        offline: bool = False,
    ):
        self.ledger = ledger or Ledger()
        self.key_label = key_label
        self.hard_stop = hard_stop
        self.stage_caps = dict(stage_caps or STAGE_CAPS)
        self.offline = offline  # cache-only: any miss raises instead of calling out
        self._transport = transport
        self._reserved: dict[str, float] = {}
        self._reserve_lock = threading.Lock()
        self._limiter = _RateLimiter()

    # --- transport -----------------------------------------------------------------
    def _send(self, path: str, body: dict) -> tuple[int, dict, dict]:
        if self._transport is None:
            key = os.environ.get("NEBIUS_API_KEY")
            if not key:
                raise RuntimeError("NEBIUS_API_KEY is not set in the environment")
            self._transport = _default_transport(key)
        return self._transport(path, body)

    def _send_with_one_retry(self, path: str, body: dict) -> tuple[int, dict, dict]:
        for attempt in (1, 2):
            try:
                status, data, headers = self._send(path, body)
            except TransportError:
                if attempt == 2:
                    raise
                time.sleep(5)
                continue
            if status == 429 or status >= 500:
                if attempt == 2:
                    raise TransportError(f"HTTP {status}: {str(data)[:200]}")
                time.sleep(15 if status == 429 else 5)
                continue
            if status >= 400:
                msg = (data.get("error") or {}).get("message") if isinstance(data.get("error"), dict) else data.get("detail") or data
                raise RequestError(f"HTTP {status}: {str(msg)[:400]}")
            return status, data, headers
        raise TransportError("unreachable")

    # --- budget --------------------------------------------------------------------
    def _reserve(self, stage: str, amount: float) -> str:
        if stage not in self.stage_caps:
            raise BudgetExceeded(f"unknown stage {stage!r}; add a cap in config.STAGE_CAPS first")
        with self._reserve_lock:
            in_flight_total = sum(self._reserved.values())
            in_flight_stage = sum(v for k, v in self._reserved.items() if k.startswith(stage + "|"))
            total = self.ledger.spent(key_label=self.key_label) + in_flight_total + amount
            stage_total = self.ledger.spent(stage, key_label=self.key_label) + in_flight_stage + amount
            if total > self.hard_stop:
                raise BudgetExceeded(f"total spend would reach ${total:.4f}, hard stop is ${self.hard_stop:.2f}")
            if stage_total > self.stage_caps[stage]:
                raise BudgetExceeded(
                    f"stage {stage} would reach ${stage_total:.4f}, cap is ${self.stage_caps[stage]:.2f}"
                )
            token = f"{stage}|{time.monotonic_ns()}|{threading.get_ident()}"
            self._reserved[token] = amount
            return token

    def _release(self, token: str) -> None:
        with self._reserve_lock:
            self._reserved.pop(token, None)

    def remaining(self, stage: str) -> float:
        return self.stage_caps[stage] - self.ledger.spent(stage, key_label=self.key_label)

    # --- chat ----------------------------------------------------------------------
    def chat(
        self,
        stage: str,
        model: str,
        messages: list[dict],
        max_tokens: int,
        *,
        temperature: float = 0.0,
        response_format: dict | None = None,
        thinking: bool = False,
        low_effort: bool = False,
        extra_body: dict | None = None,
        item_id: str | None = None,
        use_cache: bool = True,
    ) -> ChatResult:
        if not isinstance(max_tokens, int) or max_tokens <= 0:
            raise ValueError("max_tokens must be a positive int")
        m = MODELS[model]
        body: dict[str, Any] = {
            "model": m.id,
            "messages": messages,
            "max_tokens": max_tokens,
            "temperature": temperature,
        }
        if response_format is not None:
            body["response_format"] = response_format
        kwargs: dict[str, Any] = {"enable_thinking": bool(thinking)}
        if thinking and low_effort:
            kwargs["low_effort"] = True
        body["chat_template_kwargs"] = kwargs
        if extra_body:
            body.update(extra_body)

        h = request_hash(body)
        if use_cache:
            cached = self.ledger.cache_get(h)
            if cached is not None:
                res = self._to_result(m, cached, h, cache_hit=True, headers={})
                self.ledger.record(
                    stage=stage, model=m.id, input_tokens=res.input_tokens, output_tokens=res.output_tokens,
                    reasoning_tokens=res.reasoning_tokens, cost=0.0, cache_hit=1, request_hash=h, success=1,
                    latency_ms=0, item_id=item_id, key_label=self.key_label,
                )
                return res
        if self.offline:
            raise RuntimeError(f"offline mode: cache miss for {h[:12]}")

        prompt_text = json.dumps(messages, ensure_ascii=False)
        est_in = estimate_tokens(prompt_text)
        worst = cost_of(m, est_in, max_tokens)
        token = self._reserve(stage, worst)
        t0 = time.monotonic()
        try:
            # Typical output is well under max_tokens; half of it is a fair pacing estimate.
            self._limiter.wait(m, int(est_in * 0.75) + max_tokens // 2)
            _, data, headers = self._send_with_one_retry("chat/completions", body)
        except Exception as e:
            self.ledger.record(
                stage=stage, model=m.id, cost=0.0, cache_hit=0, request_hash=h, success=0,
                error=f"{type(e).__name__}: {str(e)[:300]}", latency_ms=int((time.monotonic() - t0) * 1000),
                item_id=item_id, key_label=self.key_label,
            )
            raise
        finally:
            self._release(token)
        res = self._to_result(m, data, h, cache_hit=False, headers=headers)
        self.ledger.record(
            stage=stage, model=m.id, input_tokens=res.input_tokens, output_tokens=res.output_tokens,
            reasoning_tokens=res.reasoning_tokens, cost=res.cost, cache_hit=0, request_hash=h, success=1,
            latency_ms=int((time.monotonic() - t0) * 1000), item_id=item_id, key_label=self.key_label,
        )
        if use_cache and res.finish_reason != "length":
            self.ledger.cache_put(h, m.id, data)
        return res

    def _to_result(self, m: Model, data: dict, h: str, cache_hit: bool, headers: dict) -> ChatResult:
        choice = (data.get("choices") or [{}])[0]
        msg = choice.get("message") or {}
        content = msg.get("content") or ""
        reasoning = msg.get("reasoning_content") or msg.get("reasoning")
        usage = data.get("usage") or {}
        it = int(usage.get("prompt_tokens") or 0)
        ot = int(usage.get("completion_tokens") or 0)
        rt = int(((usage.get("completion_tokens_details") or {}).get("reasoning_tokens")) or 0)
        return ChatResult(
            content=content,
            reasoning=reasoning,
            parsed=parse_json_content(content),
            input_tokens=it,
            output_tokens=ot,
            reasoning_tokens=rt,
            cost=0.0 if cache_hit else cost_of(m, it, ot),
            cache_hit=cache_hit,
            request_hash=h,
            finish_reason=choice.get("finish_reason"),
            headers=headers,
            raw=data,
        )

    # --- embeddings ----------------------------------------------------------------
    def embed(self, stage: str, texts: list[str], *, dimensions: int | None = None, item_id: str | None = None) -> list[list[float]]:
        m = MODELS["embed"]
        body: dict[str, Any] = {"model": m.id, "input": texts}
        if dimensions:
            body["dimensions"] = dimensions
        h = request_hash(body)
        cached = self.ledger.cache_get(h)
        if cached is not None:
            self.ledger.record(stage=stage, model=m.id, input_tokens=int((cached.get("usage") or {}).get("prompt_tokens") or 0),
                               cost=0.0, cache_hit=1, request_hash=h, success=1, latency_ms=0, item_id=item_id,
                               key_label=self.key_label)
            return [d["embedding"] for d in sorted(cached["data"], key=lambda d: d["index"])]
        if self.offline:
            raise RuntimeError(f"offline mode: cache miss for {h[:12]}")
        worst = cost_of(m, sum(estimate_tokens(t) for t in texts), 0)
        token = self._reserve(stage, worst)
        t0 = time.monotonic()
        try:
            self._limiter.wait(m)
            _, data, _ = self._send_with_one_retry("embeddings", body)
        except Exception as e:
            self.ledger.record(stage=stage, model=m.id, cost=0.0, cache_hit=0, request_hash=h, success=0,
                               error=f"{type(e).__name__}: {str(e)[:300]}", item_id=item_id, key_label=self.key_label)
            raise
        finally:
            self._release(token)
        it = int((data.get("usage") or {}).get("prompt_tokens") or 0)
        self.ledger.record(stage=stage, model=m.id, input_tokens=it, cost=cost_of(m, it, 0), cache_hit=0,
                           request_hash=h, success=1, latency_ms=int((time.monotonic() - t0) * 1000),
                           item_id=item_id, key_label=self.key_label)
        self.ledger.cache_put(h, m.id, data)
        return [d["embedding"] for d in sorted(data["data"], key=lambda d: d["index"])]


def confirm_full_run(llm: LLM, stage: str, n_items: int, cost_per_item: float, confirm_spend: bool) -> float:
    """Print the estimate for a full run and refuse unless it fits and --confirm-spend was given."""
    estimate = n_items * cost_per_item
    remaining_stage = llm.remaining(stage)
    remaining_total = llm.hard_stop - llm.ledger.spent(key_label=llm.key_label)
    print(
        f"[spend] stage {stage}: {n_items} items x ${cost_per_item:.6f} = ${estimate:.4f} estimated; "
        f"stage remaining ${remaining_stage:.4f}; pipeline remaining ${remaining_total:.4f}",
        flush=True,
    )
    if estimate > remaining_stage or estimate > remaining_total:
        raise BudgetExceeded(f"estimate ${estimate:.4f} does not fit stage {stage} remaining ${remaining_stage:.4f}")
    if not confirm_spend:
        raise SpendNotConfirmed("full run needs --confirm-spend")
    return estimate


def spend_report(ledger: Ledger | None = None) -> str:
    ledger = ledger or Ledger()
    by = ledger.spend_by_stage()
    total = sum(by.values())
    lines = [f"Pipeline spend: ${total:.4f} of ${TOTAL_HARD_STOP:.2f} hard stop"]
    for stage, cap in STAGE_CAPS.items():
        s = by.get(stage, 0.0)
        lines.append(f"  {stage:<5} ${s:.4f} of ${cap:.2f} (remaining ${cap - s:.4f})")
    lines.append(f"  Tavily credits used: {ledger.tavily_credits():.0f}")
    return "\n".join(lines)
