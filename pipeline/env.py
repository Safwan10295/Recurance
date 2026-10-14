"""Load .env into the process environment. Values are never printed or logged."""
from dotenv import load_dotenv

from .config import ROOT


def load() -> None:
    load_dotenv(ROOT / ".env", override=False)
