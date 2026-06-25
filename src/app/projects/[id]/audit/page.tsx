"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useParams } from "next/navigation";
import { toast } from "react-hot-toast";
import { contentAuditApi, type ContentAuditHistoryItem } from "@/frontend/api/content-audit";
import { calendarApi } from "@/frontend/api/calendar";
import { blogsApi } from "@/frontend/api/blogs";
import type { ContentAuditReport } from "@/lib/content-audit-studio";
import type { ContentHealthAuditSnapshot } from "@/lib/content-health-calendar";
import type { BlogAuditAnalysis } from "@/lib/content-audit";
import { Spinner, StepIndicator } from "./_shared/ch-ui";
import { PageHeader } from "@/components/common";
import { motion } from "framer-motion";
import { STEPS } from "./_components/audit-config";
import { AuditResults } from "./_components/AuditResults";
import { AuditHistory } from "./_components/AuditHistory";
import { GenerationStreamPanel } from "./_components/GenerationStreamPanel";

const MAX_UPLOAD_CHARS = 200_000;

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

  const [entryId, setEntryId] = useState<string | null>(null);
  const [scheduledDate, setScheduledDate] = useState<string | null>(null);
  const [scheduleSaving, setScheduleSaving] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduledDates, setScheduledDates] = useState<Set<string>>(new Set());

  const [generating, setGenerating] = useState(false);
  const [generatedBlogId, setGeneratedBlogId] = useState<string | null>(null);
  const [generateError, setGenerateError] = useState("");
  const [thinkingChunks, setThinkingChunks] = useState<string[]>([]);
  const [streamLog, setStreamLog] = useState<string[]>([]);
  const [showStreamPanel, setShowStreamPanel] = useState(false);

  const stepTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    if (!report?.url || !projectId) return;
    setGeneratedBlogId(null);
    const auditUrl = report.url;
    void (async () => {
      try {
        const res = await fetch(
          `/api/v1/projects/${projectId}/content-audit/check-generated?url=${encodeURIComponent(auditUrl)}`
        );
        const data = (await res.json()) as { blogId?: string };
        if (data.blogId) setGeneratedBlogId(data.blogId);
      } catch { /* non-fatal */ }
    })();
  }, [report?.url, projectId]);

  useEffect(() => {
    if (report) {
      const timer = setTimeout(() => {
        resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 80);
      return () => clearTimeout(timer);
    }
  }, [report]);

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
    setEntryId(null);
    setScheduledDate(null);
    setScheduleOpen(false);
    setThinkingChunks([]);
    setStreamLog([]);
    setShowStreamPanel(false);
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
    setThinkingChunks([]);
    setStreamLog(["Starting generation…"]);
    setShowStreamPanel(true);
    try {
      let blogId: string | null = null;
      const streamPayload = entryId
        ? { entryId, wordCount: report.revamp_brief?.recommended_word_count ?? 2500 }
        : {
            projectId,
            keyword: report.primary_keyword || report.title,
            contentHealthAudit: buildSnapshot(report) as unknown as Record<string, unknown>,
            wordCount: report.revamp_brief?.recommended_word_count ?? 2500,
          };

      for await (const ev of blogsApi.generateStream(streamPayload)) {
        if (ev.event === "stage") {
          const label = ev.detail ?? ev.stage;
          setStreamLog(prev => [...prev, label]);
        } else if (ev.event === "thinking") {
          setThinkingChunks(prev => [...prev, ev.chunk]);
        } else if (ev.event === "thinking_done") {
          setStreamLog(prev => [...prev, "AI reasoning complete"]);
        } else if (ev.event === "done") {
          blogId = ev.blogId;
          setStreamLog(prev => [...prev, "Blog saved successfully"]);
        } else if (ev.event === "error") {
          setGenerateError(ev.message || "Generation failed.");
          return;
        }
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
    }
  };

  const handleScheduleConfirm = async (date: string) => {
    if (!report) return;
    setScheduleSaving(true);
    try {
      if (generatedBlogId) {
        const res = await calendarApi.scheduleExistingBlog(projectId, { blogId: generatedBlogId, targetDate: date });
        if (res.success && res.data) {
          setEntryId(res.data.id);
          setScheduledDate(date);
          void loadScheduledDates();
          toast.success("Blog scheduled to calendar");
        } else {
          setGenerateError((res as any).error ?? "Failed to schedule blog.");
        }
      } else {
        const res = await calendarApi.addContentHealth(projectId, {
          focusKeyword: report.revamp_brief?.target_keyword || report.primary_keyword || report.title,
          auditUrl: report.url,
          contentHealthAudit: buildSnapshot(report) as unknown as Record<string, unknown>,
          targetDate: date,
        });
        if (res.success && res.data) {
          const actualDate = (res as { scheduled_date?: string }).scheduled_date ?? String(res.data.scheduled_date).slice(0, 10);
          setEntryId(res.data.id);
          setScheduledDate(actualDate);
          void loadScheduledDates();
          toast.success("Scheduled to calendar");
        } else {
          setGenerateError((res as any).error ?? "Could not add to calendar.");
        }
      }
    } catch (e) {
      setGenerateError(e instanceof Error ? e.message : "Unexpected error during scheduling.");
    } finally {
      setScheduleSaving(false);
      setScheduleOpen(false);
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
    setReport(item.report as unknown as ContentAuditReport);
    setReportSource(item.source ?? "url");
    setActiveTab("issues");
  };

  const handleGenerateFromHistory = (item: ContentAuditHistoryItem) => { openHistoryItem(item); };
  const handleScheduleFromHistory = (item: ContentAuditHistoryItem) => { openHistoryItem(item); setScheduleOpen(true); };
  const headerActions = (
    <div
      className="relative grid grid-cols-2 w-[340px] sm:w-[360px] rounded-[12px] border border-border-subtle bg-surface-secondary/60 p-1 gap-0.5 backdrop-blur-sm shadow-sm"
      role="tablist"
      aria-label="Audit input views"
    >
      {/* Sliding background pill */}
      <div
        className="absolute top-1 bottom-1 rounded-[9px] bg-surface-elevated shadow-sm ring-1 ring-border-subtle/80 transition-all duration-300 ease-out"
        style={{
          width: "calc(50% - 5px)",
          left: inputMode === "upload" ? "calc(50% + 1px)" : "4px",
        }}
      />

      {(["url", "upload"] as const).map(m => {
        const isActive = inputMode === m;
        return (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => { setInputMode(m); setError(""); }}
            className={`relative flex items-center justify-center gap-2 rounded-[9px] px-3 py-2 text-[13px] font-semibold transition-all duration-200 select-none ${
              isActive ? "text-text-primary" : "text-text-tertiary hover:text-text-secondary"
            }`}
          >
            <span className={`transition-colors duration-200 ${isActive ? "text-brand-action" : "opacity-60"}`}>
              {m === "url" ? (
                <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757" />
                </svg>
              ) : (
                <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 7.5 12 3m0 0L7.5 7.5M12 3v13.5" />
                </svg>
              )}
            </span>
            <span className="whitespace-nowrap">{m === "url" ? "Audit a URL" : "Upload content"}</span>
          </button>
        );
      })}
    </div>
  );

  return (
    <div className="relative space-y-10 pb-20">
      <PageHeader
        title="Content Audit Studio"
        description="Audit any blog by URL or uploaded content — SEO, GEO, AEO scores, competitor insights, and one-click enhanced regeneration."
        actions={headerActions}
        className="[&_h1]:text-[28px] [&_h1]:sm:text-[34px]"
      />

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }} className="mx-auto max-w-5xl space-y-12">
        {/* ── Input card ── */}
        <div className="mx-auto max-w-3xl w-full rounded-[24px] border border-brand-violet/20 hover:border-brand-violet/35 bg-gradient-to-b from-surface-elevated to-surface-elevated/60 p-8 sm:p-10 shadow-[0_0_50px_-12px_rgba(99,102,241,0.15)] hover:shadow-[0_0_55px_-10px_rgba(99,102,241,0.18)] transition-all">
          {inputMode === "url" ? (
            <div className="flex flex-col items-center text-center">
              <label className="block text-[14px] font-semibold text-text-secondary mb-4">
                Enter any blog or article URL to audit
              </label>
              <div className="flex gap-3 w-full max-w-2xl">
                <div className="relative flex-1">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 text-text-tertiary pointer-events-none">
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
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
                    className="w-full h-12 pl-12 pr-4 rounded-[14px] border border-border-subtle bg-surface-primary text-[15px] text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-brand-violet/50 focus:shadow-[0_0_0_4px_rgba(99,102,241,0.12)] disabled:opacity-50 transition-all shadow-inner"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => void handleAnalyze()}
                  disabled={analyzing || !url.trim()}
                  className="h-12 px-6 rounded-[14px] bg-brand-violet text-white text-[14px] font-semibold hover:bg-brand-violet/90 active:scale-[0.98] disabled:opacity-50 transition-all shrink-0 flex items-center gap-2 shadow-md shadow-brand-violet/20"
                >
                  {analyzing ? <><Spinner size={15} /> Analyzing…</> : "Audit this page"}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center text-center">
              <label className="block text-[14px] font-semibold text-text-secondary mb-4">
                Upload or paste your content to audit
              </label>
              <div className="w-full max-w-2xl">
                {!uploadedContent ? (
                  <div
                    onClick={() => fileRef.current?.click()}
                    onDragOver={e => e.preventDefault()}
                    onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) void handleFile(f); }}
                    className="cursor-pointer rounded-[14px] border-2 border-dashed border-border-strong hover:border-brand-violet/40 bg-surface-secondary/40 px-6 py-12 text-center hover:bg-surface-secondary/60 transition-all duration-200"
                  >
                    <svg className="mx-auto mb-3.5 w-9 h-9 text-text-tertiary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0L7.5 7.5M12 3v13.5" />
                    </svg>
                    <p className="text-[14px] font-medium text-text-primary">Drop a text file or click to upload</p>
                    <p className="mt-1.5 text-[12px] text-text-tertiary">Supports .txt, .md, .html, .markdown — or paste below</p>
                  </div>
                ) : (
                  <div className="rounded-[14px] border border-border-subtle bg-surface-secondary/40 p-4 text-left">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <svg className="w-4.5 h-4.5 text-brand-violet shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9z" />
                        </svg>
                        <span className="text-[13px] font-medium text-text-primary truncate">{uploadedName || "Pasted content"}</span>
                        <span className="text-[12px] text-text-tertiary shrink-0">· {uploadedContent.length.toLocaleString()} chars</span>
                      </div>
                      <button type="button" onClick={() => { setUploadedContent(""); setUploadedName(""); }} className="text-[12px] text-text-tertiary hover:text-status-danger transition-colors shrink-0">Clear</button>
                    </div>
                    <p className="mt-2 text-[12px] text-text-tertiary leading-relaxed line-clamp-3">{uploadedContent.slice(0, 300)}</p>
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
                  rows={5}
                  className="mt-4 w-full rounded-[14px] border border-border-subtle bg-surface-primary px-4 py-3 text-[14px] text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-brand-violet/50 focus:shadow-[0_0_0_4px_rgba(99,102,241,0.12)] transition-all resize-y"
                />
                <div className="flex justify-center">
                  <button
                    type="button"
                    onClick={() => void handleAnalyze()}
                    disabled={analyzing || uploadedContent.trim().length < 160}
                    className="mt-4 h-12 px-8 rounded-[14px] bg-brand-violet text-white text-[14px] font-semibold hover:bg-brand-violet/90 active:scale-[0.98] disabled:opacity-50 transition-all flex items-center gap-2 shadow-md shadow-brand-violet/20"
                  >
                    {analyzing ? <><Spinner size={15} /> Analyzing…</> : "Audit this content"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {error && (
            <div className="mt-3 flex items-start gap-2 text-[13px] text-status-danger bg-status-danger/8 border border-status-danger/20 rounded-[10px] px-3 py-2.5">
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

        {showStreamPanel && (
          <GenerationStreamPanel
            stages={streamLog}
            thinkingChunks={thinkingChunks}
            isGenerating={generating}
            onClose={() => setShowStreamPanel(false)}
          />
        )}

        {report && (
          <div ref={resultsRef} className="scroll-mt-28">
            <AuditResults
              report={report}
              reportSource={reportSource}
              projectId={projectId}
              activeTab={activeTab}
              setActiveTab={setActiveTab}
              generating={generating}
              generatedBlogId={generatedBlogId}
              generateError={generateError}
              onGenerate={handleGenerate}
              scheduleSaving={scheduleSaving}
              scheduledDate={scheduledDate}
              onSchedule={handleScheduleConfirm}
              scheduleOpen={scheduleOpen}
              setScheduleOpen={setScheduleOpen}
              onReschedule={handleReschedule}
              scheduledDates={scheduledDates}
            />
          </div>
        )}

        {!analyzing && (
          <AuditHistory
            items={history}
            loading={historyLoading}
            onOpen={openHistoryItem}
            onGenerateFromHistory={handleGenerateFromHistory}
            onScheduleFromHistory={handleScheduleFromHistory}
          />
        )}
      </motion.div>
    </div>
  );
}
