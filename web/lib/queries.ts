import "server-only";
import { DbUnavailable, cached, q, q1 } from "./db";
import type { ChainDetail, ChainSummary, Dossier, Followup, Link, Relation, ReportCard, ResponseDoc, Site } from "./types";

// ---------- meta ----------

export interface Meta {
  site: Site;
  evaluation: Record<string, unknown> | null;
  brief_examples: unknown[];
  featured: string[];
  published_at: string;
  last_refresh: { finished?: string; new_reports?: number } | null;
}

export const getMeta = () =>
  cached("meta", async () => {
    const rows = await q<{ key: string; value: unknown }>("SELECT key, value FROM pub_meta");
    const m = Object.fromEntries(rows.map((r) => [r.key, r.value])) as unknown as Meta;
    return m;
  });

// ---------- chains ----------

interface ChainRow {
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
  featured: number | null;
  coroners: string[];
  areas: string[];
}

const CHAIN_COLS = `key, org_id, org_name, org_type, hazard, relation, confidence, first_date, last_date, n_reports,
  n_coroners, theme, has_dossier, any_no_response, featured, detail->'coroners' AS coroners, detail->'areas' AS areas`;

function toSummary(r: ChainRow): ChainSummary & { featured: number | null } {
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
    featured: r.featured,
  };
}

export const getFeatured = () =>
  cached("featured", async () =>
    (await q<ChainRow>(`SELECT ${CHAIN_COLS} FROM pub_chains WHERE featured IS NOT NULL ORDER BY featured`)).map(toSummary),
  );

export interface ChainFilter {
  q?: string;
  orgType?: string;
  theme?: string;
  relation?: string;
  minConf?: number;
  minReports?: number;
  sort?: "recent" | "oldest" | "largest";
  page?: number;
  size?: number;
}

export async function listChains(f: ChainFilter) {
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
  const order = f.sort === "oldest" ? "first_date ASC" : f.sort === "largest" ? "n_reports DESC, last_date DESC" : "last_date DESC";
  const size = f.size ?? 20;
  const page = Math.max(1, f.page ?? 1);
  const key = `chains:${JSON.stringify(f)}`;
  return cached(key, async () => {
    const [rows, total] = await Promise.all([
      q<ChainRow>(`SELECT ${CHAIN_COLS} FROM pub_chains ${w} ORDER BY ${order} LIMIT ${size} OFFSET ${(page - 1) * size}`, p),
      q1<{ n: number }>(`SELECT COUNT(*)::int AS n FROM pub_chains ${w}`, p),
    ]);
    return { rows: rows.map(toSummary), total: total?.n ?? 0, page, size };
  });
}

export const chainFacets = () =>
  cached("chain-facets", async () => ({
    themes: (await q<{ theme: string; n: number }>(
      "SELECT theme, COUNT(*)::int n FROM pub_chains WHERE theme IS NOT NULL GROUP BY theme ORDER BY n DESC")),
    types: (await q<{ org_type: string; n: number }>(
      "SELECT org_type, COUNT(*)::int n FROM pub_chains WHERE org_type IS NOT NULL GROUP BY org_type ORDER BY n DESC")),
  }));

export async function getChain(key: string): Promise<{ chain: ChainDetail | null; redirect: string | null }> {
  if (!/^[a-f0-9]{16}$/.test(key)) return { chain: null, redirect: null };
  return cached(`chain:${key}`, async () => {
    const r = await q1<ChainRow & { detail: { reports: ReportCard[]; links: Link[]; followups: Followup[]; dossier: Dossier | null } }>(
      `SELECT ${CHAIN_COLS}, detail FROM pub_chains WHERE key = $1`, [key]);
    if (!r) {
      const red = await q1<{ new_key: string }>("SELECT new_key FROM chain_redirects WHERE old_key = $1", [key]);
      return { chain: null, redirect: red?.new_key ?? null };
    }
    return {
      chain: { ...toSummary(r), reports: r.detail.reports, links: r.detail.links, followups: r.detail.followups, dossier: r.detail.dossier },
      redirect: null,
    };
  });
}

