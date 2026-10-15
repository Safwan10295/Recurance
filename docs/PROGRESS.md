# Progress

One section per phase, appended as each phase finishes.

## Phase 0: setup and verification (2026-10-15)

Done:
1. Repo created with .gitignore committed first, then .env.example and the MIT licence.
2. pipeline/config.py holds model IDs, prices, stage caps and thresholds.
3. pipeline/llm.py is the single Token Factory wrapper: request-hash cache, llm_calls ledger, worst-case budget reservation per stage and against the $20 hard stop, mandatory max_tokens, one retry on transport errors only, a confirm_full_run gate, and a per-model rate limiter.
4. 19 tests replay recorded fixtures with the network blocked.
5. Day-1 checks are logged in docs/RESEARCH_LOG.md.

Verified:
1. Model IDs, prices and context lengths match the plan, and the context conflicts are resolved.
2. json_schema is enforced on Nano, Super and Ultra.
3. The enable_thinking and low_effort toggles pass through.
4. The repeat call was a free cache hit.

Spend: $0.0004 total, all in dev. Remaining before the hard stop: $19.9996.

Changes to the plan:
1. Batch job creation is unavailable (HTTP 403), so stages run in real time (D8).
2. Builder credits expire 90 days after issue. Pilot must check the issue date in the console, because credits issued before 16 Sep would expire before judging ends.
3. No per-key spend limit exists, so the deployed app relies on its own cost ceiling.

## Phase 1: ingestion and normalisation (finished 2026-10-15 03:42)

Done:
1. Discovered 6,484 report URLs from the judiciary.uk PFD sitemaps.
2. Fetched every report page and every report PDF the pages needed, at one request per second, with no failures (about 10,000 requests in total).
3. Parsed both template generations, older Rule 43 letters, and heading-less variants. Text sources: 2,292 from page HTML, 1,957 from PDF text, 2,133 from OCR, 100 PDFs that could not be split into sections, and 2 with no text.
4. Removed 53 republished duplicates, leaving 6,431 unique reports, 0.3% below the expected 6,449.
5. Normalised 4,585 receiver spellings into 3,826 organisations, with 268 fuzzy merges, a guard against merging different places, and manual renames. 976 organisations have two or more reports, close to the handoff's 936.
6. Found response PDFs attached to 5,116 reports (80%).

Verified:
1. The count check passes (within 2% of 6,449).
2. OCR was needed for 52% of PDF-sourced reports.
3. Tests cover the parser on recorded pages, quote checks, normalisation, redaction and wording.

Stage A ran alongside ingestion (authorised after its pilot passed):
1. Concerns extracted for 6,255 of 6,329 reports with concerns text. 76 failed.
2. 15,307 concerns, of which 14,985 (97.9%) have a quote verified against the report text.

Spend at the end of Phase 1: $0.80 total. Stage A $0.77 of $1.50, dev $0.02, embeddings $0.003. Remaining before the hard stop: $19.20.

Changes to the plan:
1. Nano's repetition loops led to bounded schemas (D11), and quote repairs fixed a pilot that fell below 90% (D12, blocker B1, resolved).
2. The listing-page crawl was deferred to run alongside the model-only stages, since the sitemaps already give the count.

## Phase 2: deterministic linking, pilots and gold set (finished 2026-10-15 04:56)

Done:
1. Embedded all 15,307 concerns with Qwen3-Embedding-8B on Token Factory (1,024 dimensions).
2. Built 3,285 candidate pairs across 431 organisations: same organisation, at least six months apart, embedding cosine at least 0.62 or TF-IDF at least 0.25, at most 30 pairs per organisation, and top-k retrieval for national bodies (793 pairs). Thresholds came from the coroner-acknowledged pairs (D13).
3. In 81% of candidate pairs the later report came from a different coroner, and in 71% from a different coroner area.
4. Gold set: 227 pairs where a later report names an earlier one, by reference number (8) or by the earlier deceased person's full name (219). 42 share an organisation, and 29 of those are six months or more apart; those 29 are the blind test set.
5. Hand-labelling set: 80 candidate pairs across eight similarity bands in data/exports/hand_labels.csv, with a labelling CLI. Not labelled; that is Pilot's job.
6. Stage B (authorised after its pilot passed): 1,466 in-scope responses read (569 by OCR), 1,443 processed, 2,060 promises, 1,925 with verified quotes (93%). Ten template lines wrongly taken as promises were removed (D16).

