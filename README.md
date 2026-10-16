# Recurrence Watch

Coroners in England and Wales write Prevention of Future Deaths (PFD) reports when a death reveals a risk to others. The organisation that receives one must reply within 56 days with what it will change. Years later, a similar death can happen in front of a different coroner who has no way of knowing the concern was raised before.

Recurrence Watch reads every published report and response, links later concerns to earlier warnings sent to the same organisation, and shows where a concern recurred after a stated action, with verbatim quotes from both documents.

PFD Monitor groups concerns. The Preventable Deaths Tracker chases deadlines. Recurrence Watch tests whether promises held.

Built for the Nebius x NVIDIA Global AI Hackathon, Best Apps and Agents track.

## What it does

1. Ingests every PFD report and its published responses from judiciary.uk with a polite scraper.
2. Splits each report's concerns into separate, comparable concerns, each with an exact quote.
3. Extracts the actions organisations promised in their responses.
4. Links later concerns to earlier ones across coroners, areas and years.
5. Judges each link with Nemotron, citing verbatim text from both reports.
6. Searches the web (Tavily) for evidence that a promised action happened.
7. Gives coroners, lawyers, families and safety teams a live pre-inquest brief, showing each step the agent takes: model, tokens, time, cost and every verdict.

On the site:

- Check a report: the live agent, step by step.
- Recurrence chains: each hazard as a story, report by report, with the gap between them to scale.
- Promises, then the same concern: where a response stated an action and a later coroner raised the same concern.
- Hazard map: every concern placed by meaning, with the recurrences drawn between them.
- How Nemotron did the work: the funnel from archive to evidence, and the tokens and cost per model.
- You be the judge: two concerns, years apart; decide if they are the same hazard, then see Nemotron Super's verdict.
- A guided tour of the real pages, and a replay of the hazard map year by year.
- Search from anywhere with Ctrl K.

## How Nemotron and Token Factory are used

Every model call goes to Nebius Token Factory through one wrapper (pipeline/llm.py, and web/lib/llm.ts for the app). The wrapper caches by request hash, writes every call to a cost ledger, and refuses any call that could cross a stage budget.

| Step | Model on Token Factory | Why this model |
|---|---|---|
| Concern extraction (Stage A) | nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B | Cheap, fast, enforced JSON schema, good at copying exact quotes |
| Promise extraction (Stage B) | nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B | Same task shape on response letters |
| Recurrence judge (Stage C) | nvidia/nemotron-3-super-120b-a12b, reasoning on, low effort | The hard semantic call: same hazard or merely the same topic |
| Flagship dossiers (Stage D) | nvidia/Nemotron-3-Ultra-550b-a55b | Long context (1M) for a whole chain in one prompt |
| Follow-up classification (Stage F) | nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B | Classifies Tavily results with quotes |
| Embeddings | Qwen/Qwen3-Embedding-8B | No NVIDIA embedding model is served; this keeps retrieval on Token Factory |
| Live agent (runtime) | Super with native tool calling chooses the tools; Nano extracts; Qwen3 embeddings retrieve | Runs on every new report a user submits, with the fixed pipeline as fallback |

Features of Token Factory used:

1. json_schema structured output, enforced on all three Nemotron 3 models.
2. chat_template_kwargs to switch Nemotron reasoning off for extraction and to low effort for the judge.
3. The models endpoint with verbose pricing, used to set the budget guard from live prices.
4. Rate-limit headers, used by the wrapper to pace calls.
5. Native tool calling on Nemotron 3 Super, with a forced tool_choice on the agent's last round.

### The live agent

Check a report runs an agent. Nemotron Super chooses among five tools until it submits its findings:

| Tool | What it does |
|---|---|
| search_earlier_concerns | Finds the earlier concerns sent to the same organisation that are closest in meaning (Qwen3 embeddings, pgvector) |
| judge_candidate | Runs the recurrence judge (Super, structured output) and checks both quotes word for word |
| get_response_promises | Reads the actions stated in the organisation's published response |
| get_chain | Looks up whether the earlier report is already part of a recurrence chain |
| tavily_check | Searches the web for evidence of what happened next, reusing an earlier check when there is one |

