import { ArrowRight, Link2, ScanSearch } from "lucide-react";
import Link from "next/link";
import LostDots from "@/components/LostDots";
import { btnPrimary, btnSecondary } from "@/components/ui";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-xl space-y-5 py-8 text-center">
      <div className="flex justify-center">
        <LostDots />
      </div>
      <h1 className="font-serif text-3xl">This page is not in the record</h1>
      <p className="text-ink-2">
        It may have moved when the data was refreshed: chains are renamed when new reports join them, and old addresses
        usually redirect. Search or start again from one of these.
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        <Link href="/" className={`${btnPrimary} px-4 py-2.5`}>
          Start here <ArrowRight size={16} aria-hidden />
        </Link>
        <Link href="/brief" className={`${btnSecondary} px-4 py-2.5`}>
          <ScanSearch size={16} aria-hidden /> Check a report
        </Link>
        <Link href="/chains" className={`${btnSecondary} px-4 py-2.5`}>
          <Link2 size={16} aria-hidden /> Recurrence chains
        </Link>
      </div>
      <p className="text-sm text-muted">
        Or press <kbd className="kbd">Ctrl</kbd> <kbd className="kbd">K</kbd> to search reports, hazards and organisations.
      </p>
    </div>
  );
}
