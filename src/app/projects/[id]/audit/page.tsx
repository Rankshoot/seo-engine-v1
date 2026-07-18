"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "react-hot-toast";
import { contentAuditApi, type ContentAuditHistoryItem } from "@/frontend/api/content-audit";
import { calendarApi } from "@/frontend/api/calendar";
import { blogsApi } from "@/frontend/api/blogs";
import { qk } from "@/lib/query";
import type { ContentAuditReport } from "@/lib/content-audit-studio";
import { startUrlAudit, getActiveAuditJobs, getAuditJobOutcome, type ActiveAuditJob } from "@/app/actions/audit-jobs-actions";
import type { ContentHealthAuditSnapshot } from "@/lib/content-health-calendar";
import type { BlogAuditAnalysis } from "@/lib/content-audit";
import { Spinner, StepIndicator } from "./_shared/ch-ui";
import { PageHeader } from "@/components/common";
import { motion } from "framer-motion";
import { STEPS } from "./_components/audit-config";
import { AuditResults } from "./_components/AuditResults";
import { AuditHistory } from "./_components/AuditHistory";
import { SiteScanBar } from "./_components/SiteScanBar";
import { GenerationStreamPanel } from "./_components/GenerationStreamPanel";
import { useAppDispatch, useAppSelector, selectGeneratedBlogId, selectAuditSchedule, selectAuditGenerationsForProject } from "@/lib/redux/hooks";
import { setGeneratedMap, setGeneratedBlog, normalizeAuditGenerationUrl } from "@/lib/redux/audit-generations-slice";
import { setScheduledMap, setScheduledAudit } from "@/lib/redux/audit-schedules-slice";
import { calendarRefreshBump } from "@/lib/redux/keyword-workspace-slice";

const MAX_UPLOAD_CHARS = 200_000;

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

/** Keeps the Content Calendar page's cached data (and its Redux refresh
 * counter) in sync whenever a blog/schedule change happens here — otherwise
 * the calendar shows stale state until a hard refresh. */
function syncCalendarAfterChange(
  queryClient: ReturnType<typeof useQueryClient>,
  dispatch: ReturnType<typeof useAppDispatch>,
  projectId: string
) {
  void queryClient.invalidateQueries({ queryKey: qk.calendar(projectId) });
  void queryClient.invalidateQueries({ queryKey: qk.calendarWithBlogs(projectId) });
  void queryClient.invalidateQueries({ queryKey: qk.projectStats(projectId) });
  dispatch(calendarRefreshBump({ projectId }));
}

