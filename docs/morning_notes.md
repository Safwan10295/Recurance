## Where things stand

1. The site reads PostgreSQL and works as a tool. To open it on this PC, double-click start_site.cmd, then go to http://localhost:3000. Without a live key, Check a report replays recorded and archive briefs instead of running live.
2. The repo is private on GitHub, and this round is pushed to it.

## What changed this round

1. Check a report always gives an answer. Archive reports show their own saved brief, the three example chips run instantly from recorded agent runs, and other input gets labelled examples (D32).
2. Start here has the animated smart motorway timeline, four ways in for a coroner, a solicitor or lawyer, a family and a safety team, and a built-with strip.
3. Each link's quotes can be seen highlighted inside their source reports ("Verified word for word", D34).
4. Featured chains pass a quality gate, and the VTE chain is never featured (D31, docs/FEATURED.md).
5. A second candidate route added 143 shown links. It did not change the blind-test result, and the Evaluation page shows it apart as post-hoc (D30).
6. The chains page has a Start here row, filter chips and dot timelines. Evaluation has a chart with ranges. Briefs and chains print on one page.
7. A stricter redaction pass caught 10 quotes with a first name, and titles no longer say "causing" (D34, D35).
8. Lighthouse before and after, and the full audit, are in docs/GAP_ANALYSIS.md. Every audited page now scores 95 or more for performance and 100 for accessibility.

## Tavily

No Tavily credits were used this round. Stage F's earlier use is in the spend section above.

## Blockers this round

None. Ontario was skipped as agreed (D33).

## Verified

1. 67 Python tests and 15 TypeScript tests pass offline.
2. With no live key, all 28 demo-chain reports and the chip reports replay their recorded briefs, other linked archive reports give archive briefs, and free text gets labelled examples. The pause reason appears in the server log.
3. 76 screenshots: every route, desktop and phone, light and dark, with no sideways scrolling and no browser errors.
4. All 2,720 shown quotes were found in their source for the new context panel, and a leak check on the context windows found no recorded names.
5. Secret scans ran before every commit.

## Not tested

1. The live agent with a visitor-facing key. The site was run locally without one, as you asked.
2. The stack on a real Nebius VM with a real certificate.
3. Precision of shown links, which waits on your labels.
4. The post-hoc route on held-out pairs, as no second test set exists.
