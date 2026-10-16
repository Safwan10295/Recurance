import { SlidersHorizontal } from "lucide-react";
import Link from "next/link";
import AutoForm from "@/components/AutoForm";
import { ChainRow } from "@/components/cards";
import SystemicList, { type Systemic } from "@/components/SystemicList";
import { EmptyState, InfoTip, LinkTabs, PageHeader, Pagination, btnPrimary, btnSecondary, fieldCls, orgTypeLabel } from "@/components/ui";
import { GLOSSARY } from "@/lib/glossary";
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
    sort: (sp.sort === "oldest" ? "oldest" : "recent") as "recent" | "oldest",
    page: Math.max(1, Number(sp.page) || 1),
  };
  const [data, facets, systemic] = await Promise.all([listChains(f), chainFacets(), getSystemic()]);
  const active = [f.orgType, f.theme, f.relation, sp.conf, sp.min].filter(Boolean).length;
  const label = "block text-sm space-y-1";
  return (
    <div>
      <PageHeader
        crumbs={[{ href: "/", label: "Start here" }, { label: "Recurrence chains" }]}
        title="Recurrence chains"
        description={
          <>
            A chain is one hazard raised with one organisation in two or more reports, at least six months apart. Every link
            is judged identical or closely related by Nemotron Super, and both quotes are checked word for word.
          </>
        }
      />
      <LinkTabs
        tabs={[
          { href: "/chains", label: "Same organisation", count: data.total, active: view === "same" },
          { href: "/chains?view=across", label: "Across organisations", count: systemic.length, active: view === "across" },
        ]}
      />

      {view === "across" ? (
        <SystemicList items={systemic as Systemic[]} />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[250px_1fr]">
          <AutoForm className="card p-4 space-y-3 h-fit lg:sticky lg:top-24">
            <label className={label}>
              <span className="text-muted">Search</span>
              <input name="q" defaultValue={f.q} placeholder="e.g. smart motorway" className={fieldCls} />
            </label>
            <label className={label}>
              <span className="text-muted">Order</span>
              <select name="sort" defaultValue={f.sort} className={fieldCls}>
                <option value="recent">Most recent report first</option>
                <option value="oldest">Earliest warning first</option>
              </select>
            </label>
            <details open={active > 0} className="group">
              <summary className="flex cursor-pointer items-center gap-1.5 text-sm text-accent list-none [&::-webkit-details-marker]:hidden">
                <SlidersHorizontal size={14} aria-hidden /> More filters{active > 0 ? ` (${active} on)` : ""}
              </summary>
              <div className="space-y-3 pt-3">
                <label className={label}>
                  <span className="text-muted">Organisation type</span>
                  <select name="type" defaultValue={f.orgType ?? ""} className={fieldCls}>
                    <option value="">All</option>
                    {facets.types.map((t) => (
                      <option key={t.org_type} value={t.org_type}>
                        {orgTypeLabel(t.org_type)} ({t.n})
                      </option>
                    ))}
                  </select>
                </label>
                <label className={label}>
                  <span className="text-muted">Theme</span>
                  <select name="theme" defaultValue={f.theme ?? ""} className={fieldCls}>
                    <option value="">All</option>
                    {facets.themes.map((t) => (
                      <option key={t.theme} value={t.theme}>
                        {t.theme} ({t.n})
                      </option>
                    ))}
                  </select>
                </label>
                <div className={label}>
                  <span className="flex items-center gap-1.5 text-muted">
                    Relation <InfoTip text={`${GLOSSARY.identical} ${GLOSSARY.closely_related}`} />
                  </span>
                  <select name="relation" defaultValue={f.relation ?? ""} className={fieldCls} aria-label="Relation">
                    <option value="">Identical or closely related</option>
                    <option value="identical">Identical only</option>
                    <option value="closely_related">Closely related only</option>
                  </select>
                </div>
                <label className={label}>
                  <span className="text-muted">At least</span>
                  <select name="min" defaultValue={sp.min ?? ""} className={fieldCls}>
                    <option value="">2 reports</option>
                    <option value="3">3 reports</option>
                    <option value="5">5 reports</option>
                    <option value="10">10 reports</option>
                  </select>
                </label>
                <div className={label}>
                  <span className="flex items-center gap-1.5 text-muted">
                    Minimum confidence <InfoTip text={GLOSSARY.confidence} />
                  </span>
                  <select name="conf" defaultValue={sp.conf ?? ""} className={fieldCls} aria-label="Minimum confidence">
                    <option value="">0.70 (all shown)</option>
                    <option value="0.8">0.80</option>
                    <option value="0.9">0.90</option>
                  </select>
                </div>
              </div>
            </details>
            <div className="flex gap-2 pt-1">
              <button className={btnPrimary}>Apply</button>
              <Link href="/chains" className={btnSecondary}>
                Reset
              </Link>
            </div>
          </AutoForm>

          <div className="min-w-0">
            <p className="text-sm text-muted mb-2 num">
              {data.total.toLocaleString("en-GB")} chains{f.q ? ` matching "${f.q}"` : ""}, ordered by date. There is no
              ranking of organisations.
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
