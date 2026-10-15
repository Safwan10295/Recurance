import Link from "next/link";
import { ConfidenceTag, Quote, RelationTag, formatDate } from "@/components/ui";
import { getRecent } from "@/lib/data";

export const metadata = { title: "Recent recurrences · Recurrence Watch" };

export default function RecentPage() {
  const recent = getRecent();
  return (
    <div className="space-y-8">
      <header className="space-y-3 max-w-3xl">
        <h1 className="font-serif text-3xl">Recent recurrences</h1>
        <p className="text-ink-2">
          Reports from the last 12 months that raise a concern already raised with the same organisation in an earlier
          report. Newest first. {recent.items.length} recent reports match at least one earlier warning.
        </p>
        <p className="text-sm text-muted">
          Reports dated from {formatDate(recent.since)}. Data last refreshed {formatDate(recent.generated_at.slice(0, 10))}.
          Each match was judged identical or closely related, with both quotes checked word for word.
        </p>
      </header>

      {recent.items.length === 0 && <p className="text-ink-2">No recent recurrences in the current data.</p>}

      <ol className="list-none p-0 space-y-6">
        {recent.items.map((it) => (
          <li key={it.later.url} className="border border-rule rounded p-4 sm:p-5 space-y-4">
            <div className="space-y-1">
              <p className="eyebrow">
                <Link href={`/organisations/${it.org.id}`}>{it.org.name}</Link>
              </p>
              <h2 className="font-serif text-xl">
                <a href={it.later.url} target="_blank" rel="noopener noreferrer">
                  {it.later.title}
                </a>
              </h2>
              <p className="text-sm text-ink-2">
                {formatDate(it.later.date)} · Coroner {it.later.coroner ?? "not stated"} · {it.later.area ?? ""}
              </p>
            </div>
            <p className="text-sm text-ink-2">
              A similar concern was raised {it.earlier.length === 1 ? "once" : `${it.earlier.length} times`} before with
              this organisation:
            </p>
            <ul className="list-none p-0 space-y-4">
              {it.earlier.map((e) => (
                <li key={e.url + e.chain} className="border-l-2 border-rule pl-4 space-y-2">
                  <div className="flex flex-wrap gap-2 items-center">
                    <RelationTag relation={e.relation} />
                    <ConfidenceTag value={e.confidence} />
                    <span className="text-sm text-muted">
                      {Math.round(e.days_apart / 365.25)} {Math.round(e.days_apart / 365.25) === 1 ? "year" : "years"} earlier
                      {e.same_coroner ? " · same coroner" : " · different coroner"}
                    </span>
                  </div>
                  <p className="text-sm">
                    <a href={e.url} target="_blank" rel="noopener noreferrer">{e.title}</a> ({formatDate(e.date)}, coroner{" "}
                    {e.coroner ?? "not stated"})
                  </p>
                  <div className="grid gap-3 md:grid-cols-2">
                    <Quote text={e.earlier_quote} />
                    <Quote text={e.later_quote} />
                  </div>
                  {e.promise_quote ? (
                    <div className="space-y-1">
                      <p className="eyebrow">Stated action in the response to the earlier report</p>
                      <Quote text={e.promise_quote} />
                    </div>
                  ) : !e.earlier_has_response ? (
                    <p className="text-sm text-muted">No published response from this organisation was found for the earlier report.</p>
                  ) : null}
                  <p className="text-sm">
                    <Link href={`/chains/${e.chain}`}>See the full chain: {e.hazard}</Link>
                  </p>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </div>
  );
}
