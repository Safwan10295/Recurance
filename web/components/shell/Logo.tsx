// The Recurance mark: a lowercase r drawn as the timeline. The stem ends in the first warning; the arm loops round
// to a second dot, the same warning raised again. Paths match app/icon.svg and the share images.
export const MARK = {
  stem: "M22 48V20",
  arm: "M22 30c0-7 6-11 13-11h7",
  first: { cx: 22, cy: 48, r: 5 },
  again: { cx: 44, cy: 19, r: 5 },
};

export function LogoMark({ size = 40, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden className={className}>
      <rect width="64" height="64" rx="17" fill="#88c99e" />
      <path d={MARK.stem} stroke="#161a17" strokeWidth="6" strokeLinecap="round" />
      <path d={MARK.arm} fill="none" stroke="#161a17" strokeWidth="6" strokeLinecap="round" />
      <circle {...MARK.first} fill="#161a17" />
      <circle {...MARK.again} fill="#eef0ec" />
    </svg>
  );
}

// Mark and lowercase wordmark, for the phone header.
export function Wordmark({ size = 28 }: { size?: number }) {
  return (
    <span className="inline-flex items-center gap-2">
      <LogoMark size={size} />
      <span className="text-[19px] font-extrabold leading-none tracking-[-0.04em] text-ink">recurance</span>
    </span>
  );
}
