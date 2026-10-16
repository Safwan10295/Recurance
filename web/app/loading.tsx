// Shown while a page's data loads, so navigation always gives immediate feedback.
export default function Loading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading">
      <div className="space-y-3 border-b border-rule pb-6">
        <div className="skeleton h-3 w-40" />
        <div className="skeleton h-9 w-3/4 max-w-xl" />
        <div className="skeleton h-4 w-full max-w-2xl" />
      </div>
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="skeleton h-24" />
        ))}
      </div>
      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="skeleton h-28" />
        ))}
      </div>
    </div>
  );
}
