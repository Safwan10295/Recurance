import Link from "next/link";
import { formatDate, pct } from "@/components/ui";
import type { ChainDetail } from "@/lib/types";

const DAY = 86_400_000;
const t = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00Z`).getTime();

// The hero: one real chain drawn to scale, its reports appearing one after another, and two figures
// across every shown link. All values come from the published database.
export default function HeroTimeline({
  chain,
  notCited,
  diffCoroner,
  nLinks,
}: {
  chain: ChainDetail;
  notCited: number;
  diffCoroner: number;
  nLinks: number;
}) {
  const reports = [...chain.reports].sort((a, b) => a.date.localeCompare(b.date));
  const t0 = t(reports[0].date);
  const span = Math.max(DAY, t(reports[reports.length - 1].date) - t0);
  const years = (span / (365.25 * DAY)).toFixed(1).replace(/\.0$/, "");
  const promises = reports.slice(0, -1).reduce((n, r) => n + r.responses.reduce((m, rs) => m + rs.promises.length, 0), 0);
  // 6% padding at each end so the first and last labels stay inside the card.
  const x = (iso: string) => 6 + ((t(iso) - t0) / span) * 88;

  return (
    <div className="card p-5 sm:p-6 shadow-[var(--shadow-lg)]" data-tour="problem">
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <p className="eyebrow">The problem, in a real case</p>
        <Link href={`/chains/${chain.key}`} className="text-xs">
          Open the chain →
        </Link>
      </div>
      <p className="font-serif text-lg leading-snug text-ink">{chain.hazard}</p>
      <p className="text-sm text-ink-2">
        {reports.length} coroners&apos; reports to {chain.org.name} over {years} years
        {promises ? `, after responses stating ${promises} actions` : ""}.
      </p>

      <div
        className="relative mt-5 mb-2 h-24"
        role="img"
        aria-label={`${reports.length} reports on the same concern, ${formatDate(reports[0].date)} to ${formatDate(reports[reports.length - 1].date)}`}
      >
        <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-rule" aria-hidden />
        <span className="hero-line absolute left-[6%] right-[6%] top-1/2 h-0.5 -translate-y-1/2 origin-left bg-accent" aria-hidden />
        {reports.map((r, i) => {
          const above = i % 2 === 1;
          return (
            <span
              key={r.url}
              aria-hidden
              className="hero-dot absolute top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center"
              style={{ left: `${x(r.date)}%`, animationDelay: `${200 + (i * 1400) / Math.max(1, reports.length - 1)}ms` }}
              title={`${formatDate(r.date)}${r.area ? `, ${r.area}` : ""}`}
            >
              <span
                className={`absolute num text-[11px] leading-none whitespace-nowrap ${above ? "bottom-5" : "top-5"} ${
                  i === 0 ? "left-0" : i === reports.length - 1 ? "right-0" : "left-1/2 -translate-x-1/2"
                } ${
                  i === 0 ? "font-semibold text-accent" : "text-muted"
                }`}
              >
                {i === 0 ? `${r.date.slice(0, 4)} first warning` : r.date.slice(0, 4)}
              </span>
              <span
                className={`block h-3.5 w-3.5 rounded-full border-2 border-accent ${i === 0 ? "bg-accent" : "bg-surface"}`}
              />
            </span>
          );
        })}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 border-t border-rule pt-4">
        <div>
          <p className="font-serif text-3xl leading-none text-ink num">{pct(notCited)}</p>
          <p className="mt-1 text-xs text-ink-2">of links where the later report does not cite the earlier one</p>
        </div>
        <div>
          <p className="font-serif text-3xl leading-none text-ink num">{pct(diffCoroner)}</p>
          <p className="mt-1 text-xs text-ink-2">of links where the later report came from a different coroner</p>
        </div>
      </div>
      <p className="mt-3 text-xs text-muted">
        Across all {nLinks.toLocaleString("en-GB")} links shown, each with verified quotes from both reports.
      </p>
    </div>
  );
}
