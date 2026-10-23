import { ArrowRight, Clock3, Compass, Cpu, Gavel, MessageSquareQuote, ScanSearch, type LucideIcon } from "lucide-react";
import Link from "next/link";
import HeroTimeline from "@/components/HeroTimeline";
import HomeAgent, { type HomeAgentMatch } from "@/components/HomeAgent";
import HundredDots from "@/components/HundredDots";
import { TourButton } from "@/components/shell/Tour";
import { ChainCard } from "@/components/cards";
import { Section, btnPrimary, btnSecondary } from "@/components/ui";
import { q1 } from "@/lib/db";
import { getPrecomputed } from "@/lib/precomputed";
import { getChain, getFeatured, getMeta, listRecent } from "@/lib/queries";
import { getMapPreview } from "@/lib/queries-map";

// The home page always tells one case: smart motorways (N3). It is shown here, not featured (D31).
const HERO_CHAIN = "c52cded99f756309";
// The report whose recorded agent run is replayed on the home page: a 2023 report in the same chain.
const AGENT_REPORT = "david-levett-prevention-of-future-deaths-report";
// Top-level steps; the agent's own rounds happen inside "agent", so they are not counted twice.
const TIMED = new Set(["fetch", "org", "extract", "agent", "verify", "brief"]);

async function counts() {
  return (
    (await q1<{ after_promise: number; points: number }>(
      `SELECT (SELECT COUNT(*)::int FROM pub_links WHERE payload->>'after_promise' IN ('1','true')) after_promise,
              (SELECT COUNT(*)::int FROM pub_hazard_points) points`,
    ).catch(() => null)) ?? { after_promise: 0, points: 0 }
  );
}

