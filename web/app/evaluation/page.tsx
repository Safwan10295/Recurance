import { getEvaluation, getSite } from "@/lib/data";
import { pct } from "@/components/ui";

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
  acknowledged: { total: number; in_scope: number; in_scope_6m: number; by_evidence: Record<string, number> };
  systems: SystemRow[];
  lost_memory: { links: number; diff_coroner: number; diff_area: number; not_cited: number; all_three: number };
  cost: { total: number; by_stage: Record<string, number>; per_chain: number | null; chains: number };
  hand_labels: { status: string; n_labelled: number };
  notes: string[];
};

const fmt = (x: number | null | undefined) => (x === null || x === undefined ? "pending" : pct(x));

export default function EvaluationPage() {
  const ev = getEvaluation() as unknown as Evaluation | null;
  const site = getSite();
  return (
    <article className="space-y-10 max-w-4xl">
      <header className="space-y-3 max-w-3xl">
        <h1 className="font-serif text-3xl">Evaluation</h1>
        <p className="text-ink-2">
          How well the system finds recurrences, measured against a baseline, and what it cost.
        </p>
      </header>
      {!ev ? (
        <p className="text-ink-2">The evaluation has not been published yet.</p>
      ) : (
        <>
          <section className="space-y-3">
            <h2 className="font-serif text-2xl">Test set: pairs the coroners themselves acknowledged</h2>
            <ol className="list-decimal pl-5 space-y-1 text-ink-2">
              <li>A later report counts as acknowledging an earlier one when it names the earlier report&apos;s reference number or the earlier deceased person&apos;s full name.</li>
              <li>{ev.acknowledged.total} such pairs were found. {ev.acknowledged.in_scope} share an organisation, and {ev.acknowledged.in_scope_6m} of those are at least six months apart, which is the test set.</li>
              <li>Blind test: every sentence carrying the acknowledgement was removed from the later report before the system ran, so it could not find the earlier report by reading the citation.</li>
            </ol>
          </section>

          <section className="space-y-3">
            <h2 className="font-serif text-2xl">Three systems compared</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-rule text-left">
                    <th className="py-2 pr-4">System</th>
                    <th className="py-2 pr-4">Recall, blind test</th>
                    <th className="py-2 pr-4">Earlier report in top 5</th>
                    <th className="py-2 pr-4">Links shown</th>
                    <th className="py-2">Precision of shown links</th>
                  </tr>
                </thead>
                <tbody>
                  {ev.systems.map((s) => (
                    <tr key={s.name} className="border-b border-rule align-top">
                      <td className="py-2 pr-4">
                        <div className="font-semibold">{s.name}</div>
                        <div className="text-muted">{s.description}</div>
                      </td>
                      <td className="py-2 pr-4">{fmt(s.recall_at_threshold)}</td>
                      <td className="py-2 pr-4">{fmt(s.recall_at_5)}</td>
                      <td className="py-2 pr-4">{s.shown_pairs?.toLocaleString("en-GB") ?? "n/a"}</td>
                      <td className="py-2">{fmt(s.precision)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-sm text-muted">
              Precision needs hand labels. Status: {ev.hand_labels.status} ({ev.hand_labels.n_labelled} labelled).
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-serif text-2xl">Lost memory</h2>
            <p className="text-ink-2">
              Of {ev.lost_memory.links} verified links, the later report came from a different coroner in{" "}
              {pct(ev.lost_memory.diff_coroner)}, from a different coroner area in {pct(ev.lost_memory.diff_area)}, and did
              not cite the earlier report in {pct(ev.lost_memory.not_cited)}. All three held for {pct(ev.lost_memory.all_three)}.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-serif text-2xl">Cost</h2>
            <p className="text-ink-2">
              Total Token Factory spend for the analysis: ${ev.cost.total.toFixed(2)}.{" "}
              {ev.cost.per_chain !== null && <>That is ${ev.cost.per_chain.toFixed(3)} per verified chain across {ev.cost.chains} chains.</>}
            </p>
            <ul className="text-sm text-ink-2 list-disc pl-5">
              {Object.entries(ev.cost.by_stage).map(([k, v]) => (
                <li key={k}>
                  {k}: ${v.toFixed(4)}
                </li>
              ))}
            </ul>
            <p className="text-sm text-muted">
              Model routing: Nano for extraction ({site.models.nano}), Super for judging ({site.models.super}), Ultra for
              dossiers ({site.models.ultra}).
            </p>
          </section>

          {ev.notes.length > 0 && (
            <section className="space-y-2">
              <h2 className="font-serif text-2xl">Weak spots</h2>
              <ol className="list-decimal pl-5 space-y-1 text-ink-2">
                {ev.notes.map((n, i) => (
                  <li key={i}>{n}</li>
                ))}
              </ol>
            </section>
          )}
        </>
      )}
    </article>
  );
}
