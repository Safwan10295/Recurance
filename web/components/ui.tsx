import Link from "next/link";
import type { Relation } from "@/lib/types";

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

export function pct(x: number): string {
  return `${Math.round(x * 100)}%`;
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

export function Quote({ text, href, label }: { text: string; href?: string; label?: string }) {
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
    </figure>
  );
}

export function QuotePair({
  earlier,
  later,
}: {
  earlier: { label: string; text: string; href?: string };
  later: { label: string; text: string; href?: string };
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="space-y-1.5">
        <p className="eyebrow">{earlier.label}</p>
        <Quote text={earlier.text} href={earlier.href} />
      </div>
      <div className="space-y-1.5">
        <p className="eyebrow">{later.label}</p>
        <Quote text={later.text} href={later.href} />
      </div>
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4 pb-5 mb-6 border-b border-rule">
      <div className="space-y-1.5 max-w-3xl">
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1 className="font-serif text-2xl sm:text-3xl leading-tight">{title}</h1>
        {description && <div className="text-ink-2">{description}</div>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

export function StatTile({ value, label, href }: { value: React.ReactNode; label: string; href?: string }) {
  const inner = (
    <>
      <div className="font-serif text-3xl text-ink">{value}</div>
      <div className="text-sm text-muted mt-1 leading-snug">{label}</div>
    </>
  );
  return href ? (
    <Link href={href} className="card p-4 block hover:no-underline hover:border-accent transition-colors">
      {inner}
    </Link>
  ) : (
    <div className="card p-4">{inner}</div>
  );
}

export function Stat({ value, label }: { value: string; label: string }) {
  return <StatTile value={value} label={label} />;
}

export function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
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
    <Link
      href={href}
      className={`inline-flex items-center gap-1.5 rounded-md px-3.5 py-2 text-sm font-medium hover:no-underline ${
        primary ? "bg-accent text-accent-ink hover:opacity-90" : "border border-rule bg-surface text-ink hover:border-accent"
      }`}
    >
      {children}
    </Link>
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
