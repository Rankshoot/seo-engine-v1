export interface Project {
  id: string;
  user_id: string;
  name: string;
  domain: string;
  company: string;
  niche: string;
  target_audience: string;
  target_region: string;
  target_language: string;
  description: string;
  created_at: string;
  updated_at: string;
  project_competitors?: ProjectCompetitor[];
}

export interface ProjectCompetitor {
  id: string;
  project_id: string;
  domain: string;
  created_at: string;
}

export type KeywordStatus = 'pending' | 'approved' | 'rejected';
export type CalendarStatus = 'scheduled' | 'generating' | 'generated' | 'downloaded';
export type BlogStatus = 'generated' | 'approved' | 'published';
export type ExportFormat = 'markdown' | 'html' | 'txt' | 'docx';

export interface Keyword {
  id: string;
  project_id: string;
  keyword: string;
  volume: number;
  kd: number;
  cpc: number;
  trend: string;
  monthly_searches: { month: string; volume: number }[];
  secondary_keywords: string[];
  ai_score: number;
  /**
   * Composite DataForSEO opportunity score (0–100) produced by the new
   * keyword-analysis pipeline. Higher = better SEO opportunity.
   */
  keyword_analysis_score?: number;
  /** How syntactically tied the keyword is to the project context (0–100). */
  relevance_score?: number | null;
  /** Tiered business-fit score (0–100) — 100 = niche × buying-intent match. */
  business_fit_score?: number | null;
  status: KeywordStatus;
  created_at: string;
  /** Competitor article URL when keyword came from gap import */
  source_url?: string | null;
  /** Competitor domain for gap-sourced keywords */
  gap_competitor?: string | null;
  /** Google Ads competition bucket (LOW / MEDIUM / HIGH) when known */
  competition_level?: string | null;
  /** Dominant SERP intent: informational / commercial / navigational / transactional */
  intent?: string | null;
}

export interface CalendarEntry {
  id: string;
  project_id: string;
  keyword_id: string | null;
  scheduled_date: string;
  title: string;
  article_type: string;
  slug: string;
  focus_keyword: string;
  secondary_keywords: string[];
  status: CalendarStatus;
  created_at: string;
  keywords?: Keyword;
}

export interface Blog {
  id: string;
  entry_id: string;
  project_id: string;
  title: string;
  content: string;
  meta_description: string;
  word_count: number;
  target_keyword: string;
  article_type: string;
  slug: string;
  status: BlogStatus;
  research_sources: number;
  external_links: string[];
  internal_links: string[];
  /** If this blog is a repair of an existing public page, the original URL. */
  source_url?: string;
  /** Bullet list of changes the LLM made during repair (only set when article_type === 'Repair'). */
  repair_notes?: string[];
  created_at: string;
  updated_at: string;
}

/** Calendar row plus optional blog summary from `getCalendarWithBlogs`. */
export type CalendarEntryWithBlog = CalendarEntry & {
  blog: Pick<Blog, "id" | "entry_id" | "word_count" | "status" | "research_sources"> | null;
};

export const ARTICLE_TYPES = [
  'How-to Guide',
  'Listicle: Round-up',
  'Comparison',
  'Case Study',
  'Ultimate Guide',
  'Tutorial',
  'FAQ Guide',
  'Industry Report',
  "Beginner's Guide",
  'Expert Interview',
  'Repair',
] as const;

export const TARGET_REGIONS = [
  { code: 'us', name: 'United States', locationCode: 2840 },
  { code: 'uk', name: 'United Kingdom', locationCode: 2826 },
  { code: 'in', name: 'India', locationCode: 2356 },
  { code: 'au', name: 'Australia', locationCode: 2036 },
  { code: 'ca', name: 'Canada', locationCode: 2124 },
  { code: 'de', name: 'Germany', locationCode: 2276 },
  { code: 'fr', name: 'France', locationCode: 2250 },
  { code: 'sg', name: 'Singapore', locationCode: 2702 },
  { code: 'ae', name: 'UAE', locationCode: 2784 },
  { code: 'nz', name: 'New Zealand', locationCode: 2554 },
] as const;

export const WORD_COUNT_OPTIONS = [500, 1000, 1500, 2500, 3000, 5000] as const;

// ─────────────────────────────────────────────────────────────────────────────
// Competitor Benchmarking Engine
// ─────────────────────────────────────────────────────────────────────────────

export type GapType = 'missing' | 'weak' | 'untapped';
export type CompetitorKeywordKind = 'primary' | 'longtail' | 'question';

/** Snapshot of one scraped competitor page — used inside Competitor.top_pages. */
export interface CompetitorPageSnapshot {
  url: string;
  title: string;
  h1: string;
  h2_count: number;
  h3_count: number;
  word_count: number;
  image_count: number;
  internal_link_count: number;
  external_link_count: number;
  has_faq: boolean;
  meta_description?: string;
}

/** One competitor domain with benchmarked content averages. */
export interface Competitor {
  id: string;
  project_id: string;
  domain: string;
  title: string;
  rank_score: number;
  pages_scraped: number;
  avg_word_count: number;
  avg_h2: number;
  avg_h3: number;
  avg_images: number;
  avg_internal_links: number;
  avg_external_links: number;
  faq_pages_pct: number;
  top_pages: CompetitorPageSnapshot[];
  recommendations: string[];
  last_benchmarked_at: string;
  created_at: string;
  updated_at: string;
}

export interface CompetitorKeyword {
  id: string;
  competitor_id: string;
  project_id: string;
  keyword: string;
  kind: CompetitorKeywordKind;
  freq: number;
  source_url: string;
  source_title: string;
  created_at: string;
}

/** Resolved gap row — drives the Opportunity Dashboard. */
export interface KeywordGap {
  id: string;
  project_id: string;
  keyword: string;
  gap_type: GapType;
  opportunity_score: number;
  volume: number;
  kd: number;
  trend: string;
  trend_pct: number;
  competitor_weakness: number;
  top_competitor_domain: string;
  top_competitor_url: string;
  reasoning: string;
  created_at: string;
  updated_at: string;
}

/** Aggregated benchmark across all competitors for one project. */
export interface BenchmarkAverages {
  avg_word_count: number;
  avg_h2: number;
  avg_h3: number;
  avg_images: number;
  avg_internal_links: number;
  avg_external_links: number;
  faq_pages_pct: number;
  pages_analyzed: number;
  recommendations: string[];
}

