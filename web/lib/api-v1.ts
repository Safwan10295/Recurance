import "server-only";
import { cached, q, q1 } from "./db";

// The public read-only API: published, display-safe data only (verified quotes, redacted, wording-checked).
// No rankings: results are ordered by date. Rate-limited per visitor in memory.

const WINDOW_MS = 60_000;
const PER_WINDOW = Number(process.env.API_RATE_PER_MINUTE ?? "60");
const hits = new Map<string, { t: number; n: number }>();

export function rateLimited(ip: string): boolean {
  const now = Date.now();
  const h = hits.get(ip);
  if (!h || now - h.t > WINDOW_MS) {
    hits.set(ip, { t: now, n: 1 });
    if (hits.size > 5000) hits.delete(hits.keys().next().value as string);
    return false;
  }
  h.n++;
  return h.n > PER_WINDOW;
}

export const API_HEADERS = { "Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=120" };
const site = () => (process.env.SITE_URL || "").replace(/\/$/, "");

export async function apiChains(opts: { org?: string; q?: string; limit?: number; offset?: number }) {
  const where: string[] = [];
  const p: unknown[] = [];
  if (opts.org) {
    p.push(`%${opts.org}%`);
    where.push(`org_name ILIKE $${p.length}`);
  }
  if (opts.q) {
    p.push(opts.q);
    where.push(`search @@ websearch_to_tsquery('english', $${p.length})`);
  }
  const w = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const limit = Math.min(50, Math.max(1, opts.limit ?? 20));
  const offset = Math.max(0, opts.offset ?? 0);
  return cached(`api:chains:${JSON.stringify([opts.org, opts.q, limit, offset])}`, async () => {
    const [rows, total] = await Promise.all([
      q<{ key: string; hazard: string; org_name: string; org_type: string; relation: string; confidence: number; first_date: string; last_date: string; n_reports: number; n_coroners: number }>(
        `SELECT key, hazard, org_name, org_type, relation, confidence, first_date::text, last_date::text, n_reports, n_coroners
         FROM pub_chains ${w} ORDER BY last_date DESC, key LIMIT ${limit} OFFSET ${offset}`, p),
      q1<{ n: number }>(`SELECT COUNT(*)::int n FROM pub_chains ${w}`, p),
    ]);
    return {
      total: total?.n ?? 0,
      limit,
      offset,
      chains: rows.map((r) => ({
        key: r.key,
        hazard: r.hazard,
        organisation: r.org_name,
        organisation_type: r.org_type,
        relation: r.relation,
        lowest_link_confidence: r.confidence,
        first_report: r.first_date,
        last_report: r.last_date,
        reports: r.n_reports,
        coroners: r.n_coroners,
        url: `${site()}/chains/${r.key}`,
        api: `${site()}/api/v1/chains/${r.key}`,
      })),
      note: "A link shows that a similar concern was raised again, not why. It is not a finding about any organisation or person.",
    };
  });
}

type Detail = {
  reports: { url: string; title: string; date: string; coroner: string | null; area: string | null; responses: { pdf_url: string; promises: { quote: string; timescale: string | null }[] }[] }[];
  links: { earlier: string; later: string; relation: string; confidence: number; explanation: string | null; earlier_quote: string; later_quote: string; days_apart: number }[];
  followups: { promise_id: number; classification: string; sources: { url: string; title: string; quote: string }[] }[];
};

export async function apiChain(key: string) {
  return cached(`api:chain:${key}`, async () => {
    const r = await q1<{ key: string; hazard: string; org_name: string; relation: string; confidence: number; detail: Detail }>(
      "SELECT key, hazard, org_name, relation, confidence, detail FROM pub_chains WHERE key = $1", [key]);
    if (!r) {
      const red = await q1<{ new_key: string }>("SELECT new_key FROM chain_redirects WHERE old_key = $1", [key]);
      return red ? { moved_to: red.new_key } : null;
    }
    return {
      key: r.key,
      hazard: r.hazard,
      organisation: r.org_name,
      relation: r.relation,
      lowest_link_confidence: r.confidence,
      url: `${site()}/chains/${r.key}`,
      reports: r.detail.reports.map((x) => ({
        title: x.title,
        date: x.date,
        coroner: x.coroner,
        area: x.area,
        source: x.url,
        stated_actions: x.responses.flatMap((rs) => rs.promises.map((p) => ({ quote: p.quote, timescale: p.timescale, response_pdf: rs.pdf_url }))),
      })),
      links: r.detail.links.map((l) => ({
        earlier: l.earlier,
        later: l.later,
        relation: l.relation,
        confidence: l.confidence,
        days_apart: l.days_apart,
        explanation: l.explanation,
        earlier_quote: l.earlier_quote,
        later_quote: l.later_quote,
        quotes_verified: true,
      })),
      follow_up: r.detail.followups.map((f) => ({ classification: f.classification, sources: f.sources })),
      note: "Quotes are verified word for word against the source. \"not_found\" means no evidence was found, never that an action did not happen.",
    };
  });
}
