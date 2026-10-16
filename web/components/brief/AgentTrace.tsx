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
const MODEL_STEP = new Set(["extract", "judge", "agent"]);
const isModel = (id: string) => MODEL_STEP.has(id) || id.startsWith("think");

const n = (x: number) => x.toLocaleString("en-GB");
const secs = (ms: number) => (ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`);

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
          className={`fade-in rounded-md border px-2.5 py-1.5 text-xs ${
            it.verdict === "kept"
              ? "border-accent/50 bg-accent-soft"
              : it.verdict === "dropped"
                ? "border-rule bg-paper-2/60 text-muted"
                : "border-rule bg-surface"
          }`}
          style={{ animationDelay: `${i * 60}ms` }}
        >
          <div className="flex items-start gap-2">
            {it.verdict === "kept" && <Check size={13} className="mt-0.5 shrink-0 text-accent" aria-label="Kept" />}
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
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <p className="eyebrow">{replayLabel ?? "What the agent is doing"}</p>
        {elapsed !== undefined && <p className="num text-xs text-muted">{secs(elapsed)}</p>}
      </div>
      <ol className="list-none p-0">
        {steps.map((s, i) => {
          const Icon = iconFor(s.id);
          const last = i === steps.length - 1;
          const running = s.status === "running";
          const isDone = s.status === "done";
          return (
            <li key={s.id} className="flex gap-3">
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
                  {running && <span className="absolute inset-[-5px] rounded-full border-2 border-accent/40 animate-ping motion-reduce:animate-none" aria-hidden />}
                  {isDone ? <Check size={15} aria-hidden /> : <Icon size={15} aria-hidden />}
                </span>
                {!last && <span className={`w-0.5 flex-1 min-h-4 ${isDone ? "bg-accent" : "bg-rule"} transition-colors`} aria-hidden />}
              </div>
              <div className={`min-w-0 flex-1 ${last ? "" : "pb-4"}`}>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 pt-1">
                  <span className={`text-sm font-medium ${s.status === "pending" ? "text-muted" : "text-ink"}`}>{s.label}</span>
                  {s.tool && (
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                        isModel(s.id) ? "bg-accent-soft text-accent" : "bg-paper-2 text-muted"
                      }`}
                    >
                      {s.tool}
                    </span>
                  )}
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
          Total: {n(total.tin)} tokens in, {n(total.tout)} out, ${total.cost.toFixed(4)} on Nebius Token Factory.
        </p>
      )}
    </div>
  );
}
