import Link from "next/link";
import { notFound } from "next/navigation";
import { ConfidenceTag, Quote, RelationTag, formatDate, orgTypeLabel } from "@/components/ui";
import { getChain, getChains } from "@/lib/data";
import type { Followup, ReportCard } from "@/lib/types";

export function generateStaticParams() {
  return getChains().map((c) => ({ key: c.key }));
}

export async function generateMetadata({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const c = getChain(key);
  return { title: c ? `${c.hazard} · Recurrence Watch` : "Chain · Recurrence Watch" };
}

const FOLLOWUP_LABEL: Record<Followup["classification"], string> = {
  evidence_found: "Evidence found that the action was carried out",
  not_found: "No evidence found either way",
  contradicting: "Evidence suggests the action was not carried out as stated",
};

function ReportHeader({ r, first }: { r: ReportCard; first: boolean }) {
  return (
    <div className="space-y-1">
      <p className="eyebrow">{first ? "First warning" : "Similar concern raised again"}</p>
      <h3 className="font-serif text-lg">
        <a href={r.url} target="_blank" rel="noopener noreferrer">
          {r.title}
        </a>
      </h3>
      <p className="text-sm text-ink-2">
        {formatDate(r.date)} · Coroner {r.coroner ?? "not stated"} · {r.area ?? "area not stated"}
        {r.ref ? ` · Ref ${r.ref}` : ""}
      </p>
    </div>
  );
}

export default async function ChainPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const chain = getChain(key);
  if (!chain) notFound();
  const fuByPromise = new Map<number, Followup[]>();
  for (const f of chain.followups) fuByPromise.set(f.promise_id, [...(fuByPromise.get(f.promise_id) ?? []), f]);

  return (
    <article className="space-y-10">
      <header className="space-y-3 max-w-3xl">
        <p className="eyebrow">
          <Link href={`/organisations/${chain.org.id}`}>{chain.org.name}</Link> · {orgTypeLabel(chain.org.type)}
        </p>
        <h1 className="font-serif text-3xl leading-tight">{chain.hazard}</h1>
        <div className="flex flex-wrap gap-2">
          <RelationTag relation={chain.relation} />
          <ConfidenceTag value={chain.confidence} />
        </div>
        <p className="text-ink-2">
          {chain.n_reports} reports from {chain.coroners.length} {chain.coroners.length === 1 ? "coroner" : "coroners"}{" "}
          between {formatDate(chain.first_date)} and {formatDate(chain.last_date)}. A similar concern was raised again
          after the earlier report{chain.reports.length > 2 ? "s" : ""}.
        </p>
      </header>

      <section aria-labelledby="timeline" className="space-y-6">
        <h2 id="timeline" className="font-serif text-2xl">
          Timeline
        </h2>
        <ol className="relative border-l border-rule ml-2 space-y-10 list-none p-0">
          {chain.reports.map((r, i) => (
            <li key={r.url} className="pl-6 relative">
              <span className="absolute -left-[7px] top-2 h-3 w-3 rounded-full bg-accent" aria-hidden />
              <div className="space-y-4">
                <ReportHeader r={r} first={i === 0} />
                {r.concerns && r.concerns.length > 0 && (
                  <div className="space-y-3">
                    {r.concerns.slice(0, 3).map((c, j) => (
                      <Quote key={j} text={c.quote} />
                    ))}
                  </div>
                )}
                <div className="space-y-3">
                  {r.responses.length === 0 ? (
                    <p className="text-sm text-ink-2 bg-paper-2 border border-rule rounded px-3 py-2">
                      No published response from {chain.org.name} was found for this report.
                    </p>
                  ) : (
                    r.responses.map((rs) => (
                      <div key={rs.pdf_url} className="bg-paper-2 border border-rule rounded px-4 py-3 space-y-3">
                        <p className="text-sm">
                          <span className="eyebrow mr-2">Response</span>
                          <a href={rs.pdf_url} target="_blank" rel="noopener noreferrer">
                            {rs.filename}
                          </a>
                        </p>
                        {rs.promises.length === 0 ? (
                          <p className="text-sm text-ink-2">No specific action could be extracted with a verified quote.</p>
                        ) : (
                          rs.promises.map((p) => (
                            <div key={p.id} className="space-y-2">
                              <p className="text-sm font-semibold">Stated action{p.timescale ? `, timescale: ${p.timescale}` : ""}</p>
                              <Quote text={p.quote} />
                              {(fuByPromise.get(p.id) ?? []).map((f, k) => (
                                <div key={k} className="ml-4 text-sm space-y-1 border-l border-rule pl-3">
                                  <p className="font-semibold">What happened after the promise: {FOLLOWUP_LABEL[f.classification]}</p>
                                  {f.summary && <p className="text-ink-2">{f.summary}</p>}
                                  {f.sources.map((s) => (
                                    <Quote key={s.url} text={s.quote} href={s.url} label={s.title || s.url} />
                                  ))}
                                  {f.classification === "not_found" && (
                                    <p className="text-muted">No evidence found does not mean the action did not happen.</p>
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
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="links" className="space-y-6">
        <h2 id="links" className="font-serif text-2xl">
          Why these reports are linked
        </h2>
        {chain.links.map((l, i) => {
          const e = chain.reports.find((r) => r.url === l.earlier)!;
          const later = chain.reports.find((r) => r.url === l.later)!;
          return (
            <div key={i} className="border border-rule rounded p-4 sm:p-5 space-y-4">
              <div className="flex flex-wrap gap-2 items-center">
                <RelationTag relation={l.relation} />
                <ConfidenceTag value={l.confidence} />
                <span className="text-sm text-muted">{Math.round(l.days_apart / 30.4)} months apart</span>
              </div>
              <p className="text-ink-2">{l.explanation}</p>
              <div className="grid gap-5 md:grid-cols-2">
                <div className="space-y-2">
                  <p className="eyebrow">Earlier report, {formatDate(e.date)}</p>
                  <Quote text={l.earlier_quote} href={e.url} />
                </div>
                <div className="space-y-2">
                  <p className="eyebrow">Later report, {formatDate(later.date)}</p>
                  <Quote text={l.later_quote} href={later.url} />
                </div>
              </div>
              {l.promise_quote && (
                <div className="space-y-2">
                  <p className="eyebrow">Stated action in the response to the earlier report</p>
                  <Quote text={l.promise_quote} />
                </div>
              )}
              <details className="text-sm text-ink-2">
                <summary className="cursor-pointer text-accent">How this was found</summary>
                <ul className="mt-2 space-y-1 list-disc pl-5">
                  <li>Candidate found by deterministic matching within the same organisation: TF-IDF cosine {l.scores.tfidf}, embedding cosine {l.scores.embedding} (Qwen3-Embedding-8B on Nebius Token Factory).</li>
                  <li>Judged by {l.model} with low-effort reasoning. The quotes above were checked as exact substrings of the source text.</li>
                  <li>{l.same_coroner ? "Same coroner" : "Different coroner"} · {l.same_area ? "same coroner area" : "different coroner area"} · {l.later_cites_earlier ? "the later report cites the earlier one" : "no citation of the earlier report found in the later report"}.</li>
                </ul>
              </details>
            </div>
          );
        })}
      </section>

      {chain.dossier && (
        <section aria-labelledby="dossier" className="space-y-4 max-w-3xl">
          <h2 id="dossier" className="font-serif text-2xl">
            Dossier
          </h2>
          <p className="text-sm text-muted">Drafted by Nemotron Ultra and reviewed by a person before publication.</p>
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
        </section>
      )}

      <p className="text-sm text-muted max-w-3xl">
        This page shows that a similar concern was raised again after a stated action. It does not say why, and it is
        not a finding about any organisation or person. Names of staff and family members are redacted. To report an
        error, see the <Link href="/methodology#corrections">corrections route</Link>.
      </p>
    </article>
  );
}
