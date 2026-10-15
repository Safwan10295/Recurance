-- Corpus schema (SQLite), the pipeline's working database. Mirrors handoff section 7.5. The site reads schema_publish.sql in PostgreSQL.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS reports (
    url TEXT PRIMARY KEY,
    slug TEXT NOT NULL,
    ref TEXT,
    report_date TEXT,
    published_at TEXT,
    title TEXT,
    deceased_title TEXT,          -- published report title only; used for display
    coroner TEXT,
    area TEXT,
    categories TEXT,              -- JSON list
    receivers_raw TEXT,
    body_source TEXT,             -- html | pdf | none
    body_text TEXT,
    circumstances TEXT,
    concerns TEXT,
    summary TEXT,
    report_pdf_url TEXT,
    raw_html_path TEXT,
    scraped_at TEXT,
    duplicate_of TEXT,            -- URL of the earliest copy when this is a republished duplicate
    prior_reference INTEGER DEFAULT 0  -- coroner says the issue was raised before
);
CREATE INDEX IF NOT EXISTS reports_date ON reports(report_date);

CREATE TABLE IF NOT EXISTS report_pdfs (
    url TEXT NOT NULL,
    report_url TEXT NOT NULL REFERENCES reports(url),
    filename TEXT,
    kind TEXT NOT NULL,           -- report | response | generic
    PRIMARY KEY (url, report_url)
);

CREATE TABLE IF NOT EXISTS organisations (
    id INTEGER PRIMARY KEY,
    canonical_name TEXT NOT NULL UNIQUE,
    type TEXT,                    -- nhs_trust | police | council | national_body | company | prison | ambulance | other
    is_national INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS org_aliases (
    alias_text TEXT PRIMARY KEY,
    organisation_id INTEGER NOT NULL REFERENCES organisations(id),
    source TEXT NOT NULL,         -- exact | fuzzy | manual
    score REAL
);

CREATE TABLE IF NOT EXISTS report_receivers (
    report_url TEXT NOT NULL REFERENCES reports(url),
    organisation_id INTEGER NOT NULL REFERENCES organisations(id),
    raw_text TEXT,
    PRIMARY KEY (report_url, organisation_id)
);

CREATE TABLE IF NOT EXISTS responses (
    id INTEGER PRIMARY KEY,
    report_url TEXT NOT NULL REFERENCES reports(url),
    organisation_id INTEGER REFERENCES organisations(id),
    pdf_url TEXT NOT NULL,
    filename TEXT,
    text TEXT,
    n_chars INTEGER,
    ocr_used INTEGER DEFAULT 0,
    extracted_at TEXT,
    stage_b_done INTEGER NOT NULL DEFAULT 0,
    UNIQUE (report_url, pdf_url)
);

CREATE TABLE IF NOT EXISTS concerns (
    id INTEGER PRIMARY KEY,
    report_url TEXT NOT NULL REFERENCES reports(url),
    idx INTEGER NOT NULL,
    text_quote TEXT NOT NULL,
    hazard TEXT,
    mechanism TEXT,
    setting TEXT,
    addressed_to TEXT,            -- JSON list as written
    quote_verified INTEGER NOT NULL DEFAULT 0,
    embedding BLOB,               -- float32, see pipeline/link/embed.py
    UNIQUE (report_url, idx)
);

CREATE TABLE IF NOT EXISTS promises (
    id INTEGER PRIMARY KEY,
    response_id INTEGER NOT NULL REFERENCES responses(id),
    concern_id INTEGER REFERENCES concerns(id),
    action_quote TEXT NOT NULL,
    action_summary TEXT,
    stated_date_or_deadline TEXT,
    owner TEXT,
    quote_verified INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS candidate_pairs (
    id INTEGER PRIMARY KEY,
    earlier_concern_id INTEGER NOT NULL REFERENCES concerns(id),
    later_concern_id INTEGER NOT NULL REFERENCES concerns(id),
    organisation_id INTEGER REFERENCES organisations(id),
    tfidf_score REAL,
    embed_score REAL,
    hybrid_score REAL,
    days_apart INTEGER,
    same_coroner INTEGER,
    same_area INTEGER,
    later_cites_earlier INTEGER DEFAULT 0,
    source TEXT,                  -- org | national | systemic | gold
    UNIQUE (earlier_concern_id, later_concern_id)
);

CREATE TABLE IF NOT EXISTS recurrence_verdicts (
    pair_id INTEGER PRIMARY KEY REFERENCES candidate_pairs(id),
    relation TEXT,                -- identical | closely_related | related | different
    confidence REAL,
    same_hazard_explanation TEXT,
    earlier_quote TEXT,
    later_quote TEXT,
    promise_quote TEXT,
    promise_id INTEGER,
    after_promise INTEGER,
    quotes_verified INTEGER NOT NULL DEFAULT 0,
    reasoning_summary TEXT,
    model TEXT,
    cost REAL,
    created_at TEXT
);

CREATE TABLE IF NOT EXISTS chains (
    id INTEGER PRIMARY KEY,
    chain_key TEXT NOT NULL UNIQUE,   -- stable: hash of organisation and member report URLs
    organisation_id INTEGER REFERENCES organisations(id),
    hazard_label TEXT,
    kind TEXT,                    -- organisation | systemic
    first_date TEXT,
    last_date TEXT,
    n_reports INTEGER,
    min_confidence REAL,
    relation TEXT
);

CREATE TABLE IF NOT EXISTS chain_members (
    chain_id INTEGER NOT NULL REFERENCES chains(id),
    pair_id INTEGER NOT NULL REFERENCES candidate_pairs(id),
    PRIMARY KEY (chain_id, pair_id)
);

CREATE TABLE IF NOT EXISTS dossiers (
    chain_key TEXT PRIMARY KEY,
    ultra_output TEXT,
    cost REAL,
    reviewed_by_human INTEGER NOT NULL DEFAULT 0,  -- only a human may set this
    created_at TEXT
);

CREATE TABLE IF NOT EXISTS followups (
    id INTEGER PRIMARY KEY,
    promise_id INTEGER NOT NULL REFERENCES promises(id),
    query TEXT,
    findings TEXT,
    sources TEXT,                 -- JSON list of {url, title, quote}
    classification TEXT,          -- evidence_found | not_found | contradicting
    created_at TEXT
);

CREATE TABLE IF NOT EXISTS people_mentions (
    report_url TEXT NOT NULL REFERENCES reports(url),
    name TEXT NOT NULL,
    role TEXT NOT NULL,           -- deceased | family | staff | coroner | other
    PRIMARY KEY (report_url, name, role)
);

-- Which items each LLM stage has attempted, so failures are never blindly retried.
CREATE TABLE IF NOT EXISTS stage_items (
    stage TEXT NOT NULL,
    item_id TEXT NOT NULL,
    status TEXT NOT NULL,         -- ok | failed
    detail TEXT,
    prompt_version TEXT,
    PRIMARY KEY (stage, item_id)
);

-- Old chain keys and the chain that now contains them, so shared links keep working.
CREATE TABLE IF NOT EXISTS chain_redirects (
    old_key TEXT PRIMARY KEY,
    new_key TEXT NOT NULL
);
