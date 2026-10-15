"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { Relation } from "@/lib/types";

type Step = { id: string; label: string; status: "running" | "done" | "skipped"; detail?: string };
type Match = {
  earlier: { url: string; slug?: string; title: string; date: string; coroner: string | null; area: string | null };
  relation: Relation;
  confidence: number;
  explanation: string | null;
  earlier_quote: string;
  later_quote: string;
  promises: { id: number; quote: string; timescale: string | null }[];
  chains: ({ key: string; hazard: string } | string)[];
};
type Result = {
  organisation: { id: number; name: string } | null;
  report: { url: string; slug?: string; title: string; date: string | null; known?: boolean } | null;
  concerns: { quote: string; hazard: string }[];
  matches: Match[];
  other_earlier: { url: string; slug?: string; title: string; date: string; hazard: string }[];
  searched?: number;
  notes: string[];
};
type Example = { title: string; input: Record<string, string>; result: Result };
type Suggestion = { url: string; slug: string; title: string; date: string };
type Mode = "pick" | "url" | "text";

const REL: Record<string, string> = { identical: "Identical hazard", closely_related: "Closely related" };

function fmt(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso.length === 10 ? iso + "T00:00:00Z" : iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}
const slugOf = (u: string) => u.replace(/\/$/, "").split("/").pop() ?? "";

