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
  ahrefs_rank_tracker_project_id?: number | null;
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

/**
 * Provenance for a keyword row.
 * - `industry`               — Keywords-Explorer / seed-driven (legacy + future).
 * - `competitor_gap`         — competitor ranks for it, we do not (discovery pipeline).
 * - `competitor_benchmark`   — approved from the Competitors benchmark opportunity table.
 * - `quick_win`              — we already rank for it at positions 4–20.
 */
export type KeywordSourceType =
  | 'industry'
  | 'competitor_gap'
  | 'competitor_benchmark'
  | 'quick_win'
  /** Google Ads `keywords_for_site` — domain tab live list. */
  | 'google_ads_domain';

/** Multi-intent flags as Ahrefs returns them. Structurally matches `AhrefsIntentObject`. */
export interface KeywordIntents {
  informational?: boolean;
  navigational?: boolean;
  commercial?: boolean;
  transactional?: boolean;
  branded?: boolean;
  local?: boolean;
}
export type CalendarStatus = 'scheduled' | 'generating' | 'generated' | 'downloaded' | 'published' | 'approved';
export type BlogStatus = 'generated' | 'approved' | 'published';
export type BlogSeoIssueKey =
  | 'title_keyword'
  | 'intro_keyword'
  | 'meta_keyword'
  | 'meta_length'
  | 'word_count'
  | 'h2_structure'
  | 'h3_structure'
  | 'faq'
  | 'external_links'
  | 'internal_links'
  | 'keyword_density';
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
  /** Marketing funnel: TOFU / MOFU / BOFU (Gemini on AI intent refresh, else heuristic). */
  funnel_stage?: string | null;
  /** Discovery-pipeline provenance. */
  source_type?: KeywordSourceType | string | null;
  /** Set when the keyword was stamped from the AI assistant (e.g. "AI · keywords"). */
  ai_source?: string | null;
  /** Competitor domains that rank for this keyword (sorted by traffic). */
  source_competitors?: string[] | null;
  /** Ranking page URLs aligned positionally with `source_competitors`. */
  source_urls?: string[] | null;
  /** Ahrefs Keywords Explorer parent topic / cluster head. */
  parent_topic?: string | null;
  /** Ahrefs estimated total traffic the #1 page would earn for this term. */
  traffic_potential?: number | null;
  /** Multi-intent flag bag from Ahrefs (commercial + branded + …). */
  intents?: KeywordIntents | null;
  /**
   * Lower-cased + trimmed form of `keyword`. Stored generated column —
   * Postgres maintains it; never assign from app code. Used for the
   * (project_id, normalized_keyword) unique index that catches case-different
   * duplicates ("SEO Tool" vs "seo tool").
   */
  normalized_keyword?: string;
  /** Worldwide search volume (Ahrefs `global_volume`), all regions combined. */
  global_volume?: number | null;
  /** Search volume of the parent_topic keyword (the cluster head's own demand). */
  parent_volume?: number | null;
  /** SERP features Ahrefs detected for the term (featured snippet, PAA, video, …). */
  serp_features?: KeywordSerpFeature[] | null;
  /** Mutation timestamp; bumped explicitly by app code on UPDATE. */
  updated_at?: string;
}

/**
 * One SERP feature surfaced by Ahrefs for a keyword. Shape mirrors
 * `serp_overview/serp-overview` feature rows; extra Ahrefs-specific keys are
 * permitted via the index signature so downstream UI can render anything.
 */
export interface KeywordSerpFeature {
  type: string;
  position?: number | null;
  url?: string | null;
  title?: string | null;
  [key: string]: unknown;
}

// ─────────────────────────────────────────────────────────────────────────────
// Keyword modal + blog-generation coverage
// ─────────────────────────────────────────────────────────────────────────────

/**
 * One-row-per-keyword modal payload. Caches every Ahrefs response we'd ever
 * want to render in the keyword drilldown UI so we don't pay for the same
 * Ahrefs unit twice. `last_fetched_at` is the source-of-truth for staleness;
 * the UI can soft-refresh when it's older than N hours.
 */
export interface KeywordDetail {
  id: string;
  keyword_id: string;
  /** Full Ahrefs Keywords-Explorer / overview row (volume, KD, CPC, intents, parent_topic, …). */
  overview: KeywordOverview | null;
  /** Per-month historical volume (Ahrefs volume-history). */
  volume_history: KeywordVolumeHistoryPoint[];
  /** Per-country volume (Ahrefs volume-by-country). */
  volume_by_country: KeywordVolumeByCountry[];
  /** Top organic SERP results (positions 1..N). */
  serp_top_results: KeywordSerpResult[];
  /** Convenience pointer at the single highest-ranking result. */
  top_ranking_result: KeywordSerpResult | null;
  last_fetched_at: string;
  created_at: string;
  updated_at: string;
}

