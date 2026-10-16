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
3. pipeline/db/schema_postgres.sql carried the same schema for Supabase. Superseded by D21: Supabase was dropped and that file removed.
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

## D15. Local live-brief test with the pipeline key

1. The live brief was tested once, end to end, on a local production server.
2. No deployed-app key exists yet, so the local server process was given the pipeline key as NEBIUS_LIVE_API_KEY, server side only. It is never sent to a browser, and nothing was deployed.
3. The test's cost ceiling was $0.05, and its spend was copied into the pipeline ledger under dev, so the accounting is complete.
4. The deployed app must still use its own key (docs/DEPLOY.md).

## D16. What "quotes verified" means for a judged link

1. The handoff requires verbatim quotes from both documents for every shown link. Those are the earlier and later quotes.
2. The first Stage C pilot also failed a verdict whenever the optional promise quote did not match, which gave 85%.
3. Now a link counts as verified when both report quotes verify. An unverified promise quote is never shown; the link may still be.
4. Stage B had also captured some coroner template lines that responses quote back (for example "You are under a duty to respond"). Ten such non-promises were removed, and the extractor now filters them.
5. Re-checked with no model calls, the same pilot verified 19 of 20 (95%).

## D17. Wider retrieval for national bodies (top 5 to top 10)

1. In the first blind test, 10 of 29 coroner-acknowledged pairs never reached the judge. Most were national-body pairs whose earlier report ranked 6th to 12th among that body's earlier concerns, while retrieval sent only the top 5 for national bodies.
2. The evaluation's candidate gate was also made exact: it now runs the pipeline's own candidate builder on the masked texts, instead of approximating it with a rank cut-off.
3. Retrieval for national bodies was widened to the top 10. Only the new pairs were judged, with the c2 prompt that had already passed its pilot, at the measured $0.00074 per pair, and inside the Stage C cap with the evaluation reserve kept.
4. Chains that grew got new chain keys. Their earlier dossiers were removed and redrafted, so no more than 25 current chains have a dossier.

## D18. Pair cap that scales with organisation size

1. Widening national retrieval (D17) added only 41 pairs, because the cap of 30 pairs per organisation was the real limit. DHSC (821 reports), NHS England (548), CQC (172) and the Department for Transport (127) each had at most 30 candidate pairs.
2. The cap is now the larger of 30 and half the organisation's number of reports.
3. This added 735 pairs, estimated at $0.54, judged with the already-piloted c2 prompt inside the Stage C cap with the evaluation reserve kept.

## D19. Chains are joined through shared concerns, not shared reports

1. Joining links whenever two shared a report merged different hazards at large bodies. One DHSC "chain" had 60 reports under a single hazard title.
2. Links are now joined only through the same concern, so a chain follows one hazard. A report that raises two hazards can sit in two chains.
3. Result: 619 chains instead of 453. The largest are single hazards that genuinely recur, for example ambulance arrival delays (33 reports) and a lack of acute psychiatric beds (22).
4. Chain keys changed, so dossiers were redrafted for the new flagship chains, within the Stage D cap and the 25-chain maximum.

## D20. Stable chain keys with redirects

1. Chain keys were hashes of their members, so every rebuild that added a report changed the key and broke links, including the demo URL.
2. A key is now a hash of the organisation and the chain's earliest link (its earliest concern pair). Later reports joining a chain do not change it.
3. When a key does change (chains merge or split), chain_redirects maps the old key to the new one and the site redirects. A dossier moves with its chain, and keeps its review only if the chain's concerns are unchanged.
4. A second rebuild of the full data redirected nothing. A test checks this on fixtures.

## D21. PostgreSQL as the published layer, with a restricted web role

1. Pilot asked for PostgreSQL on our own server, not Vercel or Supabase, so the site works from anywhere and stays current.
2. The pipeline keeps its tested SQLite working database. python -m pipeline.cli publish writes only display-safe rows into PostgreSQL in one transaction: verified quotes, redaction, wording checks, reviewed dossiers only. It reuses the export's selection code, so the rules live in one place.
3. The site reads PostgreSQL at request time, with a two-minute in-process cache, so a refresh needs no rebuild.
4. The web app connects as rw_web, which can read the published tables and write only brief_kv (the live brief's cache, ledger and limits). The pipeline connects as the owner.
5. Live brief retrieval uses pgvector nearest neighbours per organisation instead of JSON shards.
6. Full-text search covers report titles, concern quotes, chain hazards, link quotes and organisation names.

## D22. Chain titles from Nano

1. Hazard labels from Stage A are short lowercase fragments and read badly as page titles.
2. Nano writes one neutral title per chain from its verified quotes, cached by the chain's contents and billed to the dev bucket. 603 of 618 chains got a title for $0.009.
3. Titles pass the same wording check as other model text. Chains without one fall back to the formatted hazard label.

## D23. Self-hosting with Docker Compose

1. One server runs PostgreSQL with pgvector, the web app, a worker and Caddy for HTTPS. The target is a small CPU VM on Nebius AI Cloud; the same files work on any Linux VPS.
2. The worker publishes on first boot, then runs the incremental refresh weekly with a $0.50 ceiling per run, and republishes.
3. Without a domain, Caddy gets a certificate for an sslip.io name on the server's IP.
4. The whole stack was built and run locally in Docker on WSL before handing over: first-boot publish, every route, redirects, search, the paused brief and the restricted role all checked.

## D24. The deceased named by report title only, in quotes too

1. Rule 5 says the deceased are referred to by the report's published title only, with no added personal detail. About 509 shown quotes used the deceased's name in the coroner's own words.
2. Pilot chose the strict reading. In displayed quotes, the deceased's full name or first name becomes [the deceased]. An honorific with a surname, or another first name with the deceased's surname, becomes [name redacted], since it may be a relative.
3. A name next to a role word ("Jane Smith, the triage nurse", "his mother, Mary") is redacted as staff or family, and never treated as the deceased. Places and other people sharing a first name are left alone ("St John Ambulance", "John Radcliffe Hospital").
4. Quotes are verified against the source before redaction, so verification is unaffected.

## D25. The live brief shows its work

1. The Apps and Agents track rewards visible agent behaviour. Each step now streams its model, tool, tokens, time and cost, the retrieved candidates with similarity, and each verdict with the reason it was kept or dropped.
2. A saved brief keeps its trace and replays it, marked as a replay, so a repeated input still shows the agent's steps at no cost.
3. Quotes in the trace from freshly fetched reports pass the same redaction as the brief.

## D26. The hazard map is computed once, offline

1. The 1,024-dimension concern embeddings are reduced with PCA to 50 dimensions, then t-SNE with a fixed seed, and scaled with one factor for both axes.
2. The layout is cached by the set of concern ids, so a publish recomputes it only when new concerns arrive (about 3 minutes). No model calls are made.

## D27. The publish never blocks page reads

1. The schema step uses ALTER TABLE, which takes an exclusive lock. Inside the data transaction it blocked every page read for the whole publish.
2. The schema now runs in its own short transaction, and the data load follows in a second one. Readers see the old rows until the new ones commit.