export default function ContentAuditStudioPage() {
  const { id: projectId } = useParams<{ id: string }>();
  const dispatch = useAppDispatch();
  const queryClient = useQueryClient();

  const [inputMode, setInputMode] = useState<"url" | "upload">("url");
  const [url, setUrl] = useState("");
  const [uploadedContent, setUploadedContent] = useState("");
  const [uploadedName, setUploadedName] = useState("");
  const [targetKeyword, setTargetKeyword] = useState("");

  const [analyzing, setAnalyzing] = useState(false);
  const [analysisStep, setAnalysisStep] = useState(-1);
  const [error, setError] = useState("");
  const [report, setReport] = useState<ContentAuditReport | null>(null);
  const [reportSource, setReportSource] = useState<"url" | "upload">("url");
  const [history, setHistory] = useState<ContentAuditHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyHasMore, setHistoryHasMore] = useState(false);
  const [historyLoadingMore, setHistoryLoadingMore] = useState(false);
  // URLs freshly audited since the last view — drives the "New" badge + row
  // enter animation. Each fades out on a short timer so the marker feels live.
  const [newAuditUrls, setNewAuditUrls] = useState<Set<string>>(new Set());
  const newFlagTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const [activeTab, setActiveTab] = useState<"issues" | "rubric" | "competitors">("issues");
  const [activeJobs, setActiveJobs] = useState<ActiveAuditJob[]>([]);

  const [scheduleSaving, setScheduleSaving] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduledDates, setScheduledDates] = useState<Set<string>>(new Set());

  // Both the "already generated" and "already scheduled" state for the active
  // report are derived from Redux (hydrated from the server, updated
  // optimistically on success) rather than local component state — this is
  // what makes them survive a refresh and reopening the same audit from
  // history instead of resetting to blank every time.
  const auditSchedule = useAppSelector(s => (report?.url ? selectAuditSchedule(s, projectId, report.url) : null));
  const entryId = auditSchedule?.entryId ?? null;
  const scheduledDate = auditSchedule?.scheduledDate ?? null;
  const generatedBlogId = useAppSelector(s => (report?.url ? selectGeneratedBlogId(s, projectId, report.url) : null));
  const generatedMap = useAppSelector(s => selectAuditGenerationsForProject(s, projectId));

  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState("");
  const [thinkingChunks, setThinkingChunks] = useState<string[]>([]);
  const [streamLog, setStreamLog] = useState<string[]>([]);
  const [showStreamPanel, setShowStreamPanel] = useState(false);

  const [warning, setWarning] = useState("");
  const stepTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  const HISTORY_PAGE = 30;

  // Flags a URL as "new" for a few seconds (badge + enter animation), then fades it.
  const flagNew = useCallback((urls: string[]) => {
    if (!urls.length) return;
    setNewAuditUrls(prev => {
      const next = new Set(prev);
      urls.forEach(u => next.add(u));
      return next;
    });
    urls.forEach(u => {
      const timers = newFlagTimers.current;
      const existing = timers.get(u);
      if (existing) clearTimeout(existing);
      timers.set(u, setTimeout(() => {
        setNewAuditUrls(prev => { const n = new Set(prev); n.delete(u); return n; });
        timers.delete(u);
      }, 6000));
    });
  }, []);

  // Initial / full load — replaces the list with the first page.
  const loadHistory = useCallback(async () => {
    if (!projectId) return;
    setHistoryLoading(true);
    try {
      const res = await contentAuditApi.history(projectId, { limit: HISTORY_PAGE, offset: 0 });
      if (res.success) {
        setHistory(res.items);
        setHistoryTotal(res.total);
        setHistoryHasMore(res.hasMore);
      }
    } finally {
      setHistoryLoading(false);
    }
  }, [projectId]);

  // Load the next page and append (used by "Load more" / infinite scroll).
  const loadMoreHistory = useCallback(async () => {
    if (!projectId) return;
    setHistoryLoadingMore(true);
    try {
      const res = await contentAuditApi.history(projectId, { limit: HISTORY_PAGE, offset: history.length });
      if (res.success) {
        setHistory(prev => {
          const seen = new Set(prev.map(i => i.url));
          return [...prev, ...res.items.filter(i => !seen.has(i.url))];
        });
        setHistoryTotal(res.total);
        setHistoryHasMore(res.hasMore);
      }
    } finally {
      setHistoryLoadingMore(false);
    }
  }, [projectId, history.length]);

  // Silent top-refresh (while a scan runs): fetch the newest page and merge —
  // brand-new audits animate in at the top, already-loaded pages are preserved.
  const refreshHistoryTop = useCallback(async () => {
    if (!projectId) return;
    const res = await contentAuditApi.history(projectId, { limit: HISTORY_PAGE, offset: 0 });
    if (!res.success) return;
    setHistory(prev => {
      const prevUrls = new Set(prev.map(i => i.url));
      const brandNew = res.items.filter(i => !prevUrls.has(i.url));
      if (brandNew.length) flagNew(brandNew.map(i => i.url));
      // Overlay updated rows onto existing ones, prepend brand-new, keep the rest.
      const byUrl = new Map(prev.map(i => [i.url, i]));
      res.items.forEach(i => byUrl.set(i.url, i));
      const merged = Array.from(byUrl.values());
      merged.sort((a, b) => (a.updated_at < b.updated_at ? 1 : a.updated_at > b.updated_at ? -1 : 0));
      return merged;
    });
    setHistoryTotal(res.total);
    setHistoryHasMore(prev => prev || res.hasMore);
  }, [projectId, flagNew]);

  const loadScheduledDates = useCallback(async () => {
    if (!projectId) return;
    try {
      const res = await calendarApi.withBlogs(projectId);
      if (res.success) setScheduledDates(new Set(res.data.map(e => String(e.scheduled_date).slice(0, 10))));
    } catch { /* non-fatal */ }
  }, [projectId]);

  useEffect(() => { void loadHistory(); void loadScheduledDates(); }, [loadHistory, loadScheduledDates]);

  // Hydrate the audit-URL → generated-blog map (Redux) so Audit History rows can
  // show "View Blog" instead of "Generate Enhanced Blog" when a blog already exists.
  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await contentAuditApi.generatedMap(projectId);
        if (!cancelled && res?.map) dispatch(setGeneratedMap({ projectId, map: res.map }));
      } catch { /* non-fatal */ }
    })();
    return () => { cancelled = true; };
  }, [projectId, dispatch]);

  // Hydrate the audit-URL → calendar-schedule map (Redux) so both the active
  // report view and Audit History rows show "Scheduled for <date>" instead of
  // resetting to "Schedule to Calendar" on every refresh / reopen.
  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await contentAuditApi.scheduledMap(projectId);
        if (!cancelled && res?.map) dispatch(setScheduledMap({ projectId, map: res.map }));
      } catch { /* non-fatal */ }
    })();
    return () => { cancelled = true; };
  }, [projectId, dispatch]);

  // Resume in-flight audits after a tab-switch / refresh. The audit jobs keep
  // running server-side regardless of the client, so on return we re-attach,
  // render skeletons for what's still running, and refresh history as each
  // finishes — no duplicate paid API calls, no lost work.
  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    void (async () => {
      const first = await getActiveAuditJobs(projectId);
      if (cancelled || !first.success || first.jobs.length === 0) return;
      setActiveJobs(first.jobs);
      while (!cancelled) {
        await sleep(4000);
        if (cancelled) return;
        const r = await getActiveAuditJobs(projectId);
        if (cancelled) return;
        setActiveJobs(r.jobs);
        try {
          const hist = await contentAuditApi.history(projectId, { limit: HISTORY_PAGE, offset: 0 });
          if (!cancelled && hist.success) {
            setHistory(hist.items);
            setHistoryTotal(hist.total);
            setHistoryHasMore(hist.hasMore);
          }
        } catch { /* ignore */ }
        if (r.jobs.length === 0) return;
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  // Fallback confirmation for the rare race where this report opens before the
  // bulk generated-map hydration (above) has resolved. Only ever *adds* to
  // Redux — never resets it — so the "View Blog" button never flickers back
  // to "Generate Enhanced Blog" once Redux already knows the answer.
  useEffect(() => {
    if (!report?.url || !projectId || generatedBlogId) return;
    const auditUrl = report.url;
    void (async () => {
      try {
        const res = await fetch(
          `/api/v1/projects/${projectId}/content-audit/check-generated?url=${encodeURIComponent(auditUrl)}`
        );
        const data = (await res.json()) as { blogId?: string };
        if (data.blogId) {
          dispatch(setGeneratedBlog({ projectId, url: auditUrl, blogId: data.blogId }));
        }
      } catch { /* non-fatal */ }
    })();
  }, [report?.url, projectId, generatedBlogId, dispatch]);

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
    setGenerateError("");
    setScheduleOpen(false);
    setThinkingChunks([]);
    setStreamLog([]);
    setShowStreamPanel(false);
  };

  const handleAnalyze = async (targetUrl?: string) => {
    resetPostAuditState();
    setWarning("");

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
          focusKeyword: targetKeyword.trim() || undefined,
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
      // Resilient flow: enqueue a durable audit job and poll. The audit runs
      // server-side, so it completes (and is saved) even if the user switches
      // tabs or refreshes; idempotency means a re-click won't pay twice.
      const started = await startUrlAudit(projectId, auditUrl, { focusKeyword: targetKeyword.trim() || undefined });
      if (!started.success || !started.jobId) {
        setError(started.error ?? "Could not start the audit. Please try again.");
        return;
      }
      const targetNorm = (started.url ?? auditUrl).replace(/#.*$/, "").replace(/\/+$/, "");

      // Poll until this job leaves the active set (done or failed).
      const startedAt = Date.now();
      while (Date.now() - startedAt < 6 * 60 * 1000) {
        await sleep(3000);
        const r = await getActiveAuditJobs(projectId);
        setActiveJobs(r.jobs);
        if (!r.jobs.some(j => j.jobId === started.jobId)) break;
      }

      // Read the durable job outcome. This is authoritative even when nothing was
      // saved to history (a non-article page we deliberately skipped), so we show
      // the right warning instead of a phantom "couldn't load" error.
      const outcome = await getAuditJobOutcome(projectId, started.jobId);
      const hist = await contentAuditApi.history(projectId, { limit: HISTORY_PAGE, offset: 0 });
      if (hist.success) {
        setHistory(hist.items);
        setHistoryTotal(hist.total);
        setHistoryHasMore(hist.hasMore);
      }

      if (outcome.success && outcome.status === "failed") {
        setError(outcome.error || "The audit could not complete. Please try again.");
      } else if (outcome.success && outcome.pageStatus && outcome.pageStatus !== "ok") {
        // Non-article / unreachable / redirected page — skipped to save credits.
        // Nothing is saved to history and no enhance action is offered.
        setWarning(
          outcome.warning ||
          "This page isn't a blog post or article, so we skipped the audit to save your research credits. Enter a specific article URL, or paste the content via the Upload tab."
        );
        setReport(null);
      } else {
        // Real audit — load the persisted report from history.
        const item = hist.success
          ? hist.items.find(i => i.url.replace(/#.*$/, "").replace(/\/+$/, "") === targetNorm)
          : undefined;
        if (item?.report) {
          setReport(item.report);
          setReportSource("url");
          setActiveTab("issues");
        } else {
          setError("The audit finished but its result couldn't be loaded. Check Audit History below.");
        }
      }
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
        if (report?.url) dispatch(setGeneratedBlog({ projectId, url: report.url, blogId }));
        syncCalendarAfterChange(queryClient, dispatch, projectId);
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

  // Shared scheduling logic used both by the active report's Schedule button
  // and by the inline mini-calendar on each Audit History row — so scheduling
  // from history no longer requires opening the full audit view first.
  const scheduleReport = async (rep: ContentAuditReport, date: string, onError?: (msg: string) => void) => {
    setScheduleSaving(true);
    try {
      const blogId = generatedMap[normalizeAuditGenerationUrl(rep.url)] ?? null;
      if (blogId) {
        const res = await calendarApi.scheduleExistingBlog(projectId, { blogId, targetDate: date });
        if (res.success && res.data) {
          dispatch(setScheduledAudit({ projectId, url: rep.url, entryId: res.data.id, scheduledDate: date }));
          syncCalendarAfterChange(queryClient, dispatch, projectId);
          void loadScheduledDates();
          toast.success("Blog scheduled to calendar");
        } else {
          const msg = (res as any).error ?? "Failed to schedule blog.";
          onError?.(msg);
          toast.error(msg);
        }
      } else {
        const res = await calendarApi.addContentHealth(projectId, {
          focusKeyword: rep.revamp_brief?.target_keyword || rep.primary_keyword || rep.title,
          auditUrl: rep.url,
          contentHealthAudit: buildSnapshot(rep) as unknown as Record<string, unknown>,
          targetDate: date,
        });
        if (res.success && res.data) {
          const actualDate = (res as { scheduled_date?: string }).scheduled_date ?? String(res.data.scheduled_date).slice(0, 10);
          dispatch(setScheduledAudit({ projectId, url: rep.url, entryId: res.data.id, scheduledDate: actualDate }));
          syncCalendarAfterChange(queryClient, dispatch, projectId);
          void loadScheduledDates();
          toast.success("Scheduled to calendar");
        } else {
          const msg = (res as any).error ?? "Could not add to calendar.";
          onError?.(msg);
          toast.error(msg);
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unexpected error during scheduling.";
      onError?.(msg);
      toast.error(msg);
    } finally {
      setScheduleSaving(false);
    }
  };

  const handleScheduleConfirm = async (date: string) => {
    if (!report) return;
    await scheduleReport(report, date, setGenerateError);
    setScheduleOpen(false);
  };

  // Schedules directly from an Audit History row's mini-calendar — no need to
  // open the full audit view first.
  const handleScheduleFromHistoryConfirm = async (item: ContentAuditHistoryItem, date: string) => {
    const rep = item.report as unknown as ContentAuditReport | null;
    if (!rep) return;
    await scheduleReport(rep, date);
  };

  const handleReschedule = async (date: string) => {
    if (!entryId || !report) return;
    setScheduleSaving(true);
    try {
      const res = await calendarApi.rescheduleEntry(projectId, { entryId, date });
      if (res.success) {
        dispatch(setScheduledAudit({ projectId, url: report.url, entryId, scheduledDate: date }));
        syncCalendarAfterChange(queryClient, dispatch, projectId);
        void loadScheduledDates();
      } else {
        toast.error((res as any).error ?? "Failed to reschedule.");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to reschedule.");
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
        title={
          <div className="flex items-center gap-2">
            <span>Content Audit Studio</span>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] sm:text-[11px] font-bold bg-brand-violet/15 text-brand-violet border border-brand-violet/20 tracking-normal uppercase">
              Beta
            </span>
          </div>
        }
        description="Audit any blog by URL or uploaded content — SEO, GEO, AEO scores, competitor insights, and one-click enhanced regeneration."
        actions={headerActions}
        className="[&_h1]:text-[28px] [&_h1]:sm:text-[34px]"
      />

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }} className="mx-auto max-w-5xl space-y-12">
        {/* ── Input card ── */}
        <div className="mx-auto max-w-3xl w-full rounded-[24px] border border-brand-violet/20 hover:border-brand-violet/35 bg-gradient-to-b from-surface-elevated to-surface-elevated/60 p-8 sm:p-10 shadow-[0_0_50px_-12px_rgba(99,102,241,0.15)] hover:shadow-[0_0_55px_-10px_rgba(99,102,241,0.18)] transition-all">
          {inputMode === "url" ? (
            <div className="flex flex-col items-center text-center">
              <label className="block text-[18px] sm:text-[20px] font-semibold text-text-primary mb-4">
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
              <label className="block text-[18px] sm:text-[20px] font-semibold text-text-primary mb-4">
                Upload or paste your content to audit
              </label>
              <div className="w-full max-w-2xl text-left mb-4">
                <label className="block text-[13px] font-semibold text-text-secondary mb-1.5">
                  Target Keyword (optional)
                </label>
                <input
                  type="text"
                  value={targetKeyword}
                  onChange={e => setTargetKeyword(e.target.value)}
                  placeholder="e.g. business development manager salary"
                  className="w-full h-11 px-4 rounded-[12px] border border-border-subtle bg-surface-primary text-[14px] text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-brand-violet/50 focus:shadow-[0_0_0_3px_rgba(99,102,241,0.08)] transition-all"
                />
              </div>
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

          {warning && !error && (
            <div className="mt-3 flex items-start gap-2 text-[13px] text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded-[10px] px-3 py-2.5">
              <svg className="w-4 h-4 shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
              <span>{warning}</span>
            </div>
          )}

          {analyzing && (
            <div className="mt-4 pt-4 border-t border-border-subtle">
              <p className="text-[11px] font-semibold text-text-tertiary uppercase tracking-wide mb-3">Analyzing your content…</p>
              <StepIndicator steps={STEPS} currentStep={analysisStep} />
              <p className="mt-3 text-[12px] text-text-tertiary">This takes 30–90 seconds while we read the content, check competitors, and run AI analysis.</p>
            </div>
          )}

          {activeJobs.length > 0 && (
            <div className="mt-4 pt-4 border-t border-border-subtle space-y-2">
              <p className="text-[11px] font-semibold text-text-tertiary uppercase tracking-wide">In progress ({activeJobs.length})</p>
              {activeJobs.slice(0, 6).map(j => (
                <div key={j.jobId} className="flex items-center gap-3 rounded-[10px] border border-border-subtle bg-surface-elevated px-3 py-2.5">
                  <span className="inline-block h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-border-strong border-t-brand-violet" />
                  <span className="min-w-0 flex-1 truncate text-[12px] text-text-secondary">{j.url || "Auditing…"}</span>
                  <span className="shrink-0 text-[10px] text-text-tertiary">{j.status === "pending" ? "Queued" : "Auditing…"}</span>
                </div>
              ))}
              <p className="text-[11px] text-text-tertiary">These keep running even if you switch tabs or refresh — results appear here and in Audit History when done.</p>
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
              onClose={() => {
                setReport(null);
                resetPostAuditState();
              }}
            />
          </div>
        )}

        {!analyzing && (
          <SiteScanBar projectId={projectId} onProgress={refreshHistoryTop} />
        )}

        {!analyzing && (
          <AuditHistory
            projectId={projectId}
            items={history}
            loading={historyLoading}
            total={historyTotal}
            hasMore={historyHasMore}
            loadingMore={historyLoadingMore}
            onLoadMore={loadMoreHistory}
            newUrls={newAuditUrls}
            onOpen={openHistoryItem}
            onGenerateFromHistory={handleGenerateFromHistory}
            onScheduleConfirm={handleScheduleFromHistoryConfirm}
            scheduleSaving={scheduleSaving}
            scheduledDates={scheduledDates}
          />
        )}
      </motion.div>
    </div>
  );
}
