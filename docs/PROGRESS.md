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
