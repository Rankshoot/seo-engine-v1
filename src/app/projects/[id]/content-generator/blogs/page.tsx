"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useKeywordParam } from "@/hooks/useKeywordParam";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { ProjectNavLink } from "@/components/ProjectNavLink";
import { motion } from "framer-motion";
import {
  Button,
  Card,
  Field,
  Input,
  PageHeader,
  Select,
  Spinner,
  Textarea,
} from "@/components/common";
import {
  ContentForm,
  ContentFormGrid,
  ContentFormSection,
  ChipChoice,
  GenerationProgress,
  ThinkingPanel,
  KeywordChips,
  SectionHeading,
  StepRow,
  StudioBreadcrumb,
} from "@/components/content-generator/shared";
import { useProject, qk, DEFAULT_QUERY_OPTIONS } from "@/lib/query";
import { contentGeneratorApi, type ContentStudioHistoryRow } from "@/frontend/api/content-generator";
import { TARGET_REGIONS } from "@/lib/types";
import {
  suggestContentTopicAction,
} from "@/app/actions/content-actions";
import {
  fetchAhrefsKeywordDataAction,
  fetchCompetitorPagesAction,
  type AhrefsKeywordResult,
  type CompetitorPage,
} from "@/app/actions/premium-blog-actions";
import { calendarApi } from "@/frontend/api/calendar";
import { blogsApi } from "@/frontend/api/blogs";
import { useUserQuota } from "@/hooks/useUserQuota";

const TONES = [
  { id: "premium-educational", label: "Premium · educational" },
  { id: "founder-narrative", label: "Founder · narrative" },
  { id: "analyst-formal", label: "Analyst · formal" },
  { id: "friendly-expert", label: "Friendly · expert" },
] as const;

const WORD_COUNT_OPTIONS = [
  { id: "1500", label: "Concise", hint: "~1,500 words" },
  { id: "2500", label: "Standard", hint: "~2,500 words" },
  { id: "3500", label: "Deep dive", hint: "~3,500+ words" },
] as const;

const LANG_OPTIONS = [
  { code: "en", label: "English" },
  { code: "es", label: "Spanish" },
  { code: "de", label: "German" },
  { code: "fr", label: "French" },
  { code: "hi", label: "Hindi" },
  { code: "pt", label: "Portuguese" },
] as const;

type Phase = "form" | "review" | "generating";
type StreamStage = "context" | "research" | "outline" | "draft" | "polish" | "deep_scrape" | "deep_analyze";

const BASE_STREAM_STAGES: import("@/components/content-generator/shared").GenerationStage[] = [
  { id: "context",  label: "Loading project brief",     detail: "Reading your project brief and calendar entry…",           weight: 0.06 },
  { id: "research", label: "Gathering live research",    detail: "Pulling live SERP data and keyword context…",              weight: 0.18 },
  { id: "outline",  label: "Designing topical outline",  detail: "Structuring sections and SEO hierarchy…",                  weight: 0.12 },
  { id: "draft",    label: "Drafting content", detail: "Writing the full blog post — this is the longest step…",  weight: 0.50 },
  { id: "polish",   label: "SEO + image polish",          detail: "Generating hero image and final SEO pass…",               weight: 0.14 },
];

const DEEP_ANALYSIS_STAGES: import("@/components/content-generator/shared").GenerationStage[] = [
  { id: "deep_scrape",   label: "Scraping competitor pages",  detail: "Fetching and reading your top 5 ranking competitors…",  weight: 0.08 },
  { id: "deep_analyze",  label: "Analysing content gaps",     detail: "Summarising what competitors miss — your edge…",        weight: 0.07 },
];

const STAGE_ORDER_BASE: StreamStage[] = ["context", "research", "outline", "draft", "polish"];
const STAGE_ORDER_DEEP: StreamStage[] = ["context", "research", "deep_scrape", "deep_analyze", "outline", "draft", "polish"];

function buildStages(deepAnalysis: boolean) {
  if (!deepAnalysis) return BASE_STREAM_STAGES;
  return [
    BASE_STREAM_STAGES[0],
    BASE_STREAM_STAGES[1],
    ...DEEP_ANALYSIS_STAGES,
    BASE_STREAM_STAGES[2],
    BASE_STREAM_STAGES[3],
    BASE_STREAM_STAGES[4],
  ];
}

function buildCumulative(stages: import("@/components/content-generator/shared").GenerationStage[]) {
  let acc = 0;
  return stages.map((s) => { acc += s.weight; return acc; });
}

// ─── Small UI helpers ──────────────────────────────────────────────────────

