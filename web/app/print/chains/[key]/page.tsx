import { notFound, redirect } from "next/navigation";
import {
  DocFooter,
  DocHeader,
  DocQuote,
  DocSection,
  Ext,
  FollowupItem,
  siteBase,
  Toolbar,
} from "@/components/print/PrintDoc";
import { RELATION_LABEL, confidenceWord, formatDate, shortTitle } from "@/components/ui";
import { getChain } from "@/lib/queries";
import type { Link as ChainLink, Promise_, ReportCard } from "@/lib/types";

export async function generateMetadata({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const { chain } = await getChain(key);
  return { title: chain ? `Pre-inquest brief: ${chain.hazard} · Recurrence Watch` : "Pre-inquest brief · Recurrence Watch" };
}

const MAX_PROMISES = 3;

type PromiseRow = { p: Promise_; pdf: string; report: ReportCard };

const byConfidence = (a: ChainLink, b: ChainLink) => b.confidence - a.confidence;

export default async function PrintChainPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const { chain, redirect: to } = await getChain(key);
  if (!chain && to) redirect(`/print/chains/${to}`);
  if (!chain) notFound();

  const address = `${await siteBase()}/chains/${chain.key}`;
  const reports = [...chain.reports].sort((a, b) => a.date.localeCompare(b.date));
  const byUrl = new Map(reports.map((r) => [r.url, r]));
  const first = reports[0];
  const later = reports.slice(1);
  const earlierReports = reports.slice(0, -1);

  // The first report's concern: the quote used in its strongest link, else a stored concern.
  const firstLink = chain.links.filter((l) => l.earlier === first?.url).sort(byConfidence)[0];
  const firstQuote = firstLink?.earlier_quote ?? first?.concerns?.[0]?.quote ?? null;

  // Stated actions in responses to the earlier reports. Those with a web check or used in a link come first.
  const followed = new Set(chain.followups.map((f) => f.promise_id));
  const linked = new Set(chain.links.map((l) => l.promise_quote).filter(Boolean));
  const allPromises: PromiseRow[] = earlierReports.flatMap((r) =>
    r.responses.flatMap((rs) => rs.promises.map((p) => ({ p, pdf: rs.pdf_url, report: r }))),
  );
  const rank = (x: PromiseRow) => (followed.has(x.p.id) ? 0 : linked.has(x.p.quote) ? 1 : 2);
  const shown = allPromises
    .map((x, i) => ({ x, i }))
    .sort((a, b) => rank(a.x) - rank(b.x) || a.i - b.i)
    .slice(0, MAX_PROMISES)
    .sort((a, b) => a.i - b.i)
    .map(({ x }) => x);
  const shownNo = new Map(shown.map((x, i) => [x.p.id, i + 1]));
  const promiseById = new Map(allPromises.map((x) => [x.p.id, x]));
  const withResponse = earlierReports.filter((r) => r.responses.length > 0).length;

  // Each later report, with its strongest link.
  const laterRows = later.map((r) => ({ r, link: chain.links.filter((l) => l.later === r.url).sort(byConfidence)[0] }));
  const strongest = [...chain.links].sort(byConfidence)[0];
  const sE = strongest ? byUrl.get(strongest.earlier) : undefined;
  const sL = strongest ? byUrl.get(strongest.later) : undefined;

  // Web checks, in the order the stated actions are listed.
  const followups = [...chain.followups].sort(
    (a, b) => (shownNo.get(a.promise_id) ?? 99) - (shownNo.get(b.promise_id) ?? 99),
  );

  return (
    <main id="main">
      <Toolbar back={{ href: `/chains/${chain.key}`, label: "Back to the chain" }} />
      <article className="pb-paper">
        <DocHeader subject={chain.hazard} organisation={chain.org.name} address={address} />

        {first && (
          <DocSection title="The earlier warning">
            <p>
              <span className="pb-label">{shortTitle(first.title)}</span> · {formatDate(first.date)} ·{" "}
              {first.coroner ?? "coroner not stated"}
              {first.area ? `, ${first.area}` : ""}
            </p>
            {firstQuote && <DocQuote text={firstQuote} />}
            <p className="pb-small">
              <Ext href={first.url} />
            </p>
          </DocSection>
        )}

        <DocSection title="What was promised">
          {shown.length === 0 ? (
            <p className="pb-muted">
              {withResponse === 0
                ? `No published response from ${chain.org.name} was found for the earlier reports.`
                : "A published response was found, but no specific action could be extracted with a verified quote."}
            </p>
          ) : (
            <>
              {shown.map((x, i) => (
                <div key={x.p.id} className="pb-item">
                  <p>
                    <span className="pb-label">Stated action {i + 1}</span>{" "}
                    <span className="pb-muted">
                      · response to {shortTitle(x.report.title)} ({formatDate(x.report.date)}) · stated timescale:{" "}
                      {x.p.timescale ?? "none stated"}
                    </span>
                  </p>
                  <DocQuote text={x.p.quote} />
                  <p className="pb-small">
                    <Ext href={x.pdf} />
                  </p>
                </div>
              ))}
              {allPromises.length > shown.length && (
                <p className="pb-small pb-muted">
                  {allPromises.length - shown.length} further stated{" "}
                  {allPromises.length - shown.length === 1 ? "action is" : "actions are"} listed on the full chain page.
                </p>
              )}
            </>
          )}
        </DocSection>

        {later.length > 0 && (
          <DocSection title="What recurred">
            <ul className="pb-list">
              {laterRows.map(({ r, link }) => (
                <li key={r.url}>
                  <span className="pb-num">{formatDate(r.date)}</span> · <span className="pb-label">{shortTitle(r.title)}</span> ·{" "}
                  {r.coroner ?? "coroner not stated"}
                  {link && (
                    <span className="pb-muted">
                      {" "}
                      · {RELATION_LABEL[link.relation]} · confidence {link.confidence.toFixed(2)} ({confidenceWord(link.confidence)})
                    </span>
                  )}
                </li>
              ))}
            </ul>
            {strongest && sE && sL && (
              <div className="pb-item" style={{ marginTop: 8 }}>
                <p className="pb-small pb-muted">The clearest link, quoted from both reports:</p>
                <div className="pb-pair">
                  <div>
                    <p className="pb-eyebrow">
                      Earlier · {shortTitle(sE.title)} · {formatDate(sE.date)}
                    </p>
                    <DocQuote text={strongest.earlier_quote} />
                  </div>
                  <div>
                    <p className="pb-eyebrow">
                      Later · {shortTitle(sL.title)} · {formatDate(sL.date)}
                    </p>
                    <DocQuote text={strongest.later_quote} />
                  </div>
                </div>
              </div>
            )}
          </DocSection>
        )}

        <DocSection title="What happened next">
          {followups.length === 0 ? (
            <p className="pb-muted">No web check of the stated actions has been published for this chain.</p>
          ) : (
            followups.map((f, i) => {
              const n = shownNo.get(f.promise_id);
              const row = promiseById.get(f.promise_id);
              return (
                <FollowupItem
                  key={i}
                  classification={f.classification}
                  summary={f.summary}
                  sources={f.sources}
                  action={
                    n ? (
                      `stated action ${n}`
                    ) : row ? (
                      <>
                        stated action: &ldquo;{row.p.quote}&rdquo;
                      </>
                    ) : (
                      "a stated action in a response"
                    )
                  }
                />
              );
            })
          )}
        </DocSection>

        <DocFooter />
      </article>
    </main>
  );
}
