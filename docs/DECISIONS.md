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

## D28. Tavily budget from the real balance

1. The earlier cap of 250 credits rested on an unconfirmed assumption. The usage endpoint showed 788 credits left this month (RESEARCH_LOG, 16 Oct).
2. Stage F may use 70% of that: 551 credits. The cumulative ledger cap is now 801 (the first 250 plus 551). The ledger counts extracts conservatively, so it binds before Tavily's own count does.
3. At least 30% (237 credits) stays for the live agent until 15 Dec. The agent also has its own caps: 8 credits a day and 230 in total, counted in the database. The plan resets to 1,000 credits each month.
4. Order of checks: the 4 demo chains, then the 25 chains with a dossier, then the chains with the most recurrences. Each chosen promise and the reason it was chosen are written to data/exports/followup_selection.csv.

## D29. The live brief is a tool-calling agent, with the fixed pipeline as fallback

1. Nemotron Super chooses among five tools through native tool calling on Token Factory:
   - search_earlier_concerns (pgvector);
   - judge_candidate (the same structured judge as the fixed pipeline, with quotes checked in code);
   - get_response_promises;
   - get_chain;
   - tavily_check (reuses the Stage F result when there is one).
   It ends by calling submit_findings.
2. Limits: 5 rounds and $0.015 per run, with tool costs included. The last round forces submit_findings. The per-run limit is above the first estimate of $0.01 because judging five candidates plus four model rounds came close to it in testing, and hitting it would trigger the costlier fallback.
3. The model never writes the quotes that are shown. Verdicts come from judge_candidate, and a quote that matches the source apart from letter case is shown in the source's own words. Web evidence is shown only with a quote found in a source the agent was given.
4. If the loop fails, gives no tool call or hits a limit, the fixed pipeline runs instead, so a brief is always produced. LIVE_AGENT=off switches the agent off.
5. The loop and checks are in web/lib/agent-core.ts, with no database or network imports, and are tested offline with a scripted fake model.
6. In testing, the archive report for David Levett gave 4 verified earlier warnings in 5 rounds and 4 tool calls, for $0.0056. The fixed pipeline found 2 for the same report.

## D30. A second candidate route, reported as post-hoc

1. Most of the 14 missed test pairs never reached the judge: no single pair of concerns passed the candidate filter.
2. The new route sends each later report's top 3 earlier reports to the same organisation, by whole-report wording (TF-IDF at 0.137 or above), to the judge. Each such report pair is judged on its best-scoring pair of concerns.
3. The settings were chosen before any test result. The cut-off is the TF-IDF baseline's existing equal-budget threshold, and top 3 was picked from a dry-run cost estimate (482 new pairs, about $0.36). Nothing was tuned on the 29 pairs.
4. Cost: $0.341 for 482 judged pairs. 153 were identical or closely related, and 99% of quotes were verified.
5. Result on the blind test: 15 of 29, the same as before. One more test pair reached the judge, and was judged related at 0.80, so it is not shown.
6. The Evaluation page shows this as a separate post-hoc row beside the original comparison, which is unchanged. No other set of coroner-acknowledged pairs exists, so it has not been validated on held-out pairs.
7. The route stays because it adds verified links on the archive: shown links rose to 1,360 and chains to 666. 23 chain keys were redirected.

## D31. A quality gate for what is put forward

1. A chain is featured on the home page, or in the Start here row, only if every link is identical or closely related, at confidence 0.85 or above, with both quotes verified.
2. The list is in pipeline/publish/featured.yaml. python -m pipeline.cli featured-report writes docs/FEATURED.md with the reason for each decision.
3. The Worcestershire VTE chain is never featured. Its two quotes point in opposite directions. A second chain built on the same earlier report is excluded too.
4. Smart motorways fails the gate (links at 0.80). It stays in the hero timeline only, which shows its own figures from the database.
5. Latest recurrences on the home page show only links at the gate's confidence, from chains not on the exclusion list.
6. The list is curated examples in a fixed order, not a ranking of organisations.

## D32. A brief is never a dead end

1. The three example chips run from briefs computed in advance with the pipeline key, and replay their trace at no cost. They are stored in pub_meta (precomputed_briefs).
2. When the live brief is paused (no live key, a cap reached or the switch off), an archive report shows its own saved brief from the published links and responses, with the steps replayed and a notice saying so.
3. Any other input gets the two most relevant precomputed examples, same organisation first, each labelled "Example, not your report" with the reason it was chosen.
4. The reason for the pause is written to the server log (console.warn) with the reason code and what is missing. Keys are never logged.

## D33. Ontario skipped

1. The optional Ontario extension was skipped, as agreed in round 3. Its data terms are uncertain and its response duty differs. The time went to the brief fallback and the judge-facing pages instead.

## D34. Verified word for word, and a stricter redaction pass

1. Each shown link now carries a short window of source text either side of both quotes, up to 220 characters, cut at whole words. On the chain page the quote is highlighted inside it. All 2,720 shown quotes were found in their source.
2. Only the window is published, never the whole report.
3. Text in a window has not been through a quote check, so it gets a stricter pass on top of the usual redaction:
   - every part of the deceased's name and of each person recorded in the report, with and without accents;
   - any first name known anywhere in the archive, with the capitalised words after it;
   - any name after Mr, Mrs, Ms, Dr or Baby.
   A first name followed by a place word ("John Radcliffe Hospital", "Clare's Law") is kept.
4. The first-name list drops words that report text uses more often in lower case ("home", "will"), and rare entries that are also part of a coroner area or organisation name ("Surrey").
5. Checking the published quotes against this pass found 10 with a first name the earlier redaction missed (for example "In Chris' case"). The first-name pass now runs on every quote and model sentence. It changed those 10 and nothing else.
6. Pages fetched fresh by the live brief still use the TypeScript redaction, which has no first-name list. The live brief is paused for visitors without a key, so this path is not shown publicly at present.

