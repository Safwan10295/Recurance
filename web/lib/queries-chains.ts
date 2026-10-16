import "server-only";
import { cached, q, q1 } from "./db";
import type { ChainSummary, Relation } from "./types";

// Same shape as ChainFilter in queries.ts, kept here so this module does not depend on that file.
export interface ChainFilter {
  q?: string;
  orgType?: string;
  theme?: string;
  relation?: string;
  minConf?: number;
  minReports?: number;
  sort?: "recent" | "oldest";
  page?: number;
  size?: number;
}

// Chain queries for the /chains page that also return the date of every report in the chain,
// so each row can draw a small dot timeline. Filters and ordering mirror listChains in queries.ts:
// by date only (most recent last report first, or earliest first warning first), never by counts.

export type ChainWithDates = ChainSummary & { dates: string[] };

interface Row {
  key: string;
  org_id: number;
  org_name: string;
  org_type: string;
  hazard: string;
  relation: Relation;
  confidence: number;
  first_date: string;
  last_date: string;
  n_reports: number;
  n_coroners: number;
  theme: string;
  has_dossier: boolean;
  any_no_response: boolean;
  coroners: string[] | null;
  areas: string[] | null;
  dates: string[] | null;
}

const COLS = `key, org_id, org_name, org_type, hazard, relation, confidence, first_date, last_date, n_reports,
  n_coroners, theme, has_dossier, any_no_response, detail->'coroners' AS coroners, detail->'areas' AS areas,
  COALESCE((SELECT jsonb_agg(x->>'date' ORDER BY x->>'date') FROM jsonb_array_elements(detail->'reports') x
            WHERE x->>'date' IS NOT NULL), '[]'::jsonb) AS dates`;

function toChain(r: Row): ChainWithDates {
  return {
    key: r.key,
    org: { id: r.org_id, name: r.org_name, type: r.org_type, national: false },
    hazard: r.hazard,
    relation: r.relation,
    confidence: r.confidence,
    first_date: r.first_date,
    last_date: r.last_date,
    n_reports: r.n_reports,
    coroners: r.coroners ?? [],
    areas: r.areas ?? [],
    different_coroner: r.n_coroners > 1,
    theme: r.theme,
    has_dossier: r.has_dossier,
    any_no_response: r.any_no_response,
    dates: r.dates ?? [],
  };
}

export async function listChainsWithDates(f: ChainFilter) {
  const where: string[] = [];
  const p: unknown[] = [];
  const add = (sql: string, v: unknown) => {
    p.push(v);
    where.push(sql.replace("$?", `$${p.length}`));
  };
  if (f.q) add("search @@ websearch_to_tsquery('english', $?)", f.q);
  if (f.orgType) add("org_type = $?", f.orgType);
  if (f.theme) add("theme = $?", f.theme);
  if (f.relation) add("relation = $?", f.relation);
  if (f.minConf) add("confidence >= $?", f.minConf);
  if (f.minReports) add("n_reports >= $?", f.minReports);
  const w = where.length ? `WHERE ${where.join(" AND ")}` : "";
  // Same date ordering as listChains; key only breaks ties so pages are stable.
  const order = f.sort === "oldest" ? "first_date ASC, key" : "last_date DESC, key";
  const size = f.size ?? 20;
  const page = Math.max(1, f.page ?? 1);
  return cached(`chains-dates:${JSON.stringify(f)}`, async () => {
    const [rows, total] = await Promise.all([
      q<Row>(`SELECT ${COLS} FROM pub_chains ${w} ORDER BY ${order} LIMIT ${size} OFFSET ${(page - 1) * size}`, p),
      q1<{ n: number }>(`SELECT COUNT(*)::int AS n FROM pub_chains ${w}`, p),
    ]);
    return { rows: rows.map(toChain), total: total?.n ?? 0, page, size };
  });
}

const START_HERE_SIZE = 6;

// Six clear examples for first-time visitors. Chosen for clarity, not a ranking.
// Source: pub_meta 'start_here' (a curated list of chain keys). If that is missing or empty, fall back to the
// featured chains, then fill with high-confidence chains (one per organisation), shown most recent first.
export const getStartHere = () =>
  cached("chains-start-here", async (): Promise<ChainWithDates[]> => {
    const meta = await q1<{ value: unknown }>("SELECT value FROM pub_meta WHERE key = 'start_here'");
    const curated = Array.isArray(meta?.value) ? (meta.value as unknown[]).filter((k): k is string => typeof k === "string") : [];

    if (curated.length) {
      const rows = await q<Row & { pos: number }>(
        `SELECT ${COLS}, array_position($1::text[], key) AS pos FROM pub_chains WHERE key = ANY($1::text[]) ORDER BY pos`,
        [curated.slice(0, START_HERE_SIZE)],
      );
      if (rows.length) return rows.map(toChain);
    }

    const picked = (await q<Row>(`SELECT ${COLS} FROM pub_chains WHERE featured IS NOT NULL ORDER BY featured LIMIT ${START_HERE_SIZE}`)).map(
      toChain,
    );
    if (picked.length < START_HERE_SIZE) {
      const candidates = await q<Row>(
        `SELECT ${COLS} FROM pub_chains WHERE confidence >= 0.85 ORDER BY n_reports DESC, last_date DESC LIMIT 60`,
      );
      const orgs = new Set(picked.map((c) => c.org.id));
      const keys = new Set(picked.map((c) => c.key));
      for (const r of candidates) {
        if (picked.length >= START_HERE_SIZE) break;
        if (keys.has(r.key) || orgs.has(r.org_id)) continue;
        picked.push(toChain(r));
        keys.add(r.key);
        orgs.add(r.org_id);
      }
    }
    // Shown by date so the fallback never reads as an ordering by size.
    return picked.sort((a, b) => b.last_date.localeCompare(a.last_date));
  });
