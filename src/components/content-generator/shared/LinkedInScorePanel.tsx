"use client";

import { useMemo } from "react";
import type { Blog, LinkedInContentData } from "@/lib/types";
import { ScorecardView } from "./ScorecardView";
import {
  buildScorecard,
  countClichePhrases,
  type ScoreCheck,
} from "./score-helpers";

/**
 * LinkedIn post scorecard rubric.
 *
 * Calibrated against real LinkedIn engagement studies (Dotterer 2024,
 * Justin Welsh / Jasmin Alić playbooks, LinkedIn algorithm Q4 2025
 * notes). The rubric punishes clichés, hashtag spam, walls of text,
 * and posts that miss the 1,300-char collapse fold.
 */
function computeLinkedInScore(blog: Blog): ScoreCheck[] {
  const data = (blog.content_data ?? {}) as Partial<LinkedInContentData>;
  const hook = (data.hook ?? "").trim();
  const body = (data.body ?? "").trim();
  const cta = (data.cta ?? "").trim();
  const hashtags = data.hashtags ?? [];

  const composedPost = [hook, body, cta, hashtags.join(" ")].filter(Boolean).join("\n\n");
  const charCount = composedPost.length;
  const hookWords = hook.split(/\s+/).filter(Boolean).length;
  const cliches = countClichePhrases(composedPost);

  // Paragraph density — split body on blank lines, reject paragraphs > 3 lines.
  const bodyLines = body.split(/\n+/).filter(l => l.trim().length > 0);
  const longParagraphs = bodyLines.filter(p => p.split(/(?<=\.)\s/).length > 3).length;

  // First-person / company voice signal — feels more human than 3rd-person.
  const firstPersonHits = (composedPost.match(/\b(i|i'm|i've|i'll|we|we're|we've|my|our)\b/gi) ?? []).length;

  // Engagement question / CTA at the end.
  const endsWithQuestion = /\?$/.test(body.trim()) || /\?$/.test(cta.trim());
  const ctaPresent = cta.length > 5;

  // Emoji density (overuse hurts feel-real readability).
  const emojiCount = (composedPost.match(/\p{Emoji_Presentation}/gu) ?? []).length;

  // Hashtag hygiene (3-5 ideal, branded vs generic).
  const hashtagsLowercase = hashtags.every(h => /^#[a-z0-9_]+$/i.test(h));

  // Wall-of-text catch — no blank line between body paragraphs.
  const hasWhitespace = body.includes("\n\n") || bodyLines.length > 1;

  // "delve / leverage" detection already handled in countClichePhrases.

  return [
    // ── HOOK ───────────────────────────────────────────────────────────
    {
      key: "hook_present",
      label: "Hook line present",
      pass: hook.length > 0,
      points: 8,
      hint: "Add a one-line hook (≤ 12 words) that makes a scroller stop.",
      category: "Hook",
    },
    {
      key: "hook_length",
      label: "Hook ≤ 12 words",
      pass: hookWords > 0 && hookWords <= 12,
      warn: hookWords > 12 && hookWords <= 18,
      points: 6,
      hint: `Hook is ${hookWords} word${hookWords === 1 ? "" : "s"} — short hooks survive the fold.`,
      category: "Hook",
    },
    {
      key: "hook_no_cliches",
      label: 'Hook avoids "I\u2019m excited to share..." openings',
      pass: !/^\s*(i'?m\s+(excited|thrilled|happy)|in today'?s|in recent years)/i.test(hook),
      points: 4,
      hint: "Open with a counter-intuitive observation, a specific moment, or a sharp question.",
      category: "Hook",
    },

    // ── LENGTH ─────────────────────────────────────────────────────────
    {
      key: "char_count",
      label: "Character count fits the feed (≤ 1,300)",
      pass: charCount > 0 && charCount <= 1300,
      warn: charCount > 1300 && charCount <= 1700,
      points: 8,
      hint: `Post is ${charCount.toLocaleString()} chars — LinkedIn collapses past 1,300.`,
      category: "Length",
    },
    {
      key: "char_min",
      label: "Substantive (≥ 700 chars)",
      pass: charCount >= 700,
      warn: charCount >= 400 && charCount < 700,
      points: 4,
      hint: `Post is ${charCount} chars — sweet spot for engagement is ~950–1,300.`,
      category: "Length",
    },

    // ── READABILITY ────────────────────────────────────────────────────
    {
      key: "whitespace",
      label: "Generous whitespace",
      pass: hasWhitespace,
      points: 6,
      hint: "Break the body into short paragraphs — walls of text get scrolled past.",
      category: "Readability",
    },
    {
      key: "short_paragraphs",
      label: "Paragraphs are 1–2 sentences",
      pass: longParagraphs === 0,
      warn: longParagraphs <= 2,
      points: 4,
      hint:
        longParagraphs === 0
          ? "Tight scannable paragraphs."
          : `${longParagraphs} paragraph${longParagraphs === 1 ? "" : "s"} run > 3 sentences — split them.`,
      category: "Readability",
    },
    {
      key: "no_emoji_spam",
      label: "Minimal emoji use (≤ 3)",
      pass: emojiCount <= 3,
      warn: emojiCount > 3 && emojiCount <= 6,
      points: 3,
      hint: `${emojiCount} emoji detected — LinkedIn's pro audience reads them as noise above ~3.`,
      category: "Readability",
    },

    // ── ENGAGEMENT ─────────────────────────────────────────────────────
    {
      key: "ends_with_question_or_cta",
      label: "Closes with a question or clear CTA",
      pass: endsWithQuestion || ctaPresent,
      points: 8,
      hint: "End with a sharp question or a 'reply / DM / comment' CTA — drives replies that boost reach.",
      category: "Engagement",
    },
    {
      key: "personal_voice",
      label: "Personal voice (I / we appear)",
      pass: firstPersonHits >= 2,
      warn: firstPersonHits === 1,
      points: 5,
      hint: "Posts in the LinkedIn feed perform best when they sound like a human, not a press release.",
      category: "Engagement",
    },
    {
      key: "no_ai_clichés",
      label: "Avoids AI clichés",
      pass: cliches === 0,
      warn: cliches > 0 && cliches <= 1,
      points: 6,
      hint:
        cliches === 0
          ? "Clean voice."
          : `${cliches} cliché phrase${cliches === 1 ? "" : "s"} ("delve", "leverage", "in today's world", …) — rewrite.`,
      category: "Engagement",
    },

    // ── HASHTAGS ───────────────────────────────────────────────────────
    {
      key: "hashtag_count",
      label: "3–5 targeted hashtags",
      pass: hashtags.length >= 3 && hashtags.length <= 5,
      warn: hashtags.length === 0 || hashtags.length > 5,
      points: 5,
      hint: `${hashtags.length} hashtag${hashtags.length === 1 ? "" : "s"} — LinkedIn's algorithm rewards 3–5 specific, on-topic tags.`,
      category: "Hashtags",
    },
    {
      key: "hashtag_format",
      label: "Hashtag format is clean (#camelCase or #lowercase)",
      pass: hashtags.length === 0 || hashtagsLowercase,
      points: 3,
      hint: 'Use single-word hashtags like #AIcontent, no spaces, no emojis inside the tag.',
      category: "Hashtags",
    },
  ];
}

export function LinkedInScorePanel({
  blog,
  className = "rounded-[8px] p-5 bg-surface-primary border border-border-default",
}: {
  blog: Blog;
  className?: string;
}) {
  const checks = useMemo(() => computeLinkedInScore(blog), [blog]);
  const scorecard = useMemo(() => buildScorecard(checks), [checks]);
  return (
    <ScorecardView
      title="LinkedIn score"
      subtitle="feed engagement rubric"
      scorecard={scorecard}
      className={className}
    />
  );
}
