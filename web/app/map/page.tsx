import HazardMap from "@/components/HazardMap";
import { PageHeader } from "@/components/ui";

export const metadata = { title: "Hazard map · Recurrence Watch" };

export default function MapPage() {
  return (
    <div>
      <PageHeader
        crumbs={[{ href: "/", label: "Start here" }, { label: "Hazard map" }]}
        title="Hazard map"
        description={
          <p>
            Each point is one concern a coroner raised in a Prevention of Future Deaths report. Concerns with a similar
            meaning sit close together, so groups of points show hazards that come up again and again. A line joins an
            earlier and a later concern sent to the same organisation that Nemotron Super judged to be the same hazard,
            with both quotes checked word for word. The layout was computed once from Qwen3 embeddings on Nebius Token
            Factory. Exploring the map makes no further model calls.
          </p>
        }
      />

      <HazardMap />

      <section className="mt-8 grid gap-6 md:grid-cols-[1fr_minmax(0,22rem)]">
        <div className="space-y-3">
          <h2 className="font-serif text-xl">How to read it</h2>
          <ol className="space-y-2.5 text-ink-2 leading-relaxed list-none">
            <li className="flex gap-3">
              <span className="num text-muted shrink-0 w-4">1</span>
              <span>
                A grey point is one concern. A teal point is a concern that is part of a recurrence chain: the same hazard
                raised with the same organisation in reports at least six months apart.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="num text-muted shrink-0 w-4">2</span>
              <span>
                Points close together describe similar things. A dense patch is a hazard that many reports mention. Use
                the theme filters and the search box to see where a topic sits.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="num text-muted shrink-0 w-4">3</span>
              <span>
                Hover over a point, or tap it, to read the concern and to see its chain. Click, or tap again, to open the
                chain or the report it comes from.
              </span>
            </li>
          </ol>
        </div>
        <aside className="card p-4 h-fit space-y-1.5">
          <p className="eyebrow">A note on position</p>
          <p className="text-sm text-ink-2 leading-relaxed">
            Position is approximate. The layout squeezes many dimensions of meaning into two, so distances are rough
            and a point near another is not a finding. Only the lines come from a checked judgement.
          </p>
        </aside>
      </section>
    </div>
  );
}
