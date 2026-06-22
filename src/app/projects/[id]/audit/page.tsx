"use client";

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { contentAuditApi, type ContentAuditHistoryItem } from "@/frontend/api/content-audit";
import { calendarApi } from "@/frontend/api/calendar";
import { blogsApi } from "@/frontend/api/blogs";
import type { ContentAuditReport, ContentAuditScores } from "@/lib/content-audit-studio";
import type { ContentHealthAuditSnapshot } from "@/lib/content-health-calendar";
import type { BlogAuditAnalysis } from "@/lib/content-audit";
import { CalendarDatePicker } from "@/components/CalendarDatePicker";
import {
  ScoreRing, ScoreCard, SeverityChip, CategoryBadge, RubricStatus,
  StepIndicator, EmptyState, Spinner, KeywordVerdictChip, scoreGrade, scoreColor,
} from "./_shared/ch-ui";

// ─── Analysis steps ───────────────────────────────────────────────────────────

const STEPS = [
  { label: "Reading content" },
  { label: "Analyzing keyword" },
  { label: "Checking competitors" },
  { label: "Scoring with AI" },
];

// ─── Score dimension config ───────────────────────────────────────────────────

interface ScoreDim {
  key: keyof Omit<ContentAuditScores, "overall">;
  label: string;
  description: string;
  icon: React.ReactNode;
}

