"use client";

import { ArrowRight, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

// Four stops that show the whole idea in about two minutes. Rendered on the server; a script in the
// layout hides it before paint once dismissed (html[data-guide="off"]), so it never shifts the page.
export const GUIDE_STEPS = [
  { label: "See a chain", href: "/chains/c52cded99f756309", match: (p: string) => p.startsWith("/chains/c52cded99f756309") },
  { label: "Watch the agent", href: "/brief?report=david-levett-prevention-of-future-deaths-report&run=1", match: (p: string) => p === "/brief" },
  { label: "Check the evidence", href: "/how-we-know/evaluation", match: (p: string) => p === "/how-we-know/evaluation" },
  { label: "See the cost", href: "/how-we-know", match: (p: string) => p === "/how-we-know" },
];
const SEEN_KEY = "rw-guide-seen";
const OFF_KEY = "rw-guide";

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode: the strip simply comes back next visit */
  }
}

export default function GuidePath({ path }: { path: string }) {
  const here = GUIDE_STEPS.findIndex((s) => s.match(path));
  const [seen, setSeen] = useState<number[]>([]);

  useEffect(() => {
    const prev: number[] = JSON.parse(read(SEEN_KEY) || "[]");
    const next = here >= 0 && !prev.includes(here) ? [...prev, here] : prev;
    if (next !== prev) write(SEEN_KEY, JSON.stringify(next));
    setSeen(next);
  }, [here]);

  // On a step page, that step is current; elsewhere, the first step not yet visited.
  const current = here >= 0 ? here : Math.max(0, GUIDE_STEPS.findIndex((_, i) => !seen.includes(i)));
  const next = current + 1 < GUIDE_STEPS.length ? GUIDE_STEPS[current + 1] : null;
  const target = here >= 0 ? next : GUIDE_STEPS[current];

  const dismiss = () => {
    write(OFF_KEY, "off");
    document.documentElement.dataset.guide = "off";
  };

  return (
    <div className="guide-strip border-b border-rule bg-surface/70">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2 text-sm sm:px-6 lg:px-8">
        <p className="shrink-0 text-muted">
          <span className="sr-only">Guided path, </span>Step <span className="num text-ink">{current + 1}</span> of {GUIDE_STEPS.length}
        </p>
        <ol className="hidden min-w-0 flex-1 list-none items-center gap-1 p-0 md:flex" aria-label="Guided path">
          {GUIDE_STEPS.map((s, i) => (
            <li key={s.label} className="flex items-center gap-1">
              {i > 0 && <span aria-hidden className="h-px w-4 bg-rule" />}
              <Link
                href={s.href}
                aria-current={i === here ? "step" : undefined}
                className={`rounded-full px-2.5 py-1 text-xs transition-colors duration-200 hover:no-underline ${
                  i === current
                    ? "bg-accent text-accent-ink"
                    : seen.includes(i)
                      ? "bg-accent-soft text-accent"
                      : "text-muted hover:bg-paper-2 hover:text-ink"
                }`}
              >
                {s.label}
              </Link>
            </li>
          ))}
        </ol>
        <span className="min-w-0 flex-1 truncate text-ink md:hidden">{GUIDE_STEPS[current].label}</span>
        {target && (
          <Link href={target.href} className="ml-auto inline-flex shrink-0 items-center gap-1 text-sm font-medium hover:no-underline">
            <span>
              {here >= 0 ? "Next" : "Start"}
              <span className="hidden sm:inline">: {target.label}</span>
            </span>
            <ArrowRight size={14} aria-hidden />
          </Link>
        )}
        <button
          type="button"
          onClick={dismiss}
          aria-label="Hide the guided path"
          className={`${target ? "" : "ml-auto"} inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted hover:bg-paper-2 hover:text-ink`}
        >
          <X size={15} aria-hidden />
        </button>
      </div>
    </div>
  );
}
