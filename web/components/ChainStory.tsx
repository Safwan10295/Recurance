import { CircleDot, FileCheck2, FileQuestion, Repeat2, SearchCheck } from "lucide-react";
import Reveal from "@/components/motion/Reveal";
import Link from "next/link";
import { ConfidenceTag, InfoTip, Quote, RelationTag, ReportLink, formatDate, gapText, slugOf } from "./ui";
import { GLOSSARY } from "@/lib/glossary";
import type { ChainDetail, Followup, Link as LinkT } from "@/lib/types";

const FOLLOWUP: Record<Followup["classification"], { label: string; tone: string }> = {
  evidence_found: { label: "Evidence found that the action was carried out", tone: "text-accent" },
  not_found: { label: "No evidence found either way", tone: "text-muted" },
  contradicting: { label: "Evidence suggests the action was not carried out as stated", tone: "text-sand" },
};

// Connector height grows with the time between reports (log scale), so long gaps look long.
function gapHeight(days: number) {
  return Math.round(Math.min(120, Math.max(28, 22 * Math.log2(1 + days / 60))));
}

const STOP = new Set(
  "about after again also among and any are been before being both but can could did does each from had has have into its may more most must not now only other our out over same should some such than that the their them then there these they this those through under upon very was were what when where which while who will with would your name redacted deceased".split(" "),
);
// A9, the quote bridge: words of four letters or more that both quotes use, in the later quote's order.
function sharedWords(earlier: string, later: string, max = 6): string[] {
  const norm = (w: string) => w.toLowerCase().replace(/[^a-z0-9]/g, "");
  const a = new Set(earlier.split(/\s+/).map(norm).filter((w) => w.length >= 4 && !STOP.has(w)));
  const out: string[] = [];
  for (const w of later.split(/\s+/)) {
    const n = norm(w);
    if (n.length >= 4 && !STOP.has(n) && a.has(n) && !out.some((x) => norm(x) === n)) out.push(w.replace(/[^\w'-]/g, ""));
    if (out.length >= max) break;
  }
  return out;
}

// The chain as a story, top to bottom: first warning, the response and what it said it would do,
// what the web search found, then each time the concern was raised again.
export default function ChainStory({ chain }: { chain: ChainDetail }) {
  const fu = new Map<number, Followup[]>();
  for (const f of chain.followups) fu.set(f.promise_id, [...(fu.get(f.promise_id) ?? []), f]);
  // The strongest link arriving at each report...
  const into = new Map<string, LinkT>();
  for (const l of chain.links) {
    const cur = into.get(l.later);
    if (!cur || l.confidence > cur.confidence) into.set(l.later, l);
  }
  // ...and the strongest leaving each report, for reports that only appear as the earlier side of a link.
  const outOf = new Map<string, LinkT>();
  for (const l of chain.links) {
    const cur = outOf.get(l.earlier);
    if (!cur || l.confidence > cur.confidence) outOf.set(l.earlier, l);
  }
  const date = new Map(chain.reports.map((r) => [r.url, r.date]));

  return (
    <ol className="relative list-none p-0">
      {chain.reports.map((r, i) => {
        const last = i === chain.reports.length - 1;
        const inLink = into.get(r.url);
        const quote = (i > 0 ? inLink?.later_quote : undefined) ?? outOf.get(r.url)?.earlier_quote;
        const ctx = (i > 0 && inLink?.later_quote ? inLink.later_context : outOf.get(r.url)?.earlier_context) ?? null;
        const prevDate = i > 0 ? chain.reports[i - 1].date : null;
        const days = prevDate ? Math.round((Date.parse(r.date) - Date.parse(prevDate)) / 86400000) : 0;
        const promises = r.responses.flatMap((rs) => rs.promises.map((p) => ({ ...p, pdf: rs.pdf_url })));
        return (
          <li key={r.url} id={`report-${i + 1}`} className="relative scroll-mt-24">
            <Reveal id={`story-${i}`}>
            {i > 0 && (
              <div className="flex items-center gap-3 pl-[13px]" style={{ height: gapHeight(days) }} aria-hidden={false}>
                {/* The gap draws downwards; a longer gap takes longer, so long silences read as long. */}
                <span
                  className="m-growy h-full w-px border-l-2 border-dashed border-rule"
                  style={{ "--dur": `${Math.round(250 + gapHeight(days) * 7)}ms` } as React.CSSProperties}
                  aria-hidden
                />
                <span className="m-fade text-xs text-muted num" style={{ "--d": "200ms" } as React.CSSProperties}>
                  {gapText(days)} later
                </span>
              </div>
            )}
            <div className="m-rise flex gap-4" style={{ "--d": i > 0 ? `${Math.round(200 + gapHeight(days) * 7)}ms` : "0ms" } as React.CSSProperties}>
              <div className="flex flex-col items-center">
                <span
                  className={`relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                    i === 0 ? "bg-accent text-accent-ink" : "border-2 border-accent bg-surface text-accent"
                  }`}
                  aria-hidden
                >
                  {i === 0 ? <CircleDot size={14} /> : <Repeat2 size={14} />}
                </span>
                {!last && <span className="w-px flex-1 bg-rule" aria-hidden />}
              </div>
              <div className="min-w-0 flex-1 pb-6 space-y-3">
                <div className="space-y-1">
                  <p className="eyebrow text-accent">
                    {i === 0 ? "First warning" : `Raised again · ${i === 1 ? "1st" : i === 2 ? "2nd" : i === 3 ? "3rd" : `${i}th`} time`}
                  </p>
                  <h3 className="text-base font-medium leading-snug">
                    <ReportLink url={r.url} title={r.title} slug={slugOf(r.url)} />
                  </h3>
                  <p className="text-sm text-muted">
                    {formatDate(r.date)} · {r.coroner ?? "coroner not stated"}
                    {r.area ? ` · ${r.area}` : ""}
                  </p>
                </div>
                {inLink && i > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <RelationTag relation={inLink.relation} />
                    <ConfidenceTag value={inLink.confidence} />
                    {!inLink.same_coroner && <span className="text-xs text-muted">a different coroner</span>}
                  </div>
                )}
                {quote && <Quote text={quote} href={r.url} ctx={ctx} />}
                {i > 0 && inLink?.later_quote && (() => {
                  const words = sharedWords(inLink.earlier_quote, inLink.later_quote);
                  if (words.length < 2) return null;
                  return (
                    <p className="flex flex-wrap items-center gap-1.5 pl-4 text-xs text-muted">
                      <span>Repeated from the earlier report:</span>
                      {words.map((w, k) => (
                        <span
                          key={w}
                          className="m-rise rounded-full bg-accent-soft px-2 py-0.5 text-accent"
                          style={{ "--d": `${Math.round(500 + gapHeight(days) * 7 + k * 90)}ms` } as React.CSSProperties}
                        >
                          {w}
                        </span>
                      ))}
                    </p>
                  );
                })()}

                {/* The organisation's response to this report */}
                {!last || r.responses.length ? (
                  <div className="rounded-lg border border-rule bg-paper-2/60 p-3.5 space-y-3">
                    {r.responses.length === 0 ? (
                      <p className="flex items-start gap-2 text-sm text-ink-2">
                        <FileQuestion size={16} className="mt-0.5 shrink-0 text-muted" aria-hidden />
                        <span>
                          No published response from {chain.org.name} was found for this report.{" "}
                          <InfoTip text={GLOSSARY.no_response} />
                        </span>
                      </p>
                    ) : (
                      <>
                        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-2">
                          <FileCheck2 size={16} className="shrink-0 text-accent" aria-hidden />
                          <span>
                            {chain.org.name} responded
                            {promises.length ? `, stating ${promises.length} specific ${promises.length === 1 ? "action" : "actions"}` : ""}.
                          </span>
                          {r.responses.map((rs) => (
                            <a key={rs.pdf_url} href={rs.pdf_url} target="_blank" rel="noopener noreferrer" className="text-xs">
                              Response (PDF) ↗
                            </a>
                          ))}
                        </p>
                        {promises.slice(0, 2).map((p) => (
                          <div key={p.id} className="space-y-2 pl-6">
                            <Quote text={p.quote} />
                            {p.timescale && <p className="text-xs text-muted pl-4">Stated timescale: {p.timescale}</p>}
                            {(fu.get(p.id) ?? []).map((f, k) => (
                              <div key={k} className="ml-4 flex items-start gap-2 text-sm">
                                <SearchCheck size={15} className={`mt-0.5 shrink-0 ${FOLLOWUP[f.classification].tone}`} aria-hidden />
                                <div className="space-y-1">
                                  <p className={FOLLOWUP[f.classification].tone}>Web search (Tavily): {FOLLOWUP[f.classification].label}</p>
                                  {f.sources.slice(0, 1).map((s) => (
                                    <a key={s.url} href={s.url} target="_blank" rel="noopener noreferrer" className="block text-xs">
                                      {s.title || s.url} ↗
                                    </a>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        ))}
                        {promises.length > 2 && (
                          <p className="pl-6 text-xs text-muted">
                            {promises.length - 2} more stated {promises.length - 2 === 1 ? "action" : "actions"} in the Promises tab.
                          </p>
                        )}
                      </>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-muted">The most recent report. A response may not be due or published yet.</p>
                )}
              </div>
            </div>
            </Reveal>
          </li>
        );
      })}
      {chain.reports.length > 1 && date.size > 1 && (
        <li className="pl-11 text-xs text-muted">
          <Link href={`/organisations/${chain.org.id}`}>All reports to {chain.org.name}</Link>
        </li>
      )}
    </ol>
  );
}