// ---------- recent ----------

export interface RecentEntry {
  later: { url: string; slug: string; title: string; date: string; coroner: string | null; area: string | null; first_seen: string };
  org: { id: number; name: string; type: string };
  earlier: (Link & { chain: string; hazard: string; e_title: string; e_date: string; e_coroner: string | null; e_slug: string })[];
  is_new: boolean;
}

export async function listRecent(opts: { months?: number; orgType?: string; page?: number; size?: number }) {
  const months = opts.months ?? 12;
  const size = opts.size ?? 15;
  const page = Math.max(1, opts.page ?? 1);
  const params: unknown[] = [months];
  let typeSql = "";
  if (opts.orgType) {
    params.push(opts.orgType);
    typeSql = `AND c.org_type = $${params.length}`;
  }
  return cached(`recent:${months}:${opts.orgType ?? ""}:${page}:${size}`, async () => {
    const base = `FROM pub_links l JOIN pub_chains c ON c.key = l.chain_key
      WHERE l.later_date >= (current_date - make_interval(months => $1::int)) ${typeSql}`;
    const totalRow = await q1<{ n: number }>(`SELECT COUNT(DISTINCT (l.later_url, c.org_id))::int n ${base}`, params);
    const groups = await q<{ later_url: string; org_id: number; org_name: string; org_type: string; later_date: string }>(
      `SELECT l.later_url, c.org_id, c.org_name, c.org_type, MAX(l.later_date)::text AS later_date ${base}
       GROUP BY l.later_url, c.org_id, c.org_name, c.org_type
       ORDER BY later_date DESC, l.later_url LIMIT ${size} OFFSET ${(page - 1) * size}`, params);
    const out: RecentEntry[] = [];
    for (const g of groups) {
      const rep = await q1<RecentEntry["later"]>(
        "SELECT url, slug, title, date, coroner, area, first_seen::text FROM pub_reports WHERE url = $1", [g.later_url]);
      const links = await q<{ payload: Link & { hazard: string }; chain_key: string; e_title: string; e_date: string; e_coroner: string | null; e_slug: string }>(
        `SELECT l.payload, l.chain_key, r.title e_title, r.date e_date, r.coroner e_coroner, r.slug e_slug
         FROM pub_links l JOIN pub_chains c ON c.key = l.chain_key LEFT JOIN pub_reports r ON r.url = l.earlier_url
         WHERE l.later_url = $1 AND c.org_id = $2 ORDER BY r.date`, [g.later_url, g.org_id]);
      if (!rep) continue;
      out.push({
        later: rep,
        org: { id: g.org_id, name: g.org_name, type: g.org_type },
        earlier: links.map((x) => ({ ...x.payload, chain: x.chain_key, hazard: x.payload.hazard, e_title: x.e_title, e_date: x.e_date, e_coroner: x.e_coroner, e_slug: x.e_slug })),
        is_new: Date.now() - new Date(rep.first_seen).getTime() < 8 * 864e5 && !!(await getMeta()).last_refresh,
      });
    }
    return { rows: out, total: totalRow?.n ?? 0, page, size, months };
  });
}

// ---------- organisations ----------

export interface OrgRow {
  id: number;
  name: string;
  type: string;
  national: boolean;
  n_reports: number;
  n_chains: number;
}

