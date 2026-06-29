"use server";

import { currentUser } from "@clerk/nextjs/server";
import { aiGenerate, parseLooseJson } from "@/services/ai/providers";

// ── Typed data shapes ──────────────────────────────────────────────────────

export interface BarChartData {
  type: "bar-chart";
  labels: string[];
  values: number[];
  unit?: string;
  xLabel?: string;
  yLabel?: string;
}

export interface LineChartData {
  type: "line-chart";
  labels: string[];
  series: { name: string; values: number[] }[];
  unit?: string;
}

export interface PieChartData {
  type: "pie-chart";
  slices: { label: string; value: number }[];
  unit?: string;
}

export interface ComparisonTableData {
  type: "comparison-table";
  columns: string[];
  rows: { label: string; values: string[] }[];
}

export interface BenchmarkScorecardData {
  type: "benchmark-scorecard";
  metrics: {
    label: string;
    value: string;
    /** 0–100 normalised performance score for the progress bar */
    score: number;
    benchmark?: string;
  }[];
}

export interface RiskMatrixData {
  type: "risk-matrix";
  risks: {
    name: string;
    likelihood: "Low" | "Medium" | "High";
    impact: "Low" | "Medium" | "High";
    description?: string;
  }[];
}

export interface ProcessDiagramData {
  type: "process-diagram";
  steps: { number: number; title: string; description: string }[];
}

export interface InfographicData {
  type: "infographic";
  stats: { value: string; label: string; context?: string }[];
}

export type VisualData =
  | BarChartData
  | LineChartData
  | PieChartData
  | ComparisonTableData
  | BenchmarkScorecardData
  | RiskMatrixData
  | ProcessDiagramData
  | InfographicData;

// ── Per-type JSON schema descriptions for the LLM ─────────────────────────

const SCHEMAS: Record<string, string> = {
  "bar-chart": `{
  "labels": ["Label A", "Label B", ...],
  "values": [42, 75, ...],
  "unit": "%" (or "$", "x", "" — optional),
  "xLabel": "optional x-axis label",
  "yLabel": "optional y-axis label"
}`,
  "line-chart": `{
  "labels": ["2020", "2021", "2022", ...],
  "series": [
    { "name": "Series name", "values": [10, 20, 30, ...] }
  ],
  "unit": "%" (optional)
}`,
  "pie-chart": `{
  "slices": [
    { "label": "Category A", "value": 45 },
    { "label": "Category B", "value": 30 }
  ],
  "unit": "%" (optional)
}`,
  "comparison-table": `{
  "columns": ["Dimension", "Option A", "Option B"],
  "rows": [
    { "label": "Row label", "values": ["cell for Option A", "cell for Option B"] }
  ]
}`,
  "benchmark-scorecard": `{
  "metrics": [
    {
      "label": "Metric name",
      "value": "85%",
      "score": 85,
      "benchmark": "Industry avg: 72%" (optional)
    }
  ]
}
Note: "score" must be 0–100 (a normalised performance level for a progress bar).`,
  "risk-matrix": `{
  "risks": [
    {
      "name": "Risk name (short)",
      "likelihood": "Low" | "Medium" | "High",
      "impact": "Low" | "Medium" | "High",
      "description": "one-sentence description (optional)"
    }
  ]
}`,
  "process-diagram": `{
  "steps": [
    { "number": 1, "title": "Step title", "description": "What happens in this step (1–2 sentences)" }
  ]
}`,
  "infographic": `{
  "stats": [
    { "value": "3x", "label": "Throughput increase", "context": "vs. manual process (optional)" }
  ]
}`,
};

// ── Server action ──────────────────────────────────────────────────────────

export async function generateVisualDataAction(
  type: string,
  title: string,
  desc: string,
  rawData: string,
  source: string,
): Promise<{ success: true; data: VisualData } | { success: false; error: string }> {
  const user = await currentUser();
  if (!user) return { success: false, error: "Not authenticated" };

  const schema = SCHEMAS[type] ?? SCHEMAS["infographic"];

  const prompt = `You are a data extraction specialist converting raw descriptions into structured chart/table data.

Visual Type: ${type}
Title: ${title}
Description: ${desc}
Raw Data: ${rawData || "(not provided — derive from title and description)"}
Source: ${source}

Return ONLY a valid JSON object matching this exact schema. No markdown, no code fences, no explanation:

${schema}

Extraction rules:
1. Pull every data point mentioned in Raw Data and Description.
2. If a numeric value is embedded in prose (e.g. "3x faster"), extract the number (3) and put the suffix in "unit" or "value" as appropriate.
3. Labels must be ≤ 35 characters. Truncate longer labels with "…".
4. If the data is insufficient, generate plausible illustrative values that are consistent with the description — label them clearly.
5. For comparison-table: the first "columns" entry is the row-label header (e.g. "Dimension"). Each row.values array must have (columns.length − 1) entries.
6. Return complete, valid JSON only — no trailing commas, no comments.`;

  try {
    const raw = await aiGenerate("visual_parse", prompt, {
      temperature: 0.15,
      maxOutputTokens: 1024,
      jsonMode: true,
      timeoutMs: 25000,
    });

    const parsed = parseLooseJson<Record<string, unknown>>(raw);
    if (!parsed || typeof parsed !== "object") {
      return { success: false, error: "AI returned unparseable data — please try again." };
    }

    return { success: true, data: { type, ...parsed } as VisualData };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "Visual generation failed",
    };
  }
}
