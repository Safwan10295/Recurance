import "server-only";
import { cached, q, q1 } from "./db";

// Compact payload for the hazard map. Points are parallel arrays; strings live in lookup tables.
export interface HazardMapPayload {
  v: 1;
  published_at: string | null;
  /** x and y are integers 0..q (divide by q for 0..1). */
  q: number;
  themes: string[];
  x: number[];
  y: number[];
  /** theme index per point */
  t: number[];
  /** chain index per point, or -1 */
  c: number[];
  /** report index per point */
  r: number[];
  /** hazard index per point (into `hazards`), or -1 */
  h: number[];
  hazards: string[];
  /** [slug, short title or "" when it equals titleFromSlug(slug), date or null] */
  reports: [string, string, string | null][];
  /** [key, hazard, organisation name] */
  chains: [string, string, string][];
  /** flattened pairs of point indices: [earlier0, later0, earlier1, later1, ...] */
  links: number[];
  /** chain index per link */
  lc: number[];
}

const Q = 4095;
const HAZARD_MAX = 160;
const TTL = 10 * 60_000;

function slugOf(url: string): string {
  return url.replace(/\/+$/, "").split("/").pop() ?? url;
}

// "Jane Doe: Prevention of future deaths report" -> "Jane Doe" (same rule as components/ui shortTitle).
function shortTitle(title: string | null | undefined): string {
  return (title ?? "").replace(/\s*[:\-–]\s*(Prevention of future deaths?|PFD) report\s*$/i, "").trim() || (title ?? "");
}

// Kept in step with the copy in components/HazardMap.tsx.
export function titleFromSlug(slug: string): string {
  const s = slug.replace(/-prevention-of-future-deaths?-report$/i, "").replace(/-/g, " ").trim();
  return s.replace(/\b\w/g, (m) => m.toUpperCase());
}

function clip(s: string): string {
  const t = s.replace(/\s+/g, " ").trim();
  if (t.length <= HAZARD_MAX) return t;
  const cut = t.slice(0, HAZARD_MAX - 1);
  const sp = cut.lastIndexOf(" ");
  return (sp > HAZARD_MAX * 0.6 ? cut.slice(0, sp) : cut).replace(/[,;:.\s]+$/, "") + "…";
}

async function build(publishedAt: string | null): Promise<string> {
  const [themeRow, points, links] = await Promise.all([
    q1<{ value: unknown }>("SELECT value FROM pub_meta WHERE key = 'themes'"),
    q<{ id: number; x: number; y: number; report_url: string; hazard: string | null; theme: string | null; chain_key: string | null }>(
      "SELECT id, x, y, report_url, hazard, theme, chain_key FROM pub_hazard_points ORDER BY id",
    ),
    q<{ earlier_id: number; later_id: number; chain_key: string }>(
      "SELECT earlier_id, later_id, chain_key FROM pub_hazard_links ORDER BY chain_key, earlier_id, later_id",
    ),
  ]);

  const [reportRows, chainRows] = await Promise.all([
    q<{ url: string; slug: string | null; title: string | null; date: string | null }>(
      "SELECT url, slug, title, date FROM pub_reports WHERE url IN (SELECT DISTINCT report_url FROM pub_hazard_points)",
    ),
    q<{ key: string; hazard: string | null; org_name: string | null }>(
      `SELECT key, hazard, org_name FROM pub_chains
        WHERE key IN (SELECT chain_key FROM pub_hazard_points WHERE chain_key IS NOT NULL
                      UNION SELECT chain_key FROM pub_hazard_links)`,
    ),
  ]);

  // Themes in display order, plus any the meta row does not know about.
  const themes: string[] = Array.isArray(themeRow?.value) ? (themeRow!.value as unknown[]).map(String) : [];
  const themeIdx = new Map(themes.map((t, i) => [t, i]));
  const themeOf = (t: string | null) => {
    const name = t || "Other";
    let i = themeIdx.get(name);
    if (i === undefined) {
      i = themes.length;
      themes.push(name);
      themeIdx.set(name, i);
    }
    return i;
  };

  const reportByUrl = new Map(reportRows.map((r) => [r.url, r]));
  const reports: HazardMapPayload["reports"] = [];
  const reportIdx = new Map<string, number>();
  const reportOf = (url: string) => {
    let i = reportIdx.get(url);
    if (i === undefined) {
      const r = reportByUrl.get(url);
      const slug = r?.slug || slugOf(url);
      i = reports.length;
      const title = r?.title ? shortTitle(r.title) : "";
      reports.push([slug, title === titleFromSlug(slug) ? "" : title, r?.date ?? null]);
      reportIdx.set(url, i);
    }
    return i;
  };

  const chainByKey = new Map(chainRows.map((c) => [c.key, c]));
  const chains: HazardMapPayload["chains"] = [];
  const chainIdx = new Map<string, number>();
  const chainOf = (key: string | null) => {
    if (!key) return -1;
    let i = chainIdx.get(key);
    if (i === undefined) {
      const c = chainByKey.get(key);
      if (!c) return -1; // a chain that is no longer published
      i = chains.length;
      chains.push([key, c.hazard ?? "", c.org_name ?? ""]);
      chainIdx.set(key, i);
    }
    return i;
  };

  const hazards: string[] = [];
  const hazardIdx = new Map<string, number>();
  const hazardOf = (h: string | null) => {
    if (!h) return -1;
    const s = clip(h);
    let i = hazardIdx.get(s);
    if (i === undefined) {
      i = hazards.length;
      hazards.push(s);
      hazardIdx.set(s, i);
    }
    return i;
  };

  const quant = (v: number) => Math.max(0, Math.min(Q, Math.round((Number.isFinite(v) ? v : 0.5) * Q)));
  const n = points.length;
  const out: HazardMapPayload = {
    v: 1,
    published_at: publishedAt,
    q: Q,
    themes,
    x: new Array(n),
    y: new Array(n),
    t: new Array(n),
    c: new Array(n),
    r: new Array(n),
    h: new Array(n),
    hazards,
    reports,
    chains,
    links: [],
    lc: [],
  };
  const pointIdx = new Map<number, number>();
  points.forEach((p, i) => {
    pointIdx.set(Number(p.id), i);
    out.x[i] = quant(p.x);
    out.y[i] = quant(p.y);
    out.t[i] = themeOf(p.theme);
    out.c[i] = chainOf(p.chain_key);
    out.r[i] = reportOf(p.report_url);
    out.h[i] = hazardOf(p.hazard);
  });

  const seen = new Set<string>();
  for (const l of links) {
    const a = pointIdx.get(Number(l.earlier_id));
    const b = pointIdx.get(Number(l.later_id));
    if (a === undefined || b === undefined || a === b) continue;
    const ci = chainOf(l.chain_key);
    const k = `${a}:${b}:${ci}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.links.push(a, b);
    out.lc.push(ci);
  }

  return JSON.stringify(out);
}

/** The hazard map as a ready-to-send JSON string. Rebuilt when a new publish lands, else cached for 10 minutes. */
export async function getHazardMapJson(): Promise<string> {
  const pub = await cached(
    "hazard-map:published_at",
    async () => (await q1<{ value: string }>("SELECT value #>> '{}' AS value FROM pub_meta WHERE key = 'published_at'"))?.value ?? null,
    60_000,
  );
  return cached(`hazard-map:v1:${pub ?? "none"}`, () => build(pub), TTL);
}
