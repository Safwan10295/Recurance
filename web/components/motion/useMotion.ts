"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// One small motion system for every animation on the site (D37).
//
// state "pre"   the start frame (only ever shown when scripts run: see .js in globals.css)
//       "run"   CSS transitions play, each element with its own --d delay
//       "still" the final frame, no transitions: reduced motion, or already seen this session
//
// An animation plays once, when it first scrolls into view. Ones marked `session` play once per browser
// session, then show their final frame. Adding ?replay to the address plays everything again, for recording.

const SEEN = "rw-seen";

export function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

export function replayRequested(): boolean {
  try {
    return new URLSearchParams(window.location.search).has("replay");
  } catch {
    return false;
  }
}

function seenList(): string[] {
  try {
    return JSON.parse(sessionStorage.getItem(SEEN) || "[]");
  } catch {
    return [];
  }
}

function markSeen(id: string) {
  try {
    const s = seenList();
    if (!s.includes(id)) sessionStorage.setItem(SEEN, JSON.stringify([...s, id]));
  } catch {
    /* storage blocked: the animation just plays again next time */
  }
}

export type MotionState = "pre" | "run" | "still";

export function useMotion<T extends HTMLElement | SVGElement = HTMLDivElement>(
  id: string,
  { session = false, threshold = 0.35, durationMs = 0 }: { session?: boolean; threshold?: number; durationMs?: number } = {},
) {
  const ref = useRef<T>(null);
  const [state, setState] = useState<MotionState>("pre");
  const [runs, setRuns] = useState(0); // increments on each play, so timers and counters can restart
  const [done, setDone] = useState(false);

  const play = useCallback(() => {
    const html = document.documentElement;
    html.dataset.seen = (html.dataset.seen || "").split(" ").filter((x) => x && x !== id).join(" ");
    setDone(false);
    setState("pre");
    // Two frames: the reset frame paints with transitions off, then the run frame starts them.
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        setState("run");
        setRuns((n) => n + 1);
      }),
    );
  }, [id]);

  useEffect(() => {
    if (prefersReducedMotion() || (session && seenList().includes(id) && !replayRequested())) {
      setState("still");
      setDone(true);
      return;
    }
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setState("still");
      setDone(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          io.disconnect();
          if (session) markSeen(id);
          setState("run");
          setRuns((n) => n + 1);
        }
      },
      { threshold },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [id, session, threshold]);

  // Mark the end, so a component can show its closing line or replay button.
  useEffect(() => {
    if (state !== "run" || !durationMs) return;
    const t = setTimeout(() => setDone(true), durationMs);
    return () => clearTimeout(t);
  }, [state, runs, durationMs]);

  return { ref, state, runs, done: done || state === "still", replay: play };
}

// A number that counts up to its value while state is "run", over durationMs, easing out.
export function useCountUp(value: number, state: MotionState, runs: number, durationMs = 1200, delayMs = 0): number {
  // Starts at the final value, so the server render (and a page without scripts) shows the real number.
  const [v, setV] = useState(value);
  useEffect(() => {
    if (state === "still") {
      setV(value);
      return;
    }
    if (state === "pre") {
      setV(0);
      return;
    }
    let raf = 0;
    const start = performance.now() + delayMs;
    const tick = (now: number) => {
      const t = Math.min(1, Math.max(0, (now - start) / durationMs));
      setV(value * (1 - Math.pow(1 - t, 3)));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, state, runs, durationMs, delayMs]);
  return v;
}
