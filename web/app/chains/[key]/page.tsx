import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import Tabs from "@/components/Tabs";
import { Badge, ConfidenceTag, Quote, QuotePair, RelationTag, StatTile, formatDate, orgTypeLabel, year } from "@/components/ui";
import { getChain } from "@/lib/queries";
import type { ChainDetail, Followup, ReportCard } from "@/lib/types";

export async function generateMetadata({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const { chain } = await getChain(key);
  return { title: chain ? `${chain.hazard} · Recurrence Watch` : "Chain · Recurrence Watch" };
}

const FOLLOWUP_LABEL: Record<Followup["classification"], string> = {
  evidence_found: "Evidence found that the action was carried out",
  not_found: "No evidence found either way",
  contradicting: "Evidence suggests the action was not carried out as stated",
};

function slugOf(url: string) {
  return url.replace(/\/$/, "").split("/").pop() ?? "";
}

function summaryText(c: ChainDetail): string[] {
  const first = c.reports[0];
  const last = c.reports[c.reports.length - 1];
  const withResp = c.reports.slice(0, -1).filter((r) => r.responses.length > 0).length;
  const promises = c.reports.reduce((n, r) => n + r.responses.reduce((m, rs) => m + rs.promises.length, 0), 0);
  const lines = [
    `${c.org.name} received ${c.n_reports} coroners' reports about this hazard between ${formatDate(first.date)} and ${formatDate(last.date)}.`,
    `They came from ${c.coroners.length} ${c.coroners.length === 1 ? "coroner" : "different coroners"}${c.areas.length > 1 ? ` in ${c.areas.length} coroner areas` : ""}. A similar concern was raised again ${c.n_reports - 1} ${c.n_reports - 1 === 1 ? "time" : "times"} after the first warning.`,
  ];
  if (c.reports.length > 1)
    lines.push(
      withResp === 0
        ? `No published response from ${c.org.name} was found for the earlier reports.`
        : `A published response was found for ${withResp} of the ${c.reports.length - 1} earlier reports, stating ${promises} specific ${promises === 1 ? "action" : "actions"}.`,
    );
  return lines;
}

function Timeline({ reports }: { reports: ReportCard[] }) {
  return (
    <ol className="flex gap-3 overflow-x-auto pb-2 list-none p-0 snap-x">
      {reports.map((r, i) => (
        <li key={r.url} className="snap-start shrink-0 w-56 card p-3 space-y-1">
          <div className="flex items-center gap-2">
            <span className={`h-2.5 w-2.5 rounded-full ${i === 0 ? "bg-accent" : "border-2 border-accent"}`} aria-hidden />
            <span className="eyebrow">{i === 0 ? "First warning" : `Raised again · ${year(r.date)}`}</span>
          </div>
          <Link href={`/reports/${slugOf(r.url)}`} className="block text-sm font-medium text-ink line-clamp-2">
            {r.title.replace(/: Prevention of future deaths? report$/i, "")}
          </Link>
          <p className="text-xs text-muted">
            {formatDate(r.date)} · {r.coroner ?? "coroner not stated"}
          </p>
          <p className="text-xs text-ink-2">{r.responses.some((x) => x.promises.length) ? "Response with stated actions" : r.responses.length ? "Response published" : "No published response found"}</p>
        </li>
      ))}
    </ol>
  );
}

export default async function ChainPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const { chain, redirect: to } = await getChain(key);
  if (!chain && to) redirect(`/chains/${to}`);
  if (!chain) notFound();
  const byUrl = new Map(chain.reports.map((r) => [r.url, r]));
  const fuByPromise = new Map<number, Followup[]>();
  for (const f of chain.followups) fuByPromise.set(f.promise_id, [...(fuByPromise.get(f.promise_id) ?? []), f]);
  const strongest = [...chain.links].sort((a, b) => b.confidence - a.confidence)[0];

  const summary = (
    <div className="space-y-6">
      <div className="card p-5 space-y-2">
        {summaryText(chain).map((l, i) => (
          <p key={i} className={i === 0 ? "text-lg text-ink" : "text-ink-2"}>
            {l}
          </p>
        ))}
      </div>
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
        <StatTile value={chain.n_reports} label="reports" />
        <StatTile value={chain.coroners.length} label={chain.coroners.length === 1 ? "coroner" : "different coroners"} />
        <StatTile value={`${year(chain.first_date)}–${year(chain.last_date)}`} label="years" />
        <StatTile value={chain.confidence.toFixed(2)} label="lowest link confidence" />
      </div>
      <section className="space-y-2">
        <h2 className="font-serif text-lg">Timeline</h2>
        <Timeline reports={chain.reports} />
      </section>
      {strongest && (
        <section className="space-y-3">
          <h2 className="font-serif text-lg">The clearest match</h2>
          <div className="card p-4 sm:p-5 space-y-3">
            <div className="flex flex-wrap gap-1.5">
              <RelationTag relation={strongest.relation} />
              <ConfidenceTag value={strongest.confidence} />
            </div>
            {strongest.explanation && <p className="text-ink-2">{strongest.explanation}</p>}
            <QuotePair
              earlier={{ label: `Earlier report, ${formatDate(byUrl.get(strongest.earlier)?.date)}`, text: strongest.earlier_quote, href: strongest.earlier }}
              later={{ label: `Later report, ${formatDate(byUrl.get(strongest.later)?.date)}`, text: strongest.later_quote, href: strongest.later }}
            />
          </div>
        </section>
      )}
    </div>
  );

  const evidence = (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        Each pair below is one judged link. Both quotes were found word for word in the original reports.
      </p>
      {chain.links.map((l, i) => {
        const e = byUrl.get(l.earlier)!;
        const later = byUrl.get(l.later)!;
        return (
          <div key={i} className="card p-4 sm:p-5 space-y-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <RelationTag relation={l.relation} />
              <ConfidenceTag value={l.confidence} />
              <span className="text-xs text-muted">
                {Math.max(1, Math.round(l.days_apart / 30.4))} months apart · {l.same_coroner ? "same coroner" : "different coroner"}
              </span>
            </div>
            {l.explanation && <p className="text-ink-2">{l.explanation}</p>}
            <QuotePair
              earlier={{ label: `${e.title.replace(/: Prevention.*$/i, "")}, ${formatDate(e.date)}`, text: l.earlier_quote, href: e.url }}
              later={{ label: `${later.title.replace(/: Prevention.*$/i, "")}, ${formatDate(later.date)}`, text: l.later_quote, href: later.url }}
            />
            {l.promise_quote && (
              <div className="space-y-1">
                <p className="eyebrow">Stated action in the response to the earlier report</p>
                <Quote text={l.promise_quote} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );

  const promises = (
    <div className="space-y-4">
      {chain.reports.map((r, i) => (
        <div key={r.url} className="card p-4 sm:p-5 space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <Link href={`/reports/${slugOf(r.url)}`} className="font-medium text-ink">
              {r.title}
            </Link>
            <span className="text-sm text-muted">{formatDate(r.date)}</span>
          </div>
          {r.responses.length === 0 ? (
            <p className="text-sm text-ink-2">
              No published response from {chain.org.name} was found for this report.
              {i === chain.reports.length - 1 && " It is the most recent report, so a response may not be due or published yet."}
            </p>
          ) : (
            r.responses.map((rs) => (
              <div key={rs.pdf_url} className="space-y-3">
                <a href={rs.pdf_url} target="_blank" rel="noopener noreferrer" className="text-sm">
                  Response: {rs.filename} ↗
                </a>
                {rs.promises.length === 0 ? (
                  <p className="text-sm text-muted">No specific action could be extracted with a verified quote.</p>
                ) : (
                  rs.promises.map((p) => (
                    <div key={p.id} className="space-y-2 border-l-2 border-rule pl-4">
                      <p className="text-sm font-medium">Stated action{p.timescale ? ` · timescale: ${p.timescale}` : ""}</p>
                      <Quote text={p.quote} />
                      {(fuByPromise.get(p.id) ?? []).map((f, k) => (
                        <div key={k} className="rounded-md bg-paper-2 p-3 text-sm space-y-2">
                          <p className="font-medium">What happened next: {FOLLOWUP_LABEL[f.classification]}</p>
                          {f.summary && <p className="text-ink-2">{f.summary}</p>}
                          {f.sources.map((s) => (
                            <Quote key={s.url} text={s.quote} href={s.url} label={s.title || s.url} />
                          ))}
                          {f.classification === "not_found" && (
                            <p className="text-xs text-muted">No evidence found does not mean the action did not happen.</p>
                          )}
                        </div>
                      ))}
                    </div>
                  ))
                )}
              </div>
            ))
          )}
        </div>
      ))}
    </div>
  );

  const how = (
    <div className="space-y-4 text-sm">
      <ol className="card p-5 list-decimal pl-9 space-y-2 text-ink-2">
        <li>Each report&apos;s concerns were extracted by Nemotron 3 Nano on Nebius Token Factory, each with a quote copied from the report.</li>
        <li>Concerns from reports to {chain.org.name} at least six months apart were compared by meaning (Qwen3 embeddings) and wording (TF-IDF).</li>
        <li>The closest pairs were judged by Nemotron 3 Super with reasoning on. Only identical or closely related, with confidence of at least 0.70, are shown.</li>
        <li>Every quote was checked by code as an exact substring of the original text. Names of staff and family are redacted.</li>
      </ol>
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left border-b border-rule">
              <th className="p-3">Link</th>
              <th className="p-3">Embedding</th>
              <th className="p-3">TF-IDF</th>
              <th className="p-3">Judge</th>
              <th className="p-3">Coroner</th>
            </tr>
          </thead>
          <tbody>
            {chain.links.map((l, i) => (
              <tr key={i} className="border-b border-rule last:border-0">
                <td className="p-3">{year(byUrl.get(l.earlier)?.date)} → {year(byUrl.get(l.later)?.date)}</td>
                <td className="p-3">{l.scores.embedding.toFixed(2)}</td>
                <td className="p-3">{l.scores.tfidf.toFixed(2)}</td>
                <td className="p-3">{l.relation.replace("_", " ")} · {l.confidence.toFixed(2)}</td>
                <td className="p-3">{l.same_coroner ? "same" : "different"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-muted">
        Judge model: {chain.links[0]?.model}. <Link href="/methodology">Full methodology</Link>.
      </p>
    </div>
  );

  const tabs = [
    { id: "summary", label: "Summary", content: summary },
    { id: "evidence", label: `Evidence (${chain.links.length})`, content: evidence },
    { id: "promises", label: "Promises and follow-up", content: promises },
    { id: "how", label: "How it was found", content: how },
  ];
  if (chain.dossier)
    tabs.push({
      id: "dossier",
      label: "Dossier",
      content: (
        <div className="card p-5 space-y-4 max-w-3xl">
          <p className="text-sm text-muted">Drafted by Nemotron 3 Ultra and reviewed by a person before publication.</p>
          <div className="prose-doc text-ink-2">
            {chain.dossier.narrative.split(/\n+/).map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
          <h3 className="font-serif text-lg">Questions a coroner might ask</h3>
          <ul className="list-disc pl-5 space-y-1 text-ink-2">
            {chain.dossier.questions.map((q, i) => (
              <li key={i}>{q}</li>
            ))}
          </ul>
        </div>
      ),
    });

  return (
    <article>
      <header className="space-y-3 pb-5 mb-2">
        <p className="eyebrow">
          <Link href="/chains">Recurrence chains</Link> ·{" "}
          <Link href={`/organisations/${chain.org.id}`}>{chain.org.name}</Link> · {orgTypeLabel(chain.org.type)}
        </p>
        <h1 className="font-serif text-2xl sm:text-3xl leading-tight max-w-4xl">{chain.hazard}</h1>
        <div className="flex flex-wrap gap-1.5">
          <RelationTag relation={chain.relation} />
          <ConfidenceTag value={chain.confidence} />
          <Badge>
            {chain.n_reports} reports · {year(chain.first_date)}–{year(chain.last_date)}
          </Badge>
        </div>
      </header>
      <Tabs tabs={tabs} />
      <p className="text-xs text-muted max-w-3xl mt-10">
        This shows that a similar concern was raised again after an earlier report. It does not say why, and it is not a
        finding about any organisation or person. To report an error, see the{" "}
        <Link href="/methodology#corrections">corrections route</Link>.
      </p>
    </article>
  );
}