The limits are 5 rounds and $0.015 per run. The model never writes a shown quote: verdicts come from judge_candidate, and every quote is checked in code. If the agent fails or hits a limit, the fixed pipeline runs instead. The loop and its checks are tested offline with a scripted model (web/tests/agent.test.ts).

### Other Nebius services

The site is packaged to run on one Nebius AI Cloud CPU virtual machine with Docker Compose: PostgreSQL with pgvector, the web app, a weekly refresh worker and Caddy for HTTPS (deploy/README.md).

### Tavily

Tavily checks what happened after an organisation stated an action. For each promise in a chain, two searches and one extract gather sources. Nemotron Nano then classifies them as evidence found, not found or contradicting, quoting the source word for word. "Not found" is never shown as "did not happen". Credits are budgeted from the balance read from Tavily's usage endpoint (D28). The checks went first to the demo chains, then to the chains with a dossier, then to the chains with the most recurrences. 269 promises have been checked: evidence found for 28, contradicting for 2, not found for 239. The live agent can run its own checks, with a daily cap.

### Cost ledger summary (16 Oct 2026)

| Stage | Model | Paid calls | Spend |
|---|---|---|---|
| A, concerns from 6,196 reports | Nano | 6,780 | $0.77 |
| B, promises from responses, including one incremental refresh | Nano | 1,751 | $0.23 |
| C, 4,061 report pairs judged, plus evaluation and systemic clusters | Super | 4,122 | $3.02 |
| D, flagship dossiers | Ultra | 76 | $0.97 |
| F, follow-up classification | Nano | 266 | $0.05 |
| Embeddings | Qwen3-Embedding-8B | 310 | $0.01 |
| Pilots, development, chain titles and live tests | mixed | 868 | $0.11 |
| Total | | 14,173 | $5.16 |

Every call is in the llm_calls ledger (14,371 rows, including 197 free cache hits). One row is a local attempt made before the key was loaded; it sent nothing and cost nothing. Stage F used 801 Tavily credits by the ledger's count, every call logged in tavily_calls.

## Results

1. 6,454 unique reports ingested, 15,366 concerns extracted, 98% with quotes verified against the source.
2. 1,217 links shown, in 618 chains, each with verbatim quotes from both reports, a relation and a confidence.
3. In 84% of shown links the later report came from a different coroner, and in 99% it did not cite the earlier report.
4. On a blind test of 29 pairs that coroners themselves acknowledged, at the same number of shown links, recall was 34% for TF-IDF, 41% for embeddings and 52% for the hybrid with the Nemotron Super judge.
5. Precision of shown links needs hand labels, which are prepared but not yet done (docs/EVALUATION.md).

## Repository layout

| Path | Contents |
|---|---|
| pipeline/ | Python 3.11 pipeline: scrape, parse, normalise, link, extract, judge, dossier, followup, evaluate, export, publish |
| pipeline/cli.py | One entry point with a subcommand per step |
| web/ | Next.js app (App Router, TypeScript, Tailwind) that reads PostgreSQL |
| deploy/ | Docker Compose for one server: PostgreSQL with pgvector, the web app, a refresh worker and Caddy |
| tests/ | Offline tests. They use recorded fixtures and never call the live API |
| docs/ | Research log, decisions, evaluation, feedback, demo script |

## Setup

1. Install Python 3.11 and Node 20 or later.
2. Create a virtual environment and install dependencies:

```
python -m venv .venv
.venv/Scripts/pip install -r requirements.txt     # Windows
.venv/bin/pip install -r requirements.txt         # macOS and Linux
```

3. Copy .env.example to .env and fill in NEBIUS_API_KEY, TAVILY_API_KEY and SCRAPER_CONTACT_EMAIL.
4. Install PostgreSQL 16 with pgvector, create a database, and set DATABASE_URL in .env. On Windows, PostgreSQL in WSL Ubuntu works.
5. Optional, for scanned PDFs: install Tesseract OCR.
6. Run the tests: python -m pytest. The publish test uses a throwaway schema in the local PostgreSQL and is skipped if none is running.

