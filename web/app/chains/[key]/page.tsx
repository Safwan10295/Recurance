import VerifiedPanel from "@/components/VerifiedPanel";
import { ArrowRight, Building2, ChevronDown, ScanSearch } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import ChainStory from "@/components/ChainStory";
import { PrintLink } from "@/components/PrintButton";
import Tabs from "@/components/Tabs";
import {
  Badge,
  Breadcrumbs,
  ConfidenceTag,
  InfoTip,
  Quote,
  QuotePair,
  RelationTag,
  ReportLink,
  StatTile,
  btnPrimary,
  btnSecondary,
  formatDate,
  gapText,
  orgTypeLabel,
  shortTitle,
  slugOf,
  year,
} from "@/components/ui";
import { GLOSSARY } from "@/lib/glossary";
import { getChain, getOrgChains } from "@/lib/queries";
import type { ChainDetail, Followup } from "@/lib/types";

export async function generateMetadata({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const { chain } = await getChain(key);
  if (!chain) return { title: "Chain · Recurrence Watch" };
  const description = `${chain.org.name}: a similar concern raised in ${chain.n_reports} coroners' reports, ${year(chain.first_date)} to ${year(chain.last_date)}, with verified quotes.`;
  return { title: `${chain.hazard} · Recurrence Watch`, description, openGraph: { title: chain.hazard, description } };
}

const FOLLOWUP_LABEL: Record<Followup["classification"], string> = {
  evidence_found: "Evidence found that the action was carried out",
  not_found: "No evidence found either way",
  contradicting: "Evidence suggests the action was not carried out as stated",
};

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

export default async function ChainPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const { chain, redirect: to } = await getChain(key);
  if (!chain && to) redirect(`/chains/${to}`);
  if (!chain) notFound();
  const byUrl = new Map(chain.reports.map((r) => [r.url, r]));
  const fuByPromise = new Map<number, Followup[]>();
  for (const f of chain.followups) fuByPromise.set(f.promise_id, [...(fuByPromise.get(f.promise_id) ?? []), f]);
  const others = (await getOrgChains(chain.org.id)).filter((c) => c.key !== chain.key).slice(0, 4);
  // Evidence grouped by the later report, in date order.
  const links = [...chain.links].sort((a, b) => (byUrl.get(a.later)?.date ?? "").localeCompare(byUrl.get(b.later)?.date ?? "") || b.confidence - a.confidence);
  const strongest = [...chain.links].sort((a, b) => b.confidence - a.confidence)[0];

  const summary = (
    <div className="space-y-7">
      <div className="card p-5 sm:p-6 space-y-2">
        {summaryText(chain).map((l, i) => (
          <p key={i} className={i === 0 ? "text-lg text-ink leading-snug" : "text-ink-2"}>
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
      <section className="space-y-4" data-tour="story">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-serif text-xl">The story, report by report</h2>
          <p className="text-xs text-muted">Spacing grows with the time between reports.</p>
        </div>
        <ChainStory chain={chain} />
      </section>
    </div>
  );

  const evidence = (
    <div className="space-y-4">
      <p className="text-sm text-muted flex flex-wrap items-center gap-1.5">
        Each row is one judged link between an earlier and a later report. Open a row to read both quotes, found word for
        word in the originals. <InfoTip text={GLOSSARY.verified} />
      </p>
      <ul className="card divide-y divide-rule list-none p-0">
        {links.map((l, i) => {
          const e = byUrl.get(l.earlier)!;
          const later = byUrl.get(l.later)!;
          return (
            <li key={i}>
              <details className="group" open={l === strongest}>
                <summary className="flex cursor-pointer list-none items-center gap-3 p-3.5 sm:px-5 [&::-webkit-details-marker]:hidden hover:bg-paper-2/60">
                  <span className="num w-[5.5rem] shrink-0 text-sm text-muted">
                    {year(e.date)} → {year(later.date)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-ink">{shortTitle(later.title)}</span>
                    <span className="block text-xs text-muted">
                      {gapText(l.days_apart)} after {shortTitle(e.title)} · {l.same_coroner ? "same coroner" : "different coroner"}
                    </span>
                  </span>
                  <span className="hidden sm:flex shrink-0 gap-1.5">
                    <RelationTag relation={l.relation} />
                    <ConfidenceTag value={l.confidence} />
                  </span>
                  <ChevronDown size={16} className="shrink-0 text-muted transition-transform group-open:rotate-180" aria-hidden />
                </summary>
                <div className="space-y-3 px-3.5 pb-5 sm:px-5">
                  <div className="flex flex-wrap gap-1.5 sm:hidden">
                    <RelationTag relation={l.relation} />
                    <ConfidenceTag value={l.confidence} />
                  </div>
                  {l.explanation && <p className="text-ink-2">{l.explanation}</p>}
                  <QuotePair
                    earlier={{ label: `${shortTitle(e.title)} · ${formatDate(e.date)}`, text: l.earlier_quote, href: e.url }}
                    later={{ label: `${shortTitle(later.title)} · ${formatDate(later.date)}`, text: l.later_quote, href: later.url }}
                  />
                  <VerifiedPanel
                    earlier={{ label: `Earlier · ${formatDate(e.date)}`, quote: l.earlier_quote, ctx: l.earlier_context, href: e.url }}
                    later={{ label: `Later · ${formatDate(later.date)}`, quote: l.later_quote, ctx: l.later_context, href: later.url }}
                  />
                  {l.promise_quote && (
                    <div className="space-y-1">
                      <p className="eyebrow">Stated action in the response to the earlier report</p>
                      <Quote text={l.promise_quote} />
                    </div>
                  )}
                  <p className="text-xs text-muted">
                    <Link href={`/reports/${slugOf(e.url)}`}>Earlier report in the app</Link> ·{" "}
                    <Link href={`/reports/${slugOf(later.url)}`}>Later report in the app</Link>
                  </p>
                </div>
              </details>
            </li>
          );
        })}
      </ul>
    </div>
  );

  const promises = (
    <div className="space-y-4">
      {chain.reports.map((r, i) => (
        <div key={r.url} className="card p-4 sm:p-5 space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <ReportLink url={r.url} title={r.title} slug={slugOf(r.url)} className="font-medium" />
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
        <li>Every quote was checked by code as an exact substring of the original text. Names of staff and family are redacted, and the deceased are named by report title only.</li>
      </ol>
      <div className="card overflow-x-auto">
        <table className="w-full text-sm num">
          <thead>
            <tr className="text-left border-b border-rule text-muted">
              <th className="p-3 font-medium">Link</th>
              <th className="p-3 font-medium">
                <span className="inline-flex items-center gap-1">Meaning <InfoTip text={GLOSSARY.scores} /></span>
              </th>
              <th className="p-3 font-medium">Wording</th>
              <th className="p-3 font-medium">Judge</th>
              <th className="p-3 font-medium">Coroner</th>
            </tr>
          </thead>
          <tbody>
            {links.map((l, i) => (
              <tr key={i} className="border-b border-rule last:border-0">
                <td className="p-3">{year(byUrl.get(l.earlier)?.date)} → {year(byUrl.get(l.later)?.date)}</td>
                <td className="p-3">{l.scores.embedding.toFixed(2)}</td>
                <td className="p-3">{l.scores.tfidf.toFixed(2)}</td>
                <td className="p-3 whitespace-nowrap">
                  {l.relation === "identical" ? "Identical" : "Closely related"} · {l.confidence.toFixed(2)}
                </td>
                <td className="p-3">{l.same_coroner ? "same" : "different"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-muted">
        Judge model: {chain.links[0]?.model}. <Link href="/how-we-know">How Nemotron did the work</Link> ·{" "}
        <Link href="/how-we-know/methodology">Full methodology</Link>.
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
        <Breadcrumbs
          items={[
            { href: "/chains", label: "Recurrence chains" },
            { href: `/organisations/${chain.org.id}`, label: chain.org.name },
            { label: orgTypeLabel(chain.org.type) },
          ]}
        />
        <h1 className="font-serif text-[1.7rem] sm:text-4xl leading-[1.15] tracking-tight max-w-4xl">{chain.hazard}</h1>
        <div className="flex flex-wrap items-center gap-1.5">
          <RelationTag relation={chain.relation} />
          <ConfidenceTag value={chain.confidence} />
          <InfoTip text={`${GLOSSARY.confidence} ${GLOSSARY.lowest_confidence}`} />
          <Badge>
            {chain.n_reports} reports · {year(chain.first_date)}–{year(chain.last_date)}
          </Badge>
          {chain.any_no_response && <Badge>No published response to an earlier report</Badge>}
          <span className="ml-auto">
            <PrintLink href={`/print/chains/${chain.key}`} />
          </span>
        </div>
      </header>
      <Tabs tabs={tabs} />

      <section className="mt-12 space-y-4 border-t border-rule pt-8">
        <h2 className="font-serif text-xl">Next</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Link href={`/brief?org=${chain.org.id}`} className="card card-link p-4 flex items-start gap-3 hover:no-underline">
            <ScanSearch size={20} className="mt-0.5 text-accent shrink-0" aria-hidden />
            <span>
              <span className="block font-medium text-ink">Check a new report to {chain.org.name}</span>
              <span className="block text-sm text-muted">The agent looks for earlier warnings like these.</span>
            </span>
          </Link>
          <Link href={`/organisations/${chain.org.id}`} className="card card-link p-4 flex items-start gap-3 hover:no-underline">
            <Building2 size={20} className="mt-0.5 text-accent shrink-0" aria-hidden />
            <span>
              <span className="block font-medium text-ink">Everything sent to {chain.org.name}</span>
              <span className="block text-sm text-muted">Reports, responses and all of its chains.</span>
            </span>
          </Link>
        </div>
        {others.length > 0 && (
          <div className="space-y-2">
            <p className="eyebrow">Other chains for {chain.org.name}</p>
            <ul className="card divide-y divide-rule list-none p-0">
              {others.map((c) => (
                <li key={c.key}>
                  <Link href={`/chains/${c.key}`} className="flex items-center justify-between gap-3 p-3.5 hover:no-underline hover:bg-paper-2/60">
                    <span className="min-w-0">
                      <span className="block text-ink truncate">{c.hazard}</span>
                      <span className="block text-xs text-muted num">
                        {c.n_reports} reports · {year(c.first_date)}–{year(c.last_date)}
                      </span>
                    </span>
                    <ArrowRight size={16} className="shrink-0 text-muted" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <Link href="/chains" className={btnSecondary}>
            All chains
          </Link>
          <Link href="/map" className={btnSecondary}>
            See it on the hazard map
          </Link>
          <Link href="/brief" className={btnPrimary}>
            Check a report
          </Link>
        </div>
      </section>

      <p className="text-xs text-muted max-w-3xl mt-10">
        This shows that a similar concern was raised again after an earlier report. It does not say why, and it is not a
        finding about any organisation or person. To report an error, see the{" "}
        <Link href="/how-we-know/methodology#corrections">corrections route</Link>.
      </p>
    </article>
  );
}
