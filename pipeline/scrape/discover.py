"""Discover every PFD report URL.

Two independent sources, so the count can be cross-checked:
1. the Yoast PFD sitemaps (pfd-sitemap.xml, pfd-sitemap2.xml, ...);
2. the archive listing pages (/prevention-of-future-death-reports/page/N/).
"""
from __future__ import annotations

import re

from selectolax.lexbor import LexborHTMLParser

from .. import config
from .http import Fetcher

SITEMAP_INDEX = "https://www.judiciary.uk/sitemap_index.xml"
_LOC = re.compile(r"<loc>\s*([^<\s]+)\s*</loc>")
_REPORT = re.compile(r"^https://www\.judiciary\.uk/prevention-of-future-death-reports/(?!page/)[^/?#]+/$")


def is_report_url(url: str) -> bool:
    return bool(_REPORT.match(url))


def from_sitemaps(f: Fetcher) -> list[str]:
    _, body, _ = f.get(SITEMAP_INDEX, refresh=True)
    maps = [u for u in _LOC.findall(body.decode("utf-8")) if re.search(r"/pfd-sitemap\d*\.xml$", u)]
    urls: list[str] = []
    for m in maps:
        _, b, _ = f.get(m, refresh=True)
        urls += [u for u in _LOC.findall(b.decode("utf-8")) if is_report_url(u)]
    return list(dict.fromkeys(urls))


def listing_page_urls(html: str) -> list[str]:
    h = LexborHTMLParser(html)
    out = []
    for a in h.css("a"):
        href = a.attributes.get("href") or ""
        if is_report_url(href):
            out.append(href)
    return list(dict.fromkeys(out))


def last_page(html: str) -> int:
    nums = [int(n) for n in re.findall(r"/prevention-of-future-death-reports/page/(\d+)/", html)]
    return max(nums) if nums else 1


def from_listing(f: Fetcher, refresh_first: bool = True, max_pages: int | None = None) -> list[str]:
    _, b, _ = f.get(config.PFD_BASE, refresh=refresh_first)
    html = b.decode("utf-8")
    n = last_page(html)
    if max_pages:
        n = min(n, max_pages)
    urls = listing_page_urls(html)
    for p in range(2, n + 1):
        # Listing pages shift as new reports arrive, so they are always refetched.
        _, b, _ = f.get(f"{config.PFD_BASE}page/{p}/", refresh=True)
        urls += listing_page_urls(b.decode("utf-8"))
    return list(dict.fromkeys(urls))
