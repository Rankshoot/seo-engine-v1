"use client";

/**
 * VisualBlock — interactive visual placeholder for ebook chapters.
 *
 * Renders a placeholder card with a "Generate" button. On click it calls
 * generateVisualDataAction (Gemini Flash) to parse the raw data string into
 * typed JSON, then renders the appropriate chart or table using pure SVG /
 * HTML — no external chart library required.
 */

import { useMemo, useState } from "react";
import { generateVisualDataAction } from "@/app/actions/visual-actions";
import type {
  VisualData,
  BarChartData,
  LineChartData,
  PieChartData,
  ComparisonTableData,
  BenchmarkScorecardData,
  RiskMatrixData,
  ProcessDiagramData,
  InfographicData,
} from "@/app/actions/visual-actions";
import type { EbookTheme } from "./EbookReader";

// ── Palette + accent colours ───────────────────────────────────────────────

type Palette = { page: string; text: string; muted: string; border: string };

const ACCENTS: Record<EbookTheme, string[]> = {
  sepia:  ["#92400e", "#1e40af", "#166534", "#6d28d9", "#9d174d"],
  dark:   ["#fbbf24", "#60a5fa", "#34d399", "#a78bfa", "#f472b6"],
  system: ["#6366f1", "#0891b2", "#16a34a", "#dc2626", "#9333ea"],
};

// ── Type labels ────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<string, string> = {
  "infographic":        "Infographic",
  "bar-chart":          "Bar Chart",
  "line-chart":         "Line Chart",
  "pie-chart":          "Pie Chart",
  "process-diagram":    "Process Diagram",
  "comparison-table":   "Comparison Table",
  "benchmark-scorecard":"Benchmark Scorecard",
  "risk-matrix":        "Risk Matrix",
};

// ── SVG helpers ────────────────────────────────────────────────────────────

