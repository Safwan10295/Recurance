import JudgeGame, { type GameFacts, type GamePair } from "@/components/JudgeGame";
import { EmptyState, PageHeader, formatDate } from "@/components/ui";
import { q1 } from "@/lib/db";
import { getMeta } from "@/lib/queries";

export const metadata = {
  title: "You be the judge · Recurrence Watch",
  description: "Two coroners' concerns, years apart. Same hazard or not? Compare your call with NVIDIA Nemotron Super's.",
};
export const dynamic = "force-dynamic";

export default async function JudgePage() {
  const [meta, game] = await Promise.all([
    getMeta(),
    q1<{ value: GamePair[] }>("SELECT value FROM pub_meta WHERE key = 'game'").catch(() => null),
  ]);
  const s = meta.site;
  const evalSystems = (meta.evaluation as { systems?: { name: string; recall_at_threshold: number | null }[] } | null)?.systems ?? [];
  const judge = evalSystems.find((x) => /nemotron|judge/i.test(x.name));
  const facts: GameFacts = {
    reports: s.n_reports,
    concerns: s.n_concerns,
    pairs: s.n_judged,
    chains: s.n_chains,
    links: s.n_links,
    judgeCost: s.spend?.by_stage?.C ?? null,
    shareDiffCoroner: s.share_diff_coroner,
    shareNotCited: s.share_not_cited,
    updated: meta.published_at ? formatDate(meta.published_at) : null,
    recallJudge: judge?.recall_at_threshold ?? null,
  };
  const pairs = game?.value ?? [];
  return (
    <div>
      <PageHeader
        crumbs={[{ href: "/", label: "Start here" }, { label: "You be the judge" }]}
        title="You be the judge"
        description="The hardest step in Recurrence Watch is deciding whether two concerns are really the same hazard. Try it yourself, then see what Nemotron Super decided."
      />
      {pairs.length < 8 ? (
        <EmptyState title="The game is not available just now">It needs the next data publish.</EmptyState>
      ) : (
        <JudgeGame pairs={pairs} facts={facts} />
      )}
    </div>
  );
}
