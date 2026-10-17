// A small, quiet motif for the 404 and error pages: a timeline whose last link is missing.
export default function LostDots() {
  return (
    <svg viewBox="0 0 220 60" className="h-14 w-auto" aria-hidden>
      <line x1={10} x2={210} y1={40} y2={40} className="stroke-rule" strokeWidth={1.5} />
      <path d="M 30 40 Q 70 6 110 40" fill="none" className="stroke-[var(--accent)]" strokeWidth={1.5} opacity={0.7} />
      <path d="M 110 40 Q 150 6 190 40" fill="none" className="stroke-[var(--muted)]" strokeWidth={1.5} strokeDasharray="3 5" opacity={0.7} />
      <circle cx={30} cy={40} r={6} className="fill-[var(--accent)]" />
      <circle cx={110} cy={40} r={5} strokeWidth={2} className="fill-[var(--surface)] stroke-[var(--accent)]" />
      <circle cx={190} cy={40} r={5} strokeWidth={2} strokeDasharray="2 3" className="fill-[var(--surface)] stroke-[var(--muted)]" />
    </svg>
  );
}
