import { ChainCard } from "@/components/cards";
import type { ChainWithDates } from "@/lib/queries-chains";

// A short row of clear examples for a first visit. Chosen for clarity, not a ranking, so the cards are not numbered.
export default function StartHere({ chains }: { chains: ChainWithDates[] }) {
  if (!chains.length) return null;
  return (
    <section aria-labelledby="start-here-title" className="space-y-3 mb-8">
      <div className="space-y-1">
        <h2 id="start-here-title" className="font-serif text-xl">
          Start here
        </h2>
        <p className="text-sm text-muted">
          {chains.length === 6 ? "Six" : chains.length} clear examples, picked because they are easy to follow. This is not a ranking.
        </p>
      </div>
      <ul className="list-none -mx-4 px-4 flex gap-3 overflow-x-auto scroll-px-4 snap-x snap-mandatory hide-scrollbar pb-1 sm:mx-0 sm:px-0 sm:grid sm:grid-cols-2 sm:overflow-visible lg:grid-cols-3">
        {chains.map((c) => (
          <li key={c.key} className="w-[82%] shrink-0 snap-start sm:w-auto">
            <ChainCard c={c} />
          </li>
        ))}
      </ul>
    </section>
  );
}
