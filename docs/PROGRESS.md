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

## Phase 6: PostgreSQL, the tool redesign and the server package (2026-10-15 evening)

Pilot's review: the site read as information on a page, not a tool; it ran only on one PC; and it should use PostgreSQL on our own server. The plan was approved and built in full.

1. Data layer: python -m pipeline.cli publish loads display-safe rows into PostgreSQL 16 with pgvector (D21). 6,454 reports, 3,832 organisations, 618 chains, 1,217 links and 27,747 brief concerns.
2. Stable chain keys with redirects (D20). The smart motorways chain is now /chains/c52cded99f756309, and its old key redirects.
3. Chain titles from Nano (D22). Four featured chains are named in pipeline/publish/featured.yaml.
4. Web app rebuilt as a tool:
   - an app shell with a sidebar, global search and a "Check a report" button;
   - Start here with a 60-second tour;
   - Recent, Explore chains (filters, two tabs) and a tabbed chain viewer;
   - organisation and report pages;
   - search, evaluation and methodology.
5. Live brief on PostgreSQL: pick a report from the archive, paste a web address or paste concerns. Results have a shareable link.
6. Server package in deploy/ (D23), with weekly refresh by the worker.
7. One more dossier drafted, for the emollient fires chain ($0.004). 25 dossiers in total, the Stage D maximum, all unreviewed.

Verified:
1. 49 Python tests and 5 TypeScript tests pass. New tests cover stable keys and publishing to a throwaway PostgreSQL schema (redaction, hidden dossiers, kept first-seen dates).
2. The Docker stack was built from a clean copy of the repo and run in WSL:
   - the first-boot publish matched the local counts;
   - every route returned 200, and unknown keys returned 404;
   - the old chain key redirected;
   - search found the smart motorways chain;
   - the brief paused gracefully without a key;
   - the web role could not change published tables.
3. Every main page at 375 px wide, light and dark: no sideways scrolling.
4. The live brief on PostgreSQL with the pipeline key, locally: archive report, pasted concerns, bad URL and a repeat from cache, $0.0033.

Fixed along the way:
1. Primary buttons had invisible text. A global link colour outranked Tailwind's utilities, so the element styles moved into a CSS layer.
2. On phones, chain filters now fold under "More filters".
3. The health endpoint no longer echoes database error text.

Not tested:
1. The stack on a real Nebius VM, with HTTPS from a real certificate. Both need Pilot's VM.
2. The hosted brief with its own key.

Spend: $5.10 of $20. The $5 live reserve and the $9.50 margin are untouched.

## Phase 7: stricter redaction, the live agent trace and three showcase pages (2026-10-16)

Pilot asked for better navigation, a stronger interface, and features that catch judges' eyes. Pilot chose all four proposed features and the strict reading of the deceased rule.

1. Redaction (D24):
   - the deceased are named by report title only; in quotes their names become [the deceased];
   - untitled staff and family names next to a role word are redacted;
   - the live brief's TypeScript redaction now matches the Python rules.
2. Watch the agent: the live brief streams every step with its model, tokens, time and cost, the candidates it retrieved with their similarity, and each verdict, kept or dropped and why. A repeated input replays its saved trace (D25).
3. Hazard map: every verified concern placed by meaning, from a t-SNE projection of the stored embeddings, cached and computed once with no model calls (D26). The recurrence links are drawn between points.
4. Promises, then the same concern: the 508 links where a response stated an action and a later coroner raised the same concern.
5. How Nemotron did the work: the archive-to-evidence funnel and per-model tokens, latency and cost, from aggregates of the cost ledger.
6. Navigation and interface:
   - a command palette (Ctrl K or /) with instant results;
   - a theme toggle, icons, breadcrumbs on every page and loading states;
   - an accessible mobile drawer;
   - explainers on relation, confidence and other labels.
