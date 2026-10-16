// Horizontal bar chart of recall with 95% intervals. Hand-written SVG, server-rendered, no chart library.
// Two layouts share one drawing routine: a wide one (sm and up) and a narrow one sized for phones, so the
// text stays at a readable size instead of shrinking with the viewBox. Colours come only from CSS variables,
// so light and dark themes both work.

export type RecallDatum = {
  name: string;
  recall: number | null;
  hits?: number;
  n?: number;
  ci?: [number, number];
  /** Drawn in the accent colour; everything else is neutral. */
  highlight?: boolean;
  /** Added after the results were known: hatched bar and a short note. */
  postHoc?: boolean;
};

const POST_HOC_NOTE = "post-hoc, added after seeing the misses";

const pctText = (x: number) => {
  const r = Math.round(x * 100);
  return `${r === 100 && x < 1 ? 99 : r}%`;
};
const valueText = (d: RecallDatum) =>
  d.recall === null ? "pending" : `${pctText(d.recall)}${d.hits !== undefined && d.n !== undefined ? ` · ${d.hits} of ${d.n}` : ""}`;

export function recallChartSummary(data: RecallDatum[], pairs?: number): string {
  const parts = data.map((d) => {
    if (d.recall === null) return `${d.name}: pending.`;
    const ci = d.ci ? `, 95% interval ${pctText(d.ci[0])} to ${pctText(d.ci[1])}` : "";
    const counts = d.hits !== undefined && d.n !== undefined ? ` (${d.hits} of ${d.n} pairs)` : "";
    return `${d.name}: ${pctText(d.recall)}${counts}${ci}${d.postHoc ? `; ${POST_HOC_NOTE}` : ""}.`;
  });
  return `Bar chart of recall${pairs ? ` on ${pairs} test pairs` : ""}, from 0 to 100%. ${parts.join(" ")}`;
}

// Rough text width for a 12px sans face; deliberately generous so labels never collide.
const textWidth = (s: string, size: number) => s.length * size * 0.52;

const C = {
  ink: "var(--ink)",
  ink2: "var(--ink-2)",
  muted: "var(--muted)",
  rule: "var(--rule)",
  surface: "var(--surface)",
  paper2: "var(--paper-2)",
  accent: "var(--accent)",
  neutral: "var(--quote-bar)",
};
// A surface-coloured halo so labels stay legible where gridlines pass behind them.
const HALO = { paintOrder: "stroke", stroke: C.surface, strokeWidth: 3, strokeLinejoin: "round" } as const;

function barPath(x: number, y: number, w: number, h: number, r: number): string {
  // Square at the baseline, rounded at the data end.
  if (w <= 0) return "";
  const rr = Math.min(r, w, h / 2);
  return `M${x},${y}h${w - rr}a${rr},${rr} 0 0 1 ${rr},${rr}v${h - 2 * rr}a${rr},${rr} 0 0 1 ${-rr},${rr}h${-(w - rr)}z`;
}

