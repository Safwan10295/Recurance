"""Central configuration: model IDs, prices, budget caps, thresholds and paths.

Model IDs and prices were confirmed against GET /v1/models?verbose=true on
2026-10-15 (see docs/RESEARCH_LOG.md). Prices are USD per token.
"""
from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
RAW = DATA / "raw"
CACHE = DATA / "cache"
EXPORTS = DATA / "exports"
FIXTURES = ROOT / "tests" / "fixtures"

DB_PATH = Path(os.environ.get("RW_DB_PATH", DATA / "recurrence.sqlite"))
# The ledger and LLM cache live in their own file so rebuilding the corpus
# database can never wipe the spend history.
LEDGER_PATH = Path(os.environ.get("RW_LEDGER_PATH", DATA / "ledger.sqlite"))

BASE_URL = "https://api.tokenfactory.nebius.com/v1/"


@dataclass(frozen=True)
class Model:
    key: str
    id: str
    input_price: float  # USD per token
    output_price: float  # USD per token
    context: int
    rpm: int
    tpm: int


MODELS: dict[str, Model] = {
    "nano": Model("nano", "nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B", 0.06e-6, 0.24e-6, 262_144, 100, 800_000),
    "super": Model("super", "nvidia/nemotron-3-super-120b-a12b", 0.30e-6, 0.90e-6, 262_144, 300, 200_000),
    "ultra": Model("ultra", "nvidia/Nemotron-3-Ultra-550b-a55b", 1.00e-6, 3.00e-6, 1_048_576, 300, 200_000),
    "embed": Model("embed", "Qwen/Qwen3-Embedding-8B", 0.01e-6, 0.0, 40_960, 10_000, 600_000),
}

# Budget, section 6.2 of the handoff. "dev" is the $6 pilots-and-development
# bucket; embeddings and the Stage F classifier are carved out of it so the
# $5 live reserve and the $9.50 margin are never planned against.
TOTAL_HARD_STOP = 20.00
STAGE_CAPS: dict[str, float] = {
    "dev": 5.40,
    "embed": 0.30,
    "F": 0.30,
    "A": 1.50,
    "B": 1.00,
    "C": 4.00,
    "D": 2.00,
    "ntsb": 1.00,
}
assert abs(STAGE_CAPS["dev"] + STAGE_CAPS["embed"] + STAGE_CAPS["F"] - 6.00) < 1e-9

# max_tokens defaults per call type (section 6.3 rule 10).
MAX_TOKENS = {
    "probe": 16,
    "extract": 600,
    "promise": 700,
    "judge": 1500,
    "dossier": 4000,
    "followup": 500,
}

# Tavily, section 6.5.
# Stage F's cumulative cap, in credits as counted by our own ledger (D28): the first 250, plus 70% of the
# 788 credits the Tavily usage endpoint reported on 16 Oct 2026. The other 30% stays for the live agent.
TAVILY_STAGE_F_CAP_CREDITS = 801
# The demo chains (smart motorways, platform ends, emollient fires, online pharmacy). Keys are stable.
FEATURED_CHAIN_KEYS = ["c52cded99f756309", "ede39b33e85d5106", "38aced9ab658b30c", "12c95ba862edb687"]

# Scraper politeness.
SCRAPE_DELAY_SECONDS = 1.0
PFD_BASE = "https://www.judiciary.uk/prevention-of-future-death-reports/"

# Linking thresholds (initial values; tuned against the coroner-acknowledged set).
MIN_DAYS_APART = 182
TFIDF_MIN = 0.25
EMBED_MIN = 0.62
MAX_PAIRS_PER_ORG = 30
PAIRS_PER_REPORT = 0.5  # larger organisations may keep up to half as many pairs as they have reports (D18)
NATIONAL_TOP_K = 10  # widened from 5 after the blind test (D17)

# Known unique-report figure from prior research (section 3).
EXPECTED_UNIQUE_REPORTS = 6449


def contact_email() -> str | None:
    return os.environ.get("SCRAPER_CONTACT_EMAIL") or None


def user_agent() -> str:
    email = contact_email()
    if not email:
        raise RuntimeError("SCRAPER_CONTACT_EMAIL is not set; scraping is blocked")
    return f"RecurrenceWatch/0.1 (public-interest research; contact: {email})"