Pilots:
1. Stage A: passed (D11, D12).
2. Stage B: schema 100%, quotes 95%, $0.000109 per response.
3. Stage C: the first pilot failed at 85% (B3), was fixed (D16), and the re-pilot passed with 20 of 20 verified at $0.00078 per pair.

Spend at the end of Phase 2: $1.08 total. Stage A $0.77, Stage B $0.19, dev $0.06, embeddings $0.01, Stage C $0.04 (pilot and systemic clusters).

## Phase 3: full LLM runs and evaluation v1 (finished 2026-10-15 06:30)

Done:
1. Stage C judged all 4,061 candidate pairs with Nemotron Super (low-effort reasoning): 473 identical, 940 closely related, 1,341 related, 1,307 different. 3,999 verdicts (98.5%) have both report quotes verified. No call failed.
2. Shown links: 1,217 (identical or closely related, confidence at least 0.70, both quotes verified, wording check passed).
3. Chains: 619, joined through shared concerns so each follows one hazard (D19). 146 chains span three or more reports.
4. Systemic clusters: 19 found by similarity across different organisations, 10 shown after judging.
5. Evaluation on 29 coroner-acknowledged pairs, blind, at an equal budget of 1,217 shown links per system. Recall: TF-IDF 34%, embeddings 41%, hybrid plus Nemotron Super 52%. Full detail in docs/EVALUATION.md.
6. Lost memory among the 1,217 shown links: a different coroner in 84%, a different coroner area in 79%, and no citation of the earlier report in 99%. All three held for 73%.

Verified:
1. All four candidate demo chains from the handoff were found and verified independently: smart motorways, unbarriered platform ends, paraffin emollient fires, and online pharmacy self-certification. Pennine Care formed no chain, as expected (data/exports/demo_chains.json).
2. Cost per verified chain: $0.0066 analysis spend per chain (Stages A to C, embeddings and pilots).

Changes to the plan:
1. The first evaluation showed most missed recurrences were at national bodies, capped at 30 pairs each. The cap now scales with organisation size (D17, D18), which added 735 judged pairs for $0.53 and lifted the Nemotron system from 48% to 52% recall, ahead of both baselines.
2. Precision needs hand labels and is pending.

Spend at the end of Phase 3: Stage C $3.02 of $4.00. Total $4.07 (before dossiers and follow-ups).

## Phase 4: web app, dossiers, follow-ups and live brief (finished 2026-10-15 07:00)

Done:
1. Stage D: 24 flagship dossiers drafted with Nemotron Ultra, all unreviewed and hidden. One failed its schema and was not retried. data/exports/dossiers_for_review.md has them for reading; python -m pipeline.cli review approves them.
2. Stage F: 82 promises in chains checked with Tavily (250 of 250 credits), flagship chains first: 8 with evidence found, 1 contradicting, 73 no evidence found.
3. Web app (Next.js): Home, Chains (with systemic clusters), Chain detail, Organisations, Organisation detail, Brief, Methodology and Evaluation. 1,609 static pages built from web/data, with no LLM calls at render.
4. Live brief: TypeScript twin of the wrapper with a response cache, ledger, cost ceiling, 40-per-day and 5-per-IP limits, and a polite paused state with precomputed examples.

Verified:
1. Production build passes. Every page returned 200 on a local production server, and unknown pages return 404.
2. Live brief end to end on a local server: a known report URL in 5 seconds and pasted draft concerns in 3.4 seconds, both with matches. A repeat was served from cache. Cost $0.0028, recorded in the ledger (D15).
3. Without a live key the brief pauses gracefully with examples.
4. A scan of all 1,217 exported links found no banned wording and no unredacted titled staff names. No dossier is shown.

Not tested:
1. Deployment to Vercel and the Supabase store (no credentials; Pilot's job, docs/DEPLOY.md).
2. Visual layout on a phone. The layout is responsive by construction but was not checked on a device.

Spend at the end of Phase 4: $5.05 total (dev $0.07, embeddings $0.01, A $0.77, B $0.19, C $3.02, D $0.96, F $0.01). Remaining before the $20 hard stop: $14.95. The $5 live reserve and $9.50 margin were never touched.

## Phase 5: polish and stretch (2026-10-15)

1. Methodology and Evaluation pages are live in the build.
2. The NTSB stretch was not built. Spend was under $12 and Phases 0 to 4 were complete, but CAROL has no documented public API for recommendations; its exports run through the web interface, which an unattended run cannot use reliably. The video uses the systemic clusters for that slot instead.
