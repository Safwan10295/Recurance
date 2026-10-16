## Where things stand

1. The site reads PostgreSQL and works as a tool. To open it on this PC, double-click start_site.cmd, then go to http://localhost:3000.
2. New on 16 Oct, latest round:
   - Check a report is a tool-calling agent: Nemotron Super chooses each tool, and every call is shown;
   - 269 promises have Tavily follow-up checks;
   - the evaluation shows 95% ranges and explains every miss;
   - a read-only API, backup and smoke-test scripts, and a December runbook;
   - submission writing in docs/DEVPOST_DRAFT.md, docs/VIDEO_SHOT_LIST.md and docs/SUBMISSION_CHECKLIST.md.
3. Earlier on 16 Oct:
   - the guided tour, You be the judge and the map replay;
   - the Promises, Hazard map and How Nemotron did the work pages;
   - a command palette and a light and dark toggle.
4. Quotes name the deceased by report title only, and staff and family names are redacted, including in web sources.
5. The smart motorways chain is /chains/c52cded99f756309.

## Blockers this round

1. The roughly $25 of Tavily credit Pilot mentioned does not show on the key in .env: it reports the free 1,000-a-month plan, and pay-as-you-go is unused. The budget was therefore set from that plan's balance (D28). If the paid credit is on another key, swap the key in .env.
2. The Token Factory credit expiry cannot be read from the API. It has to be checked in the console.

## Verified

1. The whole pipeline ran on the real archive: scrape, parse, OCR, normalise, Stages A, B, C, D and F, chains, evaluation and publish.
2. 56 Python tests and 15 TypeScript tests pass. They run offline, apart from one publish test that uses a throwaway schema in the local PostgreSQL.
3. Every paid stage passed its 20-item pilot before its full run.
4. In the Docker test:
   - every route answered;
   - search, redirects and the paused brief behaved;
   - the web app's database role could not change published data.
5. Every main page at phone width, light and dark, with no sideways scrolling.
6. Secret scans (gitleaks plus a check against the .env values) ran before every commit. No env file was ever committed.

## Not tested

1. The stack on a real Nebius VM with a real certificate. That needs your VM.
2. The hosted brief with its own key, and the per-visitor limit behind the real proxy.
3. Precision of shown links, which waits on your labels.
4. The NTSB stretch, which was not built (Phase 5 in docs/PROGRESS.md).

## What changed from the plan

1. The Batch API was unavailable all night (403), so everything ran in real time.
2. PostgreSQL on our own server replaced Vercel and Supabase (D21, D23).
3. Nano needed bounded JSON schemas to stop repetition loops (D11).
4. Candidate pairs per organisation scale with its size, and chains join through shared concerns (D18, D19).
5. A blind test of 29 coroner-acknowledged pairs is the main evaluation. Hand-label metrics are pending.