const SCORE_DIMS: ScoreDim[] = [
  {
    key: "seo",
    label: "SEO Score",
    description: "On-page optimisation: title keyword, meta description, heading structure, schema markup, and link count.",
    icon: (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
        <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
      </svg>
    ),
  },
  {
    key: "geo",
    label: "GEO Score",
    description: "Generative Engine Optimization: direct answer first, cited sources, factual clarity — optimised for AI like ChatGPT and Perplexity.",
    icon: (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
        <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 18a8 8 0 1 1 8-8 8 8 0 0 1-8 8z" />
        <path d="M12 6v6l4 2" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    key: "aeo",
    label: "AEO Score",
    description: "Answer Engine Optimization: FAQ section, question-style headings, structured data, voice-search readiness.",
    icon: (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
      </svg>
    ),
  },
  {
    key: "content_quality",
    label: "Content Quality",
    description: "Depth, structure, usefulness, real examples vs filler text, and overall writing quality.",
    icon: (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9z" />
      </svg>
    ),
  },
  {
    key: "keyword_relevance",
    label: "Keyword Relevance",
    description: "Is your primary keyword still trending? Does it have search volume? Is it worth competing for?",
    icon: (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M7 20 l4-16 m2 16 l4-16 M6 9h14 M4 15h14" />
      </svg>
    ),
  },
  {
    key: "freshness",
    label: "Freshness Score",
    description: "How current is this content? Detects publish date, outdated statistics, and stale context.",
    icon: (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />
      </svg>
    ),
  },
];

const MAX_UPLOAD_CHARS = 200_000;

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ContentAuditStudioPage() {
  const { id: projectId } = useParams<{ id: string }>();

  const [inputMode, setInputMode] = useState<"url" | "upload">("url");
  const [url, setUrl] = useState("");
  const [uploadedContent, setUploadedContent] = useState("");
  const [uploadedName, setUploadedName] = useState("");

  const [analyzing, setAnalyzing] = useState(false);
  const [analysisStep, setAnalysisStep] = useState(-1);
  const [error, setError] = useState("");
  const [report, setReport] = useState<ContentAuditReport | null>(null);
  const [reportSource, setReportSource] = useState<"url" | "upload">("url");
  const [history, setHistory] = useState<ContentAuditHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"issues" | "rubric" | "competitors">("issues");

  // Shared calendar entry between Generate + Schedule (avoids duplicate entries)
  const [entryId, setEntryId] = useState<string | null>(null);
  const [scheduledDate, setScheduledDate] = useState<string | null>(null);
  const [scheduleSaving, setScheduleSaving] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduledDates, setScheduledDates] = useState<Set<string>>(new Set());

  // Generation
  const [generating, setGenerating] = useState(false);
  const [genStage, setGenStage] = useState("");
  const [generatedBlogId, setGeneratedBlogId] = useState<string | null>(null);
  const [generateError, setGenerateError] = useState("");

  const stepTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const loadHistory = useCallback(async () => {
    if (!projectId) return;
    setHistoryLoading(true);
    try {
      const res = await contentAuditApi.history(projectId);
      if (res.success) setHistory(res.items);
    } finally {
      setHistoryLoading(false);
    }
  }, [projectId]);

  const loadScheduledDates = useCallback(async () => {
    if (!projectId) return;
    try {
      const res = await calendarApi.withBlogs(projectId);
      if (res.success) setScheduledDates(new Set(res.data.map(e => String(e.scheduled_date).slice(0, 10))));
    } catch { /* non-fatal */ }
  }, [projectId]);

  useEffect(() => { void loadHistory(); void loadScheduledDates(); }, [loadHistory, loadScheduledDates]);

  const startStepAnimation = () => {
    setAnalysisStep(0);
    let step = 0;
    stepTimerRef.current = setInterval(() => {
      step = Math.min(step + 1, STEPS.length - 1);
      setAnalysisStep(step);
    }, 8000);
  };
  const stopStepAnimation = () => {
    if (stepTimerRef.current) { clearInterval(stepTimerRef.current); stepTimerRef.current = null; }
    setAnalysisStep(-1);
  };

  const resetPostAuditState = () => {
    setGeneratedBlogId(null);
    setGenerateError("");
    setGenStage("");
    setEntryId(null);
    setScheduledDate(null);
  };

  const handleAnalyze = async (targetUrl?: string) => {
    resetPostAuditState();

    if (inputMode === "upload") {
      if (uploadedContent.trim().length < 160) {
        setError("Uploaded content is too short to audit (need ~160+ characters).");
        return;
      }
      setError("");
      setReport(null);
      setAnalyzing(true);
      startStepAnimation();
      // Synthetic stable URL so re-auditing the same file updates the same row
      const syntheticUrl = `upload://${projectId}/${uploadedName || "pasted-content"}`;
      try {
        const res = await contentAuditApi.analyze(projectId, syntheticUrl, {
          uploadedContent: uploadedContent.trim(),
          uploadedTitle: uploadedName || undefined,
        });
        if (!res.success || !res.report) { setError(res.error ?? "Analysis failed. Please try again."); return; }
        setReport(res.report);
        setReportSource("upload");
        setActiveTab("issues");
        void loadHistory();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Unexpected error. Please try again.");
      } finally {
        setAnalyzing(false);
        stopStepAnimation();
      }
      return;
    }

    const auditUrl = (targetUrl ?? url).trim();
    if (!auditUrl) { setError("Please enter a URL to audit."); inputRef.current?.focus(); return; }
    if (!/^https?:\/\//i.test(auditUrl)) { setError("Please include https:// in the URL."); return; }

    setError("");
    setReport(null);
    setAnalyzing(true);
    startStepAnimation();
    try {
      const res = await contentAuditApi.analyze(projectId, auditUrl);
      if (!res.success || !res.report) { setError(res.error ?? "Analysis failed. Please try again."); return; }
      setReport(res.report);
      setReportSource("url");
      setActiveTab("issues");
      void loadHistory();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unexpected error. Please try again.");
    } finally {
      setAnalyzing(false);
      stopStepAnimation();
    }
  };

  const handleFile = async (file: File) => {
    if (file.size > 5 * 1024 * 1024) { setError("File is too large (max 5 MB)."); return; }
    try {
      const text = await file.text();
      setUploadedContent(text.slice(0, MAX_UPLOAD_CHARS));
      setUploadedName(file.name);
      setError("");
    } catch {
      setError("Could not read that file. Try a .txt, .md, or .html file, or paste the content.");
    }
  };

  // Map audit report → snapshot used by the repair pipeline
  const buildSnapshot = (r: ContentAuditReport): ContentHealthAuditSnapshot => ({
    version: 2,
    capturedAt: r.analyzed_at,
    url: r.url,
    title: r.title,
    health_score: r.scores.overall,
    primary_keyword: r.primary_keyword,
    word_count: r.word_count,
    analysis: {
      page_status: r.page_status,
      primary_keyword: r.primary_keyword,
      secondary_keywords: r.secondary_keywords,
      summary: r.summary,
      plain_language_verdict: r.plain_language_verdict,
      issues: r.issues.map(i => ({
        severity: i.severity, category: i.category, label: i.title,
        detail: i.detail, fix: i.fix, why_it_matters: i.impact,
      })),
      quality_rubric: r.quality_rubric.map(row => ({ label: row.label, status: row.status, detail: row.detail })),
      content_gaps: r.revamp_brief?.missing_topics ?? [],
      internal_link_opportunities: [],
      keyword_demand: r.keyword_data
        ? { keyword: r.keyword_data.keyword, verdict: r.keyword_data.verdict, monthly_volume: r.keyword_data.volume }
        : undefined,
      llm_quality_score: r.scores.content_quality,
      publish_date_estimate: r.publish_date_detected ?? undefined,
      analyze_page_meta: { sourced_from_analyze_page: true },
    } as unknown as BlogAuditAnalysis,
    generation_mode: "repair",
    scheduled_from: "analyze_content",
  });

  // Create (once) the calendar entry that both Generate and Schedule reuse.
  const ensureEntry = useCallback(async (): Promise<{ id: string; date: string } | { error: string }> => {
    if (entryId) return { id: entryId, date: scheduledDate ?? "" };
    if (!report) return { error: "No audit to schedule." };
    const res = await calendarApi.addContentHealth(projectId, {
      focusKeyword: report.revamp_brief?.target_keyword || report.primary_keyword || report.title,
      auditUrl: report.url,
      contentHealthAudit: buildSnapshot(report) as unknown as Record<string, unknown>,
    });
    if (!res.success || !res.data) {
      return { error: (res as { error?: string }).error ?? "Could not add to calendar." };
    }
    const date = (res as { scheduled_date?: string }).scheduled_date ?? String(res.data.scheduled_date).slice(0, 10);
    setEntryId(res.data.id);
    void loadScheduledDates();
    return { id: res.data.id, date };
  }, [entryId, scheduledDate, report, projectId, loadScheduledDates]);

  const handleGenerate = async () => {
    if (!report) return;
    setGenerating(true);
    setGenerateError("");
    setGenStage("Adding to calendar…");
    try {
      const ensured = await ensureEntry();
      if ("error" in ensured) { setGenerateError(ensured.error); return; }

      setGenStage("Starting generation…");
      let blogId: string | null = null;
      for await (const ev of blogsApi.generateStream({
        entryId: ensured.id,
        wordCount: report.revamp_brief?.recommended_word_count ?? 2500,
      })) {
        if (ev.event === "stage") setGenStage(ev.detail ?? ev.stage);
        else if (ev.event === "done") { blogId = ev.blogId; }
        else if (ev.event === "error") { setGenerateError(ev.message || "Generation failed."); return; }
      }
      if (blogId) {
        setGeneratedBlogId(blogId);
        void loadHistory();
      } else {
        setGenerateError("Generation finished without returning a blog. Check Content History.");
      }
    } catch (e) {
      setGenerateError(e instanceof Error ? e.message : "Unexpected error during generation.");
    } finally {
      setGenerating(false);
      setGenStage("");
    }
  };

  const handleSchedule = async () => {
    if (!report) return;
    setScheduleSaving(true);
    try {
      const ensured = await ensureEntry();
      if ("error" in ensured) { setGenerateError(ensured.error); return; }
      setScheduledDate(ensured.date);
    } finally {
      setScheduleSaving(false);
    }
  };

  const handleReschedule = async (date: string) => {
    if (!entryId) return;
    setScheduleSaving(true);
    try {
      const res = await calendarApi.rescheduleEntry(projectId, { entryId, date });
      if (res.success) { setScheduledDate(date); void loadScheduledDates(); }
    } finally {
      setScheduleSaving(false);
      setScheduleOpen(false);
    }
  };

  const openHistoryItem = (item: ContentAuditHistoryItem) => {
    if (!item.report) { setUrl(item.url); setInputMode("url"); void handleAnalyze(item.url); return; }
    resetPostAuditState();
    setUrl(item.url);
    setReport(item.report as unknown as ContentAuditReport);
    setReportSource(item.source ?? "url");
    setActiveTab("issues");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="relative space-y-6 pb-20 -mt-6 lg:-mt-8">

      {/* ── Sticky header (matches Content Studio header) ── */}
      <div className="sticky -top-6 lg:-top-8 z-20 -mx-6 lg:-mx-8 border-b border-border-subtle bg-surface-primary/95 px-6 lg:px-8 pb-8 pt-6 lg:pt-8 backdrop-blur-sm">
        <div className="mx-auto max-w-4xl">
          <h1 className="text-[26px] font-bold tracking-tight text-text-primary">Content Audit Studio</h1>
          <p className="mt-1 text-[14px] text-text-tertiary leading-relaxed">
            Audit any blog by URL or uploaded content — SEO, GEO, AEO scores, competitor insights, and one-click enhanced regeneration.
          </p>
        </div>
      </div>

      {/* All content shares one max-width so blocks line up */}
      <div className="mx-auto max-w-4xl space-y-6">

        {/* ── Input card ── */}
        <div className="rounded-[20px] border border-border-subtle bg-surface-elevated p-6 shadow-sm">
          {/* Mode toggle */}
          <div className="mb-4 inline-flex rounded-[10px] border border-border-subtle bg-surface-secondary p-0.5">
            {(["url", "upload"] as const).map(m => (
              <button
                key={m}
                type="button"
                onClick={() => { setInputMode(m); setError(""); }}
                className={`h-8 px-4 rounded-[8px] text-[12px] font-semibold transition-all ${
                  inputMode === m ? "bg-surface-elevated text-text-primary shadow-sm" : "text-text-tertiary hover:text-text-primary"
                }`}
              >
                {m === "url" ? "Audit a URL" : "Upload content"}
              </button>
            ))}
          </div>

          {inputMode === "url" ? (
            <>
              <label className="block text-[13px] font-semibold text-text-secondary mb-3">Blog or article URL to audit</label>
              <div className="flex gap-3">
                <div className="relative flex-1">
                  <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-tertiary pointer-events-none">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244" />
                    </svg>
                  </div>
                  <input
                    ref={inputRef}
                    type="url"
                    value={url}
                    onChange={e => setUrl(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter" && !analyzing) void handleAnalyze(); }}
                    placeholder="https://yoursite.com/blog/your-post"
                    disabled={analyzing}
                    className="w-full h-11 pl-10 pr-4 rounded-[12px] border border-border-subtle bg-surface-primary text-[14px] text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-brand-violet/50 focus:shadow-[0_0_0_3px_rgba(99,102,241,0.08)] disabled:opacity-50 transition-all"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => void handleAnalyze()}
                  disabled={analyzing || !url.trim()}
                  className="h-11 px-6 rounded-[12px] bg-brand-violet text-white text-[13px] font-semibold hover:bg-brand-violet/90 disabled:opacity-50 transition-all shrink-0 flex items-center gap-2"
                >
                  {analyzing ? <><Spinner size={14} /> Analyzing…</> : "Audit this page"}
                </button>
              </div>
            </>
          ) : (
            <>
              <label className="block text-[13px] font-semibold text-text-secondary mb-3">Upload or paste your content</label>
              {!uploadedContent ? (
                <div
                  onClick={() => fileRef.current?.click()}
                  onDragOver={e => e.preventDefault()}
                  onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) void handleFile(f); }}
                  className="cursor-pointer rounded-[12px] border-2 border-dashed border-border-strong bg-surface-secondary/40 px-6 py-10 text-center hover:border-brand-violet/50 transition-colors"
                >
                  <svg className="mx-auto mb-3 w-8 h-8 text-text-tertiary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
                  </svg>
                  <p className="text-[13px] font-medium text-text-primary">Drop a file or click to upload</p>
                  <p className="mt-1 text-[11px] text-text-tertiary">Supports .txt, .md, .html, .markdown — or paste below</p>
                </div>
              ) : (
                <div className="rounded-[12px] border border-border-subtle bg-surface-secondary/40 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <svg className="w-4 h-4 text-brand-violet shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9z" />
                      </svg>
                      <span className="text-[12px] font-medium text-text-primary truncate">{uploadedName || "Pasted content"}</span>
                      <span className="text-[11px] text-text-tertiary shrink-0">· {uploadedContent.length.toLocaleString()} chars</span>
                    </div>
                    <button type="button" onClick={() => { setUploadedContent(""); setUploadedName(""); }} className="text-[11px] text-text-tertiary hover:text-rose-400 transition-colors shrink-0">Clear</button>
                  </div>
                  <p className="mt-2 line-clamp-2 text-[11px] text-text-tertiary leading-relaxed">{uploadedContent.slice(0, 240)}</p>
                </div>
              )}
              <input
                ref={fileRef}
                type="file"
                accept=".txt,.md,.markdown,.html,.htm,text/plain,text/markdown,text/html"
                className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) void handleFile(f); }}
              />
              <textarea
                value={uploadedContent}
                onChange={e => setUploadedContent(e.target.value.slice(0, MAX_UPLOAD_CHARS))}
                placeholder="…or paste your blog content / markdown here"
                rows={4}
                className="mt-3 w-full rounded-[12px] border border-border-subtle bg-surface-primary px-3 py-2.5 text-[13px] text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-brand-violet/50 transition-all resize-y"
              />
              <button
                type="button"
                onClick={() => void handleAnalyze()}
                disabled={analyzing || uploadedContent.trim().length < 160}
                className="mt-3 h-11 px-6 rounded-[12px] bg-brand-violet text-white text-[13px] font-semibold hover:bg-brand-violet/90 disabled:opacity-50 transition-all flex items-center gap-2"
              >
                {analyzing ? <><Spinner size={14} /> Analyzing…</> : "Audit this content"}
              </button>
            </>
          )}

          {error && (
            <div className="mt-3 flex items-start gap-2 text-[13px] text-rose-400 bg-rose-500/8 border border-rose-500/20 rounded-[10px] px-3 py-2.5">
              <svg className="w-4 h-4 shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0zm-9 3.75h.008v.008H12v-.008z" />
              </svg>
              {error}
            </div>
          )}

          {analyzing && (
            <div className="mt-4 pt-4 border-t border-border-subtle">
              <p className="text-[11px] font-semibold text-text-tertiary uppercase tracking-wide mb-3">Analyzing your content…</p>
              <StepIndicator steps={STEPS} currentStep={analysisStep} />
              <p className="mt-3 text-[12px] text-text-tertiary">This takes 30–90 seconds while we read the content, check competitors, and run AI analysis.</p>
            </div>
          )}
        </div>

        {/* ── Results ── */}
        {report && (
          <AuditResults
            report={report}
            reportSource={reportSource}
            projectId={projectId}
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            generating={generating}
            genStage={genStage}
            generatedBlogId={generatedBlogId}
            generateError={generateError}
            onGenerate={handleGenerate}
            scheduleSaving={scheduleSaving}
            scheduledDate={scheduledDate}
            onSchedule={handleSchedule}
            scheduleOpen={scheduleOpen}
            setScheduleOpen={setScheduleOpen}
            onReschedule={handleReschedule}
            scheduledDates={scheduledDates}
          />
        )}

        {/* ── History ── */}
        {!analyzing && (
          <AuditHistory
            items={history}
            loading={historyLoading}
            onOpen={openHistoryItem}
          />
        )}
      </div>
    </div>
  );
}

