"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { ChainSummary } from "@/lib/types";
import { ConfidenceTag, RELATION_LABEL, RelationTag, orgTypeLabel } from "./ui";

function uniq(xs: string[]) {
  return Array.from(new Set(xs)).sort();
}

export default function ChainList({ chains }: { chains: ChainSummary[] }) {
  const [orgType, setOrgType] = useState("");
  const [theme, setTheme] = useState("");
  const [relation, setRelation] = useState("");
  const [minConf, setMinConf] = useState(0);
  const [q, setQ] = useState("");
  const [order, setOrder] = useState<"newest" | "oldest">("newest");

  const types = useMemo(() => uniq(chains.map((c) => c.org.type)), [chains]);
  const themes = useMemo(() => uniq(chains.map((c) => c.theme)), [chains]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const xs = chains.filter(
      (c) =>
        (!orgType || c.org.type === orgType) &&
        (!theme || c.theme === theme) &&
        (!relation || c.relation === relation) &&
        c.confidence >= minConf &&
        (!needle || c.hazard.toLowerCase().includes(needle) || c.org.name.toLowerCase().includes(needle)),
    );
    // Sorted by date only. Never by "worst".
    xs.sort((a, b) => (order === "newest" ? b.last_date.localeCompare(a.last_date) : a.first_date.localeCompare(b.first_date)));
    return xs;
  }, [chains, orgType, theme, relation, minConf, q, order]);

  const sel = "border border-rule bg-paper rounded px-2 py-1 text-sm w-full";
  return (
    <div className="space-y-6">
      <form className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6 items-end" onSubmit={(e) => e.preventDefault()}>
        <label className="text-sm space-y-1 lg:col-span-2">
          <span className="text-muted">Search hazard or organisation</span>
          <input className={sel} value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. smart motorway" />
        </label>
        <label className="text-sm space-y-1">
          <span className="text-muted">Organisation type</span>
          <select className={sel} value={orgType} onChange={(e) => setOrgType(e.target.value)}>
            <option value="">All</option>
            {types.map((t) => (
              <option key={t} value={t}>
                {orgTypeLabel(t)}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm space-y-1">
          <span className="text-muted">Theme</span>
          <select className={sel} value={theme} onChange={(e) => setTheme(e.target.value)}>
            <option value="">All</option>
            {themes.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm space-y-1">
          <span className="text-muted">Relation</span>
          <select className={sel} value={relation} onChange={(e) => setRelation(e.target.value)}>
            <option value="">All shown</option>
            <option value="identical">{RELATION_LABEL.identical}</option>
            <option value="closely_related">{RELATION_LABEL.closely_related}</option>
          </select>
        </label>
        <label className="text-sm space-y-1">
          <span className="text-muted">Minimum confidence</span>
          <select className={sel} value={minConf} onChange={(e) => setMinConf(Number(e.target.value))}>
            <option value={0}>Any shown</option>
            <option value={0.8}>0.80</option>
            <option value={0.9}>0.90</option>
          </select>
        </label>
      </form>
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted">
        <span>
          {shown.length} of {chains.length} chains
        </span>
        <label className="flex items-center gap-2">
          Order by date
          <select className="border border-rule bg-paper rounded px-2 py-1" value={order} onChange={(e) => setOrder(e.target.value as "newest" | "oldest")}>
            <option value="newest">most recent report first</option>
            <option value="oldest">earliest warning first</option>
          </select>
        </label>
      </div>
      <ul className="divide-y divide-rule border-y border-rule list-none p-0">
        {shown.map((c) => (
          <li key={c.key} className="py-4 space-y-1.5">
            <Link href={`/chains/${c.key}`} className="font-serif text-lg text-ink no-underline hover:underline">
              {c.hazard}
            </Link>
            <div className="text-sm text-ink-2">
              {c.org.name} · {c.n_reports} reports · {c.first_date.slice(0, 4)}–{c.last_date.slice(0, 4)} ·{" "}
              {c.coroners.length > 1 ? `${c.coroners.length} different coroners` : "same coroner"}
            </div>
            <div className="flex flex-wrap gap-2">
              <RelationTag relation={c.relation} />
              <ConfidenceTag value={c.confidence} />
              {c.has_dossier && <span className="text-xs text-muted self-center">Reviewed dossier</span>}
            </div>
          </li>
        ))}
        {shown.length === 0 && <li className="py-6 text-ink-2">No chains match these filters.</li>}
      </ul>
    </div>
  );
}
