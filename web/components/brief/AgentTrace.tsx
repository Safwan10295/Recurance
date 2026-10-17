"use client";

import {
  Brain,
  Building2,
  Check,
  CircleSlash,
  Database,
  FileSearch,
  FileText,
  Gavel,
  ListChecks,
  Send,
  ShieldCheck,
  Sparkles,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import ModelBadge, { BadgeLegend } from "@/components/ModelBadge";
import { prefersReducedMotion } from "@/components/motion/useMotion";

export type TraceItem = { label: string; sub?: string; score?: number; verdict?: "kept" | "dropped" | "sent" | "info"; note?: string };
export type Step = {
  id: string;
  label: string;
  status: "pending" | "running" | "done" | "skipped";
  detail?: string;
  tool?: string;
  ms?: number;
  tokensIn?: number;
  tokensOut?: number;
  reasoningTokens?: number;
  cost?: number;
  cached?: boolean;
  items?: TraceItem[];
};

const ICON: Record<string, LucideIcon> = {
  fetch: FileText,
  org: Building2,
  extract: Sparkles,
  retrieve: Database,
  judge: Gavel,
  brief: ListChecks,
  cache: FileSearch,
  agent: Brain,
  verify: ShieldCheck,
};
const iconFor = (id: string): LucideIcon => ICON[id] ?? (id.startsWith("think") ? Sparkles : id.startsWith("tool") ? Wrench : ListChecks);

const n = (x: number) => x.toLocaleString("en-GB");
const secs = (ms: number) => (ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`);

// Eases a running total towards its new value, so counters tick rather than jump (A3).
function useTween(value: number, ms = 450): number {
  const [v, setV] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    if (prefersReducedMotion() || from.current === value) {
      from.current = value;
      setV(value);
      return;
    }
    const a = from.current;
    const start = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / ms);
      setV(a + (value - a) * (1 - Math.pow(1 - t, 3)));
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf);
      from.current = value;
    };
  }, [value, ms]);
  return v;
}

function Counters({ tin, tout, cost, live }: { tin: number; tout: number; cost: number; live: boolean }) {
  const a = useTween(tin);
  const b = useTween(tout);
  const c = useTween(cost);
  return (
    <dl className="mb-4 grid grid-cols-3 gap-2 rounded-lg bg-paper-2/70 p-2.5 text-center" aria-live="off">
      {[
        ["Tokens in", n(Math.round(a))],
        ["Tokens out", n(Math.round(b))],
        ["Cost", `$${c.toFixed(4)}`],
      ].map(([k, v]) => (
        <div key={k}>
          <dt className="text-[11px] text-muted">{k}</dt>
          <dd className={`num tabular-nums text-sm ${live ? "text-ink" : "text-ink-2"}`}>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function Metrics({ s }: { s: Step }) {
  const parts: string[] = [];
  if (s.ms !== undefined) parts.push(secs(s.ms));
  if (s.tokensIn) parts.push(`${n(s.tokensIn)} tokens in`);
  if (s.tokensOut) parts.push(`${n(s.tokensOut)} out`);
  if (s.reasoningTokens) parts.push(`${n(s.reasoningTokens)} reasoning`);
  if (s.cost !== undefined && s.cost > 0) parts.push(s.cost < 0.0001 ? "<$0.0001" : `$${s.cost.toFixed(4)}`);
  if (s.cached) parts.push(s.id === "extract" && !s.tokensIn ? "reused from the archive" : "cached");
  if (!parts.length) return null;
  return <p className="text-[11px] text-muted num">{parts.join(" · ")}</p>;
}

function Items({ s }: { s: Step }) {
  if (!s.items?.length) return null;
  return (
    <ul className="mt-2 space-y-1.5 list-none p-0">
      {s.items.map((it, i) => (
        <li
          key={i}
          className={`${it.verdict === "dropped" ? "settle-dim" : "fade-in"} rounded-md border px-2.5 py-1.5 text-xs ${
            it.verdict === "kept"
              ? "border-accent/50 bg-accent-soft"
              : it.verdict === "dropped"
                ? "border-rule bg-paper-2/60 text-muted"
                : "border-rule bg-surface"
          }`}
          style={{ animationDelay: `${i * 60}ms` }}
        >
          <div className="flex items-start gap-2">
            {it.verdict === "kept" && (
              <span className="land mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-accent text-accent-ink" style={{ animationDelay: `${i * 60 + 200}ms` }}>
                <Check size={10} strokeWidth={3} aria-label="Kept, quotes verified" />
              </span>
            )}
            {it.verdict === "dropped" && <CircleSlash size={13} className="mt-0.5 shrink-0" aria-label="Dropped" />}
            {it.verdict === "sent" && <Send size={12} className="mt-0.5 shrink-0 text-accent" aria-label="Sent to the judge" />}
            <div className="min-w-0 flex-1">
              <p className={`leading-snug ${it.verdict === "dropped" ? "" : "text-ink"}`}>{it.label}</p>
              {it.sub && <p className="text-muted leading-snug line-clamp-2">{it.sub}</p>}
              {it.note && <p className={`leading-snug ${it.verdict === "kept" ? "text-accent" : ""}`}>{it.note}</p>}
            </div>
            {it.score !== undefined && (
              <span className="flex shrink-0 flex-col items-end gap-1" title="Similarity in meaning">
                <span className="num text-[11px] text-muted">{it.score.toFixed(2)}</span>
                <span className="block h-1 w-12 rounded-full bg-paper-2 overflow-hidden" aria-hidden>
                  <span className="block h-full rounded-full bg-accent" style={{ width: `${Math.round(Math.max(0.04, it.score) * 100)}%` }} />
                </span>
              </span>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

// The agent's plan as a vertical pipeline. Nodes light up as steps start and finish.
export default function AgentTrace({ steps, elapsed, replayLabel }: { steps: Step[]; elapsed?: number; replayLabel?: string }) {
  const total = steps.reduce(
    (a, s) => ({ cost: a.cost + (s.cost ?? 0), tin: a.tin + (s.tokensIn ?? 0), tout: a.tout + (s.tokensOut ?? 0) + (s.reasoningTokens ?? 0) }),
    { cost: 0, tin: 0, tout: 0 },
  );
  const done = steps.length > 0 && steps.every((s) => s.status === "done" || s.status === "skipped");
  return (
    <div className="card p-4 sm:p-5" aria-live="polite">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <p className="eyebrow">{replayLabel ?? "What the agent is doing"}</p>
        {elapsed !== undefined && <p className="num text-xs text-muted">{secs(elapsed)}</p>}
      </div>
      {steps.length > 0 && <Counters tin={total.tin} tout={total.tout} cost={total.cost} live={!done} />}
      {steps.length > 0 && (
        <div className="mb-4">
          <BadgeLegend families={["nano", "super", "qwen", "tavily"]} />
        </div>
      )}
      <ol className="list-none p-0">
        {steps.map((s, i) => {
          const Icon = iconFor(s.id);
          const last = i === steps.length - 1;
          const running = s.status === "running";
          const isDone = s.status === "done";
          return (
            <li key={s.id} className="slide-in flex gap-3">
              <div className="flex flex-col items-center">
                <span
                  className={`relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                    isDone
                      ? "border-accent bg-accent text-accent-ink"
                      : running
                        ? "border-accent bg-surface text-accent"
                        : "border-rule bg-surface text-muted"
                  }`}
                >
                  {running && <span className="breathe absolute inset-[-5px] rounded-full border-2 border-accent/50" aria-hidden />}
                  {isDone ? <Check size={15} aria-hidden /> : <Icon size={15} aria-hidden />}
                </span>
                {!last && <span className={`w-0.5 flex-1 min-h-4 ${isDone ? "bg-accent" : "bg-rule"} transition-colors`} aria-hidden />}
              </div>
              <div className={`min-w-0 flex-1 ${last ? "" : "pb-4"}`}>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 pt-1">
                  <span className={`text-sm font-medium ${s.status === "pending" ? "text-muted" : "text-ink"}`}>{s.label}</span>
                  {s.tool && <ModelBadge label={s.tool} />}
                </div>
                {s.detail && <p className="text-xs text-ink-2 mt-0.5">{s.detail}</p>}
                {running && !s.detail && <p className="text-xs text-muted mt-0.5">Working…</p>}
                <Metrics s={s} />
                <Items s={s} />
              </div>
            </li>
          );
        })}
      </ol>
      {done && (total.tin > 0 || total.cost > 0) && (
        <p className="mt-4 border-t border-rule pt-3 text-xs text-muted num">
          Total: {n(total.tin)} tokens in, {n(total.tout)} out, ${total.cost.toFixed(4)} on Nebius Token Factory. Every kept quote was
          checked word for word in code.
        </p>
      )}
    </div>
  );
}
