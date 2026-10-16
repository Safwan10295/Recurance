import { ArrowRight, Building2, ExternalLink, FileText, Link2, ScanSearch } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, ConfidenceTag, PageHeader, Quote, QuotePair, RelationTag, Section, btnPrimary, btnSecondary, formatDate, gapText, shortTitle } from "@/components/ui";
import { getReport } from "@/lib/queries";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const r = await getReport(slug);
  return { title: r ? `${shortTitle(r.title)} · Recurrence Watch` : "Report · Recurrence Watch" };
}

export default async function ReportPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!/^[A-Za-z0-9._%-]{1,250}$/.test(slug)) notFound();
  const r = await getReport(slug);
  if (!r) notFound();
  const orgName = new Map(r.orgs.map((o) => [o.id, o.name]));
  const linked = r.earlier.length + r.later.length;
  return (
    <article className="space-y-10">
      <PageHeader
        crumbs={[
          { href: "/", label: "Start here" },
          ...(r.orgs[0] ? [{ href: `/organisations/${r.orgs[0].id}`, label: r.orgs[0].name }] : []),
          { label: `Coroner's report${r.ref ? ` ${r.ref}` : ""}` },
        ]}
        title={shortTitle(r.title)}
        description={
          <>
            {formatDate(r.date)} · Coroner {r.coroner ?? "not stated"}
            {r.area ? ` · ${r.area}` : ""}
          </>
        }
        actions={
          <>
            <Link href={`/brief?report=${encodeURIComponent(r.slug)}&run=1`} className={btnPrimary}>
              <ScanSearch size={16} aria-hidden /> Check this report
            </Link>
            <a href={r.url} target="_blank" rel="noopener noreferrer" className={btnSecondary}>
              Original <ExternalLink size={14} aria-hidden />
            </a>
          </>
        }
      />

      {linked > 0 && (
        <div className="card flex flex-wrap items-center gap-3 border-l-4 border-l-accent p-4">
          <Link2 size={18} className="text-accent shrink-0" aria-hidden />
          <p className="text-ink-2">
            {r.earlier.length > 0 && (
              <>
                This report repeats {r.earlier.length} earlier {r.earlier.length === 1 ? "warning" : "warnings"}
                {r.later.length > 0 ? ", and " : "."}
              </>
            )}
            {r.later.length > 0 && (
              <>
                {r.earlier.length === 0 ? "A similar concern from this report was " : "was "}raised again {r.later.length}{" "}
                {r.later.length === 1 ? "time" : "times"} later.
              </>
            )}{" "}
            <a href="#linked">See the linked reports</a>.
          </p>
        </div>
      )}

      <div className="grid gap-8 lg:grid-cols-[1fr_280px]">
        <div className="space-y-10 min-w-0">
          <Section title="The coroner's concerns">
            {r.concerns.length === 0 ? (
              <p className="text-ink-2 text-sm">No concerns could be extracted with a verified quote. Read the original report.</p>
            ) : (
              <ol className="space-y-3 list-none p-0">
                {r.concerns.map((c, i) => (
                  <li key={i} className="card p-4 space-y-2">
                    <p className="eyebrow">
                      {i + 1}. {c.hazard}
                    </p>
                    <Quote text={c.quote} />
                  </li>
                ))}
              </ol>
            )}
          </Section>

          {linked > 0 && (
            <section id="linked" className="space-y-3 scroll-mt-24">
              <h2 className="font-serif text-xl">Linked reports</h2>
              <div className="space-y-3">
                {r.earlier.map((l, i) => (
                  <div key={`e${i}`} className="card p-4 sm:p-5 space-y-3">
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <Badge tone="accent">Repeats an earlier warning</Badge>
                      <Link href={`/reports/${l.other_slug}`} className="font-medium">
                        {shortTitle(l.other_title)}
                      </Link>
                      <span className="text-muted">
                        {formatDate(l.other_date)} · {gapText(l.days_apart)} earlier
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <RelationTag relation={l.relation} />
                      <ConfidenceTag value={l.confidence} />
                    </div>
                    <QuotePair
                      earlier={{ label: "Earlier report", text: l.earlier_quote, href: l.earlier }}
                      later={{ label: "This report", text: l.later_quote }}
                    />
                    <Link href={`/chains/${l.chain_key}`} className="inline-flex items-center gap-1.5 text-sm">
                      Full chain: {l.hazard} <ArrowRight size={14} aria-hidden />
                    </Link>
                  </div>
                ))}
                {r.later.map((l, i) => (
                  <div key={`l${i}`} className="card p-4 sm:p-5 space-y-3">
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <Badge tone="solid">Raised again later</Badge>
                      <Link href={`/reports/${l.other_slug}`} className="font-medium">
                        {shortTitle(l.other_title)}
                      </Link>
                      <span className="text-muted">
                        {formatDate(l.other_date)} · {gapText(l.days_apart)} later
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <RelationTag relation={l.relation} />
                      <ConfidenceTag value={l.confidence} />
                    </div>
                    <QuotePair
                      earlier={{ label: "This report", text: l.earlier_quote }}
                      later={{ label: "Later report", text: l.later_quote, href: l.later }}
                    />
                    <Link href={`/chains/${l.chain_key}`} className="inline-flex items-center gap-1.5 text-sm">
                      Full chain: {l.hazard} <ArrowRight size={14} aria-hidden />
                    </Link>
                  </div>
                ))}
              </div>
            </section>
          )}

          <Section title="Responses">
            {r.responses.length === 0 ? (
              <p className="text-ink-2 text-sm">No published response was found on judiciary.uk.</p>
            ) : (
              <div className="space-y-3">
                {r.responses.map((rs) => (
                  <div key={rs.pdf_url} className="card p-4 space-y-3">
                    <p className="flex flex-wrap items-center gap-x-2 text-sm">
                      <FileText size={15} className="text-muted" aria-hidden />
                      <a href={rs.pdf_url} target="_blank" rel="noopener noreferrer">
                        {rs.filename} ↗
                      </a>
                      {!rs.unmatched && orgName.get(rs.org_id) && <span className="text-muted">· {orgName.get(rs.org_id)}</span>}
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

        <aside className="space-y-4 lg:sticky lg:top-24 h-fit">
          <div className="card p-4 space-y-2">
            <p className="eyebrow">Sent to</p>
            <ul className="list-none p-0 space-y-1.5 text-sm">
              {r.orgs.map((o) => (
                <li key={o.id} className="flex items-start gap-2">
                  <Building2 size={14} className="mt-1 text-muted shrink-0" aria-hidden />
                  <Link href={`/organisations/${o.id}`}>{o.name}</Link>
                </li>
              ))}
            </ul>
          </div>
          <div className="card p-4 space-y-2 text-sm">
            <p className="eyebrow">Check this report live</p>
            <p className="text-ink-2">Watch the agent search earlier warnings to the same organisation and judge each one.</p>
            <Link href={`/brief?report=${encodeURIComponent(r.slug)}&run=1`} className="inline-flex items-center gap-1.5 font-medium">
              Run the agent <ArrowRight size={14} aria-hidden />
            </Link>
          </div>
        </aside>
      </div>
    </article>
  );
}
