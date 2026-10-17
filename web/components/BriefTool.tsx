"use client";

import type { QuoteContext } from "@/lib/types";
import { ArrowRight, Check, Copy, FileText, Globe, Loader2, PenLine, RotateCcw, ScanSearch } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import AgentTrace, { type Step } from "./brief/AgentTrace";
import { PrintLink } from "./PrintButton";
import { ConfidenceTag, QuotePair, RelationTag, btnPrimary, btnSecondary, fieldCls, formatDate, shortTitle, slugOf } from "./ui";
import type { Relation } from "@/lib/types";

type Match = {
  earlier: { url: string; slug?: string; title: string; date: string; coroner: string | null; area: string | null };
  relation: Relation;
  confidence: number;
  explanation: string | null;
  earlier_quote: string;
  later_quote: string;
  earlier_context?: QuoteContext | null; // archive briefs only: the published source window
  later_context?: QuoteContext | null;
  promises: { id: number; quote: string; timescale: string | null }[];
  chains: ({ key: string; hazard: string } | string)[];
  followups?: { promise: string; classification: "evidence_found" | "not_found" | "contradicting"; source_url?: string; quote?: string }[];
};
type Result = {
  organisation: { id: number; name: string } | null;
  report: { url: string; slug?: string; title: string; date: string | null; known?: boolean } | null;
  concerns: { quote: string; hazard: string }[];
  matches: Match[];
  other_earlier: { url: string; slug?: string; title: string; date: string; hazard: string }[];
  searched?: number;
  cost?: number;
  notes: string[];
  mode?: "agent" | "fixed" | "archive";
};
type Example = { title: string; input: Record<string, string>; result: Result; why?: string };
type ReplaySource = "precomputed" | "saved" | "archive" | null;
type Suggestion = { url: string; slug: string; title: string; date: string };
type Mode = "pick" | "url" | "text";

// Each chip runs a real report whose brief was recorded from a live agent run: instant, at no cost.
const EXAMPLES = [
  { label: "A smart motorway death, 2023", slug: "david-levett-prevention-of-future-deaths-report", title: "David Levett: Prevention of future deaths report", date: "2023-04-18" },
  { label: "A railway platform death, 2025", slug: "jody-robb-prevention-of-future-deaths-report", title: "Jody Robb: Prevention of Future Deaths Report", date: "2025-07-01" },
  { label: "A young driver crash, 2026", slug: "paul-green-prevention-of-future-deaths-report", title: "Paul Green: Prevention of future deaths report", date: "2026-03-12" },
];
const REPLAY_LABEL: Record<Exclude<ReplaySource, null>, string> = {
  precomputed: "Agent trace, replayed from a recorded run (no cost)",
  saved: "Agent trace, replayed from the saved run",
  archive: "From the archive (no live model call)",
};

