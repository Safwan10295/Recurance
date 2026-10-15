# Research log

Each entry: date, question, answer, source. Newest phase at the bottom.

## Phase 0 (2026-10-15)

### Token Factory model IDs, context and prices

- Date: 2026-10-15
- Question: Exact IDs, context lengths and prices for the Nemotron models.
- Answer:

| Role | Model ID | Context | Input per 1M | Output per 1M | RPM | TPM |
|---|---|---|---|---|---|---|
| Nano | nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B | 262,144 | $0.06 | $0.24 | 100 | 800,000 |
| Super | nvidia/nemotron-3-super-120b-a12b | 262,144 | $0.30 | $0.90 | 300 | 200,000 |
| Ultra | nvidia/Nemotron-3-Ultra-550b-a55b | 1,048,576 | $1.00 | $3.00 | 300 | 200,000 |
| Embeddings | Qwen/Qwen3-Embedding-8B | 40,960 | $0.01 | n/a | 10,000 | 600,000 |

- The conflicting context figures in the handoff resolve as Ultra 1M and Nano 256K.
- A further NVIDIA model is listed: nvidia/Nemotron-3_5-Lightning (1M context, $0.06 / $0.24). Not used; noted in case Nano struggles.
- The listing reports supported_features of tools and reasoning for all three Nemotron models, without structured_outputs. Live tests below show json_schema works anyway.
- Source: GET https://api.tokenfactory.nebius.com/v1/models?verbose=true (raw copy kept in data/cache/models_verbose.json).

### json_schema response_format per Nemotron model

- Date: 2026-10-15
- Question: Does response_format type json_schema work and is it enforced?
- Answer: Yes on Nano, Super and Ultra. Enforcement test: the prompt asked for a poem while the schema demanded an unrelated object with an integer and an enum; all three returned schema-conforming JSON. Nano pads guided JSON with whitespace and newlines, which costs output tokens, so prompts must ask for compact JSON and max_tokens must leave headroom.
- Source: live probes through pipeline/llm.py, ledger rows 4 to 6 and 12 to 14; fixtures in tests/fixtures/recorded/.

### Reasoning toggles

- Date: 2026-10-15
- Question: Do chat_template_kwargs enable_thinking and low_effort pass through?
- Answer: Yes. enable_thinking false gives no reasoning field. enable_thinking true returns message.reasoning_content. On Super, low_effort true cut reasoning on a small arithmetic prompt from 60 to 12 tokens with the same answer. max_tokens covers reasoning plus answer: Super with thinking on and max_tokens 40 hit finish_reason length with empty content. Nano does not report reasoning_tokens in usage, but they are included in completion_tokens.
- Source: live probes, ledger rows 7, 8, 15 to 18.

### NVIDIA embedding model

- Date: 2026-10-15
- Question: Is an NVIDIA embedding model served?
- Answer: No. The only embedding model is Qwen/Qwen3-Embedding-8B at $0.01 per 1M input tokens, default 4,096 dimensions. The dimensions parameter works (256 tested).
- Source: /v1/models listing and a live embeddings probe (ledger rows 10 and 11).

### Batch API

- Date: 2026-10-15
- Question: Does a Batch API exist, with what discount and turnaround?
- Answer: The OpenAI-style endpoints exist. GET /v1/batches and GET /v1/files return 200, and file upload with purpose batch works. Creating a batch returned HTTP 403 "Creating new batch job is temporarily unavailable". The batch docs page returns 404. Secondary sources describe a 50% discount and a 24-hour window. Batch is unavailable for now; retry once before the full Stage A run.
- Sources: live API probe; https://www.tdsynnex.com/na/us/nebius/open-source-ai-models/ ; https://makefun.ai/nebius-token-factory-batch-inference-cost-calculator/ ; https://nebius.com/solutions/inference ; rate limits page below ("Use Batch API for async workloads").

### Rate limits

- Date: 2026-10-15
- Question: Default rate limits on this account.
- Answer: Response headers report per-model limits: Nano 100 requests and 800,000 tokens per minute; Super and Ultra 300 requests and 200,000 tokens per minute. Limits are dynamic over rolling 15-minute windows: sustained use above 80% raises the limit 20%, up to 20 times base. Exceeding gives HTTP 429 with Retry-After. Requests above the limit may succeed with header x-ratelimit-over-limit yes.
- Sources: live x-ratelimit-* headers; https://docs.tokenfactory.nebius.com/ai-models-inference/rate-limits.md

### Credit expiry

- Date: 2026-10-15
- Question: Do the credits expire before the judging window ends on 15 Dec?
- Answer: Possibly. Builder Programme promotional credits "expire 90 days from the date of issuance" and expired credits are forfeited. Credits issued before 16 Sep 2026 would expire before 15 Dec. The issuance date is visible only in the console, so Pilot must check it. The trial credit for plain sign-ups is $1 valid for 30 days. The Builder terms also say programme credits may not be used for "production workloads, large-scale commercial deployment", which a hackathon demo is not.
- Sources: https://nebius.com/builders-terms-and-conditions (sections C.2, H.2(d)); https://docs.tokenfactory.nebius.com/other-capabilities/billing-new.md

### Per-key spend limits

