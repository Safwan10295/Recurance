import Link from "next/link";
import { EmptyState, InfoTip, PageHeader, Section, StatTile, gapText, pct, shortTitle } from "@/components/ui";
import { getMeta } from "@/lib/queries";

export const metadata = { title: "Evaluation · Recurrence Watch" };

type SystemRow = {
  name: string;
  description: string;
  recall_at_threshold: number | null;
  recall_at_5: number | null;
  shown_pairs: number | null;
  precision: number | null;
  hits?: number;
  n?: number;
  recall_ci95?: [number, number];
};
type Miss = {
  category: "not_candidate" | "judge_rejected" | "quotes" | "judge_error";
  reason: string;
  days_apart: number;
  organisation: string;
  earlier: { title: string; slug: string; url: string };
  later: { title: string; slug: string; url: string };
  found_by_tfidf: boolean;
  found_by_embeddings: boolean;
};
type Evaluation = {
  generated_at: string;
  acknowledged: { total: number; in_scope: number; in_scope_6m: number; evaluated?: number; by_evidence: Record<string, number> };
  systems: SystemRow[];
  lost_memory: { links: number; diff_coroner: number; diff_area: number; not_cited: number; all_three: number };
  cost: { total: number; by_stage: Record<string, number>; per_chain: number | null; per_chain_analysis?: number | null; chains: number; analysis_cost?: number };
  hand_labels: { status: string; n_labelled: number };
  misses?: Miss[];
  miss_summary?: Record<string, number>;
  models?: { model: string; calls: number; input_tokens: number; output_tokens: number; reasoning_tokens: number; cost: number }[];
};

