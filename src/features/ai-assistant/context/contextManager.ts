import type { BusinessBrief } from "@/lib/business-brief";
import type { Blog, CalendarEntry, CompetitorKeyword, Keyword, KeywordGap, Project } from "@/lib/types";
import type { AIContext, AIPage } from "@/features/ai-assistant/types";

interface GetAIContextInput {
  projectId: string;
  page: AIPage;
  project: Project | null;
  brief: BusinessBrief | null;
  keywords?: Keyword[];
  competitorKeywords?: CompetitorKeyword[];
  contentGaps?: KeywordGap[];
  calendarData?: CalendarEntry[];
  blogs?: Blog[];
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
  return {
    projectId: input.projectId,
    page: input.page,
    keywords: (input.keywords ?? []).slice(0, 80),
    competitorKeywords: (input.competitorKeywords ?? []).slice(0, 100),
    contentGaps: (input.contentGaps ?? []).slice(0, 80),
    calendarData: (input.calendarData ?? []).slice(0, 120),
    blogs: (input.blogs ?? []).slice(0, 60),
    businessContext: {
      niche: input.project?.niche ?? "",
      audience: input.project?.target_audience ?? "",
      region: input.project?.target_region ?? "us",
      businessBrief: briefToText(input.brief),
    },
    memory: input.memory ?? {
      lastAction: null,
      selectedKeywordIds: [],
      preferredFilter: "all",
    },
  };
}
