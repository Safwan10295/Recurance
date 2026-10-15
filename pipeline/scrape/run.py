"""Scrape driver: fetch report pages, listing pages and PDFs, resumably."""
from __future__ import annotations

import json
import sys
import time

from .. import config
from .discover import from_listing, from_sitemaps
from .http import Fetcher, cached_path

URLS_FILE = config.CACHE / "urls_sitemap.json"
LISTING_FILE = config.CACHE / "urls_listing.json"


def log(msg: str) -> None:
    print(time.strftime("%H:%M:%S"), msg, flush=True)


def discover(f: Fetcher) -> list[str]:
    urls = from_sitemaps(f)
    URLS_FILE.parent.mkdir(parents=True, exist_ok=True)
    URLS_FILE.write_text(json.dumps(urls, indent=0), encoding="utf-8")
    log(f"sitemaps: {len(urls)} report URLs")
    return urls


def fetch_reports(f: Fetcher, urls: list[str]) -> dict:
    stats = {"total": len(urls), "cached": 0, "fetched": 0, "failed": 0}
    for i, u in enumerate(urls, 1):
        if cached_path(u):
            stats["cached"] += 1
            continue
        try:
            s, _, _ = f.get(u)
            stats["fetched" if s == 200 else "failed"] += 1
        except Exception as e:  # keep going; failures are listed at the end
            stats["failed"] += 1
            log(f"error {u}: {type(e).__name__}")
        if i % 250 == 0:
            log(f"reports {i}/{len(urls)} {stats}")
    log(f"reports done {stats}")
    return stats


def crawl_listing(f: Fetcher) -> list[str]:
    urls = from_listing(f)
    LISTING_FILE.write_text(json.dumps(urls, indent=0), encoding="utf-8")
    log(f"listing: {len(urls)} report URLs")
    return urls


def fetch_pdfs(f: Fetcher, pdf_urls: list[str], workers: int = 2) -> dict:
    """Two workers overlap slow downloads; the shared start-time lock keeps the rate at 1 request/second."""
    from concurrent.futures import ThreadPoolExecutor

    stats = {"total": len(pdf_urls), "cached": 0, "fetched": 0, "failed": 0}
    todo = []
    for u in pdf_urls:
        if cached_path(u, "pdf"):
            stats["cached"] += 1
        else:
            todo.append(u)

    def one(u: str) -> str:
        try:
            s, _, _ = f.get(u, kind="pdf")
            return "fetched" if s == 200 else "failed"
        except Exception as e:
            log(f"error {u}: {type(e).__name__}")
            return "failed"

    with ThreadPoolExecutor(max_workers=workers) as ex:
        for i, res in enumerate(ex.map(one, todo), 1):
            stats[res] += 1
            if i % 200 == 0:
                log(f"pdfs {i}/{len(todo)} {stats}")
    log(f"pdfs done {stats}")
    return stats


def needed_report_pdfs(urls: list[str]) -> list[str]:
    """Report PDFs for pages whose HTML lacks the concerns section."""
    from ..parse.report_page import parse_report_page
    from ..parse.sections import concerns_and_circumstances

    need = []
    for u in urls:
        p = cached_path(u)
        if not p:
            continue
        rp = parse_report_page(u, p.read_text(encoding="utf-8", errors="replace"))
        c, _, _ = concerns_and_circumstances(rp.body_text)
        if len(c) < 40:
            pdf = next((x.url for x in rp.pdfs if x.kind == "report"), None)
            if pdf:
                need.append(pdf)
    return need


def fetch_interleaved(f: Fetcher, urls: list[str], workers: int = 2) -> dict:
    """Page, then its report PDF if the page lacks the text, so downstream stages can start early.

    Workers overlap slow responses; the shared start-time lock keeps the overall rate at 1 request/second.
    """
    from concurrent.futures import ThreadPoolExecutor

    from ..parse.report_page import parse_report_page
    from ..parse.sections import concerns_and_circumstances

    stats = {"pages": 0, "pdfs": 0, "failed": 0}

    def one(u: str) -> None:
        try:
            s, body, _ = f.get(u)
            if s != 200:
                stats["failed"] += 1
                return
            stats["pages"] += 1
            rp = parse_report_page(u, body.decode("utf-8", errors="replace"))
            c, _, _ = concerns_and_circumstances(rp.body_text)
            if len(c) < 40:
                pdf = next((x.url for x in rp.pdfs if x.kind == "report"), None)
                if pdf and not cached_path(pdf, "pdf"):
                    s2, _, _ = f.get(pdf, kind="pdf")
                    stats["pdfs" if s2 == 200 else "failed"] += 1
        except Exception as e:
            stats["failed"] += 1
            log(f"error {u}: {type(e).__name__}")

    with ThreadPoolExecutor(max_workers=workers) as ex:
        for i, _ in enumerate(ex.map(one, urls), 1):
            if i % 250 == 0:
                log(f"interleaved {i}/{len(urls)} {stats} requests={f.network_requests}")
    log(f"interleaved done {stats}")
    return stats


def main(argv: list[str]) -> None:
    from .. import env

    env.load()
    if not config.contact_email():
        sys.exit("BLOCKED: SCRAPER_CONTACT_EMAIL is not set; not scraping")
    f = Fetcher()
    what = argv[0] if argv else "all"
    if what == "interleaved":
        urls = json.loads(URLS_FILE.read_text())
        fetch_interleaved(f, list(reversed(urls)))  # newest first: HTML-text reports arrive early
        crawl_listing(f)
        log(f"network requests this run: {f.network_requests}")
        return
    if what in ("all", "reports"):
        urls = json.loads(URLS_FILE.read_text()) if URLS_FILE.exists() and what == "reports" else discover(f)
        fetch_reports(f, urls)
    if what in ("all", "reportpdfs"):
        urls = json.loads(URLS_FILE.read_text())
        need = needed_report_pdfs(urls)
        (config.CACHE / "pdfs_needed_reports.json").write_text(json.dumps(need, indent=0))
        log(f"report PDFs needed: {len(need)}")
        fetch_pdfs(f, need)
    if what in ("all", "listing"):
        crawl_listing(f)
    if what == "pdfs":
        lst = json.loads((config.CACHE / argv[1]).read_text())
        fetch_pdfs(f, lst)
    log(f"network requests this run: {f.network_requests}")


if __name__ == "__main__":
    main(sys.argv[1:])
