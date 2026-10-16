# Devpost submission (draft to paste)

Track: Best Apps and Agents. Fill in the two links before submitting.

Demo: <site address>
Code: <public GitHub address>
Video: <YouTube address>

## Tagline

Coroners warn. Organisations promise. Recurrence Watch checks whether the same concern came back.

## Inspiration

In England and Wales, when a death reveals a risk to others, the coroner writes a Prevention of Future Deaths report to the organisation that can act. It must reply within 56 days with what it will do. Years later a similar death can happen in front of a different coroner, who has no practical way to know the concern was raised before. In 99% of the recurrences we found, the later report did not cite the earlier one.

## What it does

Recurrence Watch reads every report and response published since 2013 and links later concerns to earlier warnings sent to the same organisation. Each link shows the exact words from both reports, checked by code, with a relation and a confidence.

- Check a report: an agent built on NVIDIA Nemotron takes any report, new or old. Nemotron Super decides which tools to use: search the organisation's earlier warnings, judge each candidate, read what was promised, look up the chain, check the web with Tavily. It then submits a brief with verified quotes. Every tool call is shown as it happens, with tokens, time and cost.
- Recurrence chains: 666 hazards raised again and again with one organisation, told report by report.
- Promises, then the same concern: 563 cases where a response stated an action and a later coroner raised the same concern.
- Hazard map: 15,044 concerns placed by meaning, with the recurrences drawn between them and a replay year by year.
- You be the judge: decide whether two concerns are the same hazard, then compare your call with Nemotron Super's.
- Verified word for word: open any link to see both quotes highlighted inside the text of their source reports.
- Ways in for a coroner, a solicitor, a family and a safety team, each opening a real report in the agent. Every brief also prints as one page.

The data refreshes itself every week from judiciary.uk.

## How we built it

All model calls run on Nebius Token Factory, routed to the smallest model that does the job:

- Nemotron 3 Nano extracts concerns and stated actions, with structured JSON output and reasoning switched off.
- Nemotron 3 Super judges each candidate pair, with low-effort reasoning, and drives the live agent through native tool calling, with a forced final call so every run ends within five rounds.
- Nemotron 3 Ultra drafts dossiers for the strongest chains, which a person reviews before publication.
- Qwen3-Embedding-8B (on Token Factory) finds candidates by meaning, alongside TF-IDF.

A Python pipeline scrapes and parses the archive, with OCR for scanned PDFs, and normalises organisation names. Every call goes through one wrapper with a request-hash cache, a cost ledger and a hard budget stop. Results are published into PostgreSQL with pgvector, and a Next.js app reads them live. The whole stack runs from one Docker Compose file on a Nebius AI Cloud CPU virtual machine: database, web app, a weekly refresh worker and Caddy for HTTPS.

The agent's model never writes the quotes we show. Verdicts come from a judge tool whose quotes are checked in code, and if the agent fails or hits a limit, a fixed pipeline takes over. The agent loop is tested offline with a scripted model.

Tavily checks what happened after a promise. 269 stated actions in the chains were checked, starting with the demo chains and those with a dossier. Nano classified the sources, quoting them word for word: evidence found for 28, contradicting for 2, and nothing either way for 239. We never present that last group as "did not happen". The live agent can run its own Tavily checks within a daily cap.

The full archive cost $5.65 on Token Factory: 6,454 reports, 15,366 concerns, 4,543 pairs judged. A live agent run costs about half a cent.

## Evaluation

We needed ground truth that did not come from the model, so we used the coroners themselves. Where a later report names an earlier one, we removed that citation and asked each system to find the earlier report. At the same number of links shown, TF-IDF found 34%, embeddings 41%, and the hybrid with the Nemotron Super judge 52% (15 of 29). With 29 pairs the 95% ranges overlap, and the evaluation page says so. It also lists every miss: 9 of the 14 never reached the judge, which tells us the next improvement is in retrieval for large national bodies, not in the judge. We then tried a second candidate route by whole-report wording. It found many new verified links across the archive but no extra test pairs, and the evaluation page shows it as a separate post-hoc result rather than folding it into the comparison.

## Responsible use

- A link shows that a similar concern was raised again, not why. Model text is checked against blaming words, and there are no rankings of organisations.
- Every quote is an exact substring of its source.
- Staff and family names are redacted, and the deceased are referred to by the report title only.

## Challenges

- Nano sometimes looped under guided JSON decoding. Bounding arrays and strings in the schema fixed it.
- Chains first merged different hazards at large national bodies. Joining links through shared concerns fixed it.
- The deceased's names appear in coroners' own words. They are now replaced with [the deceased] after quote verification, so the check still holds.
- Our first agent wrote its own quotes inside tool-call arguments and changed their wording. Moving judging into a structured judge tool fixed it, and the agent then found four earlier warnings on a test report where the fixed pipeline found two.

## What's next

Human labels to measure precision, other jurisdictions with the same report-and-response duty, and alerts for organisations when a new report repeats an earlier warning.

## Open data

A read-only JSON API (/api/v1/chains) gives researchers the same verified, redacted chains.

## Built with

NVIDIA Nemotron 3 (Nano, Super, Ultra), Nebius Token Factory, Qwen3-Embedding-8B, Tavily, Python, PostgreSQL, pgvector, Next.js, Tailwind, Docker, Caddy.
