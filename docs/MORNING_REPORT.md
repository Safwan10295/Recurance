# Morning report

Written for Pilot. Numbers below are generated from the ledger and database by scripts/write_morning_report.py.

## Spend

Total Token Factory spend: $5.0451 of the $20.00 pipeline hard stop. The $5 live reserve and the $9.50 margin are untouched.

| Bucket | Spent | Cap | Remaining |
|---|---|---|---|
| dev | $0.0682 | $5.40 | $5.3318 |
| embed | $0.0117 | $0.30 | $0.2883 |
| F | $0.0135 | $0.30 | $0.2865 |
| A | $0.7729 | $1.50 | $0.7271 |
| B | $0.1943 | $1.00 | $0.8057 |
| C | $3.0227 | $4.00 | $0.9773 |
| D | $0.9617 | $2.00 | $1.0383 |
| ntsb | $0.0000 | $1.00 | $1.0000 |

Tavily credits used: 250 of the 250 allowed for Stage F.

## What the pipeline produced

1. Report pages parsed: 6507 (6454 unique after removing republished copies).
2. Reports with extracted concerns: 6196. Concerns: 15366, of which 15044 have a verified quote.
3. Organisations after normalisation: 3832.
4. Candidate pairs: 4061. Judged by Nemotron Super: 4061 (closely_related 940, different 1307, identical 473, related 1341).
5. Response documents read: 1467. Promises with verified quotes: 1925.
6. Verified chains: 619. Dossiers drafted (all unreviewed): 24. Follow-up checks: 82.

Unique reports vs the expected 6,449: 6454 (+0.1%). The listing pages and sitemaps were cross-checked (docs/RESEARCH_LOG.md).

## Evaluation headline

- TF-IDF only: blind-test recall 34%, links shown 1217.
- Embeddings only: blind-test recall 41%, links shown 1217.
- Hybrid + Nemotron Super judge: blind-test recall 52%, links shown 1217.
- Test set: 29 coroner-acknowledged pairs (same organisation, six months or more apart).
- Precision: pending: no labels filled in yet.

Full detail: docs/EVALUATION.md.

## Verified

1. The whole pipeline ran on the real archive: scrape, parse, OCR, normalise, Stages A, B, C, D and F, chains, evaluation and export.
2. 47 Python tests and 5 TypeScript tests pass, all offline on recorded fixtures.
3. Every paid stage passed its 20-item pilot before its full run. The two pilots that first failed (B1, B3) were fixed deterministically and re-piloted.
4. All four candidate demo chains from the handoff were found and verified on their own. The smart motorways chain is /chains/7d7b41f91717dc72.
5. The site builds (1,609 pages), and every page returned 200 on a local production server.
6. The live brief worked end to end locally: report URL and pasted concerns, with a cache hit on repeat, for $0.0028.
7. Exported data passed a scan: no banned wording in model text, no unredacted titled staff names, and no dossier shown.
8. Secret scans (gitleaks plus a check against the .env values) ran before every commit. Neither .env nor env1 was ever committed.

## Not tested

1. Vercel deployment and the Supabase store. There were no credentials, and deploying was yours to do.
2. The live brief with its own deployed key, and the per-IP limit behind a real proxy.
3. Phone layout on a real device.
4. Precision of shown links, which waits on your labels.
5. The NTSB stretch, which was not built (Phase 5 note in docs/PROGRESS.md).

## What changed from the plan

1. The Batch API was unavailable all night (403), so everything ran in real time.
2. Builder credits expire 90 days after issue. Check the issue date (item 1 below).
3. The database is SQLite locally, with a Postgres schema ready for Supabase (D5).
4. Nano needed bounded JSON schemas to stop repetition loops (D11).
5. Candidate pairs per organisation now scale with its size, and chains join through shared concerns (D18, D19).
6. A blind test of 29 coroner-acknowledged pairs is the main evaluation. Hand-label metrics are pending.

## Blockers

See docs/BLOCKERS.md for each note in full.

- B1. Stage A pilot below 90% quote verification (resolved)
- B2. First orchestrator run stopped at the responses step (resolved)
- B3. Stage C pilot at 85% quote verification (resolved)

## Things only you can do

1. Check in the Token Factory console when your credits were issued. Builder credits expire 90 days after issue, so credits issued before 16 Sep would expire before judging ends on 15 Dec.
2. Label the 80 candidate pairs: python -m pipeline.cli label. Then python -m pipeline.cli evaluate (free, cached) to fill in precision.
3. Read the dossiers in data/exports/dossiers_for_review.md, then approve the ones you are happy with: python -m pipeline.cli review. Then python -m pipeline.cli export.
4. Create a separate Token Factory key for the deployed app (named recurrence-watch-live).
5. Create or confirm the Supabase and Vercel projects, then follow docs/DEPLOY.md to deploy.
6. Choose the corrections contact address for the methodology page (NEXT_PUBLIC_CORRECTIONS_EMAIL).
7. Choose the contact email for the scraper User-Agent if it should differ from the one in .env (A5 question 1).
8. Decide who signs off dossiers: Ubaid, Safwan, or both (A5 question 3).
9. Read the live Devpost rules page once; automated fetches were blocked.
10. Before making the repo public, run bash scripts/purge_private_exports.sh (removes three files with unredacted or unreviewed text from earlier local commits), then gitleaks detect --config .gitleaks.toml on the full history, then make it public and set the MIT licence in the About section.
11. Record the demo video from docs/DEMO_SCRIPT.md and upload it to YouTube.
12. Submit on Devpost, pasting the feedback from docs/FEEDBACK.md.
13. Consider rotating the three keys after the hackathon, since they were pasted into a chat.

