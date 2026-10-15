"use client";

import { useEffect, useState } from "react";

// Accessible tabs. The selected tab is kept in the URL hash, so a tab can be linked to directly.
export default function Tabs({ tabs }: { tabs: { id: string; label: string; content: React.ReactNode }[] }) {
  const [active, setActive] = useState(tabs[0]?.id);
  useEffect(() => {
    const h = window.location.hash.slice(1);
    if (h && tabs.some((t) => t.id === h)) setActive(h);
  }, [tabs]);
  const select = (id: string) => {
    setActive(id);
    history.replaceState(null, "", `#${id}`);
  };
  return (
    <div>
      <div role="tablist" className="flex gap-1 overflow-x-auto border-b border-rule -mx-1 px-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={active === t.id}
            aria-controls={`panel-${t.id}`}
            id={`tab-${t.id}`}
            onClick={() => select(t.id)}
            className={`whitespace-nowrap px-3.5 py-2.5 text-sm font-medium border-b-2 -mb-px ${
              active === t.id ? "border-accent text-ink" : "border-transparent text-muted hover:text-ink"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tabs.map((t) => (
        <div key={t.id} role="tabpanel" id={`panel-${t.id}`} aria-labelledby={`tab-${t.id}`} hidden={active !== t.id} className="pt-6">
          {t.content}
        </div>
      ))}
    </div>
  );
}
