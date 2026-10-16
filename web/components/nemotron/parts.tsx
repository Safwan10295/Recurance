import { ChevronDown, ChevronRight } from "lucide-react";
import type { LucideIcon } from "lucide-react";

// ---------- formatting ----------

export const n = (x: number | null | undefined) => (x ?? 0).toLocaleString("en-GB");

// $X.XX, or 4 decimal places for small per-item costs.
export function money(x: number | null | undefined, tiny = false): string {
  const v = x ?? 0;
  if (tiny || (v > 0 && v < 0.01)) return `$${v.toFixed(4)}`;
  return `$${v.toFixed(2)}`;
}

const compactFmt = new Intl.NumberFormat("en-GB", { notation: "compact", maximumFractionDigits: 1 });
export const compact = (x: number) => compactFmt.format(x);

export function latency(ms: number | null | undefined): string {
  if (!ms) return "–";
  return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`;
}

export function share(part: number, whole: number): string {
  if (!whole) return "0%";
  const p = (part / whole) * 100;
  return p > 0 && p < 1 ? "<1%" : `${Math.round(p)}%`;
}

// ---------- a small label naming the model or method behind a step ----------

export function ModelTag({ children, model = true }: { children: React.ReactNode; model?: boolean }) {
  return (
    <span
      className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-medium leading-tight ${
        model ? "bg-accent-soft text-accent" : "bg-paper-2 text-ink-2"
      }`}
    >
      {children}
    </span>
  );
}

// ---------- "From archive to evidence" ----------

export interface FlowStep {
  label: string;
  count: number;
  tag: string;
  model?: boolean;
  note?: string;
}

// Log scale from 100 up to the next power of ten, so each gridline is ten times the last.
function logScale(max: number) {
  const lo = 2;
  const hi = Math.max(lo + 1, Math.ceil(Math.log10(Math.max(max, 1000))));
  const pos = (v: number) => Math.max(2, Math.min(100, ((Math.log10(Math.max(v, 1)) - lo) / (hi - lo)) * 100));
  const ticks: { v: number; at: number }[] = [];
  for (let e = lo + 1; e < hi; e++) ticks.push({ v: 10 ** e, at: ((e - lo) / (hi - lo)) * 100 });
  return { pos, ticks, top: 10 ** hi };
}

export function Flow({ steps }: { steps: FlowStep[] }) {
  const scale = logScale(Math.max(...steps.map((s) => s.count)));
  return (
    <div className="space-y-3">
      <ol className="flex flex-col gap-5 xl:flex-row xl:gap-5 list-none p-0">
        {steps.map((s, i) => (
          <li key={s.label} className="relative card p-3 sm:p-4 flex flex-col gap-2 xl:flex-1 xl:min-w-0 xl:p-3">
            {i > 0 && (
              <span
                aria-hidden
                className="absolute left-1/2 -top-[1.15rem] -translate-x-1/2 text-muted xl:left-auto xl:-left-[1.15rem] xl:top-1/2 xl:-translate-y-1/2 xl:translate-x-0"
              >
                <ChevronDown size={14} className="xl:hidden" />
                <ChevronRight size={14} className="hidden xl:block" />
              </span>
            )}
            <div className="flex items-start justify-between gap-3 xl:flex-col xl:gap-1">
              <div className="min-w-0">
                <div className="eyebrow">Step {i + 1}</div>
                <div className="text-sm font-medium leading-snug xl:min-h-[2.6rem]">{s.label}</div>
              </div>
              <div className="font-serif text-2xl num leading-none pt-1 xl:pt-0">{n(s.count)}</div>
            </div>
            <div
              className="relative flex h-2 w-full overflow-hidden rounded-full bg-paper-2 xl:h-28 xl:items-end xl:rounded-md"
              role="img"
              aria-label={`${n(s.count)} on a log scale`}
            >
              <div
                className="h-full w-[var(--v)] rounded-full bg-accent xl:h-[var(--v)] xl:w-full xl:rounded-md"
                style={{ "--v": `${scale.pos(s.count).toFixed(1)}%` } as React.CSSProperties}
              />
              {scale.ticks.map((t) => (
                <span
                  key={t.v}
                  aria-hidden
                  className="absolute top-0 bottom-0 left-[var(--t)] w-px bg-surface xl:top-auto xl:right-0 xl:left-0 xl:bottom-[var(--t)] xl:h-px xl:w-auto"
                  style={{ "--t": `${t.at.toFixed(1)}%` } as React.CSSProperties}
                />
              ))}
            </div>
            <div>
              <ModelTag model={s.model}>{s.tag}</ModelTag>
            </div>
            {s.note && <p className="text-xs text-muted leading-snug">{s.note}</p>}
          </li>
        ))}
      </ol>
      <p className="text-xs text-muted">
        Bars use a log scale starting at 100. The thin lines mark {scale.ticks.map((t) => n(t.v)).join(" and ")}; a full
        bar is {n(scale.top)}. Concerns outnumber reports because one report usually raises several.
      </p>
    </div>
  );
}

