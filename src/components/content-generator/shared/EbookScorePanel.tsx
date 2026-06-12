"use client";

import { useMemo } from "react";
import type { Blog, EbookContentData } from "@/lib/types";
import { ScorecardView } from "./ScorecardView";
import {
  buildScorecard,
  countClichePhrases,
  countWords,
  keywordInText,
  plainText,
  parseChaptersFromMarkdown,
  parseFaqsFromMarkdown,
  parseReferencesFromMarkdown,
  parseSubtitleFromMarkdown,
  type ScoreCheck,
} from "./score-helpers";

/**
 * Ebook scorecard rubric.
 *
 * Rubric is shaped around the way readers actually consume an ebook:
 * a magnetic cover, a navigable ToC, depthful chapters, and a closing CTA
 * tied to lead generation. Heuristics align with what marketing teams test
 * in real lead-magnet experiments — Hubspot, Semrush, Foundation Inc, etc.
 */
function computeEbookScore(blog: Blog): ScoreCheck[] {
  const data = (blog.content_data ?? {}) as Partial<EbookContentData>;
  const md = blog.content ?? "";
  const text = plainText(md);
  const lower = text.toLowerCase();
  const titleLower = (blog.title ?? "").toLowerCase();

  // Robust parsing fallbacks for metadata fields
  const parsedChapters = parseChaptersFromMarkdown(md);
  const parsedFaqs = parseFaqsFromMarkdown(md);
  const parsedReferences = parseReferencesFromMarkdown(md);
  const parsedSubtitle = parseSubtitleFromMarkdown(md, blog.meta_description);

  const subtitle = data.cover_subtitle || parsedSubtitle || "";
  const toc = data.table_of_contents?.length ? data.table_of_contents : parsedChapters;
  const faqs = data.faqs?.length ? data.faqs : parsedFaqs;
  const references = data.references?.length ? data.references : parsedReferences;
  const cta = data.cta ?? "";
  const wordCount = blog.word_count || countWords(text);

  const h2Count = (md.match(/^## /gm) ?? []).length;
  const h3Count = (md.match(/^### /gm) ?? []).length;
  const externalLinks = blog.external_links?.length ?? 0;
  const internalLinks = blog.internal_links?.length ?? 0;
  const cliches = countClichePhrases(text);
  const kw = (blog.target_keyword ?? "").trim().toLowerCase();
  const hasKeywordInTitle = kw ? keywordInText(kw, titleLower) : false;
  const hasKeywordEarly = kw ? keywordInText(kw, lower.split(/\s+/).slice(0, 200).join(" ")) : false;
  const hasFAQ = /#{1,3}\s*(faq|frequently asked)/i.test(md) || faqs.length > 0;
  const hasReferences = /#{1,3}\s*(references|sources|further reading)/i.test(md) || references.length > 0;
  const hasCTA = cta.trim().length > 0 || /#{1,3}\s*(next step|how.*can help|cta|call to action)/i.test(md);
  const hasAuthorNote = /^>\s*\[?author/im.test(md) || /^>\s/m.test(md);
  const subtitleOK = subtitle.length >= 20 && subtitle.length <= 160;
  const tocCoverage = toc.length;

  let avgChapterWords = 0;
  if (toc.length > 0) {
    const hasWordCounts = toc.every(c => 'word_count' in c && typeof c.word_count === 'number' && c.word_count > 0);
    if (hasWordCounts) {
      const sum = (toc as any[]).reduce((acc, c) => acc + c.word_count, 0);
      avgChapterWords = Math.round(sum / toc.length);
    } else {
      let parsedSum = 0;
      let matchedCount = 0;
      for (const item of toc) {
        const match = parsedChapters.find(pc => pc.title.toLowerCase() === item.title.toLowerCase());
        if (match) {
          parsedSum += match.word_count;
          matchedCount++;
        }
      }
      if (matchedCount > 0) {
        const avgMatched = parsedSum / matchedCount;
        const totalEstimated = parsedSum + (toc.length - matchedCount) * avgMatched;
        avgChapterWords = Math.round(totalEstimated / toc.length);
      } else {
        avgChapterWords = Math.round(wordCount / toc.length);
      }
    }
  }

  if (toc.length > 0 && avgChapterWords < 100) {
    avgChapterWords = Math.round(wordCount / toc.length);
  }

  return [
    // ── COVER ──────────────────────────────────────────────────────────
    {
      key: "cover_title_keyword",
      label: "Cover title contains primary keyword",
      pass: hasKeywordInTitle,
      points: 10,
      hint: kw ? "Add the primary keyword naturally to the H1 / cover title." : "Set a primary keyword to score this.",
      category: "Cover",
    },
    {
      key: "cover_subtitle",
      label: "Subtitle present (20–160 chars)",
      pass: subtitleOK,
      warn: !subtitleOK && subtitle.length > 0,
      points: 6,
      hint: `Subtitle is ${subtitle.length} chars — aim for one tight value-prop sentence (~20–160).`,
      category: "Cover",
    },
    {
      key: "cover_author_note",
      label: "Author note / preface set",
      pass: hasAuthorNote,
      points: 4,
      hint: "Add a one-line `> author` blockquote so the reader knows who's speaking.",
      category: "Cover",
    },

    // ── STRUCTURE ──────────────────────────────────────────────────────
    {
      key: "toc_chapters",
      label: "Table of contents has ≥ 5 chapters",
      pass: tocCoverage >= 5,
      warn: tocCoverage >= 3 && tocCoverage < 5,
      points: 10,
      hint: `${tocCoverage} chapter${tocCoverage === 1 ? "" : "s"} detected — premium ebooks ship 5–10.`,
      category: "Structure",
    },
    {
      key: "h2_chapters",
      label: "Body has ≥ 5 chapter headings",
      pass: h2Count >= 5,
      warn: h2Count >= 3 && h2Count < 5,
      points: 8,
      hint: `${h2Count} ## headings — make sure each chapter starts with one.`,
      category: "Structure",
    },
    {
      key: "h3_subsections",
      label: "Sub-sections used (≥ 4 H3)",
      pass: h3Count >= 4,
      warn: h3Count >= 2 && h3Count < 4,
      points: 4,
      hint: `${h3Count} ### sub-headings — use them to break dense chapters.`,
      category: "Structure",
    },

    // ── DEPTH ──────────────────────────────────────────────────────────
    {
      key: "total_words",
      label: "Total length ≥ 4,000 words",
      pass: wordCount >= 4000,
      warn: wordCount >= 2500 && wordCount < 4000,
      points: 10,
      hint: `${wordCount.toLocaleString()} words — premium ebooks land 4,000–14,000.`,
      category: "Depth",
    },
    {
      key: "chapter_depth",
      label: "Avg chapter ≥ 700 words",
      pass: avgChapterWords >= 700,
      warn: avgChapterWords >= 450 && avgChapterWords < 700,
      points: 8,
      hint:
        avgChapterWords > 0
          ? `Each chapter averages ${avgChapterWords} words — go deeper on weak chapters.`
          : "Add chapters to the table of contents so depth can be scored.",
      category: "Depth",
    },
    {
      key: "intro_keyword",
      label: "Keyword in first 200 words",
      pass: hasKeywordEarly,
      points: 4,
      hint: "Mention the primary keyword once inside the introduction so it indexes cleanly.",
      category: "Depth",
    },

    // ── AUTHORITY ──────────────────────────────────────────────────────
    {
      key: "external_links",
      label: "External citations (≥ 8)",
      pass: externalLinks >= 8,
      warn: externalLinks >= 4 && externalLinks < 8,
      points: 8,
      hint: `${externalLinks} external citations — premium ebooks cite 8–20 authoritative sources.`,
      category: "Authority",
    },
    {
      key: "references_section",
      label: "References / further reading section",
      pass: hasReferences,
      points: 5,
      hint: "End with a `## References` section listing 5+ distinct sources.",
      category: "Authority",
    },
    {
      key: "internal_links",
      label: "≥ 2 internal links to your site",
      pass: internalLinks >= 2,
      warn: internalLinks === 1,
      points: 5,
      hint: "Use 2–4 internal links to relevant pages on your domain so the ebook drives site traffic.",
      category: "Authority",
    },

    // ── ENGAGEMENT ─────────────────────────────────────────────────────
    {
      key: "faq_section",
      label: "FAQ section with ≥ 5 entries",
      pass: hasFAQ && faqs.length >= 5,
      warn: hasFAQ && faqs.length >= 3 && faqs.length < 5,
      points: 6,
      hint: `${faqs.length} FAQ pair${faqs.length === 1 ? "" : "s"} — readers expect 5–10 in a lead-magnet ebook.`,
      category: "Engagement",
    },
    {
      key: "cta_present",
      label: "Closing CTA tied to a goal",
      pass: hasCTA,
      points: 6,
      hint: "Add a single, specific CTA (book demo / claim trial / read related guide) at the end.",
      category: "Engagement",
    },
    {
      key: "no_ai_clichés",
      label: "Avoids AI clichés",
      pass: cliches === 0,
      warn: cliches > 0 && cliches <= 2,
      points: 6,
      hint:
        cliches === 0
          ? "Clean prose."
          : `${cliches} cliché phrase${cliches === 1 ? "" : "s"} detected ("delve", "navigate", "in today's world", …). Rewrite for human voice.`,
      category: "Engagement",
    },
  ];
}

export function EbookScorePanel({
  blog,
  className = "rounded-[8px] p-5 bg-surface-primary border border-border-default",
}: {
  blog: Blog;
  className?: string;
}) {
  const checks = useMemo(() => computeEbookScore(blog), [blog]);
  const scorecard = useMemo(() => buildScorecard(checks), [checks]);
  return (
    <ScorecardView
      title="Ebook score"
      subtitle="lead-magnet rubric"
      scorecard={scorecard}
      className={className}
    />
  );
}
