import { RecentCard } from "@/components/cards";
import AutoForm from "@/components/AutoForm";
import { EmptyState, PageHeader, Pagination, btnPrimary, fieldCls, orgTypeLabel } from "@/components/ui";
import { listRecent } from "@/lib/queries";

export const metadata = { title: "Recent repeats · Recurance" };

const TYPES = ["nhs_trust", "national_body", "police", "council", "prison", "ambulance", "commissioner", "company", "other"];

export default async function RecentPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const months = [3, 6, 12, 24].includes(Number(sp.months)) ? Number(sp.months) : 12;
  const orgType = TYPES.includes(sp.type ?? "") ? sp.type : undefined;
  const page = Math.max(1, Number(sp.page) || 1);
  const data = await listRecent({ months, orgType, page });
  const sel = `${fieldCls} w-auto`;
  return (
    <div>
      <PageHeader
        crumbs={[{ href: "/", label: "Start here" }, { label: "Recent repeats" }]}
        title="Recent repeats"
        description={
          <>
            New coroners&apos; reports that raise a concern already raised with the same organisation. Newest first. Each
            match was judged identical or closely related, and both quotes were checked word for word.
          </>
        }
      />
      <AutoForm className="flex flex-wrap items-end gap-3 mb-5">
        <label className="text-sm space-y-1">
          <span className="block text-muted">Reports from the last</span>
          <select name="months" defaultValue={String(months)} className={sel}>
            <option value="3">3 months</option>
            <option value="6">6 months</option>
            <option value="12">12 months</option>
            <option value="24">2 years</option>
          </select>
        </label>
        <label className="text-sm space-y-1">
          <span className="block text-muted">Organisation type</span>
          <select name="type" defaultValue={orgType ?? ""} className={sel}>
            <option value="">All</option>
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {orgTypeLabel(t)}
              </option>
            ))}
          </select>
        </label>
        <noscript>
          <button className={btnPrimary}>Apply</button>
        </noscript>
        <span className="text-sm text-muted ml-auto num">{data.total} reports</span>
      </AutoForm>
      {data.rows.length === 0 ? (
        <EmptyState title="No recurrences in this period">Try a longer period or another organisation type.</EmptyState>
      ) : (
        <ul className="space-y-3 p-0">
          {data.rows.map((it) => (
            <RecentCard key={it.later.url + it.org.id} it={it} />
          ))}
        </ul>
      )}
      <Pagination path="/recent" params={{ months: String(months), type: orgType }} page={data.page} total={data.total} size={data.size} />
    </div>
  );
}