export async function listOrgs(opts: { q?: string; type?: string; page?: number; size?: number; withChains?: boolean }) {
  const p: unknown[] = [];
  const where: string[] = [];
  if (opts.q) {
    p.push(`%${opts.q.toLowerCase()}%`);
    where.push(`lower(name) LIKE $${p.length}`);
  }
  if (opts.type) {
    p.push(opts.type);
    where.push(`type = $${p.length}`);
  }
  if (opts.withChains) where.push("n_chains > 0");
  const w = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const size = opts.size ?? 40;
  const page = Math.max(1, opts.page ?? 1);
  return cached(`orgs:${JSON.stringify(opts)}`, async () => {
    const [rows, total] = await Promise.all([
      q<OrgRow>(`SELECT id, name, type, national, n_reports, n_chains FROM pub_orgs ${w} ORDER BY name LIMIT ${size} OFFSET ${(page - 1) * size}`, p),
      q1<{ n: number }>(`SELECT COUNT(*)::int n FROM pub_orgs ${w}`, p),
    ]);
    return { rows, total: total?.n ?? 0, page, size };
  });
}

export const getOrg = (id: number) =>
  cached(`org:${id}`, () => q1<OrgRow>("SELECT id, name, type, national, n_reports, n_chains FROM pub_orgs WHERE id = $1", [id]));

export const getOrgChains = (id: number) =>
  cached(`org-chains:${id}`, async () =>
    (await q<ChainRow>(`SELECT ${CHAIN_COLS} FROM pub_chains WHERE org_id = $1 ORDER BY last_date DESC`, [id])).map(toSummary));

export interface ReportListRow {
  url: string;
  slug: string;
  title: string;
  date: string;
  coroner: string | null;
  area: string | null;
  n_links: number;
  responses: ResponseDoc[];
}

export async function getOrgReports(id: number, page = 1, size = 25) {
  return cached(`org-reports:${id}:${page}`, async () => {
    const rows = await q<ReportListRow>(
      `SELECT r.url, r.slug, r.title, r.date, r.coroner, r.area, r.n_links,
              COALESCE((SELECT json_agg(json_build_object('pdf_url', s.pdf_url, 'filename', s.filename, 'promises', s.promises, 'unmatched', s.unmatched))
                        FROM pub_responses s WHERE s.report_url = r.url AND s.org_id = $1), '[]') AS responses
       FROM pub_report_orgs ro JOIN pub_reports r ON r.url = ro.report_url
       WHERE ro.org_id = $1 ORDER BY r.date DESC NULLS LAST LIMIT ${size} OFFSET ${(page - 1) * size}`, [id]);
    const total = await q1<{ n: number }>("SELECT COUNT(*)::int n FROM pub_report_orgs WHERE org_id = $1", [id]);
    const withResp = await q1<{ n: number }>(
      "SELECT COUNT(DISTINCT report_url)::int n FROM pub_responses WHERE org_id = $1 AND NOT unmatched", [id]);
    return { rows, total: total?.n ?? 0, with_response: withResp?.n ?? 0, page, size };
  });
}

// ---------- reports ----------

export interface ReportDetail {
  url: string;
  slug: string;
  title: string;
  date: string;
  coroner: string | null;
  area: string | null;
  ref: string | null;
  categories: string[];
  concerns: { quote: string; hazard: string }[];
  orgs: { id: number; name: string; type: string }[];
  responses: (ResponseDoc & { org_id: number })[];
  earlier: (Link & { chain_key: string; hazard: string; other_title: string; other_slug: string; other_date: string })[];
  later: (Link & { chain_key: string; hazard: string; other_title: string; other_slug: string; other_date: string })[];
}

