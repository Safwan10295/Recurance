import {
  ArrowRight,
  Clock3,
  Compass,
  Cpu,
  FileWarning,
  Gavel,
  MessageSquareQuote,
  Repeat2,
  ScanSearch,
  Unlink,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import AudienceCards from "@/components/AudienceCards";
import CostOdometer from "@/components/CostOdometer";
import HeroTimeline from "@/components/HeroTimeline";
import HundredDots from "@/components/HundredDots";
import { TourButton } from "@/components/shell/Tour";
import { ChainCard, RecentCard } from "@/components/cards";
import { InfoTip, Section, StatTile, btnPrimary, btnSecondary, formatDate, pct } from "@/components/ui";
import { q1 } from "@/lib/db";
import { GLOSSARY } from "@/lib/glossary";
import { getChain, getFeatured, getMeta, listRecent } from "@/lib/queries";
import { getMapPreview } from "@/lib/queries-map";

// The home page always tells one case: smart motorways (N3). It is shown here, not featured (D31).
const HERO_CHAIN = "c52cded99f756309";

async function counts() {
  return (
    (await q1<{ after_promise: number; points: number }>(
      `SELECT (SELECT COUNT(*)::int FROM pub_links WHERE payload->>'after_promise' IN ('1','true')) after_promise,
              (SELECT COUNT(*)::int FROM pub_hazard_points) points`,
    ).catch(() => null)) ?? { after_promise: 0, points: 0 }
  );
}

export default async function Home() {
  const [meta, featured, recent, c, hero, preview] = await Promise.all([
    getMeta(),
    getFeatured(),
    listRecent({ months: 12, size: 3, clearOnly: true }),
    counts(),
    getChain(HERO_CHAIN).then((r) => r.chain).catch(() => null),
    getMapPreview(),
  ]);
  const s = meta.site;
  const promises = hero ? hero.reports.slice(0, -1).reduce((n, r) => n + r.responses.reduce((m, rs) => m + rs.promises.length, 0), 0) : 0;
  // Later reports in the hero chain that cite an earlier one.
  const citedLater = hero ? new Set(hero.links.filter((l) => l.later_cites_earlier).map((l) => l.later)).size : 0;

  const problem: { icon: LucideIcon; title: string; body: string }[] = [
    {
      icon: FileWarning,
      title: "A coroner warns",
      body: hero ? `${formatDate(hero.first_date)}: a coroner tells ${hero.org.name} about a risk to life.` : "A coroner writes to an organisation about a risk to life.",
    },
    {
      icon: MessageSquareQuote,
      title: "The organisation responds",
      body: hero && promises ? `Its responses state ${promises} specific actions.` : "Within 56 days it must reply with what it will do.",
    },
    {
      icon: Repeat2,
      title: "It happens again",
      body: hero
        ? `The same concern is raised ${hero.n_reports - 1} more times, by ${hero.coroners.length - 1} other coroners, up to ${hero.last_date.slice(0, 4)}.`
        : "Years later, a similar death, in front of a different coroner.",
    },
    {
      icon: Unlink,
      title: "Nobody joins it up",
      body:
        hero && hero.links.length
          ? `In ${hero.links.filter((l) => !l.later_cites_earlier).length} of the ${hero.links.length} links in this chain, the later report does not cite the earlier one.`
          : "The later report rarely cites the earlier one.",
    },
  ];

  const more: { href: string; icon: LucideIcon; title: string; body: string; stat: string }[] = [
    { href: "/promises", icon: MessageSquareQuote, title: "Promises, then again", body: "Where a response stated an action and a later coroner raised the same concern.", stat: `${c.after_promise.toLocaleString("en-GB")} links` },
    { href: "/recent", icon: Clock3, title: "Recent recurrences", body: "New reports from the last year that repeat a warning already given.", stat: `${recent.total} reports` },
    { href: "/how-we-know", icon: Cpu, title: "How we know", body: "How Nemotron did the work, how well it does against baselines, and the safeguards.", stat: "Nemotron, evaluation, methodology" },
  ];

  return (
    <div className="space-y-14">
      {/* Hero */}
      <section className="grid gap-8 lg:grid-cols-[1.1fr_1fr] lg:items-center">
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
            <Link href={`/chains/${HERO_CHAIN}`} className={`${btnSecondary} px-4 py-2.5`}>
              See a recurrence <ArrowRight size={16} aria-hidden />
            </Link>
            <TourButton className={`${btnSecondary} px-4 py-2.5`}>
              <Compass size={16} aria-hidden /> Take the guided tour
            </TourButton>
          </div>
        </div>

        {hero ? (
          <HeroTimeline
            chainKey={hero.key}
            hazard={hero.hazard}
            orgName={hero.org.name}
            reports={hero.reports.map((r) => ({ date: r.date, area: r.area, coroner: r.coroner }))}
            citedLater={citedLater}
          />
        ) : (
          <div data-tour="problem" />
        )}
      </section>

      {/* The three things to try (N2) */}
      <section aria-labelledby="try-heading" className="space-y-4">
        <h2 id="try-heading" className="sr-only">
          Try it
        </h2>
        <div className="grid gap-3 md:grid-cols-3">
          <Link href="/brief" className="card card-link group flex flex-col gap-3 p-5 hover:no-underline">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent text-accent-ink" aria-hidden>
              <ScanSearch size={22} />
            </span>
            <span className="font-serif text-xl leading-snug text-ink">Check a report</span>
            <span className="text-sm text-ink-2">Give any report. Watch Nemotron search, judge and verify, step by step, with every quote checked.</span>
            <span className="mt-auto flex items-center justify-between pt-1 text-sm font-medium text-accent">
              Watch the agent <ArrowRight size={16} className="transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden />
            </span>
          </Link>
          <Link href="/judge" className="card card-link group flex flex-col gap-3 p-5 hover:no-underline">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent text-accent-ink" aria-hidden>
              <Gavel size={22} />
            </span>
            <span className="font-serif text-xl leading-snug text-ink">You be the judge</span>
            <span className="text-sm text-ink-2">Two concerns, years apart. Same hazard or not? Then see what Nemotron Super decided, and why.</span>
            <span className="mt-auto flex items-center justify-between pt-1 text-sm font-medium text-accent">
              Play eight rounds <ArrowRight size={16} className="transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden />
            </span>
          </Link>
          <Link href="/map" className="card card-link group flex flex-col overflow-hidden hover:no-underline">
            {preview && (
              <svg viewBox="-2 4 104 92" className="block h-32 w-full bg-paper-2/60 py-2" aria-hidden preserveAspectRatio="xMidYMid meet">
                <path d={preview.plain} strokeWidth={1.1} strokeLinecap="round" className="stroke-[var(--dot)]" />
                <path d={preview.chained} strokeWidth={1.3} strokeLinecap="round" className="stroke-[var(--accent)] opacity-60" />
              </svg>
            )}
            <span className="flex flex-1 flex-col gap-2 p-5 pt-4">
              <span className="font-serif text-xl leading-snug text-ink">Hazard map</span>
              <span className="text-sm text-ink-2">
                Every one of {c.points.toLocaleString("en-GB")} concerns, placed by meaning, with the recurrences drawn between them.
              </span>
              <span className="mt-auto flex items-center justify-between pt-1 text-sm font-medium text-accent">
                Explore the map <ArrowRight size={16} className="transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden />
              </span>
            </span>
          </Link>
        </div>
      </section>

      {/* A2: the share of links where memory was lost */}
      <HundredDots notCited={s.share_not_cited} diffCoroner={s.share_diff_coroner} nLinks={s.n_links} />

      {/* The problem, step by step, in the hero case */}
      <section className="space-y-3" aria-labelledby="problem-heading">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="problem-heading" className="font-serif text-2xl">How a warning gets lost</h2>
          {hero && (
            <Link href={`/chains/${hero.key}`} className="text-sm">
              Read the smart motorway chain →
            </Link>
          )}
        </div>
        <ol className="grid list-none gap-3 p-0 sm:grid-cols-2 lg:grid-cols-4">
          {problem.map((p, i) => {
            const Icon = p.icon;
            const last = i === problem.length - 1;
            return (
              <li key={p.title} className="card flex flex-col gap-2 p-4">
                <span
                  className={`flex h-9 w-9 items-center justify-center rounded-full ${
                    last ? "bg-sand-soft text-sand" : i === 0 ? "bg-accent text-accent-ink" : "bg-accent-soft text-accent"
                  }`}
                  aria-hidden
                >
                  <Icon size={17} />
                </span>
                <p className="font-medium leading-snug text-ink">{p.title}</p>
                <p className="text-sm text-ink-2">{p.body}</p>
              </li>
            );
          })}
        </ol>
      </section>

      <AudienceCards />

      {/* Headline figures */}
      <section className="space-y-3" data-tour="stats">
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
          <StatTile value={s.n_chains.toLocaleString("en-GB")} label="recurrence chains, every quote verified" href="/chains" />
          <StatTile value={pct(s.share_no_response)} label="of links where no published response to the earlier report was found" href="/how-we-know/methodology" />
          <StatTile value={c.after_promise.toLocaleString("en-GB")} label="times a concern was raised again after a stated action" href="/promises" />
          <Link href="/how-we-know" className="col-span-2 lg:col-span-1 hover:no-underline">
            <CostOdometer total={s.spend.total} chains={s.n_chains} label="to read the whole archive on Token Factory" compact />
          </Link>
        </div>
        <p className="flex items-center gap-1.5 text-xs text-muted">
          From {s.n_reports.toLocaleString("en-GB")} reports, 2013 to now. A link shows a concern was raised again, not why.
          <InfoTip text={GLOSSARY.after_promise} />
        </p>
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

      <section className="space-y-4">
        <h2 className="font-serif text-2xl">More to explore</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {more.map((f) => {
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
                  <ArrowRight size={15} className="text-accent transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden />
                </span>
              </Link>
            );
          })}
        </div>
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
          promises held. <Link href="/how-we-know">How Nemotron did the work →</Link>
        </p>
      </section>
    </div>
  );
}
