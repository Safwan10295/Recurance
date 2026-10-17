"use client";

import {
  ArrowRight,
  BookOpenCheck,
  Check,
  Clock3,
  FileSearch,
  Gavel,
  Quote as QuoteIcon,
  RefreshCw,
  RotateCcw,
  ScanSearch,
  Sparkles,
  X,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ShareCard from "./judge/ShareCard";
import { btnPrimary, btnSecondary, formatDate, gapText, shortTitle } from "./ui";

export type GamePair = {
  id: number;
  org: string;
  relation: "identical" | "closely_related" | "related" | "different";
  confidence: number;
  explanation: string;
  days_apart: number;
  earlier: { title: string; date: string; slug: string; url: string; quote: string };
  later: { title: string; date: string; slug: string; url: string; quote: string };
  chain: string | null;
};
export type GameFacts = {
  reports: number;
  concerns: number;
  pairs: number;
  chains: number;
  links: number;
  judgeCost: number | null;
  shareDiffCoroner: number;
  shareNotCited: number;
  updated: string | null;
  recallJudge: number | null;
};

const ROUNDS = 8;
const SAME = new Set(["identical", "closely_related"]);
const VERDICT: Record<GamePair["relation"], string> = {
  identical: "Identical hazard",
  closely_related: "Closely related",
  related: "Related, but a different hazard",
  different: "A different hazard",
};

type Answer = { pair: GamePair; same: boolean | null; ms: number };

// Two same-hazard and two not-same pairs in every four rounds, so a game is balanced.
function deal(pairs: GamePair[]): GamePair[] {
  const shuffle = <T,>(xs: T[]) => xs.map((x) => [Math.random(), x] as const).sort((a, b) => a[0] - b[0]).map(([, x]) => x);
  const yes = shuffle(pairs.filter((p) => SAME.has(p.relation)));
  const no = shuffle(pairs.filter((p) => !SAME.has(p.relation)));
  const out: GamePair[] = [];
  for (let i = 0; out.length < ROUNDS && (yes[i] || no[i]); i++) {
    if (yes[i]) out.push(yes[i]);
    if (no[i] && out.length < ROUNDS) out.push(no[i]);
  }
  return shuffle(out);
}

function hours(ms: number) {
  const h = ms / 3_600_000;
  return h < 1 ? `${Math.round(h * 60)} minutes` : `${h < 10 ? h.toFixed(1) : Math.round(h).toLocaleString("en-GB")} hours`;
}

export default function JudgeGame({ pairs, facts }: { pairs: GamePair[]; facts: GameFacts }) {
  const [stage, setStage] = useState<"intro" | "play" | "end">("intro");
  const [deck, setDeck] = useState<GamePair[]>([]);
  const [round, setRound] = useState(0);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [revealed, setRevealed] = useState<Answer | null>(null);
  const shownAt = useRef(0);
  const topRef = useRef<HTMLDivElement>(null);

  const start = useCallback(() => {
    setDeck(deal(pairs));
    setRound(0);
    setAnswers([]);
    setRevealed(null);
    setStage("play");
    shownAt.current = Date.now();
  }, [pairs]);

  // Keep the game in view as rounds change, but never scroll on first load.
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [stage, round]);

  const answer = (same: boolean | null) => {
    const a = { pair: deck[round], same, ms: Date.now() - shownAt.current };
    setAnswers((xs) => [...xs, a]);
    setRevealed(a);
  };
  const next = () => {
    setRevealed(null);
    if (round + 1 >= deck.length) setStage("end");
    else {
      setRound((r) => r + 1);
      shownAt.current = Date.now();
    }
  };

  // Keyboard: Y or 1 = same, N or 2 = not the same, Enter = next.
  useEffect(() => {
    if (stage !== "play") return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === "INPUT") return;
      if (!revealed && (e.key === "y" || e.key === "1")) answer(true);
      else if (!revealed && (e.key === "n" || e.key === "2")) answer(false);
      else if (revealed && e.key === "Enter") next();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div ref={topRef} className="scroll-mt-24" data-tour="game">
      {stage === "intro" && <Intro onStart={start} n={pairs.length} />}
      {stage === "play" && deck[round] && (
        <Round
          pair={deck[round]}
          round={round}
          total={deck.length}
          answers={answers}
          revealed={revealed}
          onAnswer={answer}
          onNext={next}
          onStop={() => setStage("end")}
        />
      )}
      {stage === "end" && <End answers={answers} total={deck.length} facts={facts} onAgain={start} />}
    </div>
  );
}

