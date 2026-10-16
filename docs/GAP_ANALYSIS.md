# Gap analysis (16 Oct 2026, round 4)

What a judge meets in the first two minutes, what was weak at the start of this round, and what changed. Checked against the four judging criteria and the rules in the brief.

## The first two minutes, as a judge

1. Start here opens on the headline and a timeline of the smart motorways chain. Its seven reports appear one after another, drawn to scale, beside two figures read from the database: the later report does not cite the earlier one in 99% of links, and comes from a different coroner in 85%.
2. Below it, four steps tell one real chain as a story, then four cards offer ways in for a coroner, a solicitor or lawyer, a family and a safety team.
3. Each card, and each example chip on Check a report, opens a real report and shows the agent's full trace within about seven seconds, replayed from a recorded run at no cost.
4. A chain's Evidence tab shows both quotes for each link. "Verified word for word" shows each quote highlighted inside the text of its source report.
5. The footer names what it is built with: Nemotron, Token Factory, Qwen3 embeddings, Tavily, Postgres and Next.js.

## Weaknesses at the start of the round, and what changed

| Area | Before | Now |
|---|---|---|
| Check a report without a live key | A paused message and generic examples | An archive report shows its own saved brief with the steps replayed; other input gets the closest examples, labelled as not the visitor's report (D32) |
| Example chips | Filled the box only | Run at once from 28 recorded agent briefs |
| Autocomplete | No loading state, 250 ms debounce | A spinner, 110 ms debounce, arrow keys and Enter |
| What is featured | A hand list, including a chain whose two quotes point in opposite directions | A quality gate: every link identical or closely related, at 0.85 or above, quotes verified; the VTE chain excluded (D31, docs/FEATURED.md) |
| Candidate recall | 9 of 14 test misses never reached the judge | A second route by whole-report wording added 482 judged pairs and 143 shown links. It recovered none of the test misses, and is reported as post-hoc (D30) |
| Home page | A static problem card | The animated chain timeline, the audience cards and the built-with strip |
| Chains page | A list | Start here row, filter chips, a dot timeline and coroner count on each card |
| Evaluation page | Numbers | A bar chart with 95% ranges, misses collapsed by reason, the post-hoc row apart |
| Printing | None | A one-page brief and a one-page chain, from a button on each |
| Quotes in context | Quote only | The quote highlighted in a short, redacted window of its source (D34) |

## Lighthouse (mobile preset)

| Page | Performance before | Performance after | Accessibility before | Accessibility after |
|---|---|---|---|---|
| / | 97 | 97 | 96 | 100 |
| /brief | 98 | 98 | 96 | 100 |
| /chains | 98 | 97 | 96 | 100 |
| /chains/c52cded99f756309 | 83 | 95 | 93 | 100 |
| /evaluation | 97 | 97 | 96 | 100 |
| /map | 98 | 97 | 96 | 100 |

Best practices was 100 on every page before and after.

1. The chain page lost its score to layout shift (0.267). The breadcrumb row wrapped to two lines in the fallback font, then to one when the web font arrived. It now stays on one line, and the shift is 0.001.
2. Accessibility: links inside running text are underlined, and the small links to judiciary.uk have a 24 px target and a label.

## Screenshots

Every route at 1440 and 375 px, light and dark (76 images): no sideways scrolling and no browser errors. The only non-200 response is the intended 404 page.

## Rule checks

1. Wording: titles no longer say "causing" (D35). Model sentences pass the blaming-word check. A search of the site's source for "ignored", "caused", "failed to act" and "is responsible" finds them only in the Methodology disclaimer, which says a link is not such a finding, and in the model prompts that forbid them.
2. Every shown link has verbatim verified quotes from both reports, a relation and a confidence. All 2,720 shown quotes were found again in their source for the new context panel.
3. Redaction: a first-name pass found 10 published quotes with a first name the earlier redaction missed. They are now redacted, and the pass runs on every quote and model sentence (D34).
4. No rankings or league tables. Featured and Start here lists are curated examples in a fixed order.
5. Keys: environment only. The precompute script passes the pipeline key to a local server process and never prints it. Secret scans ran before each commit.
6. Spend this round: $0.49 of the $4 allowed. Total $5.65 of $20.

## Still open

1. Precision waits on Pilot's 80 labels.
2. The platform-ends and prison first aid dossiers wait on Pilot's approval.
3. Pages fetched fresh by the live brief use the TypeScript redaction, which has no first-name list (D34).
4. The post-hoc route cannot be validated on held-out pairs: no second set of coroner-acknowledged pairs exists.
