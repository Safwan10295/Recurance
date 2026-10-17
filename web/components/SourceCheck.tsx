"use client";

import { Check, FileCheck2 } from "lucide-react";
import { useId, useState } from "react";
import { prefersReducedMotion } from "@/components/motion/useMotion";
import type { QuoteContext } from "@/lib/types";

// A6: on any shown quote, a control opens the surrounding text of its source report, with the quote highlighted.
// The quote's words light up in order, then a quiet check mark lands. Only a short, redacted window is published.
export default function SourceCheck({ quote, ctx, href }: { quote: string; ctx: QuoteContext; href: string }) {
  const [open, setOpen] = useState(false);
  const [runs, setRuns] = useState(0);
  const [still, setStill] = useState(false);
  const id = useId();
  const words = quote.split(/(\s+)/);
  const nWords = words.filter((w) => w.trim()).length;
  const step = Math.min(45, 1400 / Math.max(1, nWords)); // the whole sweep stays under about 1.5 s
  const end = Math.round(step * nWords + 150);

  const toggle = () => {
    if (!open) {
      setStill(prefersReducedMotion());
      setRuns((r) => r + 1);
    }
    setOpen((o) => !o);
  };

  let k = 0;
  return (
    <div className="pl-4">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-controls={id}
        className="inline-flex items-center gap-1.5 rounded-md py-1 text-xs font-medium text-accent hover:underline"
      >
        <FileCheck2 size={14} aria-hidden /> {open ? "Hide the source" : "Check it in the source"}
      </button>
      {open && (
        <div id={id} key={runs} className="fade-in mt-1.5 space-y-1.5">
          <blockquote className="rounded-lg border border-rule bg-paper-2/60 p-3 text-sm leading-relaxed text-ink-2">
            {ctx.cut_start && <span aria-hidden>… </span>}
            {ctx.before && <>{ctx.before} </>}
            <mark className="bg-transparent text-ink" aria-label={`Quoted passage: ${quote}`}>
              {words.map((w, i) => {
                if (!w.trim()) return <span key={i}>{w}</span>;
                const d = still ? 0 : Math.round(step * k++);
                return (
                  <span key={i} className={`sweep rounded-sm ${still ? "sweep-still" : ""}`} style={{ animationDelay: `${d}ms` }}>
                    {w}
                  </span>
                );
              })}
            </mark>
            {ctx.after && <> {ctx.after}</>}
            {ctx.cut_end && <span aria-hidden> …</span>}
          </blockquote>
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
            <span className="land inline-flex items-center gap-1 text-accent" style={{ animationDelay: `${still ? 0 : end}ms` }}>
              <Check size={13} strokeWidth={2.5} aria-hidden /> Found word for word in {ctx.section}
            </span>
            <a href={href} target="_blank" rel="noopener noreferrer">
              Open the original on judiciary.uk ↗
            </a>
          </p>
        </div>
      )}
    </div>
  );
}
