/**
 * Shared scoring primitives for the content-type-specific SEO panels.
 *
 * Every panel emits the same `ScorecardResult` so the surface (grade ring,
 * progress bar, checklist row) can be rendered by one component.
 */

export interface ScoreCheck {
  /** Stable id used by AI-fix / refresh logic later. */
  key: string;
  label: string;
  pass: boolean;
  /** Soft-pass — counts but flagged as a warning, not a failure. */
  warn?: boolean;
  points: number;
  hint: string;
  /** Optional category for grouping (e.g. "Hook", "Body", "Authority"). */
  category?: string;
}

export interface ScorecardResult {
  total: number;
  maxTotal: number;
  pct: number;
  grade: "A" | "B" | "C" | "D" | "F";
  checks: ScoreCheck[];
}

export function gradeFromPct(pct: number): ScorecardResult["grade"] {
  if (pct >= 90) return "A";
  if (pct >= 75) return "B";
  if (pct >= 60) return "C";
  if (pct >= 40) return "D";
  return "F";
}

export function buildScorecard(checks: ScoreCheck[]): ScorecardResult {
  const total = checks.reduce((s, c) => s + (c.pass ? c.points : c.warn ? Math.floor(c.points / 2) : 0), 0);
  const maxTotal = checks.reduce((s, c) => s + c.points, 0);
  const pct = maxTotal > 0 ? (total / maxTotal) * 100 : 0;
  return { total, maxTotal, pct, grade: gradeFromPct(pct), checks };
}

/** Common 'AI-overuse' phrases content engines should NOT lean on. */
export const AI_CLICHE_PATTERNS: RegExp[] = [
  /\bin today'?s (?:fast[- ]paced |digital |modern )?world\b/i,
  /\bin recent years\b/i,
  /\bnavigat(?:e|ing)\b/i,
  /\bdelv(?:e|ing)\b/i,
  /\bunlock(?:ing)?\b/i,
  /\bgame[- ]changer\b/i,
  /\bleverag(?:e|ing)\b/i,
  /\bsynerg(?:y|ies|istic)\b/i,
  /\bcutting[- ]edge\b/i,
  /\bbest[- ]in[- ]class\b/i,
  /\brobust\b/i,
  /\bharness(?:ing)?\b/i,
  /\bever[- ]?evolving\b/i,
  /\bplethora\b/i,
  /\btapestry\b/i,
  /\brealm\b/i,
];

export function countClichePhrases(text: string): number {
  let n = 0;
  for (const re of AI_CLICHE_PATTERNS) {
    const m = text.match(new RegExp(re.source, re.flags + "g"));
    if (m) n += m.length;
  }
  return n;
}

/** Strip markdown link syntax + headings to get plain narrative text. */
export function plainText(markdown: string): string {
  return markdown
    .replace(/!\[[^\]]*\]\([^)]+\)/g, "")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^>\s+/gm, "")
    .replace(/^[-*+]\s+/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

/**
 * Case-insensitive presence of a phrase in haystack. Multi-word keywords
 * also pass when ALL content tokens (length ≥ 3) appear, mirroring the
 * blog SEO panel's `keywordInText` rule.
 */
export function keywordInText(keyword: string, haystackLower: string): boolean {
  const norm = keyword.trim().toLowerCase();
  if (!norm || !haystackLower) return false;
  if (haystackLower.includes(norm)) return true;
  const tokens = norm.split(/\s+/).filter(Boolean);
  if (tokens.length <= 1) return false;
  return tokens.every(t => t.length < 3 || haystackLower.includes(t));
}
