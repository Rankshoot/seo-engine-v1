import type { BusinessBrief } from "@/lib/business-brief";
import type { Blog, CalendarEntry, CompetitorKeyword, Keyword, KeywordGap, Project } from "@/lib/types";
import type { CompetitorKeywordsForSiteRow } from "@/lib/dataforseo";
import type { AIAuditRecord, AIContext, AIPageExtended } from "@/features/ai-assistant/types";

interface GetAIContextInput {
  projectId: string;
  page: AIPageExtended;
  project: Project | null;
  brief: BusinessBrief | null;
  keywords?: Keyword[];
  /** Domain-tab live keywords (Google Ads For Site). Optional. */
  domainKeywords?: CompetitorKeywordsForSiteRow[];
  competitorKeywords?: CompetitorKeyword[];
  contentGaps?: KeywordGap[];
  calendarData?: CalendarEntry[];
  blogs?: Blog[];
  audits?: AIAuditRecord[];
  memory?: AIContext["memory"];
}

function briefToText(brief: BusinessBrief | null): string {
  if (!brief) return "";
  return [
    brief.summary ?? "",
    brief.products?.join(", ") ?? "",
    brief.entities?.join(", ") ?? "",
    brief.audiences?.join(", ") ?? "",
    brief.usps?.join(", ") ?? "",
    brief.seed_phrases?.join(", ") ?? "",
  ]
    .filter(Boolean)
    .join("\n")
    .slice(0, 6000);
}

export function getAIContext(input: GetAIContextInput): AIContext {
  const competitorDomains = (input.project?.project_competitors ?? [])
    .map(c => c.domain)
    .filter(Boolean);
  return {
    projectId: input.projectId,
    page: input.page,
    keywords: (input.keywords ?? []).slice(0, 80),
    domainKeywords: (input.domainKeywords ?? []).slice(0, 80),
    competitorKeywords: (input.competitorKeywords ?? []).slice(0, 100),
    contentGaps: (input.contentGaps ?? []).slice(0, 80),
    calendarData: (input.calendarData ?? []).slice(0, 120),
    blogs: (input.blogs ?? []).slice(0, 60),
    audits: (input.audits ?? []).slice(0, 80),
    businessContext: {
      niche: input.project?.niche ?? "",
      audience: input.project?.target_audience ?? "",
      region: input.project?.target_region ?? "us",
      businessBrief: briefToText(input.brief),
      projectDomain: input.project?.domain ?? "",
      competitorDomains,
    },
    memory: input.memory ?? {
      lastAction: null,
      selectedKeywordIds: [],
      preferredFilter: "all",
      recentQueries: [],
      chatHistory: [],
    },
  };
}
