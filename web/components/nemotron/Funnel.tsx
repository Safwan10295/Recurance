"use client";

import ModelBadge from "@/components/ModelBadge";
import { useCountUp, useMotion } from "@/components/motion/useMotion";

export type FunnelRow = {
  label: string;
  count: number;
  note: string;
  badges: string[];
  cost: number; // Token Factory spend for this step, 0 for code-only steps
  tokensIn: number;
  tokensOut: number;
};

const n = (x: number) => Math.round(x).toLocaleString("en-GB");
const compact = (x: number) => (x >= 1e6 ? `${(x / 1e6).toFixed(1)}M` : x >= 1e3 ? `${Math.round(x / 1e3)}k` : String(x));

function Row({ r, i, max }: { r: FunnelRow; i: number; max: number }) {
  const { ref, state, runs } = useMotion<HTMLLIElement>(`funnel-${i}`, { threshold: 0.6 });
  const v = useCountUp(r.count, state, runs, 900, 150);
  // Square-root widths: the narrowing is visible end to end, and the last step is still legible.
  const w = Math.max(6, Math.sqrt(r.count / max) * 100);
  return (
    <li ref={ref} data-state={state} className="rw-m grid gap-3 py-3 md:grid-cols-[minmax(0,1fr)_15rem] md:items-center">
      <div className="space-y-1.5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
          <span className="text-sm font-medium text-ink">
            <span className="eyebrow mr-2">Step {i + 1}</span>
            {r.label}
          </span>
          <span className="font-serif text-2xl leading-none text-ink num tabular-nums" aria-hidden>
            {n(v)}
          </span>
          <span className="sr-only">{n(r.count)}</span>
        </div>
        <div className="relative h-7 rounded-md bg-paper-2/70" aria-hidden>
          <div
            className="m-growx absolute inset-y-0 left-1/2 rounded-md bg-accent"
            style={{ width: `${w}%`, marginLeft: `-${w / 2}%`, transformOrigin: "center", "--dur": "900ms" } as React.CSSProperties}
          />
        </div>
        <p className="text-xs text-muted">{r.note}</p>
      </div>
      <div className="m-fade space-y-1.5 md:border-l md:border-rule md:pl-4" style={{ "--d": "350ms" } as React.CSSProperties}>
        <div className="flex flex-wrap gap-1.5">
          {r.badges.map((b) => (
            <ModelBadge key={b} label={b} />
          ))}
        </div>
        <p className="text-xs text-ink-2 num">
          {r.cost > 0 ? (
            <>
              ${r.cost.toFixed(r.cost < 0.1 ? 4 : 2)} · {compact(r.tokensIn)} tokens in
              {r.tokensOut ? `, ${compact(r.tokensOut)} out` : ""}
            </>
          ) : (
            "No model calls: checked in code"
          )}
        </p>
      </div>
    </li>
  );
}

// A4: from the archive to the evidence, each step narrower than the last, with what each step cost.
export default function Funnel({ rows }: { rows: FunnelRow[] }) {
  const max = Math.max(...rows.map((r) => r.count));
  return (
    <div className="card p-4 sm:p-5">
      <ol className="list-none divide-y divide-rule p-0">
        {rows.map((r, i) => (
          <Row key={r.label} r={r} i={i} max={max} />
        ))}
      </ol>
      <p className="mt-2 text-xs text-muted">Bar widths use a square-root scale, so every step stays visible. Costs and tokens come from the call ledger.</p>
    </div>
  );
}
