import Link from "next/link";
import { ChainCard, RecentCard } from "@/components/cards";
import { ButtonLink, Section, StatTile, pct } from "@/components/ui";
import { getFeatured, getMeta, listRecent } from "@/lib/queries";

export default async function Home() {
  const [meta, featured, recent] = await Promise.all([getMeta(), getFeatured(), listRecent({ months: 12, size: 3 })]);
  const s = meta.site;
  const lead = featured[0];
  const tour = [
    {
      n: 1,
      title: "See one recurrence",
      body: "A hazard raised with one organisation, then raised again years later by different coroners, with the exact words from each report.",
      href: lead ? `/chains/${lead.key}` : "/chains",
      cta: lead ? lead.hazard : "Open a chain",
    },
    {
      n: 2,
      title: "See what is happening now",
      body: "Reports from the last 12 months that repeat a warning already given to the same organisation.",
      href: "/recent",
      cta: "Recent recurrences",
    },
    {
      n: 3,
      title: "Try it live",
      body: "Give any new report. Nemotron reads it, searches the organisation's earlier warnings, and judges the closest matches.",
      href: "/brief",
      cta: "Check a report",
    },
    {
      n: 4,
      title: "Check the evidence",
      body: "How often it finds recurrences the coroners themselves flagged, against two baselines, and what it cost.",
      href: "/evaluation",
      cta: "Evaluation",
    },
  ];

  return (
    <div className="space-y-12">
      <section className="card p-6 sm:p-8 space-y-5">
        <p className="eyebrow">Prevention of Future Deaths reports · England and Wales</p>
        <h1 className="font-serif text-3xl sm:text-4xl leading-tight max-w-3xl">
          When a coroner&apos;s warning is repeated years later, Recurrence Watch connects the record.
        </h1>
        <p className="text-ink-2 max-w-3xl text-lg">
          Coroners warn organisations about risks to life. Organisations reply with what they will change. When a
          similar death happens later, often before a different coroner, nobody links it back. This tool does, with the
          exact words from both reports.
        </p>
        <div className="flex flex-wrap gap-2">
          <ButtonLink href="/brief" primary>
            Check a report now
          </ButtonLink>
          <ButtonLink href="#tour">Take the 60-second tour</ButtonLink>
          <ButtonLink href="/recent">What&apos;s new</ButtonLink>
        </div>
      </section>

      <section className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <StatTile value={s.n_chains.toLocaleString("en-GB")} label="verified recurrence chains" href="/chains" />
        <StatTile value={recent.total.toLocaleString("en-GB")} label="recent reports repeating an earlier warning" href="/recent" />
        <StatTile value={pct(s.share_diff_coroner)} label="of links where the later report came from a different coroner" href="/evaluation" />
        <StatTile value={s.n_reports.toLocaleString("en-GB")} label="reports read, 2013 to now" href="/search" />
      </section>

      <Section title="Featured recurrences" action={<Link href="/chains">All chains →</Link>}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {featured.map((c) => (
            <ChainCard key={c.key} c={c} />
          ))}
        </div>
      </Section>

      <Section title="Latest recurrences" action={<Link href="/recent">See all {recent.total} →</Link>}>
        <ul className="space-y-3 p-0">
          {recent.rows.map((it) => (
            <RecentCard key={it.later.url + it.org.id} it={it} />
          ))}
        </ul>
      </Section>

      <section id="tour" className="space-y-3 scroll-mt-24">
        <h2 className="font-serif text-xl">The 60-second tour</h2>
        <p className="text-ink-2 text-sm">Four stops. Each opens the real tool, not a mock-up.</p>
        <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 list-none p-0">
          {tour.map((t) => (
            <li key={t.n} className="card p-4 flex flex-col gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent text-accent-ink text-sm font-semibold">
                {t.n}
              </span>
              <span className="font-semibold">{t.title}</span>
              <span className="text-sm text-ink-2">{t.body}</span>
              <Link href={t.href} className="mt-auto text-sm font-medium">
                {t.cta} →
              </Link>
            </li>
          ))}
        </ol>
      </section>

      <section className="space-y-3">
        <h2 className="font-serif text-xl">How it works</h2>
        <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 list-none p-0 text-sm">
          {[
            ["Read", "Every report and response on judiciary.uk, with OCR for scanned documents."],
            ["Extract", "Nemotron Nano pulls out each concern and each promised action, with exact quotes."],
            ["Link", "Within each organisation, later concerns are matched to earlier ones by meaning and wording."],
            ["Judge", "Nemotron Super decides if it is the same hazard. Every quote is checked word for word."],
          ].map(([t, d], i) => (
            <li key={t} className="border-t-2 border-accent pt-3">
              <div className="eyebrow">Step {i + 1}</div>
              <div className="font-semibold">{t}</div>
              <p className="text-ink-2 mt-1">{d}</p>
            </li>
          ))}
        </ol>
        <p className="text-sm text-muted">
          PFD Monitor groups concerns. The Preventable Deaths Tracker chases deadlines. Recurrence Watch tests whether
          promises held.
        </p>
      </section>
    </div>
  );
}
