import Link from "next/link";
import { notFound } from "next/navigation";
import { ChainRow } from "@/components/cards";
import { EmptyState, PageHeader, Pagination, Quote, StatTile, formatDate, orgTypeLabel } from "@/components/ui";
import { getOrg, getOrgChains, getOrgReports } from "@/lib/queries";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const o = /^\d+$/.test(id) ? await getOrg(Number(id)) : null;
  return { title: o ? `${o.name} · Recurrence Watch` : "Organisation · Recurrence Watch" };
}

export default async function OrgPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  if (!/^\d+$/.test(id)) notFound();
  const org = await getOrg(Number(id));
  if (!org) notFound();
  const view = sp.view === "reports" ? "reports" : "chains";
  const page = Math.max(1, Number(sp.page) || 1);
  const [chains, reports] = await Promise.all([getOrgChains(org.id), getOrgReports(org.id, view === "reports" ? page : 1)]);
  const tab = (v: string, label: string) => (
    <Link
      href={`/organisations/${org.id}${v === "chains" ? "" : `?view=${v}`}`}
      aria-current={view === v ? "page" : undefined}
      className={`px-3.5 py-2.5 text-sm font-medium border-b-2 -mb-px hover:no-underline ${
        view === v ? "border-accent text-ink" : "border-transparent text-muted hover:text-ink"
      }`}
    >
      {label}
    </Link>
  );
  return (
    <div>
      <PageHeader eyebrow={<><Link href="/organisations">Organisations</Link> · {orgTypeLabel(org.type)}</>} title={org.name} />
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-4 mb-8">
        <StatTile value={org.n_reports} label="reports received" />
        <StatTile value={reports.with_response} label="with a published response found" />
        <StatTile value={org.n_chains} label="recurrence chains" />
        <StatTile value={chains.reduce((n, c) => n + c.n_reports, 0)} label="reports in those chains" />
      </div>
      <div className="flex gap-1 border-b border-rule mb-6">
        {tab("chains", `Recurrence chains (${chains.length})`)}
        {tab("reports", `Reports and responses (${reports.total})`)}
      </div>

      {view === "chains" ? (
        chains.length === 0 ? (
          <EmptyState title="No recurrence chains for this organisation">
            No later report was judged to raise the same or a closely related hazard as an earlier report to it.
          </EmptyState>
        ) : (
          <ul className="card px-4 divide-y divide-rule list-none">
            {chains.map((c) => (
              <ChainRow key={c.key} c={c} />
            ))}
          </ul>
        )
      ) : (
        <>
          <ul className="card divide-y divide-rule list-none p-0">
            {reports.rows.map((r) => (
              <li key={r.url} className="p-4 space-y-2">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <Link href={`/reports/${r.slug}`} className="font-medium text-ink">
                    {r.title}
                  </Link>
                  <span className="text-sm text-muted">{formatDate(r.date)}</span>
                </div>
                <p className="text-sm text-ink-2">
                  Coroner {r.coroner ?? "not stated"}
                  {r.area ? ` · ${r.area}` : ""}
                  {r.n_links ? ` · in ${r.n_links} recurrence ${r.n_links === 1 ? "link" : "links"}` : ""}
                </p>
                {r.responses.filter((x) => !x.unmatched).length === 0 ? (
                  <p className="text-xs text-muted">No published response from this organisation found.</p>
                ) : (
                  r.responses
                    .filter((x) => !x.unmatched)
                    .map((rs) => (
                      <details key={rs.pdf_url} className="text-sm">
                        <summary className="cursor-pointer text-accent">
                          Response{rs.promises.length ? ` · ${rs.promises.length} stated ${rs.promises.length === 1 ? "action" : "actions"}` : ""}
                        </summary>
                        <div className="mt-2 space-y-2">
                          <a href={rs.pdf_url} target="_blank" rel="noopener noreferrer">
                            {rs.filename} ↗
                          </a>
                          {rs.promises.map((p) => (
                            <Quote key={p.id} text={p.quote} />
                          ))}
                        </div>
                      </details>
                    ))
                )}
              </li>
            ))}
          </ul>
          <Pagination path={`/organisations/${org.id}`} params={{ view: "reports" }} page={reports.page} total={reports.total} size={reports.size} />
        </>
      )}
    </div>
  );
}
