"use client";

import { ArrowLeft, ArrowRight, Compass, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

type Step = { path: string; target: string; title: string; body: string };

// The judge tour: real pages, one feature at a time.
const STEPS: Step[] = [
  {
    path: "/",
    target: "problem",
    title: "The problem, in a real case",
    body: "Smart motorways: each dot is a coroner's report on the same concern to the same organisation, and each arc joins a repeat back to the first warning.",
  },
  {
    path: "/",
    target: "stats",
    title: "What Recurrence Watch found",
    body: "Every report and response since 2013, read and linked. The figures are read from the database at each publish, and every quote is checked word for word against the source.",
  },
  {
    path: "/chains/c52cded99f756309",
    target: "story",
    title: "One recurrence, as a story",
    body: "Smart motorways: the first warning, each response and what it said it would do, then each time the concern came back. The gaps are drawn to scale.",
  },
  {
    path: "/brief",
    target: "brief-form",
    title: "Watch the agent",
    body: "Pick any report and press Check. You will see Nemotron Nano extract the concerns, pgvector search earlier warnings, and Nemotron Super judge each one, with tokens and cost.",
  },
  {
    path: "/judge",
    target: "game",
    title: "Your turn to be the judge",
    body: "Two concerns, years apart: same hazard or not? Compare your call with Nemotron Super's, then see why this needs a machine to read the whole archive.",
  },
  {
    path: "/promises",
    target: "promise-list",
    title: "Promises, then the same concern",
    body: "Each card is a response that stated an action, then a later coroner who raised the same concern. It shows the concern came back, not why.",
  },
  {
    path: "/map",
    target: "map",
    title: "Every concern, placed by meaning",
    body: "Every concern in the archive: close points mean similar hazards, and the lines are recurrences the judge confirmed. Press Replay the years to watch them build up.",
  },
  {
    path: "/how-we-know",
    target: "funnel",
    title: "How Nemotron did the work",
    body: "From archive to evidence: which model did each step, the tokens it used and what it cost, from the cost ledger.",
  },
  {
    path: "/how-we-know/evaluation",
    target: "eval-chart",
    title: "And how we know it works",
    body: "On recurrences that coroners themselves flagged, the Nemotron judge found more than word matching or embeddings alone, at the same number of links shown.",
  },
];

const KEY = "rw-tour-step";
export const TOUR_EVENT = "rw:tour-start";

export function startTour() {
  window.dispatchEvent(new Event(TOUR_EVENT));
}

export default function Tour() {
  const router = useRouter();
  const path = usePathname() ?? "/";
  const [step, setStep] = useState<number | null>(null);
  const [rectState, setRect] = useState<DOMRect | null>(null);
  const [missing, setMissing] = useState(false);

  // Resume after navigation, start on demand or from ?tour=1.
  useEffect(() => {
    try {
      // Resume only on that step's own page; a reader who opened another page has left the tour.
      const s = sessionStorage.getItem(KEY);
      if (s !== null && STEPS[Number(s)]?.path === window.location.pathname) setStep(Number(s));
      else sessionStorage.removeItem(KEY);
    } catch {}
    if (new URLSearchParams(window.location.search).get("tour") === "1") setStep(0);
    const onStart = () => setStep(0);
    window.addEventListener(TOUR_EVENT, onStart);
    return () => window.removeEventListener(TOUR_EVENT, onStart);
  }, []);

  useEffect(() => {
    try {
      if (step === null) sessionStorage.removeItem(KEY);
      else sessionStorage.setItem(KEY, String(step));
    } catch {}
  }, [step]);

  const current = step !== null ? STEPS[step] : null;

  // The tour moves between pages itself; if the reader navigates elsewhere, the tour ends.
  const expected = useRef<string | null>(null);
  useEffect(() => {
    if (!current) return;
    if (path !== current.path) {
      expected.current = current.path;
      router.push(current.path);
    }
    // Only on step changes: path changes are handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);
  useEffect(() => {
    if (!current) return;
    if (path === current.path) expected.current = null;
    else if (expected.current !== current.path) setStep(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);

  // On the step's page, find and spotlight its element.
  useEffect(() => {
    if (!current) return;
    setRect(null);
    setMissing(false);
    if (path !== current.path) return;
    let tries = 0;
    let el: HTMLElement | null = null;
    const find = () => {
      el = document.querySelector<HTMLElement>(`[data-tour="${current.target}"]`);
      if (el) {
        // Tall features: show their top part, below the sticky header, and leave room for the card.
        const tall = el.getBoundingClientRect().height > window.innerHeight * 0.55;
        if (tall) window.scrollTo({ top: window.scrollY + el.getBoundingClientRect().top - 84, behavior: "smooth" });
        else el.scrollIntoView({ behavior: "smooth", block: "center" });
        setTimeout(() => el && setRect(el.getBoundingClientRect()), 450);
      } else if (++tries < 40) setTimeout(find, 125);
      else setMissing(true);
    };
    find();
    const update = () => el && setRect(el.getBoundingClientRect());
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [current, path, router]);

  const close = useCallback(() => setStep(null), []);
  const go = useCallback((d: number) => setStep((s) => (s === null ? null : Math.max(0, Math.min(STEPS.length, s + d)))), []);

  useEffect(() => {
    if (step === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      else if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step, close, go]);

  const [vw, setVw] = useState(1200);
  useLayoutEffect(() => {
    const f = () => setVw(window.innerWidth);
    f();
    window.addEventListener("resize", f);
    return () => window.removeEventListener("resize", f);
  }, []);

  if (step === null) return null;
  let rect = rectState;

  // Finished: a closing card with where to go next.
  if (step >= STEPS.length) {
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label="Tour finished">
        <div className="card w-full max-w-md p-6 space-y-3 fade-in shadow-[var(--shadow-lg)]">
          <p className="eyebrow">That is the tour</p>
          <h2 className="font-serif text-2xl">Now try it on any report</h2>
          <p className="text-ink-2 text-sm">
            Everything you saw is live: the data refreshes itself every week, and the agent checks new reports on demand.
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            <Link href="/brief" onClick={close} className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3.5 py-2 text-sm font-medium text-accent-ink hover:no-underline">
              Check a report <ArrowRight size={15} aria-hidden />
            </Link>
            <Link href="/judge" onClick={close} className="inline-flex items-center rounded-md border border-rule bg-surface px-3.5 py-2 text-sm hover:no-underline">
              You be the judge
            </Link>
            <button type="button" onClick={close} className="ml-auto text-sm text-muted hover:text-accent">
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  const s = STEPS[step];
  const pad = 8;
  if (rect && rect.height > window.innerHeight * 0.55) {
    const top = Math.max(rect.top, 72);
    rect = new DOMRect(rect.left, top, rect.width, Math.min(rect.bottom, window.innerHeight * 0.55) - top);
  }
  const mobile = vw < 640;
  const cardW = Math.min(360, vw - 24);
  let cardStyle: React.CSSProperties = { width: cardW, left: "50%", top: "50%", transform: "translate(-50%, -50%)" };
  if (rect && !mobile) {
    const below = rect.bottom + pad + 12;
    const fitsBelow = below + 220 < window.innerHeight;
    const top = fitsBelow ? below : Math.max(12, rect.top - pad - 12 - 220);
    const left = Math.min(Math.max(12, rect.left), vw - cardW - 12);
    cardStyle = { width: cardW, left, top };
  } else if (mobile) {
    cardStyle = { left: 12, right: 12, bottom: 12 };
  }

  return (
    <div className="pointer-events-none fixed inset-0 z-[60]" role="dialog" aria-modal="false" aria-label={`Tour step ${step + 1} of ${STEPS.length}`}>
      {/* Dim everything except the highlighted feature. */}
      {rect ? (
        <div
          className="pointer-events-none fixed rounded-xl ring-2 ring-accent transition-all duration-300 motion-reduce:transition-none"
          style={{
            left: rect.left - pad,
            top: rect.top - pad,
            width: rect.width + pad * 2,
            height: rect.height + pad * 2,
            boxShadow: "0 0 0 9999px rgba(10, 14, 20, 0.5)",
          }}
          aria-hidden
        />
      ) : (
        <div className="pointer-events-none fixed inset-0 bg-black/40" aria-hidden />
      )}
      <div className="pointer-events-auto fixed z-[61] card p-4 sm:p-5 space-y-2.5 shadow-[var(--shadow-lg)] fade-in" style={cardStyle}>
        <div className="flex items-center justify-between gap-2">
          <p className="eyebrow flex items-center gap-1.5">
            <Compass size={13} aria-hidden /> Tour · {step + 1} of {STEPS.length}
          </p>
          <button type="button" onClick={close} aria-label="End the tour" className="text-muted hover:text-ink">
            <X size={16} aria-hidden />
          </button>
        </div>
        <h2 className="font-serif text-lg leading-snug text-ink">{s.title}</h2>
        <p className="text-sm text-ink-2">{s.body}</p>
        {!rect && !missing && <p className="text-xs text-muted">Opening the page…</p>}
        <div className="flex items-center gap-2 pt-1">
          <div className="flex gap-1" aria-hidden>
            {STEPS.map((_, i) => (
              <span key={i} className={`h-1.5 w-1.5 rounded-full ${i === step ? "bg-accent" : "bg-rule"}`} />
            ))}
          </div>
          <div className="ml-auto flex gap-2">
            {step > 0 && (
              <button type="button" onClick={() => go(-1)} className="inline-flex items-center gap-1 rounded-md border border-rule bg-surface px-3 py-1.5 text-sm">
                <ArrowLeft size={14} aria-hidden /> Back
              </button>
            )}
            <button type="button" onClick={() => go(1)} className="inline-flex items-center gap-1 rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-ink">
              {step === STEPS.length - 1 ? "Finish" : "Next"} <ArrowRight size={14} aria-hidden />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function TourButton({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <button type="button" onClick={startTour} className={className}>
      {children}
    </button>
  );
}
