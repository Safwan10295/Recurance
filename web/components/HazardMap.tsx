"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Minus, Pause, Play, Plus, RotateCcw, Search, X } from "lucide-react";
import type { HazardMapPayload } from "@/lib/queries-map";
import { btnPrimary, btnSecondary, fieldCls, formatDate } from "@/components/ui";

// ---------------------------------------------------------------------------
// Data model
// ---------------------------------------------------------------------------

interface Model {
  n: number;
  x: Float32Array;
  y: Float32Array;
  theme: Uint8Array;
  chain: Int32Array;
  report: Int32Array;
  hazard: Int32Array;
  themes: string[];
  themeCounts: number[];
  hazards: string[];
  hazardsLower: string[];
  reports: [string, string, string | null][];
  chains: [string, string, string][];
  la: Int32Array;
  lb: Int32Array;
  lc: Int32Array;
  /** per chain: every point that belongs to it (by point or by link) */
  chainPts: Int32Array[];
  /** per chain: its link indices */
  chainLinks: Int32Array[];
  nChainPts: number;
  grid: { g: number; start: Int32Array; items: Int32Array };
  // Time, in months since year 0 (year * 12 + month index + day fraction). Undated points never appear in a replay.
  /** per point: its report date */
  pt: Float64Array;
  /** per link: the later report's date */
  lt: Float64Array;
  ptSorted: Float64Array;
  ltSorted: Float64Array;
  /** replay range: start of the earliest year to the end of the latest month */
  tStart: number;
  tEnd: number;
  minYear: number;
  maxYear: number;
}

function monthsOf(date: string | null): number {
  const m = date ? /^(\d{4})-(\d{2})-(\d{2})/.exec(date) : null;
  return m ? Number(m[1]) * 12 + Number(m[2]) - 1 + (Number(m[3]) - 1) / 31 : Infinity;
}

// Number of sorted values <= t.
function countUpTo(sorted: Float64Array, t: number): number {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] <= t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const YEAR_MS = 1200; // one year of replay per 1.2 seconds
const POP_MS = 450; // new points grow in, then settle
const FLASH_MS = 1000; // new links flash, then settle

// Same rule as titleFromSlug in lib/queries-map.ts: the API leaves a title out when this rebuilds it.
function titleFromSlug(slug: string): string {
  const s = slug.replace(/-prevention-of-future-deaths?-report$/i, "").replace(/-/g, " ").trim();
  return s.replace(/\b\w/g, (m) => m.toUpperCase());
}

function buildModel(p: HazardMapPayload): Model {
  const n = p.x.length;
  const qd = p.q || 4095;
  const x = new Float32Array(n);
  const y = new Float32Array(n);
  const theme = new Uint8Array(n);
  const chain = new Int32Array(n);
  const report = new Int32Array(n);
  const hazard = new Int32Array(n);
  const themeCounts = new Array(p.themes.length).fill(0);
  let nChainPts = 0;
  for (let i = 0; i < n; i++) {
    x[i] = p.x[i] / qd;
    y[i] = p.y[i] / qd;
    theme[i] = p.t[i];
    chain[i] = p.c[i];
    report[i] = p.r[i];
    hazard[i] = p.h[i];
    themeCounts[p.t[i]] = (themeCounts[p.t[i]] ?? 0) + 1;
    if (p.c[i] >= 0) nChainPts++;
  }
  const nl = p.lc.length;
  const la = new Int32Array(nl);
  const lb = new Int32Array(nl);
  const lc = new Int32Array(nl);
  for (let i = 0; i < nl; i++) {
    la[i] = p.links[2 * i];
    lb[i] = p.links[2 * i + 1];
    lc[i] = p.lc[i];
  }
  const nc = p.chains.length;
  const ptsSets: Set<number>[] = Array.from({ length: nc }, () => new Set<number>());
  const linkLists: number[][] = Array.from({ length: nc }, () => []);
  for (let i = 0; i < n; i++) if (chain[i] >= 0) ptsSets[chain[i]].add(i);
  for (let i = 0; i < nl; i++) {
    if (lc[i] < 0) continue;
    ptsSets[lc[i]].add(la[i]);
    ptsSets[lc[i]].add(lb[i]);
    linkLists[lc[i]].push(i);
  }

  // Uniform grid over the unit square for fast nearest-point lookups.
  const g = 96;
  const counts = new Int32Array(g * g + 1);
  const cellOf = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    const cx = Math.min(g - 1, Math.max(0, Math.floor(x[i] * g)));
    const cy = Math.min(g - 1, Math.max(0, Math.floor(y[i] * g)));
    cellOf[i] = cy * g + cx;
    counts[cellOf[i] + 1]++;
  }
  for (let i = 0; i < g * g; i++) counts[i + 1] += counts[i];
  const start = counts.slice();
  const fill = counts.slice();
  const items = new Int32Array(n);
  for (let i = 0; i < n; i++) items[fill[cellOf[i]]++] = i;

  // Timestamps, computed once.
  const reportT = p.reports.map((r) => monthsOf(r[2]));
  const pt = new Float64Array(n);
  for (let i = 0; i < n; i++) pt[i] = reportT[report[i]] ?? Infinity;
  const lt = new Float64Array(nl);
  for (let i = 0; i < nl; i++) lt[i] = Math.max(pt[la[i]], pt[lb[i]]);
  const ptSorted = pt.slice().sort();
  const ltSorted = lt.slice().sort();
  let tMin = Infinity;
  let tMax = -Infinity;
  for (let i = 0; i < n; i++) {
    if (!Number.isFinite(pt[i])) continue;
    if (pt[i] < tMin) tMin = pt[i];
    if (pt[i] > tMax) tMax = pt[i];
  }
  if (!Number.isFinite(tMin)) tMin = tMax = new Date().getFullYear() * 12;
  const minYear = Math.floor(tMin / 12);
  const maxYear = Math.floor(tMax / 12);

  return {
    pt,
    lt,
    ptSorted,
    ltSorted,
    tStart: minYear * 12,
    tEnd: Math.floor(tMax) + 1,
    minYear,
    maxYear,
    n,
    x,
    y,
    theme,
    chain,
    report,
    hazard,
    themes: p.themes,
    themeCounts,
    hazards: p.hazards,
    hazardsLower: p.hazards.map((h) => h.toLowerCase()),
    reports: p.reports.map(([slug, title, date]) => [slug, title || titleFromSlug(slug), date] as [string, string, string | null]),
    chains: p.chains,
    la,
    lb,
    lc,
    chainPts: ptsSets.map((s) => Int32Array.from(s)),
    chainLinks: linkLists.map((l) => Int32Array.from(l)),
    nChainPts,
    grid: { g, start, items },
  };
}

