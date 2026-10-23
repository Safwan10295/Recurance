import { Building2, FileText, Link2, Search } from "lucide-react";
import Link from "next/link";
import { ChainRow } from "@/components/cards";
import { EmptyState, PageHeader, Section, btnPrimary, fieldCls, formatDate, orgTypeLabel, shortTitle } from "@/components/ui";
import { searchAll } from "@/lib/queries";

export const metadata = { title: "Search · Recurrence Watch" };

const shown = (n: number, total: number) => (total > n ? `${n} of ${total.toLocaleString("en-GB")}` : `${n}`);

export default async function SearchPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const term = (sp.q ?? "").slice(0, 200).trim();
  const res = term ? await searchAll(term) : { chains: [], reports: [], orgs: [], totals: { chains: 0, reports: 0, orgs: 0 } };
  const none = term && !res.chains.length && !res.reports.length && !res.orgs.length;
  return (
    <div className="space-y-8">
      <PageHeader
        crumbs={[{ href: "/", label: "Start here" }, { label: "Search" }]}
        title={term ? <>Results for &ldquo;{term}&rdquo;</> : "Search"}
        description="Hazards, report titles, quotes, coroners, areas and organisations. Tip: press Ctrl K anywhere to jump straight to a result."
      />
      <form method="get" className="flex gap-2 max-w-2xl">
        <label className="relative flex-1">
          <span className="sr-only">Search</span>
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
          <input
            name="q"
            defaultValue={term}
            placeholder="e.g. smart motorway, ligature, ambulance delay"
            className={`${fieldCls} py-2 pl-9 text-base`}
            autoFocus={!term}
          />
        </label>
        <button className={btnPrimary}>Search</button>
      </form>
      {!term && (
        <div className="space-y-2">
          <p className="eyebrow">Try</p>
          <div className="flex flex-wrap gap-2 text-sm">
            {["smart motorway", "ligature", "ambulance handover", "emollient", "level crossing", "mental health beds"].map((s) => (
              <Link key={s} href={`/search?q=${encodeURIComponent(s)}`} className="rounded-full border border-rule bg-surface px-3 py-1 text-ink-2 hover:no-underline hover:border-accent">
                {s}
              </Link>
            ))}
          </div>
        </div>
      )}
      {none && <EmptyState title="Nothing found">Try fewer or different words.</EmptyState>}
      {res.chains.length > 0 && (
        <Section
          title={`Repeated warnings (${shown(res.chains.length, res.totals.chains)})`}
          action={res.totals.chains > res.chains.length ? <Link href={`/chains?q=${encodeURIComponent(term)}`}>See all {res.totals.chains} →</Link> : undefined}
        >
          <ul className="card px-4 divide-y divide-rule list-none">
            {res.chains.map((c) => (
              <ChainRow key={c.key} c={c} />
            ))}
          </ul>
        </Section>
      )}
      {res.orgs.length > 0 && (
        <Section
          title={`Organisations (${shown(res.orgs.length, res.totals.orgs)})`}
          action={res.totals.orgs > res.orgs.length ? <Link href={`/organisations?q=${encodeURIComponent(term)}`}>See all {res.totals.orgs} →</Link> : undefined}
        >
          <ul className="card divide-y divide-rule list-none p-0">
            {res.orgs.map((o) => (
              <li key={o.id} className="p-3.5 flex flex-wrap items-center justify-between gap-2">
                <Link href={`/organisations/${o.id}`} className="flex items-center gap-2 font-medium">
                  <Building2 size={15} className="text-muted" aria-hidden /> {o.name}
                </Link>
                <span className="text-sm text-muted num">
                  {orgTypeLabel(o.type)} · {o.n_reports} reports{o.n_chains ? ` · ${o.n_chains} chains` : ""}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}
      {res.reports.length > 0 && (
        <Section title={`Reports (${shown(res.reports.length, res.totals.reports)})`}>
          <ul className="card divide-y divide-rule list-none p-0">
            {res.reports.map((r) => (
              <li key={r.url} className="p-3.5 space-y-0.5">
                <Link href={`/reports/${r.slug}`} className="flex items-center gap-2 font-medium">
                  <FileText size={15} className="text-muted shrink-0" aria-hidden /> {shortTitle(r.title)}
                </Link>
                <p className="text-sm text-muted pl-6">
                  {formatDate(r.date)} · {r.coroner ?? "coroner not stated"}
                  {r.area ? ` · ${r.area}` : ""}
                  {r.n_links ? (
                    <span className="inline-flex items-center gap-1 text-accent">
                      {" · "}
                      <Link2 size={12} aria-hidden /> in {r.n_links} recurrence {r.n_links === 1 ? "link" : "links"}
                    </span>
                  ) : null}
                </p>
              </li>
            ))}
          </ul>
          {res.totals.reports > res.reports.length && (
            <p className="text-sm text-muted pt-2">
              Showing the {res.reports.length} closest of {res.totals.reports.toLocaleString("en-GB")} reports. Add words to narrow it down.
            </p>
          )}
        </Section>
      )}
    </div>
  );
}
