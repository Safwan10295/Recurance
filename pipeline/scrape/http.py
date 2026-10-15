"""Polite HTTP fetcher for judiciary.uk.

- One request per second across the whole process.
- Descriptive User-Agent with SCRAPER_CONTACT_EMAIL (refuses to run without it).
- Every response body is cached on disk under data/raw/, keyed by URL hash, so
  re-runs and resumes never refetch.
"""
from __future__ import annotations

import hashlib
import threading
import time
from pathlib import Path
from urllib.parse import urlparse

import httpx

from .. import config

_lock = threading.Lock()
_last = [0.0]
# Machine-wide limiter: every process that fetches from judiciary.uk shares this file,
# so two fetchers running at once still make at most one request per second in total.
_SLOT_FILE = config.CACHE / ".judiciary_slot"


def _claim_slot(delay: float) -> None:
    import msvcrt  # Windows; on other platforms fcntl would be used

    _SLOT_FILE.parent.mkdir(parents=True, exist_ok=True)
    while True:
        with open(_SLOT_FILE, "a+b") as fh:
            fh.seek(0)
            msvcrt.locking(fh.fileno(), msvcrt.LK_LOCK, 1)
            try:
                fh.seek(0)
                raw = fh.read().decode() or "0"
                try:
                    last = float(raw.split()[-1]) if raw.strip() else 0.0
                except ValueError:
                    last = 0.0
                now = time.time()
                if now - last >= delay:
                    fh.seek(0)
                    fh.truncate()
                    fh.write(f"{now:.3f}".encode())
                    fh.flush()
                    return
                wait = delay - (now - last)
            finally:
                fh.seek(0)
                msvcrt.locking(fh.fileno(), msvcrt.LK_UNLCK, 1)
        time.sleep(max(0.05, wait))


def _path_for(url: str, kind: str) -> Path:
    h = hashlib.sha1(url.encode("utf-8")).hexdigest()
    ext = ".pdf" if kind == "pdf" else ".html"
    return config.RAW / kind / h[:2] / f"{h}{ext}"


def cached_path(url: str, kind: str = "html") -> Path | None:
    p = _path_for(url, kind)
    return p if p.exists() else None


class Fetcher:
    def __init__(self, delay: float = config.SCRAPE_DELAY_SECONDS):
        self.delay = delay
        self.client = httpx.Client(
            headers={"User-Agent": config.user_agent(), "Accept-Language": "en-GB"},
            timeout=httpx.Timeout(60.0, connect=20.0),
            follow_redirects=True,
        )
        self.network_requests = 0

    def _wait(self) -> None:
        with _lock:
            _claim_slot(self.delay)

    def get(self, url: str, kind: str = "html", refresh: bool = False) -> tuple[int, bytes, str]:
        """Return (status, body, final_url). Cached bodies return status 200 (or the stored status)."""
        host = urlparse(url).netloc
        if not host.endswith("judiciary.uk"):
            raise ValueError(f"refusing to fetch off-site URL: {url}")
        p = _path_for(url, kind)
        meta = p.with_suffix(p.suffix + ".meta")
        if p.exists() and not refresh:
            final = meta.read_text(encoding="utf-8").split("\n")[1] if meta.exists() else url
            return 200, p.read_bytes(), final
        if meta.exists() and not refresh:
            status, final = meta.read_text(encoding="utf-8").split("\n")[:2]
            if status.startswith("4"):
                return int(status), b"", final
        for attempt in (1, 2):
            self._wait()
            self.network_requests += 1
            try:
                r = self.client.get(url)
            except httpx.TransportError:
                if attempt == 2:
                    raise
                time.sleep(10)
                continue
            if r.status_code in (429, 500, 502, 503, 504) and attempt == 1:
                time.sleep(30)
                continue
            break
        p.parent.mkdir(parents=True, exist_ok=True)
        if r.status_code == 200:
            p.write_bytes(r.content)
        meta.write_text(f"{r.status_code}\n{r.url}\n", encoding="utf-8")
        return r.status_code, r.content if r.status_code == 200 else b"", str(r.url)
