-- Supabase / Postgres twin of schema.sql (handoff section 7.5), with pgvector.
-- Run once in the Supabase SQL editor. The web app needs only the rw_kv section at the bottom.

create extension if not exists vector;

create table if not exists reports (
  url text primary key,
  slug text not null,
  ref text,
  report_date date,
  published_at timestamptz,
  title text,
  deceased_title text,
  coroner text,
  area text,
  categories jsonb,
  receivers_raw text,
  body_source text,
  body_text text,
  circumstances text,
  concerns text,
  summary text,
  report_pdf_url text,
  raw_html_path text,
  scraped_at timestamptz,
  duplicate_of text,
  prior_reference boolean default false
);

create table if not exists report_pdfs (
  url text not null,
  report_url text not null references reports(url),
  filename text,
  kind text not null,
  primary key (url, report_url)
);

create table if not exists organisations (
  id bigint primary key,
  canonical_name text not null unique,
  type text,
  is_national boolean not null default false
);

create table if not exists org_aliases (
  alias_text text primary key,
  organisation_id bigint not null references organisations(id),
  source text not null,
  score real
);

create table if not exists report_receivers (
  report_url text not null references reports(url),
  organisation_id bigint not null references organisations(id),
  raw_text text,
  primary key (report_url, organisation_id)
);

create table if not exists responses (
  id bigint primary key,
  report_url text not null references reports(url),
  organisation_id bigint references organisations(id),
  pdf_url text not null,
  filename text,
  text text,
  n_chars integer,
  ocr_used boolean default false,
  extracted_at timestamptz,
  stage_b_done smallint not null default 0,
  unique (report_url, pdf_url)
);

create table if not exists concerns (
  id bigint primary key,
  report_url text not null references reports(url),
  idx integer not null,
  text_quote text not null,
  hazard text,
  mechanism text,
  setting text,
  addressed_to jsonb,
  quote_verified smallint not null default 0,
  embedding vector(1024),
  unique (report_url, idx)
);

create table if not exists promises (
  id bigint primary key,
  response_id bigint not null references responses(id),
  concern_id bigint references concerns(id),
  action_quote text not null,
  action_summary text,
  stated_date_or_deadline text,
  owner text,
  quote_verified smallint not null default 0
);

create table if not exists candidate_pairs (
  id bigint primary key,
  earlier_concern_id bigint not null references concerns(id),
  later_concern_id bigint not null references concerns(id),
  organisation_id bigint references organisations(id),
  tfidf_score real,
  embed_score real,
  hybrid_score real,
  days_apart integer,
  same_coroner boolean,
  same_area boolean,
  later_cites_earlier boolean default false,
  source text,
  unique (earlier_concern_id, later_concern_id)
);

create table if not exists recurrence_verdicts (
  pair_id bigint primary key references candidate_pairs(id),
  relation text,
  confidence real,
  same_hazard_explanation text,
  earlier_quote text,
  later_quote text,
  promise_quote text,
  promise_id bigint,
  after_promise boolean,
  quotes_verified boolean not null default false,
  reasoning_summary text,
  model text,
  cost double precision,
  created_at timestamptz
);

create table if not exists chains (
  id bigint primary key,
  chain_key text not null unique,
  organisation_id bigint references organisations(id),
  hazard_label text,
  kind text,
  first_date date,
  last_date date,
  n_reports integer,
  min_confidence real,
  relation text
);

create table if not exists chain_members (
  chain_id bigint not null references chains(id),
  pair_id bigint not null references candidate_pairs(id),
  primary key (chain_id, pair_id)
);

create table if not exists dossiers (
  chain_key text primary key,
  ultra_output jsonb,
  cost double precision,
  reviewed_by_human boolean not null default false,
  created_at timestamptz
);

create table if not exists followups (
  id bigint primary key,
  promise_id bigint not null references promises(id),
  query text,
  findings text,
  sources jsonb,
  classification text,
  created_at timestamptz
);

create table if not exists people_mentions (
  report_url text not null references reports(url),
  name text not null,
  role text not null,
  primary key (report_url, name, role)
);

create table if not exists llm_calls (
  id bigserial primary key,
  ts timestamptz not null,
  stage text not null,
  model text not null,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  reasoning_tokens integer not null default 0,
  cost double precision not null default 0,
  cache_hit boolean not null,
  request_hash text not null,
  success boolean not null,
  error text,
  latency_ms integer,
  item_id text,
  key_label text not null default 'pipeline'
);

create table if not exists tavily_calls (
  id bigserial primary key,
  ts timestamptz not null,
  stage text not null,
  endpoint text not null,
  query_hash text not null,
  credits real not null default 0,
  cached boolean not null,
  success boolean not null,
  error text
);

-- ---------------------------------------------------------------------------
-- Web app: key-value store for the live brief (cache, ledger, daily limits).
-- ---------------------------------------------------------------------------
create table if not exists rw_kv (
  key text primary key,
  value jsonb,
  updated_at timestamptz default now()
);

-- Atomic add used for spend and counters.
create or replace function rw_kv_add(k text, delta double precision)
returns double precision language plpgsql as $$
declare v double precision;
begin
  insert into rw_kv(key, value, updated_at) values (k, to_jsonb(delta), now())
  on conflict (key) do update
    set value = to_jsonb(coalesce((rw_kv.value)::text::double precision, 0) + delta), updated_at = now()
  returning (value)::text::double precision into v;
  return v;
end $$;

-- Lock the table down: only the service role (used server-side) may touch it.
alter table rw_kv enable row level security;
revoke all on rw_kv from anon, authenticated;
revoke all on function rw_kv_add(text, double precision) from anon, authenticated;
