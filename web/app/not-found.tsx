import Link from "next/link";

export default function NotFound() {
  return (
    <div className="space-y-3 max-w-2xl">
      <h1 className="font-serif text-3xl">Page not found</h1>
      <p className="text-ink-2">
        The page may have moved after the data was refreshed. Try the <Link href="/chains">list of chains</Link>.
      </p>
    </div>
  );
}
