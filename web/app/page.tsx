import {
  ArrowRight,
  Clock3,
  Compass,
  Cpu,
  FileWarning,
  Gavel,
  Map,
  MessageSquareQuote,
  Repeat2,
  ScanSearch,
  Unlink,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { TourButton } from "@/components/shell/Tour";
import { ChainCard, RecentCard } from "@/components/cards";
import { InfoTip, Section, StatTile, btnPrimary, btnSecondary, formatDate, pct } from "@/components/ui";
import { q1 } from "@/lib/db";
import { GLOSSARY } from "@/lib/glossary";
import { getChain, getFeatured, getMeta, listRecent } from "@/lib/queries";

async function counts() {
  return (
    (await q1<{ after_promise: number; points: number }>(
      `SELECT (SELECT COUNT(*)::int FROM pub_links WHERE payload->>'after_promise' IN ('1','true')) after_promise,
              (SELECT COUNT(*)::int FROM pub_hazard_points) points`,
    ).catch(() => null)) ?? { after_promise: 0, points: 0 }
  );
}

export default async function Home() {
  const [meta, featured, recent, c] = await Promise.all([getMeta(), getFeatured(), listRecent({ months: 12, size: 3, clearOnly: true }), counts()]);
  const s = meta.site;
  const lead = featured[0];
  const leadChain = lead ? (await getChain(lead.key)).chain : null;
  const leadPromises = leadChain ? leadChain.reports.slice(0, -1).reduce((n, r) => n + r.responses.reduce((m, rs) => m + rs.promises.length, 0), 0) : 0;

  const problem: { icon: LucideIcon; title: string; body: string }[] = [
    {
      icon: FileWarning,
      title: "A coroner warns",
      body: leadChain
        ? `${formatDate(leadChain.first_date)}: a coroner tells ${leadChain.org.name} about a risk to life.`
        : "A coroner writes to an organisation about a risk to life.",
    },
    {
      icon: MessageSquareQuote,
      title: "The organisation responds",
      body: leadChain && leadPromises ? `Its responses state ${leadPromises} specific actions.` : "Within 56 days it must reply with what it will do.",
    },
    {
      icon: Repeat2,
      title: "It happens again",
      body: leadChain
        ? `The same concern is raised ${leadChain.n_reports - 1} more times, by ${leadChain.coroners.length - 1} other coroners, up to ${leadChain.last_date.slice(0, 4)}.`
        : "Years later, a similar death, in front of a different coroner.",
    },
    {
      icon: Unlink,
      title: "Nobody joins it up",
      body: `In ${pct(s.share_not_cited)} of the links found, the later report does not cite the earlier one.`,
    },
  ];

  const features: { href: string; icon: LucideIcon; title: string; body: string; stat: string }[] = [
    { href: "/brief", icon: ScanSearch, title: "Watch the agent", body: "Give any report. See Nemotron extract, search, judge and verify, step by step.", stat: "Live on Token Factory" },
    { href: "/promises", icon: MessageSquareQuote, title: "Promises, then again", body: "Where a response stated an action and a later coroner raised the same concern.", stat: `${c.after_promise.toLocaleString("en-GB")} links` },
    { href: "/map", icon: Map, title: "Hazard map", body: "Every concern placed by meaning, with the recurrences drawn between them.", stat: `${c.points.toLocaleString("en-GB")} concerns` },
    { href: "/nemotron", icon: Cpu, title: "How Nemotron did the work", body: "Nano, Super and Ultra, the tokens they used and what it cost.", stat: `$${s.spend.total.toFixed(2)} in total` },
    { href: "/judge", icon: Gavel, title: "You be the judge", body: "Two concerns, years apart. Same hazard or not? Compare your call with the model's.", stat: "8 rounds, about two minutes" },
    { href: "/recent", icon: Clock3, title: "Recent recurrences", body: "New reports from the last year that repeat a warning already given.", stat: `${recent.total} reports` },
  ];

  const tour = [
    { title: "See one recurrence", body: "One hazard, one organisation, years of reports, with the exact words from each.", href: lead ? `/chains/${lead.key}` : "/chains", cta: "Open the chain" },
    { title: "Watch the agent work", body: "Pick a report. Watch each step, model and verdict as it happens.", href: "/brief", cta: "Check a report" },
    { title: "Read the promises", body: "Stated actions, followed by the same concern from a later coroner.", href: "/promises", cta: "Promises, then again" },
    { title: "Check the evidence", body: "How often it finds recurrences the coroners flagged, against two baselines.", href: "/evaluation", cta: "Evaluation" },
  ];

  return (
    <div className="space-y-14">
      {/* Hero */}
      <section className="grid gap-8 lg:grid-cols-[1.15fr_1fr] lg:items-center">
        <div className="space-y-5">
          <p className="eyebrow">Prevention of Future Deaths reports · England and Wales</p>
          <h1 className="font-serif text-[2rem] sm:text-[2.6rem] xl:text-[2.9rem] leading-[1.1] tracking-tight">
            When a coroner&apos;s warning comes round again, Recurrence Watch connects the record.
          </h1>
          <p className="text-ink-2 text-lg leading-relaxed max-w-xl">
            It reads every coroner&apos;s report and response since 2013, finds where the same concern was raised again with
            the same organisation, and shows the exact words from both reports. An agent built on NVIDIA Nemotron checks new
            reports live.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link href="/brief" className={`${btnPrimary} px-4 py-2.5`}>
              <ScanSearch size={17} aria-hidden /> Check a report
            </Link>
            {lead && (
              <Link href={`/chains/${lead.key}`} className={`${btnSecondary} px-4 py-2.5`}>
                See a recurrence <ArrowRight size={16} aria-hidden />
              </Link>
            )}
            <TourButton className={`${btnSecondary} px-4 py-2.5`}>
              <Compass size={16} aria-hidden /> Take the guided tour
            </TourButton>
          </div>
        </div>

        <div className="card p-5 sm:p-6 shadow-[var(--shadow-lg)]" data-tour="problem">
          <div className="mb-4 flex items-baseline justify-between gap-2">
            <p className="eyebrow">The problem, in a real case</p>
            {lead && (
              <Link href={`/chains/${lead.key}`} className="text-xs">
                {lead.org.name} →
              </Link>
            )}
          </div>
          <ol className="list-none p-0">
            {problem.map((p, i) => {
              const Icon = p.icon;
              const last = i === problem.length - 1;
              return (
                <li key={p.title} className="flex gap-3.5">
                  <div className="flex flex-col items-center">
                    <span
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                        last ? "bg-sand-soft text-sand" : i === 0 ? "bg-accent text-accent-ink" : "bg-accent-soft text-accent"
                      }`}
                      aria-hidden
                    >
                      <Icon size={17} />
                    </span>
                    {!last && <span className="w-px flex-1 min-h-5 bg-rule" aria-hidden />}
                  </div>
                  <div className={last ? "" : "pb-4"}>
                    <p className="font-medium text-ink leading-snug pt-1.5">{p.title}</p>
                    <p className="text-sm text-ink-2">{p.body}</p>
                  </div>
                </li>
              );
            })}
          </ol>
          {lead && (
            <p className="mt-4 border-t border-rule pt-3 text-sm text-ink-2">
              <span className="text-ink">{lead.hazard}.</span> Recurrence Watch found this chain on its own.
            </p>
          )}
        </div>
      </section>

      {/* Headline figures */}
      <section className="space-y-3" data-tour="stats">
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
          <StatTile value={s.n_chains.toLocaleString("en-GB")} label="recurrence chains, every quote verified" href="/chains" />
          <StatTile value={pct(s.share_diff_coroner)} label="of links where the later report came from a different coroner" href="/evaluation" />
          <StatTile value={pct(s.share_no_response)} label="of links where no published response to the earlier report was found" href="/methodology" />
          <StatTile value={c.after_promise.toLocaleString("en-GB")} label="times a concern was raised again after a stated action" href="/promises" />
        </div>
        <p className="flex items-center gap-1.5 text-xs text-muted">
          From {s.n_reports.toLocaleString("en-GB")} reports, 2013 to now. A link shows a concern was raised again, not why.
          <InfoTip text={GLOSSARY.after_promise} />
        </p>
      </section>

      {/* Showcase features */}
      <section className="space-y-4">
        <h2 className="font-serif text-2xl">Explore</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => {
            const Icon = f.icon;
            return (
              <Link key={f.href} href={f.href} className="card card-link group flex flex-col gap-3 p-5 hover:no-underline">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-soft text-accent" aria-hidden>
                  <Icon size={20} />
                </span>
                <span className="font-serif text-lg text-ink leading-snug">{f.title}</span>
                <span className="text-sm text-ink-2">{f.body}</span>
                <span className="mt-auto flex items-center justify-between pt-1 text-xs text-muted">
                  <span className="num">{f.stat}</span>
                  <ArrowRight size={15} className="text-accent transition-transform group-hover:translate-x-0.5" aria-hidden />
                </span>
              </Link>
            );
          })}
        </div>
      </section>

      <Section title="Featured recurrences" action={<Link href="/chains">All {s.n_chains} chains →</Link>}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {featured.map((ch) => (
            <ChainCard key={ch.key} c={ch} />
          ))}
        </div>
      </Section>

      <Section
        title="Latest recurrences"
        action={
          <Link href="/recent" className="inline-flex items-center gap-1">
            <Clock3 size={14} aria-hidden /> See all {recent.total}
          </Link>
        }
      >
        <ul className="space-y-3 p-0">
          {recent.rows.map((it) => (
            <RecentCard key={it.later.url + it.org.id} it={it} />
          ))}
        </ul>
      </Section>

      <section id="tour" className="space-y-4 scroll-mt-24">
        <div>
          <h2 className="font-serif text-2xl">The 60-second tour</h2>
          <p className="text-ink-2 text-sm">Four stops. Each opens the real tool, not a mock-up.</p>
        </div>
        <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 list-none p-0">
          {tour.map((t, i) => (
            <li key={t.title}>
              <Link href={t.href} className="card card-link flex h-full flex-col gap-2 p-4 hover:no-underline">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent text-accent-ink text-sm font-semibold num">{i + 1}</span>
                <span className="font-semibold text-ink">{t.title}</span>
                <span className="text-sm text-ink-2">{t.body}</span>
                <span className="mt-auto text-sm font-medium text-accent">{t.cta} →</span>
              </Link>
            </li>
          ))}
        </ol>
      </section>

      <section className="card p-5 sm:p-6 space-y-4">
        <h2 className="font-serif text-xl">How it works</h2>
        <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 list-none p-0 text-sm">
          {[
            { icon: FileWarning, t: "Read", d: "Every report and response on judiciary.uk, with OCR for scanned documents." },
            { icon: MessageSquareQuote, t: "Extract", d: "Nemotron Nano pulls out each concern and each stated action, with exact quotes." },
            { icon: Repeat2, t: "Link", d: "Within each organisation, later concerns are matched to earlier ones by meaning and wording." },
            { icon: Gavel, t: "Judge", d: "Nemotron Super decides if it is the same hazard. Every quote is checked word for word." },
          ].map(({ icon: Icon, t, d }, i) => (
            <li key={t} className="space-y-1">
              <div className="flex items-center gap-2">
                <Icon size={16} className="text-accent" aria-hidden />
                <span className="eyebrow">Step {i + 1}</span>
              </div>
              <div className="font-semibold text-ink">{t}</div>
              <p className="text-ink-2">{d}</p>
            </li>
          ))}
        </ol>
        <p className="border-t border-rule pt-3 text-sm text-muted">
          PFD Monitor groups concerns. The Preventable Deaths Tracker chases deadlines. Recurrence Watch tests whether
          promises held. <Link href="/nemotron">How Nemotron did the work →</Link>
        </p>
      </section>
    </div>
  );
}
