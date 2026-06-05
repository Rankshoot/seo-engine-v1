export type DeepAnalysisImpact = 'High' | 'Medium' | 'Low';

export interface CompetitorPageExtract {
  url: string;
  title: string;
  metaDescription: string;
  headings: { h1: string[]; h2: string[]; h3: string[] };
  wordCount: number;
  faqs: string[];
  tables: string[];
  lists: string[];
  entities: string[];
  semanticKeywords: string[];
  schema: string[];
  images: string[];
  links: { internal: string[]; external: string[] };
  publishDate: string;
  updatedDate: string;
  author: string;
  ctas: string[];
  content: string;
  scrapeError?: string;
}

export interface BlogDeepAnalysisPriorityFix {
  issue: string;
  impact: DeepAnalysisImpact;
  recommendation: string;
}

/** Weighted rubric dimension — scores roll up to deepAnalysisScore. */
export interface BlogDeepAnalysisScoreParameter {
  id: string;
  label: string;
  weight: number;
  score: number;
  detail: string;
}

/** Maps a specific part of OUR blog to a specific competitor URL/section. */
export interface BlogSectionCompetitorGap {
  blogSection: string;
  blogExcerpt: string;
  competitorUrl: string;
  competitorSection: string;
  gap: string;
  impact: DeepAnalysisImpact;
}

export interface BlogDeepAnalysisResult {
  deepAnalysisScore: number;
  summary: string;
  /** Weighted parameters used to compute deepAnalysisScore (weights sum to 100). */
  scoreParameters: BlogDeepAnalysisScoreParameter[];
  /** Section-level gaps tied to a specific competitor URL. */
  sectionGaps: BlogSectionCompetitorGap[];
  competitorUrls: string[];
  missingTopics: string[];
  missingEntities: string[];
  missingSemanticKeywords: string[];
  weakSections: string[];
  competitorAdvantages: string[];
  contentOpportunities: string[];
  recommendedAdditions: string[];
  faqSuggestions: string[];
  tableSuggestions: string[];
  eeatSuggestions: string[];
  linkingSuggestions: string[];
  priorityFixes: BlogDeepAnalysisPriorityFix[];
}

export const DEEP_ANALYSIS_SCORE_PARAMETER_DEFS: ReadonlyArray<{
  id: string;
  label: string;
  weight: number;
}> = [
  { id: 'topic_coverage', label: 'Topic coverage vs SERP', weight: 18 },
  { id: 'heading_structure', label: 'Heading structure & depth', weight: 12 },
  { id: 'intent_match', label: 'Search intent satisfaction', weight: 14 },
  { id: 'faq_richness', label: 'FAQ & question coverage', weight: 10 },
  { id: 'tables_comparisons', label: 'Tables & comparisons', weight: 8 },
  { id: 'examples_stats', label: 'Examples & statistics', weight: 10 },
  { id: 'eeat_signals', label: 'E-E-A-T & trust signals', weight: 12 },
  { id: 'internal_links', label: 'Internal linking', weight: 8 },
  { id: 'external_citations', label: 'External citations', weight: 8 },
  { id: 'freshness_cta', label: 'Freshness & CTA quality', weight: 10 },
] as const;

export interface DeepAnalysisTraceEntry {
  stage: string;
  ok: boolean;
  detail?: string;
  url?: string;
}

export interface RunBlogDeepAnalysisInput {
  keyword: string;
  blogTitle: string;
  blogContent: string;
  blogMeta: string;
  targetRegion?: string;
  ownDomain?: string;
}

export interface RunBlogDeepAnalysisOutput {
  analysis: BlogDeepAnalysisResult;
  trace: DeepAnalysisTraceEntry[];
  dfsTrace: any[]; // Avoid direct DataForSEO type import if not needed in client
}