/**
 * Cached Ahrefs Keywords-Explorer overview row stored in `keyword_details.overview`.
 * Structurally matches `AhrefsKeywordOverviewRow` from `lib/ahrefs.ts`.
 */
export interface KeywordOverview {
  keyword: string;
  volume: number;
  difficulty: number | null;
  cpc: number | null;
  intents: KeywordIntents | null;
  parent_topic: string | null;
  traffic_potential: number | null;
  global_volume?: number | null;
}

export interface KeywordVolumeHistoryPoint {
  /** ISO date — Ahrefs returns month-anchored values like `2026-01-01`. */
  date: string;
  volume: number;
}

export interface KeywordVolumeByCountry {
  /** Lowercase ISO-2 country code (`us`, `gb`, `in`). */
  country: string;
  volume: number;
}

export interface KeywordSerpResult {
  position: number;
  url: string;
  title: string;
  domain: string;
  domain_rating: number | null;
  url_rating: number | null;
  traffic: number | null;
  refdomains: number | null;
}

/**
 * Source bucket on a `keyword_ideas` row. Mirrors Ahrefs' Keywords-Explorer
 * tabs so we can persist each tab's output separately for blog generation.
 */
export type KeywordIdeaType =
  | 'terms_match'
  | 'questions'
  | 'also_rank_for'
  | 'also_talk_about'
  | 'search_suggestion';

/**
 * Many-rows-per-keyword "ideas" pool. The blog pipeline reads these by
 * `type` to drive H2 outline (terms_match), FAQ (questions), entity coverage
 * (also_rank_for), and synonym/related concepts (also_talk_about).
 */
export interface KeywordIdea {
  id: string;
  keyword_id: string;
  type: KeywordIdeaType;
  keyword: string;
  volume: number;
  difficulty: number | null;
  cpc: number | null;
  traffic_potential: number | null;
  intents: KeywordIntents | null;
  parent_topic: string | null;
  created_at: string;
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
  /** Set when a calendar entry is created from an AI suggestion. Format: "AI · <page>" e.g. "AI · keywords" */
  ai_source?: string;
  /**
   * Full Content Health snapshot when the row was queued from the audit UI.
   * Fed into `generateBlog` as writer notes so the new draft resolves these findings.
   */
  content_health_audit?: unknown | null;
  created_at: string;
  keywords?: Keyword;
  /** Joined from `blogs.title` in `getCalendarEntries` when a blog exists. */
  blog_title?: string | null;
}

export interface Blog {
  id: string;
  /** Null for uploads analyzed under Content Health (no calendar row). */
  entry_id: string | null;
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
  blog: Pick<Blog, "id" | "entry_id" | "title" | "word_count" | "status" | "research_sources"> | null;
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
  'Import',
] as const;

export const TARGET_REGIONS = [
  { code: 'us', name: 'United States', locationCode: 2840 },
  { code: 'uk', name: 'United Kingdom', locationCode: 2826 },
  /** DataForSEO / Google Ads country location — India is 2356; US is 2840 (do not swap). */
  { code: 'in', name: 'India', locationCode: 2356 },
  { code: 'au', name: 'Australia', locationCode: 2036 },
  { code: 'ca', name: 'Canada', locationCode: 2124 },
  { code: 'de', name: 'Germany', locationCode: 2276 },
  { code: 'fr', name: 'France', locationCode: 2250 },
  { code: 'sg', name: 'Singapore', locationCode: 2702 },
  { code: 'ae', name: 'UAE', locationCode: 2784 },
  { code: 'nz', name: 'New Zealand', locationCode: 2554 },
] as const;

/** DataForSEO default when `target_region` cannot be resolved (United States). */
export const DATAFORSEO_DEFAULT_LOCATION_CODE = 2840 as const;

/**
 * Maps a project's `target_region` (dropdown stores codes like `in`, `us`)
 * to DataForSEO `location_code`. Handles case, whitespace, display names
 * (`India`), and numeric codes that match our table. Unknown values fall back
 * to {@link DATAFORSEO_DEFAULT_LOCATION_CODE}.
 */
export function locationCodeFromTargetRegion(region: string | null | undefined): number {
  const raw = (region ?? '').trim();
  if (!raw) return DATAFORSEO_DEFAULT_LOCATION_CODE;

  const lower = raw.toLowerCase();
  const byCode = TARGET_REGIONS.find(r => r.code === lower);
  if (byCode) return byCode.locationCode;

  const byName = TARGET_REGIONS.find(r => r.name.toLowerCase() === lower);
  if (byName) return byName.locationCode;

  if (/^\d+$/.test(raw)) {
    const n = Number(raw);
    if (TARGET_REGIONS.some(r => r.locationCode === n)) return n;
  }

  return DATAFORSEO_DEFAULT_LOCATION_CODE;
}

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

