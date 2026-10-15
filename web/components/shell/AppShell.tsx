"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const NAV: { group: string; items: { href: string; label: string; hint: string }[] }[] = [
  {
    group: "Use the tool",
    items: [
      { href: "/", label: "Start here", hint: "What this is, in one minute" },
      { href: "/recent", label: "Recent recurrences", hint: "New reports that repeat an earlier warning" },
      { href: "/brief", label: "Check a report", hint: "Run the live analysis on any report" },
    ],
  },
  {
    group: "Explore the record",
    items: [
      { href: "/chains", label: "Recurrence chains", hint: "Hazards raised again and again" },
      { href: "/organisations", label: "Organisations", hint: "Who received which warnings" },
      { href: "/search", label: "Search", hint: "Reports, chains, organisations" },
    ],
  },
  {
    group: "How we know",
    items: [
      { href: "/evaluation", label: "Evaluation", hint: "Accuracy against baselines, and cost" },
      { href: "/methodology", label: "Methodology", hint: "How it works and responsible use" },
    ],
  },
];

function isActive(path: string, href: string) {
  return href === "/" ? path === "/" : path === href || path.startsWith(href + "/");
}

function NavList({ path, onNavigate }: { path: string; onNavigate?: () => void }) {
  return (
    <nav aria-label="Main" className="space-y-6">
      {NAV.map((g) => (
        <div key={g.group} className="space-y-1">
          <div className="eyebrow px-3">{g.group}</div>
          <ul className="space-y-0.5 list-none p-0">
            {g.items.map((it) => {
              const active = isActive(path, it.href);
              return (
                <li key={it.href}>
                  <Link
                    href={it.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={`block rounded-md px-3 py-2 hover:no-underline ${
                      active ? "bg-accent-soft text-ink" : "text-ink-2 hover:bg-paper-2 hover:text-ink"
                    }`}
                  >
                    <span className={`block text-sm ${active ? "font-semibold" : "font-medium"}`}>{it.label}</span>
                    <span className="block text-xs text-muted leading-snug">{it.hint}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function SearchBox({ autoFocusKey = true }: { autoFocusKey?: boolean }) {
  const router = useRouter();
  const ref = useRef<HTMLInputElement>(null);
  const [v, setV] = useState("");
  useEffect(() => {
    if (!autoFocusKey) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key === "/" && !["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName)) {
        e.preventDefault();
        ref.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [autoFocusKey]);
  return (
    <form
      role="search"
      className="flex-1 max-w-xl"
      onSubmit={(e) => {
        e.preventDefault();
        if (v.trim()) router.push(`/search?q=${encodeURIComponent(v.trim())}`);
      }}
    >
      <label className="relative block">
        <span className="sr-only">Search reports, chains and organisations</span>
        <input
          ref={ref}
          value={v}
          onChange={(e) => setV(e.target.value)}
          placeholder="Search a hazard, report or organisation…"
          className="w-full rounded-md border border-rule bg-surface px-3 py-2 pr-10 text-sm"
        />
        <kbd className="hidden sm:block absolute right-2 top-1/2 -translate-y-1/2 rounded border border-rule px-1.5 text-xs text-muted">
          /
        </kbd>
      </label>
    </form>
  );
}

export default function AppShell({ children, updated }: { children: React.ReactNode; updated: string | null }) {
  const path = usePathname() ?? "/";
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [path]);
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[260px_1fr]">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-surface focus:p-2">
        Skip to content
      </a>
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex lg:flex-col lg:sticky lg:top-0 lg:h-screen border-r border-rule bg-surface px-3 py-5 gap-6 overflow-y-auto">
        <Link href="/" className="px-3 text-ink hover:no-underline">
          <span className="block font-serif text-xl font-semibold tracking-tight">Recurrence Watch</span>
          <span className="block text-xs text-muted">Did the promise hold?</span>
        </Link>
        <NavList path={path} />
        <div className="mt-auto px-3 text-xs text-muted space-y-1">
          {updated && <p>Data updated {updated}</p>}
          <p>Source: judiciary.uk, Open Government Licence</p>
        </div>
      </aside>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <button className="absolute inset-0 bg-black/30" aria-label="Close menu" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-0 h-full w-80 max-w-[85%] bg-surface border-r border-rule p-4 overflow-y-auto space-y-6">
            <div className="flex items-center justify-between">
              <span className="font-serif text-lg font-semibold">Recurrence Watch</span>
              <button onClick={() => setOpen(false)} className="rounded border border-rule px-2 py-1 text-sm">
                Close
              </button>
            </div>
            <NavList path={path} onNavigate={() => setOpen(false)} />
          </div>
        </div>
      )}

      <div className="min-w-0 flex flex-col">
        <header className="sticky top-0 z-30 border-b border-rule bg-paper/90 backdrop-blur">
          <div className="flex items-center gap-3 px-4 sm:px-6 py-3">
            <button
              className="lg:hidden rounded-md border border-rule bg-surface px-2.5 py-1.5 text-sm"
              onClick={() => setOpen(true)}
              aria-label="Open menu"
            >
              ☰
            </button>
            <Link href="/" className="lg:hidden font-serif font-semibold text-ink hover:no-underline whitespace-nowrap">
              Recurrence Watch
            </Link>
            <div className="hidden sm:flex flex-1">
              <SearchBox />
            </div>
            <Link
              href="/brief"
              className="ml-auto rounded-md bg-accent text-accent-ink px-3.5 py-2 text-sm font-medium hover:no-underline hover:opacity-90 whitespace-nowrap"
            >
              Check a report
            </Link>
          </div>
          <div className="sm:hidden px-4 pb-3">
            <SearchBox autoFocusKey={false} />
          </div>
        </header>
        <main id="main" className="flex-1 w-full max-w-6xl px-4 sm:px-6 py-6 sm:py-8">
          {children}
        </main>
        <footer className="border-t border-rule px-4 sm:px-6 py-5 text-xs text-muted space-y-1 max-w-6xl">
          <p>
            Source: Prevention of Future Deaths reports and responses published by the Courts and Tribunals Judiciary at
            judiciary.uk. Crown copyright, used under the Open Government Licence v3.0.
          </p>
          <p>
            A link shows that a similar concern was raised again, not why. It is not a finding about any organisation or
            person. <Link href="/methodology">Methodology and responsible use</Link>.
          </p>
        </footer>
      </div>
    </div>
  );
}
