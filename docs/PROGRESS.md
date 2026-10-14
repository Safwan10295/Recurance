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
