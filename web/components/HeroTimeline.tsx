"use client";

import { RotateCcw } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { formatDate } from "@/components/ui";
import { useMotion } from "@/components/motion/useMotion";

export type HeroReport = { date: string; area: string | null; coroner: string | null };

const W = 640;
const BASE = 104; // the timeline's baseline in SVG units
const DOT_GAP = 620; // ms between reports appearing
const START = 400;

const t = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00Z`).getTime();
const month = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });

// The home hero (A1): one real chain draws itself. One dot per report appears in date order, a thin arc joins
// each repeat back to the first warning, and a counter of coroners ticks up. Reports are labelled by number,
// year and coroner area only, never by the name of the person who died. About 5 seconds, then a still frame.
export default function HeroTimeline({
  chainKey,
  hazard,
  orgName,
  reports: raw,
  citedLater,
}: {
  chainKey: string;
  hazard: string;
  orgName: string;
  reports: HeroReport[];
  citedLater: number;
}) {
  const reports = useMemo(() => [...raw].sort((a, b) => a.date.localeCompare(b.date)), [raw]);
  const total = DOT_GAP * (reports.length - 1) + START + 900;
  const { ref, state, runs, done, replay } = useMotion<HTMLDivElement>("hero", { session: true, threshold: 0.2, durationMs: total });
  const [shown, setShown] = useState(reports.length); // how many reports are visible, for the counter
  const [focus, setFocus] = useState<number | null>(null);

  // The counter and caption follow the dots, from the same start moment.
  useEffect(() => {
    if (state !== "run") {
      setShown(state === "pre" ? 0 : reports.length);
      return;
    }
    setShown(0);
    const timers = reports.map((_, i) => setTimeout(() => setShown(i + 1), START + i * DOT_GAP));
    return () => timers.forEach(clearTimeout);
  }, [state, runs, reports]);

  const t0 = t(reports[0].date);
  const t1 = t(reports[reports.length - 1].date);
  const span = Math.max(1, t1 - t0);
  const x = (iso: string) => 28 + ((t(iso) - t0) / span) * (W - 56);
  const coroners = new Set(reports.slice(0, shown).map((r, i) => (r.coroner || `report-${i}`).toLowerCase())).size;
  const allCoroners = new Set(reports.map((r, i) => (r.coroner || `report-${i}`).toLowerCase())).size;
  const nLater = reports.length - 1;
  const closing = citedLater === 0 ? "none cited the earlier report" : `${citedLater} of ${nLater} later reports cited an earlier one`;
  const years: number[] = [];
  for (let y = new Date(t0).getUTCFullYear(); y <= new Date(t1).getUTCFullYear(); y++) years.push(y);
  // Each year is labelled at its middle, held inside the chain's span, so labels never leave the card.
  const yearLabel = (y: number) => {
    const mid = Math.min(t1, Math.max(t0, t(`${y}-07-01`)));
    const at = 28 + ((mid - t0) / span) * (W - 56);
    return { at, anchor: mid === t0 ? "start" : mid === t1 ? "end" : "middle" } as const;
  };
  const captionIdx = focus ?? (shown > 0 ? shown - 1 : null);
  const cap = captionIdx !== null ? reports[captionIdx] : null;

  return (
    <div ref={ref} data-m="hero" data-state={state} className="rw-m card p-5 sm:p-6 shadow-[var(--shadow-lg)]" data-tour="problem">
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <p className="eyebrow">The problem, in a real case</p>
        <Link href={`/chains/${chainKey}`} className="text-xs">
          Open the chain →
        </Link>
      </div>
      <p className="font-serif text-lg leading-snug text-ink">{hazard}</p>
      <p className="text-sm text-ink-2">
        The same concern, in {reports.length} coroners&apos; reports to {orgName}.
      </p>

      <p className="sr-only">
        A timeline of {reports.length} reports to {orgName} on the same concern, from {formatDate(reports[0].date)} to{" "}
        {formatDate(reports[reports.length - 1].date)}, from {allCoroners} coroners. Of the {nLater} later reports, {closing}.
      </p>

      <svg viewBox={`0 0 ${W} 136`} className="mt-3 block h-auto w-full overflow-visible" aria-hidden>
        <line x1={20} x2={W - 20} y1={BASE} y2={BASE} className="stroke-rule" strokeWidth={1} />
        {years.map((y) => {
          const { at, anchor } = yearLabel(y);
          return (
            <text key={y} x={at} y={BASE + 26} textAnchor={anchor} fontSize={15} className="fill-[var(--muted)] num">
              {y}
            </text>
          );
        })}
        {reports.slice(1).map((r, j) => {
          const i = j + 1;
          const xa = x(reports[0].date);
          const xb = x(r.date);
          const h = Math.min(86, 16 + (xb - xa) * 0.32);
          return (
            <path
              key={`arc-${i}`}
              d={`M ${xa} ${BASE} Q ${(xa + xb) / 2} ${BASE - h * 1.6} ${xb} ${BASE}`}
              pathLength={1}
              fill="none"
              strokeWidth={focus === i ? 2 : 1.25}
              className={`m-draw stroke-[var(--accent)] ${focus !== null && focus !== i ? "opacity-25" : "opacity-70"}`}
              style={{ "--d": `${START + i * DOT_GAP + 120}ms`, "--dur": "760ms" } as React.CSSProperties}
            />
          );
        })}
        {reports.map((r, i) => (
          <g
            key={`dot-${i}`}
            className="m-pop cursor-default"
            style={{ "--d": `${START + i * DOT_GAP}ms` } as React.CSSProperties}
            onMouseEnter={() => setFocus(i)}
            onMouseLeave={() => setFocus(null)}
          >
            <circle cx={x(r.date)} cy={BASE} r={14} fill="transparent" />
            <circle
              cx={x(r.date)}
              cy={BASE}
              r={i === 0 ? 7 : 5.5}
              strokeWidth={2}
              className={`stroke-[var(--accent)] ${i === 0 ? "fill-[var(--accent)]" : "fill-[var(--surface)]"} ${focus === i ? "stroke-[3]" : ""}`}
            />
          </g>
        ))}
      </svg>

      <p className="min-h-5 text-xs text-muted num" aria-hidden>
        {cap ? `Report ${captionIdx! + 1} · ${month(cap.date)}${cap.area ? ` · ${cap.area}` : ""}${captionIdx === 0 ? " · first warning" : ""}` : " "}
      </p>

      <div className="mt-3 flex items-end justify-between gap-3 border-t border-rule pt-4">
        <p className="font-serif text-ink" aria-hidden>
          <span className="m-fade num text-4xl leading-none" style={{ "--d": `${START}ms` } as React.CSSProperties}>
            {coroners}
          </span>{" "}
          <span className="text-lg">{coroners === 1 ? "coroner" : "coroners"}</span>
          <span className={`m-fade block text-base text-ink-2`} style={{ "--d": `${total - 700}ms` } as React.CSSProperties}>
            {closing}.
          </span>
        </p>
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
  );
}
