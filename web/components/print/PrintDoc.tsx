import { headers } from "next/headers";
import Link from "next/link";
import PrintButton from "@/components/PrintButton";
import { formatDate } from "@/components/ui";

// Shared pieces of the printable pre-inquest brief (app/print/*). Styles are in app/print/layout.tsx.

export const FOLLOWUP_LABEL: Record<"evidence_found" | "not_found" | "contradicting", string> = {
  evidence_found: "Evidence found",
  not_found: "No evidence found either way",
  contradicting: "A source suggests the action was not carried out as stated",
};

export const NOT_FOUND_NOTE = "No evidence found does not mean the action did not happen.";

// The public address of the site, for the address line: SITE_URL, else the request's host.
export async function siteBase(): Promise<string> {
  const env = (process.env.SITE_URL || "").replace(/\/+$/, "");
  if (env) return env;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

// "https://www.judiciary.uk/wp-content/uploads/2024/05/Long-name-Response.pdf" -> "judiciary.uk/…/Long-name-Response.pdf"
export function shortUrl(url: string, max = 64): string {
  const bare = url.replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/+$/, "");
  if (bare.length <= max) return bare;
  const parts = bare.split("/");
  const host = parts[0];
  let last = parts[parts.length - 1] || "";
  const room = Math.max(16, max - host.length - 3);
  if (last.length > room) last = last.slice(0, room - 1) + "…";
  return parts.length > 1 ? `${host}/…/${last}` : bare.slice(0, max - 1) + "…";
}

// A link written out as its short URL, so the address survives on paper.
export function Ext({ href, children }: { href: string; children?: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {children ?? <span className="pb-url">{shortUrl(href)}</span>}
    </a>
  );
}

export function DocQuote({ text }: { text: string }) {
  return <blockquote className="pb-quote">&ldquo;{text}&rdquo;</blockquote>;
}

export function DocSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="pb-section">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

export function Toolbar({ back }: { back?: { href: string; label: string } }) {
  return (
    <div className="pb-toolbar pb-noprint print:hidden">
      {back ? (
        <Link href={back.href} className="pb-back">
          ← {back.label}
        </Link>
      ) : (
        <span />
      )}
      <PrintButton />
    </div>
  );
}

export function DocHeader({ subject, organisation, address }: { subject: React.ReactNode; organisation: string | null; address: string }) {
  return (
    <header className="pb-head">
      <p className="pb-eyebrow">Recurance · prevention of future deaths reports</p>
      <h1>Pre-inquest brief</h1>
      <div className="pb-hazard">{subject}</div>
      <p className="pb-meta">
        {organisation && (
          <>
            <span className="pb-label">Organisation:</span> {organisation} ·{" "}
          </>
        )}
        <span className="pb-label">Generated:</span> {formatDate(new Date().toISOString())}
      </p>
      <p className="pb-meta">
        Recurance · <a href={address}>{address.replace(/^https?:\/\//i, "")}</a>
      </p>
    </header>
  );
}

export function DocFooter() {
  return (
    <footer className="pb-foot">
      <p>
        Every quote is verified word for word against the original report on judiciary.uk. A link shows that a similar
        concern was raised again, not why. It is not a finding about any organisation or person.
      </p>
      <p>Source: Courts and Tribunals Judiciary, Open Government Licence v3.0.</p>
    </footer>
  );
}

export function FollowupItem({
  classification,
  action,
  sources,
  summary,
}: {
  classification: keyof typeof FOLLOWUP_LABEL;
  action: React.ReactNode;
  sources: { url: string; quote: string; title?: string }[];
  summary?: string | null;
}) {
  return (
    <div className="pb-item">
      <p>
        <span className="pb-label">{FOLLOWUP_LABEL[classification]}</span> <span className="pb-muted">· {action}</span>
      </p>
      {sources.map((s, i) => (
        <div key={i}>
          <DocQuote text={s.quote} />
          <p className="pb-small pb-muted">
            {s.title ? `${s.title} · ` : ""}
            <Ext href={s.url} />
          </p>
        </div>
      ))}
      {sources.length === 0 && summary && <p className="pb-small pb-muted">{summary}</p>}
      {classification === "not_found" && <p className="pb-small pb-muted">{NOT_FOUND_NOTE}</p>}
    </div>
  );
}
