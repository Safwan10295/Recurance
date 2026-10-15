import Link from "next/link";
import { ChainRow } from "@/components/cards";
import { EmptyState, PageHeader, Section, formatDate, orgTypeLabel } from "@/components/ui";
import { searchAll } from "@/lib/queries";

export const metadata = { title: "Search · Recurrence Watch" };

export default async function SearchPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const term = (sp.q ?? "").slice(0, 200).trim();
  const res = term ? await searchAll(term) : { chains: [], reports: [], orgs: [] };
  const none = term && !res.chains.length && !res.reports.length && !res.orgs.length;
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Explore the record"
        title={term ? <>Results for &ldquo;{term}&rdquo;</> : "Search"}
        description="Search hazards, report titles, coroners, areas and organisations."
      />
      <form method="get" className="flex gap-2 max-w-2xl">
        <input
          name="q"
          defaultValue={term}
          placeholder="e.g. smart motorway, ligature, ambulance delay, Network Rail"
          className="flex-1 rounded-md border border-rule bg-surface px-3 py-2"
          autoFocus={!term}
        />
        <button className="rounded-md bg-accent text-accent-ink px-4 py-2 text-sm font-medium">Search</button>
      </form>
      {!term && (
        <div className="flex flex-wrap gap-2 text-sm">
          {["smart motorway", "ligature", "ambulance handover", "emollient", "level crossing", "mental health beds"].map((s) => (
            <Link key={s} href={`/search?q=${encodeURIComponent(s)}`} className="rounded-full border border-rule bg-surface px-3 py-1 hover:no-underline">
              {s}
            </Link>
          ))}
        </div>
      )}
      {none && <EmptyState title="Nothing found">Try fewer or different words.</EmptyState>}
      {res.chains.length > 0 && (
        <Section title={`Recurrence chains (${res.chains.length})`}>
          <ul className="card px-4 divide-y divide-rule list-none">
            {res.chains.map((c) => (
              <ChainRow key={c.key} c={c} />
            ))}
          </ul>
        </Section>
      )}
      {res.orgs.length > 0 && (
        <Section title={`Organisations (${res.orgs.length})`}>
          <ul className="card divide-y divide-rule list-none p-0">
            {res.orgs.map((o) => (
              <li key={o.id} className="p-3 flex flex-wrap justify-between gap-2">
                <Link href={`/organisations/${o.id}`}>{o.name}</Link>
                <span className="text-sm text-muted">
                  {orgTypeLabel(o.type)} · {o.n_reports} reports{o.n_chains ? ` · ${o.n_chains} chains` : ""}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}
      {res.reports.length > 0 && (
        <Section title={`Reports (${res.reports.length})`}>
          <ul className="card divide-y divide-rule list-none p-0">
            {res.reports.map((r) => (
              <li key={r.url} className="p-3 space-y-0.5">
                <Link href={`/reports/${r.slug}`} className="font-medium">
                  {r.title}
                </Link>
                <p className="text-sm text-muted">
                  {formatDate(r.date)} · {r.coroner ?? "coroner not stated"}
                  {r.area ? ` · ${r.area}` : ""}
                  {r.n_links ? ` · in ${r.n_links} recurrence ${r.n_links === 1 ? "link" : "links"}` : ""}
                </p>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}
