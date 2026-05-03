import type { BlogAuditAnalysis, BlogIssue } from "@/lib/content-audit";

/** Stored on `calendar_entries.content_health_audit` when scheduling from Content Health. */
export type ContentHealthAuditSnapshot = {
  version: 1;
  capturedAt: string;
  url: string;
  title: string;
  health_score: number;
  primary_keyword: string;
  word_count: number;
  analysis: BlogAuditAnalysis;
};

export function buildContentHealthAuditSnapshot(row: {
  url: string;
  title: string;
  health_score: number;
  primary_keyword: string;
  word_count: number;
  analysis: BlogAuditAnalysis;
  updated_at?: string;
}): ContentHealthAuditSnapshot {
  return {
    version: 1,
    capturedAt: row.updated_at ?? new Date().toISOString(),
    url: row.url,
    title: row.title,
    health_score: row.health_score,
    primary_keyword: row.primary_keyword,
    word_count: row.word_count,
    analysis: row.analysis,
  };
}

function wordCount(s: string): number {
  return s.split(/\s+/).filter(Boolean).length;
}

function stripBrandTail(s: string): string {
  return s
    .replace(/\s*[|]\s*.+$/i, "")
    .replace(/\s+[–-]\s+.+$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Prefer a short, rankable query — not the full blog title copied into `primary_keyword`.
 */
export function extractCalendarFocusKeyword(row: {
  url: string;
  title: string;
  primary_keyword: string;
  analysis: BlogAuditAnalysis;
}): string {
  const demandKw = row.analysis.keyword_demand?.keyword?.trim();
  const analysisPk = (row.analysis.primary_keyword ?? "").trim();
  let candidate = stripBrandTail(row.primary_keyword.trim() || analysisPk);
  const title = row.title.trim();

  if (title && candidate.toLowerCase() === title.toLowerCase() && demandKw) {
    candidate = stripBrandTail(demandKw);
  }
  if (wordCount(candidate) > 12 && demandKw && wordCount(demandKw) <= 10) {
    candidate = stripBrandTail(demandKw);
  }
  if (candidate.length > 80 && demandKw && demandKw.length < candidate.length) {
    candidate = stripBrandTail(demandKw);
  }

  if (!candidate || candidate.length < 2) {
    try {
      const u = new URL(row.url);
      const segs = u.pathname.split("/").filter(Boolean);
      const slug = segs[segs.length - 1] ?? "";
      candidate = decodeURIComponent(slug)
        .replace(/-/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    } catch {
      candidate = title.slice(0, 80) || "Blog content refresh";
    }
  }

  return candidate.slice(0, 200);
}

function issueLine(i: number, issue: BlogIssue): string {
  const fix = issue.fix ? ` Fix: ${issue.fix}` : "";
  return `${i}. [${issue.severity}/${issue.category}] ${issue.label}: ${issue.detail}.${fix}`;
}

function rubricLine(r: { label: string; status: string; detail: string }): string {
  return `- [${r.status.toUpperCase()}] ${r.label}: ${r.detail}`;
}

/**
 * Merged into `generateBlog` writer notes so the draft explicitly resolves audit findings.
 */
export function formatContentHealthAuditForWriter(raw: unknown): string {
  if (!raw || typeof raw !== "object") return "";
  const o = raw as Partial<ContentHealthAuditSnapshot>;
  if (o.version !== 1 || !o.analysis || typeof o.url !== "string") return "";

  const a = o.analysis;
  const parts: string[] = [];

  parts.push(
    "CONTENT HEALTH AUDIT — You are writing a NEW article for the calendar focus keyword. The URL below is the OLD page we diagnosed; do not assume the reader sees it. Use this list as mandatory remediation goals (structure, depth, links, schema intent, FAQ, answer-first opening)."
  );
  parts.push(`Audited URL (context only): ${o.url}`);
  if (typeof o.health_score === "number") parts.push(`Legacy page health score: ${o.health_score}/100.`);
  if (a.plain_language_verdict?.trim()) parts.push(`Summary verdict: ${a.plain_language_verdict.trim()}`);
  if (a.summary?.trim() && a.summary !== a.plain_language_verdict) {
    parts.push(`Topic context: ${a.summary.trim()}`);
  }

  const issues = Array.isArray(a.issues) ? a.issues : [];
  if (issues.length) {
    parts.push("\nIssues & required fixes (address each in the new draft):");
    issues.slice(0, 45).forEach((issue, idx) => {
      parts.push(issueLine(idx + 1, issue));
    });
    if (issues.length > 45) parts.push(`… plus ${issues.length - 45} more — prioritise high-severity items first.`);
  }

  const rubric = Array.isArray(a.quality_rubric) ? a.quality_rubric : [];
  const rubricProblems = rubric.filter(r => r.status !== "pass");
  if (rubricProblems.length) {
    parts.push("\nQuality checklist items that were not fully met on the old page:");
    rubricProblems.slice(0, 25).forEach(r => parts.push(rubricLine(r)));
  }

  if (Array.isArray(a.content_gaps) && a.content_gaps.length) {
    parts.push("\nSubtopics to cover that were missing:");
    a.content_gaps.slice(0, 20).forEach((g, i) => parts.push(`${i + 1}. ${g}`));
  }

  const links = Array.isArray(a.internal_link_opportunities) ? a.internal_link_opportunities : [];
  if (links.length) {
    parts.push("\nInternal URLs the old page should have linked to (use ≥2 where relevant in the new article):");
    links.slice(0, 15).forEach(l => parts.push(`- ${l.target_url}${l.reason ? ` — ${l.reason}` : ""}`));
  }

  const out = parts.join("\n");
  return out.length > 7500 ? `${out.slice(0, 7490)}…` : out;
}
