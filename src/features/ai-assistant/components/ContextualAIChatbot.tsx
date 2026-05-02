"use client";

import { useCallback, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  useAppDispatch,
  useAppSelector,
  selectAiLowCompetitionKeywordIds,
  selectAiLongTailKeywordIds,
  selectAiSuggestedKeywordIds,
  selectKeywordPrefs,
  selectKeywordStatuses,
} from "@/lib/redux/hooks";
import { qk } from "@/lib/query-keys";
import { getBusinessBrief } from "@/app/actions/brief-actions";
import { getKeywords } from "@/app/actions/keyword-actions";
import { getCompetitorBenchmark } from "@/app/actions/competitor-actions";
import { getCalendarEntries } from "@/app/actions/calendar-actions";
import { aiAssistantMemoryUpdated } from "@/lib/redux/keyword-workspace-slice";
import { getAIContext } from "@/features/ai-assistant/context/contextManager";
import { detectAIPageFromPath } from "@/features/ai-assistant/context/page";
import { executeAgentAction } from "@/features/ai-assistant/agent/executor";
import type {
  AIPage,
  ContextualAgentOutput,
  ContextualAgentRequestBody,
} from "@/features/ai-assistant/types";
import type { Project } from "@/lib/types";

interface Props {
  project: Project;
}

interface ApiResponse {
  success: boolean;
  error?: string;
  data?: ContextualAgentOutput;
}

const QUICK_PROMPTS: Record<AIPage, Array<{ id: string; label: string; prompt: string }>> = {
  keywords: [
    { id: "best", label: "Find best keywords", prompt: "Find best keywords to drive qualified organic traffic." },
    { id: "low", label: "Low competition", prompt: "Show low competition keywords with rankable opportunities." },
    { id: "long", label: "Long-tail", prompt: "Suggest long-tail keywords with high conversion potential." },
  ],
  competitors: [
    { id: "gaps", label: "Find keyword gaps", prompt: "Find the highest-impact keyword gaps we should target first." },
    { id: "opp", label: "Competitor opportunities", prompt: "Suggest competitor opportunities with highest traffic upside." },
    { id: "cmp", label: "Compare strategy", prompt: "Compare our keyword strategy against competitor coverage." },
  ],
  calendar: [
    { id: "fill", label: "Fill empty days", prompt: "Find best keywords to fill empty calendar slots." },
    { id: "schedule", label: "Schedule best keywords", prompt: "Schedule highest upside keywords first." },
  ],
  blogs: [
    { id: "gen", label: "Generate blog", prompt: "Suggest top keyword to generate next blog for." },
    { id: "improve", label: "Improve blog SEO", prompt: "Find blogs that need SEO improvements first." },
    { id: "update", label: "Update old content", prompt: "Find old blogs that should be refreshed now." },
  ],
};

function TypingDots() {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current [animation-delay:-0.2s]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current [animation-delay:-0.1s]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current" />
    </span>
  );
}

