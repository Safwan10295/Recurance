"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

type Mode = "system" | "light" | "dark";
const NEXT: Record<Mode, Mode> = { system: "light", light: "dark", dark: "system" };
const LABEL: Record<Mode, string> = { system: "Theme: follows your device", light: "Theme: light", dark: "Theme: dark" };

// "rail" draws it like the other icon-rail items (pill and label); otherwise a small square button.
export default function ThemeToggle({ className = "", rail = false }: { className?: string; rail?: boolean }) {
  const [mode, setMode] = useState<Mode>("system");
  useEffect(() => {
    try {
      const t = localStorage.getItem("rw-theme");
      if (t === "light" || t === "dark") setMode(t);
    } catch {}
  }, []);
  const apply = (m: Mode) => {
    // Crossfade the whole page where the View Transitions API exists (and motion is welcome); otherwise switch.
    const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown };
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (doc.startViewTransition && !calm) doc.startViewTransition(() => set(m));
    else set(m);
  };
  const set = (m: Mode) => {
    setMode(m);
    try {
      if (m === "system") {
        localStorage.removeItem("rw-theme");
        delete document.documentElement.dataset.theme;
      } else {
        localStorage.setItem("rw-theme", m);
        document.documentElement.dataset.theme = m;
      }
    } catch {}
  };
  const Icon = mode === "light" ? Sun : mode === "dark" ? Moon : Monitor;
  if (rail)
    return (
      <button type="button" onClick={() => apply(NEXT[mode])} title={LABEL[mode]} aria-label={`${LABEL[mode]}. Change theme`} className={`rail-item ${className}`}>
        <span className="rail-pill">
          <Icon size={20} strokeWidth={2} aria-hidden />
        </span>
        <span className="text-[11px] font-semibold">Theme</span>
      </button>
    );
  return (
    <button
      type="button"
      onClick={() => apply(NEXT[mode])}
      title={LABEL[mode]}
      aria-label={`${LABEL[mode]}. Change theme`}
      className={`inline-flex h-9 w-9 items-center justify-center rounded-md border border-rule bg-surface text-ink-2 hover:border-ink hover:text-ink ${className}`}
    >
      <Icon size={16} aria-hidden />
    </button>
  );
}
