"use client";

import { useMotion } from "./useMotion";

// Plays its children's m-* transitions once, when it scrolls into view (see useMotion).
export default function Reveal({ id, children, className = "", threshold = 0.25 }: { id: string; children: React.ReactNode; className?: string; threshold?: number }) {
  const { ref, state } = useMotion<HTMLDivElement>(id, { threshold });
  return (
    <div ref={ref} data-state={state} className={`rw-m ${className}`}>
      {children}
    </div>
  );
}
