"""The hazard map: every verified concern placed in 2-D by meaning.

The stored 1,024-dimension Qwen3 embeddings are reduced with PCA (50 dimensions) and then t-SNE,
once, with a fixed seed. The result is cached by the set of concern ids, so a publish only
recomputes when new concerns arrive. No model calls.
"""
from __future__ import annotations

import hashlib
import json

import numpy as np

from .. import config

CACHE = config.CACHE / "hazard_map.npz"

# Report categories on judiciary.uk come in 127 spellings. Group them into plain themes, most
# specific first (a report tagged both "Hospital Death" and "Suicide" is shown under Suicide).
THEMES = [
    ("Suicide", ("suicide",)),
    ("Child deaths", ("child",)),
    ("Mental health", ("mental health",)),
    ("Custody and policing", ("custody", "police")),
    ("Roads and rail", ("road", "highway", "railway")),
    ("Drugs, alcohol and medication", ("alcohol", "drug", "medication")),
    ("Care homes", ("care home",)),
    ("Emergency and community care", ("emergency", "community health")),
    ("Products and workplaces", ("product", "accident at work", "health and safety", "service personnel")),
    ("Hospital care", ("hospital",)),
]
OTHER = "Other"


def theme_of(categories: list[str] | str | None) -> str:
    if isinstance(categories, str):
        try:
            categories = json.loads(categories)
        except ValueError:
            categories = [categories]
    low = " | ".join(categories or []).lower()
    for name, keys in THEMES:
        if any(k in low for k in keys):
            return name
    return OTHER


def theme_names() -> list[str]:
    return [t for t, _ in THEMES] + [OTHER]


def project(conn) -> tuple[list[int], np.ndarray]:
    """Return (concern ids, xy in [0, 1]) for every verified concern of a unique report."""
    rows = conn.execute(
        """SELECT c.id, c.embedding FROM concerns c JOIN reports r ON r.url = c.report_url
           WHERE c.quote_verified > 0 AND c.embedding IS NOT NULL AND r.duplicate_of IS NULL ORDER BY c.id"""
    ).fetchall()
    ids = [r[0] for r in rows]
    if len(ids) < 200:
        # Too few points for t-SNE (tests, tiny databases): spread them evenly, and never touch the cache.
        n = max(len(ids), 1)
        return ids, np.array([[i / n, (i * 0.618) % 1.0] for i in range(len(ids))], dtype=np.float32).reshape(-1, 2)
    key = hashlib.sha1(",".join(map(str, ids)).encode()).hexdigest()
    raw = None
    if CACHE.exists():
        z = np.load(CACHE)
        if str(z["key"]) == key and "raw" in z.files:
            raw = z["raw"]
    if raw is None:
        from sklearn.decomposition import PCA
        from sklearn.manifold import TSNE

        X = np.vstack([np.frombuffer(r[1], dtype=np.float32) for r in rows])
        X50 = PCA(n_components=50, random_state=0).fit_transform(X)
        raw = TSNE(n_components=2, perplexity=40, init="pca", learning_rate="auto", random_state=0).fit_transform(X50)
        CACHE.parent.mkdir(parents=True, exist_ok=True)
        np.savez(CACHE, key=key, raw=raw.astype(np.float32))
    return ids, _fit_square(raw)


def _fit_square(raw: np.ndarray) -> np.ndarray:
    """Scale into [0, 1] with one factor for both axes, centred, so distances keep their proportions."""
    lo, hi = raw.min(axis=0), raw.max(axis=0)
    span = float((hi - lo).max()) or 1.0
    xy = (raw - lo) / span
    xy += (1.0 - (hi - lo) / span) / 2.0
    return xy.astype(np.float32)
