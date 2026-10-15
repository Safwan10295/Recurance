import { ConfidenceTag, Quote, RelationTag, formatDate } from "./ui";
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
  if (!items.length) return null;
  return (
    <section aria-labelledby="systemic" className="space-y-4">
      <h2 id="systemic" className="font-serif text-2xl">
        The same hazard, raised with different organisations
      </h2>
      <p className="text-ink-2 max-w-3xl">
        These concerns were sent to different organisations, so they are not chains of one organisation&apos;s promises.
        They show a hazard that coroners in different areas raised again and again. Each later report was judged against
        the earliest one, with quotes checked word for word.
      </p>
      <ul className="list-none p-0 space-y-3">
        {items.map((s, i) => (
          <li key={i} className="border border-rule rounded">
            <details>
              <summary className="cursor-pointer p-4">
                <span className="font-serif text-lg">{s.hazard}</span>
                <span className="block text-sm text-ink-2 mt-1">
                  {s.members.length + 1} reports to {s.n_orgs} organisations over {s.years} years, first raised{" "}
                  {formatDate(s.anchor.date)}
                </span>
              </summary>
              <div className="px-4 pb-4 space-y-5">
                <div className="space-y-1">
                  <p className="eyebrow">First raised</p>
                  <Quote text={s.anchor.quote} href={s.anchor.url} label={s.anchor.title} />
                </div>
                {s.members.map((m, j) => (
                  <div key={j} className="space-y-2 border-t border-rule pt-3">
                    <div className="flex flex-wrap gap-2 items-center">
                      <RelationTag relation={m.relation} />
                      <ConfidenceTag value={m.confidence} />
                      <span className="text-sm text-muted">{formatDate(m.date)}</span>
                    </div>
                    <p className="text-sm text-ink-2">{m.explanation}</p>
                    <Quote text={m.later_quote} href={m.url} label={m.title} />
                  </div>
                ))}
              </div>
            </details>
          </li>
        ))}
      </ul>
    </section>
  );
}