- Date: 2026-10-15
- Question: Can a spend limit be set on an API key?
- Answer: Not documented. The billing page mentions only a Usage tab and a "billing threshold". No per-key cap exists in the public OpenAPI spec. The deployed app therefore enforces its own cost ceiling in code.
- Sources: https://docs.tokenfactory.nebius.com/other-capabilities/billing-new.md ; https://api.tokenfactory.nebius.com/openapi.json

### judiciary.uk robots.txt

- Date: 2026-10-15
- Question: What does robots.txt allow?
- Answer: "User-agent: *" with an empty Disallow, so everything is allowed. It points to https://www.judiciary.uk/sitemap_index.xml.
- Source: https://www.judiciary.uk/robots.txt

### judiciary.uk copyright

- Date: 2026-10-15
- Question: Reuse terms for report content.
- Answer: Material is Crown copyright, "licensed for use under the Open Government Licence unless otherwise indicated", excluding the Royal Arms and departmental logos. Attribution must "acknowledge the material as Crown copyright" and "give the title of the source document or publication". Reuse enquiries go to website.enquiries@judiciary.uk.
- Source: https://www.judiciary.uk/copyright/

### Tavily credits

- Date: 2026-10-15
- Question: Credit cost per endpoint and current balance.
- Answer: Basic search costs 1 credit and advanced 2. Extract costs 1 credit per 5 successful URLs (basic) or 2 per 5 (advanced); failures are free. Map costs 1 per 10 pages. The account is on the Researcher plan with a 1,000 credit monthly limit and 0 used. No extra Builders credit shows on the key.
- Sources: https://docs.tavily.com/documentation/api-credits.md ; GET https://api.tavily.com/usage

### Hackathon rules

- Date: 2026-10-15
- Question: Confirm the live rules.
- Answer: The Devpost rules page returned HTTP 403 to automated fetches. Secondary listings agree on: runs on Token Factory or Nebius AI Cloud with at least one NVIDIA open model; close 30 Oct 2026 10:00 PT; judging 1 to 15 Dec 2026; tracks include Best Apps and Agents; a Best Use of Tavily prize. Pilot should read the live page once.
- Sources: https://www.startupgrantsindia.com/competitions/nebius-x-nvidia-global-ai-hackathon ; https://lucaberton.com/blog/aaif-builders-brews-amsterdam-nebius-nvidia-hackathon-2026/

## Phase 1 (2026-10-15)

### Listing pages and URL discovery

- Date: 2026-10-15
- Question: Pagination and listing structure.
- Answer: The archive at /prevention-of-future-death-reports/ has 651 listing pages of 10 (page/N/). The Yoast sitemaps pfd-sitemap.xml to pfd-sitemap7.xml list 6,484 report URLs, matching the handoff's figure of about 6,480. The sitemaps are the primary source and the listing crawl is a cross-check.
- Source: https://www.judiciary.uk/sitemap_index.xml ; https://www.judiciary.uk/prevention-of-future-death-reports/

### Is the report text in the page HTML?

- Date: 2026-10-15
- Question: Is the report text on the page, or only in PDFs?
- Answer: Report pages from about 2023 onwards carry the full Regulation 28 text in an HTML table. Older pages carry only metadata (date, ref, deceased, coroner, area, category, receivers) and links to PDFs, so their text comes from the report PDF. Two template generations exist: the 2013 form (coroner, legal powers, investigation, circumstances, concerns, action, response, copies) and a newer form that puts date, recipients, response and a summary of concerns first. Pages also link a generic PFD-Publication-Policy PDF, which is excluded.
- Source: sample pages /jamil-ahmed-2/, /david-levett-prevention-of-future-deaths-report/, /pamela-hindley-prevention-of-future-deaths-report/

### OCR need rate

- Date: 2026-10-15
- Question: How many PDFs are scanned images?
- Answer: In the first 335 report PDFs processed, 166 (50%) had no usable text layer and were read with Tesseract 5.4 OCR. OCR takes 2 to 7 seconds per PDF and was run on 12 processes. Response PDFs show a similar pattern. Final rates are in docs/PROGRESS.md.
- Source: pipeline/parse/pdftext.py run logs.

### Older report formats

- Date: 2026-10-15
- Question: Do all reports follow the Regulation 28 template?
- Answer: No. Reports from before the 2013 regulations are Rule 43 letters with no section headings; their concerns are taken from the letter body. Some Regulation 28 reports omit the "CORONER'S CONCERNS" heading but keep "The MATTERS OF CONCERN are as follows"; Devon uses "DETAIL OF CONCERNS". All three are handled.
- Source: parsed PDFs in data/raw/pdf.

## Phase 5 preparation

### NTSB CAROL

- Date: 2026-10-15
- Question: Can NTSB safety recommendations be exported for the stretch adapter?
- Answer: CAROL holds over 15,000 safety recommendations. Its help page says "You may download a CSV or JSON file containing all query records" from the search interface. No public API is documented for recommendations; a 2020 press release mentions APIs for partner agencies. NTSB material is a US federal government work. An unattended build would need browser-driven exports, so the adapter is deferred unless Phases 0 to 4 finish early.
- Sources: https://www.ntsb.gov/Pages/CAROL.aspx ; https://www-s.ntsb.gov/news/press-releases/Pages/NR20201013.aspx
