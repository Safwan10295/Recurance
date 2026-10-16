import "server-only";
import type { BriefMatch, BriefResult, Step } from "./brief";
import { q, q1 } from "./db";
import type { Link } from "./types";

// When live analysis is paused or limited, a report already in the archive still gets its own brief:
// the earlier warnings Nemotron Super judged when the archive was built, with their verified quotes.
// No model calls. The trace says plainly where everything came from.

const stripTitle = (t: string) => t.replace(/\s*[:\-–]\s*Prevention of future deaths? report\s*$/i, "");

export async function archiveBrief(ref: { slug?: string; url?: string }): Promise<{ result: BriefResult; steps: Step[] } | null> {
  const rep = await q1<{ url: string; slug: string; title: string; date: string; concerns: { quote: string; hazard: string }[] }>(
    "SELECT url, slug, title, date::text, concerns FROM pub_reports WHERE slug = $1 OR url = $2",
    [ref.slug ?? "", (ref.url ?? "").replace(/\/?$/, "/")],
  );
  if (!rep) return null;
  const links = await q<{ payload: Link & { hazard: string }; chain_key: string; org_id: number; org_name: string; e_slug: string; e_title: string; e_date: string; e_coroner: string | null; e_area: string | null }>(
    `SELECT l.payload, l.chain_key, c.org_id, c.org_name, r.slug e_slug, r.title e_title, r.date::text e_date, r.coroner e_coroner, r.area e_area
     FROM pub_links l JOIN pub_chains c ON c.key = l.chain_key JOIN pub_reports r ON r.url = l.earlier_url
     WHERE l.later_url = $1 ORDER BY l.confidence DESC, r.date`,
    [rep.url],
  );
  const orgs = await q<{ id: number; name: string }>(
    `SELECT o.id, o.name FROM pub_report_orgs ro JOIN pub_orgs o ON o.id = ro.org_id WHERE ro.report_url = $1
     ORDER BY o.n_chains DESC, o.n_reports DESC`,
    [rep.url],
  );
  const org = links[0] ? { id: links[0].org_id, name: links[0].org_name } : orgs[0] ?? null;

  // One match per earlier report: its strongest link.
  const seen = new Set<string>();
  const matches: BriefMatch[] = [];
  for (const l of links) {
    if (seen.has(l.payload.earlier)) continue;
    seen.add(l.payload.earlier);
    const promises = await q<{ promises: { id: number; quote: string; timescale: string | null }[] }>(
      "SELECT promises FROM pub_responses WHERE report_url = $1 AND org_id = $2 AND NOT unmatched",
      [l.payload.earlier, l.org_id],
    );
    matches.push({
      earlier: { url: l.payload.earlier, slug: l.e_slug, title: l.e_title, date: l.e_date, coroner: l.e_coroner, area: l.e_area },
      relation: l.payload.relation,
      confidence: l.payload.confidence,
      explanation: l.payload.explanation ?? null,
      earlier_quote: l.payload.earlier_quote,
      later_quote: l.payload.later_quote,
      promises: promises.flatMap((p) => p.promises).slice(0, 3),
      chains: [{ key: l.chain_key, hazard: l.payload.hazard }],
    });
    if (matches.length >= 5) break;
  }
  const later = await q1<{ n: number }>("SELECT COUNT(DISTINCT later_url)::int n FROM pub_links WHERE earlier_url = $1", [rep.url]);

  const steps: Step[] = [
    { id: "fetch", label: "Read the report", tool: "Archive", status: "done", detail: `${stripTitle(rep.title)}, already in the archive` },
    { id: "org", label: "Identify the organisation", tool: "Organisation index", status: "done", detail: org?.name ?? "Not found" },
    {
      id: "extract",
      label: "Extract the concerns",
      tool: "Nemotron Nano",
      status: "done",
      cached: true,
      detail: `${rep.concerns.length} ${rep.concerns.length === 1 ? "concern" : "concerns"}, extracted by Nano when the archive was built`,
      items: rep.concerns.slice(0, 6).map((c) => ({ label: c.hazard, sub: c.quote.length > 140 ? c.quote.slice(0, 139) + "…" : c.quote, verdict: "info" as const })),
    },
    {
      id: "archive",
      label: "Earlier warnings already judged",
      tool: "Nemotron Super, archive run",
      status: "done",
      cached: true,
      detail: matches.length
        ? `${matches.length} earlier ${matches.length === 1 ? "warning was" : "warnings were"} judged the same or a closely related hazard when the archive was built`
        : "No earlier warning to this organisation was judged the same hazard when the archive was built",
      items: matches.map((m) => ({
        label: stripTitle(m.earlier.title),
        sub: `${m.earlier.date} · ${m.chains[0]?.hazard ?? ""}`,
        verdict: "kept" as const,
        note: `Judged ${m.relation.replace("_", " ")}, confidence ${m.confidence.toFixed(2)}, both quotes verified`,
      })),
    },
    { id: "brief", label: "Write the brief", tool: "Quote checks", status: "done", detail: "From the archive, no live model call" },
  ];
  const notes: string[] = [];
  if (later?.n) notes.push(`A similar concern from this report was raised again in ${later.n} later ${later.n === 1 ? "report" : "reports"}. See the report page.`);
  return {
    steps,
    result: {
      organisation: org,
      report: { url: rep.url, slug: rep.slug, title: rep.title, date: rep.date, known: true },
      concerns: rep.concerns,
      matches,
      other_earlier: [],
      searched: 0,
      cost: 0,
      notes,
      mode: "archive",
    },
  };
}
