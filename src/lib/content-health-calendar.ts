import type { BlogAuditAnalysis, BlogIssue } from "@/lib/content-audit";

/** How calendar generation should treat this snapshot. */
export type ContentHealthGenerationMode = "repair" | "full";

/** Which Content Health screen produced this calendar row (for UI provenance). */
export type ContentHealthScheduledFrom = "site_audit" | "analyze_content" | "discover_pages";

/** Stored on `calendar_entries.content_health_audit` when scheduling from Content Health. */
export type ContentHealthAuditSnapshot = {
  version: 1 | 2;
  capturedAt: string;
  url: string;
  title: string;
  health_score: number;
  primary_keyword: string;
  word_count: number;
  analysis: BlogAuditAnalysis;
  /** v2+: default repair when omitted on v1 rows. */
  generation_mode?: ContentHealthGenerationMode;
  /** Which tab/flow queued this job; derived from `analysis.analyze_page_meta` when omitted on older snapshots. */
  scheduled_from?: ContentHealthScheduledFrom;
};

/** Derive calendar provenance from audit row metadata (Analyze content stamps the URL flow; Discover stamps batch). */
export function deriveContentHealthScheduledFrom(analysis: BlogAuditAnalysis): ContentHealthScheduledFrom {
  const m = analysis.analyze_page_meta;
  if (m?.sourced_from_analyze_page) return "analyze_content";
  if (m?.sourced_from_discover_pages) return "discover_pages";
  return "site_audit";
}

/**
 * When the calendar row has a full Content Health snapshot, use this for badges — not `keywords.source_type`.
 */
export function contentHealthAuditForCalendarOrigin(raw: unknown): {
  label: string;
  subpage: ContentHealthScheduledFrom;
} | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Partial<ContentHealthAuditSnapshot>;
  if ((o.version !== 1 && o.version !== 2) || typeof o.url !== "string" || !o.url.trim()) return null;

  let subpage: ContentHealthScheduledFrom = o.scheduled_from ?? "site_audit";
  if (!o.scheduled_from && o.analysis && typeof o.analysis === "object") {
    subpage = deriveContentHealthScheduledFrom(o.analysis as BlogAuditAnalysis);
  }

  const subLabels: Record<ContentHealthScheduledFrom, string> = {
    site_audit: "Site audit",
    analyze_content: "Analyze content",
    discover_pages: "Discover pages",
  };
  return { subpage, label: `Content health · ${subLabels[subpage]}` };
}

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
    version: 2,
    capturedAt: row.updated_at ?? new Date().toISOString(),
    url: row.url,
    title: row.title,
    health_score: row.health_score,
    primary_keyword: row.primary_keyword,
    word_count: row.word_count,
    analysis: row.analysis,
    generation_mode: "repair",
    scheduled_from: deriveContentHealthScheduledFrom(row.analysis),
  };
}

/**
 * When this returns non-null, `generateBlog` should scrape `url` and call
 * `repairBlogPost` instead of `generateBlogPost` (reference page stays the same topic).
 */
export function parseContentHealthRepairPlan(raw: unknown): ContentHealthAuditSnapshot | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Partial<ContentHealthAuditSnapshot> & { writer_notes?: unknown };
  const version = o.version;
  if (version !== 1 && version !== 2) return null;
  const url = typeof o.url === "string" ? o.url.trim() : "";
  if (!url || !/^https?:\/\//i.test(url)) return null;
  const analysis = o.analysis;
  if (!analysis || typeof analysis !== "object") return null;
  if (analysis.page_status === "broken" || analysis.page_status === "redirected" || analysis.page_status === "empty") {
    return null;
  }
  if (o.generation_mode === "full") return null;
  return o as ContentHealthAuditSnapshot;
}

const REPAIR_SEVERITY_RANK: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };

/**
 * Builds `repairBlogPost`'s `contentAnalysisBundle` from a Content Health
 * repair plan — the same shape the blog-viewer's "Analyse content" flow
 * already uses to unlock FULL ENHANCEMENT mode (unconditional FAQ, 3–8
 * external citations, 2+ internal links, rubric-gap enforcement) instead of
 * the more conservative "only touch what's explicitly flagged" repair mode.
 *
 * Content Audit Studio's deep audit already computes a full quality_rubric —
 * this just carries it (plus a synthesized verdict/quick-wins) into the
 * writer prompt, so the enhanced blog is held to every scoring dimension the
 * audit itself checks, not only the freeform issues the LLM happened to list.
 */
export function buildContentAnalysisBundle(plan: ContentHealthAuditSnapshot): {
  summary: string;
  plain_language_verdict: string;
  conclusion_verdict: string;
  conclusion_summary: string;
  quick_wins: string[];
  quality_rubric: Array<{ label: string; detail: string; status: 'pass' | 'warn' | 'fail' }>;
} {
  const a = plan.analysis;
  const verdictText = a.plain_language_verdict?.trim() || a.summary?.trim() || '';
  const score = typeof plan.health_score === 'number' ? plan.health_score : 0;
  const conclusion_verdict = score >= 80 ? 'strong' : score >= 55 ? 'needs_improvement' : 'underperforming';

  const quick_wins = [...(a.issues ?? [])]
    .sort((x, y) => (REPAIR_SEVERITY_RANK[x.severity] ?? 9) - (REPAIR_SEVERITY_RANK[y.severity] ?? 9))
    .map(i => i.fix?.trim() || i.label?.trim())
    .filter((w): w is string => Boolean(w))
    .slice(0, 6);

  return {
    summary: a.summary || '',
    plain_language_verdict: verdictText,
    conclusion_verdict,
    conclusion_summary: verdictText,
    quick_wins,
    quality_rubric: (a.quality_rubric ?? []).map(r => ({ label: r.label, detail: r.detail, status: r.status })),
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
  const o = raw as Partial<ContentHealthAuditSnapshot> & { writer_notes?: string };
  if ((o.version !== 1 && o.version !== 2) || !o.analysis || typeof o.url !== "string") {
    const wn = typeof o.writer_notes === "string" ? o.writer_notes.trim() : "";
    return wn ? `Writer notes (calendar):\n${wn}` : "";
  }
  if (o.generation_mode === "full") {
    const partsFull: string[] = [];
    partsFull.push(
      "CONTENT HEALTH — Full new article mode. Use the audited URL only as competitive context; write a fresh post for the calendar focus keyword."
    );
    partsFull.push(`Reference URL: ${o.url}`);
    const a = o.analysis;
    if (a.plain_language_verdict?.trim()) partsFull.push(`Verdict: ${a.plain_language_verdict.trim()}`);
    return partsFull.join("\n");
  }

  const a = o.analysis;
  const parts: string[] = [];

  parts.push(
    "CONTENT HEALTH AUDIT — Surgical revision mode. You are writing a NEW calendar article for the focus keyword. The URL below is the OLD page we diagnosed (context only). Apply ONLY the fixes listed — do not rewrite unrelated sections for style. Preserve strong paragraphs, examples, and structure that already meet the checklist. Expand or restructure only where an issue explicitly requires it."
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

  const wn = typeof o.writer_notes === "string" ? o.writer_notes.trim() : "";
  if (wn) parts.push(`\nAdditional calendar notes:\n${wn}`);

  const out = parts.join("\n");
  return out.length > 7500 ? `${out.slice(0, 7490)}…` : out;
}
