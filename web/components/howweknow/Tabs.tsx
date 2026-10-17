"use client";

import { BarChart3, BookOpen, Cpu, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export const HOW_TABS: { href: string; label: string; short: string; icon: LucideIcon }[] = [
  { href: "/how-we-know", label: "How Nemotron did the work", short: "Nemotron", icon: Cpu },
  { href: "/how-we-know/evaluation", label: "Evaluation", short: "Evaluation", icon: BarChart3 },
  { href: "/how-we-know/methodology", label: "Methodology", short: "Methodology", icon: BookOpen },
];

// One section, three tabs. Each tab is its own URL, so a link or a reload lands on the same tab.
export default function HowWeKnowTabs() {
  const path = usePathname() ?? "";
  return (
    <nav aria-label="How we know" className="-mt-2 mb-6 border-b border-rule">
      <ul className="-mb-px flex list-none gap-1 overflow-x-auto p-0 hide-scrollbar">
        {HOW_TABS.map(({ href, label, short, icon: Icon }) => {
          const active = path === href;
          return (
            <li key={href} className="shrink-0">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm transition-colors duration-200 hover:no-underline ${
                  active ? "border-accent font-semibold text-ink" : "border-transparent text-muted hover:border-rule hover:text-ink"
                }`}
              >
                <Icon size={15} aria-hidden className={active ? "text-accent" : ""} />
                <span className="sm:hidden">{short}</span>
                <span className="hidden sm:inline">{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
