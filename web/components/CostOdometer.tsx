"use client";

import { useCountUp, useMotion } from "@/components/motion/useMotion";

const money = (v: number, places = 2) => `$${v.toFixed(places)}`;

// A5: the total Token Factory spend rolls up from zero on first view, with the cost per verified chain beside it.
// Digits are tabular, so the figure never changes width while it counts.
export default function CostOdometer({
  total,
  chains,
  label = "total spend on Nebius Token Factory, every stage and every pilot",
  compact = false,
}: {
  total: number;
  chains: number;
  label?: string;
  compact?: boolean;
}) {
  const { ref, state, runs } = useMotion<HTMLDivElement>("odometer", { threshold: 0.5 });
  const perChain = chains ? total / chains : 0;
  const v = useCountUp(total, state, runs, 1600);
  const p = useCountUp(perChain, state, runs, 1600, 250);
  return (
    <div ref={ref} data-state={state} className={`rw-m card ${compact ? "p-4" : "p-5"} flex flex-col gap-1`}>
      <p className="sr-only">
        {money(total)} {label}; {money(perChain, 4)} per verified chain, across {chains.toLocaleString("en-GB")} chains.
      </p>
      <div aria-hidden className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <span className={`font-serif ${compact ? "text-3xl" : "text-4xl"} leading-none text-ink num tabular-nums`}>{money(v)}</span>
        <span className="text-sm text-ink-2">
          <span className="num tabular-nums text-ink">{money(p, 4)}</span> per verified chain
        </span>
      </div>
      <span aria-hidden className="text-sm text-ink-2">
        {label}
      </span>
    </div>
  );
}