## Running the pipeline

Each step is a subcommand of python -m pipeline.cli. Steps that spend money print an estimate first, and full runs need --confirm-spend.

```
python -m pipeline.cli scrape all            # sitemaps, report pages, report PDFs, listing cross-check (1 request/second)
python -m pipeline.cli build                 # parse into data/recurrence.sqlite
python -m pipeline.cli normalise             # organisations and aliases
python -m pipeline.cli stage-a --pilot       # 20-report pilot, prints measured and extrapolated cost
python -m pipeline.cli stage-a --confirm-spend --cost-per-item <measured>
python -m pipeline.cli embed
python -m pipeline.cli link
python -m pipeline.cli responses --fetch     # only responses in Stage B scope
python -m pipeline.cli stage-b --pilot
python -m pipeline.cli stage-b --confirm-spend --cost-per-item <measured>
python -m pipeline.cli stage-c --pilot
python -m pipeline.cli stage-c --confirm-spend --cost-per-item <measured>
python -m pipeline.cli chains
python -m pipeline.cli dossiers              # at most 25, stored unreviewed
python -m pipeline.cli followup              # Tavily, capped at 250 credits
python -m pipeline.cli evaluate
python -m pipeline.cli titles                # short chain titles (Nano)
python -m pipeline.cli publish               # display-safe rows into PostgreSQL; the site reads these
python -m pipeline.cli spend                 # ledger summary
```

To pick up new reports later, python scripts/refresh.py runs every step on new reports only, with a spending ceiling (--max-spend, default $0.50), then publishes.

## Running the web app

```
cd web
npm install
npm run build
npm start
```

web/.env.local sets DATABASE_URL to a read-only role on the published tables. Pages read PostgreSQL directly, so a publish shows up within two minutes with no rebuild. On Windows, start_site.cmd starts PostgreSQL in WSL and then the site.

The live brief needs NEBIUS_LIVE_API_KEY, a separate key from the pipeline's. Without it the brief shows precomputed examples.

## Running on a server

deploy/README.md has the steps for one Linux server with Docker Compose. A worker refreshes the data weekly and republishes.

## Responsible use

1. A link shows that a similar concern was raised again after a stated action. It does not say why, and it is not a finding that an organisation ignored a warning or caused a death.
2. Every quote shown is checked by code as an exact substring of the source.
3. Staff and family names are redacted. Coroners are named as public office holders. The deceased are referred to by the report title only; in quotes their names become [the deceased].
4. There are no rankings or league tables.
5. Response documents are linked at judiciary.uk, not rehosted.

## Data and licence

1. Source: Courts and Tribunals Judiciary, judiciary.uk. Crown copyright, used under the Open Government Licence v3.0.
2. Code: MIT licence (LICENSE).
3. No code from PFD Toolkit (AGPL-3.0) is used. The scraper and parser are written from scratch.

## Prior art

Recurrence Watch builds on earlier work with the same reports, and differs in what it asks of them.

| Project | What it does | How Recurrence Watch differs |
|---|---|---|
| PFD Monitor (pfdmonitor.org) | AI-extracted concerns grouped into themes, with stated actions | Links each later concern to the earlier warning to the same organisation, with quotes from both |
| Preventable Deaths Tracker (preventabledeathstracker.net, Georgia Richards) | Tracks responses and overdue replies | Asks whether the concern came back after a response stated an action |
| PFD Toolkit (github.com/Sam-Osian/PFD-toolkit) | Open-source loader and thematic analysis | Written from scratch; no PFD Toolkit code is used |

## Limitations

1. Linking is within one organisation, so a recurrence after a rename is found only if the rename is known.
2. Some older reports and responses are scanned images read with OCR.
3. The judge model can be wrong. The evaluation page reports how often, with 95% intervals and every miss explained. On the 29 coroner-acknowledged pairs, 9 of the 14 misses never reached the judge, because no concern pair passed the candidate filter.
4. The test set is small, so the gap between the three systems is consistent but not yet statistically settled.
5. Follow-up evidence depends on what is published online. Most checks find nothing either way, which says nothing about whether an action was taken.