## D35. Hazard titles say "leading to", never "causing"

1. 48 model-written chain titles used "causing" for a hazard's mechanism ("No hard shoulder on smart motorways causing unsafe stops").
2. The wording rule forbids "caused", so titles are rewritten in code: "causing" becomes "leading to", and "caused by" becomes "from". Nouns such as "root cause" are left alone.

## D36. Example reports for the chips and audience cards

1. The examples must run instantly and show a real result, so they come from the 28 precomputed briefs.
2. The ambulance report first chosen found no earlier warnings in its precomputed run: the agent picked the Department of Health and Social Care as its organisation. It was replaced by a 2026 young driver report that finds 4.
3. The examples are a smart motorway report (coroner), a young driver report (solicitor or lawyer), a railway platform report (family) and a prison first aid report (safety team).

## D37. Front-end round: navigation and a small motion system

1. Nemotron, Evaluation and Methodology are one section, How we know, with a tab each: /how-we-know, /how-we-know/evaluation and /how-we-know/methodology. The old addresses redirect permanently (308), including anchors such as #corrections.
2. The sidebar has 8 items. Check a report, You be the judge and Hazard map are marked as the main things to try. Organisations left the sidebar; it is reached from chain and report pages and from the command palette.
3. The home page always tells the smart motorway case, in the hero and in How a warning gets lost. It is still not featured elsewhere (D31).
4. The guided path strip (see a chain, watch the agent, check the evidence, see the cost) is rendered on the server. Dismissal is stored in localStorage and applied before paint, like the theme, so the strip never shifts the page.
5. Phones get a bottom tab bar: Home, Check, Chains, Map.
6. Animations use one hook and a few CSS classes (components/motion/useMotion.ts), with no animation library. An animation plays once when it scrolls into view and ends on a still frame. The start frame applies only when scripts run, so without them, with reduced motion, or for an animation already seen this session, the page shows the final frame. ?replay in the address plays everything again, for recording.
7. Playwright is not added to package.json: it is far over the 30 KB limit for new dependencies without asking. The smoke tests are in the repo and run with a Playwright install outside the project (docs/UX_NOTES.md).

## D38. Animations that cost almost nothing to run

1. Moving parts change only opacity and transform, each on its own layer, so the browser composites them instead of repainting. The first home timeline repainted its drawing on every frame; the rework cut paint from about 1.5 s to 0.13 s under Lighthouse's CPU slowdown.
2. An animation starts when the browser is idle after coming into view (at most 0.7 s later), so it never competes with page start-up.
3. Lighthouse was compared side by side with the build from the start of the round, under the same machine conditions, because a busy laptop moved absolute scores by up to 20 points.
4. The browser smoke tests check behaviour, not screenshots, so they need no snapshot updates when styling changes.

## D39. A home page a judge can follow in one read

1. The page opens with how the coroner system works, in three plain lines, then one line on what Recurrence Watch found. Judges may not know what a Prevention of Future Deaths report is.
2. The second section replays the real recorded agent run for a 2023 smart motorway report, step by step, with the time, the cost and the number of earlier concerns a person would have had to read. The result shows the matched quotes with links to the originals.
3. The home page lost its repeated sections (the problem row, audience cards, figure tiles, latest repeats, how it works). The audience cards moved to Check a report, where each opens a brief.
4. "Recurrence chains" reads "Repeated warnings" wherever a visitor sees it; the addresses are unchanged.
5. The replayed trace starts empty and builds only in view. Rendering it on the server and clearing it on load had added a one-second task at start-up; measured side by side with the previous build, the home page now scores higher than before.

## D40. The Spine design (design_handoff_spine)

1. The site takes the Spine palette (near-black ink, grey-green paper, one moss accent), Figtree throughout, and flat surfaces with borders instead of shadows. All text pairs were checked at 4.5:1 or better in both themes before the change.
2. Navigation is a dark icon rail on screens 900px and wider (search, seven places, theme), and a top bar with a five-tab bar on phones. Promises and How we know are in the rail, the search palette and page links; Recent repeats and Organisations are in the palette and page links.
3. The home hero is the smart motorway chain as a vertical spine: distance down the page is time, at 9px a month (tightened for a long chain). The headline year, the counts, the gaps and the cited or not-cited tags all come from the chain's own data. Rows read "Report N", the month and the coroner area, never a name, and each opens that report on the chain page.
4. Kept from earlier rounds, below the hero: the plain three-line explanation of the coroner system, and the agent's recorded run. The 100 dots moved to the Repeated warnings page, since the hero now carries those figures.
5. Measured side by side with the previous build on an idle machine, every page tested is as fast or faster (home 98 against 97, chain page 96 to 97 against 94 to 95, Check a report 98 to 99 against 95 to 96), accessibility 100.

## D41. Touches on top of the Spine design

1. Pointing at a report on the spine (or tabbing to it) shows what that report said: the quote from its strongest link, with the link's relation, confidence and the source. A report that no later report links back to takes its quote from its link forward.
2. A report with no link pointing into it gets no cited or not-cited tag, because whether it cited anything is unknown. Previously it read "Not cited".
3. Following a spine row to the chain page shows that report at once with a brief highlight, instead of the scroll-in animation, on a full load or a navigation inside the site.
4. The site name sits above the hero on desktop, where the rail shows only the logo. The browser tab icon and both share-preview images use the Spine colours and Figtree (bundled under its open licence in web/assets/fonts).
