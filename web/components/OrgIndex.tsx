"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { orgTypeLabel } from "./ui";

type Row = { id: number; name: string; type: string; n_reports: number; n_chains: number };

export default function OrgIndex({ orgs }: { orgs: Row[] }) {
  const [q, setQ] = useState("");
  const shown = useMemo(() => {
    const n = q.trim().toLowerCase();
    return (n ? orgs.filter((o) => o.name.toLowerCase().includes(n)) : orgs).slice(0, 300);
  }, [orgs, q]);
  return (
    <div className="space-y-4">
      <label className="block text-sm space-y-1 max-w-md">
        <span className="text-muted">Find an organisation</span>
        <input
          className="border border-rule bg-paper rounded px-2 py-1 w-full"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="e.g. National Highways"
        />
      </label>
      <p className="text-sm text-muted">
        Listed alphabetically. {orgs.length.toLocaleString("en-GB")} organisations received two or more reports.
        {shown.length < orgs.length && !q ? " Search to see the rest." : ""}
      </p>
      <ul className="divide-y divide-rule border-y border-rule list-none p-0">
        {shown.map((o) => (
          <li key={o.id} className="py-2 flex flex-wrap justify-between gap-2">
            <Link href={`/organisations/${o.id}`}>{o.name}</Link>
            <span className="text-sm text-muted">
              {orgTypeLabel(o.type)} · {o.n_reports} reports{o.n_chains ? ` · ${o.n_chains} chains` : ""}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
