# Deploying

The server steps are in deploy/README.md. This page covers the live brief's key and what to check once the site is up.

## The live key

1. In the Token Factory console, create a new API key named recurrence-watch-live. Never reuse the pipeline key.
2. Put it only in deploy/.env on the server, as NEBIUS_LIVE_API_KEY.
3. Token Factory has no per-key spend limit, so the app enforces its own: LIVE_COST_CEILING_USD (4.50, which keeps the $5 reserve), 40 briefs a day in total and 5 per visitor.

## How the live brief degrades

1. No live key, a limit reached, or an error during a run: the brief says it is paused and shows precomputed examples. Judges never see an error page.
2. To pause it by hand, set LIVE_BRIEF_PAUSED=1 in deploy/.env, then run docker compose up -d web.

## Checks after going live

1. /api/health returns ok, with the publish time.
2. Start here, Recent, Explore chains and one chain page load.
3. /chains/c52cded99f756309 shows the smart motorways chain.
4. Search for "smart motorway" finds it.
5. On /brief, pick a report from the archive and run it. Run it again: the second run says it used a saved brief and costs nothing.
6. Spend so far: docker compose exec db psql -U rw recurrence -c "select key, value from brief_kv where key like 'spend%'"
