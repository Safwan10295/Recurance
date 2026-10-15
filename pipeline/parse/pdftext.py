"""Cached PDF text: pdfplumber first, Tesseract OCR for scanned files, in parallel.

Each PDF's text is cached in data/cache/pdftext/<sha1 of url>.json so OCR runs once.
"""
from __future__ import annotations

import hashlib
import json
import os
from concurrent.futures import ProcessPoolExecutor, as_completed
from pathlib import Path

from .. import config
from ..scrape.http import cached_path

CACHE = config.CACHE / "pdftext"


def _cache_file(url: str) -> Path:
    return CACHE / f"{hashlib.sha1(url.encode('utf-8')).hexdigest()}.json"


def cached_text(url: str) -> dict | None:
    p = _cache_file(url)
    if p.exists():
        return json.loads(p.read_text(encoding="utf-8"))
    return None


def _work(url: str, raw_path: str, allow_ocr: bool) -> dict:
    os.environ.setdefault("OMP_THREAD_LIMIT", "1")
    from .pdf import extract_text, ocr_text

    data = Path(raw_path).read_bytes()
    text, pages, scanned = extract_text(data)
    how = "pdf"
    if scanned:
        how = "scanned_no_ocr"
        if allow_ocr:
            o = ocr_text(data)
            if o and len(o) > len(text):
                text, how = o, "ocr"
    out = {"url": url, "text": text, "how": how, "pages": pages}
    if not (scanned and not allow_ocr):  # never cache a scan that OCR has not been tried on
        CACHE.mkdir(parents=True, exist_ok=True)
        _cache_file(url).write_text(json.dumps(out, ensure_ascii=False), encoding="utf-8")
    return out


def text_for(url: str, allow_ocr: bool = True) -> dict | None:
    c = cached_text(url)
    if c is not None:
        return c
    raw = cached_path(url, "pdf")
    if not raw:
        return None
    return _work(url, str(raw), allow_ocr)


def prepass(urls: list[str], workers: int = 12, allow_ocr: bool = True) -> dict:
    todo = []
    for u in urls:
        if cached_text(u) is None:
            raw = cached_path(u, "pdf")
            if raw:
                todo.append((u, str(raw)))
    stats = {"todo": len(todo), "pdf": 0, "ocr": 0, "scanned_no_ocr": 0}
    if not todo:
        return stats
    with ProcessPoolExecutor(max_workers=workers) as ex:
        futs = [ex.submit(_work, u, p, allow_ocr) for u, p in todo]
        for i, f in enumerate(as_completed(futs), 1):
            try:
                stats[f.result()["how"]] += 1
            except Exception:
                stats["scanned_no_ocr"] += 1
            if i % 100 == 0:
                print(f"[pdftext] {i}/{len(todo)} {stats}", flush=True)
    return stats
