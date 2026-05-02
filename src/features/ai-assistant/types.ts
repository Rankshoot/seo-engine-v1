import type { Blog, CalendarEntry, CompetitorKeyword, Keyword, KeywordGap, Project } from "@/lib/types";

export type AIPage = "keywords" | "competitors" | "calendar" | "blogs";

export interface AIBusinessContext {
  niche: string;
  audience: string;
  region: string;
  businessBrief: string;
}

export interface AIContextMemory {
  lastAction: string | null;
  selectedKeywordIds: string[];
  preferredFilter: "all" | "low_competition" | "long_tail" | "ai";
}

export interface AIContext {
  projectId: string;
  page: AIPage;
  keywords: Keyword[];
  competitorKeywords: CompetitorKeyword[];
  contentGaps: KeywordGap[];
  calendarData: CalendarEntry[];
  blogs: Blog[];
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
  | "UPDATE_OLD_BLOG";

export interface ContextualAction {
  type: ContextualActionType;
  label: string;
  description: string;
}

export interface ContextualSuggestion {
  id?: string;
  keyword: string;
  source: "keyword" | "competitor_gap" | "calendar_slot" | "blog";
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
  page: AIPage;
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
  page?: AIPage;
  prompt?: string;
  context?: Partial<AIContext>;
  project?: Pick<Project, "niche" | "target_audience" | "target_region"> | null;
}
