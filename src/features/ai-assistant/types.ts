import type { Blog, CalendarEntry, CompetitorKeyword, Keyword, KeywordGap, Project } from "@/lib/types";
import type { CompetitorKeywordsForSiteRow } from "@/lib/dataforseo";

export type AIPage = "keywords" | "competitors" | "calendar" | "blogs";
export type AIPageExtended = AIPage | "audit";

export interface AIBusinessContext {
  niche: string;
  audience: string;
  region: string;
  businessBrief: string;
  /** The user's own domain — used to recognise own-brand vs competitor-brand queries. */
  projectDomain: string;
  /** Competitor domains attached to this project — used to filter brand-navigational keywords out of blog suggestions. */
  competitorDomains: string[];
}

export interface AIContextMemory {
  lastAction: string | null;
  selectedKeywordIds: string[];
  preferredFilter: "all" | "low_competition" | "long_tail" | "ai";
  recentQueries: string[];
  chatHistory: Array<{
    role: "user" | "assistant";
    text: string;
    page: AIPageExtended;
    timestamp: string;
  }>;
}

export interface AIAuditRecord {
  url: string;
  title: string;
  health_score: number;
  severity: "low" | "medium" | "high";
  primary_keyword: string;
  analysis_summary: string;
}

export interface AIContext {
  projectId: string;
  page: AIPageExtended;
  /** Keywords saved in DB (Industry tab). */
  keywords: Keyword[];
  /**
   * Live Google-Ads keywords for the user's own domain (Domain tab).
   * Only fetched when the chatbot is open or the user opens the Domain tab.
   */
  domainKeywords: CompetitorKeywordsForSiteRow[];
  competitorKeywords: CompetitorKeyword[];
  contentGaps: KeywordGap[];
  calendarData: CalendarEntry[];
  blogs: Blog[];
  audits: AIAuditRecord[];
  businessContext: AIBusinessContext;
  memory: AIContextMemory;
}

export type ContextualActionType =
  | "ANALYZE_KEYWORDS"
  | "FILTER_LOW_COMPETITION"
  | "SUGGEST_LONG_TAIL"
  | "FIND_GAPS"
  | "COMPARE_KEYWORDS"
  | "ADD_OPPORTUNITIES"
  | "AUTO_FILL_CALENDAR"
  | "GENERATE_BLOG"
  | "IMPROVE_BLOG"
  | "UPDATE_OLD_BLOG"
  | "OPEN_CALENDAR"
  | "OPEN_KEYWORDS";

export interface ContextualAction {
  type: ContextualActionType;
  label: string;
  description: string;
}

export interface ContextualSuggestion {
  id?: string;
  keyword: string;
  source: "keyword" | "competitor_gap" | "calendar_slot" | "blog" | "audit";
  score: number;
  metrics: {
    volume: number;
    kd: number;
    cpc?: number;
    intent?: string;
  };
  trafficType: string;
  estimatedMonthlyTraffic: number;
  rankingChance: number;
  funnelStage: "TOFU" | "MOFU" | "BOFU";
  whyThisMatters: string;
  actionStep: string;
  lowCompetition?: boolean;
  longTail?: boolean;
}

export interface ContextualAgentOutput {
  page: AIPageExtended;
  summary: string;
  suggestions: ContextualSuggestion[];
  actions: ContextualAction[];
  filters: {
    suggestedKeywordIds: string[];
    suggestedGapKeywords: string[];
    lowCompetitionKeywordIds: string[];
    longTailKeywordIds: string[];
  };
}

export interface ContextualAgentRequestBody {
  projectId?: string;
  page?: AIPageExtended;
  prompt?: string;
  context?: Partial<AIContext>;
  project?: Pick<Project, "niche" | "target_audience" | "target_region"> | null;
  /** Set when the assistant is opened from a single blog editor page. */
  blogId?: string;
  /** When false, mutating tools auto-execute (used after user clicks Confirm). */
  awaitConfirmation?: boolean;
  /** Disable the new tool-calling orchestrator (debug). Defaults to true. */
  useToolAgent?: boolean;
}
