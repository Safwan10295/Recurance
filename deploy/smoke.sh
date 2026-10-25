#!/usr/bin/env bash
# Smoke test for a running Recurance: every page, the expected 404 and redirect, the APIs, and one
# live agent run. Usage:  bash smoke.sh https://your-site      (defaults to http://localhost)
# Add --no-agent to skip the live run (it costs about $0.006, or nothing when the brief is already saved).
set -uo pipefail
BASE="${1:-http://localhost}"
AGENT=1
[ "${2:-}" = "--no-agent" ] && AGENT=0
fail=0
check() {  # expected-code path
  code=$(curl -s -o /dev/null -m 30 -w '%{http_code}' "$BASE$2")
  if [ "$code" = "$1" ]; then printf 'ok   %s %s\n' "$code" "$2"; else printf 'FAIL %s %s (expected %s)\n' "$code" "$2" "$1"; fail=1; fi
}

for p in / /brief /judge /recent /chains "/chains?view=across" /chains/c52cded99f756309 /promises /map /organisations \
         /nemotron /evaluation /methodology "/search?q=smart+motorway" /reports/david-levett-prevention-of-future-deaths-report \
         /api/health /api/hazard-map "/api/search?q=motorway" "/api/reports/suggest?q=levett" \
         "/api/v1/chains?org=National+Highways" /api/v1/chains/c52cded99f756309 /robots.txt; do
  check 200 "$p"
done
check 404 /chains/no-such-chain
check 404 /reports/no-such-report
check 307 /chains/7d7b41f91717dc72

health=$(curl -s -m 15 "$BASE/api/health")
echo "health: $health"
echo "$health" | grep -q '"ok":true' || { echo "FAIL health is not ok"; fail=1; }

if [ "$AGENT" = 1 ]; then
  out=$(curl -s -m 120 -X POST -H 'content-type: application/json' \
        -d '{"reportSlug":"david-levett-prevention-of-future-deaths-report"}' "$BASE/api/brief")
  if echo "$out" | grep -q '"type":"result"'; then
    echo "ok   live agent produced a brief ($(echo "$out" | grep -c '"type":"step"') steps streamed)"
  elif echo "$out" | grep -q '"type":"paused"'; then
    echo "note live agent is paused (no key, a limit reached, or switched off): examples were returned"
  else
    echo "FAIL live agent: no result"; fail=1
  fi
fi
[ "$fail" = 0 ] && echo "all checks passed" || { echo "some checks failed"; exit 1; }
