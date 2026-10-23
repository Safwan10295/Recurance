import { ArrowRight, Building2, Clock3, Compass, Cpu, Gavel, Map, MessageSquareQuote, ScanSearch, type LucideIcon } from "lucide-react";
import Link from "next/link";
import HomeAgent, { type HomeAgentMatch } from "@/components/HomeAgent";
import SpineTimeline from "@/components/SpineTimeline";
import { TourButton } from "@/components/shell/Tour";
import { ChainCard } from "@/components/cards";
import { Section, pct } from "@/components/ui";
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
const WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];
const word = (n: number) => WORDS[n] ?? n.toLocaleString("en-GB");
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

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

  // The hero, all from the chain's own data: when it was first raised, how many coroners, over how long, and
  // whether any later report cited an earlier one.
  const reports = hero ? [...hero.reports].sort((a, b) => a.date.localeCompare(b.date)) : [];
  const cites = (url: string) => !!hero?.links.some((l) => l.later === url && l.later_cites_earlier);
  const citedLater = reports.slice(1).filter((r) => cites(r.url)).length;
  const years = hero ? Math.round((Date.parse(hero.last_date) - Date.parse(hero.first_date)) / (365.25 * 86_400_000)) : 0;
  // What each report said: the quote of the strongest link into it (or, for the first, out of it), with that link's
  // relation and confidence, so every quote shown keeps its verdict and its source.
  // A report that no later link points back from (only forward to later reports) takes its quote from that forward
  // link, and gets no cited or not-cited tag: with no link into it, whether it cited anything is unknown.
  const spine = reports.map((r) => {
    const links = hero?.links ?? [];
    const best = <T extends { confidence: number }>(ls: T[]) => [...ls].sort((a, b) => b.confidence - a.confidence)[0];
    const into = best(links.filter((l) => l.later === r.url));
    const out = best(links.filter((l) => l.earlier === r.url));
    const link = into ?? out;
    return {
      date: r.date,
      area: r.area,
      cites: into ? cites(r.url) : null,
      url: r.url,
      quote: into ? into.later_quote : out ? out.earlier_quote : null,
      relation: link?.relation ?? null,
      confidence: link?.confidence ?? null,
    };
  });
  const lede = hero
    ? `${hero.hazard}. ${cap(word(hero.coroners.length))} coroners, ${word(years)} years. ${
        citedLater === 0 ? "None of the later reports cited the first." : `${cap(word(citedLater))} of the later reports cited an earlier one.`
      }`
    : "";

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
    { href: "/how-we-know", icon: Cpu, title: "How we know", body: "Which model did what, what it cost, how well it does against baselines, and the safeguards.", stat: "Nemotron, evaluation, methodology" },
  ];

  return (
    <div>
      {/* Hero (Spine): the left column says what happened; the right column is the time it took, to scale. */}
      {hero && (
        <section className="mx-auto grid max-w-[1360px] gap-x-14 gap-y-8 px-[18px] pb-14 pt-6 min-[900px]:px-10 min-[1180px]:grid-cols-[minmax(0,1fr)_600px] min-[1180px]:grid-rows-[auto_1fr] xl:px-16">
          <div className="flex flex-col gap-6 min-[1180px]:col-start-1 min-[1180px]:row-start-1 min-[1180px]:pt-[72px]">
            {/* On desktop the rail shows only the logo, so the name is said once here; phones have it in the top bar. */}
            <p className="eyebrow m-0 hidden min-[900px]:block">Recurrence Watch · coroners&apos; reports, England and Wales</p>
            <span className="inline-flex items-center gap-2 self-start rounded-full border border-rule bg-surface px-3.5 py-1.5 text-[13.5px] font-semibold">
              <Building2 size={14} aria-hidden /> {hero.org.name} · {reports.length} reports
            </span>
            <h1 className="m-0 text-[42px] font-extrabold leading-[0.98] tracking-[-0.035em] min-[900px]:text-[clamp(52px,5.3vw,76px)] min-[900px]:tracking-[-0.04em]">
              Raised in {hero.first_date.slice(0, 4)}.
              <br /> Raised again.
              <br /> And again.
            </h1>
            <p className="m-0 max-w-[520px] text-[17px] leading-[1.55] text-ink-2 min-[900px]:text-[19px]">
              {lede}{" "}
              <span className="min-[1180px]:hidden">The space below is time, to scale.</span>
              <span className="hidden min-[1180px]:inline">The space on the right is time, to scale.</span>
            </p>
          </div>

          <div className="min-[1180px]:col-start-2 min-[1180px]:row-span-2 min-[1180px]:row-start-1">
            <SpineTimeline chainKey={hero.key} reports={spine} />
          </div>

          <div className="flex flex-col gap-6 min-[1180px]:col-start-1 min-[1180px]:row-start-2">
            <div className="flex max-w-[520px] flex-col gap-2.5">
              <Link
                href="/brief"
                className="group flex items-center gap-3.5 rounded-2xl bg-primary px-5 py-[18px] text-primary-ink transition-colors hover:bg-primary-hover hover:no-underline"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-accent-bright text-[#161a17]" aria-hidden>
                  <ScanSearch size={18} />
                </span>
                <span className="flex flex-1 flex-col">
                  <b className="text-lg font-bold">Check a report</b>
                  <span className="text-sm opacity-80">Watch the agent work, step by step</span>
                </span>
                <ArrowRight size={18} className="transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden />
              </Link>
              <div className="grid grid-cols-2 gap-2.5">
                {[
                  { href: "/judge", label: "You be the judge", icon: Gavel },
                  { href: "/map", label: "Hazard map", icon: Map },
                ].map(({ href, label, icon: Icon }) => (
                  <Link
                    key={href}
                    href={href}
                    className="flex items-center gap-3 rounded-2xl border border-rule bg-surface p-4 text-ink transition-colors hover:border-ink hover:no-underline"
                  >
                    <Icon size={18} className="shrink-0 text-accent" aria-hidden />
                    <b className="text-base font-bold leading-tight">{label}</b>
                  </Link>
                ))}
              </div>
              <TourButton className="inline-flex items-center gap-1.5 self-start pt-1 text-sm font-medium text-accent-text hover:underline">
                <Compass size={15} aria-hidden /> Take the 60-second tour
              </TourButton>
            </div>
            <dl className="m-0 mt-auto flex flex-wrap gap-x-8 gap-y-4 pb-2 text-sm text-ink-2 min-[1180px]:pb-10" data-tour="stats">
              {[
                [pct(s.share_not_cited), "later reports don't cite"],
                [pct(s.share_diff_coroner), "different coroner"],
                [`$${s.spend.total.toFixed(2)}`, "whole archive"],
              ].map(([v, l]) => (
                <div key={l}>
                  <dt className="sr-only">{l}</dt>
                  <dd className="m-0">
                    <b className="block text-2xl font-bold text-ink num">{v}</b>
                    {l}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </section>
      )}

      <div className="mx-auto max-w-6xl space-y-16 px-4 pb-16 sm:px-6 lg:px-8">
        {/* What the reader is looking at, for anyone who has not met a coroner's report before */}
        <section aria-labelledby="system-heading" className="space-y-5 border-t border-rule pt-12">
          <h2 id="system-heading" className="text-2xl font-bold tracking-tight">
            What you are looking at
          </h2>
          <ol className="m-0 grid list-none gap-6 p-0 md:grid-cols-3">
            {[
              "When a death reveals a risk to others, the coroner writes to the organisation that can act. This is a Prevention of Future Deaths report.",
              "The organisation has 56 days to reply with what it will do.",
              "Years later, a similar death comes before a different coroner, who has no practical way to know the warning was given before.",
            ].map((t, i) => (
              <li key={i} className="flex gap-3.5">
                <span aria-hidden className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-ink num">
                  {i + 1}
                </span>
                <span className="text-ink-2">{t}</span>
              </li>
            ))}
          </ol>
          <p className="max-w-3xl text-lg text-ink">
            Recurrence Watch read all {s.n_reports.toLocaleString("en-GB")} reports since 2013 and found{" "}
            {s.n_chains.toLocaleString("en-GB")} concerns raised again with the same organisation, each shown in the exact words of
            both reports.
          </p>
        </section>

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

        <Section title="More repeated warnings" action={<Link href="/chains">All {s.n_chains} →</Link>}>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {featured.map((ch) => (
              <ChainCard key={ch.key} c={ch} />
            ))}
          </div>
        </Section>

        <section className="space-y-4">
          <h2 className="text-2xl font-bold tracking-tight">More to explore</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Link href="/map" className="card card-link group flex flex-col overflow-hidden hover:no-underline">
              {preview && (
                <svg viewBox="-2 4 104 92" className="block h-28 w-full bg-paper-2 py-2" aria-hidden preserveAspectRatio="xMidYMid meet">
                  <path d={preview.plain} strokeWidth={1.1} strokeLinecap="round" className="stroke-[var(--dot)]" />
                  <path d={preview.chained} strokeWidth={1.3} strokeLinecap="round" className="stroke-[var(--accent)] opacity-70" />
                </svg>
              )}
              <span className="flex flex-1 flex-col gap-2 p-5 pt-4">
                <span className="text-lg font-bold leading-snug text-ink">Hazard map</span>
                <span className="text-sm text-ink-2">
                  All {c.points.toLocaleString("en-GB")} concerns, similar ones close together, repeats joined by lines.
                </span>
              </span>
            </Link>
            {more.map((f) => {
              const Icon = f.icon;
              return (
                <Link key={f.href} href={f.href} className="card card-link group flex flex-col gap-3 p-5 hover:no-underline">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-soft text-accent" aria-hidden>
                    <Icon size={20} />
                  </span>
                  <span className="text-lg font-bold leading-snug text-ink">{f.title}</span>
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
            Other tools group coroners&apos; concerns by theme or track reply deadlines. Recurrence Watch asks a different question:
            did the same concern come back to the same organisation after it replied?
          </p>
        </section>
      </div>
    </div>
  );
}
