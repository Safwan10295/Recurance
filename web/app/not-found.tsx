import Link from "next/link";

export default function NotFound() {
  return (
    <div className="card p-8 max-w-xl space-y-3">
      <h1 className="font-serif text-2xl">Page not found</h1>
      <p className="text-ink-2">This page does not exist, or it moved when the data was refreshed.</p>
      <div className="flex flex-wrap gap-3 text-sm">
        <Link href="/">Start here</Link>
        <Link href="/chains">Recurrence chains</Link>
        <Link href="/search">Search</Link>
      </div>
    </div>
  );
}
