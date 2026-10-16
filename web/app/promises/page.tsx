import Link from "next/link";
import { AutoSubmitForm } from "@/components/promises/AutoSubmitForm";
import { PromiseCard } from "@/components/promises/PromiseCard";
import { EmptyState, InfoTip, PageHeader, Pagination, StatTile, btnPrimary, fieldCls, orgTypeLabel } from "@/components/ui";
import { GLOSSARY } from "@/lib/glossary";
import { listPromiseLinks, promiseFacets, promiseSummary } from "@/lib/queries-promises";

export const metadata = { title: "Promises, then the same concern · Recurrence Watch" };
export const dynamic = "force-dynamic";

const SIZE = 12;

export default async function PromisesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const [summary, facets] = await Promise.all([promiseSummary(), promiseFacets()]);
  const orgType = facets.types.some((t) => t.org_type === sp.type) ? sp.type : undefined;
  const theme = facets.themes.some((t) => t.theme === sp.theme) ? sp.theme : undefined;
  const text = (sp.q ?? "").trim().slice(0, 100) || undefined;
  const page = Math.max(1, Number(sp.page) || 1);
  const data = await listPromiseLinks({ q: text, orgType, theme, page, size: SIZE });
  const active = !!(orgType || theme || text);
  const months = summary.median_months === null ? null : Math.round(summary.median_months);

  return (
    <div>
      <PageHeader
        crumbs={[{ href: "/", label: "Start here" }, { label: "Promises, then the same concern" }]}
        title="Promises, then the same concern again"
        description={
          <>
            <p>
              These are cases where an organisation&apos;s published response to a coroner stated an action, and a later
              coroner then raised the same or a closely related concern with it.{" "}
              <InfoTip text={GLOSSARY.after_promise} label="What does this list show?" />
            </p>
            <p className="mt-2 text-ink-2">
              It shows that the concern recurred, not why. It is not a finding that the action was not taken. Newest later
              report first.
            </p>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 mb-6">
        <StatTile value={<span className="num">{summary.n_links.toLocaleString("en-GB")}</span>} label="Links where a stated action came before the same concern was raised again" />
        <StatTile value={<span className="num">{summary.n_orgs.toLocaleString("en-GB")}</span>} label="Organisations" />
        <StatTile
          value={<span className="num">{months === null ? "–" : `${months} month${months === 1 ? "" : "s"}`}</span>}
          label="Median gap between the earlier report and the later one"
        />
      </div>

      <AutoSubmitForm className="card p-3 sm:p-4 mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_minmax(0,1.3fr)_auto] items-end">
        <label className="text-sm space-y-1 min-w-0">
          <span className="block text-muted">Organisation type</span>
          <select name="type" defaultValue={orgType ?? ""} className={fieldCls}>
            <option value="">All types</option>
            {facets.types
              .map((t) => ({ ...t, label: orgTypeLabel(t.org_type) }))
              .sort((a, b) => a.label.localeCompare(b.label, "en-GB"))
              .map((t) => (
                <option key={t.org_type} value={t.org_type}>
                  {t.label} ({t.n})
                </option>
              ))}
          </select>
        </label>
        <label className="text-sm space-y-1 min-w-0">
          <span className="block text-muted">Theme</span>
          <select name="theme" defaultValue={theme ?? ""} className={fieldCls}>
            <option value="">All themes</option>
            {facets.themes.map((t) => (
              <option key={t.theme} value={t.theme}>
                {t.theme} ({t.n})
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm space-y-1 min-w-0 sm:col-span-2 lg:col-span-1">
          <span className="block text-muted">Search hazards and quotes</span>
          <input type="search" name="q" defaultValue={text ?? ""} placeholder="For example, sepsis or discharge" className={fieldCls} />
        </label>
        <div className="flex items-center gap-3 sm:col-span-2 lg:col-span-1">
          <button type="submit" className={btnPrimary}>
            Search
          </button>
          {active && (
            <Link href="/promises" className="text-sm text-muted hover:text-accent">
              Clear
            </Link>
          )}
        </div>
      </AutoSubmitForm>

      <p className="text-sm text-muted mb-3 num">
        {active
          ? `${data.total.toLocaleString("en-GB")} of ${summary.n_links.toLocaleString("en-GB")} links match`
          : `${data.total.toLocaleString("en-GB")} links`}
      </p>

      {data.rows.length === 0 ? (
        <EmptyState title="No links match these filters">Try another organisation type or theme, or a shorter search.</EmptyState>
      ) : (
        <ul className="space-y-4 p-0" data-tour="promise-list">
          {data.rows.map((it) => (
            <PromiseCard key={it.id} it={it} />
          ))}
        </ul>
      )}

      <Pagination path="/promises" params={{ type: orgType, theme, q: text }} page={data.page} total={data.total} size={data.size} />
    </div>
  );
}
