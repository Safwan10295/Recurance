import { ConfidenceTag, EmptyState, Quote, QuotePair, RelationTag, formatDate, year } from "./ui";
import type { Relation } from "@/lib/types";

export type Systemic = {
  hazard: string;
  n_orgs: number;
  years: number;
  anchor: { url: string; title: string; date: string; quote: string };
  members: {
    url: string;
    title: string;
    date: string;
    relation: Relation;
    confidence: number;
    explanation: string;
    earlier_quote: string;
    later_quote: string;
  }[];
};

export default function SystemicList({ items }: { items: Systemic[] }) {
  if (!items.length) return <EmptyState title="No cross-organisation clusters in this release" />;
  return (
    <div className="space-y-4">
      <p className="text-ink-2 max-w-3xl">
        These concerns went to different organisations, so they are not one organisation&apos;s chain. They show a hazard
        that coroners in different places raised again and again. Each later report was judged against the earliest one,
        with both quotes checked word for word.
      </p>
      <ul className="list-none p-0 grid gap-3">
        {items.map((s, i) => {
          const last = s.members.reduce((d, m) => (m.date > d ? m.date : d), s.anchor.date);
          return (
            <li key={i} className="card">
              <details className="group">
                <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden p-4 sm:p-5 flex items-start justify-between gap-4">
                  <span className="min-w-0 space-y-1">
                    <span className="eyebrow block">{s.n_orgs} organisations</span>
                    <span className="font-serif text-lg text-ink leading-snug block">{s.hazard}</span>
                    <span className="block text-sm text-ink-2">
                      {s.members.length + 1} reports · {year(s.anchor.date)}–{year(last)}
                    </span>
                  </span>
                  <span aria-hidden className="text-muted text-sm mt-1 shrink-0 group-open:rotate-180 transition-transform">
                    ▾
                  </span>
                </summary>
                <div className="px-4 sm:px-5 pb-5 space-y-5 border-t border-rule pt-4">
                  <div className="space-y-1.5">
                    <p className="eyebrow">First raised · {formatDate(s.anchor.date)}</p>
                    <Quote text={s.anchor.quote} href={s.anchor.url} label={s.anchor.title} />
                  </div>
                  {s.members.map((m, j) => (
                    <div key={j} className="space-y-3 border-t border-rule pt-4">
                      <div className="flex flex-wrap gap-2 items-center">
                        <RelationTag relation={m.relation} />
                        <ConfidenceTag value={m.confidence} />
                        <a href={m.url} target="_blank" rel="noopener noreferrer" className="text-sm">
                          {m.title} ↗
                        </a>
                      </div>
                      <p className="text-sm text-ink-2">{m.explanation}</p>
                      <QuotePair
                        earlier={{ label: `Earlier · ${formatDate(s.anchor.date)}`, text: m.earlier_quote, href: s.anchor.url }}
                        later={{ label: `Later · ${formatDate(m.date)}`, text: m.later_quote, href: m.url }}
                      />
                    </div>
                  ))}
                </div>
              </details>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