7. Chain page: a vertical story timeline to scale, a compact evidence list, next steps and a share image.
8. Fixes:
   - acronyms restored in chain titles ("ACCT", "HMP Woodhill");
   - themes grouped from 127 category spellings into 11;
   - no ordering by report counts anywhere;
   - search shows true totals;
   - Recent loads in two queries instead of thirty;
   - shares round down, so 99.6% shows as 99%;
   - the publish no longer blocks page reads while it runs (D27).

Verified:
1. 54 Python tests and 6 TypeScript tests pass, including new redaction, theme, casing and map-layout tests.
2. All 15 main pages return 200 at 1366 px and 375 px, light and dark, with no sideways scrolling and no browser errors.
3. The live brief, run in a browser with the pipeline key under a $0.05 ceiling:
   - an archive report: 2 earlier warnings, $0.0016;
   - a replay of the same input;
   - pasted concerns: 3 earlier warnings;
   - phone width.
   Total spend for these tests: $0.007.
4. During a publish, 40 consecutive page loads all returned 200.

Spend: $5.11 of $20. The $5 live reserve and the $9.50 margin are untouched.

## Phase 8: hands-on features for judges (2026-10-16)

1. A guided tour of nine stops across the real pages, started from Start here or the sidebar. It ends if the reader navigates away, and the spotlighted feature stays usable.
2. You be the judge: eight rounds from 64 published pairs, 16 for each verdict, with quotes verified and redacted. The player decides "same hazard or not", then sees Nemotron Super's verdict and reasoning. The closing screen explains why the site exists and how it keeps itself up to date, whether the player finishes or stops early.
3. Replay the years on the hazard map: concerns and recurrence links appear month by month from 2013.
4. Shares are rounded normally again, except that a share below 1 never shows as 100%.

Verified in a browser at desktop and phone width: the game played through and stopped early, the map replay, and every tour stop. No browser errors and no sideways scrolling.

## Phase 9: tool-calling agent, deeper Tavily, honest evaluation, hardening (2026-10-16)

1. The live brief is a tool-calling agent (D29). Nemotron Super chooses search, judge, promises, chain and web-check tools in up to 5 rounds, within $0.015 a run. Tested live: 4 verified earlier warnings for an archive report, against 2 from the fixed pipeline, for $0.0056. The fixed pipeline remains the fallback.
2. Tavily (D28):
   - the budget was set from the real balance;
   - 269 promises checked, covering all 16 on the demo chains, all 176 on chains with a dossier, and 71 more;
   - evidence found for 28, contradicting for 2, nothing either way for 239;
   - the live agent has its own daily allowance.
   Quotes from web sources are now redacted too.
3. Evaluation:
   - 95% Wilson intervals: TF-IDF 20% to 53%, embeddings 26% to 59%, Nemotron 34% to 69%;
   - each of the 14 misses explained: 9 never reached the judge, and in 5 the judge called it a different hazard;
   - per-model cost and tokens, and the cost per chain both with every stage and with analysis only.
   No threshold was changed.
4. The Token Factory credit balance cannot be read from the API (RESEARCH_LOG).
5. Deployment: backup.sh, smoke.sh, an uptime check and a 1 to 15 Dec runbook. A read-only JSON API at /api/v1/chains.
6. Submission writing: GAP_ANALYSIS, DEVPOST_DRAFT, VIDEO_SHOT_LIST, SUBMISSION_CHECKLIST, plus additions to FEEDBACK and the README.

Verified:
- 56 Python and 15 TypeScript tests pass offline, including new tests for the agent loop and its checks.
- smoke.sh passes against the local site.
- The live agent was tested in a browser under a $0.05 ceiling.

Spend by stage: A $0.77, B $0.23, C $3.02, D $0.97, F $0.05, dev $0.11, embeddings $0.01. Total $5.16 of $20. The $5 live reserve and the $9.50 margin are untouched.

## Phase 10: judge-facing polish, brief fallback, featured gate, post-hoc route (2026-10-16)

