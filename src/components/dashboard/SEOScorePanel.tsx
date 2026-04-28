"use client";

import { useMemo } from "react";
import { Blog, BlogSeoIssueKey } from "@/lib/types";

interface SEOCheck {
  key: BlogSeoIssueKey;
  label: string;
  pass: boolean;
  points: number;
  hint: string;
}

interface SEOScore {
  total: number;
  maxTotal: number;
  grade: "A" | "B" | "C" | "D" | "F";
  checks: SEOCheck[];
}

function computeSEOScore(blog: Blog): SEOScore {
  const kw = blog.target_keyword?.toLowerCase() ?? "";
  const content = blog.content ?? "";
  const title = blog.title?.toLowerCase() ?? "";
  const meta = blog.meta_description ?? "";

  // Extract first paragraph text
  const firstParaMatch = content.match(/^#.+\n+(.+)/m);
  const firstPara = firstParaMatch ? firstParaMatch[1].toLowerCase() : content.slice(0, 500).toLowerCase();

  // Count H2 and H3 headings
  const h2Count = (content.match(/^## /gm) ?? []).length;
  const h3Count = (content.match(/^### /gm) ?? []).length;

  // External and internal links. Prefer the persisted link arrays because the
  // generator/repair flow already classifies absolute same-domain URLs (e.g.
  // https://example.com/blog/foo) as internal. Fall back to markdown scanning
  // for older rows or manually edited content before it has been saved.
  const markdownExternalLinks = (content.match(/\[([^\]]+)\]\(https?:\/\//g) ?? []).length;
  const markdownInternalLinks = (content.match(/\[([^\]]+)\]\(\//g) ?? []).length;
  const externalLinks = blog.external_links?.length ?? markdownExternalLinks;
  const internalLinks = blog.internal_links?.length ?? markdownInternalLinks;

  // Has FAQ section
  const hasFAQ = /#{1,3}\s*(faq|frequently asked)/i.test(content);

  // Keyword density (target 1-3%). Normalize punctuation so phrases like
  // "chief ai officer," still count as "chief ai officer".
  const words = content
    .toLowerCase()
    .replace(/[#>*_\-[\]()`~.,!?;:"]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  const kwWords = kw
    .replace(/[#>*_\-[\]()`~.,!?;:"]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  let kwOccurrences = 0;
  for (let i = 0; i <= words.length - kwWords.length; i++) {
    if (kwWords.every((w, j) => words[i + j] === w)) kwOccurrences++;
  }
  const kwDensity = words.length > 0 ? (kwOccurrences / words.length) * 100 : 0;

  const checks: SEOCheck[] = [
    {
      key: "title_keyword",
      label: "Target keyword in title",
      pass: kw.split(" ").some(w => w.length > 3 && title.includes(w)),
      points: 15,
      hint: "Include the target keyword in your H1 title",
    },
    {
      key: "intro_keyword",
      label: "Keyword in first 100 words",
      pass: kw.split(" ").some(w => w.length > 3 && firstPara.includes(w)),
      points: 10,
      hint: "Mention the target keyword within the opening paragraph",
    },
    {
      key: "meta_keyword",
      label: "Meta description has keyword",
      pass: kw.split(" ").some(w => w.length > 3 && meta.toLowerCase().includes(w)),
      points: 10,
      hint: "Include the target keyword in your meta description",
    },
    {
      key: "meta_length",
      label: "Meta description 150–160 chars",
      pass: meta.length >= 140 && meta.length <= 165,
      points: 5,
      hint: `Meta is ${meta.length} chars — aim for 150–160`,
    },
    {
      key: "word_count",
      label: "Content ≥ 1,500 words",
      pass: blog.word_count >= 1500,
      points: 15,
      hint: `Current: ${blog.word_count} words — aim for at least 1,500`,
    },
    {
      key: "h2_structure",
      label: "Has ≥ 3 H2 headings",
      pass: h2Count >= 3,
      points: 10,
      hint: `${h2Count} H2 headings — add more structured sections`,
    },
    {
      key: "h3_structure",
      label: "Has H3 sub-headings",
      pass: h3Count >= 1,
      points: 5,
      hint: "Add H3 headings to organise sub-topics",
    },
    {
      key: "faq",
      label: "FAQ section included",
      pass: hasFAQ,
      points: 10,
      hint: "Add a FAQ section to capture People Also Ask traffic",
    },
    {
      key: "external_links",
      label: "External links (3–8)",
      pass: externalLinks >= 3,
      points: 10,
      hint: `${externalLinks} external links found — aim for 3–8 authoritative sources`,
    },
    {
      key: "internal_links",
      label: "Internal links present",
      pass: internalLinks >= 1,
      points: 5,
      hint: "Link to other relevant articles on your site",
    },
    {
      key: "keyword_density",
      label: "Keyword density 0.5–3%",
      pass: kwDensity >= 0.5 && kwDensity <= 3,
      points: 5,
      hint: `Density: ${kwDensity.toFixed(2)}% — ideal range is 0.5–3%`,
    },
  ];

  const total = checks.reduce((s, c) => s + (c.pass ? c.points : 0), 0);
  const maxTotal = checks.reduce((s, c) => s + c.points, 0);

  const pct = (total / maxTotal) * 100;
  const grade: SEOScore["grade"] =
    pct >= 90 ? "A" : pct >= 75 ? "B" : pct >= 60 ? "C" : pct >= 40 ? "D" : "F";

  return { total, maxTotal, grade, checks };
}

const GRADE_CONFIG = {
  A: { color: "text-accent-400", ring: "ring-accent-500/30", bg: "bg-accent-500/10", label: "Excellent" },
  B: { color: "text-brand-400", ring: "ring-brand-500/30", bg: "bg-brand-500/10", label: "Good" },
  C: { color: "text-yellow-400", ring: "ring-yellow-500/30", bg: "bg-yellow-500/10", label: "Needs Work" },
  D: { color: "text-warm-400", ring: "ring-warm-500/30", bg: "bg-warm-500/10", label: "Poor" },
  F: { color: "text-rose-400", ring: "ring-rose-500/30", bg: "bg-rose-500/10", label: "Critical" },
};

export default function SEOScorePanel({
  blog,
  onFixIssue,
  fixingIssue,
}: {
  blog: Blog;
  onFixIssue?: (issue: SEOCheck) => void;
  fixingIssue?: BlogSeoIssueKey | null;
}) {
  const score = useMemo(() => computeSEOScore(blog), [blog]);
  const cfg = GRADE_CONFIG[score.grade];
  const pct = Math.round((score.total / score.maxTotal) * 100);
  const failures = score.checks.filter(c => !c.pass);

  return (
    <div className="glass-card p-5 space-y-4">
      <p className="text-[10px] font-bold uppercase tracking-widest text-text-tertiary">SEO Score</p>

      {/* Score circle + grade */}
      <div className="flex items-center gap-4">
        <div className={`w-16 h-16 rounded-full ring-4 ${cfg.ring} ${cfg.bg} flex flex-col items-center justify-center shrink-0`}>
          <span className={`text-2xl font-black leading-none ${cfg.color}`}>{score.grade}</span>
          <span className="text-[9px] text-text-tertiary font-bold">{pct}%</span>
        </div>
        <div>
          <p className={`text-sm font-black ${cfg.color}`}>{cfg.label}</p>
          <p className="text-xs text-text-tertiary">{score.total} / {score.maxTotal} points</p>
          {failures.length > 0 && (
            <p className="text-[10px] text-text-tertiary mt-0.5">{failures.length} issue{failures.length > 1 ? "s" : ""} to fix</p>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 w-full bg-surface-elevated rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${
            score.grade === "A" ? "bg-accent-500" :
            score.grade === "B" ? "bg-brand-500" :
            score.grade === "C" ? "bg-yellow-500" : "bg-rose-500"
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Checklist */}
      <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
        {score.checks.map(check => (
          <div key={check.label} className="flex items-start gap-2.5">
            <div className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
              check.pass ? "bg-accent-500/10 text-accent-400" : "bg-rose-500/10 text-rose-400"
            }`}>
              {check.pass ? (
                <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="m5 13 4 4L19 7" />
                </svg>
              ) : (
                <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <p className={`text-[10px] font-bold leading-tight ${check.pass ? "text-text-secondary" : "text-text-primary"}`}>
                  {check.label}
                  <span className="text-text-tertiary font-normal ml-1">({check.points}pt)</span>
                </p>
                {!check.pass && onFixIssue && (
                  <button
                    type="button"
                    onClick={() => onFixIssue(check)}
                    disabled={Boolean(fixingIssue)}
                    className="shrink-0 rounded-md border border-brand-500/20 bg-brand-500/10 px-2 py-0.5 text-[9px] font-bold text-brand-400 transition-all hover:bg-brand-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {fixingIssue === check.key ? "Fixing..." : "AI fix"}
                  </button>
                )}
              </div>
              {!check.pass && (
                <p className="text-[9px] text-text-tertiary leading-tight mt-0.5">{check.hint}</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
