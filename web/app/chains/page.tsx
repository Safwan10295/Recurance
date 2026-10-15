import Link from "next/link";
import { ChainRow } from "@/components/cards";
import SystemicList, { type Systemic } from "@/components/SystemicList";
import { EmptyState, PageHeader, Pagination, orgTypeLabel } from "@/components/ui";
import { chainFacets, getSystemic, listChains } from "@/lib/queries";

export const metadata = { title: "Recurrence chains · Recurrence Watch" };

export default async function ChainsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const view = sp.view === "across" ? "across" : "same";
  const f = {
    q: sp.q?.trim() || undefined,
    orgType: sp.type || undefined,
    theme: sp.theme || undefined,
    relation: sp.relation === "identical" || sp.relation === "closely_related" ? sp.relation : undefined,
    minConf: sp.conf ? Number(sp.conf) : undefined,
    minReports: sp.min ? Number(sp.min) : undefined,
    sort: (sp.sort === "oldest" || sp.sort === "largest" ? sp.sort : "recent") as "recent" | "oldest" | "largest",
    page: Math.max(1, Number(sp.page) || 1),
  };
  const [data, facets, systemic] = await Promise.all([listChains(f), chainFacets(), getSystemic()]);
  const sel = "w-full rounded-md border border-rule bg-surface px-2.5 py-1.5 text-sm";
  const tab = (id: string, label: string, n: number) => (
    <Link
      href={id === "same" ? "/chains" : "/chains?view=across"}
      aria-current={view === id ? "page" : undefined}
      className={`px-3.5 py-2.5 text-sm font-medium border-b-2 -mb-px hover:no-underline ${
        view === id ? "border-accent text-ink" : "border-transparent text-muted hover:text-ink"
      }`}
    >
      {label} <span className="text-muted">({n})</span>
    </Link>
  );
  return (
    <div>
      <PageHeader
        eyebrow="Explore the record"
        title="Recurrence chains"
        description="A chain is one hazard raised with one organisation in two or more reports, at least six months apart. Every link is judged identical or closely related, and both quotes are checked word for word."
      />
      <div className="flex gap-1 border-b border-rule mb-6">
        {tab("same", "Same organisation", data.total)}
        {tab("across", "Across organisations", systemic.length)}
      </div>

      {view === "across" ? (
        <SystemicList items={systemic as Systemic[]} />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
          <form method="get" className="card p-4 space-y-3 h-fit lg:sticky lg:top-24">
            <label className="block text-sm space-y-1">
              <span className="text-muted">Search</span>
              <input name="q" defaultValue={f.q} placeholder="e.g. smart motorway" className={sel} />
            </label>
            <label className="block text-sm space-y-1">
              <span className="text-muted">Organisation type</span>
              <select name="type" defaultValue={f.orgType ?? ""} className={sel}>
                <option value="">All</option>
                {facets.types.map((t) => (
                  <option key={t.org_type} value={t.org_type}>
                    {orgTypeLabel(t.org_type)} ({t.n})
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm space-y-1">
              <span className="text-muted">Theme</span>
              <select name="theme" defaultValue={f.theme ?? ""} className={sel}>
                <option value="">All</option>
                {facets.themes.map((t) => (
                  <option key={t.theme} value={t.theme}>
                    {t.theme} ({t.n})
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm space-y-1">
              <span className="text-muted">Relation</span>
              <select name="relation" defaultValue={f.relation ?? ""} className={sel}>
                <option value="">Identical or closely related</option>
                <option value="identical">Identical only</option>
                <option value="closely_related">Closely related only</option>
              </select>
            </label>
            <label className="block text-sm space-y-1">
              <span className="text-muted">At least</span>
              <select name="min" defaultValue={sp.min ?? ""} className={sel}>
                <option value="">2 reports</option>
                <option value="3">3 reports</option>
                <option value="5">5 reports</option>
                <option value="10">10 reports</option>
              </select>
            </label>
            <label className="block text-sm space-y-1">
              <span className="text-muted">Minimum confidence</span>
              <select name="conf" defaultValue={sp.conf ?? ""} className={sel}>
                <option value="">0.70 (all shown)</option>
                <option value="0.8">0.80</option>
                <option value="0.9">0.90</option>
              </select>
            </label>
            <label className="block text-sm space-y-1">
              <span className="text-muted">Order</span>
              <select name="sort" defaultValue={f.sort} className={sel}>
                <option value="recent">Most recent report first</option>
                <option value="oldest">Earliest warning first</option>
                <option value="largest">Most reports first</option>
              </select>
            </label>
            <div className="flex gap-2 pt-1">
              <button className="rounded-md bg-accent text-accent-ink px-3.5 py-1.5 text-sm font-medium">Apply</button>
              <Link href="/chains" className="rounded-md border border-rule px-3.5 py-1.5 text-sm hover:no-underline">
                Reset
              </Link>
            </div>
          </form>

          <div className="min-w-0">
            <p className="text-sm text-muted mb-1">
              {data.total.toLocaleString("en-GB")} chains{f.q ? ` matching "${f.q}"` : ""}. There is no ranking of
              organisations: lists are ordered by date or size only.
            </p>
            {data.rows.length === 0 ? (
              <EmptyState title="No chains match these filters">Try removing a filter or a broader search.</EmptyState>
            ) : (
              <ul className="card px-4 divide-y divide-rule list-none">
                {data.rows.map((c) => (
                  <ChainRow key={c.key} c={c} />
                ))}
              </ul>
            )}
            <Pagination
              path="/chains"
              params={{ q: f.q, type: f.orgType, theme: f.theme, relation: f.relation, conf: sp.conf, min: sp.min, sort: f.sort === "recent" ? undefined : f.sort }}
              page={data.page}
              total={data.total}
              size={data.size}
            />
          </div>
        </div>
      )}
    </div>
  );
}
