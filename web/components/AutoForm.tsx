"use client";

import { useEffect, useRef } from "react";

// A GET form that applies itself when a select or checkbox changes (text fields apply on Enter or blur).
// Still a plain form, so it works without JavaScript via its submit button.
export default function AutoForm({ children, className, action }: { children: React.ReactNode; className?: string; action?: string }) {
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    const f = ref.current;
    if (!f) return;
    const onChange = (e: Event) => {
      const t = e.target as HTMLInputElement;
      if (t.tagName === "SELECT" || t.type === "checkbox" || t.type === "radio") f.requestSubmit();
    };
    f.addEventListener("change", onChange);
    return () => f.removeEventListener("change", onChange);
  }, []);
  return (
    <form ref={ref} method="get" action={action} className={className}>
      {children}
    </form>
  );
}
