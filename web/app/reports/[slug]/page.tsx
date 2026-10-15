import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, ConfidenceTag, PageHeader, Quote, QuotePair, RelationTag, Section, formatDate } from "@/components/ui";
import { getReport } from "@/lib/queries";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const r = await getReport(slug);
  return { title: r ? `${r.title} · Recurrence Watch` : "Report · Recurrence Watch" };
}

export default async function ReportPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!/^[A-Za-z0-9._%-]{1,250}$/.test(slug)) notFound();
  const r = await getReport(slug);
  if (!r) notFound();
  const orgName = new Map(r.orgs.map((o) => [o.id, o.name]));
  return (
    <article className="space-y-10">
      <PageHeader
        eyebrow={<>Coroner&apos;s report{r.ref ? ` · Ref ${r.ref}` : ""}</>}
        title={r.title}
        description={
          <>
            {formatDate(r.date)} · Coroner {r.coroner ?? "not stated"}
            {r.area ? ` · ${r.area}` : ""}
          </>
        }
        actions={
          <a href={r.url} target="_blank" rel="noopener noreferrer" className="rounded-md border border-rule bg-surface px-3.5 py-2 text-sm hover:no-underline">
            Original on judiciary.uk ↗
          </a>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        <div className="space-y-10 min-w-0">
          {(r.earlier.length > 0 || r.later.length > 0) && (
            <Section title="Linked reports">
              <div className="space-y-3">
                {r.earlier.map((l, i) => (
                  <div key={`e${i}`} className="card p-4 space-y-3">
                    <p className="text-sm">
                      <Badge tone="accent">Repeats an earlier warning</Badge>{" "}
                      <Link href={`/reports/${l.other_slug}`}>{l.other_title}</Link> ({formatDate(l.other_date)})
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      <RelationTag relation={l.relation} />
                      <ConfidenceTag value={l.confidence} />
                    </div>
                    <QuotePair
                      earlier={{ label: "Earlier report", text: l.earlier_quote, href: l.earlier }}
                      later={{ label: "This report", text: l.later_quote }}
                    />
                    <Link href={`/chains/${l.chain_key}`} className="text-sm">
                      Full chain: {l.hazard} →
                    </Link>
                  </div>
                ))}
                {r.later.map((l, i) => (
                  <div key={`l${i}`} className="card p-4 space-y-3">
                    <p className="text-sm">
                      <Badge tone="solid">Raised again later</Badge>{" "}
                      <Link href={`/reports/${l.other_slug}`}>{l.other_title}</Link> ({formatDate(l.other_date)})
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      <RelationTag relation={l.relation} />
                      <ConfidenceTag value={l.confidence} />
                    </div>
                    <QuotePair
                      earlier={{ label: "This report", text: l.earlier_quote }}
                      later={{ label: "Later report", text: l.later_quote, href: l.later }}
                    />
                    <Link href={`/chains/${l.chain_key}`} className="text-sm">
                      Full chain: {l.hazard} →
                    </Link>
                  </div>
                ))}
              </div>
            </Section>
          )}

          <Section title="The coroner's concerns">
            {r.concerns.length === 0 ? (
              <p className="text-ink-2 text-sm">No concerns could be extracted with a verified quote. Read the original report.</p>
            ) : (
              <ol className="space-y-4 list-none p-0">
                {r.concerns.map((c, i) => (
                  <li key={i} className="card p-4 space-y-2">
                    <p className="eyebrow">{c.hazard}</p>
                    <Quote text={c.quote} />
                  </li>
                ))}
              </ol>
            )}
          </Section>

          <Section title="Responses">
            {r.responses.length === 0 ? (
              <p className="text-ink-2 text-sm">No published response was found on judiciary.uk.</p>
            ) : (
              <div className="space-y-3">
                {r.responses.map((rs) => (
                  <div key={rs.pdf_url} className="card p-4 space-y-3">
                    <p className="text-sm">
                      <a href={rs.pdf_url} target="_blank" rel="noopener noreferrer">
                        {rs.filename} ↗
                      </a>
                      {!rs.unmatched && orgName.get(rs.org_id) && <span className="text-muted"> · {orgName.get(rs.org_id)}</span>}
                    </p>
                    {rs.promises.map((p) => (
                      <div key={p.id} className="space-y-1">
                        <p className="text-xs text-muted">Stated action{p.timescale ? ` · ${p.timescale}` : ""}</p>
                        <Quote text={p.quote} />
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </Section>
        </div>

        <aside className="space-y-4">
          <div className="card p-4 space-y-2">
            <p className="eyebrow">Sent to</p>
            <ul className="list-none p-0 space-y-1 text-sm">
              {r.orgs.map((o) => (
                <li key={o.id}>
                  <Link href={`/organisations/${o.id}`}>{o.name}</Link>
                </li>
              ))}
            </ul>
          </div>
          <div className="card p-4 space-y-2 text-sm">
            <p className="eyebrow">Check this report live</p>
            <p className="text-ink-2">Run the live analysis to see earlier warnings judged against this report.</p>
            <Link href={`/brief?url=${encodeURIComponent(r.url)}`} className="font-medium">
              Open in Check a report →
            </Link>
          </div>
        </aside>
      </div>
    </article>
  );
}