// ---------------------------------------------------------------------------
// Colours (read from CSS tokens so light and dark themes both work)
// ---------------------------------------------------------------------------

interface Colors {
  dot: string;
  accent: string;
  ink: string;
  ink2: string;
  surface: string;
}
const LIGHT: Colors = { dot: "#b9bec6", accent: "#2f5d62", ink: "#18202c", ink2: "#444e5e", surface: "#ffffff" };

function readColors(): Colors {
  const cs = getComputedStyle(document.documentElement);
  const v = (name: string, fb: string) => cs.getPropertyValue(name).trim() || fb;
  return {
    dot: v("--dot", LIGHT.dot),
    accent: v("--accent", LIGHT.accent),
    ink: v("--ink", LIGHT.ink),
    ink2: v("--ink-2", LIGHT.ink2),
    surface: v("--surface", LIGHT.surface),
  };
}

// ---------------------------------------------------------------------------
// Point states: 0 hidden, 1 dimmed, 2 shown, 3 search match
// ---------------------------------------------------------------------------

const K_MIN = 0.8;
const K_MAX = 60;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
// World units (0..1) to CSS pixels at zoom 1: the unit square fits the shorter side.
const fitScale = (s: { w: number; h: number }) => Math.max(40, Math.min(s.w, s.h) * 0.94);
function clampView(v: { k: number; cx: number; cy: number }) {
  v.k = clamp(v.k, K_MIN, K_MAX);
  v.cx = clamp(v.cx, 0, 1);
  v.cy = clamp(v.cy, 0, 1);
}
const reportHref = (m: Model, i: number) => `/reports/${m.reports[m.report[i]][0]}`;
const pointHref = (m: Model, i: number) => (m.chain[i] >= 0 ? `/chains/${m.chains[m.chain[i]][0]}` : reportHref(m, i));

// ---------------------------------------------------------------------------
// Loader
// ---------------------------------------------------------------------------

export default function HazardMap() {
  const [model, setModel] = useState<Model | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    setError(null);
    fetch("/api/hazard-map")
      .then(async (r) => {
        const body = await r.json().catch(() => null);
        if (!r.ok) throw new Error((body && body.error) || "The map could not be loaded.");
        return body as HazardMapPayload;
      })
      .then((p) => {
        if (!alive) return;
        if (!p.x?.length) throw new Error("The map has not been published yet.");
        setModel(buildModel(p));
      })
      .catch((e: unknown) => alive && setError(e instanceof Error ? e.message : "The map could not be loaded."));
    return () => {
      alive = false;
    };
  }, [attempt]);

  if (error) {
    return (
      <div className="card p-8 text-center space-y-3" role="alert">
        <p className="font-serif text-lg">The map is not available right now</p>
        <p className="text-ink-2 text-sm">{error} Please try again in a few minutes.</p>
        <button type="button" className={btnSecondary} onClick={() => setAttempt((a) => a + 1)}>
          Try again
        </button>
      </div>
    );
  }
  if (!model) {
    return (
      <div className="space-y-3" aria-busy="true" aria-label="Loading the hazard map">
        <div className="card p-3 sm:p-4 space-y-3">
          <div className="skeleton h-9 w-full sm:w-80" />
          <div className="flex gap-1.5 overflow-hidden">
            {Array.from({ length: 7 }, (_, i) => (
              <div key={i} className="skeleton h-7 w-24 shrink-0 rounded-full" />
            ))}
          </div>
        </div>
        <div className="skeleton h-[60vh] sm:h-[70vh] min-h-[340px] max-h-[860px] w-full rounded-xl" />
        <span className="sr-only">Loading the hazard map.</span>
      </div>
    );
  }
  return <MapView m={model} />;
}

// ---------------------------------------------------------------------------
// The map
// ---------------------------------------------------------------------------