function polar(cx: number, cy: number, r: number, deg: number) {
  const a = ((deg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
}

function arcPath(cx: number, cy: number, r: number, start: number, end: number) {
  const s = polar(cx, cy, r, end);
  const e = polar(cx, cy, r, start);
  const large = end - start > 180 ? 1 : 0;
  return `M${cx},${cy} L${s.x},${s.y} A${r},${r} 0 ${large},0 ${e.x},${e.y} Z`;
}

function niceMax(v: number) {
  if (v === 0) return 10;
  const e = Math.pow(10, Math.floor(Math.log10(v)));
  return Math.ceil(v / e) * e;
}

// ── Bar Chart ─────────────────────────────────────────────────────────────

function BarChart({ d, palette, theme }: { d: BarChartData; palette: Palette; theme: EbookTheme }) {
  const accents = ACCENTS[theme];
  const W = 520, H = 280;
  const PAD = { top: 24, right: 24, bottom: 56, left: 52 };
  const cW = W - PAD.left - PAD.right;
  const cH = H - PAD.top - PAD.bottom;
  const max = niceMax(Math.max(...d.values, 1));
  const slot = cW / d.labels.length;
  const barW = Math.min(slot * 0.55, 48);
  const gridLines = [0, 0.25, 0.5, 0.75, 1];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" aria-label={`Bar chart`}>
      {/* Grid */}
      {gridLines.map(t => {
        const y = PAD.top + cH * (1 - t);
        const val = (max * t).toFixed(max < 10 ? 1 : 0);
        return (
          <g key={t}>
            <line x1={PAD.left} y1={y} x2={PAD.left + cW} y2={y}
              stroke={palette.border} strokeWidth={t === 0 ? 1.5 : 0.5} />
            <text x={PAD.left - 6} y={y + 3.5} fontSize={9} textAnchor="end" fill={palette.muted}>
              {val}{d.unit ?? ""}
            </text>
          </g>
        );
      })}

      {/* Bars */}
      {d.values.map((v, i) => {
        const barH = Math.max((v / max) * cH, 1);
        const x = PAD.left + slot * i + (slot - barW) / 2;
        const y = PAD.top + cH - barH;
        const color = accents[i % accents.length];
        const label = d.labels[i];
        const shortLabel = label.length > 14 ? label.slice(0, 13) + "…" : label;
        return (
          <g key={i}>
            <rect x={x} y={y} width={barW} height={barH} fill={color} rx={3} opacity={0.88} />
            <text x={x + barW / 2} y={y - 5} fontSize={9} textAnchor="middle" fill={palette.text} fontWeight="600">
              {v}{d.unit ?? ""}
            </text>
            <text x={x + barW / 2} y={PAD.top + cH + 14} fontSize={8.5} textAnchor="middle" fill={palette.muted}>
              {shortLabel}
            </text>
          </g>
        );
      })}

      {/* Axes */}
      <line x1={PAD.left} y1={PAD.top} x2={PAD.left} y2={PAD.top + cH}
        stroke={palette.border} strokeWidth={1.5} />
      <line x1={PAD.left} y1={PAD.top + cH} x2={PAD.left + cW} y2={PAD.top + cH}
        stroke={palette.border} strokeWidth={1.5} />

      {/* Labels */}
      {d.yLabel && (
        <text transform={`translate(11,${PAD.top + cH / 2}) rotate(-90)`}
          fontSize={9} textAnchor="middle" fill={palette.muted}>{d.yLabel}</text>
      )}
    </svg>
  );
}

// ── Line Chart ─────────────────────────────────────────────────────────────

function LineChart({ d, palette, theme }: { d: LineChartData; palette: Palette; theme: EbookTheme }) {
  const accents = ACCENTS[theme];
  const W = 520, H = 280;
  const PAD = { top: 24, right: 24, bottom: 56, left: 52 };
  const cW = W - PAD.left - PAD.right;
  const cH = H - PAD.top - PAD.bottom;
  const allVals = d.series.flatMap(s => s.values);
  const minV = Math.min(...allVals);
  const maxV = niceMax(Math.max(...allVals, 1));
  const n = d.labels.length;
  const gridLines = [0, 0.25, 0.5, 0.75, 1];

  const px = (i: number) => PAD.left + (i / Math.max(n - 1, 1)) * cW;
  const py = (v: number) => PAD.top + cH - ((v - minV) / (maxV - minV || 1)) * cH;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" aria-label="Line chart">
      {/* Grid */}
      {gridLines.map(t => {
        const y = PAD.top + cH * (1 - t);
        const val = (minV + (maxV - minV) * t).toFixed(maxV < 10 ? 1 : 0);
        return (
          <g key={t}>
            <line x1={PAD.left} y1={y} x2={PAD.left + cW} y2={y}
              stroke={palette.border} strokeWidth={t === 0 ? 1.5 : 0.5} strokeDasharray={t > 0 ? "3 3" : "0"} />
            <text x={PAD.left - 6} y={y + 3.5} fontSize={9} textAnchor="end" fill={palette.muted}>
              {val}{d.unit ?? ""}
            </text>
          </g>
        );
      })}

      {/* Series */}
      {d.series.map((s, si) => {
        const color = accents[si % accents.length];
        const pts = s.values.map((v, i) => `${px(i)},${py(v)}`).join(" ");
        return (
          <g key={si}>
            <polyline points={pts} fill="none" stroke={color} strokeWidth={2.5} strokeLinejoin="round" />
            {s.values.map((v, i) => (
              <circle key={i} cx={px(i)} cy={py(v)} r={3.5} fill={color} />
            ))}
          </g>
        );
      })}

      {/* X labels */}
      {d.labels.map((lbl, i) => {
        const short = lbl.length > 10 ? lbl.slice(0, 9) + "…" : lbl;
        return (
          <text key={i} x={px(i)} y={PAD.top + cH + 14}
            fontSize={8.5} textAnchor="middle" fill={palette.muted}>
            {short}
          </text>
        );
      })}

      {/* Axes */}
      <line x1={PAD.left} y1={PAD.top} x2={PAD.left} y2={PAD.top + cH}
        stroke={palette.border} strokeWidth={1.5} />
      <line x1={PAD.left} y1={PAD.top + cH} x2={PAD.left + cW} y2={PAD.top + cH}
        stroke={palette.border} strokeWidth={1.5} />

      {/* Legend */}
      {d.series.length > 1 && (
        <g>
          {d.series.map((s, si) => (
            <g key={si} transform={`translate(${PAD.left + si * 110},${H - 12})`}>
              <rect width={10} height={10} rx={2} fill={accents[si % accents.length]} />
              <text x={14} y={9} fontSize={9} fill={palette.muted}>{s.name.slice(0, 14)}</text>
            </g>
          ))}
        </g>
      )}
    </svg>
  );
}

