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