export default function BriefTool({
  initialUrl,
  initialSlug,
  initialOrg,
  autoRun = false,
}: {
  initialUrl?: string;
  initialSlug?: { slug: string; title: string; date: string; url: string };
  initialOrg?: { id: number; name: string };
  autoRun?: boolean;
}) {
  const [mode, setMode] = useState<Mode>(initialOrg ? "text" : initialUrl ? "url" : "pick");
  const [term, setTerm] = useState("");
  const [sugg, setSugg] = useState<Suggestion[]>([]);
  const [active, setActive] = useState(0);
  const [picked, setPicked] = useState<Suggestion | null>(initialSlug ?? null);
  const [reportUrl, setReportUrl] = useState(initialUrl ?? "");
  const [concerns, setConcerns] = useState("");
  const [organisation, setOrganisation] = useState(initialOrg?.name ?? "");
  const [steps, setSteps] = useState<Step[]>([]);
  const [result, setResult] = useState<Result | null>(null);
  const [hash, setHash] = useState<string | null>(null);
  const [paused, setPaused] = useState<{ message: string; examples: Example[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [replay, setReplay] = useState<ReplaySource>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [suggLoading, setSuggLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [elapsed, setElapsed] = useState<number | undefined>();
  const [loadingShared, setLoadingShared] = useState(false);
  const outRef = useRef<HTMLDivElement>(null);
  const started = useRef(0);
  const ran = useRef(false);

  // Load a shared brief from ?h=
  useEffect(() => {
    const h = new URLSearchParams(window.location.search).get("h");
    if (!h || !/^[a-f0-9]{64}$/.test(h)) return;
    setLoadingShared(true);
    fetch(`/api/brief?h=${h}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.result) {
          setResult(d.result);
          setSteps(d.steps ?? []);
          setReplay("saved");
          setHash(h);
        } else setPaused({ message: "That shared brief could not be found. It may have expired.", examples: [] });
      })
      .catch(() => setPaused({ message: "That shared brief could not be loaded just now.", examples: [] }))
      .finally(() => setLoadingShared(false));
  }, []);

  // Typeahead for "Pick a report".
  useEffect(() => {
    if (mode !== "pick" || picked) return;
    if (term.trim().length < 2) {
      setSugg([]);
      setSuggLoading(false);
      return;
    }
    const ctl = new AbortController();
    setSuggLoading(true);
    const t = setTimeout(() => {
      fetch(`/api/reports/suggest?q=${encodeURIComponent(term)}`, { signal: ctl.signal })
        .then((r) => (r.ok ? r.json() : []))
        .then((s: Suggestion[]) => {
          setSugg(s);
          setActive(0);
          setSuggLoading(false);
        })
        .catch(() => undefined);
    }, 110);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [term, mode, picked]);

  // Elapsed timer while the agent works.
  useEffect(() => {
    if (!busy) return;
    const id = setInterval(() => setElapsed(Date.now() - started.current), 100);
    return () => clearInterval(id);
  }, [busy]);

  const run = useCallback(
    async (override?: { reportSlug?: string }) => {
      setBusy(true);
      setSteps([]);
      setResult(null);
      setPaused(null);
      setHash(null);
      setReplay(null);
      setNotice(null);
      started.current = Date.now();
      setElapsed(0);
      setTimeout(() => outRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
      const body =
        override ??
        (mode === "pick"
          ? { reportSlug: picked?.slug }
          : mode === "url"
            ? { reportUrl }
            : { concerns, organisation, ...(initialOrg && organisation === initialOrg.name ? { orgId: initialOrg.id } : {}) });
      try {
        const res = await fetch("/api/brief", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
        const reader = res.body.getReader();
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
            if (ev.type === "replay") {
              setReplay(ev.source ?? "saved");
              if (ev.message) setNotice(ev.message);
            }
            else if (ev.type === "step")
              setSteps((s) => {
                const at = s.findIndex((x) => x.id === ev.step.id);
                if (at < 0) {
                  // The agent's rounds and tool calls go before the final "Write the brief" step.
                  const end = s.findIndex((x) => x.id === "brief");
                  return end >= 0 && ev.step.id !== "brief" ? [...s.slice(0, end), ev.step, ...s.slice(end)] : [...s, ev.step];
                }
                const next = [...s];
                next[at] = ev.step;
                return next;
              });
            else if (ev.type === "result") {
              setResult(ev.result);
              setHash(ev.hash ?? null);
              if (ev.hash) history.replaceState(null, "", `/brief?h=${ev.hash}`);
            } else if (ev.type === "paused") setPaused({ message: ev.message, examples: ev.examples ?? [] });
          }
        }
      } catch {
        setPaused({ message: "Live analysis could not be reached just now. Here are precomputed examples instead.", examples: [] });
      } finally {
        setElapsed(Date.now() - started.current);
        setBusy(false);
      }
    },
    [mode, picked, reportUrl, concerns, organisation, initialOrg],
  );

  // Arriving from a report page with ?report=…&run=1 runs straight away.
  useEffect(() => {
    if (autoRun && initialSlug && !ran.current) {
      ran.current = true;
      run({ reportSlug: initialSlug.slug });
    }
  }, [autoRun, initialSlug, run]);

  const canRun =
    !busy &&
    ((mode === "pick" && !!picked) ||
      (mode === "url" && /^https:\/\/www\.judiciary\.uk\//.test(reportUrl.trim())) ||
      (mode === "text" && concerns.trim().length >= 40 && organisation.trim().length > 1));

  const modeBtn = (m: Mode, label: string, short: string, Icon: typeof FileText) => (
    <button
      type="button"
      onClick={() => setMode(m)}
      aria-pressed={mode === m}
      className={`flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-2 py-2 text-sm font-medium transition-colors duration-200 ${
        mode === m ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink"
      }`}
    >
      <Icon size={15} aria-hidden /> <span className="sm:hidden">{short}</span>
      <span className="hidden sm:inline">{label}</span>
    </button>
  );

  const choose = (s: Suggestion) => {
    setPicked(s);
    setSugg([]);
  };

  const showIntro = !result && !paused && steps.length === 0 && !loadingShared;

  return (
    <div className="space-y-6">
      <form
        data-tour="brief-form"
        className="card p-4 sm:p-5 space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (canRun) run();
        }}
      >
        <div className="flex gap-1 rounded-lg bg-paper-2 p-1" role="group" aria-label="How to give the report">
          {modeBtn("pick", "Pick a report", "Pick", FileText)}
          {modeBtn("url", "Web address", "Address", Globe)}
          {modeBtn("text", "Paste text", "Paste", PenLine)}
        </div>

        <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
          <div className="min-w-0">
            {mode === "pick" && (
              <div className="relative">
                <label className="block text-sm space-y-1">
                  <span className="text-muted">Any report in the archive, by name or words in it</span>
                  <input
                    className={`${fieldCls} py-2 text-base`}
                    value={picked ? shortTitle(picked.title) : term}
                    onChange={(e) => {
                      setPicked(null);
                      setTerm(e.target.value);
                    }}
                    onKeyDown={(e) => {
                      if (!sugg.length) return;
                      if (e.key === "ArrowDown") {
                        e.preventDefault();
                        setActive((a) => Math.min(sugg.length - 1, a + 1));
                      } else if (e.key === "ArrowUp") {
                        e.preventDefault();
                        setActive((a) => Math.max(0, a - 1));
                      } else if (e.key === "Enter") {
                        e.preventDefault();
                        choose(sugg[active]);
                      } else if (e.key === "Escape") setSugg([]);
                    }}
                    placeholder="e.g. Levett"
                    autoComplete="off"
                    role="combobox"
                    aria-expanded={!picked && sugg.length > 0}
                    aria-controls="brief-sugg"
                  />
                </label>
                {suggLoading && !picked && (
                  <Loader2 size={15} className="absolute right-3 top-[2.15rem] animate-spin text-muted" aria-label="Searching" />
                )}
                {!picked && sugg.length > 0 && (
                  <ul id="brief-sugg" role="listbox" className="absolute z-20 mt-1 w-full card max-h-72 overflow-y-auto list-none p-1 shadow-[var(--shadow-lg)]">
                    {sugg.map((s, i) => (
                      <li key={s.url} role="option" aria-selected={i === active}>
                        <button
                          type="button"
                          onMouseMove={() => setActive(i)}
                          onClick={() => choose(s)}
                          className={`w-full rounded-md px-3 py-2 text-left ${i === active ? "bg-accent-soft" : ""}`}
                        >
                          <span className="block text-sm text-ink">{shortTitle(s.title)}</span>
                          <span className="block text-xs text-muted">{formatDate(s.date)}</span>
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
                <input
                  className={`${fieldCls} py-2 text-base`}
                  value={reportUrl}
                  onChange={(e) => setReportUrl(e.target.value)}
                  placeholder="https://www.judiciary.uk/prevention-of-future-death-reports/…"
                  inputMode="url"
                />
              </label>
            )}
            {mode === "text" && (
              <div className="grid gap-3">
                <label className="block text-sm space-y-1">
                  <span className="text-muted">Organisation the concerns are addressed to</span>
                  <input className={fieldCls} value={organisation} onChange={(e) => setOrganisation(e.target.value)} placeholder="e.g. Network Rail" />
                </label>
                <label className="block text-sm space-y-1">
                  <span className="text-muted">Draft concerns (please remove names first)</span>
                  <textarea className={`${fieldCls} min-h-32`} value={concerns} onChange={(e) => setConcerns(e.target.value)} />
                </label>
              </div>
            )}
          </div>
          <button type="submit" disabled={!canRun} className={`${btnPrimary} py-2.5 md:px-5`}>
            {busy ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <ScanSearch size={16} aria-hidden />}
            {busy ? "Working…" : "Check for earlier warnings"}
          </button>
        </div>

        {mode === "pick" && (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-muted">Try:</span>
            {EXAMPLES.map((ex) => (
              <button
                key={ex.slug}
                type="button"
                disabled={busy}
                onClick={() => {
                  setPicked({ slug: ex.slug, title: ex.title, date: ex.date, url: "" });
                  setSugg([]);
                  run({ reportSlug: ex.slug });
                }}
                className="rounded-full border border-rule bg-surface px-2.5 py-1 text-ink-2 hover:border-accent disabled:opacity-50"
              >
                {ex.label}
              </button>
            ))}
          </div>
        )}
        <p className="text-xs text-muted">
          Runs live on Nebius Token Factory with daily limits. The same input returns the same saved brief, with its trace
          replayed.
        </p>
      </form>

      <div ref={outRef} className="scroll-mt-24">
        {showIntro && (
          <div className="grid gap-4 md:grid-cols-3">
            {[
              { t: "1. Read and extract", d: "Nemotron Nano pulls out each concern, with a quote checked word for word." },
              { t: "2. Search by meaning", d: "Qwen3 embeddings and pgvector find the closest earlier concerns sent to the same organisation." },
              { t: "3. Judge and verify", d: "Nemotron Super decides if each is the same hazard. Only verified quotes reach the brief." },
            ].map((x) => (
              <div key={x.t} className="card p-4 space-y-1">
                <p className="font-medium text-ink">{x.t}</p>
                <p className="text-sm text-ink-2">{x.d}</p>
              </div>
            ))}
          </div>
        )}
        {loadingShared && <div className="skeleton h-40" aria-label="Loading the shared brief" />}

        {(steps.length > 0 || result || paused) && (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] items-start">
            {steps.length > 0 ? (
              <div className="lg:sticky lg:top-20">
                <AgentTrace steps={steps} elapsed={elapsed} replayLabel={replay ? REPLAY_LABEL[replay] : undefined} />
              </div>
            ) : (
              <div />
            )}
            <div className="min-w-0 space-y-4">
              {busy && !result && (
                <div className="card p-5 space-y-3" aria-hidden>
                  <div className="skeleton h-5 w-2/3" />
                  <div className="skeleton h-4 w-full" />
                  <div className="skeleton h-4 w-5/6" />
                  <div className="skeleton h-24 w-full" />
                </div>
              )}
              {paused && (
                <div className="space-y-4">
                  <p className="card p-4 text-ink-2">{paused.message}</p>
                  {paused.examples.map((ex, i) => (
                    <div key={i} className="space-y-2">
                      <p className="eyebrow">
                        Example, not your report: {shortTitle(ex.title)}
                        {ex.why ? ` · ${ex.why}` : ""}
                      </p>
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
                  {notice && <p className="card border-l-4 border-l-sand p-4 text-sm text-ink-2">{notice}</p>}
                  <div className="flex flex-wrap justify-end gap-2">
                    {hash && <PrintLink href={`/print/brief?h=${hash}`} />}
                    {hash && (
                      <button
                        type="button"
                        className={btnSecondary}
                        onClick={() => {
                          navigator.clipboard?.writeText(`${window.location.origin}/brief?h=${hash}`).then(() => setCopied(true));
                          setTimeout(() => setCopied(false), 2000);
                        }}
                      >
                        {copied ? <Check size={15} aria-hidden /> : <Copy size={15} aria-hidden />} {copied ? "Link copied" : "Copy link to this brief"}
                      </button>
                    )}
                    <button
                      type="button"
                      className={btnSecondary}
                      onClick={() => {
                        setResult(null);
                        setSteps([]);
                        setPicked(null);
                        setTerm("");
                        history.replaceState(null, "", "/brief");
                        window.scrollTo({ top: 0, behavior: "smooth" });
                      }}
                    >
                      <RotateCcw size={15} aria-hidden /> Check another report
                    </button>
                  </div>
                  <BriefView r={result} />
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function BriefView({ r }: { r: Result }) {
  return (
    <div className="space-y-4 fade-in">
      {r.notes.map((n, i) => (
        <p key={i} className="card p-4 text-ink-2">
          {n}
        </p>
      ))}
      {r.organisation && (
        <div className="card p-5 space-y-1.5 border-l-4 border-l-accent">
          <p className="eyebrow">The brief</p>
          <h2 className="font-serif text-2xl leading-snug">
            {r.matches.length === 0
              ? "No earlier warning judged to be the same hazard"
              : `${r.matches.length} earlier ${r.matches.length === 1 ? "warning" : "warnings"} to ${r.organisation.name}`}
          </h2>
          <p className="text-sm text-ink-2">
            {r.report ? (
              <>
                For{" "}
                {r.report.slug ? <Link href={`/reports/${r.report.slug}`}>{shortTitle(r.report.title)}</Link> : shortTitle(r.report.title)}
                {r.report.date ? ` (${formatDate(r.report.date)})` : ""}.{" "}
              </>
            ) : (
              "For the concerns given. "
            )}
            Organisation: <Link href={`/organisations/${r.organisation.id}`}>{r.organisation.name}</Link>
            {r.searched ? ` · ${r.searched.toLocaleString("en-GB")} earlier concerns searched` : ""}
          </p>
          {r.mode && (
            <p className="text-xs text-muted">
              {r.mode === "agent"
                ? "Found by the tool-calling agent: Nemotron Super chose which searches to run, and every quote was then checked in code."
                : "Found by the fixed pipeline (the agent was unavailable or stopped at a limit). Every quote was checked in code."}
            </p>
          )}
          {r.matches.length === 0 && (
            <p className="text-sm text-muted">
              That does not mean none exists; it means none of the closest earlier concerns was judged the same hazard.
            </p>
          )}
        </div>
      )}
      {r.matches.map((m, i) => (
        <div key={i} className="card p-4 sm:p-5 space-y-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <RelationTag relation={m.relation} />
            <ConfidenceTag value={m.confidence} />
          </div>
          <p className="text-sm text-ink-2">
            Raised before in{" "}
            <Link href={`/reports/${m.earlier.slug ?? slugOf(m.earlier.url)}`}>{shortTitle(m.earlier.title)}</Link>,{" "}
            {formatDate(m.earlier.date)}, coroner {m.earlier.coroner ?? "not stated"}.
          </p>
          {m.explanation && <p className="text-ink">{m.explanation}</p>}
          <QuotePair
            earlier={{ label: `Earlier report · ${formatDate(m.earlier.date)}`, text: m.earlier_quote, href: m.earlier.url, ctx: m.earlier_context }}
            later={{ label: "New report", text: m.later_quote }}
          />
          {m.promises.length > 0 ? (
            <div className="space-y-1.5 rounded-lg bg-paper-2/70 p-3">
              <p className="eyebrow">What the response to the earlier report said it would do</p>
              {m.promises.slice(0, 3).map((p) => (
                <div key={p.id} className="space-y-0.5">
                  <blockquote className="quote">&ldquo;{p.quote}&rdquo;</blockquote>
                  {p.timescale && <p className="pl-4 text-xs text-muted">Stated timescale: {p.timescale}</p>}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted">No published stated action was found for the earlier report.</p>
          )}
          {(m.followups ?? []).length > 0 && (
            <div className="space-y-2 rounded-lg border border-rule p-3">
              <p className="eyebrow">What happened next: the agent&apos;s web check (Tavily)</p>
              {m.followups!.map((f, k) => (
                <div key={k} className="space-y-1 text-sm">
                  <p className="text-ink-2">
                    <span className={f.classification === "evidence_found" ? "text-accent" : f.classification === "contradicting" ? "text-sand" : "text-muted"}>
                      {f.classification === "evidence_found"
                        ? "Evidence found that the action was carried out"
                        : f.classification === "contradicting"
                          ? "A source suggests the action was not carried out as stated"
                          : "No evidence found either way"}
                    </span>{" "}
                    for: &ldquo;{f.promise.length > 140 ? f.promise.slice(0, 139) + "…" : f.promise}&rdquo;
                  </p>
                  {f.quote && f.source_url && (
                    <figure className="pl-3">
                      <blockquote className="quote text-sm">&ldquo;{f.quote}&rdquo;</blockquote>
                      <figcaption className="pl-4 text-xs">
                        <a href={f.source_url} target="_blank" rel="noopener noreferrer">
                          {f.source_url.replace(/^https?:\/\/(www\.)?/, "").slice(0, 60)} ↗
                        </a>
                      </figcaption>
                    </figure>
                  )}
                  {f.classification === "not_found" && <p className="text-xs text-muted">No evidence found does not mean the action did not happen.</p>}
                </div>
              ))}
            </div>
          )}
          {m.chains.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {m.chains.map((c, j) => {
                const key = typeof c === "string" ? c : c.key;
                const label = typeof c === "string" ? "See the full chain" : c.hazard;
                return (
                  <Link key={j} href={`/chains/${key}`} className="inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-3 py-1 text-sm text-accent hover:no-underline">
                    Full chain: {label} <ArrowRight size={14} aria-hidden />
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      ))}
      {r.other_earlier.length > 0 && (
        <details className="card p-4 text-sm">
          <summary className="cursor-pointer text-accent">Other earlier reports that were checked</summary>
          <ul className="list-disc pl-5 mt-2 space-y-1">
            {r.other_earlier.map((o) => (
              <li key={o.url}>
                <Link href={`/reports/${o.slug ?? slugOf(o.url)}`}>{shortTitle(o.title)}</Link> ({formatDate(o.date)}): {o.hazard}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
