import { ChainRow } from "@/components/cards";
import ChainFilters, { RESULTS_ID, chainsHref, type ChainParams } from "@/components/chains/ChainFilters";
import StartHere from "@/components/chains/StartHere";
import SystemicList, { type Systemic } from "@/components/SystemicList";
import { EmptyState, LinkTabs, PageHeader, Pagination } from "@/components/ui";
import { chainFacets, getSystemic } from "@/lib/queries";
import { getStartHere, listChainsWithDates } from "@/lib/queries-chains";
import Link from "next/link";

export const metadata = { title: "Recurrence chains · Recurrence Watch" };

export default async function ChainsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const view = sp.view === "across" ? "across" : "same";
  const relation = sp.relation === "identical" || sp.relation === "closely_related" ? sp.relation : undefined;
  const f = {
    q: sp.q?.trim() || undefined,
    orgType: sp.type || undefined,
    theme: sp.theme || undefined,
    relation,
    minConf: sp.conf ? Number(sp.conf) : undefined,
    minReports: sp.min ? Number(sp.min) : undefined,
    sort: (sp.sort === "oldest" ? "oldest" : "recent") as "recent" | "oldest",
    page: Math.max(1, Number(sp.page) || 1),
  };
  // The params as they appear in the URL, for building chip links.
  const params: ChainParams = {
    q: f.q,
    type: f.orgType,
    theme: f.theme,
    relation,
    conf: sp.conf || undefined,
    min: sp.min || undefined,
    sort: f.sort === "oldest" ? "oldest" : undefined,
  };
  const filtered = Boolean(params.q || params.type || params.theme || params.relation || params.conf || params.min);
  const showStart = view === "same" && !filtered && f.page === 1;

  const [data, facets, systemic, startHere] = await Promise.all([
    listChainsWithDates(f),
    chainFacets(),
    getSystemic(),
    showStart ? getStartHere().catch(() => []) : Promise.resolve([]),
  ]);

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
        <div className="min-w-0">
          {showStart && <StartHere chains={startHere} />}

          <section id={RESULTS_ID} aria-labelledby="all-chains-title" className="scroll-mt-20 space-y-3">
            <h2 id="all-chains-title" className={showStart && startHere.length > 0 ? "font-serif text-xl" : "sr-only"}>
              All chains
            </h2>
            <ChainFilters params={params} facets={facets} />

            <p className="text-sm text-muted num">
              {data.total.toLocaleString("en-GB")} {data.total === 1 ? "chain" : "chains"}
              {f.q ? ` matching “${f.q}”` : ""}, {f.sort === "oldest" ? "earliest first warning first" : "most recent report first"}.
              The order is by date only; there is no ranking of organisations.
            </p>

            {data.rows.length === 0 ? (
              <EmptyState title="No chains match these filters">
                Try removing a filter or a broader search.{" "}
                <Link href={chainsHref({ sort: params.sort }, {}, false)}>Clear all filters</Link>
              </EmptyState>
            ) : (
              <ul className="card px-4 divide-y divide-rule list-none">
                {data.rows.map((c) => (
                  <ChainRow key={c.key} c={c} />
                ))}
              </ul>
            )}
            <Pagination
              path="/chains"
              params={{ q: f.q, type: f.orgType, theme: f.theme, relation: f.relation, conf: sp.conf, min: sp.min, sort: params.sort }}
              page={data.page}
              total={data.total}
              size={data.size}
            />
          </section>
        </div>
      )}
    </div>
  );
}