// ── Pie Chart ─────────────────────────────────────────────────────────────

function PieChart({ d, palette, theme }: { d: PieChartData; palette: Palette; theme: EbookTheme }) {
  const accents = ACCENTS[theme];
  const W = 420, H = 260;
  const cx = 120, cy = H / 2, r = 90;

  const total = d.slices.reduce((s, sl) => s + sl.value, 0) || 1;
  let cursor = 0;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" aria-label="Pie chart">
      {d.slices.map((sl, i) => {
        const start = cursor;
        const span = (sl.value / total) * 360;
        cursor += span;
        const color = accents[i % accents.length];
        // label position
        const midAngle = start + span / 2;
        const lp = polar(cx, cy, r * 0.65, midAngle);
        const pct = ((sl.value / total) * 100).toFixed(0);
        return (
          <g key={i}>
            <path d={arcPath(cx, cy, r, start, start + span)} fill={color} opacity={0.88}
              stroke={palette.page} strokeWidth={1.5} />
            {span > 18 && (
              <text x={lp.x} y={lp.y + 3} fontSize={9} textAnchor="middle" fill="#fff" fontWeight="700">
                {pct}%
              </text>
            )}
          </g>
        );
      })}

      {/* Legend */}
      <g transform={`translate(${cx + r + 28}, 20)`}>
        {d.slices.map((sl, i) => (
          <g key={i} transform={`translate(0, ${i * 22})`}>
            <rect width={12} height={12} rx={2} fill={accents[i % accents.length]} opacity={0.88} />
            <text x={18} y={10} fontSize={10} fill={palette.text}>
              {sl.label.length > 22 ? sl.label.slice(0, 21) + "…" : sl.label}
              {" "}
              <tspan fill={palette.muted}>({sl.value}{d.unit ?? ""})</tspan>
            </text>
          </g>
        ))}
      </g>
    </svg>
  );
}

// ── Comparison Table ───────────────────────────────────────────────────────

