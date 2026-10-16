"use client";

import { Printer } from "lucide-react";
import { btnPrimary, btnSecondary } from "@/components/ui";

// Opens the browser's print dialog, where the reader can also save the brief as a PDF. Hidden when printing.
export default function PrintButton({ label = "Print or save as PDF" }: { label?: string }) {
  return (
    <button type="button" onClick={() => window.print()} className={`${btnPrimary} pb-noprint print:hidden`}>
      <Printer size={16} aria-hidden /> {label}
    </button>
  );
}

// A link to a printable one-page brief, opened in a new tab.
export function PrintLink({ href }: { href: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={`${btnSecondary} print:hidden`}>
      <Printer size={16} aria-hidden /> One-page brief (print or PDF)
    </a>
  );
}
