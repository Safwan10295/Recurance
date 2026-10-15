# Morning report

Written for Pilot. Numbers below are generated from the ledger and database by scripts/write_morning_report.py.

## Spend

Total Token Factory spend: $5.0993 of the $20.00 pipeline hard stop. The $5 live reserve and the $9.50 margin are untouched.

| Bucket | Spent | Cap | Remaining |
|---|---|---|---|
| dev | $0.0803 | $5.40 | $5.3197 |
| embed | $0.0117 | $0.30 | $0.2883 |
| F | $0.0135 | $0.30 | $0.2865 |
| A | $0.7729 | $1.50 | $0.7271 |
| B | $0.2321 | $1.00 | $0.7679 |
| C | $3.0227 | $4.00 | $0.9773 |
| D | $0.9660 | $2.00 | $1.0340 |
| ntsb | $0.0000 | $1.00 | $1.0000 |

Tavily credits used: 250 of the 250 allowed for Stage F.

## What the pipeline produced

1. Report pages parsed: 6507 (6454 unique after removing republished copies).
2. Reports with extracted concerns: 6196. Concerns: 15366, of which 15044 have a verified quote.
3. Organisations after normalisation: 3832.
4. Candidate pairs: 4061. Judged by Nemotron Super: 4061 (closely_related 940, different 1307, identical 473, related 1341).
5. Response documents read: 1763. Promises with verified quotes: 2276.
6. Verified chains: 618. Dossiers drafted (all unreviewed): 25. Follow-up checks: 82.

Unique reports vs the expected 6,449: 6454 (+0.1%). The listing pages and sitemaps were cross-checked (docs/RESEARCH_LOG.md).

## Evaluation headline

- TF-IDF only: blind-test recall 34%, links shown 1217.
- Embeddings only: blind-test recall 41%, links shown 1217.
- Hybrid + Nemotron Super judge: blind-test recall 52%, links shown 1217.
- Test set: 29 coroner-acknowledged pairs (same organisation, six months or more apart).
- Precision: pending: no labels filled in yet.

Full detail: docs/EVALUATION.md.

## Where things stand

1. The site reads PostgreSQL and works as a tool:
   - Start here with a 60-second tour;
   - Recent, Explore chains and tabbed chain pages;
   - organisation and report pages, search;
   - Check a report.
2. To open it on this PC, double-click start_site.cmd, then go to http://localhost:3000.
3. deploy/ holds the server package, and deploy/README.md the steps. The stack was built and run in Docker on this PC, so the server steps are known to work up to creating the VM.
4. The smart motorways chain is /chains/c52cded99f756309. Chain keys no longer change when data is rebuilt, and old keys redirect.

## Verified

1. The whole pipeline ran on the real archive: scrape, parse, OCR, normalise, Stages A, B, C, D and F, chains, evaluation and publish.
2. 49 Python tests and 5 TypeScript tests pass. They run offline, apart from one publish test that uses a throwaway schema in the local PostgreSQL.
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

1. Check in the Token Factory console when your credits were issued. Builder credits expire 90 days after issue, so credits issued before 16 Sep would expire before judging ends on 15 Dec.
2. Check whether your Nebius credits cover an AI Cloud CPU VM. If they do, create one (deploy/README.md, step 1). If not, any Linux VPS works with the same files.
3. Create a separate Token Factory key for the hosted brief, named recurrence-watch-live (docs/DEPLOY.md).
4. Optional: a domain name. Without one, the site gets HTTPS on an sslip.io name for the server's IP.
5. Choose the corrections contact address for the methodology page (CORRECTIONS_EMAIL in deploy/.env).
6. Read the dossiers (python -m pipeline.cli dossiers-export writes them to data/exports/dossiers_for_review.md), approve the ones you are happy with (python -m pipeline.cli review), then python -m pipeline.cli publish. The handoff asks for at least three reviewed.
7. Label the 80 candidate pairs: python -m pipeline.cli label. Then python -m pipeline.cli evaluate (free, cached) and publish, to fill in precision.
8. Optional: approve more Tavily credits for follow-up searches after the monthly reset. Only 82 promises have a follow-up check.
9. Decide who signs off dossiers: Ubaid, Safwan, or both (A5 question 3).
10. Read the live Devpost rules page once; automated fetches were blocked.
11. Before making the repo public, run bash scripts/purge_private_exports.sh (removes three files with unredacted or unreviewed text from earlier local commits), then gitleaks detect --config .gitleaks.toml on the full history, then make it public and set the MIT licence in the About section.
12. Record the demo video from docs/DEMO_SCRIPT.md and upload it to YouTube.
13. Submit on Devpost, pasting the feedback from docs/FEEDBACK.md.
14. Consider rotating the three keys after the hackathon, since they were pasted into a chat.

