"use client";

import { RotateCcw } from "lucide-react";
import { pct } from "@/components/ui";
import { useMotion } from "@/components/motion/useMotion";

// Out of 100, never rounding a share below 1 up to all 100 (the same rule as pct()).
const of100 = (share: number) => Math.min(share < 1 ? 99 : 100, Math.round(share * 100));

const DIM_STEP = 34; // ms between dots dimming
const TINT_STEP = 18;

// A2: 100 dots, one per hundredth of the links shown. As it scrolls into view, the dots for links where the
// later report does not cite the earlier one dim one at a time; then those where the later report came from a
// different coroner gain a ring. Both shares come from the published data.
export default function HundredDots({ notCited, diffCoroner, nLinks }: { notCited: number; diffCoroner: number; nLinks: number }) {
  const dim = of100(notCited);
  const ring = of100(diffCoroner);
  const tintStart = 400 + dim * DIM_STEP + 500;
  const total = tintStart + ring * TINT_STEP + 600;
  const { ref, state, done, replay } = useMotion<HTMLDivElement>("dots", { threshold: 0.4, durationMs: total });

  return (
    <section
      ref={ref}
      data-state={state}
      className="rw-m card grid gap-6 p-5 sm:p-6 md:grid-cols-[auto_1fr] md:items-center"
      aria-labelledby="dots-heading"
      style={{ "--t0": `${tintStart}ms` } as React.CSSProperties}
    >
      <div
        className="grid w-fit grid-cols-10 gap-[6px]"
        role="img"
        aria-label={`100 dots, one for each 1% of links. ${pct(notCited)} dimmed: the later report does not cite the earlier one. ${pct(diffCoroner)} ringed: the later report came from a different coroner.`}
      >
        {Array.from({ length: 100 }, (_, i) => {
          const isDim = i < dim;
          const isRing = i < ring;
          return (
            <span
              key={i}
              className={`hd-dot h-3.5 w-3.5 rounded-full sm:h-4 sm:w-4 ${isDim ? "" : "hd-kept"} ${isRing ? "hd-ring" : ""}`}
              style={{ "--i": i } as React.CSSProperties}
            />
          );
        })}
      </div>
      <div className="space-y-4">
        <h2 id="dots-heading" className="font-serif text-2xl leading-snug">
          Each dot is 1% of the {nLinks.toLocaleString("en-GB")} links found between reports
        </h2>
        <div className="space-y-3">
          <div className="flex items-start gap-3">
            <span aria-hidden className="mt-1.5 h-3.5 w-3.5 shrink-0 rounded-full bg-[var(--dot)]" />
            <div>
              <p className="font-serif text-3xl leading-none text-ink num">{pct(notCited)}</p>
              <p className="mt-1 text-sm text-ink-2">dimmed: the later report does not cite the earlier one</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <span aria-hidden className="mt-1.5 h-3.5 w-3.5 shrink-0 rounded-full bg-[var(--dot)] shadow-[inset_0_0_0_2.5px_var(--accent)]" />
            <div>
              <p className="font-serif text-3xl leading-none text-ink num">{pct(diffCoroner)}</p>
              <p className="mt-1 text-sm text-ink-2">ringed: the later report came from a different coroner</p>
            </div>
          </div>
        </div>
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted">A link shows that a similar concern was raised again, not why.</p>
          <button
            type="button"
            onClick={replay}
            disabled={!done}
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-md border border-rule px-2.5 py-1.5 text-xs text-muted transition-opacity duration-300 hover:border-accent hover:text-ink ${
              done ? "opacity-100" : "pointer-events-none opacity-0"
            }`}
          >
            <RotateCcw size={13} aria-hidden /> Replay
          </button>
        </div>
      </div>
    </section>
  );
}
