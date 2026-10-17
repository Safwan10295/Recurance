"use client";

import { Compass, Home, Link2, Map, Menu, ScanSearch, Search, X, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import CommandPalette from "./CommandPalette";
import GuidePath from "./GuidePath";
import { NAV } from "./nav";
import ThemeToggle from "./ThemeToggle";
import Tour, { startTour } from "./Tour";

const BUILT_WITH: [string, string][] = [
  ["NVIDIA Nemotron", "Nano, Super and Ultra"],
  ["Nebius Token Factory", "inference"],
  ["Qwen3 Embedding 8B", "on Token Factory"],
  ["Tavily", "follow-up web search"],
  ["Postgres and pgvector", "search"],
  ["Next.js", "site"],
];

// Phones get the four most-used places as a bottom tab bar; everything else stays in the menu.
const TABS: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/", label: "Home", icon: Home },
  { href: "/brief", label: "Check", icon: ScanSearch },
  { href: "/chains", label: "Chains", icon: Link2 },
  { href: "/map", label: "Map", icon: Map },
];

function isActive(path: string, href: string) {
  return href === "/" ? path === "/" : path === href || path.startsWith(href + "/");
}

function Wordmark({ compact = false }: { compact?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <span aria-hidden className="relative flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent">
        <span className="absolute h-3.5 w-3.5 rounded-full border-2 border-accent-ink" />
        <span className="absolute h-1.5 w-1.5 translate-x-[7px] -translate-y-[7px] rounded-full bg-accent-ink" />
      </span>
      <span className="leading-tight">
        <span className="block font-serif text-[1.05rem] font-semibold tracking-tight text-ink">Recurrence Watch</span>
        {!compact && <span className="block text-[11px] text-muted">Did the promise hold?</span>}
      </span>
    </span>
  );
}

