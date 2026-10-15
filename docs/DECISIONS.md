# Decisions

Each entry: what was decided, why, and whether it departs from the handoff.

## D1. Repo location

1. The repo lives in recurrence-watch/ inside the hackathon folder.
2. HANDOFF_COMBINED.md and the supplied env file stay outside the repo, so they can never be committed.

## D2. Env file

1. The supplied file was called env1, not .env.
2. All four lines were already named, including SCRAPER_CONTACT_EMAIL.
3. It was copied unread to recurrence-watch/.env, which is gitignored along with env1 and .env.*.

## D3. Python

1. No Python was installed.
2. Python 3.11.9 was installed per user with winget, matching the handoff's 3.11.

## D4. HTTP client (small departure)

1. The wrapper calls the OpenAI-compatible endpoint with httpx instead of the openai SDK.
2. Reason: it needs the x-ratelimit headers, the reasoning_content field and chat_template_kwargs in the body, and httpx gives all three without SDK workarounds.
3. The endpoint, payload shape and models are the same as in the handoff snippet.

## D5. Database (departure)

1. Local work uses SQLite at data/recurrence.sqlite, with tables that mirror section 7.5.
2. Reason: there is no local Postgres, no Docker, and no Supabase credentials in the environment.
3. pipeline/db/schema_postgres.sql carries the same schema for Supabase, and an export step can load it once credentials exist.
4. The web app reads precomputed JSON exports, so it needs no database to render pages.

## D6. Ledger file

1. llm_calls, the LLM cache and tavily_calls live in data/ledger.sqlite, separate from the corpus database.
2. Reason: rebuilding the corpus must never wipe spend history or paid-for cache entries.

## D7. Splitting the development bucket

1. The $6 pilots-and-development bucket is split into dev $5.40, embeddings $0.30 and Stage F classification $0.30.
2. Reason: those two have no bucket in section 6.2, and this keeps the $5 reserve and $9.50 margin untouched.

## D8. Batch API (departure from rule 14 for now)

1. Batch job creation returned HTTP 403 "temporarily unavailable" on 2026-10-15.
2. Stages run in real time through the wrapper, which rate-limits to 80% of each model's RPM.
3. The ledger always records full real-time prices, so the guard can only over-estimate.
4. Batch is retried once before the Stage A full run.

## D9. Embedding model

1. No NVIDIA embedding model is served.
2. Qwen/Qwen3-Embedding-8B on Token Factory is used, at $0.01 per 1M tokens, so it stays on Nebius and in the ledger.
3. The dimension is chosen in Phase 2.

## D10. Who Pilot is

1. Part A names Safwan as operator building with Ubaid, while Part B names Ubaid as owner.
2. All documents address the reader as Pilot, as both parts ask.

## D11. Bounded output schemas (Stage A prompt version a2)

1. In the first full Stage A batch, 50 of 749 reports (6.7%) failed: Nano looped, repeating the same array item until max_tokens.
2. Adding maxItems and maxLength to every array and string in the json_schema stopped the loops. Guided decoding enforces both.
3. A frequency penalty was tested and rejected: it made Nano drop real concerns.
4. The same bounds were added to the Stage B, C, D and F schemas and to the live brief's schemas.
5. Only reports that failed under a1 were re-run. Reports that succeeded under a1 were kept.

## D12. Quote verification repairs (blocker resolved)

1. The a2 pilot on the 20 hardest reports verified 84% of quotes, below the 90% floor. A blocker note was written and Stage A paused.
2. Causes: Nano sometimes quoted the circumstances excerpt it was given, and sometimes skipped words mid-quote.
3. Fix one: a quote is also checked against the circumstances excerpt. Those are still the report's own words.
4. Fix two: when the first 40 or more characters match exactly, the displayed quote is the source text from that point to the end of the sentence.
5. Both fixes are deterministic. Stored quotes were re-checked with no new model calls.
6. After the fix the same pilot verified 56 of 56 quotes, and 97.8% of all quotes so far verified. Stage A resumed.

## D13. Linking thresholds from the coroner-acknowledged pairs

1. On a snapshot of about 1,700 reports, the 12 acknowledged pairs that share an organisation had a best concern-pair embedding cosine between 0.63 and 0.80.
2. The median candidate pair at the loose thresholds scored 0.627.
3. Thresholds were set to embedding 0.62 or TF-IDF 0.25, with at most 30 pairs per organisation. This keeps every acknowledged pair seen so far and roughly halves the candidates.
4. If the full corpus still gives more pairs than the Stage C budget covers, the highest hybrid scores are judged first and the rest are left unjudged and logged.
5. Many acknowledged pairs are less than six months apart (7 of 12). The six-month rule from the handoff stays; the evaluation reports both sets.