function Intro({ onStart, n }: { onStart: () => void; n: number }) {
  return (
    <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr] lg:items-center">
      <div className="space-y-4">
        <p className="text-lg text-ink-2 leading-relaxed">
          Each round shows two concerns that coroners sent to the same organisation, years apart. Decide whether the later
          report raises <span className="text-ink">the same hazard</span>, then see what Nemotron Super decided, and why.
        </p>
        <ul className="space-y-2 text-sm text-ink-2 list-none p-0">
          <li className="flex gap-2">
            <QuoteIcon size={16} className="mt-0.5 shrink-0 text-accent" aria-hidden /> Real quotes, checked word for word against the reports.
          </li>
          <li className="flex gap-2">
            <Gavel size={16} className="mt-0.5 shrink-0 text-accent" aria-hidden /> {ROUNDS} rounds, drawn from {n} pairs the judge has already decided.
          </li>
          <li className="flex gap-2">
            <Clock3 size={16} className="mt-0.5 shrink-0 text-accent" aria-hidden /> About two minutes. Stop whenever you like.
          </li>
        </ul>
        <button type="button" onClick={onStart} className={`${btnPrimary} px-5 py-2.5 text-base`}>
          <Gavel size={18} aria-hidden /> Start
        </button>
      </div>
      <div className="card p-5 space-y-3 shadow-[var(--shadow-lg)]" aria-hidden>
        <p className="eyebrow">What a round looks like</p>
        <div className="rounded-lg border border-rule p-3 text-sm text-ink-2">
          <p className="eyebrow mb-1">Earlier report · 2019</p>
          <p className="font-serif text-ink">&ldquo;There is no hard shoulder, so a stopped vehicle is left in a live lane…&rdquo;</p>
        </div>
        <div className="rounded-lg border border-rule p-3 text-sm text-ink-2">
          <p className="eyebrow mb-1">Later report · 2023</p>
          <p className="font-serif text-ink">&ldquo;There was nowhere for the driver of the first vehicle to park safely…&rdquo;</p>
        </div>
        <div className="flex gap-2">
          <span className="flex-1 rounded-md bg-accent px-3 py-2 text-center text-sm text-accent-ink">Same hazard</span>
          <span className="flex-1 rounded-md border border-rule px-3 py-2 text-center text-sm">Not the same</span>
        </div>
      </div>
    </div>
  );
}

