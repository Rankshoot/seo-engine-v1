"use client";

import { useMemo } from "react";
import { Blog, BlogSeoIssueKey } from "@/lib/types";

// ─── CSS variable refs (auto-switch light ↔ dark) ─────────────────────────
const V = {
  bg:      "var(--surface-primary)",
  bgSec:   "var(--surface-secondary)",
  border:  "var(--border-default)",
  txt:     "var(--text-primary)",
  txtMute: "var(--text-tertiary)",
  action:  "var(--brand-action)",
} as const;
const MONO_LABEL = { fontFamily: "CohereMono, monospace", letterSpacing: "0.28px" } as const;

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
  const kw      = blog.target_keyword?.toLowerCase() ?? "";
  const content = blog.content ?? "";
  const title   = blog.title?.toLowerCase() ?? "";
  const meta    = blog.meta_description ?? "";

  const firstParaMatch = content.match(/^#.+\n+(.+)/m);
  const firstPara = firstParaMatch ? firstParaMatch[1].toLowerCase() : content.slice(0, 500).toLowerCase();

  const h2Count = (content.match(/^## /gm) ?? []).length;
  const h3Count = (content.match(/^### /gm) ?? []).length;

  const markdownExternalLinks = (content.match(/\[([^\]]+)\]\(https?:\/\//g) ?? []).length;
  const markdownInternalLinks = (content.match(/\[([^\]]+)\]\(\//g) ?? []).length;
  const externalLinks = blog.external_links?.length ?? markdownExternalLinks;
  const internalLinks = blog.internal_links?.length ?? markdownInternalLinks;

  const hasFAQ = /#{1,3}\s*(faq|frequently asked)/i.test(content);

  const words = content.toLowerCase().replace(/[#>*_\-[\]()`~.,!?;:"]/g, " ").split(/\s+/).filter(Boolean);
  const kwWords = kw.replace(/[#>*_\-[\]()`~.,!?;:"]/g, " ").split(/\s+/).filter(Boolean);
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
      hint: `${externalLinks} external links — aim for 3–8 authoritative sources`,
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

  const total    = checks.reduce((s, c) => s + (c.pass ? c.points : 0), 0);
  const maxTotal = checks.reduce((s, c) => s + c.points, 0);
  const pct      = (total / maxTotal) * 100;
  const grade: SEOScore["grade"] =
    pct >= 90 ? "A" : pct >= 75 ? "B" : pct >= 60 ? "C" : pct >= 40 ? "D" : "F";

  return { total, maxTotal, grade, checks };
}

const GRADE_CONFIG = {
  A: { color: "#16a34a", ring: "#16a34a33", bg: "#16a34a12", bar: "#16a34a", label: "Excellent" },
  B: { color: "var(--brand-action)", ring: "var(--brand-action)", bg: "color-mix(in srgb, var(--brand-action) 10%, transparent)", bar: "var(--brand-action)", label: "Good" },
  C: { color: "#d97706", ring: "#d9770633", bg: "#d9770612", bar: "#d97706", label: "Needs Work" },
  D: { color: "var(--brand-coral)", ring: "var(--brand-coral)", bg: "color-mix(in srgb, var(--brand-coral) 10%, transparent)", bar: "var(--brand-coral)", label: "Poor" },
  F: { color: "#b91c1c", ring: "#b91c1c33", bg: "#b91c1c12", bar: "#b91c1c", label: "Critical" },
};

export default function SEOScorePanel({
  blog,
  onFixIssue,
  fixingIssue,
  className = "rounded-[8px] p-5 bg-surface-primary border border-border-default",
}: {
  blog: Blog;
  onFixIssue?: (issue: SEOCheck) => void;
  fixingIssue?: BlogSeoIssueKey | null;
  className?: string;
}) {
  const score    = useMemo(() => computeSEOScore(blog), [blog]);
  const cfg      = GRADE_CONFIG[score.grade];
  const pct      = Math.round((score.total / score.maxTotal) * 100);
  const failures = score.checks.filter(c => !c.pass);

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Header label */}
      <p className="text-[10px] font-medium uppercase text-text-tertiary" style={MONO_LABEL}>
        SEO Score
      </p>

      {/* Grade ring + summary */}
      <div className="flex items-center gap-4">
        <div
          className="w-[60px] h-[60px] rounded-full flex flex-col items-center justify-center shrink-0"
          style={{ background: cfg.bg, outline: `3px solid ${cfg.ring}`, outlineOffset: 0 }}
        >
          <span className="text-[26px] font-bold leading-none" style={{ color: cfg.color }}>{score.grade}</span>
          <span className="text-[9px] font-medium text-text-tertiary" style={MONO_LABEL}>{pct}%</span>
        </div>
        <div>
          <p className="text-[14px] font-bold" style={{ color: cfg.color }}>{cfg.label}</p>
          <p className="text-[11px] mt-0.5 text-text-tertiary">{score.total} / {score.maxTotal} points</p>
          {failures.length > 0 && (
            <p className="text-[11px] mt-0.5 text-text-tertiary">{failures.length} issue{failures.length > 1 ? "s" : ""} to fix</p>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1 w-full rounded-full bg-surface-secondary">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: cfg.bar }} />
      </div>

      {/* Divider */}
      <div className="border-t border-border-default" />

      {/* Checklist */}
      <div className="space-y-2">
        {score.checks.map(check => (
          <div key={check.label} className="flex items-start gap-2.5">
            <div
              className="w-4 h-4 rounded-full flex items-center justify-center shrink-0 mt-0.5"
              style={{ background: check.pass ? "#16a34a18" : "#b91c1c12" }}
            >
              {check.pass ? (
                <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="#16a34a" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="m5 13 4 4L19 7" />
                </svg>
              ) : (
                <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="#b91c1c" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              )}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <p className="text-[11px] font-medium leading-tight" style={{ color: check.pass ? V.txtMute : V.txt }}>
                  {check.label}
                  <span className="ml-1 font-normal text-text-tertiary">({check.points}pt)</span>
                </p>
                {!check.pass && onFixIssue && (
                  <button
                    type="button"
                    onClick={() => onFixIssue(check)}
                    disabled={Boolean(fixingIssue)}
                    className="shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-medium transition-all disabled:cursor-not-allowed disabled:opacity-50"
                    style={{ border: `1px solid ${V.action}33`, background: `color-mix(in srgb, ${V.action} 10%, transparent)`, color: V.action }}
                  >
                    {fixingIssue === check.key ? "Fixing…" : "AI fix"}
                  </button>
                )}
              </div>
              {!check.pass && (
                <p className="text-[10px] mt-0.5 leading-tight text-text-tertiary">{check.hint}</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