export default async function Home() {
  const [meta, featured, recent, c, hero, preview, pre] = await Promise.all([
    getMeta(),
    getFeatured(),
    listRecent({ months: 12, size: 1, clearOnly: true }),
    counts(),
    getChain(HERO_CHAIN).then((r) => r.chain).catch(() => null),
    getMapPreview(),
    getPrecomputed().then((m) => m.get(AGENT_REPORT) ?? null).catch(() => null),
  ]);
  const s = meta.site;
  // Later reports in the hero chain that cite an earlier one.
  const citedLater = hero ? new Set(hero.links.filter((l) => l.later_cites_earlier).map((l) => l.later)).size : 0;

  const m0 = pre?.result.matches[0];
  const firstMatch: HomeAgentMatch | null = m0
    ? {
        date: m0.earlier.date,
        area: m0.earlier.area,
        relation: m0.relation as HomeAgentMatch["relation"],
        confidence: m0.confidence,
        earlierQuote: m0.earlier_quote,
        laterQuote: m0.later_quote,
        earlierUrl: m0.earlier.url,
      }
    : null;

  const more: { href: string; icon: LucideIcon; title: string; body: string; stat: string }[] = [
    { href: "/promises", icon: MessageSquareQuote, title: "Promises, then again", body: "A response stated an action, then a later coroner raised the same concern.", stat: `${c.after_promise.toLocaleString("en-GB")} cases` },
    { href: "/recent", icon: Clock3, title: "Recent repeats", body: "Reports from the last year that repeat a warning already given.", stat: `${recent.total} reports` },
    { href: "/how-we-know", icon: Cpu, title: "How we know", body: "Which model did what, what it cost, how well it does against baselines, and the safeguards.", stat: `$${s.spend.total.toFixed(2)} for the whole archive` },
  ];

  return (
    <div className="space-y-16">
      {/* Hero: what happens in England and Wales, and what this does about it */}
      <section className="grid gap-8 lg:grid-cols-[1.1fr_1fr] lg:items-center">
        <div className="space-y-5">
          <p className="eyebrow">Coroners&apos; reports · England and Wales</p>
          <h1 className="font-serif text-[1.95rem] sm:text-[2.35rem] xl:text-[2.55rem] leading-[1.12] tracking-tight">
            Coroners warn. Organisations reply. Then the same concern comes back.
          </h1>
          <ol className="max-w-xl list-none space-y-2.5 p-0 text-ink-2">
            {[
              "When a death reveals a risk to others, the coroner writes to the organisation that can act. This is a Prevention of Future Deaths report.",
              "The organisation has 56 days to reply with what it will do.",
              "Years later, a similar death comes before a different coroner, who has no practical way to know the warning was given before.",
            ].map((t, i) => (
              <li key={i} className="flex gap-3">
                <span aria-hidden className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-semibold text-accent num">
                  {i + 1}
                </span>
                <span>{t}</span>
              </li>
            ))}
          </ol>
          <p className="max-w-xl text-lg leading-relaxed text-ink">
            Recurrence Watch read all {s.n_reports.toLocaleString("en-GB")} reports since 2013 and found{" "}
            {s.n_chains.toLocaleString("en-GB")} concerns raised again with the same organisation, each shown in the exact words
            of both reports.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link href="/brief" className={`${btnPrimary} px-4 py-2.5`}>
              <ScanSearch size={17} aria-hidden /> Check a report
            </Link>
            <Link href={`/chains/${HERO_CHAIN}`} className={`${btnSecondary} px-4 py-2.5`}>
              See a repeated warning <ArrowRight size={16} aria-hidden />
            </Link>
            <TourButton className={`${btnSecondary} px-4 py-2.5`}>
              <Compass size={16} aria-hidden /> Take the tour
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

      {/* The agent at work on a real report */}
      {pre && pre.result.report?.date && (
        <HomeAgent
          steps={pre.steps}
          org={pre.result.organisation?.name ?? "the organisation"}
          reportDate={pre.result.report.date}
          reportUrl={pre.result.report.url}
          searched={pre.result.searched}
          matches={pre.result.matches.length}
          first={firstMatch}
          seconds={pre.steps.filter((x) => TIMED.has(x.id)).reduce((a, x) => a + (x.ms ?? 0), 0) / 1000}
          cost={pre.result.cost ?? pre.steps.reduce((a, x) => a + (x.cost ?? 0), 0)}
          briefHref={`/brief?report=${AGENT_REPORT}&run=1`}
        />
      )}

      {/* The three things to try (N2) */}
      <section aria-labelledby="try-heading" className="space-y-4">
        <h2 id="try-heading" className="font-serif text-2xl">
          Try it yourself
        </h2>
        <div className="grid gap-3 md:grid-cols-3">
          <Link href="/brief" className="card card-link group flex flex-col gap-3 p-5 hover:no-underline">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent text-accent-ink" aria-hidden>
              <ScanSearch size={22} />
            </span>
            <span className="font-serif text-xl leading-snug text-ink">Check a report</span>
            <span className="text-sm text-ink-2">Pick any report, or paste a new one, and watch the agent look for earlier warnings.</span>
            <span className="mt-auto flex items-center justify-between pt-1 text-sm font-medium text-accent">
              Check a report <ArrowRight size={16} className="transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden />
            </span>
          </Link>
          <Link href="/judge" className="card card-link group flex flex-col gap-3 p-5 hover:no-underline">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent text-accent-ink" aria-hidden>
              <Gavel size={22} />
            </span>
            <span className="font-serif text-xl leading-snug text-ink">You be the judge</span>
            <span className="text-sm text-ink-2">Two concerns, years apart. Is it the same danger? Decide, then see what Nemotron Super said.</span>
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
                All {c.points.toLocaleString("en-GB")} concerns, with similar ones close together and the repeats joined by lines.
              </span>
              <span className="mt-auto flex items-center justify-between pt-1 text-sm font-medium text-accent">
                Explore the map <ArrowRight size={16} className="transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden />
              </span>
            </span>
          </Link>
        </div>
      </section>

      {/* A2: across every link, how often the earlier warning was lost */}
      <div data-tour="stats">
        <HundredDots notCited={s.share_not_cited} diffCoroner={s.share_diff_coroner} nLinks={s.n_links} />
      </div>

      <Section title="More repeated warnings" action={<Link href="/chains">All {s.n_chains} →</Link>}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {featured.map((ch) => (
            <ChainCard key={ch.key} c={ch} />
          ))}
        </div>
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
        <p className="text-sm text-muted">
          Other tools group coroners&apos; concerns by theme or track reply deadlines. Recurrence Watch asks a different question: did
          the same concern come back to the same organisation after it replied?
        </p>
      </section>
    </div>
  );
}