function Round({
  pair,
  round,
  total,
  revealed,
  onAnswer,
  onNext,
  onStop,
  answers,
}: {
  pair: GamePair;
  round: number;
  total: number;
  answers: Answer[];
  revealed: Answer | null;
  onAnswer: (same: boolean | null) => void;
  onNext: () => void;
  onStop: () => void;
}) {
  const judgeSame = SAME.has(pair.relation);
  const agreed = revealed && revealed.same !== null ? revealed.same === judgeSame : null;
  // The agreement meter: calls that matched the model's, out of calls made so far.
  const made = answers.filter((a) => a.same !== null);
  const matched = made.filter((a) => a.same === SAME.has(a.pair.relation)).length;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="font-serif text-2xl num">
            {round + 1}
            <span className="text-muted text-lg"> / {total}</span>
          </span>
          <div className="flex gap-1" aria-hidden>
            {Array.from({ length: total }, (_, i) => (
              <span key={i} className={`h-1.5 w-6 rounded-full ${i < round || (i === round && revealed) ? "bg-accent" : i === round ? "bg-accent/40" : "bg-rule"}`} />
            ))}
          </div>
        </div>
        <div className="flex items-center gap-3" aria-live="polite">
          <span className="text-sm text-ink-2">
            Agreed with Nemotron: <span className="num text-ink">{matched}</span> of <span className="num">{made.length}</span>
          </span>
          <span className="block h-2 w-28 overflow-hidden rounded-full bg-paper-2" aria-hidden>
            <span
              className="block h-full rounded-full bg-accent transition-[width] duration-300 ease-out motion-reduce:transition-none"
              style={{ width: `${made.length ? (matched / made.length) * 100 : 0}%` }}
            />
          </span>
        </div>
        <button type="button" onClick={onStop} className="text-sm text-muted hover:text-accent">
          Stop and see what this means →
        </button>
      </div>

      <div className="card p-4 sm:p-6 space-y-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="eyebrow">Both sent to {pair.org}</p>
          <p className="text-xs text-muted num">{gapText(pair.days_apart)} apart</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {(["earlier", "later"] as const).map((side) => (
            <div key={side} className="rounded-xl border border-rule bg-paper-2/40 p-4 space-y-2">
              <p className="eyebrow">
                {side === "earlier" ? "Earlier report" : "Later report"} · {formatDate(pair[side].date)}
              </p>
              <blockquote className="font-serif text-[1.05rem] leading-relaxed text-ink">&ldquo;{pair[side].quote}&rdquo;</blockquote>
            </div>
          ))}
        </div>

        {!revealed ? (
          <div className="space-y-2">
            <p className="text-center font-medium text-ink">Does the later report raise the same hazard?</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <button type="button" onClick={() => onAnswer(true)} className={`${btnPrimary} py-3 text-base`}>
                <Check size={18} aria-hidden /> Same hazard <kbd className="kbd ml-1 hidden sm:inline opacity-80">Y</kbd>
              </button>
              <button type="button" onClick={() => onAnswer(false)} className={`${btnSecondary} py-3 text-base`}>
                <X size={18} aria-hidden /> Not the same <kbd className="kbd ml-1 hidden sm:inline">N</kbd>
              </button>
            </div>
            <p className="text-center">
              <button type="button" onClick={() => onAnswer(null)} className="text-xs text-muted hover:text-accent">
                Not sure, show me
              </button>
            </p>
          </div>
        ) : (
          <div className="flip-in space-y-4 rounded-xl border border-accent/40 bg-accent-soft/50 p-4 sm:p-5">
            <div className="flex flex-wrap items-center gap-2">
              <Sparkles size={18} className="text-accent" aria-hidden />
              <span className="font-medium text-ink">Nemotron Super judged: {VERDICT[pair.relation]}</span>
              <span className="rounded-full border border-rule bg-surface px-2.5 py-0.5 text-xs num">confidence {pair.confidence.toFixed(2)}</span>
            </div>
            <p className="text-ink-2">{pair.explanation}</p>
            <p className="text-sm">
              {agreed === null ? (
                <span className="text-muted">You chose not to answer this one.</span>
              ) : agreed ? (
                <span className="inline-flex items-center gap-1.5 text-accent">
                  <Check size={16} aria-hidden /> You agreed with the judge.
                </span>
              ) : (
                <span className="text-ink-2">
                  You read it differently. Reasonable people can; that is why every link shows its quotes and a confidence.
                </span>
              )}
            </p>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
              {pair.chain && (
                <Link href={`/chains/${pair.chain}`} target="_blank">
                  See this recurrence chain ↗
                </Link>
              )}
              <Link href={`/reports/${pair.earlier.slug}`} target="_blank">
                {shortTitle(pair.earlier.title)} ↗
              </Link>
              <Link href={`/reports/${pair.later.slug}`} target="_blank">
                {shortTitle(pair.later.title)} ↗
              </Link>
              <button type="button" onClick={onNext} className={`${btnPrimary} ml-auto`}>
                {round + 1 >= total ? "See the result" : "Next round"} <ArrowRight size={16} aria-hidden />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function End({ answers, total, facts, onAgain }: { answers: Answer[]; total: number; facts: GameFacts; onAgain: () => void }) {
  const answered = answers.filter((a) => a.same !== null);
  const agreed = answered.filter((a) => a.same === SAME.has(a.pair.relation)).length;
  const finished = answers.length >= total;
  const avg = useMemo(() => {
    const ts = answers.map((a) => a.ms).filter((ms) => ms > 1500 && ms < 300_000);
    return ts.length ? ts.reduce((x, y) => x + y, 0) / ts.length : 25_000;
  }, [answers]);
  const pct = (x: number) => {
    const r = Math.round(x * 100);
    return `${r === 100 && x < 1 ? 99 : r}%`;
  };
  return (
    <div className="space-y-8 fade-in">
      <div className="card p-5 sm:p-7 space-y-3 border-l-4 border-l-accent">
        <p className="eyebrow">{finished ? "Your result" : "You stopped early, which is fair: it is slow, careful work"}</p>
        <h2 className="font-serif text-2xl sm:text-3xl leading-snug">
          {answered.length === 0
            ? "You saw how hard each call is."
            : `You agreed with Nemotron on ${agreed} of ${answered.length} ${answered.length === 1 ? "pair" : "pairs"}.`}
        </h2>
        <p className="text-ink-2">
          You took about <span className="text-ink num">{Math.round(avg / 1000)} seconds</span> a pair. At that pace, reading
          all <span className="num">{facts.pairs.toLocaleString("en-GB")}</span> candidate pairs would take about{" "}
          <span className="text-ink">{hours(avg * facts.pairs)}</span>, and that is after someone has found those pairs among{" "}
          <span className="num">{facts.concerns.toLocaleString("en-GB")}</span> concerns in{" "}
          <span className="num">{facts.reports.toLocaleString("en-GB")}</span> reports.
          {facts.judgeCost !== null && (
            <>
              {" "}
              Nemotron Super judged every pair for <span className="text-ink num">${facts.judgeCost.toFixed(2)}</span>.
            </>
          )}
        </p>
      </div>

      {answered.length > 0 && <ShareCard agreed={agreed} answered={answered.length} />}

      <section className="space-y-4">
        <h2 className="font-serif text-2xl">This is why we built Recurrence Watch</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="card p-5 space-y-2">
            <FileSearch size={20} className="text-accent" aria-hidden />
            <p className="font-medium text-ink">Nobody can hold the whole record in their head</p>
            <p className="text-sm text-ink-2">
              In {pct(facts.shareDiffCoroner)} of the links we found, the later report came from a different coroner, and in{" "}
              {pct(facts.shareNotCited)} it did not cite the earlier warning. The memory is in the archive, not in any one person.
            </p>
          </div>
          <div className="card p-5 space-y-2">
            <Sparkles size={20} className="text-accent" aria-hidden />
            <p className="font-medium text-ink">It does the reading, so people can do the judging</p>
            <p className="text-sm text-ink-2">
              Nemotron Nano pulled out every concern, Nemotron Super judged each likely pair, and the result is{" "}
              {facts.chains.toLocaleString("en-GB")} recurrence chains to read in minutes instead of weeks.
            </p>
          </div>
          <div className="card p-5 space-y-2">
            <BookOpenCheck size={20} className="text-accent" aria-hidden />
            <p className="font-medium text-ink">Every claim can be checked</p>
            <p className="text-sm text-ink-2">
              Each link shows the exact words from both reports, verified by code, with a link to the original. The judge can be
              wrong, so it says how sure it is
              {facts.recallJudge !== null ? `, and we measured it: it found ${pct(facts.recallJudge)} of the recurrences coroners themselves flagged, more than either baseline` : ""}.
            </p>
          </div>
          <div className="card p-5 space-y-2">
            <RefreshCw size={20} className="text-accent" aria-hidden />
            <p className="font-medium text-ink">It keeps itself up to date</p>
            <p className="text-sm text-ink-2">
              Every week the server reads new reports from judiciary.uk, extracts their concerns, links them to earlier
              warnings and republishes, within a fixed spending limit. Any brand-new report can also be checked on the spot.
              {facts.updated ? ` Data last updated ${facts.updated}.` : ""}
            </p>
          </div>
        </div>
      </section>

      <div className="flex flex-wrap gap-2">
        <Link href="/brief" className={`${btnPrimary} px-4 py-2.5`}>
          <ScanSearch size={17} aria-hidden /> Watch the agent check a report
        </Link>
        <Link href="/chains/c52cded99f756309" className={`${btnSecondary} px-4 py-2.5`}>
          See a full recurrence chain
        </Link>
        <button type="button" onClick={onAgain} className={`${btnSecondary} px-4 py-2.5`}>
          <RotateCcw size={16} aria-hidden /> Play again
        </button>
      </div>
    </div>
  );
}
