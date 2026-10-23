"use client";

import { ArrowRight, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import AgentTrace, { type Step } from "@/components/brief/AgentTrace";
import { useMotion } from "@/components/motion/useMotion";
import { ConfidenceTag, RelationTag, formatDate } from "@/components/ui";

export type HomeAgentMatch = {
  date: string;
  area: string | null;
  relation: "identical" | "closely_related" | "related" | "different";
  confidence: number;
  earlierQuote: string;
  laterQuote: string;
  earlierUrl: string;
};

const STEP_MS = 420;

// The home page shows the agent at work on one real report: the recorded run for a 2023 smart motorway report,
// replayed step by step when it scrolls into view. Same trace component and data as Check a report.
export default function HomeAgent({
  steps: raw,
  org,
  reportDate,
  searched,
  matches,
  first,
  seconds,
  cost,
  briefHref,
  reportUrl,
}: {
  steps: Step[];
  org: string;
  reportDate: string;
  searched: number;
  matches: number;
  first: HomeAgentMatch | null;
  seconds: number;
  cost: number;
  briefHref: string;
  reportUrl: string;
}) {
  // Show the brief step last, where it happens, rather than where it was first announced.
  const steps = useMemo(() => [...raw.filter((s) => s.id !== "brief"), ...raw.filter((s) => s.id === "brief")], [raw]);
  const total = steps.length * STEP_MS + 600;
  const { ref, state, runs, done, replay } = useMotion<HTMLDivElement>("home-agent", { threshold: 0.3, durationMs: total });
  // The trace starts empty and builds only once in view: rendering it on the server and clearing it on load cost a
  // long task at start-up. The result below is shown by default and hidden only while the replay runs.
  const [shown, setShown] = useState(0);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (state === "pre") return;
    if (state === "still") {
      setShown(steps.length);
      return;
    }
    setShown(0);
    const timers = steps.map((_, i) => setTimeout(() => setShown(i + 1), 300 + i * STEP_MS));
    return () => timers.forEach(clearTimeout);
  }, [state, runs, steps]);

  // Keep the newest step in view inside the trace's own scroll area (the page itself never moves).
  useEffect(() => {
    if (state === "run" && box.current) box.current.scrollTo({ top: box.current.scrollHeight, behavior: "smooth" });
  }, [shown, state]);

  const visible: Step[] = steps.slice(0, shown).map((s, i) => ({ ...s, status: i === shown - 1 && shown < steps.length ? "running" : "done" }));
  const playing = state === "run" && shown < steps.length;

  return (
    <section
      ref={ref}
      data-state={state}
      aria-labelledby="agent-heading"
      className="rw-m grid gap-5 lg:grid-cols-[1fr_1.05fr] lg:grid-rows-[auto_1fr] lg:items-start"
    >
      <div className="space-y-4 lg:col-start-1 lg:row-start-1">
        <p className="eyebrow">See it work</p>
        <h2 id="agent-heading" className="font-serif text-2xl leading-snug sm:text-[1.7rem]">
          The agent checks a real report
        </h2>
        <p className="text-ink-2">
          A {reportDate.slice(0, 4)} coroner&apos;s report about a death on a smart motorway, sent to {org}. Nemotron reads it,
          searches every earlier concern sent to {org}, judges which ones are the same hazard, and checks each quote against
          the original report.
        </p>

        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-lg border border-rule p-3">
            <p className="eyebrow mb-1">By hand</p>
            <p className="text-ink-2">
              Find and read <span className="num text-ink">{searched}</span> earlier concerns sent to {org}, and compare each
              one.
            </p>
          </div>
          <div className="rounded-lg border border-accent/40 bg-accent-soft/50 p-3">
            <p className="eyebrow mb-1 text-accent">With the agent</p>
            <p className="text-ink-2">
              <span className="num text-ink">{Math.round(seconds)} seconds</span> and{" "}
              <span className="num text-ink">${cost.toFixed(4)}</span>. Every quote checked in code.
            </p>
          </div>
        </div>
      </div>

      <div
        ref={box}
        className="h-[26rem] overflow-y-auto rounded-xl [scrollbar-width:thin] lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:h-[34rem]"
      >
        <AgentTrace steps={visible} replayLabel="Recorded run, replayed (no cost)" />
      </div>

      <div
        className={`home-agent-result space-y-3 transition-opacity duration-500 lg:col-start-1 lg:row-start-2 ${playing ? "opacity-0" : "opacity-100"}`}
        // Not reachable by keyboard or screen reader while the replay is still running and the result is hidden.
        inert={playing}
      >
        <p className="font-serif text-xl text-ink">
          {matches} earlier {matches === 1 ? "warning" : "warnings"} found
        </p>
        {first && (
          <div className="rounded-lg border border-rule bg-surface p-3.5 text-sm">
            <div className="mb-2 flex flex-wrap items-center gap-1.5">
              <RelationTag relation={first.relation} />
              <ConfidenceTag value={first.confidence} />
            </div>
            <p className="eyebrow mb-1">
              {formatDate(first.date)}
              {first.area ? ` · ${first.area}` : ""}
            </p>
            <p className="font-serif text-ink">&ldquo;{first.earlierQuote}&rdquo;</p>
            <a href={first.earlierUrl} target="_blank" rel="noopener noreferrer" className="text-xs">
              Original on judiciary.uk ↗
            </a>
            <p className="eyebrow mb-1 mt-2.5">{formatDate(reportDate)} · this report</p>
            <p className="font-serif text-ink">&ldquo;{first.laterQuote}&rdquo;</p>
            <a href={reportUrl} target="_blank" rel="noopener noreferrer" className="text-xs">
              Original on judiciary.uk ↗
            </a>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <Link href={briefHref} className="inline-flex items-center gap-1 text-sm font-medium hover:no-underline">
            Open the full brief <ArrowRight size={15} aria-hidden />
          </Link>
          <Link href="/brief" className="text-sm">
            Try another report
          </Link>
          <button
            type="button"
            onClick={replay}
            disabled={!done}
            className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-rule px-2.5 py-1.5 text-xs text-muted hover:border-accent hover:text-ink"
          >
            <RotateCcw size={13} aria-hidden /> Replay
          </button>
        </div>
      </div>
    </section>
  );
}
