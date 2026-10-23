"use client";

import Link from "next/link";
import { useMotion } from "@/components/motion/useMotion";

export type SpineReport = { date: string; area: string | null; cites: boolean };

const ROW = 28; // px, one report row
const DRAW_MS = 2400; // the line takes this long top to bottom; each report appears as the line reaches it
const MONTH_MS = 30.44 * 86_400_000;

const month = (iso: string) =>
  new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });
const months = (a: string, b: string) => Math.max(0, Math.round((Date.parse(b) - Date.parse(a)) / MONTH_MS));
const gapText = (m: number) => (m === 0 ? "Same month" : m === 1 ? "1 month" : m < 24 ? `${m} months` : `${(m / 12).toFixed(m % 12 ? 1 : 0)} years`);
// Area names like "South Yorkshire (West)" keep their detail on desktop and drop it on a phone.
const shortArea = (a: string | null) => (a ?? "").split(" (")[0];

// The Spine hero (design_handoff_spine): distance down the page is time. Each report in the chain sits on one vertical
// line, the space between two reports is the months between them, to scale. Reports are labelled by number, month and
// coroner area only, never by the name of the person who died.
export default function SpineTimeline({ chainKey, reports: raw }: { chainKey: string; reports: SpineReport[] }) {
  const reports = [...raw].sort((a, b) => a.date.localeCompare(b.date));
  const gaps = reports.map((r, i) => (i ? months(reports[i - 1].date, r.date) : 0));
  const span = gaps.reduce((a, b) => a + b, 0);
  // 9px a month on desktop, tightened so a long chain still fits in about 640px; 5px a month on a phone.
  const perMonth = span * 9 > 640 ? 640 / span : 9;
  const deskGap = (m: number) => Math.max(m * perMonth - ROW, 0);
  const phoneGap = (m: number) => Math.max(m * Math.min(5, perMonth) - 20, 4);

  // When the line reaches each row: its distance down the drawn spine, as a share of the whole.
  let y = 0;
  const at: number[] = [];
  reports.forEach((_, i) => {
    y += i ? deskGap(gaps[i]) : 0;
    at.push(y);
    y += ROW;
  });
  const total = Math.max(1, y - ROW / 2);
  const delay = (i: number) => Math.round(200 + ((at[i] + ROW / 2) / total) * DRAW_MS);

  const { ref, state } = useMotion<HTMLDivElement>("spine", { session: true, threshold: 0.15 });
  const d = (ms: number) => ({ "--d": `${ms}ms` }) as React.CSSProperties;
  const label = (r: SpineReport, i: number) => (i === 0 ? "First warning" : r.cites ? "Cites earlier" : "Not cited");

  return (
    <div ref={ref} data-m="spine" data-state={state} className="rw-m" data-tour="problem">
      {/* Desktop: the line at 120px, gap labels to its left, report rows to its right */}
      <ol aria-label={`${reports.length} reports, gaps to scale`} className="relative m-0 hidden list-none p-0 pt-12 min-[900px]:block">
        <span
          aria-hidden
          className="m-growy absolute left-[120px] top-14 w-0.5 bg-ink"
          style={{ bottom: ROW / 2, "--dur": `${DRAW_MS}ms`, "--d": "150ms", transitionTimingFunction: "linear" } as React.CSSProperties}
        />
        {reports.map((r, i) => {
          const gap = deskGap(gaps[i]);
          const roomy = gap >= 18;
          return (
            <li key={r.date + i} className="relative">
              {i > 0 && (
                <div className="flex items-center" style={{ height: gap }} aria-hidden>
                  {roomy && (
                    <span className="m-fade w-[104px] text-right text-[12.5px] font-bold text-accent" style={d(delay(i) + 150)}>
                      {gapText(gaps[i])}
                    </span>
                  )}
                </div>
              )}
              <span
                aria-hidden
                className={`m-pop absolute bottom-1.5 left-[113px] h-4 w-4 rounded-full border-[3px] border-paper ${i === 0 ? "bg-ink" : "bg-accent"}`}
                style={d(delay(i))}
              />
              <Link
                href={`/chains/${chainKey}#report-${i + 1}`}
                className="m-rise relative flex min-h-7 items-center gap-3.5 rounded-lg pl-[144px] pr-2 text-ink hover:bg-surface hover:no-underline"
                style={d(delay(i))}
              >
                {i > 0 && !roomy && (
                  <span aria-hidden className="absolute left-0 w-[104px] text-right text-[12.5px] font-bold text-accent">
                    {gapText(gaps[i])}
                  </span>
                )}
                {i > 0 && <span className="sr-only">{gapText(gaps[i])} later: </span>}
                <b className="w-[72px] shrink-0 text-sm font-bold">{month(r.date)}</b>
                <span className="min-w-0 truncate text-[14.5px]">
                  Report {i + 1}
                  {r.area ? ` · ${r.area}` : ""}
                </span>
                <span
                  className={`shrink-0 rounded-md px-2 py-0.5 text-xs font-bold ${
                    i === 0 ? "bg-primary text-primary-ink" : "border border-rule bg-surface text-accent-text"
                  }`}
                >
                  {label(r, i)}
                </span>
              </Link>
            </li>
          );
        })}
      </ol>

      {/* Phone: the line is the list's left edge */}
      <ol aria-label={`${reports.length} reports, gaps to scale`} className="m-0 list-none border-l-2 border-ink py-0 pl-[22px] min-[900px]:hidden">
        {reports.map((r, i) => (
          <li key={r.date + i} className="relative">
            {i > 0 && <div style={{ height: phoneGap(gaps[i]) }} aria-hidden />}
            <span
              aria-hidden
              className={`m-pop absolute -left-[29px] bottom-1.5 h-3 w-3 rounded-full border-2 border-paper ${i === 0 ? "bg-ink" : "bg-accent"}`}
              style={d(delay(i))}
            />
            <Link href={`/chains/${chainKey}#report-${i + 1}`} className="m-rise block py-0.5 text-sm text-ink hover:no-underline" style={d(delay(i))}>
              {i > 0 && <span className="sr-only">{gapText(gaps[i])} later: </span>}
              <b>{month(r.date)}</b> · {shortArea(r.area) || `Report ${i + 1}`}
              {i === 0 && <span className="ml-2 rounded-md bg-primary px-1.5 py-0.5 text-[11px] font-bold text-primary-ink">First warning</span>}
            </Link>
          </li>
        ))}
      </ol>
    </div>
  );
}
