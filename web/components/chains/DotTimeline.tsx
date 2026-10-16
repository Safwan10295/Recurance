import { formatDate } from "@/components/ui";

const DAY = 86_400_000;

function toTime(iso: string): number {
  return new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso).getTime();
}

// One dot per report on a thin line from the first report to the last, placed by date.
// The first report (the earliest warning) is filled; later reports are outlined.
export default function DotTimeline({ dates, className = "" }: { dates: string[]; className?: string }) {
  const ds = dates
    .filter(Boolean)
    .map((d) => ({ d, t: toTime(d) }))
    .filter((x) => !isNaN(x.t))
    .sort((a, b) => a.t - b.t);
  if (ds.length < 2) return null;
  const first = ds[0];
  const last = ds[ds.length - 1];
  const span = Math.max(DAY, last.t - first.t);
  const label = `${ds.length} reports, ${formatDate(first.d)} to ${formatDate(last.d)}`;
  return (
    <span className={`flex items-center gap-2 text-xs text-muted num ${className}`} role="img" aria-label={label}>
      <span aria-hidden>{first.d.slice(0, 4)}</span>
      <span aria-hidden className="relative h-3 min-w-12 flex-1 mx-1">
        <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-rule" />
        {ds.map((x, i) => (
          <span
            key={i}
            title={formatDate(x.d)}
            style={{ left: `${((x.t - first.t) / span) * 100}%` }}
            className={`absolute top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-accent ${
              i === 0 ? "bg-accent" : "bg-surface"
            }`}
          />
        ))}
      </span>
      <span aria-hidden>{last.d.slice(0, 4)}</span>
    </span>
  );
}
