"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
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
  AskAiButton,
  TopicSuggestionChips,
  useAiFillTracker,
} from "@/components/content-generator/shared";
import { useProject, qk, DEFAULT_QUERY_OPTIONS } from "@/lib/query";
import { contentGeneratorApi, type ContentStudioHistoryRow } from "@/frontend/api/content-generator";
import { TARGET_REGIONS } from "@/lib/types";
import {
  suggestContentTopicAction,
  suggestTopicIdeasAction,
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
import { useAppDispatch } from "@/lib/redux/hooks";
import { calendarRefreshBump } from "@/lib/redux/keyword-workspace-slice";
import { useFormDraft } from "@/hooks/useFormDraft";
import { useNotify } from "@/hooks/useNotify";
import { startBlogGeneration } from "@/app/actions/blog-jobs-actions";

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
  const dispatch = useAppDispatch();
  const { canGenerateBlog, quota, hasAiCredits, hasAhrefsH2sCredits, hasAhrefsFaqsCredits, hasDeepAnalysisCredits } = useUserQuota();
  const base = `/projects/${projectId}`;
  const studioBase = `${base}/content-generator`;

  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  // Tracks whether the user is still on this drafting page. Generation keeps
  // running (the fetch stays alive through in-app navigation), so on completion
  // we only auto-open the finished blog if the user is STILL here — otherwise we
  // notify with a toast instead of yanking them off whatever page they moved to.
  const isOnPageRef = useRef(true);
  useEffect(() => {
    isOnPageRef.current = true;
    return () => { isOnPageRef.current = false; };
  }, []);

  // Notification-center wiring: the durable job's id keys its "running" entry so
  // the TaskNotificationWatcher can upgrade it to "ready"/"failed" + OS ping.
  const notify = useNotify();
  const submittingRef = useRef(false);

  const entryId = searchParams?.get("entryId");

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

  // True when this generator was opened from an already-scheduled calendar
  // entry (Generate button on the calendar / repair row). Used to warn the
  // user that editing the keyword here retargets that calendar slot instead
  // of silently generating the old keyword underneath their edits.

  const [phase, setPhase] = useState<Phase>("form");
  const [submitting, setSubmitting] = useState(false);
  const [topic, setTopic] = useState("");
  const [secondaryKeywords, setSecondaryKeywords] = useState<string[]>([]);
  const [audience, setAudience] = useState("");
  const [tone, setTone] = useState<(typeof TONES)[number]["id"]>("premium-educational");
  const [goal, setGoal] = useState("");
  const [ctaObjective, setCtaObjective] = useState("");
  const [wordCount, setWordCount] = useState<number>(2500);
  const [customWordCount, setCustomWordCount] = useState<string>("");
  const [region, setRegion] = useState("us");
  const [language, setLanguage] = useState("en");
  const [askLoading, setAskLoading] = useState(false);
  const [topicIdeasLoading, setTopicIdeasLoading] = useState(false);
  const [topicSuggestions, setTopicSuggestions] = useState<string[]>([]);
  const { isAiOwned, markUserOwned, canAutoFill, markAiFilled, fillFlashClass } = useAiFillTracker();
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

  // ── Draft persistence ──────────────────────────────────────────────────
  // Restore an in-progress form when the user navigates away and comes back
  // (or refreshes). Only active for a plain, fresh session — when the generator
  // is opened from a calendar entry or an audit-fix link, those URL-driven flows
  // own the form and we don't want a stale draft fighting them.
  const hasUrlContext = !!entryId || !!auditUrl || !!keywordParam;
  const { clearDraft, hadDraft } = useFormDraft(
    "blog",
    projectId,
    {
      primaryKeyword, topic, secondaryKeywords, audience, tone, goal, ctaObjective,
      wordCount, customWordCount, region, language, useBrandPersona, brandPersona,
      useAhrefsData, useDeepAnalysis, customInstructions,
    },
    {
      enabled: phase === "form" && !hasUrlContext,
      apply: (d) => {
        if (hasUrlContext) return;
        if (typeof d.primaryKeyword === "string" && d.primaryKeyword) setPrimaryKeyword(d.primaryKeyword);
        if (typeof d.topic === "string") setTopic(d.topic);
        if (Array.isArray(d.secondaryKeywords)) setSecondaryKeywords(d.secondaryKeywords as string[]);
        if (typeof d.audience === "string") setAudience(d.audience);
        if (typeof d.tone === "string") setTone(d.tone as (typeof TONES)[number]["id"]);
        if (typeof d.goal === "string") setGoal(d.goal);
        if (typeof d.ctaObjective === "string") setCtaObjective(d.ctaObjective);
        if (typeof d.wordCount === "number") setWordCount(d.wordCount);
        if (typeof d.customWordCount === "string") setCustomWordCount(d.customWordCount);
        if (typeof d.region === "string") setRegion(d.region);
        if (typeof d.language === "string") setLanguage(d.language);
        if (typeof d.useBrandPersona === "boolean") setUseBrandPersona(d.useBrandPersona);
        if (typeof d.brandPersona === "string") setBrandPersona(d.brandPersona);
        if (typeof d.useAhrefsData === "boolean") setUseAhrefsData(d.useAhrefsData);
        if (typeof d.useDeepAnalysis === "boolean") setUseDeepAnalysis(d.useDeepAnalysis);
        if (typeof d.customInstructions === "string") setCustomInstructions(d.customInstructions);
      },
    },
  );
  // When a draft was restored, skip the project auto-seed below so it doesn't
  // overwrite the user's saved region / language / brand persona.
  const draftRestored = hadDraft && !hasUrlContext;

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
    // A restored draft already carries the user's region / language / brand
    // persona — don't clobber it with project defaults.
    if (draftRestored) return;
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

  // Custom word count (if provided) overrides the preset chips. Clamped to a
  // sane range so the value that reaches the generation prompt is always valid.
  const effectiveWordCount = useMemo(() => {
    const parsed = parseInt(customWordCount, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) return wordCount;
    return Math.min(6000, Math.max(500, parsed));
  }, [customWordCount, wordCount]);

  // Auto-fill: completes only fields the user left empty (or that a previous
  // auto-fill wrote). User-typed values are passed as seeds and never replaced.
  const askAi = async () => {
    setAskLoading(true);
    try {
      const res = await suggestContentTopicAction(projectId, {
        contentType: "blog",
        avoidPhrases: secondaryKeywords,
        seedKeyword: primaryKeyword.trim() && !isAiOwned("keyword") ? primaryKeyword.trim() : undefined,
        seedTopic: topic.trim() && !isAiOwned("topic") ? topic.trim() : undefined,
      });
      if (!res.success) {
        toast.error(res.error);
        return;
      }
      const filled: string[] = [];
      if (res.topic && canAutoFill("topic", topic)) { setTopic(res.topic); filled.push("topic"); }
      if (res.primary_keyword && canAutoFill("keyword", primaryKeyword)) { setPrimaryKeyword(res.primary_keyword); filled.push("keyword"); }
      if (res.semantic_keywords.length && canAutoFill("secondaryKeywords", secondaryKeywords)) {
        setSecondaryKeywords(res.semantic_keywords.slice(0, 8));
        filled.push("secondaryKeywords");
      }
      if (res.goal && canAutoFill("goal", goal)) { setGoal(res.goal); filled.push("goal"); }
      if (res.cta_objective && canAutoFill("cta", ctaObjective)) { setCtaObjective(res.cta_objective); filled.push("cta"); }
      markAiFilled(filled);
      setTopicSuggestions(Array.from(new Set([res.topic, ...(res.alternate_topics ?? [])].filter(Boolean))));
      toast.success(
        filled.length
          ? `AI filled ${filled.length} field${filled.length === 1 ? "" : "s"} — your entries were kept`
          : "Topic ideas ready — pick one below the topic field"
      );
    } finally {
      setAskLoading(false);
    }
  };

  // "More ideas" under the topic field — ONLY refreshes the topic suggestion
  // chips. Never touches the keyword, audience, goal, CTA, or any other
  // field, regardless of AI-fill ownership. Uses whatever is currently in
  // the form (plus company/project context) purely as inspiration.
  const refreshTopicIdeas = async () => {
    setTopicIdeasLoading(true);
    try {
      const res = await suggestTopicIdeasAction(projectId, {
        contentType: "blog",
        seedKeyword: primaryKeyword.trim() || undefined,
        audience: audience.trim() || undefined,
        tone: TONES.find(t => t.id === tone)?.label,
        goal: goal.trim() || undefined,
        ctaObjective: ctaObjective.trim() || undefined,
        secondaryKeywords,
        avoidTopics: topicSuggestions,
      });
      if (!res.success) { toast.error(res.error); return; }
      setTopicSuggestions(res.topics);
    } finally {
      setTopicIdeasLoading(false);
    }
  };

  const goReview = () => {
    if (!isFormValid) { toast.error(`Please fill in: ${emptyRequiredFields.join(", ")}`); return; }
    setPhase("review");
  };

  const runGeneration = async () => {
    if (submittingRef.current) return;
    const genLabel = topic.trim() || primaryKeyword.trim() || "your blog";

    // Advanced options → durable-job payload (same shape the stream route used).
    const advancedBody = {
      brandPersona: useBrandPersona && brandPersona.trim() ? brandPersona.trim() : undefined,
      useAhrefsData: useAhrefsData && (ahrefsH2s.length > 0 || ahrefsFaqs.length > 0),
      ahrefsH2s: useAhrefsData ? ahrefsH2s : [],
      ahrefsFaqs: useAhrefsData ? ahrefsFaqs : [],
      useDeepAnalysis: useDeepAnalysis && competitorPages.length > 0,
      deepAnalysisPages: useDeepAnalysis ? competitorPages : [],
      customInstructions: customInstructions.trim() || undefined,
    };

    // Enqueue a DURABLE background job. Generation now runs server-side to
    // completion regardless of the client — the user can refresh, close the tab,
    // or queue several blogs at once. The TaskNotificationWatcher (mounted in the
    // project shell) polls the job and fires the notification + OS ping on
    // completion, wherever the user has navigated to.
    submittingRef.current = true;
    setSubmitting(true);
    try {
      const res = await startBlogGeneration(
        projectId,
        {
          ...(entryId ? { entryId } : {}),
          keyword: primaryKeyword,
          topic,
          audience,
          tone: TONES.find(t => t.id === tone)?.label || tone,
          goal,
          ctaObjective,
          secondaryKeywords,
          wordCount: effectiveWordCount,
          ...advancedBody,
          label: genLabel,
        },
        `blog:${projectId}:${entryId || primaryKeyword || "kw"}:${Date.now()}`,
      );

      if (!res.success || !res.jobId) {
        toast.error(res.error || "Could not start generation. Please try again.");
        return;
      }

      // Form no longer needed — clear the saved draft and register the running
      // job so the bell shows it immediately (the watcher upgrades it to ready).
      clearDraft();
      notify({
        key: `task:${res.jobId}`,
        status: "running",
        title: "Generating blog…",
        body: genLabel,
        projectId,
        os: false,
      });

      // Refresh the surfaces that will show the finished blog once it lands.
      void queryClient.invalidateQueries({ queryKey: qk.contentStudioHistory(projectId) });
      void queryClient.invalidateQueries({ queryKey: qk.calendarWithBlogs(projectId) });

      toast.success(
        "Generating in the background — we'll notify you when it's ready. Feel free to keep working or queue another.",
        { duration: 6000 },
      );
      setPhase("form");
    } catch {
      toast.error("Could not start generation. Please try again.");
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
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
    return "Fill in what you know — a keyword, a topic, or nothing at all. Auto-fill with AI completes the empty fields and never touches what you typed.";
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
              <AskAiButton
                onClick={() => void askAi()}
                loading={askLoading}
                disabled={!hasAiCredits}
                disabledReason="You've exhausted your AI credits. Upgrade to get more."
              />
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
                disabled={!canGenerateBlog || submitting}
                title={
                  !canGenerateBlog
                    ? `Blog limit reached (${quota?.blogs.used}/${quota?.blogs.effectiveLimit}). Upgrade your plan to generate more.`
                    : undefined
                }
              >
                {submitting ? "Starting…" : "Generate blog"}
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
            wordCount={effectiveWordCount}
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
                    onChange={e => { setTopic(e.target.value); markUserOwned("topic"); }}
                    placeholder="e.g. 10 Trends Shaping Recruitment Process Outsourcing in 2026"
                    className={fillFlashClass("topic")}
                  />
                  <TopicSuggestionChips
                    suggestions={topicSuggestions}
                    activeTopic={topic}
                    onPick={t => setTopic(t)}
                    onReload={() => void refreshTopicIdeas()}
                    loading={topicIdeasLoading}
                  />
                </Field>
                <ContentFormGrid cols={2}>
                  <Field label="Primary SEO keyword" required htmlFor="blog-keyword">
                    <Input
                      id="blog-keyword"
                      inputSize="lg"
                      value={primaryKeyword}
                      onChange={e => { setPrimaryKeyword(e.target.value); markUserOwned("keyword"); }}
                      placeholder="recruitment process outsourcing"
                      className={`${isKeywordTyping ? "ring-2 ring-brand-action/40 border-brand-action/50" : ""} ${fillFlashClass("keyword")}`}
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
                  <div className={`rounded-lg ${fillFlashClass("secondaryKeywords")}`}>
                    <KeywordChips
                      id="blog-secondary-keywords"
                      value={secondaryKeywords}
                      onChange={v => { setSecondaryKeywords(v); markUserOwned("secondaryKeywords"); }}
                      placeholder="Type a keyword and press Enter…"
                    />
                  </div>
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
                  <div className="space-y-3">
                    <ChipChoice
                      options={WORD_COUNT_OPTIONS.map(o => ({ id: o.id, label: o.label, hint: o.hint }))}
                      value={customWordCount ? "" : String(wordCount)}
                      onChange={val => { setWordCount(Number(val)); setCustomWordCount(""); }}
                      ariaLabel="Target word count"
                    />
                    <Input
                      id="blog-custom-word-count"
                      type="number"
                      inputSize="lg"
                      min={500}
                      max={6000}
                      step={100}
                      placeholder="Custom — e.g. 800 for a short post, or leave blank to use a preset"
                      value={customWordCount}
                      onChange={e => setCustomWordCount(e.target.value)}
                      className={customWordCount ? "ring-2 ring-brand-action/40 border-brand-action/50" : ""}
                    />
                    {customWordCount ? (
                      <p className="text-[11px] text-brand-action">
                        Custom target: ~{effectiveWordCount.toLocaleString()} words (overrides the presets above)
                      </p>
                    ) : null}
                  </div>
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
                    onChange={e => { setGoal(e.target.value); markUserOwned("goal"); }}
                    placeholder="What should the reader walk away knowing or doing?"
                    className={fillFlashClass("goal")}
                  />
                </Field>
                <Field label="CTA objective" htmlFor="blog-cta">
                  <Textarea
                    id="blog-cta"
                    rows={3}
                    value={ctaObjective}
                    onChange={e => { setCtaObjective(e.target.value); markUserOwned("cta"); }}
                    placeholder="What action should the conclusion steer the reader toward?"
                    className={fillFlashClass("cta")}
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
