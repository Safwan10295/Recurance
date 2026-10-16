import Link from "next/link";
import AutoForm from "@/components/AutoForm";
import { EmptyState, PageHeader, Pagination, btnPrimary, fieldCls, orgTypeLabel } from "@/components/ui";
import { listOrgs } from "@/lib/queries";

export const metadata = { title: "Organisations · Recurrence Watch" };

const TYPES = ["national_body", "nhs_trust", "police", "council", "prison", "ambulance", "commissioner", "company", "other"];

export default async function OrgsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const qv = sp.q?.trim() || undefined;
  const type = TYPES.includes(sp.type ?? "") ? sp.type : undefined;
  const withChains = sp.chains === "1";
  const page = Math.max(1, Number(sp.page) || 1);
  const data = await listOrgs({ q: qv, type, withChains, page });
  const sel = `${fieldCls} w-auto`;
  return (
    <div>
      <PageHeader
        crumbs={[{ href: "/", label: "Start here" }, { label: "Organisations" }]}
        title="Organisations"
        description="Every organisation that received a report. Each profile shows its reports, its published responses and stated actions, and any recurrence chains. There is no ranking: more reports often reflects size and range of services, not performance."
      />
      <AutoForm className="flex flex-wrap items-end gap-3 mb-5">
        <label className="text-sm space-y-1">
          <span className="block text-muted">Name</span>
          <input name="q" defaultValue={qv} placeholder="e.g. National Highways" className={`${fieldCls} w-64 max-w-full`} />
        </label>
        <label className="text-sm space-y-1">
          <span className="block text-muted">Type</span>
          <select name="type" defaultValue={type ?? ""} className={sel}>
            <option value="">All</option>
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {orgTypeLabel(t)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm pb-1.5">
          <input type="checkbox" name="chains" value="1" defaultChecked={withChains} /> Only with chains
        </label>
        <button className={btnPrimary}>Apply</button>
      </AutoForm>
      {data.rows.length === 0 ? (
        <EmptyState title="No organisations match" />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm num">
            <thead>
              <tr className="text-left border-b border-rule text-muted">
                <th className="p-3">Organisation</th>
                <th className="p-3">Type</th>
                <th className="p-3 text-right">Reports</th>
                <th className="p-3 text-right">Chains</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((o) => (
                <tr key={o.id} className="border-b border-rule last:border-0">
                  <td className="p-3">
                    <Link href={`/organisations/${o.id}`}>{o.name}</Link>
                  </td>
                  <td className="p-3 text-ink-2">{orgTypeLabel(o.type)}</td>
                  <td className="p-3 text-right">{o.n_reports}</td>
                  <td className="p-3 text-right">{o.n_chains || "–"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pagination path="/organisations" params={{ q: qv, type, chains: withChains ? "1" : undefined }} page={data.page} total={data.total} size={data.size} />
    </div>
  );
}
