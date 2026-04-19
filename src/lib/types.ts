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
export type BlogStatus = 'draft' | 'ready' | 'downloaded';
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
  status: KeywordStatus;
  created_at: string;
  /** Competitor article URL when keyword came from gap import */
  source_url?: string | null;
  /** Competitor domain for gap-sourced keywords */
  gap_competitor?: string | null;
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