export function ContextualAIChatbot({ project }: Props) {
  const pathname = usePathname();
  const page = detectAIPageFromPath(pathname);
  const dispatch = useAppDispatch();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ContextualAgentOutput | null>(null);
  const [prompt, setPrompt] = useState("");

  const lowCompetitionIds = useAppSelector(s => selectAiLowCompetitionKeywordIds(s, project.id));
  const longTailIds = useAppSelector(s => selectAiLongTailKeywordIds(s, project.id));
  const suggestedKeywordIds = useAppSelector(s => selectAiSuggestedKeywordIds(s, project.id));
  const keywordPrefs = useAppSelector(s => selectKeywordPrefs(s, project.id));
  const keywordStatuses = useAppSelector(s => selectKeywordStatuses(s, project.id));

  const { data: briefData } = useQuery({
    queryKey: qk.brief(project.id),
    queryFn: () => getBusinessBrief(project.id),
    enabled: !!page,
    staleTime: Infinity,
    gcTime: 30 * 60_000,
  });

  const { data: keywordsData } = useQuery({
    queryKey: qk.keywords(project.id, { limit: 120, offset: 0 }),
    queryFn: () => getKeywords(project.id, { limit: 120, offset: 0 }),
    enabled: !!page,
    staleTime: 0,
    gcTime: 30 * 60_000,
  });

  const { data: competitorData } = useQuery({
    queryKey: qk.competitors(project.id),
    queryFn: () => getCompetitorBenchmark(project.id),
    enabled: page === "competitors",
    staleTime: 0,
    gcTime: 30 * 60_000,
  });

  const { data: calendarData } = useQuery({
    queryKey: qk.calendar(project.id),
    queryFn: () => getCalendarEntries(project.id),
    enabled: page === "calendar" || page === "blogs",
    staleTime: 0,
    gcTime: 30 * 60_000,
  });

  const context = useMemo(() => {
    if (!page) return null;
    const brief = briefData?.success ? briefData.brief ?? null : null;
    const keywordsRaw = keywordsData && "success" in keywordsData && keywordsData.success ? keywordsData.data : [];
    const aiSet = new Set(suggestedKeywordIds);
    const lowSet = new Set(lowCompetitionIds);
    const longSet = new Set(longTailIds);
    const keywords = keywordsRaw
      .map(k => (keywordStatuses[k.id] ? { ...k, status: keywordStatuses[k.id] } : k))
      .filter(k => {
        if (page !== "keywords") return true;
        if (keywordPrefs.filter === "ai") return aiSet.has(k.id);
        if (keywordPrefs.filter === "low_competition") return lowSet.has(k.id);
        if (keywordPrefs.filter === "long_tail") return longSet.has(k.id);
        if (keywordPrefs.filter === "pending" || keywordPrefs.filter === "approved" || keywordPrefs.filter === "rejected") {
          return k.status === keywordPrefs.filter;
        }
        return true;
      })
      .slice(0, 100);
    const competitorKeywords = competitorData?.competitorKeywords ?? [];
    const contentGaps = competitorData?.gaps ?? [];
    const calendarEntries = calendarData?.success ? calendarData.data : [];
    return getAIContext({
      projectId: project.id,
      page,
      project,
      brief,
      keywords,
      competitorKeywords,
      contentGaps,
      calendarData: calendarEntries,
      blogs: [],
    });
  }, [
    briefData,
    calendarData,
    competitorData,
    keywordPrefs.filter,
    keywordStatuses,
    keywordsData,
    lowCompetitionIds,
    longTailIds,
    page,
    project,
    suggestedKeywordIds,
  ]);

  const run = useCallback(
    async (nextPrompt: string) => {
      if (!page || !context) return;
      setLoading(true);
      setError("");
      setPrompt(nextPrompt);
      try {
        const body: ContextualAgentRequestBody = {
          projectId: project.id,
          page,
          prompt: nextPrompt,
          context,
          project: {
            niche: project.niche,
            target_audience: project.target_audience,
            target_region: project.target_region,
          },
        };
        const res = await fetch("/api/ai/keyword-decision", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const json = (await res.json()) as ApiResponse;
        if (!res.ok || !json.success || !json.data) {
          throw new Error(json.error ?? "AI assistant failed");
        }
        setResult(json.data);
        dispatch(
          aiAssistantMemoryUpdated({
            projectId: project.id,
            suggestedKeywordIds: json.data.filters.suggestedKeywordIds,
            suggestedGapKeywords: json.data.filters.suggestedGapKeywords,
            lowCompetitionKeywordIds: json.data.filters.lowCompetitionKeywordIds,
            longTailKeywordIds: json.data.filters.longTailKeywordIds,
            selectedKeywordIds: json.data.filters.suggestedKeywordIds,
            lastAction: "ANALYZE_KEYWORDS",
            preferredFilter: "ai",
          })
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : "AI assistant failed");
      } finally {
        setLoading(false);
      }
    },
    [context, dispatch, page, project]
  );

  if (!page) return null;

  const prompts = QUICK_PROMPTS[page];
  return (
    <>
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-95 inline-flex h-14 items-center gap-3 rounded-full border border-brand-action/30 bg-brand-primary px-5 text-[14px] font-semibold text-brand-on-primary shadow-xl shadow-brand-action/20 transition-all hover:-translate-y-0.5 hover:shadow-2xl"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.8 15.9 9 18.8l-.8-2.9a4.5 4.5 0 0 0-3.1-3.1L2.3 12l2.8-.8a4.5 4.5 0 0 0 3.1-3.1L9 5.3l.8 2.8a4.5 4.5 0 0 0 3.1 3.1l2.8.8-2.8.8a4.5 4.5 0 0 0-3.1 3.1Z" />
          </svg>
          Ask AI
        </button>
      ) : null}

      {open ? (
        <div className="pointer-events-none fixed bottom-6 right-6 z-95 w-[min(460px,calc(100vw-2rem))]">
          <aside className="pointer-events-auto flex h-[min(700px,calc(100vh-3rem))] flex-col overflow-hidden rounded-[18px] border border-border-subtle bg-surface-primary shadow-2xl">
            <header className="border-b border-border-subtle bg-surface-primary px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-[17px] font-semibold text-text-primary">Contextual AI Assistant</h3>
                  <p className="mt-1 text-[12px] text-text-tertiary capitalize">{page} page strategy</p>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="flex h-8 w-8 items-center justify-center rounded-full border border-border-subtle bg-surface-elevated text-text-tertiary hover:bg-surface-hover hover:text-text-primary"
                >
                  ✕
                </button>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {prompts.map(item => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => void run(item.prompt)}
                    disabled={loading}
                    className="rounded-full border border-border-subtle bg-surface-elevated px-3 py-1.5 text-[12px] font-medium text-text-secondary hover:border-brand-action/40 hover:text-brand-action disabled:opacity-50"
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </header>

            <div className="flex-1 overflow-y-auto px-4 py-4">
              <div className="space-y-4">
                {prompt ? (
                  <div className="flex justify-end">
                    <div className="max-w-[86%] rounded-[16px] rounded-tr-[4px] bg-brand-action px-4 py-3 text-[13px] text-white">
                      {prompt}
                    </div>
                  </div>
                ) : null}

                {loading ? (
                  <div className="rounded-[12px] border border-border-subtle bg-surface-elevated px-4 py-3 text-[13px] text-text-secondary">
                    <div className="flex items-center gap-2">
                      <TypingDots />
                      <span>Analyzing page context...</span>
                    </div>
                  </div>
                ) : error ? (
                  <div className="rounded-[12px] border border-brand-coral/30 bg-brand-coral/10 p-4 text-[13px] text-brand-coral">
                    {error}
                  </div>
                ) : result ? (
                  <div className="space-y-3">
                    <div className="rounded-[12px] border border-border-subtle bg-surface-elevated p-4 text-[13px] text-text-secondary">
                      {result.summary}
                    </div>
                    {result.suggestions.map((s, idx) => (
                      <article key={`${s.keyword}-${idx}`} className="rounded-[12px] border border-border-subtle bg-surface-elevated p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-mono text-[11px] text-text-tertiary">#{idx + 1}</p>
                            <h4 className="mt-1 truncate text-[15px] font-semibold text-text-primary">{s.keyword}</h4>
                          </div>
                          <div className="rounded-[10px] border border-brand-action/25 bg-brand-action/10 px-3 py-1.5 text-center">
                            <p className="font-mono text-[16px] font-bold text-brand-action">{s.score}</p>
                            <p className="text-[9px] uppercase tracking-wide text-text-tertiary">Score</p>
                          </div>
                        </div>
                        <div className="mt-3 grid grid-cols-4 gap-2 text-[11px] text-text-tertiary">
                          <Metric
                            label="Volume"
                            value={s.metrics.volume ? s.metrics.volume.toLocaleString() : "-"}
                          />
                          <Metric label="KD" value={s.metrics.kd ? String(s.metrics.kd) : "-"} />
                          <Metric label="Traffic" value={s.estimatedMonthlyTraffic ? `~${s.estimatedMonthlyTraffic}/mo` : "-"} />
                          <Metric label="Rank chance" value={`${s.rankingChance}%`} />
                        </div>
                        <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-text-tertiary">
                          <Metric label="Intent" value={s.metrics.intent || "-"} />
                          <Metric label="Funnel" value={s.funnelStage} />
                        </div>
                        <p className="mt-3 text-[13px] text-text-secondary">{s.whyThisMatters}</p>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-[12px] border border-border-subtle bg-surface-elevated p-4 text-[13px] text-text-secondary">
                    Ask AI for page-aware recommendations.
                  </div>
                )}
              </div>
            </div>

            <footer className="border-t border-border-subtle bg-surface-primary px-4 py-3">
              <div className="flex flex-wrap items-center gap-2">
                {(result?.actions ?? []).map(action => (
                  <button
                    key={action.type}
                    type="button"
                    onClick={() =>
                      executeAgentAction(action.type, {
                        dispatch,
                        projectId: project.id,
                        lowCompetitionIds,
                        longTailIds,
                      })
                    }
                    className="rounded-full border border-border-subtle bg-surface-elevated px-3 py-1.5 text-[12px] font-medium text-text-secondary hover:border-brand-action/40 hover:text-brand-action"
                    title={action.description}
                  >
                    {action.label}
                  </button>
                ))}
              </div>
            </footer>
          </aside>
        </div>
      ) : null}
    </>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[8px] border border-border-subtle bg-surface-secondary px-2 py-2">
      <p className="text-[9px] font-bold uppercase tracking-wider text-text-tertiary">{label}</p>
      <p className="mt-0.5 truncate font-mono text-[12px] text-text-secondary" title={value}>
        {value}
      </p>
    </div>
  );
}
