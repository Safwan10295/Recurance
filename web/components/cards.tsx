import Link from "next/link";
import type { ChainSummary } from "@/lib/types";
import type { RecentEntry } from "@/lib/queries";
import { Badge, ConfidenceTag, QuotePair, Quote, RelationTag, formatDate, orgTypeLabel, year, shortTitle } from "./ui";

export function ChainCard({ c }: { c: ChainSummary }) {
  return (
    <Link href={`/chains/${c.key}`} className="card p-4 flex flex-col gap-2 hover:no-underline hover:border-accent transition-colors h-full">
      <span className="eyebrow">{c.org.name}</span>
      <span className="font-serif text-lg text-ink leading-snug">{c.hazard}</span>
      <span className="text-sm text-ink-2 mt-auto">
        {c.n_reports} reports · {year(c.first_date)}–{year(c.last_date)} ·{" "}
        {c.coroners.length > 1 ? `${c.coroners.length} coroners` : "1 coroner"}
      </span>
      <span className="flex flex-wrap gap-1.5">
        <RelationTag relation={c.relation} />
      </span>
    </Link>
  );
}

export function ChainRow({ c }: { c: ChainSummary }) {
  return (
    <li className="py-3.5">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <div className="min-w-0 space-y-0.5">
          <Link href={`/chains/${c.key}`} className="font-serif text-lg text-ink">
            {c.hazard}
          </Link>
          <p className="text-sm text-ink-2">
            <Link href={`/organisations/${c.org.id}`} className="text-ink-2">
              {c.org.name}
            </Link>{" "}
            · {orgTypeLabel(c.org.type)}
          </p>
        </div>
        <div className="text-right text-sm text-ink-2 shrink-0">
          <div>
            <strong className="text-ink">{c.n_reports}</strong> reports · {year(c.first_date)}–{year(c.last_date)}
          </div>
          <div className="text-muted">{c.coroners.length > 1 ? `${c.coroners.length} different coroners` : "same coroner"}</div>
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5 mt-2">
        <RelationTag relation={c.relation} />
        <ConfidenceTag value={c.confidence} />
        {c.any_no_response && <Badge>No published response to an earlier report</Badge>}
        {c.has_dossier && <Badge tone="accent">Reviewed dossier</Badge>}
      </div>
    </li>
  );
}

export function RecentCard({ it, open = false }: { it: RecentEntry; open?: boolean }) {
  const first = it.earlier[0];
  return (
    <li className="card p-4 sm:p-5 space-y-3 list-none">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="space-y-0.5 min-w-0">
          <p className="eyebrow">
            <Link href={`/organisations/${it.org.id}`}>{it.org.name}</Link>
          </p>
          <Link href={`/reports/${it.later.slug}`} className="font-serif text-lg text-ink">
            {shortTitle(it.later.title)}
          </Link>
          <p className="text-sm text-ink-2">
            {formatDate(it.later.date)} · Coroner {it.later.coroner ?? "not stated"}
            {it.later.area ? ` · ${it.later.area}` : ""}
          </p>
        </div>
        <div className="flex gap-1.5">
          {it.is_new && <Badge tone="solid">New</Badge>}
          <Badge tone="accent">
            Repeats {it.earlier.length} earlier {it.earlier.length === 1 ? "warning" : "warnings"}
          </Badge>
        </div>
      </div>
      {first && (
        <p className="text-sm text-ink-2">
          First raised {formatDate(it.earlier[0].e_date)} in{" "}
          <Link href={`/reports/${first.e_slug}`}>{first.e_title}</Link>. Hazard:{" "}
          <Link href={`/chains/${first.chain}`}>{first.hazard}</Link>
        </p>
      )}
      <details open={open} className="group">
        <summary className="cursor-pointer text-sm text-accent select-none">Show the quotes and what was promised</summary>
        <ul className="mt-3 space-y-4 list-none p-0">
          {it.earlier.map((e, i) => (
            <li key={i} className="border-l-2 border-rule pl-4 space-y-2">
              <div className="flex flex-wrap gap-1.5 items-center">
                <RelationTag relation={e.relation} />
                <ConfidenceTag value={e.confidence} />
                <span className="text-xs text-muted">
                  {Math.max(1, Math.round(e.days_apart / 365.25))} yr earlier · {e.same_coroner ? "same coroner" : "different coroner"}
                </span>
              </div>
              <QuotePair
                earlier={{ label: `${e.e_title} (${year(e.e_date)})`, text: e.earlier_quote, href: e.earlier }}
                later={{ label: `This report (${year(it.later.date)})`, text: e.later_quote, href: e.later }}
              />
              {e.promise_quote ? (
                <div className="space-y-1">
                  <p className="eyebrow">What was promised after the earlier report</p>
                  <Quote text={e.promise_quote} />
                </div>
              ) : !e.earlier_has_response ? (
                <p className="text-xs text-muted">No published response from this organisation was found for the earlier report.</p>
              ) : null}
            </li>
          ))}
        </ul>
      </details>
    </li>
  );
}
