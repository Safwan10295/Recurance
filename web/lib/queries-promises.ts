import "server-only";
import { cached, q, q1 } from "./db";
import type { QuoteContext, Relation } from "./types";

// Links where the organisation's response to the earlier report stated an action,
// and a later report then raised the same or a closely related concern.

export interface PromiseReport {
  url: string;
  slug: string | null;
  title: string;
  date: string | null;
  coroner: string | null;
  area: string | null;
}

export interface PromiseLink {
  id: number;
  chain_key: string;
  hazard: string;
  org: { id: number; name: string; type: string };
  relation: Relation;
  confidence: number;
  days_apart: number | null;
  same_coroner: boolean;
  explanation: string | null;
  earlier: PromiseReport;
  later: PromiseReport;
  earlier_quote: string;
  later_quote: string;
  earlier_context: QuoteContext | null;
  later_context: QuoteContext | null;
  promise_quote: string;
  promise_timescale: string | null;
  promise_pdf: string | null;
}

export interface PromiseFilter {
  q?: string;
  orgType?: string;
  theme?: string;
  page?: number;
  size?: number;
}

// after_promise is JSON true in the current export; older exports wrote 1.
const BASE_WHERE = `l.payload->>'after_promise' IN ('true', '1') AND l.payload->>'promise_quote' IS NOT NULL`;

const BASE_FROM = `FROM pub_links l JOIN pub_chains c ON c.key = l.chain_key`;

function buildWhere(f: PromiseFilter): { w: string; p: unknown[] } {
  const where = [BASE_WHERE];
  const p: unknown[] = [];
  if (f.orgType) {
    p.push(f.orgType);
    where.push(`c.org_type = $${p.length}`);
  }
  if (f.theme) {
    p.push(f.theme);
    where.push(`c.theme = $${p.length}`);
  }
  if (f.q) {
    p.push(`%${f.q.replace(/[\\%_]/g, (m) => "\\" + m)}%`);
    const n = `$${p.length}`;
    where.push(
      `(c.hazard ILIKE ${n} OR c.org_name ILIKE ${n} OR l.payload->>'promise_quote' ILIKE ${n}
        OR l.payload->>'earlier_quote' ILIKE ${n} OR l.payload->>'later_quote' ILIKE ${n})`,
    );
  }
  return { w: `WHERE ${where.join(" AND ")}`, p };
}

interface Row {
  id: number;
  chain_key: string;
  hazard: string;
  org_id: number;
  org_name: string;
  org_type: string;
  relation: Relation;
  confidence: number;
  payload: {
    days_apart?: number | null;
    same_coroner?: boolean;
    explanation?: string | null;
    earlier_quote: string;
    later_quote: string;
    earlier_context?: QuoteContext | null;
    later_context?: QuoteContext | null;
    promise_quote: string;
    promise_timescale?: string | null;
    promise_pdf?: string | null;
  };
  earlier_url: string;
  later_url: string;
  e_slug: string | null;
  e_title: string | null;
  e_date: string | null;
  e_coroner: string | null;
  e_area: string | null;
  r_slug: string | null;
  r_title: string | null;
  r_date: string | null;
  r_coroner: string | null;
  r_area: string | null;
  fb_pdf: string | null;
  fb_timescale: string | null;
  gap_days: number | null;
}