function MapView({ m }: { m: Model }) {
  const router = useRouter();
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);

  const [themeSel, setThemeSel] = useState(-1);
  const [query, setQuery] = useState("");
  const dq = useDeferredValue(query.trim().toLowerCase());
  const [onlyChains, setOnlyChains] = useState(false);
  const [showLinks, setShowLinks] = useState(true);
  const [hover, setHover] = useState(-1);
  const [selected, setSelected] = useState(-1);
  const shown = hover >= 0 ? hover : selected;

  // Per-point state from the filters.
  const { state, matchCount, matchList } = useMemo(() => {
    const st = new Uint8Array(m.n);
    let hazMatch: Uint8Array | null = null;
    if (dq) {
      hazMatch = new Uint8Array(m.hazards.length);
      for (let i = 0; i < m.hazards.length; i++) if (m.hazardsLower[i].includes(dq)) hazMatch[i] = 1;
    }
    let count = 0;
    const list: number[] = [];
    for (let i = 0; i < m.n; i++) {
      if (onlyChains && m.chain[i] < 0) continue;
      const themeOk = themeSel < 0 || m.theme[i] === themeSel;
      const searchOk = !hazMatch || (m.hazard[i] >= 0 && hazMatch[m.hazard[i]] === 1);
      if (!themeOk || !searchOk) st[i] = 1;
      else if (hazMatch) {
        st[i] = 3;
        count++;
        if (list.length < 12) list.push(i);
      } else st[i] = 2;
    }
    return { state: st, matchCount: count, matchList: list };
  }, [m, themeSel, dq, onlyChains]);

  // Mutable rendering state lives in refs so panning never re-renders React.
  const view = useRef({ k: 1, cx: 0.5, cy: 0.5 });
  const size = useRef({ w: 0, h: 0, dpr: 1 });
  const colors = useRef<Colors>(LIGHT);
  const live = useRef({ state, showLinks, shown, selected, hover });
  const raf = useRef(0);
  const anim = useRef(0);
  const reduced = useRef(false);
  const codes = useMemo(() => new Uint8Array(m.n), [m]);
  const sx = useMemo(() => new Float32Array(m.n), [m]);
  const sy = useMemo(() => new Float32Array(m.n), [m]);

  // Replay ("Replay the years"). The clock lives in a ref; React only hears about whole months.
  const [replayOn, setReplayOn] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [tUi, setTUi] = useState(m.tEnd);
  const rp = useRef({ on: false, playing: false, t: m.tEnd, last: 0, acc: 0, fresh: false, busyUntil: 0, uiMonth: m.tEnd });
  const loop = useRef(0);
  // Wall-clock time each point or link appeared in the replay (0 = not shown yet), for the brief pop and flash.
  const pSeen = useMemo(() => new Float64Array(m.n), [m]);
  const lSeen = useMemo(() => new Float64Array(m.la.length), [m]);
  const pop = useMemo(() => new Float32Array(m.n).fill(1), [m]);

  const draw = useCallback(() => {
    raf.current = 0;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const { w, h, dpr } = size.current;
    if (!w || !h) return;
    const { state: st, showLinks: links, shown: focus } = live.current;
    const c = colors.current;
    const v = view.current;
    const S = fitScale(size.current) * v.k;
    const ox = w / 2 - v.cx * S;
    const oy = h / 2 - v.cy * S;
    const small = Math.min(w, h) < 480;
    const r0 = clamp(1.35 * Math.pow(v.k, 0.45), 1.2, 5.5) * (small ? 0.85 : 1);
    const fc = focus >= 0 ? m.chain[focus] : -1;

    // Replay clock: what exists at time T, and what has only just appeared.
    const R = rp.current;
    const T = R.on ? R.t : Infinity;
    const now = performance.now();
    const motion = R.on && !reduced.current;
    const settled = now - 1e6;
    let busyUntil = 0;
    const linkOn = (i: number) => m.lt[i] <= T;
    if (R.on) {
      for (let i = 0; i < m.la.length; i++) {
        if (m.lt[i] > T) lSeen[i] = 0;
        else if (lSeen[i] === 0) lSeen[i] = R.fresh ? settled : now;
        if (motion && lSeen[i] + FLASH_MS > now) busyUntil = Math.max(busyUntil, lSeen[i] + FLASH_MS);
      }
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    // Screen positions and draw buckets.
    // 0 neutral dimmed, 1 neutral, 2 neutral match, 3 chain dimmed, 4 chain, 5 focused chain, 255 hidden or off-screen.
    const pad = 12;
    for (let i = 0; i < m.n; i++) {
      const px = ox + m.x[i] * S;
      const py = oy + m.y[i] * S;
      sx[i] = px;
      sy[i] = py;
      if (R.on) {
        if (m.pt[i] > T) {
          pSeen[i] = 0;
          codes[i] = 255;
          continue;
        }
        if (pSeen[i] === 0) pSeen[i] = R.fresh ? settled : now;
        const age = now - pSeen[i];
        if (motion && age < POP_MS) {
          const f = 1 - age / POP_MS;
          pop[i] = 1 + 1.3 * f * f;
          busyUntil = Math.max(busyUntil, pSeen[i] + POP_MS);
        } else pop[i] = 1;
      } else pop[i] = 1;
      const s = st[i];
      if (s === 0 || px < -pad || py < -pad || px > w + pad || py > h + pad) codes[i] = 255;
      else if (m.chain[i] < 0) codes[i] = s === 1 ? 0 : s === 2 ? 1 : 2;
      else codes[i] = s === 1 ? 3 : 4;
    }
    if (fc >= 0) for (const i of m.chainPts[fc]) if (m.pt[i] <= T) codes[i] = 5;
    R.fresh = false;
    R.busyUntil = busyUntil;

    const dots = (code: number, r: number) => {
      ctx.beginPath();
      for (let i = 0; i < m.n; i++) {
        if (codes[i] !== code) continue;
        const rr = r * pop[i];
        ctx.moveTo(sx[i] + rr, sy[i]);
        ctx.arc(sx[i], sy[i], rr, 0, Math.PI * 2);
      }
      ctx.fill();
    };
    const flash = (i: number) => (motion ? Math.max(0, 1 - (now - lSeen[i]) / FLASH_MS) : 0);
    const curve = (i: number) => {
      const a = m.la[i];
      const b = m.lb[i];
      const ax = ox + m.x[a] * S;
      const ay = oy + m.y[a] * S;
      const bx = ox + m.x[b] * S;
      const by = oy + m.y[b] * S;
      // Gentle bow so lines that share an end stay distinguishable.
      const mx = (ax + bx) / 2 - (by - ay) * 0.16;
      const my = (ay + by) / 2 + (bx - ax) * 0.16;
      ctx.moveTo(ax, ay);
      ctx.quadraticCurveTo(mx, my, bx, by);
    };

    // Links under the dots.
    if (links) {
      ctx.strokeStyle = c.accent;
      ctx.lineWidth = 0.8;
      ctx.globalAlpha = 0.07;
      ctx.beginPath();
      for (let i = 0; i < m.la.length; i++) {
        if ((m.lc[i] === fc && fc >= 0) || !linkOn(i)) continue;
        if (st[m.la[i]] >= 2 && st[m.lb[i]] >= 2) continue;
        curve(i);
      }
      ctx.stroke();
      ctx.globalAlpha = 0.3;
      ctx.beginPath();
      for (let i = 0; i < m.la.length; i++) {
        if ((m.lc[i] === fc && fc >= 0) || !linkOn(i) || flash(i) > 0) continue;
        if (st[m.la[i]] >= 2 && st[m.lb[i]] >= 2) curve(i);
      }
      ctx.stroke();
    }

    // Dots, faintest first.
    ctx.fillStyle = c.dot;
    ctx.globalAlpha = 0.28;
    dots(0, r0);
    ctx.fillStyle = c.accent;
    ctx.globalAlpha = 0.22;
    dots(3, r0 * 1.3);
    ctx.fillStyle = c.dot;
    ctx.globalAlpha = 1;
    dots(1, r0);
    ctx.fillStyle = c.ink2;
    dots(2, r0 * 1.5);
    ctx.fillStyle = c.accent;
    dots(4, r0 * 1.45);

    // Links that have just appeared in a replay flash above the dots, then settle into the faint style.
    if (links && motion) {
      ctx.strokeStyle = c.accent;
      for (let i = 0; i < m.la.length; i++) {
        if (m.lc[i] === fc && fc >= 0) continue;
        const f = linkOn(i) ? flash(i) : 0;
        if (f <= 0 || st[m.la[i]] < 2 || st[m.lb[i]] < 2) continue;
        ctx.globalAlpha = 0.3 + 0.65 * f;
        ctx.lineWidth = 0.8 + 1.6 * f;
        ctx.beginPath();
        curve(i);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    // The hovered or selected chain on top.
    if (fc >= 0) {
      ctx.strokeStyle = c.accent;
      ctx.globalAlpha = 0.95;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      for (const i of m.chainLinks[fc]) if (linkOn(i)) curve(i);
      ctx.stroke();
      const rr = r0 * 2;
      ctx.beginPath();
      for (const i of m.chainPts[fc]) {
        if (m.pt[i] > T) continue;
        ctx.moveTo(sx[i] + rr, sy[i]);
        ctx.arc(sx[i], sy[i], rr, 0, Math.PI * 2);
      }
      ctx.fillStyle = c.accent;
      ctx.fill();
      ctx.strokeStyle = c.surface;
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }

    // The point itself.
    let tipX = -1;
    let tipY = -1;
    if (focus >= 0 && m.pt[focus] <= T) {
      tipX = sx[focus];
      tipY = sy[focus];
      const r = (m.chain[focus] >= 0 ? r0 * 2 : r0 * 1.6) + 3.5;
      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.arc(tipX, tipY, r, 0, Math.PI * 2);
      ctx.fillStyle = c.surface;
      ctx.globalAlpha = 0.6;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = c.ink;
      ctx.lineWidth = 1.6;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(tipX, tipY, Math.max(2, r - 3.5), 0, Math.PI * 2);
      ctx.fillStyle = m.chain[focus] >= 0 ? c.accent : c.ink2;
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Keep the tooltip pinned to its point while the view moves.
    const tip = tipRef.current;
    if (tip) {
      if (focus < 0 || tipX < 0 || tipY < 0 || tipX > w || tipY > h) {
        tip.style.visibility = "hidden";
      } else {
        const tw = tip.offsetWidth;
        const th = tip.offsetHeight;
        let left = tipX + 16;
        let top = tipY - th - 12;
        if (left + tw > w - 8) left = tipX - tw - 16;
        if (left < 8) left = clamp(tipX - tw / 2, 8, Math.max(8, w - tw - 8));
        if (top < 8) top = tipY + 16;
        if (top + th > h - 8) top = Math.max(8, h - th - 8);
        tip.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
        tip.style.visibility = "visible";
      }
    }
  }, [m, codes, sx, sy, pSeen, lSeen, pop]);

  const requestDraw = useCallback(() => {
    // A running replay loop draws on its next frame anyway.
    if (!raf.current && !loop.current) raf.current = requestAnimationFrame(draw);
  }, [draw]);

  // ---- replay loop: runs while playing, or while new points and links are still settling ----
  const tick = useCallback(
    (now: number) => {
      loop.current = 0;
      const R = rp.current;
      if (R.playing) {
        const dt = Math.min(100, Math.max(0, now - R.last));
        R.last = now;
        if (reduced.current) {
          // No motion: step a whole year at a time.
          R.acc += dt;
          if (R.acc >= YEAR_MS) {
            R.acc = 0;
            R.t = Math.min(m.tEnd, (Math.floor(R.t / 12) + 1) * 12);
          }
        } else {
          R.t = Math.min(m.tEnd, R.t + (dt * 12) / YEAR_MS);
        }
        if (R.t >= m.tEnd) {
          // Finished: back to the normal map with everything shown.
          R.playing = false;
          R.on = false;
          R.t = m.tEnd;
          setPlaying(false);
          setReplayOn(false);
        }
      }
      draw();
      if (Math.floor(R.t) !== Math.floor(R.uiMonth)) {
        R.uiMonth = R.t;
        setTUi(R.t);
      }
      if (R.playing || R.busyUntil > now) loop.current = requestAnimationFrame(tick);
    },
    [draw, m],
  );

  const ensureLoop = useCallback(() => {
    if (!loop.current) loop.current = requestAnimationFrame(tick);
  }, [tick]);

  const togglePlay = useCallback(() => {
    const R = rp.current;
    if (R.playing) {
      R.playing = false;
      setPlaying(false);
      return;
    }
    if (!R.on || R.t >= m.tEnd) R.t = m.tStart;
    if (!R.on) {
      R.on = true;
      setReplayOn(true);
    }
    R.playing = true;
    R.last = performance.now();
    R.acc = reduced.current ? YEAR_MS : 0; // with reduced motion, show the first year straight away
    R.uiMonth = R.t;
    setTUi(R.t);
    setPlaying(true);
    ensureLoop();
  }, [ensureLoop, m]);

  const scrub = useCallback(
    (v: number) => {
      const R = rp.current;
      R.playing = false;
      setPlaying(false);
      if (!R.on) {
        R.on = true;
        R.fresh = true; // what is already on screen should not all pop at once
        setReplayOn(true);
      }
      R.t = clamp(v, m.tStart, m.tEnd);
      R.uiMonth = R.t;
      setTUi(R.t);
      ensureLoop();
    },
    [ensureLoop, m],
  );

  const showAll = useCallback(() => {
    const R = rp.current;
    R.playing = false;
    R.on = false;
    R.t = R.uiMonth = m.tEnd;
    setPlaying(false);
    setReplayOn(false);
    setTUi(m.tEnd);
    ensureLoop();
  }, [ensureLoop, m]);

  // Sync React state into the renderer (before paint, so the tooltip never shows in the wrong place).
  useLayoutEffect(() => {
    live.current = { state, showLinks, shown, selected, hover };
    draw();
  }, [state, showLinks, shown, selected, hover, draw]);

  // ---- view helpers ----
  const zoomAt = useCallback(
    (k2: number, px: number, py: number) => {
      const { w, h } = size.current;
      const v = view.current;
      const S0 = fitScale(size.current) * v.k;
      const wx = v.cx + (px - w / 2) / S0;
      const wy = v.cy + (py - h / 2) / S0;
      v.k = clamp(k2, K_MIN, K_MAX);
      const S1 = fitScale(size.current) * v.k;
      v.cx = wx - (px - w / 2) / S1;
      v.cy = wy - (py - h / 2) / S1;
      clampView(view.current);
      requestDraw();
    },
    [requestDraw],
  );

  const animateTo = useCallback(
    (target: { k: number; cx: number; cy: number }) => {
      cancelAnimationFrame(anim.current);
      const v = view.current;
      const t = { k: clamp(target.k, K_MIN, K_MAX), cx: clamp(target.cx, 0, 1), cy: clamp(target.cy, 0, 1) };
      if (reduced.current) {
        Object.assign(v, t);
        requestDraw();
        return;
      }
      const from = { ...v };
      const t0 = performance.now();
      const dur = 260;
      const step = (now: number) => {
        const p = Math.min(1, (now - t0) / dur);
        const e = 1 - Math.pow(1 - p, 3);
        v.k = from.k * Math.pow(t.k / from.k, e);
        v.cx = from.cx + (t.cx - from.cx) * e;
        v.cy = from.cy + (t.cy - from.cy) * e;
        draw();
        if (p < 1) anim.current = requestAnimationFrame(step);
      };
      anim.current = requestAnimationFrame(step);
    },
    [draw, requestDraw],
  );

  const zoomBy = useCallback(
    (f: number) => {
      const v = view.current;
      animateTo({ k: v.k * f, cx: v.cx, cy: v.cy });
    },
    [animateTo],
  );
  const resetView = useCallback(() => animateTo({ k: 1, cx: 0.5, cy: 0.5 }), [animateTo]);

  const open = useCallback((i: number) => router.push(pointHref(m, i)), [router, m]);

  const locate = useCallback(
    (i: number) => {
      setSelected(i);
      animateTo({ k: Math.max(view.current.k, 5), cx: m.x[i], cy: m.y[i] });
      wrapRef.current?.scrollIntoView({ block: "nearest", behavior: reduced.current ? "auto" : "smooth" });
    },
    [animateTo, m],
  );

  // Nearest visible point to a screen position, within a radius in CSS pixels.
  const hitTest = useCallback(
    (px: number, py: number, radius: number): number => {
      const { w, h } = size.current;
      const v = view.current;
      const S = fitScale(size.current) * v.k;
      const wx = v.cx + (px - w / 2) / S;
      const wy = v.cy + (py - h / 2) / S;
      const wr = radius / S;
      const { g, start, items } = m.grid;
      const x0 = clamp(Math.floor((wx - wr) * g), 0, g - 1);
      const x1 = clamp(Math.floor((wx + wr) * g), 0, g - 1);
      const y0 = clamp(Math.floor((wy - wr) * g), 0, g - 1);
      const y1 = clamp(Math.floor((wy + wr) * g), 0, g - 1);
      const st = live.current.state;
      const T = rp.current.on ? rp.current.t : Infinity;
      let best = -1;
      let bestD = Infinity;
      const wr2 = wr * wr;
      for (let cy = y0; cy <= y1; cy++) {
        for (let cx = x0; cx <= x1; cx++) {
          const cell = cy * g + cx;
          for (let j = start[cell]; j < start[cell + 1]; j++) {
            const i = items[j];
            const s = st[i];
            if (s === 0 || m.pt[i] > T) continue;
            const dx = m.x[i] - wx;
            const dy = m.y[i] - wy;
            const d = dx * dx + dy * dy;
            if (d > wr2) continue;
            // Prefer shown points over dimmed ones, and chain points slightly.
            const score = d * (s === 1 ? 4 : 1) * (m.chain[i] >= 0 ? 0.8 : 1);
            if (score < bestD) {
              bestD = score;
              best = i;
            }
          }
        }
      }
      return best;
    },
    [m],
  );

  // ---- canvas size, colours, motion preference ----
  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const resize = () => {
      const r = wrap.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 3);
      size.current = { w: r.width, h: r.height, dpr };
      canvas.width = Math.max(1, Math.round(r.width * dpr));
      canvas.height = Math.max(1, Math.round(r.height * dpr));
      draw();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    resize();

    const recolor = () => {
      colors.current = readColors();
      requestDraw();
    };
    recolor();
    const mo = new MutationObserver(recolor);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "class", "style"] });
    const dark = window.matchMedia("(prefers-color-scheme: dark)");
    dark.addEventListener("change", recolor);

    const rm = window.matchMedia("(prefers-reduced-motion: reduce)");
    const setRm = () => (reduced.current = rm.matches);
    setRm();
    rm.addEventListener("change", setRm);

    return () => {
      ro.disconnect();
      mo.disconnect();
      dark.removeEventListener("change", recolor);
      rm.removeEventListener("change", setRm);
      cancelAnimationFrame(raf.current);
      cancelAnimationFrame(anim.current);
      cancelAnimationFrame(loop.current);
      raf.current = 0;
      loop.current = 0;
    };
  }, [draw, requestDraw]);

  // ---- pointer, touch and wheel ----
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const pts = new Map<number, { x: number; y: number }>();
    let gesture:
      | { kind: "pan"; id: number; sx: number; sy: number; lx: number; ly: number; moved: boolean; type: string }
      | { kind: "pinch"; d0: number; k0: number; wx: number; wy: number }
      | null = null;

    const local = (e: PointerEvent | WheelEvent) => {
      const r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const startPinch = () => {
      const [a, b] = [...pts.values()];
      const { w, h } = size.current;
      const v = view.current;
      const S = fitScale(size.current) * v.k;
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      gesture = { kind: "pinch", d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, k0: v.k, wx: v.cx + (mx - w / 2) / S, wy: v.cy + (my - h / 2) / S };
    };

    const onDown = (e: PointerEvent) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      cancelAnimationFrame(anim.current);
      canvas.setPointerCapture(e.pointerId);
      const p = local(e);
      pts.set(e.pointerId, p);
      if (pts.size === 1) gesture = { kind: "pan", id: e.pointerId, sx: p.x, sy: p.y, lx: p.x, ly: p.y, moved: false, type: e.pointerType };
      else if (pts.size === 2) startPinch();
    };

    const onMove = (e: PointerEvent) => {
      const p = local(e);
      if (!pts.has(e.pointerId)) {
        if (e.pointerType === "mouse") {
          const i = hitTest(p.x, p.y, 12);
          canvas.style.cursor = i >= 0 ? "pointer" : "grab";
          if (i !== live.current.hover) setHover(i);
        }
        return;
      }
      pts.set(e.pointerId, p);
      const v = view.current;
      if (gesture?.kind === "pan" && e.pointerId === gesture.id) {
        if (!gesture.moved && Math.hypot(p.x - gesture.sx, p.y - gesture.sy) > 5) {
          gesture.moved = true;
          canvas.style.cursor = "grabbing";
          if (live.current.hover >= 0) setHover(-1);
        }
        if (gesture.moved) {
          const S = fitScale(size.current) * v.k;
          v.cx -= (p.x - gesture.lx) / S;
          v.cy -= (p.y - gesture.ly) / S;
          clampView(view.current);
          requestDraw();
        }
        gesture.lx = p.x;
        gesture.ly = p.y;
      } else if (gesture?.kind === "pinch" && pts.size >= 2) {
        const [a, b] = [...pts.values()];
        const { w, h } = size.current;
        const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
        v.k = clamp(gesture.k0 * (d / gesture.d0), K_MIN, K_MAX);
        const S = fitScale(size.current) * v.k;
        const mx = (a.x + b.x) / 2;
        const my = (a.y + b.y) / 2;
        v.cx = gesture.wx - (mx - w / 2) / S;
        v.cy = gesture.wy - (my - h / 2) / S;
        clampView(view.current);
        requestDraw();
      }
    };

    const onUp = (e: PointerEvent) => {
      if (!pts.has(e.pointerId)) return;
      const p = local(e);
      pts.delete(e.pointerId);
      if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
      if (gesture?.kind === "pan" && !gesture.moved && e.type === "pointerup") {
        const touch = gesture.type !== "mouse";
        const i = hitTest(p.x, p.y, touch ? 22 : 12);
        if (!touch) {
          if (i >= 0) open(i);
          else setSelected(-1);
        } else if (i >= 0 && i === live.current.selected) {
          open(i);
        } else {
          setSelected(i);
        }
      }
      if (pts.size === 1) {
        // One finger left after a pinch: keep panning with it, never treat it as a tap.
        const [id, q] = [...pts.entries()][0];
        gesture = { kind: "pan", id, sx: q.x, sy: q.y, lx: q.x, ly: q.y, moved: true, type: "touch" };
      } else if (pts.size === 0) {
        gesture = null;
        if (e.pointerType === "mouse") canvas.style.cursor = "grab";
      } else startPinch();
    };

    const onLeave = (e: PointerEvent) => {
      if (e.pointerType === "mouse" && !pts.size && live.current.hover >= 0) setHover(-1);
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      cancelAnimationFrame(anim.current);
      const p = local(e);
      const unit = e.deltaMode === 1 ? 0.05 : e.deltaMode === 2 ? 1 : e.ctrlKey ? 0.01 : 0.0018;
      zoomAt(view.current.k * Math.exp(-e.deltaY * unit), p.x, p.y);
      if (live.current.hover >= 0) setHover(-1);
    };

    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onUp);
    canvas.addEventListener("pointerleave", onLeave);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
      canvas.removeEventListener("pointerleave", onLeave);
      canvas.removeEventListener("wheel", onWheel);
    };
  }, [hitTest, open, requestDraw, zoomAt]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    const v = view.current;
    const S = fitScale(size.current) * v.k;
    const step = 60 / S;
    let handled = true;
    if (e.key === "ArrowLeft") v.cx -= step;
    else if (e.key === "ArrowRight") v.cx += step;
    else if (e.key === "ArrowUp") v.cy -= step;
    else if (e.key === "ArrowDown") v.cy += step;
    else if (e.key === "+" || e.key === "=") zoomBy(1.6);
    else if (e.key === "-" || e.key === "_") zoomBy(1 / 1.6);
    else if (e.key === "0") resetView();
    else if (e.key === "Escape") setSelected(-1);
    else if (e.key === "Enter" && selected >= 0) open(selected);
    else if (e.key === " ") togglePlay();
    else handled = false;
    if (handled) {
      e.preventDefault();
      clampView(view.current);
      requestDraw();
    }
  };

  // ---- tooltip content ----
  const tip = shown >= 0 ? describe(m, shown) : null;
  const pinned = hover < 0 && selected >= 0;

  const chip = (active: boolean) =>
    `inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-sm whitespace-nowrap transition-colors ${
      active ? "bg-accent text-accent-ink border-accent" : "bg-surface text-ink-2 border-rule hover:border-accent"
    }`;
  const nf = (n: number) => n.toLocaleString("en-GB");
  const zoomBtn =
    "inline-flex h-9 w-9 items-center justify-center rounded-md border border-rule bg-surface text-ink-2 hover:border-accent hover:text-accent transition-colors";

  // ---- replay labels ----
  const tNow = replayOn ? tUi : m.tEnd;
  const yearNow = clamp(Math.floor((tNow - 1e-6) / 12), m.minYear, m.maxYear);
  const monthNow = MONTHS[(((Math.floor(tNow - 1e-6) % 12) + 12) % 12)];
  const ptsSoFar = replayOn ? countUpTo(m.ptSorted, tNow) : m.n;
  const linksSoFar = replayOn ? countUpTo(m.ltSorted, tNow) : m.la.length;
  const atEnd = tUi >= m.tEnd;

  return (
    <div className="space-y-3 min-w-0">
      {/* Controls */}
      <div className="card p-3 sm:p-4 space-y-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3 min-w-0">
            <label className="relative block w-full sm:w-80">
              <span className="sr-only">Search hazards</span>
              <Search aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search hazards, e.g. ligature"
                className={`${fieldCls} pl-8 pr-8 py-2`}
                autoComplete="off"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  aria-label="Clear search"
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 inline-flex h-6 w-6 items-center justify-center rounded text-muted hover:text-ink"
                >
                  <X aria-hidden className="h-4 w-4" />
                </button>
              )}
            </label>
            <p className="text-sm text-muted num" aria-live="polite">
              {dq ? `${nf(matchCount)} ${matchCount === 1 ? "concern matches" : "concerns match"}` : `${nf(m.n)} concerns`}
            </p>
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-ink-2">
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input type="checkbox" className="h-4 w-4 accent-accent" checked={onlyChains} onChange={(e) => setOnlyChains(e.target.checked)} />
              Only concerns in recurrence chains
            </label>
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input type="checkbox" className="h-4 w-4 accent-accent" checked={showLinks} onChange={(e) => setShowLinks(e.target.checked)} />
              Show links
            </label>
          </div>
        </div>
        <div role="group" aria-label="Filter by theme" className="-mx-3 px-3 sm:mx-0 sm:px-0 flex gap-1.5 overflow-x-auto hide-scrollbar sm:flex-wrap">
          <button type="button" aria-pressed={themeSel < 0} onClick={() => setThemeSel(-1)} className={chip(themeSel < 0)}>
            All <span className="num text-xs opacity-75">{nf(m.n)}</span>
          </button>
          {m.themes.map((t, i) =>
            m.themeCounts[i] ? (
              <button key={t} type="button" aria-pressed={themeSel === i} onClick={() => setThemeSel(themeSel === i ? -1 : i)} className={chip(themeSel === i)}>
                {t} <span className="num text-xs opacity-75">{nf(m.themeCounts[i])}</span>
              </button>
            ) : null,
          )}
        </div>
      </div>

      {/* Replay the years */}
      <div data-tour="map-replay" className="card p-3 sm:p-4 flex flex-wrap items-center gap-x-4 gap-y-3">
        <button type="button" onClick={togglePlay} className={`${btnPrimary} shrink-0`}>
          {playing ? <Pause aria-hidden className="h-4 w-4" /> : <Play aria-hidden className="h-4 w-4" />}
          {playing ? "Pause" : replayOn && !atEnd ? "Resume" : "Replay the years"}
        </button>
        <div className="min-w-0">
          <p className="font-serif text-3xl leading-none text-ink num">
            {replayOn ? yearNow : `${m.minYear}–${m.maxYear}`}
          </p>
          <p className="mt-1 text-xs text-muted num">
            {nf(ptsSoFar)} {ptsSoFar === 1 ? "concern" : "concerns"} · {nf(linksSoFar)} {linksSoFar === 1 ? "recurrence" : "recurrences"}
            {replayOn ? " so far" : ""}
          </p>
        </div>
        <div className="order-last w-full min-w-0 lg:order-none lg:w-auto lg:flex-1">
          <input
            type="range"
            min={m.tStart}
            max={m.tEnd}
            step={1}
            value={Math.min(m.tEnd, Math.floor(tNow))}
            onChange={(e) => scrub(Number(e.target.value))}
            aria-label="Replay position"
            aria-valuetext={replayOn ? `${monthNow} ${yearNow}` : "All years"}
            className="block w-full cursor-pointer accent-accent"
          />
          <div className="mt-0.5 flex justify-between text-xs text-muted num" aria-hidden>
            <span>{m.minYear}</span>
            <span>{m.maxYear}</span>
          </div>
        </div>
        {replayOn && (
          <button type="button" onClick={showAll} className={`${btnSecondary} ml-auto shrink-0`}>
            Show all
          </button>
        )}
      </div>

      {/* Canvas */}
      <div ref={wrapRef} data-tour="map" className="card relative overflow-hidden h-[60vh] sm:h-[70vh] min-h-[340px] max-h-[860px]">
        <canvas
          ref={canvasRef}
          tabIndex={0}
          role="application"
          aria-roledescription="map"
          aria-label="Hazard map. Arrow keys move the view, plus and minus zoom, 0 resets, Space plays or pauses the replay. Search above to list matching concerns below the map."
          className="absolute inset-0 h-full w-full touch-none select-none cursor-grab focus-visible:outline-offset-[-2px]"
          onKeyDown={onKeyDown}
        />

        <div className="absolute right-3 top-3 flex flex-col gap-1.5">
          <button type="button" className={zoomBtn} onClick={() => zoomBy(1.6)} aria-label="Zoom in" title="Zoom in">
            <Plus aria-hidden className="h-4 w-4" />
          </button>
          <button type="button" className={zoomBtn} onClick={() => zoomBy(1 / 1.6)} aria-label="Zoom out" title="Zoom out">
            <Minus aria-hidden className="h-4 w-4" />
          </button>
          <button type="button" className={zoomBtn} onClick={resetView} aria-label="Reset view" title="Reset view">
            <RotateCcw aria-hidden className="h-4 w-4" />
          </button>
        </div>

        <p className="pointer-events-none absolute left-3 bottom-3 rounded-md bg-surface/85 px-2 py-1 text-xs text-muted">
          Drag to move. Scroll or pinch to zoom.
        </p>

        <div
          ref={tipRef}
          aria-hidden={!pinned}
          style={{ visibility: "hidden" }}
          className={`absolute left-0 top-0 z-10 w-[min(18rem,calc(100%-1rem))] rounded-lg border border-rule bg-surface p-3 text-sm shadow-[var(--shadow-lg)] ${
            pinned ? "pointer-events-auto" : "pointer-events-none"
          }`}
        >
          {tip && (
            <div className="space-y-1.5">
              <p className="eyebrow">{tip.theme}</p>
              <p className="font-serif text-[0.98rem] leading-snug text-ink line-clamp-3">{tip.hazard}</p>
              <p className="text-xs text-ink-2">
                {tip.title} <span className="text-muted">· {formatDate(tip.date)}</span>
              </p>
              {tip.chain && (
                <p className="text-xs text-ink-2 border-t border-rule pt-1.5">
                  <span className="inline-block h-2 w-2 rounded-full bg-accent mr-1.5 align-middle" aria-hidden />
                  In a recurrence chain: <span className="text-ink">{tip.chain.hazard}</span>
                  {tip.chain.org && <span className="text-muted"> · {tip.chain.org}</span>}
                </p>
              )}
              {pinned ? (
                <Link href={tip.href} className="inline-block pt-0.5 text-xs font-medium">
                  {tip.chain ? "Open the chain" : "Open the report"} →
                </Link>
              ) : (
                <p className="text-xs text-muted pt-0.5">{tip.chain ? "Click to open the chain." : "Click to open the report."}</p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-1 text-sm text-ink-2">
        <span className="inline-flex items-center gap-2">
          <span aria-hidden className="inline-block h-2 w-2 rounded-full bg-dot" />A concern
        </span>
        <span className="inline-flex items-center gap-2">
          <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-full bg-accent" />
          In a recurrence chain
        </span>
        <span className="inline-flex items-center gap-2">
          <svg aria-hidden width="26" height="10" viewBox="0 0 26 10" className="text-accent">
            <path d="M1 8 Q13 0 25 8" fill="none" stroke="currentColor" strokeWidth="1.4" />
          </svg>
          Judged the same hazard
        </span>
        <span className="text-muted num sm:ml-auto">
          {nf(m.nChainPts)} in chains · {nf(m.la.length)} links
        </span>
      </div>

      {/* Matches, so the map can be used without a pointer */}
      {dq && (
        <section className="card p-4 space-y-2" aria-label="Matching concerns">
          <p className="eyebrow">
            {matchCount === 0
              ? "No concerns match"
              : matchCount > matchList.length
                ? `First ${matchList.length} of ${nf(matchCount)} matching concerns`
                : `${nf(matchCount)} matching ${matchCount === 1 ? "concern" : "concerns"}`}
          </p>
          {matchCount === 0 ? (
            <p className="text-sm text-ink-2">Try a shorter word, or clear the theme filter.</p>
          ) : (
            <ul className="divide-y divide-rule list-none">
              {matchList.map((i) => {
                const d = describe(m, i);
                return (
                  <li key={i} className="flex items-start justify-between gap-3 py-2.5">
                    <div className="min-w-0 space-y-0.5">
                      <Link href={d.href} className="text-ink hover:text-accent leading-snug line-clamp-2">
                        {d.hazard}
                      </Link>
                      <p className="text-xs text-muted">
                        {d.title} · {formatDate(d.date)}
                        {d.chain && <span className="text-accent"> · in a recurrence chain</span>}
                      </p>
                    </div>
                    <button type="button" onClick={() => locate(i)} className="shrink-0 text-xs text-accent hover:underline underline-offset-2 pt-0.5">
                      Show on map
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

function describe(m: Model, i: number) {
  const rep = m.reports[m.report[i]];
  const ci = m.chain[i];
  return {
    hazard: m.hazard[i] >= 0 ? m.hazards[m.hazard[i]] : "Hazard not stated",
    title: rep[1],
    date: rep[2],
    theme: m.themes[m.theme[i]] ?? "Other",
    chain: ci >= 0 ? { hazard: m.chains[ci][1], org: m.chains[ci][2] } : null,
    href: pointHref(m, i),
  };
}
