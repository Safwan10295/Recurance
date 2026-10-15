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
7. Gives coroners, lawyers, families and safety teams a live pre-inquest brief.

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
| Live brief (runtime) | Nano to extract, Super to judge, Qwen3 embeddings to retrieve | Runs on every new report a user submits |

Features of Token Factory used:

1. json_schema structured output, enforced on all three Nemotron 3 models.
2. chat_template_kwargs to switch Nemotron reasoning off for extraction and to low effort for the judge.
3. The models endpoint with verbose pricing, used to set the budget guard from live prices.
4. Rate-limit headers, used by the wrapper to pace calls.

### Cost ledger summary (full run, 15 Oct 2026)

| Stage | Model | Paid calls | Spend |
|---|---|---|---|
| A, concerns from 6,196 reports | Nano | 6,780 | $0.77 |
| B, promises from 1,453 responses | Nano | 1,453 | $0.19 |
| C, 4,061 report pairs judged, plus evaluation and systemic clusters | Super | 4,122 | $3.02 |
| D, flagship dossiers | Ultra | 75 | $0.96 |
| F, follow-up classification | Nano | 82 | $0.01 |
| Embeddings | Qwen3-Embedding-8B | 310 | $0.01 |
| Pilots and development | mixed | 182 | $0.07 |
| Total | | 13,004 | $5.05 |

Every call is in the llm_calls ledger (13,181 rows, including 177 free cache hits). No call failed. Tavily used 250 credits for follow-up searches.

## Results

1. 6,454 unique reports ingested, 15,366 concerns extracted, 98% with quotes verified against the source.
2. 1,217 links shown, in 619 chains, each with verbatim quotes from both reports, a relation and a confidence.
3. In 84% of shown links the later report came from a different coroner, and in 99% it did not cite the earlier report.
4. On a blind test of 29 pairs that coroners themselves acknowledged, at the same number of shown links, recall was 34% for TF-IDF, 41% for embeddings and 52% for the hybrid with the Nemotron Super judge.
5. Precision of shown links needs hand labels, which are prepared but not yet done (docs/EVALUATION.md).

## Repository layout

| Path | Contents |
|---|---|
| pipeline/ | Python 3.11 pipeline: scrape, parse, normalise, link, extract, judge, dossier, followup, evaluate, export |
| pipeline/cli.py | One entry point with a subcommand per step |
| web/ | Next.js app (App Router, TypeScript, Tailwind) |
| tests/ | Offline tests. They use recorded fixtures and never call the live API |
| docs/ | Research log, decisions, evaluation, feedback, demo script, deploy steps |

## Setup

1. Install Python 3.11 and Node 20 or later.
2. Create a virtual environment and install dependencies:

```
python -m venv .venv
.venv/Scripts/pip install -r requirements.txt     # Windows
.venv/bin/pip install -r requirements.txt         # macOS and Linux
```

3. Copy .env.example to .env and fill in NEBIUS_API_KEY, TAVILY_API_KEY and SCRAPER_CONTACT_EMAIL.
4. Optional, for scanned PDFs: install Tesseract OCR.
5. Run the tests: python -m pytest

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
python -m pipeline.cli export                # writes web/data/
python -m pipeline.cli spend                 # ledger summary
```

## Running the web app

```
cd web
npm install
npm run dev
```

The pages read web/data/. The live brief needs NEBIUS_LIVE_API_KEY, a separate key from the pipeline's. Without it the brief shows precomputed examples. Deployment steps are in docs/DEPLOY.md.

## Responsible use

1. A link shows that a similar concern was raised again after a stated action. It does not say why, and it is not a finding that an organisation ignored a warning or caused a death.
2. Every quote shown is checked by code as an exact substring of the source.
3. Staff and family names are redacted. Coroners are named as public office holders. The deceased are referred to by the report title only.
4. There are no rankings or league tables.
5. Response documents are linked at judiciary.uk, not rehosted.

## Data and licence

1. Source: Courts and Tribunals Judiciary, judiciary.uk. Crown copyright, used under the Open Government Licence v3.0.
2. Code: MIT licence (LICENSE).
3. No code from PFD Toolkit (AGPL-3.0) is used. The scraper and parser are written from scratch.

## Prior art

1. PFD Monitor (pfdmonitor.org): AI-extracted concerns grouped into themes.
2. Preventable Deaths Tracker (preventabledeathstracker.net, Georgia Richards): response tracking.
3. PFD Toolkit (github.com/Sam-Osian/PFD-toolkit): open-source loader and thematic analysis.

## Limitations

1. Linking is within one organisation, so a recurrence after a rename is found only if the rename is known.
2. Some older reports and responses are scanned images read with OCR.
3. The judge model can be wrong. The evaluation page reports how often, against coroner-acknowledged pairs and hand labels.
