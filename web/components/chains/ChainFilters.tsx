import { Search, SlidersHorizontal, X } from "lucide-react";
import Link from "next/link";
import { InfoTip, btnPrimary, fieldCls, orgTypeLabel } from "@/components/ui";
import { GLOSSARY } from "@/lib/glossary";

// The URL search params this bar reads and writes. Names match the older sidebar form so old links keep working.
export interface ChainParams {
  q?: string;
  type?: string;
  theme?: string;
  relation?: string;
  conf?: string;
  min?: string;
  sort?: string;
}

const KEYS: (keyof ChainParams)[] = ["q", "type", "theme", "relation", "conf", "min", "sort"];
export const RESULTS_ID = "all-chains";

// Build a /chains link from the current params with some changed. Changing a filter always returns to page 1.
export function chainsHref(cur: ChainParams, change: Partial<ChainParams> = {}, hash = true): string {
  const next = { ...cur, ...change };
  const sp = new URLSearchParams();
  for (const k of KEYS) {
    const v = next[k];
    if (v) sp.set(k, v);
  }
  const s = sp.toString();
  return `/chains${s ? `?${s}` : ""}${hash ? `#${RESULTS_ID}` : ""}`;
}

function Chip({
  href,
  active,
  children,
  count,
  removeLabel,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
  count?: number;
  removeLabel?: string;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "true" : undefined}
      aria-label={active && removeLabel ? removeLabel : undefined}
      className={`inline-flex max-w-full shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1 text-sm hover:no-underline transition-colors ${
        active ? "border-accent bg-accent text-accent-ink" : "border-rule bg-surface text-ink-2 hover:border-accent hover:text-ink"
      }`}
    >
      <span className="truncate">{children}</span>
      {count !== undefined && !active && <span className="text-xs text-muted num">{count.toLocaleString("en-GB")}</span>}
      {active && <X size={13} aria-hidden className="-mr-0.5" />}
    </Link>
  );
}

// A labelled row of chips. On phones the row scrolls sideways inside itself; from sm up it wraps.
function ChipRow({ label, info, children }: { label: string; info?: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 space-y-1.5" role="group" aria-label={label}>
      <p className="eyebrow flex items-center gap-1.5">
        {label}
        {info && <InfoTip text={info} />}
      </p>
      <div className="-mx-3 px-3 sm:mx-0 sm:px-0 flex gap-1.5 overflow-x-auto hide-scrollbar sm:flex-wrap sm:overflow-visible pb-0.5">
        {children}
      </div>
    </div>
  );
}

function byLabel<T>(items: T[], label: (t: T) => string): T[] {
  // Alphabetical, with "Other" last: a neutral order for choosing, not a ranking.
  return [...items].sort((a, b) => {
    const la = label(a);
    const lb = label(b);
    if (la === "Other") return 1;
    if (lb === "Other") return -1;
    return la.localeCompare(lb, "en-GB");
  });
}

