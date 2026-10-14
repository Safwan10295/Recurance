"""Test harness: no test may reach the network. Recorded fixtures only."""
from __future__ import annotations

import json
import socket
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
FIXTURES = ROOT / "tests" / "fixtures"


@pytest.fixture(autouse=True)
def _no_network(monkeypatch):
    def guard(*a, **k):
        raise RuntimeError("network access is forbidden in tests")

    monkeypatch.setattr(socket, "create_connection", guard)
    monkeypatch.setattr(socket.socket, "connect", guard)
    monkeypatch.delenv("NEBIUS_API_KEY", raising=False)
    monkeypatch.delenv("TAVILY_API_KEY", raising=False)


def recorded(name: str) -> dict:
    return json.loads((FIXTURES / "recorded" / f"{name}.json").read_text(encoding="utf-8"))


class Replay:
    """Transport that replays recorded responses in order and records requests."""

    def __init__(self, *responses):
        self.queue = list(responses)
        self.requests: list[tuple[str, dict]] = []

    def __call__(self, path, body):
        self.requests.append((path, body))
        item = self.queue.pop(0)
        if isinstance(item, Exception):
            raise item
        if isinstance(item, tuple):
            return item
        return 200, item, {"x-ratelimit-remaining-requests": "99"}


@pytest.fixture
def ledger(tmp_path):
    from pipeline.llm import Ledger

    lg = Ledger(tmp_path / "ledger.sqlite")
    yield lg
    lg.close()
