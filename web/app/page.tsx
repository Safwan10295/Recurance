import Link from "next/link";
import { Stat, pct } from "@/components/ui";
import { getChains, getRecent, getSite } from "@/lib/data";

export default function Home() {
  const site = getSite();
  const flagship = getChains().find((c) => c.key === site.flagship);
  const recent = getRecent();
  return (
    <div className="space-y-14">
      <section className="space-y-5 max-w-3xl">
        <p className="eyebrow">Prevention of Future Deaths reports, England and Wales</p>
        <h1 className="font-serif text-3xl sm:text-4xl leading-tight">
          Safety warnings get issued, fixes get promised, and the same concern can be raised again years later in front
          of a different coroner.
        </h1>
        <p className="text-lg text-ink-2">
          Recurrence Watch reads the published record and shows where a concern recurred after a stated action, with the
          exact words from both reports.
        </p>
      </section>

      <section aria-labelledby="how" className="space-y-4">
        <h2 id="how" className="font-serif text-2xl">
          The pattern, in four steps
        </h2>
        <ol className="grid gap-4 sm:grid-cols-4 list-none p-0">
          {[
            ["A coroner warns", "An inquest reveals a risk, and the coroner sends a report to the organisation able to act."],
            ["An action is stated", "The organisation must reply within 56 days, setting out what it will change."],
            ["A similar death", "Years later someone dies in similar circumstances, often in a different area."],
            ["The link is easy to miss", "A different coroner may not know the concern was raised before."],
          ].map(([t, d], i) => (
            <li key={t} className="border-t border-rule pt-3">
              <div className="eyebrow">Step {i + 1}</div>
              <div className="font-semibold mt-1">{t}</div>
              <p className="text-sm text-ink-2 mt-1">{d}</p>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="numbers" className="space-y-4">
        <h2 id="numbers" className="font-serif text-2xl">
          What the record shows
        </h2>
        {site.n_chains > 0 ? (
          <div className="grid gap-6 sm:grid-cols-3">
            <Stat value={site.n_chains.toLocaleString("en-GB")} label="verified recurrence chains, each with quotes from both reports" />
            <Stat value={pct(site.share_diff_coroner)} label="of verified links where the later report came from a different coroner" />
            <Stat value={pct(site.share_no_response)} label="of verified links where no published response from that organisation was found for the earlier report" />
          </div>
        ) : (
          <p className="text-ink-2">The analysis has not been published yet.</p>
        )}
        {recent.items.length > 0 && (
          <p className="text-ink-2">
            In the last 12 months, {recent.items.length} reports raised a concern already raised with the same
            organisation. <Link href="/recent">See recent recurrences</Link>.
          </p>
        )}
        <p className="text-sm text-muted">
          Computed from {site.n_reports.toLocaleString("en-GB")} reports. Numbers are recalculated whenever the data is
          refreshed.
        </p>
      </section>

      <section className="grid gap-6 sm:grid-cols-2">
        <div className="border border-rule rounded p-5 bg-paper-2 space-y-2">
          <h2 className="font-serif text-xl">Preparing for an inquest?</h2>
          <p className="text-ink-2 text-sm">
            Paste a new report or draft concerns. The brief shows earlier warnings to the same organisation, what was
            promised, and what happened next.
          </p>
          <Link href="/brief" className="inline-block mt-1">
            Open the pre-inquest brief
          </Link>
        </div>
        {flagship && (
          <div className="border border-rule rounded p-5 space-y-2">
            <p className="eyebrow">Example chain</p>
            <h2 className="font-serif text-xl">{flagship.hazard}</h2>
            <p className="text-ink-2 text-sm">
              {flagship.org.name}. {flagship.n_reports} reports from {flagship.coroners.length} coroners,{" "}
              {flagship.first_date.slice(0, 4)} to {flagship.last_date.slice(0, 4)}.
            </p>
            <Link href={`/chains/${flagship.key}`}>See the timeline and quotes</Link>
          </div>
        )}
      </section>

      <section className="max-w-3xl text-ink-2 space-y-2">
        <h2 className="font-serif text-xl text-ink">How this differs from existing tools</h2>
        <p>PFD Monitor groups concerns. The Preventable Deaths Tracker chases response deadlines. Recurrence Watch tests whether promises held.</p>
      </section>
    </div>
  );
}
