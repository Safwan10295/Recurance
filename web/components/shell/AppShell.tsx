"use client";

import { Repeat2, Search } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import CommandPalette from "./CommandPalette";
import GuidePath from "./GuidePath";
import { RAIL, TABS, isActive } from "./nav";
import ThemeToggle from "./ThemeToggle";
import Tour from "./Tour";

const BUILT_WITH: [string, string][] = [
  ["NVIDIA Nemotron", "Nano, Super and Ultra"],
  ["Nebius Token Factory", "inference"],
  ["Qwen3 Embedding 8B", "on Token Factory"],
  ["Tavily", "follow-up web search"],
  ["Postgres and pgvector", "search"],
  ["Next.js", "site"],
];

// Spine shell (design_handoff_spine): a slim dark icon rail on desktop (900px and up), a top bar and a five-tab bar on
// phones. Everything else is one keystroke away in the command palette (Ctrl or Cmd K, or "/").
export default function AppShell({ children, updated }: { children: React.ReactNode; updated: string | null }) {
  const path = usePathname() ?? "/";
  // Fade the page in after a client navigation, never on first load (so the first paint is not held back).
  const [lastPath, setLastPath] = useState(path);
  const [navigated, setNavigated] = useState(false);
  if (path !== lastPath) {
    setLastPath(path);
    setNavigated(true);
  }
  const [palette, setPalette] = useState(false);
  const closePalette = useCallback(() => setPalette(false), []);
  const openPalette = useCallback(() => setPalette(true), []);

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

  // Printable briefs are standalone documents: no rail, bars or footer.
  if (path.startsWith("/print")) return <>{children}</>;
  const home = path === "/";

  return (
    <div className="min-h-screen min-[900px]:flex">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-surface focus:p-2">
        Skip to content
      </a>

      {/* Desktop icon rail */}
      <nav
        aria-label="Main"
        className="sticky top-0 hidden h-screen w-[84px] shrink-0 flex-col items-center gap-1.5 overflow-y-auto bg-rail py-5 text-[#e8ebe6] min-[900px]:flex"
      >
        <Link
          href="/"
          title="Recurrence Watch, start here"
          aria-label="Recurrence Watch, start here"
          className="mb-[18px] flex h-10 w-10 items-center justify-center rounded-xl bg-accent-bright text-[#161a17] hover:no-underline"
        >
          <Repeat2 size={20} strokeWidth={2} aria-hidden />
        </Link>
        <button type="button" onClick={openPalette} title="Search reports, hazards and organisations (Ctrl K)" className="rail-item">
          <span className="rail-pill">
            <Search size={20} strokeWidth={2} aria-hidden />
          </span>
          <span className="text-[11px] font-semibold">Search</span>
        </button>
        {RAIL.map(({ href, label, full, hint, icon: Icon }) => {
          const active = isActive(path, href);
          return (
            <Link key={href} href={href} title={`${full}: ${hint}`} aria-current={active ? "page" : undefined} className="rail-item">
              <span className="rail-pill">
                <Icon size={20} strokeWidth={2} aria-hidden />
              </span>
              <span className="text-[11px] font-semibold">{label}</span>
            </Link>
          );
        })}
        <ThemeToggle rail className="mt-auto" />
      </nav>

      <CommandPalette open={palette} onClose={closePalette} />
      <Tour />

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Phone top bar */}
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-rule bg-paper px-[18px] min-[900px]:hidden">
          <Link href="/" className="text-base font-bold tracking-tight text-ink hover:no-underline">
            Recurrence Watch
          </Link>
          <div className="ml-auto flex items-center gap-1">
            <button
              type="button"
              onClick={openPalette}
              aria-label="Search"
              className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-ink hover:bg-paper-2"
            >
              <Search size={20} aria-hidden />
            </button>
            <ThemeToggle className="h-11 w-11 border-transparent bg-transparent" />
          </div>
        </header>

        {!home && <GuidePath path={path} />}
        <main
          id="main"
          key={navigated ? path : "first"}
          className={`w-full flex-1 ${home ? "" : "mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-9 lg:px-8"} ${navigated ? "page-in" : ""}`}
        >
          {children}
        </main>

        <footer className="border-t border-rule pb-24 min-[900px]:pb-0">
          <div className="mx-auto max-w-6xl space-y-1.5 px-4 py-6 text-xs text-muted sm:px-6 lg:px-8">
            <ul className="mb-3 flex flex-wrap items-center gap-1.5 p-0" aria-label="Built with">
              <li className="eyebrow mr-1">Built with</li>
              {BUILT_WITH.map(([name, role]) => (
                <li key={name} className="rounded-full border border-rule bg-surface px-2.5 py-1">
                  <span className="text-ink">{name}</span> <span>{role}</span>
                </li>
              ))}
            </ul>
            <p>
              Source: Prevention of Future Deaths reports and responses published by the Courts and Tribunals Judiciary at
              judiciary.uk. Crown copyright, used under the Open Government Licence v3.0.{updated ? ` Data updated ${updated}.` : ""}
            </p>
            <p>
              A link shows that a similar concern was raised again, not why. It is not a finding about any organisation or
              person.{" "}
              <Link href="/how-we-know/methodology" className="underline underline-offset-2">
                Methodology and responsible use
              </Link>{" "}
              ·{" "}
              <Link href="/how-we-know/methodology#corrections" className="underline underline-offset-2">
                Report an error
              </Link>
            </p>
          </div>
        </footer>
      </div>

      {/* Phone tab bar */}
      <nav
        aria-label="Quick links"
        className="fixed inset-x-0 bottom-0 z-30 bg-rail px-1.5 pb-[calc(14px+env(safe-area-inset-bottom))] pt-2 text-[#e8ebe6] min-[900px]:hidden"
      >
        <ul className="grid list-none grid-cols-5 p-0">
          {TABS.map(({ href, label, icon: Icon }) => {
            const active = isActive(path, href);
            return (
              <li key={href}>
                <Link href={href} aria-current={active ? "page" : undefined} className="rail-item rail-tab w-full">
                  <span className="rail-pill">
                    <Icon size={20} strokeWidth={2} aria-hidden />
                  </span>
                  <span className="text-[11px] font-semibold">{label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