1. Check a report is never a dead end without a live key (D32):
   - archive reports show their own saved brief with the steps replayed;
   - other input gets the closest recorded examples, labelled as not the visitor's report;
   - the pause reason is written to the server log.
   Tested on all 28 reports of the four demo chains plus the chip reports: every one replays its recorded brief in about 7 seconds. Four other linked archive reports gave archive briefs.
2. The three example chips and four audience cards run from 28 recorded agent briefs ($0.148).
3. A quality gate for featured chains (D31). docs/FEATURED.md lists each decision. The VTE chain and one sharing its earlier report are never featured.
4. A second candidate route by whole-report wording (D30):
   - 482 pairs judged for $0.341;
   - 153 identical or closely related, 99% with quotes verified;
   - shown links rose from 1,217 to 1,360, and chains from 618 to 666;
   - blind-test recall unchanged at 15 of 29, reported as a separate post-hoc row.
5. Home page: the animated smart motorway timeline, the audience cards and a built-with strip. Chains page: Start here row, filter chips, dot timelines and coroner counts. Evaluation: a bar chart with 95% ranges. Printable one-page brief and chain.
6. Verified word for word: each shown quote highlighted in a short redacted window of its source (D34). A stricter first-name redaction pass now runs on every quote and model sentence, and changed 10 published quotes.
7. Titles say "leading to", never "causing" (D35).
8. Lighthouse: chain page performance from 83 to 95 and accessibility from 93 to 100. Every audited page now scores 95 or more for performance and 100 for accessibility (docs/GAP_ANALYSIS.md).

Verified:
- 67 Python and 15 TypeScript tests pass offline, including new tests for the featured gate, the context window, the first-name pass and title wording.
- 76 screenshots across every route, desktop and phone, light and dark, with no sideways scrolling and no browser errors.

Spend by stage: A $0.77, B $0.23, C $3.37, D $0.97, F $0.05, dev $0.26, embeddings $0.01. Total $5.65 of $20. This round used $0.49 of its $4. The $5 live reserve and the $9.50 margin are untouched.

## Phase 11: front-end round, navigation (2026-10-17)

1. docs/UX_AUDIT.md: 108 screenshots (18 routes, 1440, 768 and 390 px, light and dark) and a warm Lighthouse baseline of 95 to 98 for performance and 100 for accessibility.
2. How we know: one section with three tabs, old addresses redirected (D37).
3. Sidebar down to 8 items, with the three main features marked. The same three are large cards under the home hero, the hazard map card with a muted preview of the real map.
4. The home page tells the smart motorway case throughout.
5. A dismissible Step 1 of 4 guided path, and a bottom tab bar on phones.
6. The Check a report tabs no longer wrap on phones, and You be the judge no longer scrolls itself on first load.
7. Started on the animations: the hero draws its chain (A1), the 100 dots (A2) and a cost odometer (A5) on the home page.

No Nebius or Tavily spend.

## Phase 11, continued: agent trace, funnel, source check, findings (2026-10-17)

1. Check a report (A3): step cards slide in, each model or service has its own badge colour (Nano, Super, Qwen3, Tavily), token and cost counters tick up as steps finish, kept quotes get a small verified mark and dropped verdicts fade back with their reason. Replays use the recorded trace. The running step now breathes slowly rather than pinging.
2. How we know, Nemotron tab (A4, A5): a narrowing funnel from concerns extracted to chains, each step with its ledger cost and tokens, and the total spend as an odometer beside the cost per verified chain.
3. Check it in the source (A6): every quote of a shown link, on chain pages, Recent, Promises and archive briefs, opens its source window with the quote lighting up word by word, then a check mark. The original link stays beside every quote.
4. What surprised us (A10): four findings from the published data, each linked to its evidence: the quote match rate, the share of look-alike pairs the judge rejected, the test misses that never reached the judge, and the cost per chain.
