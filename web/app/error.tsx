"use client";

import { RotateCcw } from "lucide-react";
import Link from "next/link";
import LostDots from "@/components/LostDots";
import { btnPrimary, btnSecondary } from "@/components/ui";

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="mx-auto max-w-xl space-y-5 py-8 text-center">
      <div className="flex justify-center">
        <LostDots />
      </div>
      <h1 className="font-serif text-3xl">This page could not load just now</h1>
      <p className="text-ink-2">
        The data service may be restarting or publishing new reports, which takes a few minutes. Nothing is lost: please
        try again in a moment.
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        <button type="button" onClick={reset} className={`${btnPrimary} px-4 py-2.5`}>
          <RotateCcw size={16} aria-hidden /> Try again
        </button>
        <Link href="/" className={`${btnSecondary} px-4 py-2.5`}>
          Go to Start here
        </Link>
      </div>
    </div>
  );
}
