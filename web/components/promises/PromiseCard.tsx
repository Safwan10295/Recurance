import Link from "next/link";
import { ArrowDown, ArrowRight } from "lucide-react";
import { ConfidenceTag, Quote, RelationTag, ReportLink, formatDate, gapText, orgTypeLabel } from "@/components/ui";
import type { PromiseLink } from "@/lib/queries-promises";

function Step({
  n,
  label,
  tone = "plain",
  children,
}: {
  n: number;
  label: string;
  tone?: "plain" | "accent";
  children: React.ReactNode;
}) {
  const cls = tone === "accent" ? "bg-accent-soft border-transparent" : "bg-paper border-rule";
  return (
    <div className={`min-w-0 break-words rounded-lg border p-3 sm:p-4 space-y-2.5 ${cls}`}>
      <p className={`eyebrow flex items-center gap-2 ${tone === "accent" ? "text-accent" : ""}`}>
        <span
          aria-hidden
          className={`num inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[0.68rem] tracking-normal ${
            tone === "accent" ? "border-accent text-accent" : "border-rule text-muted"
          }`}
        >
          {n}
        </span>
        {label}
      </p>
      {children}
    </div>
  );
}

function Connector() {
  return (
    <div aria-hidden className="flex items-center justify-center text-muted xl:items-start xl:pt-10">
      <ArrowDown className="h-4 w-4 xl:hidden" strokeWidth={1.75} />
      <ArrowRight className="hidden h-4 w-4 xl:block" strokeWidth={1.75} />
    </div>
  );
}

function ReportMeta({ date, title, url, slug, coroner }: { date: string | null; title: string; url: string; slug: string | null; coroner: string | null }) {
  return (
    <div className="space-y-0.5">
      <p className="text-sm text-muted num">{formatDate(date)}</p>
      <ReportLink url={url} slug={slug} title={title} className="block font-serif text-[1.05rem] leading-snug" />
      <p className="text-sm text-ink-2">Coroner {coroner ?? "not stated"}</p>
    </div>
  );
}

export function PromiseCard({ it }: { it: PromiseLink }) {
  const gap = gapText(it.days_apart);
  return (
    <li className="card list-none p-4 sm:p-5 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0 space-y-0.5">
          <p className="eyebrow">
            <Link href={`/organisations/${it.org.id}`}>{it.org.name}</Link>
            <span className="font-normal normal-case tracking-normal"> · {orgTypeLabel(it.org.type)}</span>
          </p>
          <Link href={`/chains/${it.chain_key}`} className="block font-serif text-lg leading-snug text-ink hover:text-accent">
            {it.hazard}
          </Link>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <RelationTag relation={it.relation} />
          <ConfidenceTag value={it.confidence} />
        </div>
      </div>

      <div className="grid gap-2 xl:grid-cols-[minmax(0,1fr)_1.25rem_minmax(0,1fr)_1.25rem_minmax(0,1fr)] xl:gap-3">
        <Step n={1} label="Earlier report">
          <ReportMeta date={it.earlier.date} title={it.earlier.title} url={it.earlier.url} slug={it.earlier.slug} coroner={it.earlier.coroner} />
          <Quote text={it.earlier_quote} href={it.earlier.url} ctx={it.earlier_context} />
        </Step>

        <Connector />

        <Step n={2} label="The response stated" tone="accent">
          <Quote text={it.promise_quote} />
          {it.promise_timescale && <p className="text-sm text-ink-2">Stated timescale: {it.promise_timescale}</p>}
          {it.promise_pdf && (
            <p className="text-sm">
              <a href={it.promise_pdf} target="_blank" rel="noopener noreferrer">
                Response (PDF) ↗
              </a>
            </p>
          )}
        </Step>

        <Connector />

        <Step n={3} label="Raised again">
          {gap && <p className="text-sm text-accent">{gap} later</p>}
          <ReportMeta date={it.later.date} title={it.later.title} url={it.later.url} slug={it.later.slug} coroner={it.later.coroner} />
          <Quote text={it.later_quote} href={it.later.url} ctx={it.later_context} />
          {it.same_coroner && <p className="text-xs text-muted">Same coroner as the earlier report.</p>}
        </Step>
      </div>

      {it.explanation && <p className="text-sm text-ink-2 leading-relaxed border-t border-rule pt-3">{it.explanation}</p>}
    </li>
  );
}
