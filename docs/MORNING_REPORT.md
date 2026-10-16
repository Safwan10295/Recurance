# Morning report

Written for Pilot. Numbers below are generated from the ledger and database by scripts/write_morning_report.py.

## Spend

Total Token Factory spend: $5.1613 of the $20.00 pipeline hard stop. The $5 live reserve and the $9.50 margin are untouched.

| Bucket | Spent | Cap | Remaining |
|---|---|---|---|
| dev | $0.1108 | $5.40 | $5.2892 |
| embed | $0.0117 | $0.30 | $0.2883 |
| F | $0.0451 | $0.30 | $0.2549 |
| A | $0.7729 | $1.50 | $0.7271 |
| B | $0.2321 | $1.00 | $0.7679 |
| C | $3.0227 | $4.00 | $0.9773 |
| D | $0.9660 | $2.00 | $1.0340 |
| ntsb | $0.0000 | $1.00 | $1.0000 |

Tavily credits used by Stage F: 801 of its cap of 801 (ledger count; D28). The live agent has its own allowance.

## What the pipeline produced

1. Report pages parsed: 6507 (6454 unique after removing republished copies).
2. Reports with extracted concerns: 6196. Concerns: 15366, of which 15044 have a verified quote.
3. Organisations after normalisation: 3832.
4. Candidate pairs: 4061. Judged by Nemotron Super: 4061 (closely_related 940, different 1307, identical 473, related 1341).
5. Response documents read: 1763. Promises with verified quotes: 2276.
6. Verified chains: 618. Dossiers drafted (all unreviewed): 25. Follow-up checks: 269.

Unique reports vs the expected 6,449: 6454 (+0.1%). The listing pages and sitemaps were cross-checked (docs/RESEARCH_LOG.md).

## Evaluation headline

- TF-IDF only: blind-test recall 34%, links shown 1217.
- Embeddings only: blind-test recall 41%, links shown 1217.
- Hybrid + Nemotron Super judge: blind-test recall 52%, links shown 1217.
- Test set: 29 coroner-acknowledged pairs (same organisation, six months or more apart).
- Precision: pending: no labels filled in yet.

Full detail: docs/EVALUATION.md.

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

## Blockers

See docs/BLOCKERS.md for each note in full.

- B1. Stage A pilot below 90% quote verification (resolved)
- B2. First orchestrator run stopped at the responses step (resolved)
- B3. Stage C pilot at 85% quote verification (resolved)

## Things only you can do

Each step is written out in docs/SUBMISSION_CHECKLIST.md.

1. Check the credit expiry date in the Token Factory console, if you can find it. It cannot be read from the API.
2. Create the server (deploy/README.md) and a separate Token Factory key for it.
3. Approve at least 3 dossiers: read data/exports/review_pack.md, then run .venv\Scripts\python -m pipeline.cli review --featured.
4. Optional: label the 80 test pairs (.venv\Scripts\python -m pipeline.cli label) to fill in precision.
5. Purge the private files from git history, scan it, then make the repo public (the commands are in the checklist).
6. Record the video from docs/VIDEO_SHOT_LIST.md and make it public on YouTube.
7. Submit on Devpost with docs/DEVPOST_DRAFT.md and docs/FEEDBACK.md.
8. After the hackathon, rotate the keys that were pasted into a chat.

