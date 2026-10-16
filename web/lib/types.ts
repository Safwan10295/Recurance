// Data contract with pipeline/export/web.py. All text is already redacted and wording-checked.

export type Relation = "identical" | "closely_related" | "related" | "different";

export interface OrgRef {
  id: number;
  name: string;
  type: string;
  national: boolean;
}

export interface ChainSummary {
  key: string;
  org: OrgRef;
  hazard: string;
  relation: Relation;
  confidence: number;
  first_date: string;
  last_date: string;
  n_reports: number;
  coroners: string[];
  areas: string[];
  different_coroner: boolean;
  theme: string;
  has_dossier: boolean;
  any_no_response: boolean;
}

export interface Promise_ {
  id: number;
  quote: string;
  summary: string | null;
  timescale: string | null;
}

export interface ResponseDoc {
  pdf_url: string;
  filename: string;
  promises: Promise_[];
  unmatched?: boolean;
}

export interface ReportCard {
  url: string;
  title: string;
  date: string;
  coroner: string | null;
  area: string | null;
  ref: string | null;
  categories: string[];
  responses: ResponseDoc[];
  concerns?: { quote: string; hazard: string }[];
}

export interface QuoteContext {
  before: string;
  after: string;
  cut_start: boolean;
  cut_end: boolean;
  section: string;
}

export interface Link {
  earlier: string;
  later: string;
  relation: Relation;
  confidence: number;
  explanation: string;
  earlier_quote: string;
  later_quote: string;
  earlier_context?: QuoteContext | null;
  later_context?: QuoteContext | null;
  promise_quote: string | null;
  after_promise: number | null;
  promise_timescale?: string | null;
  promise_pdf?: string | null;
  e_cid?: number;
  l_cid?: number;
  scores: { tfidf: number; embedding: number; hybrid: number };
  days_apart: number;
  same_coroner: boolean;
  same_area: boolean;
  later_cites_earlier: boolean;
  earlier_has_response: boolean;
  model: string;
}

export interface Followup {
  promise_id: number;
  classification: "evidence_found" | "not_found" | "contradicting";
  summary: string | null;
  sources: { url: string; title: string; quote: string }[];
}

export interface Dossier {
  timeline: { date: string; event: string; summary: string; quote: string | null; source_url: string | null }[];
  narrative: string;
  questions: string[];
}

export interface ChainDetail extends ChainSummary {
  reports: ReportCard[];
  links: Link[];
  followups: Followup[];
  dossier: Dossier | null;
}

export interface OrgDetail extends OrgRef {
  n_reports: number;
  n_chains: number;
  reports: ReportCard[];
  chains: string[];
}

export interface Site {
  generated_at: string;
  n_reports: number;
  n_reports_with_response: number;
  n_organisations: number;
  n_concerns: number;
  n_candidate_pairs: number;
  n_judged: number;
  n_chains: number;
  n_links: number;
  share_diff_coroner: number;
  share_diff_area: number;
  share_no_response: number;
  share_not_cited: number;
  spend: { total: number; by_stage: Record<string, number> };
  models: Record<string, string>;
  min_confidence: number;
  flagship: string | null;
  themes: Record<string, number>;
}

export interface RecentEarlier {
  url: string;
  title: string;
  date: string;
  coroner: string | null;
  area: string | null;
  relation: Relation;
  confidence: number;
  chain: string;
  hazard: string;
  earlier_quote: string;
  later_quote: string;
  promise_quote: string | null;
  days_apart: number;
  same_coroner: boolean;
  earlier_has_response: boolean;
}

export interface RecentItem {
  later: { url: string; title: string; date: string; coroner: string | null; area: string | null };
  org: OrgRef;
  earlier: RecentEarlier[];
}

export interface Recent {
  generated_at: string;
  since: string;
  days: number;
  items: RecentItem[];
}
