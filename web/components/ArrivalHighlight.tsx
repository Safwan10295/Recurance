"use client";

import { useEffect } from "react";

// Highlights the report the reader came for (#report-N), on a full load or a client navigation alike;
// CSS :target alone does not update when the address changes inside the app.
export default function ArrivalHighlight() {
  useEffect(() => {
    const id = decodeURIComponent(window.location.hash.slice(1));
    if (!id.startsWith("report-")) return;
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ block: "start" });
    el.classList.add("arrival");
    const t = setTimeout(() => el.classList.remove("arrival"), 2200);
    return () => clearTimeout(t);
  }, []);
  return null;
}
