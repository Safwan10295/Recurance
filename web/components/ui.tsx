import Link from "next/link";
import SourceCheck from "@/components/SourceCheck";
import type { QuoteContext, Relation } from "@/lib/types";

export const RELATION_LABEL: Record<Relation, string> = {
  identical: "Identical hazard",
  closely_related: "Closely related",
  related: "Related",
  different: "Different",
};

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "date not stated";
  const d = new Date(iso.length === 10 ? iso + "T00:00:00Z" : iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

export function year(iso: string | null | undefined): string {
  return iso ? iso.slice(0, 4) : "";
}

// Ordinary rounding, except a share below 1 never shows as 100% (0.996 shows as 99%).
export function pct(x: number): string {
  const r = Math.round(x * 100);
  return `${r === 100 && x < 1 ? 99 : r}%`;
}

export function confidenceWord(c: number): string {
  if (c >= 0.85) return "high";
  if (c >= 0.7) return "moderate";
  return "low";
}

export function orgTypeLabel(t: string | null | undefined): string {
  return (
    {
      nhs_trust: "NHS body",
      police: "Police",
      council: "Local authority",
      national_body: "National body",
      company: "Company or provider",
      prison: "Prison or detention",
      ambulance: "Ambulance service",
      commissioner: "Commissioner",
      other: "Other",
    } as Record<string, string>
  )[t ?? ""] ?? "Other";
}

export function Badge({ children, tone = "plain" }: { children: React.ReactNode; tone?: "plain" | "accent" | "solid" }) {
  const cls =
    tone === "solid"
      ? "bg-accent text-accent-ink border-accent"
      : tone === "accent"
        ? "bg-accent-soft text-accent border-transparent"
        : "bg-paper-2 text-ink-2 border-rule";
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${cls}`}>{children}</span>;
}

export function RelationTag({ relation }: { relation: Relation }) {
  return <Badge tone={relation === "identical" ? "solid" : "accent"}>{RELATION_LABEL[relation]}</Badge>;
}

export function ConfidenceTag({ value }: { value: number }) {
  return (
    <Badge>
      Confidence {value.toFixed(2)} · {confidenceWord(value)}
    </Badge>
  );
}

export function Quote({ text, href, label, ctx }: { text: string; href?: string; label?: string; ctx?: QuoteContext | null }) {
  return (
    <figure className="space-y-1.5">
      <blockquote className="quote">&ldquo;{text}&rdquo;</blockquote>
      {href && (
        <figcaption className="text-xs text-muted pl-4">
          <a href={href} target="_blank" rel="noopener noreferrer">
            {label ?? "Original on judiciary.uk"} ↗
          </a>
        </figcaption>
      )}
      {ctx && href && <SourceCheck quote={text} ctx={ctx} href={href} />}
    </figure>
  );
}

export function QuotePair({
  earlier,
  later,
}: {
  earlier: { label: string; text: string; href?: string; ctx?: QuoteContext | null };
  later: { label: string; text: string; href?: string; ctx?: QuoteContext | null };
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="space-y-1.5">
        <p className="eyebrow">{earlier.label}</p>
        <Quote text={earlier.text} href={earlier.href} ctx={earlier.ctx} />
      </div>
      <div className="space-y-1.5">
        <p className="eyebrow">{later.label}</p>
        <Quote text={later.text} href={later.href} ctx={later.ctx} />
      </div>
    </div>
  );
}

export function PageHeader({
  eyebrow,
  crumbs,
  title,
  description,
  actions,
}: {
  eyebrow?: React.ReactNode;
  crumbs?: { href?: string; label: string }[];
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4 pb-5 mb-6 border-b border-rule">
      <div className="space-y-2 max-w-3xl min-w-0">
        {crumbs ? <Breadcrumbs items={crumbs} /> : eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1 className="font-serif text-[1.7rem] sm:text-4xl leading-[1.15] tracking-tight">{title}</h1>
        {description && <div className="text-ink-2 text-[1.02rem] leading-relaxed">{description}</div>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

export function StatTile({ value, label, href }: { value: React.ReactNode; label: string; href?: string }) {
  const inner = (
    <>
      <div className="font-serif text-3xl font-bold tracking-tight text-ink num">{value}</div>
      <div className="text-sm text-muted mt-1 leading-snug">{label}</div>
    </>
  );
  return href ? (
    <Link href={href} className="card p-4 block hover:no-underline hover:border-ink transition-colors">
      {inner}
    </Link>
  ) : (
    <div className="card p-4">{inner}</div>
  );
}

export function Stat({ value, label }: { value: string; label: string }) {
  return <StatTile value={value} label={label} />;
}

export function Section({ title, action, children, tour, id }: { title: string; action?: React.ReactNode; children: React.ReactNode; tour?: string; id?: string }) {
  return (
    <section className="space-y-3 scroll-mt-28" data-tour={tour} id={id}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-serif text-xl">{title}</h2>
        {action && <div className="text-sm">{action}</div>}
      </div>
      {children}
    </section>
  );
}

export function EmptyState({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="card p-8 text-center space-y-2">
      <p className="font-serif text-lg">{title}</p>
      {children && <div className="text-ink-2 text-sm">{children}</div>}
    </div>
  );
}

export function ButtonLink({ href, children, primary }: { href: string; children: React.ReactNode; primary?: boolean }) {
  return (
    <Link href={href} className={primary ? btnPrimary : btnSecondary}>
      {children}
    </Link>
  );
}

// ---- Shared controls, so every page uses the same buttons, fields and tabs ----

export const btnPrimary =
  "inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary text-primary-ink px-3.5 py-2 text-sm font-semibold hover:no-underline hover:bg-primary-hover transition-colors disabled:opacity-50";
export const btnSecondary =
  "inline-flex items-center justify-center gap-1.5 rounded-lg border border-rule bg-surface text-ink px-3.5 py-2 text-sm font-semibold hover:no-underline hover:border-ink transition-colors";
export const fieldCls =
  "w-full rounded-md border border-rule bg-surface px-2.5 py-1.5 text-sm text-ink focus:border-accent focus:outline-none";

export function LinkTabs({ tabs }: { tabs: { href: string; label: React.ReactNode; count?: number; active: boolean }[] }) {
  return (
    <nav className="flex gap-1 border-b border-rule mb-6 overflow-x-auto hide-scrollbar" aria-label="Views">
      {tabs.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          aria-current={t.active ? "page" : undefined}
          className={`px-3.5 py-2.5 text-sm font-medium border-b-2 -mb-px whitespace-nowrap hover:no-underline ${
            t.active ? "border-accent text-ink" : "border-transparent text-muted hover:text-ink"
          }`}
        >
          {t.label}
          {t.count !== undefined && <span className="text-muted num"> ({t.count.toLocaleString("en-GB")})</span>}
        </Link>
      ))}
    </nav>
  );
}

export function Breadcrumbs({ items }: { items: { href?: string; label: string }[] }) {
  return (
    // One line at every width, so the heading below never moves when the web font arrives; the last crumb truncates.
    <nav aria-label="Breadcrumb" className="eyebrow flex min-w-0 flex-nowrap items-center gap-x-1.5 overflow-hidden whitespace-nowrap">
      {items.map((it, i) => (
        <span key={i} className={`flex items-center gap-1.5 ${i === items.length - 1 ? "min-w-0 truncate" : "shrink-0"}`}>
          {i > 0 && <span aria-hidden className="text-rule">/</span>}
          {it.href ? (
            <Link href={it.href} className="text-muted hover:text-accent">
              {it.label}
            </Link>
          ) : (
            <span aria-current="page" className="truncate">
              {it.label}
            </span>
          )}
        </span>
      ))}
    </nav>
  );
}

// A small "?" that explains a term on hover, focus or tap. Pure CSS, works with the keyboard.
export function InfoTip({ text, label = "What does this mean?" }: { text: string; label?: string }) {
  return (
    <span className="group relative inline-flex align-middle">
      <button
        type="button"
        aria-label={label}
        className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-rule text-[10px] leading-none text-muted hover:border-ink hover:text-accent focus:border-accent"
      >
        ?
      </button>
      <span
        role="tooltip"
        className="pointer-events-none hidden group-hover:block group-focus-within:block absolute left-1/2 top-full z-40 mt-2 w-[min(16rem,calc(100vw-2rem))] -translate-x-1/2 rounded-lg border border-rule bg-surface p-3 text-left text-xs font-normal normal-case tracking-normal text-ink-2 shadow-[var(--shadow-lg)]"
      >
        {text}
      </span>
    </span>
  );
}

// ---- Text helpers ----

export function slugOf(url: string): string {
  return url.replace(/\/+$/, "").split("/").pop() ?? url;
}

// "Jane Doe: Prevention of future deaths report" -> "Jane Doe"
export function shortTitle(title: string | null | undefined): string {
  return (title ?? "").replace(/\s*[:\-–]\s*(Prevention of future deaths?|PFD) report\s*$/i, "").trim() || (title ?? "");
}

// 431 days -> "1 year 2 months"
export function gapText(days: number | null | undefined): string {
  if (days === null || days === undefined) return "";
  const months = Math.round(days / 30.44);
  if (months < 12) return `${months} month${months === 1 ? "" : "s"}`;
  const y = Math.floor(months / 12);
  const m = months % 12;
  return `${y} year${y === 1 ? "" : "s"}${m ? ` ${m} month${m === 1 ? "" : "s"}` : ""}`;
}

// A report title that opens its page in the app, with the original on judiciary.uk as a small secondary link.
export function ReportLink({
  url,
  title,
  slug,
  external = true,
  className = "",
}: {
  url: string;
  title: string;
  slug?: string | null;
  external?: boolean;
  className?: string;
}) {
  return (
    <span className={className}>
      <Link href={`/reports/${slug ?? slugOf(url)}`} className="text-ink hover:text-accent">
        {shortTitle(title)}
      </Link>
      {external && (
        <a href={url} target="_blank" rel="noopener noreferrer" className="ml-0.5 inline-flex min-h-6 min-w-6 items-center justify-center px-1 text-xs text-muted hover:text-accent" title="Original on judiciary.uk" aria-label="Original on judiciary.uk">
          ↗
        </a>
      )}
    </span>
  );
}

export function Pagination({
  path,
  params,
  page,
  total,
  size,
}: {
  path: string;
  params: Record<string, string | undefined>;
  page: number;
  total: number;
  size: number;
}) {
  const pages = Math.max(1, Math.ceil(total / size));
  if (pages <= 1) return null;
  const href = (p: number) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) sp.set(k, v);
    if (p > 1) sp.set("page", String(p));
    const s = sp.toString();
    return s ? `${path}?${s}` : path;
  };
  const nums = Array.from(new Set([1, page - 1, page, page + 1, pages].filter((n) => n >= 1 && n <= pages))).sort((a, b) => a - b);
  return (
    <nav aria-label="Pages" className="flex flex-wrap items-center gap-1.5 pt-4 text-sm">
      {page > 1 && (
        <Link href={href(page - 1)} className="rounded-md border border-rule bg-surface px-3 py-1.5 hover:no-underline">
          ← Previous
        </Link>
      )}
      {nums.map((n, i) => (
        <span key={n} className="flex items-center gap-1.5">
          {i > 0 && n - nums[i - 1] > 1 && <span className="text-muted">…</span>}
          <Link
            href={href(n)}
            aria-current={n === page ? "page" : undefined}
            className={`rounded-md px-3 py-1.5 hover:no-underline ${
              n === page ? "bg-accent text-accent-ink" : "border border-rule bg-surface"
            }`}
          >
            {n}
          </Link>
        </span>
      ))}
      {page < pages && (
        <Link href={href(page + 1)} className="rounded-md border border-rule bg-surface px-3 py-1.5 hover:no-underline">
          Next →
        </Link>
      )}
      <span className="text-muted ml-2">
        {total.toLocaleString("en-GB")} results
      </span>
    </nav>
  );
}
