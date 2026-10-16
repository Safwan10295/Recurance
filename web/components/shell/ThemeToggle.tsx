"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

type Mode = "system" | "light" | "dark";
const NEXT: Record<Mode, Mode> = { system: "light", light: "dark", dark: "system" };
const LABEL: Record<Mode, string> = { system: "Theme: follows your device", light: "Theme: light", dark: "Theme: dark" };

export default function ThemeToggle({ className = "" }: { className?: string }) {
  const [mode, setMode] = useState<Mode>("system");
  useEffect(() => {
    try {
      const t = localStorage.getItem("rw-theme");
      if (t === "light" || t === "dark") setMode(t);
    } catch {}
  }, []);
  const apply = (m: Mode) => {
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
  return (
    <button
      type="button"
      onClick={() => apply(NEXT[mode])}
      title={LABEL[mode]}
      aria-label={`${LABEL[mode]}. Change theme`}
      className={`inline-flex h-9 w-9 items-center justify-center rounded-md border border-rule bg-surface text-ink-2 hover:border-accent hover:text-accent ${className}`}
    >
      <Icon size={16} aria-hidden />
    </button>
  );
}
