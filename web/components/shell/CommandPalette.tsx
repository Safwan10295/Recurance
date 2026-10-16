"use client";

import { ArrowRight, Building2, CornerDownLeft, FileText, Link2, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { NAV } from "./nav";

type Results = {
  chains: { key: string; hazard: string; org_name: string; n_reports: number }[];
  reports: { slug: string; title: string; date: string; n_links: number }[];
  orgs: { id: number; name: string; n_chains: number }[];
};
type Item = { href: string; label: string; sub?: string; kind: "page" | "chain" | "report" | "org" | "search" };

const KIND_ICON = { page: ArrowRight, chain: Link2, report: FileText, org: Building2, search: Search } as const;
const KIND_LABEL = { page: "Pages", chain: "Recurrence chains", report: "Reports", org: "Organisations", search: "" } as const;
const short = (t: string) => t.replace(/\s*[:\-–]\s*Prevention of future deaths? report\s*$/i, "");

// Ctrl+K, Cmd+K or "/" from anywhere: jump to any page, chain, report or organisation.
export default function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [term, setTerm] = useState("");
  const [res, setRes] = useState<Results | null>(null);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (!open) return;
    setTerm("");
    setRes(null);
    setActive(0);
    const t = setTimeout(() => inputRef.current?.focus(), 10);
    document.body.style.overflow = "hidden";
    return () => {
      clearTimeout(t);
      document.body.style.overflow = "";
    };
  }, [open]);

  useEffect(() => {
    const t = term.trim();
    if (t.length < 2) {
      setRes(null);
      return;
    }
    setLoading(true);
    const ctl = new AbortController();
    const id = setTimeout(async () => {
      try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(t)}`, { signal: ctl.signal });
        if (r.ok) setRes(await r.json());
      } catch {
        /* aborted or offline */
      } finally {
        setLoading(false);
      }
    }, 160);
    return () => {
      clearTimeout(id);
      ctl.abort();
    };
  }, [term]);

  const items: Item[] = useMemo(() => {
    const t = term.trim().toLowerCase();
    const pages: Item[] = NAV.flatMap((g) => g.items)
      .filter((p) => !t || p.label.toLowerCase().includes(t) || p.hint.toLowerCase().includes(t))
      .map((p) => ({ href: p.href, label: p.label, sub: p.hint, kind: "page" }));
    const out: Item[] = [];
    if (res) {
      out.push(...res.chains.map((c): Item => ({ href: `/chains/${c.key}`, label: c.hazard, sub: `${c.org_name} · ${c.n_reports} reports`, kind: "chain" })));
      out.push(...res.reports.map((r): Item => ({ href: `/reports/${r.slug}`, label: short(r.title), sub: `${r.date?.slice(0, 4) ?? ""}${r.n_links ? ` · in ${r.n_links} links` : ""}`, kind: "report" })));
      out.push(...res.orgs.map((o): Item => ({ href: `/organisations/${o.id}`, label: o.name, sub: o.n_chains ? `${o.n_chains} chains` : "Organisation", kind: "org" })));
    }
    if (t.length >= 2) out.push({ href: `/search?q=${encodeURIComponent(term.trim())}`, label: `Search everything for "${term.trim()}"`, kind: "search" });
    return [...(t ? pages.slice(0, 4) : pages), ...out];
  }, [res, term]);

  useEffect(() => setActive(0), [items.length]);
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-i="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const go = useCallback(
    (it?: Item) => {
      if (!it) return;
      onClose();
      router.push(it.href);
    },
    [onClose, router],
  );

  if (!open) return null;
  let lastKind = "";
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-3 sm:pt-[12vh]" role="dialog" aria-modal="true" aria-label="Search and jump">
      <button className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" aria-label="Close" onClick={onClose} />
      <div className="relative w-full max-w-xl card shadow-[var(--shadow-lg)] overflow-hidden fade-in">
        <div className="flex items-center gap-2 border-b border-rule px-3.5">
          <Search size={18} className="text-muted shrink-0" aria-hidden />
          <input
            ref={inputRef}
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((a) => Math.min(items.length - 1, a + 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((a) => Math.max(0, a - 1));
              } else if (e.key === "Enter") {
                e.preventDefault();
                go(items[active]);
              } else if (e.key === "Escape") onClose();
            }}
            placeholder="Search a hazard, report, organisation or page…"
            aria-label="Search"
            aria-controls="palette-list"
            aria-activedescendant={items[active] ? `pi-${active}` : undefined}
            className="w-full bg-transparent py-3.5 text-base text-ink outline-none placeholder:text-muted"
          />
          {loading && <span className="h-3 w-3 shrink-0 rounded-full border-2 border-accent border-t-transparent animate-spin" aria-hidden />}
          <kbd className="kbd hidden sm:inline">Esc</kbd>
        </div>
        <ul ref={listRef} id="palette-list" role="listbox" className="max-h-[60vh] overflow-y-auto p-1.5 list-none">
          {items.map((it, i) => {
            const Icon = KIND_ICON[it.kind];
            const header = it.kind !== lastKind && KIND_LABEL[it.kind] ? KIND_LABEL[it.kind] : null;
            lastKind = it.kind;
            return (
              <li key={`${it.kind}:${it.href}`} role="presentation">
                {header && <div className="eyebrow px-2.5 pt-2.5 pb-1">{header}</div>}
                <div
                  id={`pi-${i}`}
                  data-i={i}
                  role="option"
                  aria-selected={i === active}
                  onMouseMove={() => setActive(i)}
                  onClick={() => go(it)}
                  className={`flex cursor-pointer items-center gap-3 rounded-md px-2.5 py-2 ${i === active ? "bg-accent-soft" : ""}`}
                >
                  <Icon size={16} className={i === active ? "text-accent shrink-0" : "text-muted shrink-0"} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-ink">{it.label}</span>
                    {it.sub && <span className="block truncate text-xs text-muted">{it.sub}</span>}
                  </span>
                  {i === active && <CornerDownLeft size={14} className="text-muted shrink-0" aria-hidden />}
                </div>
              </li>
            );
          })}
          {term.trim().length >= 2 && !loading && res && items.length <= 1 && (
            <li className="px-3 py-6 text-center text-sm text-muted">Nothing found. Try a broader word.</li>
          )}
        </ul>
        <div className="hidden sm:flex items-center gap-3 border-t border-rule px-3.5 py-2 text-xs text-muted">
          <span>
            <kbd className="kbd">↑</kbd> <kbd className="kbd">↓</kbd> to move
          </span>
          <span>
            <kbd className="kbd">Enter</kbd> to open
          </span>
          <span className="ml-auto">
            <kbd className="kbd">Ctrl</kbd> <kbd className="kbd">K</kbd> anywhere
          </span>
        </div>
      </div>
    </div>
  );
}
