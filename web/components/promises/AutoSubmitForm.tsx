"use client";

// A plain GET form that also submits when a select changes. Without JavaScript it still works with its button.
export function AutoSubmitForm({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <form
      method="get"
      className={className}
      onChange={(e) => {
        if ((e.target as HTMLElement).tagName === "SELECT") e.currentTarget.requestSubmit();
      }}
    >
      {children}
    </form>
  );
}
