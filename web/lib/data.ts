import "server-only";
import fs from "node:fs";
import path from "node:path";
import type { ChainDetail, ChainSummary, OrgDetail, OrgRef, Site } from "./types";

const DATA = path.join(process.cwd(), "data");

function read<T>(rel: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(path.join(DATA, rel), "utf-8")) as T;
  } catch {
    return fallback;
  }
}

export const EMPTY_SITE: Site = {
  generated_at: "",
  n_reports: 0,
  n_reports_with_response: 0,
  n_organisations: 0,
  n_concerns: 0,
  n_candidate_pairs: 0,
  n_judged: 0,
  n_chains: 0,
  n_links: 0,
  share_diff_coroner: 0,
  share_diff_area: 0,
  share_no_response: 0,
  share_not_cited: 0,
  spend: { total: 0, by_stage: {} },
  models: {},
  min_confidence: 0.7,
  flagship: null,
  themes: {},
};

export const getSite = () => read<Site>("site.json", EMPTY_SITE);
export const getChains = () => read<ChainSummary[]>("chains.json", []);
export const getChain = (key: string) =>
  /^[a-f0-9]{16}$/.test(key) ? read<ChainDetail | null>(`chains/${key}.json`, null) : null;
export const getOrgs = () => read<(OrgRef & { n_reports: number; n_chains: number })[]>("orgs.json", []);
export const getOrg = (id: string) => (/^\d+$/.test(id) ? read<OrgDetail | null>(`orgs/${id}.json`, null) : null);
export const getEvaluation = () => read<Record<string, unknown> | null>("evaluation.json", null);
export const getBriefExamples = () => read<unknown[]>("brief_examples.json", []);
