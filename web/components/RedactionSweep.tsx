"use client";

import { RotateCcw } from "lucide-react";
import { useMotion } from "@/components/motion/useMotion";

// A11: the redaction rule in action, on an invented sentence (no real names). Grey bars sweep over the names,
// then the sentence appears as the site shows it.
type Part = string | { name: string; as: string };
const SENTENCE: Part[] = [
  { name: "Jane Holt", as: "[name redacted]" },
  ", the triage nurse, said ",
  { name: "Peter Lane", as: "[the deceased]" },
  " waited four hours, and his mother, ",
  { name: "Ann", as: "[name redacted]" },
  ", called the ward twice.",
];
const STEP = 650;

export default function RedactionSweep() {
  const names = SENTENCE.filter((p) => typeof p !== "string").length;
  const total = 300 + names * STEP + 900;
  const { ref, state, done, replay } = useMotion<HTMLDivElement>("redaction", { threshold: 0.5, durationMs: total });
  let k = 0;
  return (
    <div ref={ref} data-state={state} className="rw-m rounded-lg border border-rule bg-paper-2/50 p-4 space-y-3">
      <div className="flex items-baseline justify-between gap-2">
        <p className="eyebrow">An invented example, not from any report</p>
        <button
          type="button"
          onClick={replay}
          disabled={!done}
          className={`inline-flex items-center gap-1 text-xs text-muted transition-opacity duration-300 hover:text-ink ${done ? "opacity-100" : "pointer-events-none opacity-0"}`}
        >
          <RotateCcw size={12} aria-hidden /> Replay
        </button>
      </div>
      <div>
        <p className="mb-1 text-xs text-muted">As written in a source</p>
        <p className="font-serif text-ink leading-relaxed" aria-hidden>
          {SENTENCE.map((p, i) => {
            if (typeof p === "string") return <span key={i}>{p}</span>;
            const d = 300 + k++ * STEP;
            return (
              <span key={i} className="relative inline-block">
                {p.name}
                <span
                  className="m-growx absolute -inset-x-0.5 inset-y-0.5 rounded-sm bg-[var(--muted)]"
                  style={{ "--d": `${d}ms`, "--dur": "420ms" } as React.CSSProperties}
                />
              </span>
            );
          })}
        </p>
      </div>
      <div className="m-fade border-t border-rule pt-3" style={{ "--d": `${300 + names * STEP}ms` } as React.CSSProperties}>
        <p className="mb-1 text-xs text-muted">As shown on this site</p>
        <p className="font-serif text-ink leading-relaxed">
          {SENTENCE.map((p, i) => (typeof p === "string" ? <span key={i}>{p}</span> : <span key={i} className="text-accent">{p.as}</span>))}
        </p>
      </div>
      <p className="sr-only">
        Example: names of staff and family are replaced with name redacted, and the name of the person who died with the deceased.
      </p>
    </div>
  );
}