export async function getReport(slug: string): Promise<ReportDetail | null> {
  return cached(`report:${slug}`, async () => {
    const r = await q1<Omit<ReportDetail, "orgs" | "responses" | "earlier" | "later">>(
      "SELECT url, slug, title, date, coroner, area, ref, categories, concerns FROM pub_reports WHERE slug = $1", [slug]);
    if (!r) return null;
    const [orgs, responses, earlier, later] = await Promise.all([
      q<{ id: number; name: string; type: string }>(
        "SELECT o.id, o.name, o.type FROM pub_report_orgs ro JOIN pub_orgs o ON o.id = ro.org_id WHERE ro.report_url = $1 ORDER BY o.name", [r.url]),
      q<ResponseDoc & { org_id: number }>(
        "SELECT DISTINCT ON (pdf_url) org_id, pdf_url, filename, promises, unmatched FROM pub_responses WHERE report_url = $1 ORDER BY pdf_url, unmatched", [r.url]),
      q<{ payload: Link & { hazard: string }; chain_key: string; other_title: string; other_slug: string; other_date: string }>(
        `SELECT l.payload, l.chain_key, o.title other_title, o.slug other_slug, o.date other_date FROM pub_links l
         JOIN pub_reports o ON o.url = l.earlier_url WHERE l.later_url = $1 ORDER BY o.date`, [r.url]),
      q<{ payload: Link & { hazard: string }; chain_key: string; other_title: string; other_slug: string; other_date: string }>(
        `SELECT l.payload, l.chain_key, o.title other_title, o.slug other_slug, o.date other_date FROM pub_links l
         JOIN pub_reports o ON o.url = l.later_url WHERE l.earlier_url = $1 ORDER BY o.date`, [r.url]),
    ]);
    const flat = (xs: typeof earlier) => xs.map((x) => ({ ...x.payload, chain_key: x.chain_key, hazard: x.payload.hazard, other_title: x.other_title, other_slug: x.other_slug, other_date: x.other_date }));
    return { ...r, orgs, responses, earlier: flat(earlier), later: flat(later) };
  });
}

export async function suggestReports(term: string, limit = 8) {
  const t = term.trim();
  if (t.length < 2) return [];
  return q<{ url: string; slug: string; title: string; date: string }>(
    `SELECT url, slug, title, date FROM pub_reports
     WHERE title ILIKE $1 OR search @@ websearch_to_tsquery('english', $2)
     ORDER BY (title ILIKE $1) DESC, date DESC NULLS LAST LIMIT $3`, [`%${t}%`, t, limit]);
}

// ---------- search ----------

export async function searchAll(term: string) {
  const t = term.trim();
  if (!t) return { chains: [], reports: [], orgs: [] };
  return cached(`search:${t.toLowerCase()}`, async () => {
    const [chains, reports, orgs] = await Promise.all([
      q<ChainRow>(`SELECT ${CHAIN_COLS} FROM pub_chains, websearch_to_tsquery('english', $1) query
                   WHERE search @@ query ORDER BY ts_rank(search, query) DESC, n_reports DESC LIMIT 12`, [t]),
      q<{ url: string; slug: string; title: string; date: string; coroner: string | null; area: string | null; n_links: number }>(
        `SELECT url, slug, title, date, coroner, area, n_links FROM pub_reports, websearch_to_tsquery('english', $1) query
         WHERE search @@ query OR title ILIKE $2 ORDER BY (title ILIKE $2) DESC, ts_rank(search, query) DESC, date DESC LIMIT 15`,
        [t, `%${t}%`]),
      q<OrgRow>(`SELECT id, name, type, national, n_reports, n_chains FROM pub_orgs
                 WHERE lower(name) LIKE $1 OR search @@ websearch_to_tsquery('english', $2)
                 ORDER BY n_reports DESC LIMIT 10`, [`%${t.toLowerCase()}%`, t]),
    ]);
    return { chains: chains.map(toSummary), reports, orgs };
  });
}

// ---------- systemic ----------

export const getSystemic = () =>
  cached("systemic", async () => (await q<{ payload: unknown }>("SELECT payload FROM pub_systemic ORDER BY id")).map((r) => r.payload));

export async function dbHealthy(): Promise<{ ok: boolean; published_at?: string; error?: string }> {
  try {
    const r = await q1<{ value: string }>("SELECT value #>> '{}' AS value FROM pub_meta WHERE key = 'published_at'");
    return { ok: true, published_at: r?.value };
  } catch (e) {
    // Plain states only: never echo driver messages to the public.
    const code = (e as { code?: string }).code;
    const error = code === "42P01" ? "no data published yet" : e instanceof DbUnavailable ? "database unreachable" : "database error";
    return { ok: false, error };
  }
}
