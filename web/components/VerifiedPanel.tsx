import { FileCheck2 } from "lucide-react";
import type { QuoteContext } from "@/lib/types";

type Side = { label: string; quote: string; ctx?: QuoteContext | null; href: string };

function Excerpt({ s }: { s: Side }) {
  if (!s.ctx) return null;
  return (
    <figure className="space-y-1.5">
      <figcaption className="eyebrow">{s.label}</figcaption>
      <blockquote className="rounded-lg border border-rule bg-paper-2/60 p-3 text-sm leading-relaxed text-ink-2">
        {s.ctx.cut_start && <span aria-hidden>… </span>}
        {s.ctx.before && <>{s.ctx.before} </>}
        <mark className="rounded bg-accent-soft px-0.5 text-ink [box-decoration-break:clone]">{s.quote}</mark>
        {s.ctx.after && <> {s.ctx.after}</>}
        {s.ctx.cut_end && <span aria-hidden> …</span>}
      </blockquote>
      <p className="text-xs text-muted">
        Found in {s.ctx.section}.{" "}
        <a href={s.href} target="_blank" rel="noreferrer">
          Open the original on judiciary.uk
        </a>
      </p>
    </figure>
  );
}

// "Verified word for word": each quote shown in place, highlighted within the surrounding text of its source report.
// Only a short, redacted window is published, never the whole report.
export default function VerifiedPanel({ earlier, later }: { earlier: Side; later: Side }) {
  if (!earlier.ctx && !later.ctx) return null;
  return (
    <details className="group/v rounded-xl border border-rule">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3.5 py-2.5 text-sm font-medium text-accent [&::-webkit-details-marker]:hidden">
        <FileCheck2 size={16} aria-hidden /> Verified word for word: see each quote in its source
      </summary>
      <div className="grid gap-4 px-3.5 pb-4 md:grid-cols-2">
        <Excerpt s={earlier} />
        <Excerpt s={later} />
      </div>
    </details>
  );
}
