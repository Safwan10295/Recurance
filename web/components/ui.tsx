import type { Relation } from "@/lib/types";

export const RELATION_LABEL: Record<Relation, string> = {
  identical: "Identical hazard",
  closely_related: "Closely related",
  related: "Related",
  different: "Different",
};

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "date not stated";
  const d = new Date(iso + "T00:00:00Z");
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

export function pct(x: number): string {
  return `${Math.round(x * 100)}%`;
}

export function confidenceWord(c: number): string {
  if (c >= 0.85) return "high";
  if (c >= 0.7) return "moderate";
  return "low";
}

export function RelationTag({ relation }: { relation: Relation }) {
  const solid = relation === "identical";
  return (
    <span
      className={`inline-block rounded-sm px-2 py-0.5 text-xs font-medium border ${
        solid ? "bg-accent text-paper border-accent" : "bg-transparent text-accent border-accent"
      }`}
    >
      {RELATION_LABEL[relation]}
    </span>
  );
}

export function ConfidenceTag({ value }: { value: number }) {
  return (
    <span className="inline-block rounded-sm px-2 py-0.5 text-xs text-ink-2 border border-rule bg-paper-2">
      Confidence {value.toFixed(2)} ({confidenceWord(value)})
    </span>
  );
}

export function Quote({ text, href, label }: { text: string; href?: string; label?: string }) {
  return (
    <figure className="space-y-1">
      <blockquote className="quote">&ldquo;{text}&rdquo;</blockquote>
      {href && (
        <figcaption className="text-sm text-muted pl-4">
          <a href={href} target="_blank" rel="noopener noreferrer">
            {label ?? "Read the original on judiciary.uk"}
          </a>
        </figcaption>
      )}
    </figure>
  );
}

export function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="border-t border-rule pt-3">
      <div className="font-serif text-3xl text-ink">{value}</div>
      <div className="text-sm text-muted mt-1">{label}</div>
    </div>
  );
}

export function orgTypeLabel(t: string): string {
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
    }[t] ?? "Other"
  );
}
