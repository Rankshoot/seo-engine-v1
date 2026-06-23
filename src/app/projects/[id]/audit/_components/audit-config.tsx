import type { ContentAuditScores } from "@/lib/content-audit-studio";

export const STEPS = [
  { label: "Reading content" },
  { label: "Analyzing keyword" },
  { label: "Checking competitors" },
  { label: "Scoring with AI" },
];

export interface ScoreDim {
  key: keyof Omit<ContentAuditScores, "overall">;
  label: string;
  description: string;
  icon: React.ReactNode;
}

export const SCORE_DIMS: ScoreDim[] = [
  {
    key: "seo",
    label: "SEO Score",
    description: "On-page optimisation: title keyword, meta description, heading structure, schema markup, and link count.",
    icon: (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
        <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
      </svg>
    ),
  },
  {
    key: "geo",
    label: "GEO Score",
    description: "Generative Engine Optimization: direct answer first, cited sources, factual clarity — optimised for AI like ChatGPT and Perplexity.",
    icon: (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
        <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 18a8 8 0 1 1 8-8 8 8 0 0 1-8 8z" />
        <path d="M12 6v6l4 2" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    key: "aeo",
    label: "AEO Score",
    description: "Answer Engine Optimization: FAQ section, question-style headings, structured data, voice-search readiness.",
    icon: (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
      </svg>
    ),
  },
  {
    key: "content_quality",
    label: "Content Quality",
    description: "Depth, structure, usefulness, real examples vs filler text, and overall writing quality.",
    icon: (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9z" />
      </svg>
    ),
  },
  {
    key: "keyword_relevance",
    label: "Keyword Relevance",
    description: "Is your primary keyword still trending? Does it have search volume? Is it worth competing for?",
    icon: (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M7 20 l4-16 m2 16 l4-16 M6 9h14 M4 15h14" />
      </svg>
    ),
  },
  {
    key: "freshness",
    label: "Freshness Score",
    description: "How current is this content? Detects publish date, outdated statistics, and stale context.",
    icon: (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />
      </svg>
    ),
  },
];
