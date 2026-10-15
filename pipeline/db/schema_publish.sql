-- Published (display-safe) data for the web app, in PostgreSQL with pgvector.
-- Written only by `python -m pipeline.cli publish`, which applies the same display rules as the
-- JSON export: verified quotes only, redaction, wording checks, reviewed dossiers only.
-- Replaces the earlier schema_postgres.sql. Safe to run repeatedly.

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS pub_meta (
  key text PRIMARY KEY,
  value jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS pub_orgs (
  id integer PRIMARY KEY,
  name text NOT NULL,
  type text,
  national boolean NOT NULL DEFAULT false,
  n_reports integer NOT NULL DEFAULT 0,
  n_chains integer NOT NULL DEFAULT 0,
  search tsvector
);
CREATE INDEX IF NOT EXISTS pub_orgs_search ON pub_orgs USING gin (search);
CREATE INDEX IF NOT EXISTS pub_orgs_name ON pub_orgs (lower(name));

CREATE TABLE IF NOT EXISTS pub_reports (
  url text PRIMARY KEY,
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  date date,
  coroner text,
  area text,
  ref text,
  categories jsonb NOT NULL DEFAULT '[]',
  concerns jsonb NOT NULL DEFAULT '[]',        -- [{quote, hazard}] verified and redacted
  n_links integer NOT NULL DEFAULT 0,
  first_seen timestamptz NOT NULL DEFAULT now(), -- when this report first appeared on the site
  search tsvector
);
CREATE INDEX IF NOT EXISTS pub_reports_search ON pub_reports USING gin (search);
CREATE INDEX IF NOT EXISTS pub_reports_date ON pub_reports (date DESC);

CREATE TABLE IF NOT EXISTS pub_report_orgs (
  report_url text NOT NULL,
  org_id integer NOT NULL,
  PRIMARY KEY (report_url, org_id)
);
CREATE INDEX IF NOT EXISTS pub_report_orgs_org ON pub_report_orgs (org_id);

CREATE TABLE IF NOT EXISTS pub_responses (
  id serial PRIMARY KEY,
  report_url text NOT NULL,
  org_id integer NOT NULL,                     -- the organisation this listing belongs to
  pdf_url text NOT NULL,
  filename text,
  unmatched boolean NOT NULL DEFAULT false,
  promises jsonb NOT NULL DEFAULT '[]'          -- [{id, quote, summary, timescale}] verified and redacted
);
CREATE INDEX IF NOT EXISTS pub_responses_report ON pub_responses (report_url, org_id);

CREATE TABLE IF NOT EXISTS pub_chains (
  key text PRIMARY KEY,
  org_id integer NOT NULL,
  org_name text NOT NULL,
  org_type text,
  hazard text NOT NULL,
  relation text NOT NULL,
  confidence real NOT NULL,
  first_date date,
  last_date date,
  n_reports integer NOT NULL,
  n_coroners integer NOT NULL,
  theme text,
  has_dossier boolean NOT NULL DEFAULT false,
  any_no_response boolean NOT NULL DEFAULT false,
  featured integer,                             -- position in the featured list, or null
  detail jsonb NOT NULL,                        -- {reports, links, followups, dossier, coroners, areas}
  search tsvector
);
CREATE INDEX IF NOT EXISTS pub_chains_search ON pub_chains USING gin (search);
CREATE INDEX IF NOT EXISTS pub_chains_org ON pub_chains (org_id);
CREATE INDEX IF NOT EXISTS pub_chains_last ON pub_chains (last_date DESC);

CREATE TABLE IF NOT EXISTS pub_chain_reports (
  chain_key text NOT NULL,
  report_url text NOT NULL,
  PRIMARY KEY (chain_key, report_url)
);
CREATE INDEX IF NOT EXISTS pub_chain_reports_report ON pub_chain_reports (report_url);

CREATE TABLE IF NOT EXISTS pub_links (
  id serial PRIMARY KEY,
  chain_key text NOT NULL,
  earlier_url text NOT NULL,
  later_url text NOT NULL,
  later_date date,
  relation text NOT NULL,
  confidence real NOT NULL,
  payload jsonb NOT NULL                        -- quotes, explanation, scores, flags
);
CREATE INDEX IF NOT EXISTS pub_links_later ON pub_links (later_date DESC);
CREATE INDEX IF NOT EXISTS pub_links_earlier_url ON pub_links (earlier_url);
CREATE INDEX IF NOT EXISTS pub_links_later_url ON pub_links (later_url);

CREATE TABLE IF NOT EXISTS pub_systemic (
  id serial PRIMARY KEY,
  payload jsonb NOT NULL
);

-- Live brief retrieval: one row per verified concern per receiving organisation.
CREATE TABLE IF NOT EXISTS pub_brief_concerns (
  id bigint NOT NULL,
  org_id integer NOT NULL,
  report_url text NOT NULL,
  date date,
  quote text NOT NULL,
  hazard text,
  embedding vector(256) NOT NULL,
  PRIMARY KEY (id, org_id)
);
CREATE INDEX IF NOT EXISTS pub_brief_concerns_org ON pub_brief_concerns (org_id);
CREATE INDEX IF NOT EXISTS pub_brief_concerns_report ON pub_brief_concerns (report_url);

CREATE TABLE IF NOT EXISTS pub_org_aliases (
  alias_key text PRIMARY KEY,
  org_id integer NOT NULL
);

CREATE TABLE IF NOT EXISTS chain_redirects (
  old_key text PRIMARY KEY,
  new_key text NOT NULL
);

-- Live brief state: response cache, ledger, spend and daily limits.
CREATE TABLE IF NOT EXISTS brief_kv (
  key text PRIMARY KEY,
  value jsonb,
  updated_at timestamptz DEFAULT now()
);

CREATE OR REPLACE FUNCTION brief_kv_add(k text, delta double precision)
RETURNS double precision LANGUAGE plpgsql AS $$
DECLARE v double precision;
BEGIN
  INSERT INTO brief_kv(key, value, updated_at) VALUES (k, to_jsonb(delta), now())
  ON CONFLICT (key) DO UPDATE
    SET value = to_jsonb(coalesce((brief_kv.value)::text::double precision, 0) + delta), updated_at = now()
  RETURNING (value)::text::double precision INTO v;
  RETURN v;
END $$;
