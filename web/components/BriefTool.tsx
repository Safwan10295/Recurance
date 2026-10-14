"use client";

import Link from "next/link";
import { useState } from "react";
import { ConfidenceTag, Quote, RelationTag, formatDate } from "./ui";
import type { Relation } from "@/lib/types";

type Step = { id: string; label: string; status: "running" | "done" | "skipped"; detail?: string };
type Match = {
  earlier: { url: string; title: string; date: string; coroner: string | null; area: string | null };
  relation: Relation;
  confidence: number;
  explanation: string | null;
  earlier_quote: string;
  later_quote: string;
  promises: { id: number; quote: string; timescale: string | null }[];
  chains: string[];
};
type Result = {
  organisation: { id: number; name: string } | null;
  report: { url: string; title: string; date: string | null } | null;
  concerns: { quote: string; hazard: string }[];
  matches: Match[];
  other_earlier: { url: string; title: string; date: string; hazard: string }[];
  notes: string[];
};
type Example = { title: string; input: Record<string, string>; result: Result };

export default function BriefTool() {
  const [mode, setMode] = useState<"url" | "text">("url");
  const [reportUrl, setReportUrl] = useState("");
  const [concerns, setConcerns] = useState("");
  const [organisation, setOrganisation] = useState("");
  const [steps, setSteps] = useState<Step[]>([]);
  const [result, setResult] = useState<Result | null>(null);
  const [paused, setPaused] = useState<{ message: string; examples: Example[] } | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setSteps([]);
    setResult(null);
    setPaused(null);
    try {
      const res = await fetch("/api/brief", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mode === "url" ? { reportUrl } : { concerns, organisation }),
      });
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
          if (ev.type === "step")
            setSteps((s) => [...s.filter((x) => x.id !== ev.step.id), ev.step]);
          else if (ev.type === "result") setResult(ev.result);
          else if (ev.type === "paused") setPaused({ message: ev.message, examples: ev.examples ?? [] });
        }
      }
    } catch {
      setPaused({ message: "Live analysis could not be reached. Here are precomputed examples instead.", examples: [] });
    } finally {
      setBusy(false);
    }
  }

  const field = "border border-rule bg-paper rounded px-3 py-2 w-full";
  return (
    <div className="space-y-8">
      <form onSubmit={submit} className="space-y-4 border border-rule rounded p-4 sm:p-5 bg-paper-2">
        <div className="flex gap-4 text-sm" role="radiogroup" aria-label="Input type">
          <label className="flex items-center gap-2">
            <input type="radio" checked={mode === "url"} onChange={() => setMode("url")} /> A published report URL
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" checked={mode === "text"} onChange={() => setMode("text")} /> Draft concerns text
          </label>
        </div>
        {mode === "url" ? (
          <label className="block space-y-1 text-sm">
            <span className="text-muted">Report address on judiciary.uk</span>
            <input className={field} value={reportUrl} onChange={(e) => setReportUrl(e.target.value)}
              placeholder="https://www.judiciary.uk/prevention-of-future-death-reports/..." required />
          </label>
        ) : (
          <>
            <label className="block space-y-1 text-sm">
              <span className="text-muted">Organisation the concerns are addressed to</span>
              <input className={field} value={organisation} onChange={(e) => setOrganisation(e.target.value)}
                placeholder="e.g. National Highways" required />
            </label>
            <label className="block space-y-1 text-sm">
              <span className="text-muted">Concerns (please remove names first)</span>
              <textarea className={field + " min-h-40"} value={concerns} onChange={(e) => setConcerns(e.target.value)} required minLength={40} />
            </label>
          </>
        )}
        <button type="submit" disabled={busy}
          className="bg-accent text-paper rounded px-4 py-2 text-sm font-medium disabled:opacity-60">
          {busy ? "Working…" : "Prepare brief"}
        </button>
      </form>

      {steps.length > 0 && (
        <section aria-live="polite" className="space-y-2">
          <h2 className="font-serif text-xl">What the agent is doing</h2>
          <ol className="space-y-1 text-sm list-none p-0">
            {steps.map((s) => (
              <li key={s.id} className="flex gap-2">
                <span aria-hidden className="text-accent">{s.status === "done" ? "✓" : "…"}</span>
                <span>
                  {s.label}
                  {s.detail ? <span className="text-muted"> — {s.detail}</span> : null}
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {paused && (
        <section className="space-y-4">
          <p className="bg-paper-2 border border-rule rounded px-4 py-3">{paused.message}</p>
          {paused.examples.map((ex, i) => (
            <div key={i} className="space-y-2">
              <h3 className="font-serif text-lg">Example: {ex.title}</h3>
              <BriefView r={ex.result} />
            </div>
          ))}
          {paused.examples.length === 0 && (
            <p className="text-ink-2">
              You can still explore every verified <Link href="/chains">recurrence chain</Link>.
            </p>
          )}
        </section>
      )}

      {result && <BriefView r={result} />}
    </div>
  );
}

function BriefView({ r }: { r: Result }) {
  return (
    <section className="space-y-6">
      {r.notes.map((n, i) => (
        <p key={i} className="bg-paper-2 border border-rule rounded px-4 py-3 text-ink-2">{n}</p>
      ))}
      {r.organisation && (
        <h2 className="font-serif text-2xl">
          Brief: earlier warnings to <Link href={`/organisations/${r.organisation.id}`}>{r.organisation.name}</Link>
        </h2>
      )}
      {r.matches.length === 0 && r.organisation && (
        <p className="text-ink-2">
          No earlier report to this organisation was judged to raise the same or a closely related hazard. That does not
          mean none exists.
        </p>
      )}
      {r.matches.map((m, i) => (
        <div key={i} className="border border-rule rounded p-4 sm:p-5 space-y-3">
          <div className="flex flex-wrap gap-2">
            <RelationTag relation={m.relation} />
            <ConfidenceTag value={m.confidence} />
          </div>
          <p className="text-sm text-ink-2">
            Raised before in <a href={m.earlier.url} target="_blank" rel="noopener noreferrer">{m.earlier.title}</a>,{" "}
            {formatDate(m.earlier.date)}, coroner {m.earlier.coroner ?? "not stated"}.
          </p>
          {m.explanation && <p className="text-ink-2">{m.explanation}</p>}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1">
              <p className="eyebrow">Earlier report</p>
              <Quote text={m.earlier_quote} href={m.earlier.url} />
            </div>
            <div className="space-y-1">
              <p className="eyebrow">New concerns</p>
              <Quote text={m.later_quote} />
            </div>
          </div>
          {m.promises.length > 0 ? (
            <div className="space-y-2">
              <p className="eyebrow">What was promised in response</p>
              {m.promises.slice(0, 2).map((p) => (
                <Quote key={p.id} text={p.quote} />
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted">No published promised action was found for the earlier report.</p>
          )}
          {m.chains.length > 0 && (
            <p className="text-sm">
              This earlier report is already part of a verified chain: <Link href={`/chains/${m.chains[0]}`}>see what happened next</Link>.
            </p>
          )}
        </div>
      ))}
      {r.other_earlier.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-accent">Other earlier reports checked</summary>
          <ul className="list-disc pl-5 mt-2 space-y-1">
            {r.other_earlier.map((o) => (
              <li key={o.url}>
                <a href={o.url} target="_blank" rel="noopener noreferrer">{o.title}</a> ({formatDate(o.date)}): {o.hazard}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