const STAGE_LABEL: Record<string, string> = {
  A: "Concern extraction (Nano)",
  B: "Promise extraction (Nano)",
  C: "Recurrence judge (Super)",
  D: "Dossiers (Ultra)",
  F: "Follow-up classification (Nano)",
  embed: "Embeddings (Qwen3)",
  dev: "Pilots, development and tests",
};
const MISS_LABEL: Record<Miss["category"], string> = {
  not_candidate: "Never reached the judge",
  judge_rejected: "The judge said it was a different hazard",
  quotes: "A quote could not be verified",
  judge_error: "No usable verdict",
};
const shortModel = (m: string) => m.replace(/^.*\//, "");
const n = (x: number) => x.toLocaleString("en-GB");

export default async function EvaluationPage() {
  const meta = await getMeta();
  const ev = meta.evaluation as unknown as Evaluation | null;
  if (!ev) return <EmptyState title="The evaluation has not been published yet" />;
  const best = Math.max(...ev.systems.map((s) => s.recall_at_threshold ?? 0));
  const misses = ev.misses ?? [];
  const groups = (["not_candidate", "judge_rejected", "quotes", "judge_error"] as const).filter((c) => misses.some((m) => m.category === c));
  const judge = ev.systems[ev.systems.length - 1];
  return (
    <div className="space-y-10">
      <PageHeader
        crumbs={[{ href: "/", label: "Start here" }, { label: "Evaluation" }]}
        title="Evaluation"
        description="Does the system find recurrences that coroners themselves recognised, and does Nemotron add anything over simple baselines? Including where it fails."
      />

      <Section title="Finding recurrences the coroners flagged" tour="eval-chart">
        <div className="card p-5 space-y-5">
          <p className="text-ink-2 text-sm max-w-3xl">
            Test set: {ev.acknowledged.in_scope_6m} pairs where a later report itself names an earlier report to the same
            organisation, at least six months apart. Blind test: the sentences naming the earlier report were removed
            before the system ran. Each system was allowed to show the same number of links ({ev.systems[0]?.shown_pairs}).
            No threshold was tuned on these pairs.
          </p>
          <div className="space-y-5">
            {ev.systems.map((s) => {
              const r = s.recall_at_threshold ?? 0;
              const ci = s.recall_ci95;
              return (
                <div key={s.name} className="space-y-1.5">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
                    <span className="font-medium">{s.name}</span>
                    <span className="num">
                      <span className="font-serif text-lg">{s.recall_at_threshold === null ? "pending" : pct(r)}</span>
                      {s.hits !== undefined && <span className="text-muted"> · {s.hits} of {s.n}</span>}
                      {ci && (
                        <span className="text-muted text-xs">
                          {" "}
                          · 95% range {pct(ci[0])} to {pct(ci[1])}
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="relative h-3 rounded-full bg-paper-2" role="img" aria-label={`${s.name}: ${pct(r)} recall`}>
                    {ci && (
                      <div
                        className="absolute top-1/2 h-0.5 -translate-y-1/2 bg-ink-2/40"
                        style={{ left: `${ci[0] * 100}%`, width: `${(ci[1] - ci[0]) * 100}%` }}
                        aria-hidden
                      />
                    )}
                    <div className={`h-full rounded-full ${r === best ? "bg-accent" : "bg-quote-bar"}`} style={{ width: `${Math.round(r * 100)}%` }} />
                  </div>
                  <p className="text-xs text-muted">{s.description}</p>
                </div>
              );
            })}
          </div>
          <p className="text-xs text-muted flex flex-wrap items-center gap-1">
            With only {judge?.n ?? ev.acknowledged.in_scope_6m} pairs the ranges overlap: the ordering is consistent, but the
            gap is not yet statistically settled.
            <InfoTip text="The 95% range is a Wilson score interval: the band of recall values consistent with this many hits out of this many pairs." />
          </p>
          <p className="text-xs text-muted">
            Precision (the share of shown links a person would accept) needs hand labels. Status: {ev.hand_labels.status}.
          </p>
        </div>
      </Section>

      {misses.length > 0 && (
        <Section title="Where it fails">
          <div className="card p-5 space-y-3">
            <p className="text-ink-2 text-sm max-w-3xl">
              The Nemotron system missed {misses.length} of the {judge?.n ?? ev.acknowledged.in_scope_6m} pairs.{" "}
              {groups.map((g, i) => (
                <span key={g}>
                  {i > 0 ? (i === groups.length - 1 ? " and " : ", ") : ""}
                  {misses.filter((m) => m.category === g).length} {MISS_LABEL[g].toLowerCase()}
                </span>
              ))}
              . Most misses happen before the judge: no pair of concerns passed the candidate filter, which caps how many
              pairs each organisation sends to the judge. Large national bodies, with hundreds of earlier reports, are hit
              hardest. When the judge did see a pair and said no, it called it a related but different hazard.
            </p>
          </div>
          {groups.map((g) => (
            <div key={g} className="space-y-2">
              <p className="eyebrow">
                {MISS_LABEL[g]} ({misses.filter((m) => m.category === g).length})
              </p>
              <ul className="card divide-y divide-rule list-none p-0">
                {misses
                  .filter((m) => m.category === g)
                  .map((m, i) => (
                    <li key={i} className="p-3.5 space-y-1 text-sm">
                      <p className="text-ink">
                        <Link href={`/reports/${m.earlier.slug}`}>{shortTitle(m.earlier.title)}</Link> →{" "}
                        <Link href={`/reports/${m.later.slug}`}>{shortTitle(m.later.title)}</Link>
                        <span className="text-muted"> · {m.organisation} · {gapText(m.days_apart)} apart</span>
                      </p>
                      <p className="text-ink-2">{m.reason}.</p>
                      {(m.found_by_tfidf || m.found_by_embeddings) && (
                        <p className="text-xs text-muted">
                          Found by {m.found_by_tfidf && m.found_by_embeddings ? "both baselines" : m.found_by_tfidf ? "the TF-IDF baseline" : "the embeddings baseline"}.
                        </p>
                      )}
                    </li>
                  ))}
              </ul>
            </div>
          ))}
        </Section>
      )}

      <Section title="Lost memory">
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
          <StatTile value={pct(ev.lost_memory.diff_coroner)} label="of shown links: the later report came from a different coroner" />
          <StatTile value={pct(ev.lost_memory.diff_area)} label="came from a different coroner area" />
          <StatTile value={pct(ev.lost_memory.not_cited)} label="did not cite the earlier report" />
          <StatTile value={pct(ev.lost_memory.all_three)} label="all three at once" />
        </div>
        <p className="text-sm text-muted">Across {n(ev.lost_memory.links)} shown links.</p>
      </Section>

      <Section title="Cost on Nebius Token Factory">
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
          <StatTile value={`$${ev.cost.total.toFixed(2)}`} label="total spend, every stage" />
          <StatTile value={ev.cost.per_chain !== null ? `$${ev.cost.per_chain.toFixed(4)}` : "–"} label={`per verified chain, every stage (${ev.cost.chains} chains)`} />
          <StatTile
            value={ev.cost.per_chain_analysis ? `$${ev.cost.per_chain_analysis.toFixed(4)}` : "–"}
            label="per chain, analysis only (extraction, embeddings, judging)"
          />
          <StatTile value={meta.site.n_reports.toLocaleString("en-GB")} label="reports analysed" />
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="card overflow-x-auto">
            <table className="w-full text-sm num">
              <thead>
                <tr className="text-left border-b border-rule text-muted">
                  <th className="p-3 font-medium">Stage</th>
                  <th className="p-3 font-medium text-right">Cost</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(ev.cost.by_stage)
                  .sort((a, b) => b[1] - a[1])
                  .map(([k, v]) => (
                    <tr key={k} className="border-b border-rule last:border-0">
                      <td className="p-3">{STAGE_LABEL[k] ?? k}</td>
                      <td className="p-3 text-right">${v.toFixed(4)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          {ev.models && (
            <div className="card overflow-x-auto">
              <table className="w-full text-sm num">
                <thead>
                  <tr className="text-left border-b border-rule text-muted">
                    <th className="p-3 font-medium">Model</th>
                    <th className="p-3 font-medium text-right">Calls</th>
                    <th className="p-3 font-medium text-right">Tokens in / out</th>
                    <th className="p-3 font-medium text-right">Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {ev.models.map((m) => (
                    <tr key={m.model} className="border-b border-rule last:border-0">
                      <td className="p-3">{shortModel(m.model)}</td>
                      <td className="p-3 text-right">{n(m.calls)}</td>
                      <td className="p-3 text-right whitespace-nowrap">
                        {(m.input_tokens / 1e6).toFixed(2)}M / {((m.output_tokens + m.reasoning_tokens) / 1e6).toFixed(2)}M
                      </td>
                      <td className="p-3 text-right">${m.cost.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <p className="text-sm text-muted">
          Routing: Nano for extraction ({meta.site.models?.nano}), Super for judging ({meta.site.models?.super}), Ultra for
          dossiers ({meta.site.models?.ultra}). <Link href="/nemotron">How Nemotron did the work →</Link>
        </p>
      </Section>

      <Section title="Other weak spots">
        <ol className="card p-5 list-decimal pl-9 space-y-1.5 text-sm text-ink-2">
          <li>The acknowledged test set is small and favours coroners who write cross-references.</li>
          <li>Many acknowledged pairs are under six months apart and sit outside the six-month rule.</li>
          <li>Precision is pending hand labels.</li>
          <li>Linking is within one organisation, so recurrences after an unknown rename are missed.</li>
        </ol>
      </Section>
      <section className="grid gap-3 sm:grid-cols-3 border-t border-rule pt-8">
        <Link href="/nemotron" className="card card-link p-4 hover:no-underline">
          <span className="block font-medium text-ink">How Nemotron did the work →</span>
          <span className="block text-sm text-muted">Models, tokens and cost for every stage.</span>
        </Link>
        <Link href="/methodology" className="card card-link p-4 hover:no-underline">
          <span className="block font-medium text-ink">Methodology →</span>
          <span className="block text-sm text-muted">How links are made, safeguards and limits.</span>
        </Link>
        <Link href="/brief" className="card card-link p-4 hover:no-underline">
          <span className="block font-medium text-ink">Try it on a report →</span>
          <span className="block text-sm text-muted">Watch the agent judge earlier warnings.</span>
        </Link>
      </section>
    </div>
  );
}
