"""Day-1 check: list Token Factory models (free endpoint). Saves raw JSON to data/cache."""
import json, os, sys
from pathlib import Path
import httpx
from dotenv import load_dotenv

load_dotenv()
key = os.environ.get("NEBIUS_API_KEY")
if not key:
    sys.exit("NEBIUS_API_KEY missing")
r = httpx.get("https://api.tokenfactory.nebius.com/v1/models", params={"verbose": "true"},
              headers={"Authorization": f"Bearer {key}"}, timeout=60)
print("status", r.status_code)
print("headers", {k: v for k, v in r.headers.items() if k.lower().startswith(("x-ratelimit", "x-request", "content-type"))})
out = Path("data/cache/models_verbose.json")
out.write_text(r.text, encoding="utf-8")
data = r.json()
items = data.get("data", data)
print("count", len(items))
print("keys of first item", sorted(items[0].keys()) if items else None)