function NavList({ path, onNavigate }: { path: string; onNavigate?: () => void }) {
  return (
    <nav aria-label="Main" className="space-y-5">
      {NAV.map((g) => (
        <div key={g.group} className="space-y-1">
          <div className="eyebrow px-3">{g.group}</div>
          <ul className="space-y-0.5 list-none p-0">
            {g.items.map((it) => {
              const active = isActive(path, it.href);
              const Icon = it.icon;
              return (
                <li key={it.href}>
                  <Link
                    href={it.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={`group flex items-start gap-2.5 rounded-lg px-3 py-2 hover:no-underline transition-colors ${
                      active ? "bg-accent-soft text-ink" : "text-ink-2 hover:bg-paper-2 hover:text-ink"
                    }`}
                  >
                    {it.primary ? (
                      <span
                        aria-hidden
                        className={`-ml-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition-colors duration-200 ${
                          active ? "bg-accent text-accent-ink" : "bg-accent-soft text-accent group-hover:bg-accent group-hover:text-accent-ink"
                        }`}
                      >
                        <Icon size={14} />
                      </span>
                    ) : (
                      <Icon size={16} aria-hidden className={`mt-0.5 shrink-0 ${active ? "text-accent" : "text-muted group-hover:text-ink-2"}`} />
                    )}
                    <span className="min-w-0">
                      <span className={`block text-sm ${active ? "font-semibold" : "font-medium"}`}>{it.label}</span>
                      <span className="block text-xs text-muted leading-snug">{it.hint}</span>
                    </span>
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

function SearchButton({ onOpen, wide = true }: { onOpen: () => void; wide?: boolean }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`flex items-center gap-2 rounded-lg border border-rule bg-surface px-3 py-2 text-sm text-muted hover:border-accent transition-colors ${wide ? "w-full max-w-md" : ""}`}
      aria-label="Search and jump (Ctrl K)"
    >
      <Search size={16} aria-hidden />
      <span className="flex-1 text-left truncate">Search a hazard, report or organisation…</span>
      <span className="hidden md:flex items-center gap-1">
        <kbd className="kbd">Ctrl</kbd>
        <kbd className="kbd">K</kbd>
      </span>
    </button>
  );
}

export default function AppShell({ children, updated }: { children: React.ReactNode; updated: string | null }) {
  const path = usePathname() ?? "/";
  const [open, setOpen] = useState(false);
  const [palette, setPalette] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);
  const closePalette = useCallback(() => setPalette(false), []);

  useEffect(() => setOpen(false), [path]);

  // Ctrl/Cmd+K or "/" opens the palette from anywhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      const typing = ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName) || t.isContentEditable;
      if ((e.key === "k" || e.key === "K") && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        setPalette((p) => !p);
      } else if (e.key === "/" && !typing) {
        e.preventDefault();
        setPalette(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Mobile drawer: Escape closes, focus moves in, the page behind does not scroll.
  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    drawerRef.current?.querySelector<HTMLElement>("a,button")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
      if (e.key === "Tab" && drawerRef.current) {
        const f = drawerRef.current.querySelectorAll<HTMLElement>("a,button");
        const first = f[0];
        const last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Printable briefs are standalone documents: no sidebar, header or footer.
  if (path.startsWith("/print")) return <>{children}</>;

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[272px_1fr]">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-surface focus:p-2">
        Skip to content
      </a>
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex lg:flex-col lg:sticky lg:top-0 lg:h-screen border-r border-rule bg-surface px-3 py-5 gap-6 overflow-y-auto">
        <Link href="/" className="px-3 hover:no-underline">
          <Wordmark />
        </Link>
        <NavList path={path} />
        <button
          type="button"
          onClick={startTour}
          className="mx-3 flex items-center justify-center gap-2 rounded-lg border border-dashed border-accent/50 bg-accent-soft/40 px-3 py-2 text-sm font-medium text-accent hover:bg-accent-soft"
        >
          <Compass size={16} aria-hidden /> Take the guided tour
        </button>
        <div className="mt-auto px-3 pt-2 text-xs text-muted space-y-1.5">
          {updated && (
            <p className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden /> Data updated {updated}
            </p>
          )}
          <p>Source: judiciary.uk, Open Government Licence</p>
        </div>
      </aside>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <button className="absolute inset-0 bg-black/40" aria-label="Close menu" tabIndex={-1} onClick={() => setOpen(false)} />
          <div ref={drawerRef} className="absolute left-0 top-0 h-full w-80 max-w-[86%] bg-surface border-r border-rule p-4 overflow-y-auto space-y-6 fade-in">
            <div className="flex items-center justify-between">
              <Link href="/" onClick={() => setOpen(false)} className="hover:no-underline">
                <Wordmark compact />
              </Link>
              <button onClick={() => setOpen(false)} aria-label="Close menu" className="rounded-md border border-rule p-1.5 text-ink-2">
                <X size={18} aria-hidden />
              </button>
            </div>
            <NavList path={path} onNavigate={() => setOpen(false)} />
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                startTour();
              }}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-accent/50 px-3 py-2 text-sm font-medium text-accent"
            >
              <Compass size={16} aria-hidden /> Take the guided tour
            </button>
            {updated && <p className="px-3 text-xs text-muted">Data updated {updated}</p>}
          </div>
        </div>
      )}

      <CommandPalette open={palette} onClose={closePalette} />
      <Tour />

      <div className="min-w-0 flex flex-col">
        <header className="sticky top-0 z-30 border-b border-rule bg-paper/85 backdrop-blur supports-[backdrop-filter]:bg-paper/70">
          <div className="flex items-center gap-2 sm:gap-3 px-4 sm:px-6 py-2.5">
            <button
              className="lg:hidden rounded-md border border-rule bg-surface p-2 text-ink-2"
              onClick={() => setOpen(true)}
              aria-label="Open menu"
            >
              <Menu size={18} aria-hidden />
            </button>
            <Link href="/" className="lg:hidden hover:no-underline shrink-0">
              <Wordmark compact />
            </Link>
            <div className="hidden sm:flex flex-1 min-w-0">
              <SearchButton onOpen={() => setPalette(true)} />
            </div>
            <div className="ml-auto flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPalette(true)}
                className="sm:hidden rounded-md border border-rule bg-surface p-2 text-ink-2"
                aria-label="Search"
              >
                <Search size={18} aria-hidden />
              </button>
              <ThemeToggle />
              <Link
                href="/brief"
                className="hidden sm:inline-flex items-center gap-1.5 rounded-md bg-accent text-accent-ink px-3.5 py-2 text-sm font-medium hover:no-underline hover:bg-accent-strong transition-colors whitespace-nowrap"
              >
                <ScanSearch size={16} aria-hidden /> Check a report
              </Link>
            </div>
          </div>
        </header>
        <GuidePath path={path} />
        <main id="main" className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-9">
          {children}
        </main>
        <footer className="border-t border-rule pb-16 lg:pb-0">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 text-xs text-muted space-y-1.5">
            <ul className="mb-3 flex flex-wrap items-center gap-1.5 p-0" aria-label="Built with">
              <li className="mr-1 eyebrow">Built with</li>
              {BUILT_WITH.map(([name, role]) => (
                <li key={name} className="rounded-full border border-rule bg-surface px-2.5 py-1">
                  <span className="text-ink">{name}</span> <span>{role}</span>
                </li>
              ))}
            </ul>
            <p>
              Source: Prevention of Future Deaths reports and responses published by the Courts and Tribunals Judiciary at
              judiciary.uk. Crown copyright, used under the Open Government Licence v3.0.
            </p>
            <p>
              A link shows that a similar concern was raised again, not why. It is not a finding about any organisation or
              person. <Link href="/how-we-know/methodology" className="underline underline-offset-2">Methodology and responsible use</Link> ·{" "}
              <Link href="/how-we-know/methodology#corrections" className="underline underline-offset-2">Report an error</Link>
            </p>
          </div>
        </footer>
      </div>

      <nav aria-label="Quick links" className="fixed inset-x-0 bottom-0 z-30 border-t border-rule bg-surface/95 backdrop-blur pb-[env(safe-area-inset-bottom)] lg:hidden">
        <ul className="grid list-none grid-cols-4 p-0">
          {TABS.map(({ href, label, icon: Icon }) => {
            const active = isActive(path, href);
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={`flex h-14 flex-col items-center justify-center gap-0.5 text-[11px] hover:no-underline ${active ? "text-accent font-semibold" : "text-muted"}`}
                >
                  <Icon size={19} aria-hidden />
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
