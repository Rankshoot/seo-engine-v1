"use client";

import { useMemo } from "react";
import type { Blog, WhitepaperContentData } from "@/lib/types";
import { ScorecardView } from "./ScorecardView";
import {
  buildScorecard,
  countClichePhrases,
  countWords,
  keywordInText,
  plainText,
  parseWhitepaperSectionsFromMarkdown,
  parseRecommendationsFromMarkdown,
  parseReferencesFromMarkdown,
  type ScoreCheck,
} from "./score-helpers";

/**
 * Whitepaper scorecard rubric.
 *
 * Whitepapers are graded against the EEAT bar: a procurement / legal /
 * board reader must trust every claim. The rubric reflects the core
 * sections enterprise buyers expect (executive summary, methodology,
 * findings, recommendations, references, risks).
 */
function computeWhitepaperScore(blog: Blog): ScoreCheck[] {
  const data = (blog.content_data ?? {}) as Partial<WhitepaperContentData>;
  const md = blog.content ?? "";
  const text = plainText(md);
  const lower = text.toLowerCase();
  const titleLower = (blog.title ?? "").toLowerCase();
  const wordCount = blog.word_count || countWords(text);

  // Fallback parsing from markdown
  const parsedSections = parseWhitepaperSectionsFromMarkdown(md);
  const parsedRecs = parseRecommendationsFromMarkdown(md);
  const parsedRefs = parseReferencesFromMarkdown(md);

  const h2Count = (md.match(/^## /gm) ?? []).length;
  const sections = data.sections?.length ? data.sections : parsedSections;
  const sectionsCount = sections.length;
  const externalLinks = blog.external_links?.length ?? 0;
  const internalLinks = blog.internal_links?.length ?? 0;
  const recommendations = data.recommendations?.length ? data.recommendations : parsedRecs;
  const references = data.references?.length ? data.references : parsedRefs;

  const kw = (blog.target_keyword ?? "").trim().toLowerCase();
  const hasKeywordInTitle = kw ? keywordInText(kw, titleLower) : false;

  const hasExecSummary = /#{1,3}\s*executive summary/i.test(md);
  const execSummaryWords =
    hasExecSummary
      ? (() => {
          const match = md.match(/#{1,3}\s*executive summary[\s\S]*?(?=\n#{1,3}\s|$)/i);
          return match ? countWords(plainText(match[0].replace(/^#{1,3}\s*executive summary/i, ""))) : 0;
        })()
      : 0;
  const execSummaryOK = execSummaryWords >= 100 && execSummaryWords <= 600;

  const hasMethodology = /#{1,3}\s*(methodology|research angle|approach)/i.test(md);
  const hasFindings = /#{1,3}\s*(findings|results|analysis)/i.test(md);
  const hasRecsHeading = /#{1,3}\s*(recommendations|next steps|action items)/i.test(md);
  const hasRoadmap = /#{1,3}\s*(implementation|roadmap|phases)/i.test(md);
  const hasRisks = /#{1,3}\s*(risks?|considerations|caveats)/i.test(md);
  const hasReferences = /#{1,3}\s*(references|sources|bibliography)/i.test(md) || references.length > 0;

  const hasTable = /^\|.+\|/m.test(md);
  const cliches = countClichePhrases(text);
  const hasMarketingFluff = /(best[- ]in[- ]class|world[- ]class|industry[- ]leading)/i.test(text);
  const hasDate = /\b(20\d{2})\b/.test(text) || /\b(january|february|march|april|may|june|july|august|september|october|november|december)\b/i.test(text);

  return [
    // ── COVER & TRUST ──────────────────────────────────────────────────
    {
      key: "title_keyword",
      label: "Title includes primary keyword",
      pass: hasKeywordInTitle,
      points: 8,
      hint: kw ? "Add the primary keyword to the H1 / cover title." : "Set a primary keyword to score this.",
      category: "Cover & Trust",
    },
    {
      key: "publication_date",
      label: "Publication date / period stated",
      pass: hasDate,
      points: 4,
      hint: "Reference the year (e.g. 2026) so procurement can date the whitepaper.",
      category: "Cover & Trust",
    },
    {
      key: "no_marketing_fluff",
      label: "Avoids marketing fluff",
      pass: !hasMarketingFluff,
      points: 4,
      hint: 'Drop "best-in-class", "world-class", "industry-leading" — they cost EEAT credibility.',
      category: "Cover & Trust",
    },

    // ── STRUCTURE ──────────────────────────────────────────────────────
    {
      key: "exec_summary",
      label: "Executive summary present (100–600 words)",
      pass: hasExecSummary && execSummaryOK,
      warn: hasExecSummary && !execSummaryOK,
      points: 12,
      hint: hasExecSummary
        ? `Executive summary is ${execSummaryWords} words — aim for 100–600 so AI Overviews can pull it.`
        : "Add a `## Executive Summary` section near the top.",
      category: "Structure",
    },
    {
      key: "methodology",
      label: "Methodology / research angle stated",
      pass: hasMethodology,
      points: 8,
      hint: "Add a `## Methodology` section so readers can audit your sources.",
      category: "Structure",
    },
    {
      key: "findings",
      label: "Findings / analysis section",
      pass: hasFindings,
      points: 6,
      hint: "Use `## Findings` or `## Strategic Analysis` to anchor the substantive evidence.",
      category: "Structure",
    },
    {
      key: "sections_count",
      label: "≥ 5 numbered sections",
      pass: sectionsCount >= 5 || h2Count >= 5,
      warn: (sectionsCount >= 3 && sectionsCount < 5) || (h2Count >= 3 && h2Count < 5),
      points: 6,
      hint: `${Math.max(sectionsCount, h2Count)} sections detected — credible whitepapers have 5–10.`,
      category: "Structure",
    },

    // ── EVIDENCE ───────────────────────────────────────────────────────
    {
      key: "citations_count",
      label: "≥ 10 external citations",
      pass: externalLinks >= 10,
      warn: externalLinks >= 6 && externalLinks < 10,
      points: 12,
      hint: `${externalLinks} external citations — enterprise buyers expect 10–25 primary-source links.`,
      category: "Evidence",
    },
    {
      key: "references_section",
      label: "Dedicated references list",
      pass: hasReferences,
      points: 6,
      hint: "End with a `## References` section that lists distinct primary sources.",
      category: "Evidence",
    },
    {
      key: "data_table",
      label: "Includes a data table or structured comparison",
      pass: hasTable,
      points: 4,
      hint: "Add at least one Markdown table — comparison rows make findings auditable.",
      category: "Evidence",
    },

    // ── ACTIONABILITY ──────────────────────────────────────────────────
    {
      key: "recommendations",
      label: "Recommendations (≥ 5)",
      pass: (recommendations.length >= 5) || hasRecsHeading,
      warn: recommendations.length >= 3 && recommendations.length < 5,
      points: 8,
      hint: `${recommendations.length} recommendation${recommendations.length === 1 ? "" : "s"} — list 5–8 actionable items with measurable outcomes.`,
      category: "Actionability",
    },
    {
      key: "roadmap",
      label: "Implementation roadmap",
      pass: hasRoadmap,
      points: 4,
      hint: "Include a `## Implementation Roadmap` (90 days / 12 months / 24 months).",
      category: "Actionability",
    },
    {
      key: "risks",
      label: "Risks / considerations",
      pass: hasRisks,
      points: 4,
      hint: "Surface a `## Risks` section so the recommendation reads as honest, not promotional.",
      category: "Actionability",
    },
    {
      key: "internal_links",
      label: "≥ 2 internal links to brand pages",
      pass: internalLinks >= 2,
      warn: internalLinks === 1,
      points: 4,
      hint: "Link 2–3 verbatim URLs from your project brief to give the whitepaper a path to convert.",
      category: "Actionability",
    },

    // ── LENGTH & TONE ──────────────────────────────────────────────────
    {
      key: "word_count",
      label: "Word count 3,500–6,500",
      pass: wordCount >= 3500 && wordCount <= 6500,
      warn: (wordCount >= 2200 && wordCount < 3500) || (wordCount > 6500 && wordCount <= 9000),
      points: 6,
      hint: `${wordCount.toLocaleString()} words — credible analyst whitepapers ship 3.5–6.5k.`,
      category: "Length & Tone",
    },
    {
      key: "no_ai_clichés",
      label: "Avoids AI clichés",
      pass: cliches === 0,
      warn: cliches > 0 && cliches <= 2,
      points: 4,
      hint:
        cliches === 0
          ? "Clean analyst prose."
          : `${cliches} cliché phrase${cliches === 1 ? "" : "s"} ("delve", "navigate", "in today's world", …) — rewrite.`,
      category: "Length & Tone",
    },
  ];
}

export function WhitepaperScorePanel({
  blog,
  className = "rounded-[8px] p-5 bg-surface-primary border border-border-default",
}: {
  blog: Blog;
  className?: string;
}) {
  const checks = useMemo(() => computeWhitepaperScore(blog), [blog]);
  const scorecard = useMemo(() => buildScorecard(checks), [checks]);
  return (
    <ScorecardView
      title="Whitepaper score"
      subtitle="EEAT analyst rubric"
      scorecard={scorecard}
      className={className}
    />
  );
}
