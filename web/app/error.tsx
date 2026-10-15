"use client";

import Link from "next/link";

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="card p-8 max-w-xl space-y-3">
      <h1 className="font-serif text-2xl">This page could not load just now</h1>
      <p className="text-ink-2">
        The data service may be restarting or refreshing. Please try again in a moment.
      </p>
      <div className="flex gap-3">
        <button onClick={reset} className="rounded-md bg-accent text-accent-ink px-3.5 py-2 text-sm font-medium">
          Try again
        </button>
        <Link href="/" className="rounded-md border border-rule px-3.5 py-2 text-sm">
          Go to Start here
        </Link>
      </div>
    </div>
  );
}