export default function ChainFilters({
  params,
  facets,
}: {
  params: ChainParams;
  facets: { themes: { theme: string; n: number }[]; types: { org_type: string; n: number }[] };
}) {
  const p = params;
  const toggle = (k: keyof ChainParams, v: string) => chainsHref(p, { [k]: p[k] === v ? undefined : v });
  const anyFilter = Boolean(p.q || p.type || p.theme || p.relation || p.conf || p.min);
  const moreOn = Boolean(p.conf || (p.min && p.min !== "3"));
  const types = byLabel(facets.types, (t) => orgTypeLabel(t.org_type));
  const themes = byLabel(facets.themes, (t) => t.theme);

  return (
    <div className="card p-3 sm:p-4 space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <form method="get" action={`/chains#${RESULTS_ID}`} role="search" className="flex min-w-0 flex-1 basis-64 gap-2">
          {KEYS.filter((k) => k !== "q" && p[k]).map((k) => (
            <input key={k} type="hidden" name={k} value={p[k]} />
          ))}
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">Search chains</span>
            <Search size={15} aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
            <input
              name="q"
              type="search"
              defaultValue={p.q}
              placeholder="Search hazards, e.g. smart motorway"
              className={`${fieldCls} pl-8`}
            />
          </label>
          <button className={btnPrimary}>Search</button>
        </form>
        <nav aria-label="Order" className="inline-flex shrink-0 rounded-md border border-rule bg-paper-2 p-0.5 text-sm">
          {[
            { v: undefined, label: "Most recent" },
            { v: "oldest", label: "Earliest warning" },
          ].map((o) => {
            const on = (p.sort === "oldest" ? "oldest" : undefined) === o.v;
            return (
              <Link
                key={o.label}
                href={chainsHref(p, { sort: o.v })}
                aria-current={on ? "true" : undefined}
                className={`rounded px-2.5 py-1 whitespace-nowrap hover:no-underline ${
                  on ? "bg-surface text-ink shadow-[var(--shadow)]" : "text-muted hover:text-ink"
                }`}
              >
                {o.label}
              </Link>
            );
          })}
        </nav>
      </div>

      <ChipRow label="Organisation type">
        {types.map((t) => (
          <Chip
            key={t.org_type}
            href={toggle("type", t.org_type)}
            active={p.type === t.org_type}
            count={t.n}
            removeLabel={`Remove filter: ${orgTypeLabel(t.org_type)}`}
          >
            {orgTypeLabel(t.org_type)}
          </Chip>
        ))}
      </ChipRow>

      <ChipRow label="Theme">
        {themes.map((t) => (
          <Chip key={t.theme} href={toggle("theme", t.theme)} active={p.theme === t.theme} count={t.n} removeLabel={`Remove filter: ${t.theme}`}>
            {t.theme}
          </Chip>
        ))}
      </ChipRow>

      <div className="flex flex-wrap gap-x-6 gap-y-4">
        <ChipRow label="Relation" info={`${GLOSSARY.identical} ${GLOSSARY.closely_related}`}>
          <Chip href={toggle("relation", "identical")} active={p.relation === "identical"} removeLabel="Remove filter: Identical">
            Identical
          </Chip>
          <Chip
            href={toggle("relation", "closely_related")}
            active={p.relation === "closely_related"}
            removeLabel="Remove filter: Closely related"
          >
            Closely related
          </Chip>
        </ChipRow>
        <ChipRow label="Reports">
          <Chip href={toggle("min", "3")} active={p.min === "3"} removeLabel="Remove filter: 3 or more reports">
            3+ reports
          </Chip>
        </ChipRow>
      </div>

      <details open={moreOn} className="group">
        <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 text-sm text-accent [&::-webkit-details-marker]:hidden">
          <SlidersHorizontal size={14} aria-hidden /> More filters
        </summary>
        <div className="flex flex-wrap gap-x-6 gap-y-4 pt-3">
          <ChipRow label="Minimum confidence" info={GLOSSARY.confidence}>
            {["0.8", "0.9"].map((v) => (
              <Chip key={v} href={toggle("conf", v)} active={p.conf === v} removeLabel={`Remove filter: confidence ${v}`}>
                {Number(v).toFixed(2)}+
              </Chip>
            ))}
          </ChipRow>
          <ChipRow label="At least">
            {["5", "10"].map((v) => (
              <Chip key={v} href={toggle("min", v)} active={p.min === v} removeLabel={`Remove filter: ${v} or more reports`}>
                {v} reports
              </Chip>
            ))}
          </ChipRow>
        </div>
      </details>

      {anyFilter && (
        <div className="flex flex-wrap items-center gap-2 border-t border-rule pt-3 text-sm">
          <span className="text-muted">Active:</span>
          {p.q && (
            <Chip href={chainsHref(p, { q: undefined })} active removeLabel={`Remove search: ${p.q}`}>
              &ldquo;{p.q}&rdquo;
            </Chip>
          )}
          {p.type && (
            <Chip href={chainsHref(p, { type: undefined })} active removeLabel={`Remove filter: ${orgTypeLabel(p.type)}`}>
              {orgTypeLabel(p.type)}
            </Chip>
          )}
          {p.theme && (
            <Chip href={chainsHref(p, { theme: undefined })} active removeLabel={`Remove filter: ${p.theme}`}>
              {p.theme}
            </Chip>
          )}
          {p.relation && (
            <Chip href={chainsHref(p, { relation: undefined })} active removeLabel="Remove relation filter">
              {p.relation === "identical" ? "Identical" : "Closely related"}
            </Chip>
          )}
          {p.min && (
            <Chip href={chainsHref(p, { min: undefined })} active removeLabel="Remove minimum reports filter">
              {p.min}+ reports
            </Chip>
          )}
          {p.conf && (
            <Chip href={chainsHref(p, { conf: undefined })} active removeLabel="Remove confidence filter">
              Confidence {Number(p.conf).toFixed(2)}+
            </Chip>
          )}
          <Link href={chainsHref({ sort: p.sort })} className="ml-auto text-accent">
            Clear all
          </Link>
        </div>
      )}
    </div>
  );
}
