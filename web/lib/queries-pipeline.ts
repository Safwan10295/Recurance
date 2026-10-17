import "server-only";
import { DbUnavailable, cached, q } from "./db";
import type { Relation, Site } from "./types";

// Data for /nemotron. Shape matches pipeline/publish/postgres.py pipeline_summary().

export interface PipelineFunnel {
  reports: number;
  reports_with_concerns: number;
  concerns: number;
  concerns_verified: number;
  responses: number;
  promises: number;
  pairs: number;
  judged: number;
  relations: Partial<Record<Relation, number>>;
  links: number | null;
  chains: number | null;
  followups: number;
  dossiers: number;
}

export interface LedgerRow {
  stage: string;
  model: string;
  calls: number; // paid, successful calls
  cached: number; // free cache hits
  input_tokens: number;
  output_tokens: number;
  reasoning_tokens: number;
  cost: number;
  avg_latency_ms: number;
}

export interface Pipeline {
  funnel: PipelineFunnel;
  ledger: LedgerRow[] | null;
  tavily_credits: number | null;
}

export interface EvaluationLite {
  systems?: { name: string; recall_at_threshold: number | null }[];
  cost?: { total: number; per_chain: number | null; chains: number };
  miss_summary?: Record<string, number>;
}

export interface PipelinePage {
  pipeline: Pipeline | null;
  site: Site | null;
  evaluation: EvaluationLite | null;
}

export const getPipelinePage = (): Promise<PipelinePage> =>
  cached("pipeline-page", async () => {
    try {
      const rows = await q<{ key: string; value: unknown }>(
        "SELECT key, value FROM pub_meta WHERE key IN ('pipeline', 'site', 'evaluation')",
      );
      const m = Object.fromEntries(rows.map((r) => [r.key, r.value])) as Record<string, unknown>;
      return {
        pipeline: (m.pipeline as Pipeline | undefined) ?? null,
        site: (m.site as Site | undefined) ?? null,
        evaluation: (m.evaluation as EvaluationLite | undefined) ?? null,
      };
    } catch (e) {
      if (e instanceof DbUnavailable) return { pipeline: null, site: null, evaluation: null };
      throw e;
    }
  });

// ---------- aggregation helpers ----------

export type ModelFamily = "nano" | "super" | "ultra" | "embed" | "other";

export function modelFamily(model: string): ModelFamily {
  const m = model.toLowerCase();
  if (m.includes("embedding")) return "embed";
  if (m.includes("nano")) return "nano";
  if (m.includes("super")) return "super";
  if (m.includes("ultra")) return "ultra";
  return "other";
}

export interface Totals {
  calls: number;
  cached: number;
  input_tokens: number;
  output_tokens: number;
  reasoning_tokens: number;
  cost: number;
  avg_latency_ms: number | null; // weighted by paid calls
  stages: string[];
  models: string[];
}

export function sumRows(rows: LedgerRow[]): Totals {
  let lat = 0;
  let latN = 0;
  const t: Totals = {
    calls: 0,
    cached: 0,
    input_tokens: 0,
    output_tokens: 0,
    reasoning_tokens: 0,
    cost: 0,
    avg_latency_ms: null,
    stages: [],
    models: [],
  };
  for (const r of rows) {
    t.calls += r.calls ?? 0;
    t.cached += r.cached ?? 0;
    t.input_tokens += r.input_tokens ?? 0;
    t.output_tokens += r.output_tokens ?? 0;
    t.reasoning_tokens += r.reasoning_tokens ?? 0;
    t.cost += r.cost ?? 0;
    if (r.avg_latency_ms && r.calls) {
      lat += r.avg_latency_ms * r.calls;
      latN += r.calls;
    }
    if (!t.stages.includes(r.stage)) t.stages.push(r.stage);
    if (!t.models.includes(r.model)) t.models.push(r.model);
  }
  t.avg_latency_ms = latN ? lat / latN : null;
  return t;
}

export function byFamily(ledger: LedgerRow[]): Record<ModelFamily, Totals> {
  const groups: Record<ModelFamily, LedgerRow[]> = { nano: [], super: [], ultra: [], embed: [], other: [] };
  for (const r of ledger) groups[modelFamily(r.model)].push(r);
  return {
    nano: sumRows(groups.nano),
    super: sumRows(groups.super),
    ultra: sumRows(groups.ultra),
    embed: sumRows(groups.embed),
    other: sumRows(groups.other),
  };
}

export function byStage(ledger: LedgerRow[]): { stage: string; totals: Totals }[] {
  const groups = new Map<string, LedgerRow[]>();
  for (const r of ledger) groups.set(r.stage, [...(groups.get(r.stage) ?? []), r]);
  return [...groups.entries()].map(([stage, rows]) => ({ stage, totals: sumRows(rows) }));
}