function ToggleSwitch({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none disabled:opacity-40 disabled:cursor-not-allowed ${
        checked ? "bg-brand-action" : "bg-text-tertiary/30"
      }`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform ${
          checked ? "translate-x-4" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

function ProBadge() {
  return (
    <span className="inline-flex items-center gap-0.5 rounded-full border border-brand-action/40 bg-brand-action/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-brand-action">
      PRO
    </span>
  );
}

function AdvancedOptionRow({
  label,
  description,
  badge,
  checked,
  onChange,
  disabled,
  children,
}: {
  label: string;
  description: string;
  badge?: React.ReactNode;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border-subtle bg-surface-elevated p-4 space-y-3">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-[13px] font-semibold text-text-primary">{label}</span>
            {badge}
          </div>
          <p className="text-[11px] text-text-tertiary leading-relaxed">{description}</p>
        </div>
        <ToggleSwitch checked={checked} onChange={onChange} disabled={disabled} />
      </div>
      {checked && children}
    </div>
  );
}

export default function BlogGeneratorPage() {
  const { id: projectId } = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { canGenerateBlog, quota, hasAiCredits, hasAhrefsH2sCredits, hasAhrefsFaqsCredits, hasDeepAnalysisCredits } = useUserQuota();
  const base = `/projects/${projectId}`;
  const studioBase = `${base}/content-generator`;

  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const entryId = searchParams?.get("entryId");
  const shouldSchedule = searchParams?.get("shouldSchedule") !== "false";

  // Audit-fix mode: coming from Content Health → Generate enhanced
  const auditUrl = searchParams?.get("auditUrl") || "";
  const auditKeyword = searchParams?.get("auditKeyword") || "";
  const auditTitle = searchParams?.get("auditTitle") || "";
  const auditMode = searchParams?.get("auditMode") || ""; // "fix" = surgical edit, not rewrite
  const auditIssues = searchParams?.get("auditIssues") || "";
  const isAuditFixMode = auditMode === "fix" && !!auditUrl;

  const { data: entriesData } = useQuery({
    queryKey: qk.calendarWithBlogs(projectId),
    queryFn: () => calendarApi.withBlogs(projectId),
    enabled: !!projectId && !!entryId,
    ...DEFAULT_QUERY_OPTIONS,
  });

  const scheduledEntry = useMemo(() => {
    if (!entriesData?.success) return null;
    return entriesData.data.find((e) => e.id === entryId) || null;
  }, [entriesData, entryId]);

  const { data: projectRes } = useProject(projectId);
  const project = projectRes?.success ? projectRes.data : undefined;

  const keywordParam = searchParams?.get("keyword") || "";
  const { value: primaryKeyword, setValue: setPrimaryKeyword, isTyping: isKeywordTyping } = useKeywordParam(keywordParam);

  const [phase, setPhase] = useState<Phase>("form");
  const [topic, setTopic] = useState("");
  const [secondaryKeywords, setSecondaryKeywords] = useState<string[]>([]);
  const [audience, setAudience] = useState("");
  const [tone, setTone] = useState<(typeof TONES)[number]["id"]>("premium-educational");
  const [goal, setGoal] = useState("");
  const [ctaObjective, setCtaObjective] = useState("");
  const [wordCount, setWordCount] = useState<number>(2500);
  const [region, setRegion] = useState("us");
  const [language, setLanguage] = useState("en");
  const [askLoading, setAskLoading] = useState(false);
  const [streamStages, setStreamStages] = useState(BASE_STREAM_STAGES);
  const [streamProgress, setStreamProgress] = useState<number | undefined>(undefined);
  const [thinkingText, setThinkingText] = useState("");
  const [isThinking, setIsThinking] = useState(false);

  // ── Advanced Options state ─────────────────────────────────────────────
  // Brand Persona
  const [useBrandPersona, setUseBrandPersona] = useState(true);
  const [brandPersona, setBrandPersona] = useState("");
  // Ahrefs Keyword Intelligence
  const [useAhrefsData, setUseAhrefsData] = useState(false);
  const [ahrefsLoading, setAhrefsLoading] = useState(false);
  const [ahrefsH2s, setAhrefsH2s] = useState<AhrefsKeywordResult[]>([]);
  const [ahrefsFaqs, setAhrefsFaqs] = useState<AhrefsKeywordResult[]>([]);
  const [ahrefsError, setAhrefsError] = useState("");
  // Deep Analysis
  const [useDeepAnalysis, setUseDeepAnalysis] = useState(false);
  const [competitorLoading, setCompetitorLoading] = useState(false);
  const [competitorPages, setCompetitorPages] = useState<CompetitorPage[]>([]);
  const [competitorError, setCompetitorError] = useState("");
  // Custom Instructions
  const [customInstructions, setCustomInstructions] = useState("");

  const { data: history } = useQuery({
    queryKey: qk.contentStudioHistory(projectId),
    queryFn: () => contentGeneratorApi.studioHistory(projectId),
    enabled: !!projectId,
    ...DEFAULT_QUERY_OPTIONS,
  });
  const recentBlogs = useMemo(() => {
    const rows: ContentStudioHistoryRow[] = history?.success ? history.data : [];
    return rows.filter(r => r.content_type === "blog").slice(0, 4);
  }, [history]);

  // Set defaults from project
  useEffect(() => {
    if (project?.target_audience && !audience) setAudience(project.target_audience);
    const tr = project?.target_region?.toLowerCase();
    if (tr && TARGET_REGIONS.some(r => r.code === tr)) setRegion(tr);
    const tl = project?.target_language?.toLowerCase();
    if (tl) setLanguage(tl);
    // Seed brand persona from project — always show all 3 fields so user can see and edit each
    if (project) {
      setBrandPersona([
        `Voice: ${project.brand_voice || ""}`,
        `Values: ${project.brand_values || ""}`,
        `Description: ${project.brand_description || ""}`,
      ].join("\n"));
    }
  }, [project?.target_audience, project?.target_region, project?.target_language, project?.brand_voice, project?.brand_values, project?.brand_description, audience]);

  useEffect(() => {
    if (scheduledEntry) {
      if (scheduledEntry.focus_keyword && !keywordParam) setPrimaryKeyword(scheduledEntry.focus_keyword);
      const realTitle = scheduledEntry.blog_title?.trim();
      if (realTitle) setTopic(realTitle.replace(/^\[Draft\]\s*/, ""));
      if (scheduledEntry.secondary_keywords?.length) setSecondaryKeywords(scheduledEntry.secondary_keywords);
    }
  }, [scheduledEntry]);

  // Seed form from audit params when in fix mode
  useEffect(() => {
    if (!isAuditFixMode) return;
    if (auditKeyword && !keywordParam) setPrimaryKeyword(auditKeyword);
    if (auditTitle) setTopic(auditTitle);
    if (auditIssues) {
      setCustomInstructions(
        `AUDIT FIX MODE — apply these specific fixes to the existing blog at ${auditUrl}. DO NOT rewrite the entire post. Make surgical edits only:\n\n${auditIssues}`
      );
    }
  }, [isAuditFixMode]);

  // ── Ahrefs keyword fetch (triggered by toggle) ─────────────────────────
  const fetchAhrefsData = useCallback(async () => {
    const kw = primaryKeyword.trim();
    if (!kw) { setAhrefsError("Enter a primary keyword first."); return; }
    setAhrefsLoading(true);
    setAhrefsError("");
    setAhrefsH2s([]);
    setAhrefsFaqs([]);
    const res = await fetchAhrefsKeywordDataAction(kw, region);
    setAhrefsLoading(false);
    if (res.success) {
      setAhrefsH2s(res.h2Keywords);
      setAhrefsFaqs(res.faqKeywords);
    } else {
      setAhrefsError(res.error);
      setUseAhrefsData(false);
    }
  }, [primaryKeyword, region]);

  const handleAhrefsToggle = useCallback((on: boolean) => {
    setUseAhrefsData(on);
    if (on) void fetchAhrefsData();
  }, [fetchAhrefsData]);

  // ── Competitor pages fetch (triggered by deep analysis toggle) ──────────
  const fetchCompetitorPages = useCallback(async () => {
    const kw = primaryKeyword.trim();
    if (!kw) { setCompetitorError("Enter a primary keyword first."); return; }
    setCompetitorLoading(true);
    setCompetitorError("");
    setCompetitorPages([]);
    const res = await fetchCompetitorPagesAction(kw, projectId);
    setCompetitorLoading(false);
    if (res.success) {
      setCompetitorPages(res.pages);
    } else {
      setCompetitorError(res.error);
      setUseDeepAnalysis(false);
    }
  }, [primaryKeyword, projectId]);

  const handleDeepAnalysisToggle = useCallback((on: boolean) => {
    setUseDeepAnalysis(on);
    if (on) void fetchCompetitorPages();
  }, [fetchCompetitorPages]);

  const emptyRequiredFields = useMemo(() => {
    const missing: string[] = [];
    if (!topic.trim()) missing.push("Blog topic");
    if (!primaryKeyword.trim()) missing.push("Primary SEO keyword");
    if (!audience.trim()) missing.push("Target audience");
    return missing;
  }, [topic, primaryKeyword, audience]);

  const isFormValid = emptyRequiredFields.length === 0;

  const askAi = async () => {
    setAskLoading(true);
    try {
      const res = await suggestContentTopicAction(projectId, {
        contentType: "blog",
        avoidPhrases: secondaryKeywords,
        seedKeyword: primaryKeyword.trim() || undefined,
      });
      if (res.success) {
        setTopic(res.topic);
        setPrimaryKeyword(res.primary_keyword);
        if (res.semantic_keywords.length) setSecondaryKeywords(res.semantic_keywords.slice(0, 8));
        if (res.goal) setGoal(res.goal);
        if (res.cta_objective) setCtaObjective(res.cta_objective);
        toast.success("Filled topic, keyword, and supporting cluster");
      } else {
        toast.error(res.error);
      }
    } finally {
      setAskLoading(false);
    }
  };

  const goReview = () => {
    if (!isFormValid) { toast.error(`Please fill in: ${emptyRequiredFields.join(", ")}`); return; }
    setPhase("review");
  };

  const runGeneration = async () => {
    const stages = buildStages(useDeepAnalysis);
    const stageOrder = useDeepAnalysis ? STAGE_ORDER_DEEP : STAGE_ORDER_BASE;
    const stageCumulative = buildCumulative(stages);

    setPhase("generating");
    setStreamProgress(0);
    setThinkingText("");
    setIsThinking(false);
    setStreamStages(stages.map(s => ({ ...s })));

    const advancedBody = {
      brandPersona: useBrandPersona && brandPersona.trim() ? brandPersona.trim() : undefined,
      useAhrefsData: useAhrefsData && (ahrefsH2s.length > 0 || ahrefsFaqs.length > 0),
      ahrefsH2s: useAhrefsData ? ahrefsH2s : [],
      ahrefsFaqs: useAhrefsData ? ahrefsFaqs : [],
      useDeepAnalysis: useDeepAnalysis && competitorPages.length > 0,
      deepAnalysisPages: useDeepAnalysis ? competitorPages : [],
      customInstructions: customInstructions.trim() || undefined,
    };

    try {
      let finalEntryId = entryId;
      if (!finalEntryId && shouldSchedule) {
        const calRes = await calendarApi.addCustomKeyword(projectId, {
          keyword: primaryKeyword,
          title: `[Draft] ${topic}`,
          articleType: "blog",
          writerNotes: `Audience: ${audience}\nTone: ${TONES.find(t => t.id === tone)?.label}\nGoal: ${goal}\nCTA: ${ctaObjective}\nSecondary Keywords: ${secondaryKeywords.join(", ")}`,
          targetDate: new Date().toISOString().split("T")[0],
        });
        if (!calRes.success) {
          toast.error(calRes.error || "Failed to schedule blog");
          setPhase("form");
          return;
        }
        finalEntryId = calRes.data.id;
      }

      const handleEvent = (event: any) => {
        if (event.event === "stage") {
          const stageIdx = stageOrder.indexOf(event.stage as StreamStage);
          const progressAtStage = stageIdx === 0 ? 0.02 : stageCumulative[stageIdx - 1];
          setStreamProgress(progressAtStage);
          if (event.stage === "polish") setIsThinking(false);
          if (event.detail) {
            setStreamStages(prev => prev.map(s => s.id === event.stage ? { ...s, detail: event.detail } : s));
          }
          return null;
        } else if (event.event === "thinking") {
          setIsThinking(true);
          setThinkingText(prev => prev + event.chunk);
          return null;
        } else if (event.event === "thinking_done") {
          setIsThinking(false);
          return null;
        } else if (event.event === "done") {
          setStreamProgress(1);
          setIsThinking(false);
          toast.success("Blog generated!");
          void queryClient.invalidateQueries({ queryKey: qk.contentStudioHistory(projectId) });
          void queryClient.invalidateQueries({ queryKey: qk.contentGeneratorHistory(projectId) });
          router.push(`${studioBase}/blogs/${event.blogId}`);
          return "done";
        } else if (event.event === "error") {
          toast.error(event.message || "Generation failed");
          setPhase("form");
          setIsThinking(false);
          setStreamProgress(undefined);
          return "error";
        }
        return null;
      };

      if (!finalEntryId) {
        for await (const event of blogsApi.generateStreamDirect({
          projectId: projectId!,
          keyword: primaryKeyword,
          topic,
          audience,
          tone: TONES.find(t => t.id === tone)?.label || tone,
          goal,
          ctaObjective,
          secondaryKeywords,
          wordCount,
          ...advancedBody,
        })) {
          const result = handleEvent(event);
          if (result === "done" || result === "error") return;
        }
      } else {
        for await (const event of blogsApi.generateStream({
          entryId: finalEntryId!,
          wordCount,
          ...advancedBody,
        })) {
          const result = handleEvent(event);
          if (result === "done" || result === "error") return;
        }
      }

      toast.error("Generation ended unexpectedly. Please try again.");
      setPhase("form");
      setStreamProgress(undefined);
    } catch {
      toast.error("An error occurred during generation");
      setPhase("form");
      setStreamProgress(undefined);
    }
  };

  const heroTitle = useMemo(() => {
    if (phase === "generating") return "Drafting your blog";
    if (phase === "review") return "Review & generate";
    return "Blog generator";
  }, [phase]);

  const heroLead = useMemo(() => {
    if (phase === "generating")
      return "Synthesising live research, your brief, and approved keywords into a publication-ready blog post. Keep this tab open.";
    if (phase === "review")
      return "Confirm the angle. We'll run live SERP research, internal-link discovery, and a premium draft pass before saving.";
    return "Configure the blog angle, audience, and CTA. Ask AI to seed it from your project domain when you're not sure where to start.";
  }, [phase]);

  const hasAnyAhrefsCredits = hasAhrefsH2sCredits || hasAhrefsFaqsCredits;

  return (
    <div className={`relative space-y-10 pb-16 pl-4 pr-4 ${mounted ? "animate-slide-in-right" : ""}`}>
      {isAuditFixMode && (
        <div className="mb-4 flex items-start gap-3 rounded-xl border border-status-warning/30 bg-status-warning/8 px-4 py-3">
          <span className="mt-0.5 shrink-0 rounded-full border border-status-warning/40 bg-status-warning/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-status-warning">
            Enhancing existing blog
          </span>
          <div className="min-w-0">
            <p className="text-[12px] font-semibold text-status-warning leading-snug truncate">{auditTitle || auditUrl}</p>
            <p className="text-[11px] text-text-tertiary mt-0.5">
              Applying surgical fixes from content audit — not a full rewrite.{" "}
              <a href={auditUrl} target="_blank" rel="noopener noreferrer" className="text-brand-action hover:underline underline-offset-2">
                View page →
              </a>
            </p>
          </div>
        </div>
      )}
      {!canGenerateBlog && quota && (
        <div className="text-[14px] text-status-danger font-medium">
          Blog limit reached ({quota.blogs.used}/{quota.blogs.effectiveLimit}). Upgrade your plan to generate more blogs.
        </div>
      )}
      <PageHeader
        title={heroTitle}
        description={heroLead}
        actions={
          phase === "form" ? (
            <div className="flex flex-wrap items-center gap-3">
              <Button
                variant="outline"
                shape="pill"
                size="lg"
                onClick={() => void askAi()}
                disabled={askLoading || !hasAiCredits}
                iconLeft={askLoading ? <Spinner size={14} /> : null}
                title={!hasAiCredits ? "You've exhausted your AI credits. Upgrade to get more." : undefined}
              >
                {askLoading ? "Thinking…" : "Ask AI for a topic"}
              </Button>
              <Button
                variant="action"
                shape="pill"
                size="lg"
                onClick={goReview}
                disabled={!isFormValid || !canGenerateBlog}
                title={
                  !canGenerateBlog
                    ? `Blog limit reached (${quota?.blogs.used}/${quota?.blogs.effectiveLimit}). Upgrade your plan to generate more.`
                    : !isFormValid
                    ? `Required: ${emptyRequiredFields.join(", ")}`
                    : undefined
                }
              >
                Review &amp; continue
              </Button>
            </div>
          ) : phase === "review" ? (
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="secondary" shape="pill" size="lg" onClick={() => setPhase("form")}>
                Back to details
              </Button>
              <Button
                variant="primary"
                shape="pill"
                size="lg"
                onClick={() => void runGeneration()}
                disabled={!canGenerateBlog}
                title={
                  !canGenerateBlog
                    ? `Blog limit reached (${quota?.blogs.used}/${quota?.blogs.effectiveLimit}). Upgrade your plan to generate more.`
                    : undefined
                }
              >
                Generate blog
              </Button>
            </div>
          ) : null
        }
      />

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }} className="mx-auto w-full max-w-4xl">
        {phase !== "generating" ? (
          <StepRow
            steps={[
              { id: "details", label: "Brief & angle" },
              { id: "review", label: "Review & generate" },
            ]}
            activeIndex={phase === "review" ? 1 : 0}
          />
        ) : null}

        {phase === "generating" ? (
          <div className="space-y-4">
            <GenerationProgress
              badgeLabel="Blog"
              title="Building your premium blog"
              lead="Drafting a high-ranking blog post with real citations and your internal links woven in. Watch the stages light up as each step completes."
              stages={streamStages}
              externalProgress={streamProgress}
            />
            <ThinkingPanel thinking={thinkingText} isStreaming={isThinking} />
          </div>
        ) : phase === "review" ? (
          <ReviewView
            topic={topic}
            primaryKeyword={primaryKeyword}
            audience={audience}
            tone={TONES.find(t => t.id === tone)?.label ?? tone}
            wordCount={wordCount}
            goal={goal}
            ctaObjective={ctaObjective}
            secondaryKeywords={secondaryKeywords}
            regionLabel={TARGET_REGIONS.find(r => r.code === region)?.name ?? region}
            languageLabel={LANG_OPTIONS.find(l => l.code === language)?.label ?? language}
            hasBrandPersona={useBrandPersona && !!brandPersona.trim()}
            useAhrefsData={useAhrefsData}
            ahrefsH2sCount={ahrefsH2s.length}
            ahrefsFaqsCount={ahrefsFaqs.length}
            useDeepAnalysis={useDeepAnalysis}
            competitorPagesCount={competitorPages.length}
            customInstructions={customInstructions}
          />
        ) : (
          <ContentForm>
            <ContentFormSection>
              <SectionHeading
                index="01"
                label="Blog brief"
                hint="The angle, who it's for, and what it should accomplish."
              />
              <div className="space-y-5">
                <Field label="Blog topic" required htmlFor="blog-topic">
                  <Input
                    id="blog-topic"
                    inputSize="lg"
                    value={topic}
                    onChange={e => setTopic(e.target.value)}
                    placeholder="e.g. 10 Trends Shaping Recruitment Process Outsourcing in 2026"
                  />
                </Field>
                <ContentFormGrid cols={2}>
                  <Field label="Primary SEO keyword" required htmlFor="blog-keyword">
                    <Input
                      id="blog-keyword"
                      inputSize="lg"
                      value={primaryKeyword}
                      onChange={e => setPrimaryKeyword(e.target.value)}
                      placeholder="recruitment process outsourcing"
                      className={isKeywordTyping ? "ring-2 ring-brand-action/40 border-brand-action/50" : ""}
                    />
                  </Field>
                  <Field label="Target audience" required htmlFor="blog-audience">
                    <Input
                      id="blog-audience"
                      inputSize="lg"
                      value={audience}
                      onChange={e => setAudience(e.target.value)}
                      placeholder="Heads of Talent at 200–2,000 person companies"
                    />
                  </Field>
                </ContentFormGrid>
                <Field
                  label="Supporting / semantic keywords"
                  description="Optional. We weave these naturally across the article — never as a list."
                  htmlFor="blog-secondary-keywords"
                >
                  <KeywordChips
                    id="blog-secondary-keywords"
                    value={secondaryKeywords}
                    onChange={setSecondaryKeywords}
                    placeholder="Type a keyword and press Enter…"
                  />
                </Field>
              </div>
            </ContentFormSection>

            <ContentFormSection>
              <SectionHeading index="02" label="Tone & depth" />
              <div className="space-y-5">
                <Field label="Tone">
                  <ChipChoice options={TONES.map(t => ({ id: t.id, label: t.label }))} value={tone} onChange={setTone} ariaLabel="Tone" />
                </Field>
                <Field label="Target word count">
                  <ChipChoice
                    options={WORD_COUNT_OPTIONS.map(o => ({ id: o.id, label: o.label, hint: o.hint }))}
                    value={String(wordCount)}
                    onChange={val => setWordCount(Number(val))}
                    ariaLabel="Target word count"
                  />
                </Field>
                <ContentFormGrid cols={2}>
                  <Field label="Region" htmlFor="blog-region">
                    <Select id="blog-region" inputSize="lg" value={region} onChange={e => setRegion(e.target.value)}>
                      {TARGET_REGIONS.map(r => (
                        <option key={r.code} value={r.code}>{r.name}</option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Language" htmlFor="blog-language">
                    <Select id="blog-language" inputSize="lg" value={language} onChange={e => setLanguage(e.target.value)}>
                      {LANG_OPTIONS.map(l => (
                        <option key={l.code} value={l.code}>{l.label}</option>
                      ))}
                    </Select>
                  </Field>
                </ContentFormGrid>
              </div>
            </ContentFormSection>

            <ContentFormSection>
              <SectionHeading
                index="03"
                label="Goal & CTA"
                hint="Tell the writer what success looks like — drives the conclusion and CTA."
              />
              <div className="space-y-5">
                <Field label="Reader takeaway / goal" htmlFor="blog-goal">
                  <Textarea
                    id="blog-goal"
                    rows={3}
                    value={goal}
                    onChange={e => setGoal(e.target.value)}
                    placeholder="What should the reader walk away knowing or doing?"
                  />
                </Field>
                <Field label="CTA objective" htmlFor="blog-cta">
                  <Textarea
                    id="blog-cta"
                    rows={3}
                    value={ctaObjective}
                    onChange={e => setCtaObjective(e.target.value)}
                    placeholder="What action should the conclusion steer the reader toward?"
                  />
                </Field>
              </div>
            </ContentFormSection>

            {/* ── Advanced Options ───────────────────────────────────────── */}
            <ContentFormSection>
              <SectionHeading
                index="04"
                label="Advanced options"
                hint="Brand persona, AI intelligence, custom instructions"
              />

              <div className="space-y-3 mt-4">
                  {/* Brand Persona */}
                  <AdvancedOptionRow
                    label="Brand persona"
                    description="Pre-filled from your project settings — voice, values, and description. Edit freely; changes here are one-time and won't update your project."
                    checked={useBrandPersona}
                    onChange={setUseBrandPersona}
                  >
                    <Textarea
                      rows={5}
                      value={brandPersona}
                      onChange={e => setBrandPersona(e.target.value)}
                      placeholder={"Voice: \nValues: \nDescription: "}
                    />
                  </AdvancedOptionRow>

                  {/* Ahrefs Keyword Intelligence */}
                  <AdvancedOptionRow
                    label="Keyword intelligence"
                    description={
                      hasAnyAhrefsCredits
                        ? "Fetch live Ahrefs data for this keyword — top H2 topics and FAQ questions your blog should cover to rank. Uses 1 credit."
                        : "Fetches live Ahrefs H2 and FAQ keyword data to guide blog structure. No credits available — contact your admin."
                    }
                    badge={<ProBadge />}
                    checked={useAhrefsData}
                    onChange={hasAnyAhrefsCredits ? handleAhrefsToggle : () => {}}
                    disabled={!hasAnyAhrefsCredits}
                  >
                    {ahrefsLoading ? (
                      <div className="flex items-center gap-2 text-[12px] text-text-tertiary">
                        <Spinner size={14} />
                        Fetching keyword data from Ahrefs…
                      </div>
                    ) : ahrefsError ? (
                      <p className="text-[12px] text-status-danger">{ahrefsError}</p>
                    ) : (ahrefsH2s.length > 0 || ahrefsFaqs.length > 0) ? (
                      <div className="space-y-3 pt-1">
                        {ahrefsH2s.length > 0 && (
                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-wider text-text-tertiary mb-1.5">
                              H2 keyword targets ({ahrefsH2s.length})
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                              {ahrefsH2s.map((k, i) => (
                                <span key={i} className="inline-flex items-center gap-1 rounded-full border border-border-subtle bg-surface-primary px-2 py-0.5 text-[11px] text-text-secondary">
                                  {k.keyword}
                                  <span className="text-[9px] text-text-tertiary">vol {k.volume}</span>
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                        {ahrefsFaqs.length > 0 && (
                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-wider text-text-tertiary mb-1.5">
                              FAQ questions ({ahrefsFaqs.length})
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                              {ahrefsFaqs.map((k, i) => (
                                <span key={i} className="inline-flex items-center gap-1 rounded-full border border-status-info/20 bg-status-info/5 px-2 py-0.5 text-[11px] text-status-info">
                                  {k.keyword}
                                  <span className="text-[9px] opacity-60">vol {k.volume}</span>
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                        <p className="text-[10px] text-status-success">
                          ✓ These keywords will be woven into the blog's H2 headings and FAQ section.
                        </p>
                      </div>
                    ) : null}
                  </AdvancedOptionRow>

                  {/* Deep Analysis */}
                  <AdvancedOptionRow
                    label="Deep analysis — generate to outrank"
                    description={
                      hasDeepAnalysisCredits
                        ? "We analyse the top 5 ranking pages for your keyword, find their SEO gaps, and use those insights to make your blog outrank them. Uses 1 credit."
                        : "Analyses top-ranking competitor pages to find content gaps your blog will fill. No credits — contact your admin."
                    }
                    badge={<ProBadge />}
                    checked={useDeepAnalysis}
                    onChange={hasDeepAnalysisCredits ? handleDeepAnalysisToggle : () => {}}
                    disabled={!hasDeepAnalysisCredits}
                  >
                    {competitorLoading ? (
                      <div className="flex items-center gap-2 text-[12px] text-text-tertiary">
                        <Spinner size={14} />
                        Finding top-ranking pages via DataForSEO…
                      </div>
                    ) : competitorError ? (
                      <p className="text-[12px] text-status-danger">{competitorError}</p>
                    ) : competitorPages.length > 0 ? (
                      <div className="space-y-2 pt-1">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-text-tertiary">
                          Pages we'll analyse &amp; outrank
                        </p>
                        <div className="space-y-1.5">
                          {competitorPages.map((p, i) => (
                            <div key={i} className="flex items-center gap-3 rounded-lg border border-border-subtle bg-surface-primary px-3 py-2">
                              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-action/10 text-[9px] font-bold text-brand-action">
                                {p.position}
                              </span>
                              <div className="flex-1 min-w-0">
                                <p className="text-[12px] font-medium text-text-primary truncate">{p.title}</p>
                                <p className="text-[10px] text-text-tertiary">{p.domain}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                        <p className="text-[10px] text-status-success">
                          ✓ At generation time we'll scrape these pages, find what they're missing, and use those gaps to make your blog rank higher.
                        </p>
                      </div>
                    ) : null}
                  </AdvancedOptionRow>

                  {/* Custom Instructions */}
                  <div className="rounded-xl border border-border-subtle bg-surface-elevated p-4">
                    <p className="text-[13px] font-semibold text-text-primary mb-0.5">Custom instructions</p>
                    <p className="text-[11px] text-text-tertiary mb-3">
                      Specific things the AI must include, avoid, or follow while writing this blog.
                    </p>
                    <Textarea
                      rows={3}
                      value={customInstructions}
                      onChange={e => setCustomInstructions(e.target.value)}
                      placeholder="e.g. Include a comparison table. Avoid mentioning competitor X. Write in first-person plural."
                    />
                  </div>
              </div>
            </ContentFormSection>

            {recentBlogs.length > 0 ? (
              <ContentFormSection>
                <SectionHeading index="05" label="Recent blogs" hint="Continue from a draft or open the previewer." />
                <div className="grid gap-3 sm:grid-cols-2">
                  {recentBlogs.map(r => (
                    <ProjectNavLink
                      key={r.id}
                      href={`${studioBase}/blogs/${r.id}`}
                      className="group flex flex-col gap-1 rounded-card border border-border-subtle bg-surface-elevated p-4 transition-colors hover:border-border-strong"
                    >
                      <span className="text-[11px] font-mono uppercase tracking-widest text-text-tertiary">
                        {new Date(r.updated_at).toLocaleDateString()}
                      </span>
                      <span className="text-[14px] font-semibold text-text-primary line-clamp-2">{r.title}</span>
                      <span className="mt-1 inline-flex flex-wrap gap-2 text-[11px] text-text-tertiary">
                        <span>{r.word_count.toLocaleString()} words</span>
                        <span>·</span>
                        <span>{r.target_keyword || "no primary keyword"}</span>
                      </span>
                    </ProjectNavLink>
                  ))}
                </div>
              </ContentFormSection>
            ) : null}
          </ContentForm>
        )}
      </motion.div>
    </div>
  );
}

function ReviewView({
  topic, primaryKeyword, audience, tone, wordCount, goal, ctaObjective,
  secondaryKeywords, regionLabel, languageLabel,
  hasBrandPersona, useAhrefsData, ahrefsH2sCount, ahrefsFaqsCount,
  useDeepAnalysis, competitorPagesCount, customInstructions,
}: {
  topic: string;
  primaryKeyword: string;
  audience: string;
  tone: string;
  wordCount: number;
  goal: string;
  ctaObjective: string;
  secondaryKeywords: string[];
  regionLabel: string;
  languageLabel: string;
  hasBrandPersona: boolean;
  useAhrefsData: boolean;
  ahrefsH2sCount: number;
  ahrefsFaqsCount: number;
  useDeepAnalysis: boolean;
  competitorPagesCount: number;
  customInstructions: string;
}) {
  const rows: { label: string; value: React.ReactNode }[] = [
    { label: "Topic", value: topic },
    { label: "Primary keyword", value: primaryKeyword },
    { label: "Audience", value: audience },
    { label: "Tone", value: tone },
    { label: "Region", value: regionLabel },
    { label: "Language", value: languageLabel },
  ];
  if (secondaryKeywords.length) {
    rows.push({
      label: "Supporting keywords",
      value: (
        <span className="flex flex-wrap gap-1.5">
          {secondaryKeywords.map(k => (
            <span key={k} className="rounded-full border border-border-subtle bg-surface-secondary px-2 py-0.5 text-[11px] text-text-secondary">
              {k}
            </span>
          ))}
        </span>
      ),
    });
  }

  const activeFeatures: string[] = [];
  if (hasBrandPersona) activeFeatures.push("Brand persona");
  if (useAhrefsData) activeFeatures.push(`Keyword intelligence (${ahrefsH2sCount} H2s, ${ahrefsFaqsCount} FAQs)`);
  if (useDeepAnalysis) activeFeatures.push(`Deep analysis (${competitorPagesCount} pages)`);
  if (customInstructions.trim()) activeFeatures.push("Custom instructions");

  return (
    <div className="space-y-8">
      <Card padding="lg" elevation="raised">
        <SectionHeading index="01" label="Blog brief summary" />
        <dl className="grid gap-5 sm:grid-cols-2">
          {rows.map(r => (
            <div key={r.label}>
              <dt className="font-mono text-[10px] font-medium uppercase tracking-widest text-text-tertiary">{r.label}</dt>
              <dd className="mt-1 wrap-break-word text-[14px] font-medium text-text-primary">{r.value}</dd>
            </div>
          ))}
          <div>
            <dt className="font-mono text-[10px] font-medium uppercase tracking-widest text-text-tertiary">Length</dt>
            <dd className="mt-1 wrap-break-word text-[14px] font-medium text-text-primary">{wordCount} words</dd>
          </div>
        </dl>
      </Card>

      <Card padding="md" elevation="flat">
        <SectionHeading index="02" label="Outcome the AI is optimising for" />
        <p className="text-[14px] leading-relaxed text-text-secondary">
          <strong className="text-text-primary">Reader goal:</strong> {goal}
        </p>
        <p className="mt-3 text-[14px] leading-relaxed text-text-secondary">
          <strong className="text-text-primary">CTA objective:</strong> {ctaObjective}
        </p>
        {activeFeatures.length > 0 && (
          <div className="mt-4 rounded-xl border border-brand-action/20 bg-brand-action/5 p-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-brand-action mb-2">Active enhancements</p>
            <ul className="space-y-1">
              {activeFeatures.map((f, i) => (
                <li key={i} className="flex items-center gap-1.5 text-[12px] text-text-primary">
                  <svg className="h-3 w-3 shrink-0 text-brand-action" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                  </svg>
                  {f}
                </li>
              ))}
            </ul>
          </div>
        )}
        <p className="mt-4 text-[12px] leading-relaxed text-text-tertiary">
          On generate, the engine pulls live SERP context for the primary keyword, drops in your internal link
          pool from the project brief, and runs a premium AI pass. You&apos;ll land on the previewer when it&apos;s done.
        </p>
      </Card>
    </div>
  );
}