export default function BriefTool({ initialUrl }: { initialUrl?: string }) {
  const [mode, setMode] = useState<Mode>(initialUrl ? "url" : "pick");
  const [term, setTerm] = useState("");
  const [sugg, setSugg] = useState<Suggestion[]>([]);
  const [picked, setPicked] = useState<Suggestion | null>(null);
  const [reportUrl, setReportUrl] = useState(initialUrl ?? "");
  const [concerns, setConcerns] = useState("");
  const [organisation, setOrganisation] = useState("");
  const [steps, setSteps] = useState<Step[]>([]);
  const [result, setResult] = useState<Result | null>(null);
  const [hash, setHash] = useState<string | null>(null);
  const [paused, setPaused] = useState<{ message: string; examples: Example[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load a shared brief from ?h=
  useEffect(() => {
    const h = new URLSearchParams(window.location.search).get("h");
    if (h && /^[a-f0-9]{64}$/.test(h)) {
      fetch(`/api/brief?h=${h}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (d?.result) {
            setResult(d.result);
            setHash(h);
          }
        })
        .catch(() => undefined);
    }
  }, []);

  useEffect(() => {
    if (mode !== "pick" || picked) return;
    if (timer.current) clearTimeout(timer.current);
    if (term.trim().length < 2) {
      setSugg([]);
      return;
    }
    timer.current = setTimeout(() => {
      fetch(`/api/reports/suggest?q=${encodeURIComponent(term)}`)
        .then((r) => r.json())
        .then(setSugg)
        .catch(() => setSugg([]));
    }, 200);
  }, [term, mode, picked]);

  async function run() {
    setBusy(true);
    setSteps([]);
    setResult(null);
    setPaused(null);
    setHash(null);
    const body =
      mode === "pick" ? { reportSlug: picked?.slug } : mode === "url" ? { reportUrl } : { concerns, organisation };
    try {
      const res = await fetch("/api/brief", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const reader = res.body!.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let i;
        while ((i = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, i).trim();
          buf = buf.slice(i + 1);
          if (!line) continue;
          const ev = JSON.parse(line);
          if (ev.type === "step") setSteps((s) => [...s.filter((x) => x.id !== ev.step.id), ev.step]);
          else if (ev.type === "result") {
            setResult(ev.result);
            setHash(ev.hash ?? null);
            if (ev.hash) history.replaceState(null, "", `/brief?h=${ev.hash}`);
          } else if (ev.type === "paused") setPaused({ message: ev.message, examples: ev.examples ?? [] });
        }
      }
    } catch {
      setPaused({ message: "Live analysis could not be reached. Here are precomputed examples instead.", examples: [] });
    } finally {
      setBusy(false);
    }
  }

  const canRun =
    !busy && ((mode === "pick" && !!picked) || (mode === "url" && /^https?:\/\//.test(reportUrl)) || (mode === "text" && concerns.trim().length >= 40 && organisation.trim().length > 1));
  const field = "w-full rounded-md border border-rule bg-surface px-3 py-2";
  const modeBtn = (m: Mode, label: string) => (
    <button
      type="button"
      onClick={() => setMode(m)}
      aria-pressed={mode === m}
      className={`flex-1 rounded-md px-3 py-2 text-sm font-medium ${mode === m ? "bg-surface shadow-sm text-ink" : "text-muted hover:text-ink"}`}
    >
      {label}
    </button>
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,420px)_1fr] items-start">
      <div className="space-y-4 lg:sticky lg:top-24">
        <form
          className="card p-4 sm:p-5 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (canRun) run();
          }}
        >
          <div className="flex gap-1 rounded-lg bg-paper-2 p-1" role="group" aria-label="How to give the report">
            {modeBtn("pick", "Pick a report")}
            {modeBtn("url", "Web address")}
            {modeBtn("text", "Paste concerns")}
          </div>

          {mode === "pick" && (
            <div className="space-y-2">
              <label className="block text-sm space-y-1">
                <span className="text-muted">Search any report in the archive by name</span>
                <input
                  className={field}
                  value={picked ? picked.title : term}
                  onChange={(e) => {
                    setPicked(null);
                    setTerm(e.target.value);
                  }}
                  placeholder="e.g. David Levett"
                  autoComplete="off"
                />
              </label>
              {!picked && sugg.length > 0 && (
                <ul className="rounded-md border border-rule bg-surface divide-y divide-rule max-h-64 overflow-y-auto list-none p-0">
                  {sugg.map((s) => (
                    <li key={s.url}>
                      <button type="button" className="w-full text-left px-3 py-2 hover:bg-paper-2" onClick={() => { setPicked(s); setSugg([]); }}>
                        <span className="block text-sm">{s.title}</span>
                        <span className="block text-xs text-muted">{fmt(s.date)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {mode === "url" && (
            <label className="block text-sm space-y-1">
              <span className="text-muted">A report&apos;s address on judiciary.uk, including brand-new ones</span>
              <input className={field} value={reportUrl} onChange={(e) => setReportUrl(e.target.value)} placeholder="https://www.judiciary.uk/prevention-of-future-death-reports/…" />
            </label>
          )}
          {mode === "text" && (
            <>
              <label className="block text-sm space-y-1">
                <span className="text-muted">Organisation the concerns are addressed to</span>
                <input className={field} value={organisation} onChange={(e) => setOrganisation(e.target.value)} placeholder="e.g. Network Rail" />
              </label>
              <label className="block text-sm space-y-1">
                <span className="text-muted">Draft concerns (please remove names first)</span>
                <textarea className={field + " min-h-40"} value={concerns} onChange={(e) => setConcerns(e.target.value)} />
              </label>
            </>
          )}
          <button type="submit" disabled={!canRun} className="w-full rounded-md bg-accent text-accent-ink px-4 py-2.5 text-sm font-medium disabled:opacity-50">
            {busy ? "Working…" : "Check for earlier warnings"}
          </button>
          <p className="text-xs text-muted">
            Live checks use Nemotron on Nebius Token Factory and are limited each day. The same input always returns the same saved brief.
          </p>
        </form>

        {steps.length > 0 && (
          <div className="card p-4 space-y-3" aria-live="polite">
            <p className="eyebrow">What the agent is doing</p>
            <ol className="space-y-2.5 list-none p-0">
              {steps.map((s) => (
                <li key={s.id} className="flex gap-2.5 text-sm">
                  <span
                    aria-hidden
                    className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs ${
                      s.status === "done" ? "bg-accent text-accent-ink" : "border-2 border-accent animate-pulse"
                    }`}
                  >
                    {s.status === "done" ? "✓" : ""}
                  </span>
                  <span>
                    <span className="block">{s.label}</span>
                    {s.detail && <span className="block text-xs text-muted">{s.detail}</span>}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>

      <div className="min-w-0 space-y-4">
        {!result && !paused && steps.length === 0 && (
          <div className="card p-6 space-y-3 text-ink-2">
            <p className="font-serif text-xl text-ink">What you will get</p>
            <ol className="list-decimal pl-5 space-y-1.5 text-sm">
              <li>Earlier reports to the same organisation that raised the same or a closely related hazard.</li>
              <li>The exact words from both reports, side by side, checked word for word.</li>
              <li>What the organisation said it would do after the earlier report.</li>
              <li>A link to the full chain, if the hazard has recurred before.</li>
            </ol>
            <p className="text-sm">
              Not sure where to start? Pick &ldquo;Pick a report&rdquo; and type <em>Levett</em>, a smart motorway death from 2023.
            </p>
          </div>
        )}
        {paused && (
          <div className="space-y-4">
            <p className="card p-4 text-ink-2">{paused.message}</p>
            {paused.examples.map((ex, i) => (
              <div key={i} className="space-y-2">
                <p className="eyebrow">Example {i + 1}</p>
                <BriefView r={ex.result} />
              </div>
            ))}
            {paused.examples.length === 0 && (
              <p className="text-ink-2">
                You can still explore every verified <Link href="/chains">recurrence chain</Link>.
              </p>
            )}
          </div>
        )}
        {result && (
          <>
            {hash && (
              <div className="flex justify-end">
                <button
                  type="button"
                  className="rounded-md border border-rule bg-surface px-3 py-1.5 text-sm"
                  onClick={() => {
                    navigator.clipboard?.writeText(`${window.location.origin}/brief?h=${hash}`).then(() => setCopied(true));
                    setTimeout(() => setCopied(false), 2000);
                  }}
                >
                  {copied ? "Link copied" : "Copy link to this brief"}
                </button>
              </div>
            )}
            <BriefView r={result} />
          </>
        )}
      </div>
    </div>
  );
}

function BriefView({ r }: { r: Result }) {
  return (
    <div className="space-y-4">
      {r.notes.map((n, i) => (
        <p key={i} className="card p-4 text-ink-2">
          {n}
        </p>
      ))}
      {r.organisation && (
        <div className="card p-5 space-y-1">
          <p className="eyebrow">Brief</p>
          <h2 className="font-serif text-xl">
            {r.matches.length === 0
              ? "No earlier warning judged to be the same hazard"
              : `${r.matches.length} earlier ${r.matches.length === 1 ? "warning" : "warnings"} to ${r.organisation.name}`}
          </h2>
          <p className="text-sm text-ink-2">
            {r.report ? (
              <>
                For{" "}
                {r.report.slug ? <Link href={`/reports/${r.report.slug}`}>{r.report.title}</Link> : r.report.title}
                {r.report.date ? ` (${fmt(r.report.date)})` : ""}.{" "}
              </>
            ) : (
              "For the concerns given. "
            )}
            Organisation: <Link href={`/organisations/${r.organisation.id}`}>{r.organisation.name}</Link>
            {r.searched ? ` · ${r.searched} earlier concerns searched` : ""}
          </p>
          {r.matches.length === 0 && (
            <p className="text-sm text-muted">That does not mean none exists; it means none of the closest earlier concerns was judged the same hazard.</p>
          )}
        </div>
      )}
      {r.matches.map((m, i) => (
        <div key={i} className="card p-4 sm:p-5 space-y-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${m.relation === "identical" ? "bg-accent text-accent-ink" : "bg-accent-soft text-accent"}`}>
              {REL[m.relation] ?? m.relation}
            </span>
            <span className="rounded-full border border-rule bg-paper-2 px-2.5 py-0.5 text-xs">Confidence {m.confidence.toFixed(2)}</span>
          </div>
          <p className="text-sm">
            Raised before in{" "}
            <Link href={`/reports/${m.earlier.slug ?? slugOf(m.earlier.url)}`}>{m.earlier.title}</Link>, {fmt(m.earlier.date)}, coroner{" "}
            {m.earlier.coroner ?? "not stated"}.
          </p>
          {m.explanation && <p className="text-ink-2">{m.explanation}</p>}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1">
              <p className="eyebrow">Earlier report</p>
              <blockquote className="quote">&ldquo;{m.earlier_quote}&rdquo;</blockquote>
            </div>
            <div className="space-y-1">
              <p className="eyebrow">New concerns</p>
              <blockquote className="quote">&ldquo;{m.later_quote}&rdquo;</blockquote>
            </div>
          </div>
          {m.promises.length > 0 ? (
            <div className="space-y-1.5">
              <p className="eyebrow">What was promised after the earlier report</p>
              {m.promises.slice(0, 2).map((p) => (
                <blockquote key={p.id} className="quote">
                  &ldquo;{p.quote}&rdquo;
                </blockquote>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted">No published stated action was found for the earlier report.</p>
          )}
          {m.chains.length > 0 && (
            <p className="text-sm">
              {m.chains.map((c, j) => {
                const key = typeof c === "string" ? c : c.key;
                const label = typeof c === "string" ? "See the full chain" : `Full chain: ${c.hazard}`;
                return (
                  <Link key={j} href={`/chains/${key}`} className="block">
                    {label} →
                  </Link>
                );
              })}
            </p>
          )}
        </div>
      ))}
      {r.other_earlier.length > 0 && (
        <details className="card p-4 text-sm">
          <summary className="cursor-pointer text-accent">Other earlier reports that were checked</summary>
          <ul className="list-disc pl-5 mt-2 space-y-1">
            {r.other_earlier.map((o) => (
              <li key={o.url}>
                <Link href={`/reports/${o.slug ?? slugOf(o.url)}`}>{o.title}</Link> ({fmt(o.date)}): {o.hazard}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
