# Morning report

Written for Pilot. Numbers below are generated from the ledger and database by scripts/write_morning_report.py.

## Spend

Total Token Factory spend: $5.6516 of the $20.00 pipeline hard stop. The $5 live reserve and the $9.50 margin are untouched.

| Bucket | Spent | Cap | Remaining |
|---|---|---|---|
| dev | $0.2568 | $5.40 | $5.1432 |
| embed | $0.0117 | $0.30 | $0.2883 |
| F | $0.0451 | $0.30 | $0.2549 |
| A | $0.7729 | $1.50 | $0.7271 |
| B | $0.2321 | $1.00 | $0.7679 |
| C | $3.3670 | $4.00 | $0.6330 |
| D | $0.9660 | $2.00 | $1.0340 |
| ntsb | $0.0000 | $1.00 | $1.0000 |

Tavily credits used by Stage F: 801 of its cap of 801 (ledger count; D28). The live agent has its own allowance.

## What the pipeline produced

1. Report pages parsed: 6507 (6454 unique after removing republished copies).
2. Reports with extracted concerns: 6196. Concerns: 15366, of which 15044 have a verified quote.
3. Organisations after normalisation: 3832.
4. Candidate pairs: 4543. Judged by Nemotron Super: 4543 (closely_related 1052, different 1472, identical 514, related 1505).
5. Response documents read: 1763. Promises with verified quotes: 2276.
6. Verified chains: 666. Dossiers drafted: 25, of which you have approved 6. Follow-up checks: 269.

Unique reports vs the expected 6,449: 6454 (+0.1%). The listing pages and sitemaps were cross-checked (docs/RESEARCH_LOG.md).

## Evaluation headline

- TF-IDF only: blind-test recall 34%, links shown 1217.
- Embeddings only: blind-test recall 41%, links shown 1217.
- Hybrid + Nemotron Super judge: blind-test recall 52%, links shown 1217.
- Hybrid + report route + Nemotron Super judge (post-hoc, D30): blind-test recall 52%, links shown 1360.
- Test set: 29 coroner-acknowledged pairs (same organisation, six months or more apart).
- Precision: pending: no labels filled in yet.

Full detail: docs/EVALUATION.md.

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

## Blockers

See docs/BLOCKERS.md for each note in full.

- B1. Stage A pilot below 90% quote verification (resolved)
- B2. First orchestrator run stopped at the responses step (resolved)
- B3. Stage C pilot at 85% quote verification (resolved)

## Things only you can do

Each step is written out in docs/SUBMISSION_CHECKLIST.md.

1. Check the credit expiry date in the Token Factory console. It cannot be read from the API.
2. Create the server (deploy/README.md) and a separate Token Factory key for it.
3. Optional: label the 80 test pairs (.venv\Scripts\python -m pipeline.cli label) to fill in precision.
4. Make the repo public when you submit. Its history was already purged; run the scan in the checklist first.
5. Record the video from docs/VIDEO_SHOT_LIST.md and make it public on YouTube.
6. Submit on Devpost with docs/DEVPOST_DRAFT.md and docs/FEEDBACK.md.
7. After the hackathon, rotate the keys that were pasted into a chat.

