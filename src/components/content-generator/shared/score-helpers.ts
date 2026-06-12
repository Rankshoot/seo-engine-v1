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
  let clean = markdown;
  const metaIdx = clean.indexOf("---META---");
  if (metaIdx !== -1) {
    clean = clean.substring(0, metaIdx);
  }
  // Strip potential code blocks
  clean = clean.replace(/```[\s\S]*?```/g, "");

  return clean
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

export interface ParsedChapter {
  title: string;
  body: string;
  word_count: number;
}

export function parseChaptersFromMarkdown(markdown: string): ParsedChapter[] {
  const lines = markdown.split("\n");
  const out: ParsedChapter[] = [];
  let current: { title: string; body: string } | null = null;
  for (const line of lines) {
    if (/^#\s+/.test(line)) continue;
    const m = line.match(/^##\s+(.+?)\s*$/);
    if (m) {
      if (current) {
        out.push({
          title: current.title,
          body: current.body,
          word_count: countWords(plainText(current.body)),
        });
      }
      current = { title: m[1].replace(/^Chapter\s+\d+\s*[\u2014-]\s*/i, "").trim(), body: "" };
    } else if (current) {
      current.body += `${line}\n`;
    }
  }
  if (current) {
    out.push({
      title: current.title,
      body: current.body,
      word_count: countWords(plainText(current.body)),
    });
  }
  return out.filter(c => c.body.trim().length > 0);
}

export function parseFaqsFromMarkdown(markdown: string): Array<{ question: string; answer: string }> {
  const lines = markdown.split("\n");
  const faqs: Array<{ question: string; answer: string }> = [];
  let inFaqSection = false;
  let currentQuestion = "";
  let currentAnswerLines: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (/^##\s+(faq|frequently asked)/i.test(trimmed)) {
      inFaqSection = true;
      continue;
    }
    if (inFaqSection && /^##\s+/.test(trimmed)) {
      inFaqSection = false;
      if (currentQuestion) {
        faqs.push({ question: currentQuestion, answer: currentAnswerLines.join(" ").trim() });
      }
      break;
    }

    if (inFaqSection) {
      const m = trimmed.match(/^###\s+(.+)$/);
      if (m) {
        if (currentQuestion) {
          faqs.push({ question: currentQuestion, answer: currentAnswerLines.join(" ").trim() });
        }
        currentQuestion = m[1].replace(/\?+$/, "").trim() + "?";
        currentAnswerLines = [];
      } else if (currentQuestion && trimmed && !trimmed.startsWith("#")) {
        currentAnswerLines.push(trimmed);
      }
    }
  }
  if (currentQuestion) {
    faqs.push({ question: currentQuestion, answer: currentAnswerLines.join(" ").trim() });
  }
  return faqs;
}

export function parseReferencesFromMarkdown(markdown: string): string[] {
  const lines = markdown.split("\n");
  const refs: string[] = [];
  let inRefsSection = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (/^##\s+(references|sources|further reading)/i.test(trimmed)) {
      inRefsSection = true;
      continue;
    }
    if (inRefsSection && /^##\s+/.test(trimmed)) {
      inRefsSection = false;
      break;
    }
    if (inRefsSection && trimmed.startsWith("-")) {
      const linkMatch = trimmed.match(/^-\s*\[([^\]]+)\]\(([^)]+)\)/);
      if (linkMatch) {
        refs.push(linkMatch[2]);
      } else {
        refs.push(trimmed.replace(/^-\s*/, ""));
      }
    }
  }
  return refs;
}

export function parseSubtitleFromMarkdown(markdown: string, fallback?: string): string {
  const lines = markdown.split("\n").map(l => l.trim()).filter(Boolean);
  const h1Index = lines.findIndex(l => /^#\s+/.test(l));
  if (h1Index !== -1 && h1Index + 1 < lines.length) {
    const nextLine = lines[h1Index + 1];
    const boldMatch = nextLine.match(/^\s*(?:\*\*|\*)(.+?)(?:\*\*|\*)\s*$/);
    if (boldMatch) {
      return boldMatch[1].trim();
    }
    if (!/^[#>\-*+0-9]/.test(nextLine)) {
      return nextLine;
    }
  }
  return fallback ?? "";
}

export function parseRecommendationsFromMarkdown(markdown: string): string[] {
  const lines = markdown.split("\n");
  const recs: string[] = [];
  let inRecsSection = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (/^##\s*(recommendations|next steps|action items)/i.test(trimmed)) {
      inRecsSection = true;
      continue;
    }
    if (inRecsSection && /^##\s+/.test(trimmed)) {
      inRecsSection = false;
      break;
    }
    if (inRecsSection && trimmed.startsWith("-")) {
      recs.push(trimmed.replace(/^-\s*/, ""));
    }
  }
  return recs;
}

export function parseWhitepaperSectionsFromMarkdown(markdown: string): Array<{ number: number; title: string; summary: string }> {
  const lines = markdown.split("\n");
  const sections: Array<{ number: number; title: string; summary: string }> = [];
  let secNum = 1;

  for (const line of lines) {
    const trimmed = line.trim();
    if (/^##\s+/.test(trimmed)) {
      // Skip special sections
      if (/(executive summary|methodology|research angle|approach|findings|results|analysis|recommendations|next steps|action items|implementation|roadmap|phases|risks?|considerations|caveats|references|sources|bibliography)/i.test(trimmed)) {
        continue;
      }
      const title = trimmed.replace(/^##\s+/, "");
      sections.push({ number: secNum++, title, summary: "" });
    }
  }
  return sections;
}

export function parseLinkedInPostFromMarkdown(markdown: string): {
  hook: string;
  body: string;
  cta: string;
  hashtags: string[];
} {
  const lines = markdown.split("\n");
  let hook = "";
  let body = "";
  let cta = "";
  let hashtags: string[] = [];

  let currentSection: "none" | "hook" | "body" | "cta" | "hashtags" = "none";
  let bodyLines: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (/^##\s+hook/i.test(trimmed)) {
      currentSection = "hook";
      continue;
    } else if (/^##\s+body/i.test(trimmed)) {
      currentSection = "body";
      continue;
    } else if (/^##\s+(call to action|cta)/i.test(trimmed)) {
      currentSection = "cta";
      continue;
    } else if (/^##\s+hashtags/i.test(trimmed)) {
      currentSection = "hashtags";
      continue;
    } else if (/^##\s+/i.test(trimmed) || /^#\s+/i.test(trimmed)) {
      if (currentSection !== "none") {
        currentSection = "none";
      }
    }

    if (currentSection === "hook") {
      if (trimmed && !trimmed.startsWith("#")) {
        hook = (hook + " " + trimmed).trim();
      }
    } else if (currentSection === "body") {
      if (!trimmed.startsWith("#")) {
        bodyLines.push(line);
      }
    } else if (currentSection === "cta") {
      if (trimmed && !trimmed.startsWith("#")) {
        cta = (cta + " " + trimmed).trim();
      }
    } else if (currentSection === "hashtags") {
      if (trimmed && !trimmed.startsWith("#")) {
        const found = trimmed.match(/#[a-zA-Z0-9_]+/g);
        if (found) hashtags.push(...found);
      }
    }
  }

  body = bodyLines.join("\n").trim();

  return { hook, body, cta, hashtags };
}