function Plot({ data, width, idPrefix, className }: { data: RecallDatum[]; width: number; idPrefix: string; className: string }) {
  const NAME = 13; // name font size
  const VAL = 12; // value label font size
  const SMALL = 11; // axis and note font size
  const BAR = 16;
  const pad = 1;
  const x = (v: number) => pad + Math.max(0, Math.min(1, v)) * (width - 2 * pad);

  let y = 2;
  const rows = data.map((d) => {
    const top = y;
    const nameY = top + NAME;
    const barY = top + NAME + 7;
    const end = d.recall === null ? x(0) : x(d.recall);
    const reach = Math.max(end, d.ci ? x(d.ci[1]) : end);
    const label = valueText(d);
    const labelW = textWidth(label, VAL);
    // Value at the bar end when it fits; else right-aligned on the name line; else on its own line below.
    const place: "end" | "name" | "below" =
      reach + 8 + labelW <= width ? "end" : textWidth(d.name, NAME) + 12 + labelW <= width ? "name" : "below";
    let line = barY + BAR;
    const belowY = place === "below" ? (line += 16) - 2 : 0;
    const noteY = d.postHoc ? (line += 16) - 2 : 0;
    y = line + 16;
    return { d, nameY, barY, end, reach, label, place, belowY, noteY };
  });
  const plotBottom = y - 8;
  const axisY = plotBottom + 15;
  const height = axisY + 4;
  const hatch = `${idPrefix}-hatch`;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" className={className} focusable="false" aria-hidden="true">
      <defs>
        <pattern id={hatch} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="6" height="6" style={{ fill: C.paper2 }} />
          <rect width="2.5" height="6" style={{ fill: C.neutral }} />
        </pattern>
      </defs>

      {/* Gridlines at 25/50/75 and the zero baseline. */}
      {[0.25, 0.5, 0.75].map((t) => (
        <line key={t} x1={x(t)} x2={x(t)} y1={0} y2={plotBottom} style={{ stroke: C.rule }} strokeWidth={1} />
      ))}
      <line x1={x(0)} x2={x(0)} y1={0} y2={plotBottom} style={{ stroke: C.muted }} strokeWidth={1} opacity={0.6} />
      {[0, 0.25, 0.5, 0.75, 1].map((t) => (
        <text
          key={t}
          x={x(t)}
          y={axisY}
          fontSize={SMALL}
          textAnchor={t === 0 ? "start" : t === 1 ? "end" : "middle"}
          style={{ fill: C.muted, fontVariantNumeric: "tabular-nums" }}
        >
          {Math.round(t * 100)}%
        </text>
      ))}

      {rows.map(({ d, nameY, barY, end, reach, label, place, belowY, noteY }) => {
        const r = d.recall;
        const cy = barY + BAR / 2;
        const fill = d.postHoc ? `url(#${hatch})` : d.highlight ? C.accent : C.neutral;
        const [pctPart, ...rest] = label.split(" · ");
        return (
          <g key={d.name}>
            <title>{`${d.name}: ${label}${d.ci ? `, 95% interval ${pctText(d.ci[0])} to ${pctText(d.ci[1])}` : ""}`}</title>
            <text x={x(0)} y={nameY} fontSize={NAME} fontWeight={600} style={{ ...HALO, fill: C.ink }}>
              {d.name}
            </text>
            {r !== null && <path d={barPath(x(0), barY, end - x(0), BAR, 4)} style={{ fill }} />}
            {d.ci && (
              <g strokeLinecap="round">
                {/* A surface-coloured underlay keeps the whisker legible where it crosses the bar. */}
                <g style={{ stroke: C.surface }} strokeWidth={4}>
                  <line x1={x(d.ci[0])} x2={x(d.ci[1])} y1={cy} y2={cy} />
                  <line x1={x(d.ci[0])} x2={x(d.ci[0])} y1={cy - 5} y2={cy + 5} />
                  <line x1={x(d.ci[1])} x2={x(d.ci[1])} y1={cy - 5} y2={cy + 5} />
                </g>
                <g style={{ stroke: C.ink }} strokeWidth={1.5}>
                  <line x1={x(d.ci[0])} x2={x(d.ci[1])} y1={cy} y2={cy} />
                  <line x1={x(d.ci[0])} x2={x(d.ci[0])} y1={cy - 5} y2={cy + 5} />
                  <line x1={x(d.ci[1])} x2={x(d.ci[1])} y1={cy - 5} y2={cy + 5} />
                </g>
              </g>
            )}
            <text
              x={place === "end" ? reach + 8 : place === "name" ? width : x(0)}
              y={place === "end" ? cy + VAL * 0.36 : place === "name" ? nameY : belowY}
              fontSize={VAL}
              textAnchor={place === "name" ? "end" : "start"}
              style={{ ...HALO, fill: C.ink, fontVariantNumeric: "tabular-nums" }}
            >
              <tspan fontWeight={600}>{pctPart}</tspan>
              {rest.length > 0 && <tspan style={{ fill: C.muted }}>{` · ${rest.join(" · ")}`}</tspan>}
            </text>
            {d.postHoc && (
              <text x={x(0)} y={noteY} fontSize={SMALL} fontStyle="italic" style={{ ...HALO, fill: C.muted }}>
                {POST_HOC_NOTE}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

export function RecallChart({ data, pairs, id = "recall" }: { data: RecallDatum[]; pairs?: number; id?: string }) {
  return (
    <div role="img" aria-label={recallChartSummary(data, pairs)} className="w-full">
      <Plot data={data} width={640} idPrefix={`${id}-wide`} className="hidden sm:block h-auto max-w-[760px]" />
      <Plot data={data} width={320} idPrefix={`${id}-narrow`} className="block sm:hidden h-auto" />
    </div>
  );
}