// ---------- stacked share bar (hand-written SVG) ----------

export interface Segment {
  key: string;
  label: string;
  sub?: string;
  value: number;
  fill: string;
  opacity?: number;
}

export function StackBar({
  segments,
  format,
  title,
}: {
  segments: Segment[];
  format: (v: number) => string;
  title: string;
}) {
  const total = segments.reduce((a, s) => a + s.value, 0);
  let x = 0;
  return (
    <div className="space-y-3">
      <svg
        viewBox="0 0 1000 24"
        preserveAspectRatio="none"
        className="block h-6 w-full overflow-hidden rounded-md"
        role="img"
        aria-label={`${title}: ${segments.map((s) => `${s.label} ${share(s.value, total)}`).join(", ")}`}
      >
        <rect x="0" y="0" width="1000" height="24" fill="var(--paper-2)" />
        {segments.map((s) => {
          const w = total ? (s.value / total) * 1000 : 0;
          const r = (
            <rect
              key={s.key}
              x={x}
              y="0"
              width={w}
              height="24"
              fill={s.fill}
              fillOpacity={s.opacity ?? 1}
              stroke="var(--surface)"
              strokeWidth="2"
              vectorEffect="non-scaling-stroke"
            >
              <title>{`${s.label}: ${format(s.value)} (${share(s.value, total)})`}</title>
            </rect>
          );
          x += w;
          return r;
        })}
      </svg>
      <ul className="grid gap-x-6 gap-y-2 sm:grid-cols-2 list-none p-0 text-sm">
        {segments.map((s) => (
          <li key={s.key} className="flex items-baseline gap-2 min-w-0">
            <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden className="shrink-0 translate-y-[1px]">
              <rect width="10" height="10" rx="2" fill={s.fill} fillOpacity={s.opacity ?? 1} />
            </svg>
            <span className="min-w-0 flex-1">
              {s.label}
              {s.sub && <span className="text-muted"> · {s.sub}</span>}
            </span>
            <span className="num text-ink-2 whitespace-nowrap">
              {format(s.value)} <span className="text-muted">({share(s.value, total)})</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------- a short list item with an icon ----------

export function IconItem({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-accent-soft text-accent">
        <Icon size={16} aria-hidden />
      </span>
      <div className="min-w-0 space-y-0.5">
        <div className="font-medium text-sm">{title}</div>
        <div className="text-sm text-ink-2">{children}</div>
      </div>
    </li>
  );
}

// ---------- the live agent's steps ----------

export function AgentSteps({ steps }: { steps: { icon: LucideIcon; title: string; tag: string; model?: boolean }[] }) {
  return (
    <div className="relative">
      <span
        aria-hidden
        className="absolute left-5 top-5 bottom-5 w-px bg-rule md:left-[10%] md:right-[10%] md:bottom-auto md:h-px md:w-auto"
      />
      <ol className="relative grid gap-4 md:grid-cols-5 md:gap-3 list-none p-0">
        {steps.map((s, i) => (
          <li key={s.title} className="flex gap-3 md:flex-col md:items-center md:text-center">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-rule bg-surface text-accent">
              <s.icon size={18} aria-hidden />
            </span>
            <div className="min-w-0 space-y-1 pt-0.5 md:pt-0">
              <div className="text-sm font-medium leading-snug">
                <span className="text-muted num">{i + 1}.</span> {s.title}
              </div>
              <ModelTag model={s.model}>{s.tag}</ModelTag>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
