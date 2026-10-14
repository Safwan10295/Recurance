import Link from "next/link";
import { notFound } from "next/navigation";
import { Quote, formatDate, orgTypeLabel } from "@/components/ui";
import { getChains, getOrg, getOrgs } from "@/lib/data";

export function generateStaticParams() {
  return getOrgs().map((o) => ({ id: String(o.id) }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const o = getOrg(id);
  return { title: o ? `${o.name} · Recurrence Watch` : "Organisation · Recurrence Watch" };
}

export default async function OrgPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const org = getOrg(id);
  if (!org) notFound();
  const chains = getChains().filter((c) => org.chains.includes(c.key));
  const withResponse = org.reports.filter((r) => r.responses.length > 0).length;
  return (
    <article className="space-y-10">
      <header className="space-y-2 max-w-3xl">
        <p className="eyebrow">{orgTypeLabel(org.type)}</p>
        <h1 className="font-serif text-3xl">{org.name}</h1>
        <p className="text-ink-2">
          {org.n_reports} reports received. A published response was found for {withResponse} of them.
        </p>
      </header>

      {chains.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-serif text-2xl">Chains</h2>
          <ul className="list-none p-0 space-y-2">
            {chains.map((c) => (
              <li key={c.key}>
                <Link href={`/chains/${c.key}`}>{c.hazard}</Link>{" "}
                <span className="text-sm text-muted">
                  {c.n_reports} reports, {c.first_date.slice(0, 4)}–{c.last_date.slice(0, 4)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-4">
        <h2 className="font-serif text-2xl">Reports and responses</h2>
        <ol className="list-none p-0 divide-y divide-rule border-y border-rule">
          {org.reports
            .slice()
            .reverse()
            .map((r) => (
              <li key={r.url} className="py-4 space-y-2">
                <a href={r.url} target="_blank" rel="noopener noreferrer" className="font-serif">
                  {r.title}
                </a>
                <p className="text-sm text-ink-2">
                  {formatDate(r.date)} · Coroner {r.coroner ?? "not stated"} · {r.area ?? ""}
                </p>
                {r.responses.length === 0 ? (
                  <p className="text-sm text-muted">No published response found.</p>
                ) : (
                  r.responses.map((rs) => (
                    <div key={rs.pdf_url} className="space-y-2">
                      <a className="text-sm" href={rs.pdf_url} target="_blank" rel="noopener noreferrer">
                        Response: {rs.filename}
                      </a>
                      {rs.promises.slice(0, 3).map((p) => (
                        <Quote key={p.id} text={p.quote} />
                      ))}
                    </div>
                  ))
                )}
              </li>
            ))}
        </ol>
      </section>
    </article>
  );
}
