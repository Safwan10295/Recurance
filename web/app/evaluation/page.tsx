import Link from "next/link";
import { EmptyState, PageHeader, Section, StatTile, pct } from "@/components/ui";
import { getMeta } from "@/lib/queries";

export const metadata = { title: "Evaluation · Recurrence Watch" };

type SystemRow = {
  name: string;
  description: string;
  recall_at_threshold: number | null;
  recall_at_5: number | null;
  shown_pairs: number | null;
  precision: number | null;
};
type Evaluation = {
  generated_at: string;
  acknowledged: { total: number; in_scope: number; in_scope_6m: number; evaluated?: number; by_evidence: Record<string, number> };
  systems: SystemRow[];
  lost_memory: { links: number; diff_coroner: number; diff_area: number; not_cited: number; all_three: number };
  cost: { total: number; by_stage: Record<string, number>; per_chain: number | null; chains: number; analysis_cost?: number };
  hand_labels: { status: string; n_labelled: number };
};

const STAGE_LABEL: Record<string, string> = {
  A: "Concern extraction (Nano)",
  B: "Promise extraction (Nano)",
  C: "Recurrence judge (Super)",
  D: "Dossiers (Ultra)",
  F: "Follow-up classification (Nano)",
  embed: "Embeddings (Qwen3)",
  dev: "Pilots and development",
};

export default async function EvaluationPage() {
  const meta = await getMeta();
  const ev = meta.evaluation as unknown as Evaluation | null;
  if (!ev) return <EmptyState title="The evaluation has not been published yet" />;
  const best = Math.max(...ev.systems.map((s) => s.recall_at_threshold ?? 0));
  return (
    <div className="space-y-10">
      <PageHeader
        crumbs={[{ href: "/", label: "Start here" }, { label: "Evaluation" }]}
        title="Evaluation"
        description="Does the system find recurrences that coroners themselves recognised, and does Nemotron add anything over simple baselines?"
      />

      <Section title="Finding recurrences the coroners flagged" tour="eval-chart">
        <div className="card p-5 space-y-5">
          <p className="text-ink-2 text-sm max-w-3xl">
            Test set: {ev.acknowledged.in_scope_6m} pairs where a later report itself names an earlier report to the same
            organisation, at least six months apart. Blind test: the sentences naming the earlier report were removed
            before the system ran. Each system was allowed to show the same number of links ({ev.systems[0]?.shown_pairs}).
          </p>
          <div className="space-y-4">
            {ev.systems.map((s) => {
              const r = s.recall_at_threshold ?? 0;
              return (
                <div key={s.name} className="space-y-1.5">
                  <div className="flex justify-between gap-3 text-sm">
                    <span className="font-medium">{s.name}</span>
                    <span className="font-serif text-lg">{s.recall_at_threshold === null ? "pending" : pct(r)}</span>
                  </div>
                  <div className="h-3 rounded-full bg-paper-2 overflow-hidden" role="img" aria-label={`${s.name}: ${pct(r)} recall`}>
                    <div
                      className={`h-full rounded-full ${r === best ? "bg-accent" : "bg-[var(--quote-bar)]"}`}
                      style={{ width: `${Math.round(r * 100)}%` }}
                    />
                  </div>
                  <p className="text-xs text-muted">{s.description}</p>
                </div>
              );
            })}
          </div>
          <p className="text-xs text-muted">
            Precision (the share of shown links a person would accept) needs hand labels. Status: {ev.hand_labels.status}.
          </p>
        </div>
      </Section>

      <Section title="Lost memory">
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
          <StatTile value={pct(ev.lost_memory.diff_coroner)} label="of shown links: the later report came from a different coroner" />
          <StatTile value={pct(ev.lost_memory.diff_area)} label="came from a different coroner area" />
          <StatTile value={pct(ev.lost_memory.not_cited)} label="did not cite the earlier report" />
          <StatTile value={pct(ev.lost_memory.all_three)} label="all three at once" />
        </div>
        <p className="text-sm text-muted">Across {ev.lost_memory.links.toLocaleString("en-GB")} shown links.</p>
      </Section>

      <Section title="Cost on Nebius Token Factory">
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-3">
          <StatTile value={`$${ev.cost.total.toFixed(2)}`} label="total spend for the whole archive" />
          <StatTile value={ev.cost.per_chain !== null ? `$${ev.cost.per_chain.toFixed(3)}` : "–"} label={`per verified chain (${ev.cost.chains} chains)`} />
          <StatTile value={meta.site.n_reports.toLocaleString("en-GB")} label="reports analysed" />
        </div>
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
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
        <p className="text-sm text-muted">
          Routing: Nano for extraction ({meta.site.models?.nano}), Super for judging ({meta.site.models?.super}), Ultra for
          dossiers ({meta.site.models?.ultra}).
        </p>
      </Section>

      <Section title="Weak spots">
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