function ComparisonTable({ d, palette }: { d: ComparisonTableData; palette: Palette }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[12px] border-collapse">
        <thead>
          <tr>
            {d.columns.map((col, i) => (
              <th
                key={i}
                className="px-3 py-2.5 text-left font-semibold border-b-2"
                style={{
                  borderColor: palette.border,
                  color: i === 0 ? palette.muted : palette.text,
                  fontSize: 11,
                  letterSpacing: "0.02em",
                }}
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {d.rows.map((row, ri) => (
            <tr
              key={ri}
              style={{ background: ri % 2 === 1 ? `${palette.border}30` : "transparent" }}
            >
              <td
                className="px-3 py-2 font-medium border-b"
                style={{ borderColor: palette.border, color: palette.muted, fontSize: 11 }}
              >
                {row.label}
              </td>
              {row.values.map((val, ci) => (
                <td
                  key={ci}
                  className="px-3 py-2 border-b"
                  style={{ borderColor: palette.border, color: palette.text, fontSize: 12 }}
                >
                  {val}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Benchmark Scorecard ────────────────────────────────────────────────────

function BenchmarkScorecard({
  d,
  palette,
  theme,
}: {
  d: BenchmarkScorecardData;
  palette: Palette;
  theme: EbookTheme;
}) {
  const accent = ACCENTS[theme][0];
  return (
    <div className="space-y-3">
      {d.metrics.map((m, i) => {
        const score = Math.min(100, Math.max(0, m.score));
        return (
          <div key={i} className="space-y-1">
            <div className="flex items-center justify-between text-[12px]">
              <span style={{ color: palette.text, fontWeight: 600 }}>{m.label}</span>
              <div className="flex items-center gap-3">
                {m.benchmark && (
                  <span style={{ color: palette.muted, fontSize: 10 }}>{m.benchmark}</span>
                )}
                <span style={{ color: accent, fontWeight: 700, fontSize: 13 }}>{m.value}</span>
              </div>
            </div>
            {/* Track */}
            <div
              className="relative h-2 rounded-full overflow-hidden"
              style={{ background: palette.border }}
            >
              <div
                className="absolute inset-y-0 left-0 rounded-full transition-all"
                style={{ width: `${score}%`, background: accent }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Risk Matrix ────────────────────────────────────────────────────────────

const RISK_LEVELS = ["Low", "Medium", "High"] as const;
type RiskLevel = "Low" | "Medium" | "High";

const CELL_COLOR: Record<string, string> = {
  "Low-Low":      "#86efac", // green
  "Low-Medium":   "#fde68a", // yellow
  "Low-High":     "#fcd34d", // amber
  "Medium-Low":   "#fde68a",
  "Medium-Medium":"#fcd34d",
  "Medium-High":  "#fca5a5", // red
  "High-Low":     "#fcd34d",
  "High-Medium":  "#fca5a5",
  "High-High":    "#f87171",
};

function RiskMatrix({ d, palette }: { d: RiskMatrixData; palette: Palette }) {
  const cellRisks = (l: RiskLevel, im: RiskLevel) =>
    d.risks.filter(r => r.likelihood === l && r.impact === im);

  return (
    <div>
      {/* Grid */}
      <div className="mb-1 text-[10px] font-semibold text-center" style={{ color: palette.muted }}>
        Impact →
      </div>
      <div className="flex gap-1">
        {/* Y-axis label */}
        <div
          className="flex items-center justify-center"
          style={{
            writingMode: "vertical-lr",
            transform: "rotate(180deg)",
            fontSize: 10,
            color: palette.muted,
            fontWeight: 600,
            minWidth: 18,
          }}
        >
          Likelihood ↑
        </div>

        <div className="flex-1">
          {/* Column headers */}
          <div className="grid grid-cols-3 gap-1 mb-1">
            {RISK_LEVELS.map(l => (
              <div key={l} className="text-center text-[10px] font-semibold" style={{ color: palette.muted }}>
                {l}
              </div>
            ))}
          </div>

          {/* Matrix rows (likelihood high→low) */}
          {[...RISK_LEVELS].reverse().map(likelihood => (
            <div key={likelihood} className="grid grid-cols-3 gap-1 mb-1">
              {RISK_LEVELS.map(impact => {
                const risks = cellRisks(likelihood, impact);
                const bg = CELL_COLOR[`${likelihood}-${impact}`] ?? "#e5e7eb";
                return (
                  <div
                    key={impact}
                    className="rounded p-1.5 min-h-[52px]"
                    style={{ background: bg + "cc" }}
                  >
                    {risks.map((r, ri) => (
                      <div key={ri} className="text-[10px] font-medium leading-tight text-gray-900 mb-0.5">
                        {r.name}
                        {r.description && (
                          <span className="block text-[9px] font-normal text-gray-700 mt-0.5">
                            {r.description}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          ))}

          {/* Row labels */}
          <div className="grid grid-cols-3 gap-1">
            {RISK_LEVELS.map(l => (
              <div key={l} className="text-center text-[9px]" style={{ color: palette.muted }}>{l}</div>
            ))}
          </div>
        </div>
      </div>

      {/* Risk list */}
      {d.risks.length > 0 && (
        <div className="mt-3 space-y-1">
          {d.risks.map((r, i) => {
            const bg = CELL_COLOR[`${r.likelihood}-${r.impact}`] ?? "#e5e7eb";
            return (
              <div key={i} className="flex items-start gap-2 text-[11px]">
                <span
                  className="mt-0.5 h-2.5 w-2.5 flex-shrink-0 rounded-sm"
                  style={{ background: bg, marginTop: 3 }}
                />
                <span style={{ color: palette.text }}>
                  <span className="font-semibold">{r.name}</span>
                  {r.description && <span style={{ color: palette.muted }}> — {r.description}</span>}
                  <span style={{ color: palette.muted }}>
                    {" "}(L: {r.likelihood}, I: {r.impact})
                  </span>
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Process Diagram ────────────────────────────────────────────────────────

function ProcessDiagram({
  d,
  palette,
  theme,
}: {
  d: ProcessDiagramData;
  palette: Palette;
  theme: EbookTheme;
}) {
  const accent = ACCENTS[theme][0];
  return (
    <div className="space-y-0">
      {d.steps.map((step, i) => (
        <div key={i} className="flex gap-3">
          {/* Spine */}
          <div className="flex flex-col items-center">
            <div
              className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-[11px] font-bold"
              style={{ background: accent, color: "#fff" }}
            >
              {step.number}
            </div>
            {i < d.steps.length - 1 && (
              <div className="my-1 w-px flex-1" style={{ background: palette.border, minHeight: 16 }} />
            )}
          </div>

          {/* Content */}
          <div className="pb-4 pt-0.5 min-w-0">
            <p className="text-[13px] font-semibold leading-snug" style={{ color: palette.text }}>
              {step.title}
            </p>
            <p className="mt-0.5 text-[11px] leading-relaxed" style={{ color: palette.muted }}>
              {step.description}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Infographic (stat cards) ───────────────────────────────────────────────

function InfographicStats({
  d,
  palette,
  theme,
}: {
  d: InfographicData;
  palette: Palette;
  theme: EbookTheme;
}) {
  const accents = ACCENTS[theme];
  const cols = d.stats.length <= 2 ? d.stats.length : d.stats.length <= 4 ? 2 : 3;
  return (
    <div
      className="grid gap-3"
      style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
    >
      {d.stats.map((stat, i) => (
        <div
          key={i}
          className="rounded-xl px-4 py-4 text-center"
          style={{
            background: `${accents[i % accents.length]}18`,
            border: `1px solid ${accents[i % accents.length]}40`,
          }}
        >
          <div
            className="text-[28px] font-extrabold leading-none"
            style={{ color: accents[i % accents.length] }}
          >
            {stat.value}
          </div>
          <div className="mt-1.5 text-[12px] font-semibold leading-snug" style={{ color: palette.text }}>
            {stat.label}
          </div>
          {stat.context && (
            <div className="mt-1 text-[10px]" style={{ color: palette.muted }}>
              {stat.context}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Visual renderer router ─────────────────────────────────────────────────

function VisualRenderer({
  data,
  palette,
  theme,
}: {
  data: VisualData;
  palette: Palette;
  theme: EbookTheme;
}) {
  switch (data.type) {
    case "bar-chart":
      return <BarChart d={data} palette={palette} theme={theme} />;
    case "line-chart":
      return <LineChart d={data} palette={palette} theme={theme} />;
    case "pie-chart":
      return <PieChart d={data} palette={palette} theme={theme} />;
    case "comparison-table":
      return <ComparisonTable d={data} palette={palette} />;
    case "benchmark-scorecard":
      return <BenchmarkScorecard d={data} palette={palette} theme={theme} />;
    case "risk-matrix":
      return <RiskMatrix d={data} palette={palette} />;
    case "process-diagram":
      return <ProcessDiagram d={data} palette={palette} theme={theme} />;
    case "infographic":
      return <InfographicStats d={data} palette={palette} theme={theme} />;
    default:
      return null;
  }
}

// ── Main VisualBlock ───────────────────────────────────────────────────────

export interface VisualBlockAttrs {
  type?: string;
  title?: string;
  desc?: string;
  data?: string;
  source?: string;
}

export function VisualBlock({
  attrs,
  palette,
  theme,
}: {
  attrs: VisualBlockAttrs;
  palette: Palette;
  theme: EbookTheme;
}) {
  const type = attrs.type ?? "infographic";
  const title = attrs.title ?? "Visual";
  const desc = attrs.desc ?? "";
  const rawData = attrs.data ?? "";
  const source = attrs.source ?? "";
  const typeLabel = TYPE_LABELS[type] ?? type;

  const [state, setState] = useState<
    | { phase: "idle" }
    | { phase: "loading" }
    | { phase: "done"; data: VisualData }
    | { phase: "error"; message: string }
  >({ phase: "idle" });

  const generate = async () => {
    setState({ phase: "loading" });
    const res = await generateVisualDataAction(type, title, desc, rawData, source);
    if (res.success) {
      setState({ phase: "done", data: res.data });
    } else {
      setState({ phase: "error", message: res.error });
    }
  };

  const isGenerated = state.phase === "done";

  return (
    <div
      className="not-prose my-6 overflow-hidden rounded-xl border"
      style={{
        borderColor: isGenerated ? palette.border : `${palette.border}`,
        borderStyle: isGenerated ? "solid" : "dashed",
        borderWidth: isGenerated ? 1 : 2,
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between gap-2 px-4 py-2.5 border-b"
        style={{ borderColor: palette.border, background: `${palette.page}dd` }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="flex-shrink-0 rounded px-1.5 py-0.5 text-[9px] font-mono font-semibold uppercase tracking-widest"
            style={{ background: palette.border, color: palette.muted }}
          >
            {typeLabel}
          </span>
          <span
            className="text-[13px] font-semibold leading-snug truncate"
            style={{ color: palette.text }}
          >
            {title}
          </span>
        </div>

        {/* Action button */}
        {state.phase !== "done" && (
          <button
            type="button"
            onClick={generate}
            disabled={state.phase === "loading"}
            className="flex-shrink-0 flex items-center gap-1.5 rounded-md px-3 py-1 text-[11px] font-semibold transition-opacity disabled:opacity-60 hover:opacity-80"
            style={{
              background: ACCENTS[theme][0],
              color: "#fff",
            }}
          >
            {state.phase === "loading" ? (
              <>
                <SpinnerIcon />
                Generating…
              </>
            ) : (
              <>
                <SparkleIcon />
                Generate
              </>
            )}
          </button>
        )}

        {state.phase === "done" && (
          <button
            type="button"
            onClick={generate}
            className="flex-shrink-0 text-[10px] font-mono transition-opacity hover:opacity-70"
            style={{ color: palette.muted }}
          >
            ↻ Regenerate
          </button>
        )}
      </div>

      {/* Body */}
      <div className="px-4 py-4" style={{ background: palette.page }}>
        {/* Description — always shown */}
        {desc && state.phase !== "done" && (
          <p className="mb-3 text-[12px] leading-relaxed" style={{ color: palette.muted }}>
            {desc}
          </p>
        )}

        {/* Idle placeholder area */}
        {state.phase === "idle" && (
          <div
            className="flex min-h-[80px] items-center justify-center rounded-lg"
            style={{ background: `${palette.border}30` }}
          >
            <span className="text-[12px]" style={{ color: palette.muted }}>
              Click <strong>Generate</strong> to render this {typeLabel.toLowerCase()}
            </span>
          </div>
        )}

        {/* Loading skeleton */}
        {state.phase === "loading" && (
          <div className="space-y-2 animate-pulse">
            <div className="h-3 rounded" style={{ background: palette.border, width: "70%" }} />
            <div className="h-3 rounded" style={{ background: palette.border, width: "90%" }} />
            <div className="h-3 rounded" style={{ background: palette.border, width: "55%" }} />
            <div className="mt-4 h-24 rounded" style={{ background: palette.border }} />
          </div>
        )}

        {/* Error */}
        {state.phase === "error" && (
          <div
            className="rounded-lg px-4 py-3 text-[12px]"
            style={{ background: "#fee2e2", color: "#991b1b" }}
          >
            <span className="font-semibold">Generation failed: </span>
            {state.message}
            <button
              type="button"
              onClick={generate}
              className="ml-2 underline font-semibold hover:no-underline"
            >
              Retry
            </button>
          </div>
        )}

        {/* Rendered visual */}
        {state.phase === "done" && (
          <VisualRenderer data={state.data} palette={palette} theme={theme} />
        )}
      </div>

      {/* Footer — source citation */}
      {source && (
        <div
          className="border-t px-4 py-2 text-[10px] font-mono"
          style={{ borderColor: palette.border, color: palette.muted }}
        >
          Source: {source}
        </div>
      )}
    </div>
  );
}

// ── Tiny inline SVG icons ──────────────────────────────────────────────────

function SparkleIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z" />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      aria-hidden
      className="animate-spin"
    >
      <path d="M12 2a10 10 0 0 1 0 20" opacity="0.3" />
      <path d="M12 2a10 10 0 0 1 10 10" />
    </svg>
  );
}
