"""Concern embeddings via Token Factory (Qwen3-Embedding-8B), through the wrapper."""
from __future__ import annotations

import numpy as np

from .. import db
from ..llm import LLM

DIM = 1024
BATCH = 64


def concern_text(row) -> str:
    return f"{row['hazard'] or ''}. {row['mechanism'] or ''}. {row['text_quote'] or ''}".strip()


def to_blob(v) -> bytes:
    a = np.asarray(v, dtype=np.float32)
    n = np.linalg.norm(a)
    return (a / n if n else a).astype(np.float32).tobytes()


def from_blob(b: bytes) -> np.ndarray:
    return np.frombuffer(b, dtype=np.float32)


def embed_texts(llm: LLM, texts: list[str], stage: str = "embed", dim: int = DIM) -> np.ndarray:
    out = []
    for i in range(0, len(texts), BATCH):
        chunk = [t[:2000] or "." for t in texts[i : i + BATCH]]
        out += llm.embed(stage, chunk, dimensions=dim)
    a = np.asarray(out, dtype=np.float32)
    n = np.linalg.norm(a, axis=1, keepdims=True)
    n[n == 0] = 1
    return a / n


def embed_concerns(llm: LLM, only_missing: bool = True) -> int:
    conn = db.connect()
    q = "SELECT id, hazard, mechanism, text_quote FROM concerns"
    if only_missing:
        q += " WHERE embedding IS NULL"
    rows = conn.execute(q + " ORDER BY id").fetchall()
    for i in range(0, len(rows), BATCH * 8):
        part = rows[i : i + BATCH * 8]
        vecs = embed_texts(llm, [concern_text(r) for r in part])
        conn.executemany("UPDATE concerns SET embedding=? WHERE id=?",
                         [(v.astype(np.float32).tobytes(), r["id"]) for v, r in zip(vecs, part)])
        conn.commit()
        print(f"[embed] {min(i + BATCH * 8, len(rows))}/{len(rows)}", flush=True)
    conn.close()
    return len(rows)
