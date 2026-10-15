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