// ─── Audit Results ────────────────────────────────────────────────────────────

function AuditResults({
  report, reportSource, projectId, activeTab, setActiveTab,
  generating, genStage, generatedBlogId, generateError, onGenerate,
  scheduleSaving, scheduledDate, onSchedule, scheduleOpen, setScheduleOpen, onReschedule, scheduledDates,
}: {
  report: ContentAuditReport;
  reportSource: "url" | "upload";
  projectId: string;
  activeTab: "issues" | "rubric" | "competitors";
  setActiveTab: (t: "issues" | "rubric" | "competitors") => void;
  generating: boolean;
  genStage: string;
  generatedBlogId: string | null;
  generateError: string;
  onGenerate: () => void;
  scheduleSaving: boolean;
  scheduledDate: string | null;
  onSchedule: () => void;
  scheduleOpen: boolean;
  setScheduleOpen: (v: boolean) => void;
  onReschedule: (date: string) => void;
  scheduledDates: Set<string>;
}) {
  const overall = report.scores.overall;
  const grade = scoreGrade(overall);
  const color = scoreColor(overall);
  const router = useRouter();

  const tooltipFor = (key: ScoreDim["key"]) => {
    if (key === "keyword_relevance" && report.keyword_data) {
      const k = report.keyword_data;
      return (
        <div className="space-y-1.5">
          <p className="text-[12px] font-semibold text-text-primary">{k.keyword}</p>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
            <span className="text-text-tertiary">Volume</span>
            <span className="text-text-primary text-right tabular-nums">{k.volume ? `${k.volume.toLocaleString()}/mo` : "—"}</span>
            <span className="text-text-tertiary">Trend</span>
            <span className={`text-right tabular-nums ${k.trend_pct >= 0 ? "text-emerald-400" : "text-rose-400"}`}>{k.trend_pct >= 0 ? "+" : ""}{k.trend_pct}%</span>
            <span className="text-text-tertiary">Demand</span>
            <span className="text-text-primary text-right capitalize">{k.verdict}</span>
          </div>
          {k.monthly_searches?.length > 1 && (
            <p className="text-[10px] text-text-tertiary pt-1">12-month search trend from DataForSEO.</p>
          )}
        </div>
      );
    }
    if (key === "freshness") {
      return (
        <div className="space-y-1 text-[11px]">
          <p className="text-[12px] font-semibold text-text-primary">Freshness signals</p>
          <p className="text-text-tertiary">Detected publish date: <span className="text-text-primary">{report.publish_date_detected || "not found"}</span></p>
          <p className="text-text-tertiary">Word count: <span className="text-text-primary">{report.word_count.toLocaleString()}</span></p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-6">

      {/* ── Overall score hero ── */}
      <div className="rounded-[20px] border border-border-subtle bg-surface-elevated p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row gap-6 items-start">
          <div className="flex items-center gap-5 shrink-0">
            <ScoreRing score={overall} size={96} strokeWidth={7} />
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[32px] font-bold" style={{ color }}>{grade}</span>
                <span className="text-[13px] text-text-tertiary font-medium">Grade</span>
              </div>
              <p className="text-[13px] font-semibold text-text-secondary">Overall Audit Score</p>
              {reportSource === "upload" ? (
                <span className="mt-1 inline-flex items-center gap-1 text-[12px] text-text-tertiary">
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 7.5 12 3m0 0L7.5 7.5M12 3v13.5" /></svg>
                  Uploaded content
                </span>
              ) : (
                <a href={report.url} target="_blank" rel="noopener noreferrer" className="mt-1 block text-[12px] text-text-tertiary hover:text-brand-violet transition-colors truncate max-w-[260px]">
                  {report.url}
                </a>
              )}
            </div>
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              {report.primary_keyword && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-brand-violet/10 text-brand-violet text-[11px] font-semibold border border-brand-violet/20">
                  <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M7 20 l4-16 m2 16 l4-16 M6 9h14 M4 15h14" />
                  </svg>
                  {report.primary_keyword}
                </span>
              )}
              {report.keyword_data && <KeywordVerdictChip verdict={report.keyword_data.verdict} volume={report.keyword_data.volume} />}
              {report.word_count > 0 && <span className="text-[11px] text-text-tertiary">{report.word_count.toLocaleString()} words</span>}
              {report.publish_date_detected && <span className="text-[11px] text-text-tertiary">Published ~{report.publish_date_detected}</span>}
            </div>
            <p className="text-[14px] text-text-primary leading-relaxed font-medium">{report.plain_language_verdict}</p>
          </div>
        </div>

        {/* ── Action bar ── */}
        <div className="mt-5 pt-5 border-t border-border-subtle flex flex-wrap items-center gap-3">
          {!generatedBlogId ? (
            <button
              type="button"
              onClick={onGenerate}
              disabled={generating}
              className="h-9 px-4 rounded-[10px] bg-brand-violet text-white text-[13px] font-semibold hover:bg-brand-violet/90 disabled:opacity-60 transition-all flex items-center gap-2"
            >
              {generating ? <><Spinner size={13} /> {genStage || "Generating…"}</> : (
                <>
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09z" />
                  </svg>
                  Generate Enhanced Blog
                </>
              )}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => router.push(`/projects/${projectId}/content-generator/blogs/${generatedBlogId}`)}
              className="h-9 px-4 rounded-[10px] bg-emerald-600 text-white text-[13px] font-semibold hover:bg-emerald-600/90 transition-all flex items-center gap-2"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0z" />
              </svg>
              View Blog
            </button>
          )}

          {!scheduledDate ? (
            <button
              type="button"
              onClick={onSchedule}
              disabled={scheduleSaving || generating}
              className="h-9 px-4 rounded-[10px] border border-border-subtle bg-surface-secondary text-[13px] font-medium text-text-secondary hover:text-text-primary hover:border-border-strong disabled:opacity-50 transition-all flex items-center gap-2"
            >
              {scheduleSaving ? <Spinner size={13} /> : (
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
                </svg>
              )}
              Schedule to Calendar
            </button>
          ) : (
            <div className="flex items-center gap-2 px-3 h-9 rounded-[10px] bg-emerald-500/10 border border-emerald-500/20 text-[12px] font-medium text-emerald-400">
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
              </svg>
              Scheduled for {new Date(scheduledDate + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              <CalendarDatePicker
                open={scheduleOpen}
                onOpenChange={setScheduleOpen}
                currentDate={scheduledDate}
                onConfirm={onReschedule}
                saving={scheduleSaving}
                scheduledDates={scheduledDates}
                variant="change"
                iconOnly
              />
            </div>
          )}

          {generateError && <span className="text-[12px] text-rose-400">{generateError}</span>}
        </div>
      </div>

      {/* ── 6 Score cards ── */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {SCORE_DIMS.map(dim => (
          <ScoreCard
            key={dim.key}
            label={dim.label}
            score={report.scores[dim.key]}
            description={dim.description}
            icon={dim.icon}
            tooltip={tooltipFor(dim.key)}
          />
        ))}
      </div>

      {/* ── Tab navigation (Revamp Brief removed — used internally for generation) ── */}
      <div className="border-b border-border-subtle">
        <nav className="flex gap-1 -mb-px">
          {(["issues", "rubric", "competitors"] as const).map(tab => {
            const labels: Record<string, string> = {
              issues: `Issues (${report.issues.length})`,
              rubric: "Quality Checklist",
              competitors: `Competitors (${report.competitor_insights.length})`,
            };
            return (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2.5 text-[13px] font-medium border-b-2 transition-all whitespace-nowrap ${
                  activeTab === tab ? "border-brand-violet text-brand-violet" : "border-transparent text-text-tertiary hover:text-text-primary"
                }`}
              >
                {labels[tab]}
              </button>
            );
          })}
        </nav>
      </div>

      {activeTab === "issues" && <IssuesPanel issues={report.issues} />}
      {activeTab === "rubric" && <RubricPanel rows={report.quality_rubric} />}
      {activeTab === "competitors" && <CompetitorsPanel insights={report.competitor_insights} />}
    </div>
  );
}

// ─── Issues panel ─────────────────────────────────────────────────────────────

const SEVERITY_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };

function IssuesPanel({ issues }: { issues: ContentAuditReport["issues"] }) {
  const sorted = [...issues].sort((a, b) => (SEVERITY_ORDER[a.severity] ?? 99) - (SEVERITY_ORDER[b.severity] ?? 99));
  if (!sorted.length) {
    return (
      <EmptyState
        icon={<svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M20 6 9 17l-5-5" /></svg>}
        title="No issues found"
        body="This content looks great! No significant SEO, GEO, or AEO issues were detected."
      />
    );
  }
  return (
    <div className="space-y-3">
      {sorted.map((issue, i) => <IssueCard key={issue.id || i} issue={issue} />)}
    </div>
  );
}

function IssueCard({ issue }: { issue: ContentAuditReport["issues"][0] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-[14px] border border-border-subtle bg-surface-elevated overflow-hidden">
      <button type="button" onClick={() => setOpen(v => !v)} className="w-full flex items-start gap-3 p-4 text-left hover:bg-surface-hover transition-colors">
        <div className="flex items-center gap-2 flex-wrap flex-1 min-w-0">
          <SeverityChip severity={issue.severity} />
          <CategoryBadge category={issue.category} />
          <span className="text-[13px] font-semibold text-text-primary leading-snug">{issue.title}</span>
        </div>
        <svg className={`w-4 h-4 text-text-tertiary shrink-0 transition-transform mt-0.5 ${open ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-3 border-t border-border-subtle/50">
          <div className="pt-3 grid gap-3 sm:grid-cols-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wide text-text-tertiary mb-1">What&apos;s wrong</p>
              <p className="text-[13px] text-text-secondary leading-relaxed">{issue.detail}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wide text-text-tertiary mb-1">Why it matters</p>
              <p className="text-[13px] text-text-secondary leading-relaxed">{issue.impact}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wide text-text-tertiary mb-1">How to fix it</p>
              <p className="text-[13px] text-brand-violet leading-relaxed font-medium">{issue.fix}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Quality rubric ───────────────────────────────────────────────────────────

function RubricPanel({ rows }: { rows: ContentAuditReport["quality_rubric"] }) {
  const pass = rows.filter(r => r.status === "pass").length;
  const pct = rows.length > 0 ? Math.round((pass / rows.length) * 100) : 0;
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 mb-2">
        <span className="text-[13px] text-text-secondary font-medium">{pass}/{rows.length} checks passing</span>
        <div className="flex-1 h-2 rounded-full bg-surface-tertiary overflow-hidden">
          <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: scoreColor(pct) }} />
        </div>
        <span className="text-[13px] font-bold tabular-nums" style={{ color: scoreColor(pct) }}>{pct}%</span>
      </div>
      <div className="space-y-2">
        {rows.map(row => (
          <div key={row.id} className="flex items-start gap-3 rounded-[12px] border border-border-subtle bg-surface-elevated px-4 py-3">
            <RubricStatus status={row.status} />
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-semibold text-text-primary leading-snug">{row.label}</p>
              <p className="text-[12px] text-text-tertiary mt-0.5 leading-relaxed">{row.detail}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Competitors panel ────────────────────────────────────────────────────────

function CompetitorsPanel({ insights }: { insights: ContentAuditReport["competitor_insights"] }) {
  if (!insights.length) {
    return (
      <EmptyState
        icon={<svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></svg>}
        title="No competitor data"
        body="Competitor analysis requires DataForSEO SERP access. Configure your DataForSEO credentials in admin settings to enable this."
      />
    );
  }
  return (
    <div className="space-y-4">
      <p className="text-[13px] text-text-tertiary">These are the pages currently outranking you for your primary keyword. Here&apos;s what they&apos;re doing differently.</p>
      {insights.map((c, i) => (
        <div key={c.url} className="rounded-[14px] border border-border-subtle bg-surface-elevated p-4">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-surface-tertiary text-text-tertiary text-[11px] font-bold flex items-center justify-center shrink-0">#{i + 1}</span>
              <div className="min-w-0">
                <p className="text-[13px] font-semibold text-text-primary leading-snug line-clamp-1">{c.title}</p>
                <a href={c.url} target="_blank" rel="noopener noreferrer" className="text-[11px] text-text-tertiary hover:text-brand-violet transition-colors truncate block">{c.url}</a>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-3 text-[11px] text-text-tertiary mb-3">
            <span>{c.word_count.toLocaleString()} words</span>
            <span>{c.h2_count} H2 sections</span>
            {c.has_faq && <span className="text-emerald-400">✓ FAQ section</span>}
            {c.has_schema && <span className="text-emerald-400">✓ Schema markup</span>}
          </div>
          {c.advantages.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[10px] font-bold uppercase tracking-wide text-text-tertiary">What they do better:</p>
              {c.advantages.map((adv, j) => (
                <div key={j} className="flex items-start gap-2 text-[12px] text-text-secondary">
                  <span className="text-rose-400 shrink-0 mt-0.5">→</span>{adv}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Audit History ────────────────────────────────────────────────────────────

const SEVERITY_OPTS = ["all", "critical", "high", "medium", "low"] as const;

function AuditHistory({
  items, loading, onOpen,
}: {
  items: ContentAuditHistoryItem[];
  loading: boolean;
  onOpen: (item: ContentAuditHistoryItem) => void;
}) {
  const [search, setSearch] = useState("");
  const [severityFilter, setSeverityFilter] = useState<string>("all");
  const [expandedUrl, setExpandedUrl] = useState<string | null>(null);

  const filtered = useMemo(() => {
    let list = items;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(i =>
        i.url.toLowerCase().includes(q) || i.title?.toLowerCase().includes(q) || i.primary_keyword?.toLowerCase().includes(q)
      );
    }
    if (severityFilter !== "all") list = list.filter(i => i.severity === severityFilter);
    return list;
  }, [items, search, severityFilter]);

  if (loading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map(i => <div key={i} className="h-16 rounded-[12px] bg-surface-elevated border border-border-subtle animate-pulse" />)}
      </div>
    );
  }

  if (!items.length) {
    return (
      <EmptyState
        icon={<svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" /></svg>}
        title="No audits yet"
        body="Enter a blog URL or upload content above to run your first audit. Results are saved here for quick reference."
      />
    );
  }

  return (
    <div>
      <h2 className="text-[14px] font-semibold text-text-secondary flex items-center gap-2 mb-3">
        <svg className="w-4 h-4 text-text-tertiary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />
        </svg>
        Audit History ({items.length})
      </h2>

      <div className="flex gap-2 mb-3 flex-wrap">
        <div className="relative flex-1 min-w-[160px]">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-tertiary pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by URL or keyword…"
            className="w-full h-8 pl-8 pr-3 rounded-[8px] border border-border-subtle bg-surface-elevated text-[12px] text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-brand-violet/40 transition-all"
          />
        </div>
        <div className="flex gap-1">
          {SEVERITY_OPTS.map(s => (
            <button
              key={s}
              type="button"
              onClick={() => setSeverityFilter(s)}
              className={`h-8 px-3 rounded-[8px] text-[11px] font-medium transition-all ${
                severityFilter === s ? "bg-brand-violet text-white" : "border border-border-subtle bg-surface-elevated text-text-tertiary hover:text-text-primary"
              }`}
            >
              {s === "all" ? "All" : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 && <p className="text-[13px] text-text-tertiary py-4 text-center">No results match your filters.</p>}

      <div className="space-y-2">
        {filtered.slice(0, 20).map(item => {
          const score = item.overall_score || item.health_score;
          const color = scoreColor(score);
          const isExpanded = expandedUrl === item.url;
          return (
            <div key={item.url} className="rounded-[12px] border border-border-subtle bg-surface-elevated overflow-hidden transition-all">
              <div className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-surface-hover transition-colors" onClick={() => setExpandedUrl(isExpanded ? null : item.url)}>
                <div className="shrink-0"><span className="text-[16px] font-bold tabular-nums" style={{ color }}>{score}</span></div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold text-text-primary leading-snug truncate">{item.title || item.url}</p>
                  <div className="flex items-center gap-2">
                    <span className={`inline-flex items-center gap-1 text-[10px] font-medium ${item.source === "upload" ? "text-violet-400" : "text-text-tertiary"}`}>
                      {item.source === "upload" ? (
                        <><svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 7.5 12 3m0 0L7.5 7.5M12 3v13.5" /></svg> Uploaded</>
                      ) : (
                        <><svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757" /></svg> Link</>
                      )}
                    </span>
                    <p className="text-[11px] text-text-tertiary truncate">{item.source === "upload" ? "Uploaded content" : item.url}</p>
                  </div>
                </div>
                <div className="shrink-0 flex items-center gap-2">
                  {item.severity && item.severity !== "none" && <SeverityChip severity={item.severity} />}
                  <span className="text-[10px] text-text-tertiary">{new Date(item.updated_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                  <svg className={`w-4 h-4 text-text-tertiary shrink-0 transition-transform ${isExpanded ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
                  </svg>
                </div>
              </div>

              {isExpanded && (
                <div className="px-4 pb-4 border-t border-border-subtle/50">
                  {item.plain_language_verdict && <p className="text-[13px] text-text-secondary leading-relaxed mt-3 mb-3">{item.plain_language_verdict}</p>}
                  {item.report && (
                    <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mb-3">
                      {(["seo", "geo", "aeo", "content_quality", "keyword_relevance", "freshness"] as const).map(k => {
                        const sc = (item.report!.scores as unknown as Record<string, number>)[k] ?? 0;
                        const lbl: Record<string, string> = { seo: "SEO", geo: "GEO", aeo: "AEO", content_quality: "Quality", keyword_relevance: "Keyword", freshness: "Fresh" };
                        return (
                          <div key={k} className="rounded-[8px] border border-border-subtle bg-surface-secondary/40 px-2 py-1.5 text-center">
                            <div className="text-[14px] font-bold tabular-nums" style={{ color: scoreColor(sc) }}>{sc}</div>
                            <div className="text-[9px] text-text-tertiary uppercase tracking-wide">{lbl[k]}</div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => onOpen(item)}
                    className="h-8 px-3 rounded-[8px] bg-brand-violet text-white text-[12px] font-semibold hover:bg-brand-violet/90 transition-all flex items-center gap-1.5"
                  >
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0z" />
                    </svg>
                    View full audit
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