export async function listPromiseLinks(f: PromiseFilter) {
  const size = f.size ?? 12;
  const page = Math.max(1, f.page ?? 1);
  const { w, p } = buildWhere(f);
  return cached(`promises:${JSON.stringify({ ...f, page, size })}`, async () => {
    const [rows, total] = await Promise.all([
      q<Row>(
        `SELECT l.id, l.chain_key, c.hazard, c.org_id, c.org_name, c.org_type, l.relation, l.confidence,
                l.payload - 'scores' AS payload, l.earlier_url, l.later_url,
                e.slug e_slug, e.title e_title, e.date e_date, e.coroner e_coroner, e.area e_area,
                r.slug r_slug, r.title r_title, COALESCE(r.date, l.later_date) r_date, r.coroner r_coroner, r.area r_area,
                pr.pdf_url fb_pdf, pr.timescale fb_timescale,
                (COALESCE(r.date, l.later_date) - e.date) AS gap_days
         ${BASE_FROM}
         LEFT JOIN pub_reports e ON e.url = l.earlier_url
         LEFT JOIN pub_reports r ON r.url = l.later_url
         LEFT JOIN LATERAL (
           -- Fallback for exports without promise_pdf / promise_timescale: the response that holds this quote.
           SELECT s.pdf_url, pe->>'timescale' AS timescale
           FROM pub_responses s CROSS JOIN LATERAL jsonb_array_elements(COALESCE(s.promises, '[]'::jsonb)) pe
           WHERE s.report_url = l.earlier_url AND pe->>'quote' = l.payload->>'promise_quote'
           ORDER BY (s.org_id = c.org_id) DESC
           LIMIT 1
         ) pr ON true
         ${w}
         ORDER BY l.later_date DESC NULLS LAST, l.id DESC
         LIMIT ${size} OFFSET ${(page - 1) * size}`,
        p,
      ),
      q1<{ n: number }>(`SELECT COUNT(*)::int n ${BASE_FROM} ${w}`, p),
    ]);
    const out: PromiseLink[] = rows.map((r) => ({
      id: r.id,
      chain_key: r.chain_key,
      hazard: r.hazard,
      org: { id: r.org_id, name: r.org_name, type: r.org_type },
      relation: r.relation,
      confidence: r.confidence,
      days_apart: r.payload.days_apart ?? r.gap_days ?? null,
      same_coroner: !!r.payload.same_coroner,
      explanation: r.payload.explanation ?? null,
      earlier: { url: r.earlier_url, slug: r.e_slug, title: r.e_title ?? "Earlier report", date: r.e_date, coroner: r.e_coroner, area: r.e_area },
      later: { url: r.later_url, slug: r.r_slug, title: r.r_title ?? "Later report", date: r.r_date, coroner: r.r_coroner, area: r.r_area },
      earlier_quote: r.payload.earlier_quote,
      later_quote: r.payload.later_quote,
      earlier_context: r.payload.earlier_context ?? null,
      later_context: r.payload.later_context ?? null,
      promise_quote: r.payload.promise_quote,
      promise_timescale: r.payload.promise_timescale ?? r.fb_timescale ?? null,
      promise_pdf: r.payload.promise_pdf ?? r.fb_pdf ?? null,
    }));
    return { rows: out, total: total?.n ?? 0, page, size };
  });
}

// Header figures, over the whole set (not the current filters).
export const promiseSummary = () =>
  cached("promises:summary", async () => {
    const r = await q1<{ n_links: number; n_orgs: number; median_days: number | null }>(
      `SELECT COUNT(*)::int n_links, COUNT(DISTINCT c.org_id)::int n_orgs,
              percentile_cont(0.5) WITHIN GROUP (ORDER BY (l.payload->>'days_apart')::float8) AS median_days
       ${BASE_FROM} WHERE ${BASE_WHERE}`,
    );
    const median_days = r?.median_days ?? null;
    return {
      n_links: r?.n_links ?? 0,
      n_orgs: r?.n_orgs ?? 0,
      median_days,
      median_months: median_days === null ? null : median_days / 30.44,
    };
  });

// Filter options. Listed alphabetically, never by count.
export const promiseFacets = () =>
  cached("promises:facets", async () => {
    const [themes, types] = await Promise.all([
      q<{ theme: string; n: number }>(
        `SELECT c.theme, COUNT(*)::int n ${BASE_FROM} WHERE ${BASE_WHERE} AND c.theme IS NOT NULL GROUP BY c.theme ORDER BY c.theme`,
      ),
      q<{ org_type: string; n: number }>(
        `SELECT c.org_type, COUNT(*)::int n ${BASE_FROM} WHERE ${BASE_WHERE} AND c.org_type IS NOT NULL GROUP BY c.org_type ORDER BY c.org_type`,
      ),
    ]);
    return { themes, types };
  });
