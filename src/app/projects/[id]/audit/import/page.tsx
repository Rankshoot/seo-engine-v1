"use client";

import { useParams, useRouter } from "next/navigation";
import { useState, useRef, useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "react-hot-toast";
import { useAppDispatch, useAppSelector, selectUploadHistory } from "@/lib/redux/hooks";
import {
  contentHealthAuditMarkStale,
  analyzePageUploadHistoryAdd,
} from "@/lib/redux/content-health-audit-slice";
import { CalendarDatePicker } from "@/components/CalendarDatePicker";
import { importUploadedArticle } from "@/app/actions/import-content-actions";
import {
  auditExternalBlogUrl,
  getContentHealthCalendarLinksByAuditUrl,
  getExternalBlogAuditsForAnalyzePage,
  markAnalyzePageAuditCalendarScheduled,
  type ContentHealthCalendarLinkRow,
} from "@/app/actions/audit-actions";
import { ProjectNavLink } from "@/components/ProjectNavLink";
import { qk } from "@/lib/query";
import type { PersistedBlogAudit } from "@/app/actions/audit-actions";
import { calendarApi } from "@/frontend/api/calendar";
import { buildContentHealthAuditSnapshot, extractCalendarFocusKeyword } from "@/lib/content-health-calendar";
import { AUDIT_SCRAPE_STORAGE_CAP } from "@/lib/audit-scrape-storage";
import { useDeveloperMode } from "@/lib/developer-mode";
import {
  CHPageShell,
  ScoreRing,
  SeverityChip,
  DemandChip,
  ErrorBanner,
  SuccessBanner,
  SkeletonRows,
  Spinner,
  healthScoreColor,
  SectionLabel,
} from "../_shared/ch-ui";

type AnalyzeTab = "upload" | "url";

/** Matches `BLOG_VIEW_FROM_ANALYZE_CONTENT` in `blogs/[blogId]/page.tsx` — shows Analyse content in blog sidebar. */
const BLOG_QUERY_FROM_ANALYZE_CONTENT = "?from=analyze-content";

function scrapeDownloadFilename(url: string): string {
  try {
    const u = new URL(url);
    const slug = `${u.hostname.replace(/^www\./i, "")}${u.pathname}`
      .replace(/[^a-z0-9]+/gi, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 72);
    return `scrape-${slug || "page"}.md`;
  } catch {
    return "scrape.md";
  }
}

/** Markdown from hybrid reader: view, copy, download — matches DB `blog_audits.scraped_markdown`.
 *  Only rendered when developer mode is active (?d in URL or NEXT_PUBLIC_DEVELOPER_TOOLS=true). */
function RawScrapePanel({
  url,
  markdown,
  heading = "Raw scrape (hybrid reader)",
}: {
  url: string;
  markdown: string;
  heading?: string;
}) {
  const [open, setOpen] = useState(true);
  const [copied, setCopied] = useState(false);
  const truncated = markdown.includes("[truncated at");

  function download() {
    const body = `<!-- source: ${url} -->\n\n${markdown}`;
    const blob = new Blob([body], { type: "text/markdown;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = scrapeDownloadFilename(url);
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(markdown);
      setCopied(true);
      toast.success("Copied raw scrape");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Could not copy");
    }
  }

  return (
    <div className="rounded-[14px] border border-sky-500/25 bg-sky-500/6 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left hover:bg-surface-hover/50 transition-colors"
      >
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-sky-300/90">{heading}</p>
          <p className="mt-0.5 truncate font-mono text-[11px] text-text-tertiary" title={url}>
            {url}
          </p>
        </div>
        <svg
          className={`h-4 w-4 shrink-0 text-text-tertiary transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div className="space-y-2 border-t border-border-subtle px-3 pb-3">
          <div className="flex flex-wrap items-center gap-2 pt-2">
            <button
              type="button"
              onClick={() => void copy()}
              className="inline-flex h-8 items-center rounded-full border border-border-subtle bg-surface-elevated px-3 text-[12px] font-semibold text-text-secondary hover:text-text-primary transition-colors"
            >
              {copied ? "Copied" : "Copy"}
            </button>
            <button
              type="button"
              onClick={download}
              className="inline-flex h-8 items-center rounded-full bg-brand-primary px-3 text-[12px] font-semibold text-brand-on-primary hover:opacity-90 transition-opacity"
            >
              Download .md
            </button>
            {truncated ? (
              <span className="text-[10px] text-amber-400/90">
                Truncated at {AUDIT_SCRAPE_STORAGE_CAP.toLocaleString()} chars for storage
              </span>
            ) : (
              <span className="text-[10px] text-text-tertiary">{markdown.length.toLocaleString()} characters</span>
            )}
          </div>
          <pre className="max-h-[min(50vh,420px)] overflow-auto wrap-break-word whitespace-pre-wrap rounded-[10px] border border-border-subtle bg-surface-primary p-3 font-mono text-[11px] leading-relaxed text-text-secondary">
            {markdown}
          </pre>
        </div>
      )}
    </div>
  );
}

function fmtWhen(iso?: string) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch { return iso; }
}

function normalizeCalendarDay(raw: string): string {
  return String(raw).slice(0, 10);
}

function fmtScheduleDay(iso: string): string {
  const d = normalizeCalendarDay(iso);
  try {
    return new Date(d + "T12:00:00").toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return d;
  }
}

const TERMINAL_CAL_STATUSES = new Set(["generated", "downloaded", "approved", "published"]);

function AnalyzeAuditActions({
  record,
  link,
  projectId,
  variant,
  scheduleBusy,
  generateBusy,
  enhanceBusy,
  repairSessionBlogId,
  onSchedule,
  onGenerate,
  onGenerateEnhanced,
  scheduleMsg,
  scheduledDatesSet,
  datePickerOpen,
  onDatePickerOpenChange,
  onRescheduleConfirm,
  rescheduleSaving,
}: {
  record: PersistedBlogAudit;
  link: ContentHealthCalendarLinkRow | undefined;
  projectId: string;
  variant: "compact" | "full";
  scheduleBusy: boolean;
  generateBusy: boolean;
  enhanceBusy: boolean;
  /** Set after “Generate enhanced version” in this session so we can offer View blog without a calendar snapshot row. */
  repairSessionBlogId?: string | null;
  onSchedule: () => void;
  onGenerate: () => void;
  onGenerateEnhanced: () => void;
  scheduleMsg?: string;
  scheduledDatesSet: Set<string>;
  datePickerOpen: boolean;
  onDatePickerOpenChange: (open: boolean) => void;
  onRescheduleConfirm: (date: string) => void;
  rescheduleSaving: boolean;
}) {
  const meta = record.analysis.analyze_page_meta;
  const focusOk = extractCalendarFocusKeyword(record).length >= 2;
  const blogId = link?.blogId ?? null;
  const effectiveBlogId = blogId ?? repairSessionBlogId ?? null;
  const status = link?.status ?? "";
  const entryId = link?.entryId;
  const isGenerating = status === "generating";
  const isTerminal = TERMINAL_CAL_STATUSES.has(status);

  // Treat as "on calendar" if the audit meta flag OR a live calendar link exists.
  const scheduled = Boolean(meta?.calendar_scheduled) || Boolean(link?.entryId);
  // Prefer the live calendar link date (authoritative) over the stale audit meta stamp.
  const scheduledDate = link?.scheduledDate ?? meta?.calendar_scheduled_date ?? null;

  const showSchedule = !scheduled && focusOk;
  const showGenerate = Boolean(
    scheduled && entryId && !effectiveBlogId && !isGenerating && !isTerminal
  );
  const showViewBlog = Boolean(effectiveBlogId);
  const pageBroken = record.analysis.page_status === "broken";
  const showEnhancedVersion = !pageBroken && !effectiveBlogId && !showGenerate;
  const allowRescheduleDate = Boolean(
    scheduled && scheduledDate && entryId && !isGenerating && !generateBusy && !enhanceBusy
  );

  const btnBase =
    variant === "compact"
      ? "inline-flex h-8 items-center justify-center gap-1.5 rounded-full px-3 text-[11px] font-semibold transition-opacity disabled:opacity-50"
      : "inline-flex h-9 items-center justify-center gap-1.5 rounded-full px-4 text-[13px] font-semibold transition-opacity disabled:opacity-50";

  const scheduleMsgOk =
    !!scheduleMsg &&
    (scheduleMsg.startsWith("Scheduled") ||
      scheduleMsg.startsWith("On calendar") ||
      scheduleMsg.startsWith("Blog ready"));

  return (
    <div
      className="flex flex-wrap items-center gap-2"
      onClick={e => { e.preventDefault(); e.stopPropagation(); }}
      onKeyDown={e => e.stopPropagation()}
      role="presentation"
    >
      {/* ── calendar info message on the LEFT ─────────────────────────── */}
      {scheduleMsg && (
        <span className={`shrink-0 text-[11px] font-medium leading-snug max-w-[200px] ${scheduleMsgOk ? "text-emerald-400" : "text-rose-400"}`}>
          {scheduleMsg}
        </span>
      )}

      {/* ── scheduled date chip (replaces Schedule button when on calendar) ── */}
      {scheduled && scheduledDate && (
        <div className={["group/dt inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1", variant === "compact" ? "max-w-full flex-wrap" : ""].join(" ")}>
          <svg className="w-2.5 h-2.5 shrink-0 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><rect x="3" y="4" width="18" height="18" rx="2" /><path strokeLinecap="round" d="M16 2v4M8 2v4M3 10h18" /></svg>
          <span className="text-[10px] font-bold text-emerald-400 tabular-nums">{fmtScheduleDay(scheduledDate)}</span>
          {allowRescheduleDate && (
            <span className="inline-flex opacity-100 sm:opacity-0 sm:group-hover/dt:opacity-100 sm:focus-within:opacity-100 transition-opacity">
              <CalendarDatePicker open={datePickerOpen} onOpenChange={onDatePickerOpenChange} currentDate={normalizeCalendarDay(scheduledDate)} onConfirm={onRescheduleConfirm} saving={rescheduleSaving} scheduledDates={scheduledDatesSet} iconOnly />
            </span>
          )}
        </div>
      )}

      {/* ── Schedule (secondary outline) — only when NOT yet on calendar ── */}
      {showSchedule && (
        <button type="button" disabled={scheduleBusy || enhanceBusy} onClick={onSchedule}
          className={`${btnBase} border border-border-strong bg-surface-elevated text-text-secondary hover:text-text-primary`}>
          {scheduleBusy
            ? <><Spinner size={13} className="border-text-secondary/30 border-t-text-secondary" /> Scheduling…</>
            : <><svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>Schedule</>}
        </button>
      )}

      {/* ── Enhance (primary) — skip-calendar repair+SEO pipeline ─────── */}
      {showEnhancedVersion && (
        <button type="button" disabled={enhanceBusy || scheduleBusy || generateBusy} onClick={onGenerateEnhanced}
          title="Re-scrape the live article, fix every audit issue, produce an SEO-ready version."
          className={`${btnBase} bg-brand-primary text-brand-on-primary hover:opacity-90`}>
          {enhanceBusy
            ? <><Spinner size={13} className="border-brand-on-primary/30 border-t-brand-on-primary" /> Generating…</>
            : <><svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.847a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.847.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456Z" /></svg>Enhance</>}
        </button>
      )}

      {!focusOk && !scheduled && (
        <span className="text-[10px] text-text-tertiary max-w-[140px] leading-tight">Add a clearer keyword to schedule.</span>
      )}

      {/* ── Generate blog (primary) — after calendar entry exists ──────── */}
      {showGenerate && (
        <button type="button" disabled={generateBusy || isGenerating || enhanceBusy} onClick={onGenerate}
          className={`${btnBase} bg-brand-primary text-brand-on-primary hover:opacity-90`}>
          {generateBusy || isGenerating
            ? <><Spinner size={13} className="border-brand-on-primary/30 border-t-brand-on-primary" /> Generating…</>
            : <><svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.847a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.847.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456Z" /></svg>Generate</>}
        </button>
      )}

      {/* ── View blog ─────────────────────────────────────────────────── */}
      {showViewBlog && effectiveBlogId && (
        <ProjectNavLink href={`/projects/${projectId}/blogs/${effectiveBlogId}${BLOG_QUERY_FROM_ANALYZE_CONTENT}`}
          className={`${btnBase} border border-emerald-500/35 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/15`}>
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" /></svg>
          View blog
        </ProjectNavLink>
      )}
    </div>
  );
}

// ─── inline expanded analysis ─────────────────────────────────────────────

function AnalysisPanel({
  record,
  projectId,
  link,
  scheduleBusy,
  generateBusy,
  enhanceBusy,
  repairSessionBlogId,
  onSchedule,
  onGenerate,
  onGenerateEnhanced,
  scheduleMsg,
  scheduledDatesSet,
  datePickerOpen,
  onDatePickerOpenChange,
  onRescheduleConfirm,
  rescheduleSaving,
  developerMode,
}: {
  record: PersistedBlogAudit;
  projectId: string;
  link: ContentHealthCalendarLinkRow | undefined;
  scheduleBusy: boolean;
  generateBusy: boolean;
  enhanceBusy: boolean;
  repairSessionBlogId?: string | null;
  onSchedule: () => void;
  onGenerate: () => void;
  onGenerateEnhanced: () => void;
  scheduleMsg?: string;
  scheduledDatesSet: Set<string>;
  datePickerOpen: boolean;
  onDatePickerOpenChange: (open: boolean) => void;
  onRescheduleConfirm: (date: string) => void;
  rescheduleSaving: boolean;
  developerMode: boolean;
}) {
  const a = record.analysis;
  const { text } = healthScoreColor(record.health_score);
  const rubric = a.quality_rubric ?? [];
  const rcPass = rubric.filter(r => r.status === "pass").length;
  const rcWarn = rubric.filter(r => r.status === "warn").length;
  const rcFail = rubric.filter(r => r.status === "fail").length;

  return (
    <div className="mt-0 border-t border-border-subtle">
      <div className="max-h-[min(70vh,520px)] overflow-y-auto overscroll-contain pr-1 space-y-6 py-4">
      {developerMode && record.scraped_markdown ? (
        <RawScrapePanel
          url={record.url}
          markdown={record.scraped_markdown}
          heading="Raw scrape (stored with this audit)"
        />
      ) : null}
      {/* metrics row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
        {[
          { label: "Health score", value: record.health_score, cls: text },
          { label: "LLM quality", value: a.llm_quality_score ?? "—", cls: "" },
          { label: "Words", value: record.word_count.toLocaleString(), cls: "" },
          { label: "Issues", value: a.issues?.length ?? 0, cls: a.issues?.some(i => i.severity === "high") ? "text-rose-400" : "" },
          { label: "Rubric", value: rubric.length ? `${rcPass}✓ ${rcWarn}! ${rcFail}✗` : "—", cls: "" },
        ].map(m => (
          <div key={m.label} className="rounded-[12px] border border-border-subtle bg-surface-primary/70 px-3 py-2.5">
            <SectionLabel>{m.label}</SectionLabel>
            <p className={`text-[16px] font-bold tabular-nums mt-1 leading-tight font-mono ${m.cls || "text-text-primary"}`}>{m.value}</p>
          </div>
        ))}
      </div>

      {/* keyword demand */}
      {a.keyword_demand ? (
        <div className="flex flex-wrap items-center gap-2">
          <SectionLabel>Keyword demand</SectionLabel>
          <DemandChip verdict={a.keyword_demand.verdict} volume={a.keyword_demand.volume} />
          {a.keyword_demand.trend_pct !== 0 && (
            <span className={`text-[12px] font-medium ${a.keyword_demand.trend_pct > 0 ? "text-emerald-400" : "text-rose-400"}`}>
              {a.keyword_demand.trend_pct > 0 ? "+" : ""}{a.keyword_demand.trend_pct}% trend
            </span>
          )}
        </div>
      ) : null}

      {/* summary + verdict */}
      {a.summary && (
        <div>
          <SectionLabel>Summary</SectionLabel>
          <p className="mt-1.5 text-[14px] text-text-secondary leading-relaxed">{a.summary}</p>
        </div>
      )}
      {a.plain_language_verdict && (
        <div className="rounded-[12px] border border-brand-action/15 bg-brand-action/5 px-4 py-3.5">
          <SectionLabel>Verdict</SectionLabel>
          <p className="mt-1.5 text-[14px] text-text-secondary leading-relaxed">{a.plain_language_verdict}</p>
        </div>
      )}

      {/* issues */}
      {a.issues?.length ? (
        <div>
          <SectionLabel>Issues ({a.issues.length})</SectionLabel>
          <ul className="mt-2 space-y-2">
            {a.issues.map((issue, i) => {
              const sev = issue.severity;
              const cls = sev === "high" ? "border-rose-500/20 bg-rose-500/5 text-rose-400" : sev === "medium" ? "border-amber-500/20 bg-amber-500/5 text-amber-400" : "border-border-subtle bg-surface-primary/60 text-text-tertiary";
              return (
                <li key={i} className={`rounded-[10px] border px-3.5 py-2.5 ${cls}`}>
                  <p className="text-[13px] font-semibold text-text-primary">{issue.label}</p>
                  {issue.detail && <p className="mt-0.5 text-[12px] opacity-80 leading-relaxed">{issue.detail}</p>}
                  {issue.fix && <p className="mt-1 text-[12px] font-medium">Fix: {issue.fix}</p>}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {/* content gaps */}
      {a.content_gaps?.length ? (
        <div>
          <SectionLabel>Content gaps</SectionLabel>
          <ul className="mt-2 space-y-1 text-[13px] text-text-secondary">
            {a.content_gaps.map((g, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-text-tertiary mt-0.5 shrink-0">·</span>
                <span>{g}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* quality rubric */}
      {rubric.length ? (
        <div>
          <SectionLabel>Quality checklist</SectionLabel>
          <ul className="mt-2 space-y-1.5">
            {rubric.map(row => (
              <li key={row.id} className="flex gap-2.5 text-[13px]">
                <span className={`shrink-0 font-bold mt-0.5 ${row.status === "pass" ? "text-emerald-400" : row.status === "warn" ? "text-amber-400" : "text-rose-400"}`}>
                  {row.status === "pass" ? "✓" : row.status === "warn" ? "!" : "✗"}
                </span>
                <div>
                  <span className="font-medium text-text-primary">{row.label}</span>
                  {row.detail ? <span className="text-text-tertiary"> — {row.detail}</span> : null}
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-3 pt-3 pb-1 border-t border-border-subtle">
        <AnalyzeAuditActions
          record={record}
          link={link}
          projectId={projectId}
          variant="full"
          scheduleBusy={scheduleBusy}
          generateBusy={generateBusy}
          enhanceBusy={enhanceBusy}
          repairSessionBlogId={repairSessionBlogId}
          onSchedule={onSchedule}
          onGenerate={onGenerate}
          onGenerateEnhanced={onGenerateEnhanced}
          scheduleMsg={scheduleMsg}
          scheduledDatesSet={scheduledDatesSet}
          datePickerOpen={datePickerOpen}
          onDatePickerOpenChange={onDatePickerOpenChange}
          onRescheduleConfirm={onRescheduleConfirm}
          rescheduleSaving={rescheduleSaving}
        />
      </div>
    </div>
  );
}

// ─── history row (collapsed summary + expandable) ─────────────────────────

function HistoryRow({
  record,
  open,
  onToggle,
  projectId,
  link,
  scheduleBusy,
  generateBusy,
  enhanceBusy,
  repairSessionBlogId,
  onSchedule,
  onGenerate,
  onGenerateEnhanced,
  scheduleMsg,
  scheduledDatesSet,
  datePickerOpen,
  onDatePickerOpenChange,
  onRescheduleConfirm,
  rescheduleSaving,
  developerMode,
}: {
  record: PersistedBlogAudit;
  open: boolean;
  onToggle: () => void;
  projectId: string;
  link: ContentHealthCalendarLinkRow | undefined;
  scheduleBusy: boolean;
  generateBusy: boolean;
  enhanceBusy: boolean;
  repairSessionBlogId?: string | null;
  onSchedule: () => void;
  onGenerate: () => void;
  onGenerateEnhanced: () => void;
  scheduleMsg?: string;
  scheduledDatesSet: Set<string>;
  datePickerOpen: boolean;
  onDatePickerOpenChange: (open: boolean) => void;
  onRescheduleConfirm: (date: string) => void;
  rescheduleSaving: boolean;
  developerMode: boolean;
}) {
  const a = record.analysis;
  const meta = a.analyze_page_meta;
  const scheduled = meta?.calendar_scheduled && meta.calendar_scheduled_date;

  let host = record.url;
  try { host = new URL(record.url).hostname.replace(/^www\./, ""); } catch { /**/ }

  return (
    <div className={`rounded-[14px] border transition-all ${open ? "border-brand-action/30 bg-surface-elevated" : "border-border-subtle bg-surface-elevated hover:border-border-strong"}`}>
      {/* summary row */}
      <div className="flex items-stretch gap-2 px-3 py-2.5 sm:px-4 sm:py-3.5">
        <button
          type="button"
          onClick={onToggle}
          className="flex min-w-0 flex-1 items-center gap-3 sm:gap-4 text-left"
        >
          <ScoreRing score={record.health_score} size={44} />
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold text-text-primary truncate" title={record.title}>{record.title || host}</p>
            <p className="text-[11px] text-text-tertiary truncate">{host} · {fmtWhen(record.updated_at)}</p>
          </div>
          {a.issues?.some(i => i.severity === "high") && !scheduled && (
            <span className="hidden sm:inline w-2 h-2 rounded-full bg-rose-400 shrink-0" title="High-severity issues" />
          )}
        </button>
        <div className="flex flex-col items-end justify-center gap-2 shrink-0 max-w-[min(100%,220px)] sm:max-w-none">
          <AnalyzeAuditActions
            record={record}
            link={link}
            projectId={projectId}
            variant="compact"
            scheduleBusy={scheduleBusy}
            generateBusy={generateBusy}
            enhanceBusy={enhanceBusy}
            repairSessionBlogId={repairSessionBlogId}
            onSchedule={onSchedule}
            onGenerate={onGenerate}
            onGenerateEnhanced={onGenerateEnhanced}
            scheduleMsg={scheduleMsg}
            scheduledDatesSet={scheduledDatesSet}
            datePickerOpen={datePickerOpen}
            onDatePickerOpenChange={onDatePickerOpenChange}
            onRescheduleConfirm={onRescheduleConfirm}
            rescheduleSaving={rescheduleSaving}
          />
        </div>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-label={open ? "Collapse analysis" : "Expand analysis"}
          className="flex w-9 shrink-0 items-center justify-center rounded-lg border border-transparent text-text-tertiary hover:bg-surface-hover hover:text-text-primary transition-colors"
        >
          <svg
            className={`w-4 h-4 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
            viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
          </svg>
        </button>
      </div>
      {scheduleMsg && !open && (
        <div className="px-4 pb-2 -mt-1 sm:hidden">
          <span
            className={`text-[11px] font-medium ${scheduleMsg.startsWith("Scheduled") || scheduleMsg.startsWith("On calendar") || scheduleMsg.startsWith("Blog ready") ? "text-emerald-400" : "text-rose-400"}`}
          >
            {scheduleMsg}
          </span>
        </div>
      )}

      {/* expanded panel */}
      {open && (
        <div className="px-4 pb-4">
          <AnalysisPanel
            record={record}
            projectId={projectId}
            link={link}
            scheduleBusy={scheduleBusy}
            generateBusy={generateBusy}
            enhanceBusy={enhanceBusy}
            repairSessionBlogId={repairSessionBlogId}
            onSchedule={onSchedule}
            onGenerate={onGenerate}
            onGenerateEnhanced={onGenerateEnhanced}
            scheduleMsg={scheduleMsg}
            scheduledDatesSet={scheduledDatesSet}
            datePickerOpen={datePickerOpen}
            onDatePickerOpenChange={onDatePickerOpenChange}
            onRescheduleConfirm={onRescheduleConfirm}
            rescheduleSaving={rescheduleSaving}
            developerMode={developerMode}
          />
        </div>
      )}
    </div>
  );
}

// ─── page ──────────────────────────────────────────────────────────────────

export default function AuditImportPage() {
  const { id: projectId } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const dispatch = useAppDispatch();
  const { developerMode } = useDeveloperMode();
  const [tab, setTab] = useState<AnalyzeTab>("url");

  const uploadHistory = useAppSelector(s => selectUploadHistory(s, projectId ?? ""));

  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadErr, setUploadErr] = useState("");
  const formRef = useRef<HTMLFormElement>(null);

  const [urlInput, setUrlInput] = useState("");
  const [urlBusy, setUrlBusy] = useState(false);
  const [urlErr, setUrlErr] = useState("");
  const [lastRawScrape, setLastRawScrape] = useState<{ url: string; markdown: string } | null>(null);

  const [schedulingUrl, setSchedulingUrl] = useState<string | null>(null);
  const [generatingUrl, setGeneratingUrl] = useState<string | null>(null);
  const [pickingDateForAuditUrl, setPickingDateForAuditUrl] = useState<string | null>(null);
  const [rescheduleSaving, setRescheduleSaving] = useState(false);
  const [scheduleMessages, setScheduleMessages] = useState<Record<string, string>>({});
  const [expandedUrl, setExpandedUrl] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(true);
  const [enhancingUrl, setEnhancingUrl] = useState<string | null>(null);
  const [repairBlogIdByAuditUrl, setRepairBlogIdByAuditUrl] = useState<Record<string, string>>({});

  const historyQuery = useQuery({
    queryKey: [...qk.audits(projectId!), "external-analyze-history"],
    queryFn: () => getExternalBlogAuditsForAnalyzePage(projectId!, 40),
    enabled: Boolean(projectId),
  });
  const historyRows = historyQuery.data?.success ? historyQuery.data.data : [];

  const calendarLinksQuery = useQuery({
    queryKey: qk.analyzeCalendarLinks(projectId!),
    queryFn: () => getContentHealthCalendarLinksByAuditUrl(projectId!),
    enabled: Boolean(projectId),
    staleTime: 10_000,
  });
  const linksByUrl =
    calendarLinksQuery.data?.success ? calendarLinksQuery.data.byAuditUrl : ({} as Record<string, ContentHealthCalendarLinkRow>);

  const calendarEntriesQuery = useQuery({
    queryKey: qk.calendar(projectId!),
    queryFn: () => calendarApi.entries(projectId!),
    enabled: Boolean(projectId),
    staleTime: 15_000,
  });
  const scheduledDatesSet = useMemo(() => {
    if (!calendarEntriesQuery.data?.success) return new Set<string>();
    return new Set(
      calendarEntriesQuery.data.data.map(e => normalizeCalendarDay(String(e.scheduled_date)))
    );
  }, [calendarEntriesQuery.data]);

  const refetchHistory = useCallback(async () => {
    if (!projectId) return;
    await queryClient.refetchQueries({ queryKey: [...qk.audits(projectId), "external-analyze-history"] });
  }, [queryClient, projectId]);

  async function onUploadSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!projectId) return;
    const fd = new FormData(e.currentTarget);
    const pasted = String(fd.get("pasted_text") ?? "").trim();
    const file = fd.get("file");
    const hasFile = file instanceof File && file.size > 0;
    if (!pasted && !hasFile) {
      setUploadErr("Choose a file or paste your article text.");
      return;
    }
    setUploadBusy(true); setUploadErr("");
    try {
      const res = await importUploadedArticle(projectId, fd);
      if (res.trace?.length) console.log("[import-content] trace", res.trace);
      if (res.success && res.blogId) {
        dispatch(analyzePageUploadHistoryAdd({
          projectId,
          entry: {
            blogId: res.blogId,
            title: (res as { title?: string }).title ?? (String(fd.get("pasted_text") ?? "").split("\n")[0].slice(0, 80) || "Uploaded article"),
            keyword: (res as { keyword?: string }).keyword ?? "",
            uploadedAt: new Date().toISOString(),
          },
        }));
        router.push(`/projects/${projectId}/blogs/${res.blogId}${BLOG_QUERY_FROM_ANALYZE_CONTENT}`);
        return;
      }
      setUploadErr(res.error ?? "Import failed.");
    } catch (ex) { setUploadErr(ex instanceof Error ? ex.message : "Import failed."); }
    finally { setUploadBusy(false); }
  }

  async function onAnalyzeUrl(e: React.FormEvent) {
    e.preventDefault();
    if (!projectId) return;
    setUrlBusy(true);
    setUrlErr("");
    setLastRawScrape(null);
    try {
      const res = await auditExternalBlogUrl(projectId, urlInput);
      if (res.trace?.length) console.log("[content-health external URL] trace", res.trace);
      if (res.success && res.record) {
        setExpandedUrl(res.record.url);
        if (res.record.scraped_markdown) {
          setLastRawScrape({ url: res.record.url, markdown: res.record.scraped_markdown });
        }
        await queryClient.invalidateQueries({ queryKey: qk.audits(projectId) });
        dispatch(contentHealthAuditMarkStale({ projectId }));
        await refetchHistory();
        return;
      }
      setUrlErr(res.error ?? "Could not analyze that URL.");
    } catch (ex) { setUrlErr(ex instanceof Error ? ex.message : "Could not analyze that URL."); }
    finally { setUrlBusy(false); }
  }

  async function scheduleKeyword(record: PersistedBlogAudit) {
    if (!projectId) return;
    const focus = extractCalendarFocusKeyword(record);
    if (focus.length < 2) return;
    const url = record.url;
    setSchedulingUrl(url);
    try {
      const snapshot = buildContentHealthAuditSnapshot(record);
      const res = await calendarApi.addContentHealth(projectId, {
        focusKeyword: focus,
        auditUrl: url,
        contentHealthAudit: snapshot as unknown as Record<string, unknown>,
      });
      if (res.success) {
        const r = res as { data?: { scheduled_date?: string }; scheduled_date?: string };
        const sd =
          (typeof r.scheduled_date === "string" ? r.scheduled_date : undefined) ??
          r.data?.scheduled_date;
        const day = sd ? sd.slice(0, 10) : new Date().toISOString().slice(0, 10);
        await markAnalyzePageAuditCalendarScheduled(projectId, url, sd ?? day);
        setScheduleMessages(m => ({
          ...m,
          [url]: `Scheduled for ${day}. Generation will repair the reference article (not a full rewrite).`,
        }));
        await queryClient.invalidateQueries({ queryKey: qk.calendar(projectId) });
        await queryClient.invalidateQueries({ queryKey: qk.calendarWithBlogs(projectId) });
        await queryClient.invalidateQueries({ queryKey: qk.analyzeCalendarLinks(projectId) });
        await queryClient.invalidateQueries({ queryKey: qk.keywords(projectId) });
        await refetchHistory();
      } else {
        setScheduleMessages(m => ({
          ...m,
          [url]: ("error" in res && res.error) ? res.error : "Could not add to calendar.",
        }));
      }
    } catch {
      setScheduleMessages(m => ({ ...m, [record.url]: "Could not add to calendar." }));
    } finally {
      setSchedulingUrl(null);
    }
  }

  async function generateFromAnalyze(record: PersistedBlogAudit) {
    if (!projectId) return;
    const link = linksByUrl[record.url];
    if (!link?.entryId) {
      setScheduleMessages(m => ({
        ...m,
        [record.url]: "Calendar row not found — try scheduling again.",
      }));
      return;
    }
    setGeneratingUrl(record.url);
    setScheduleMessages(m => {
      const next = { ...m };
      delete next[record.url];
      return next;
    });
    try {
      const { generateBlog } = await import("@/app/actions/blog-actions");
      const res = await generateBlog(link.entryId, 2500);
      if (res.success && "data" in res && res.data?.id) {
        await queryClient.invalidateQueries({ queryKey: qk.analyzeCalendarLinks(projectId) });
        await queryClient.invalidateQueries({ queryKey: qk.calendarWithBlogs(projectId) });
        await queryClient.invalidateQueries({ queryKey: qk.calendar(projectId) });
        setScheduleMessages(m => ({
          ...m,
          [record.url]: "Blog ready — open View blog.",
        }));
      } else {
        setScheduleMessages(m => ({
          ...m,
          [record.url]: ("error" in res && res.error) ? res.error : "Generation failed.",
        }));
      }
    } catch (ex) {
      setScheduleMessages(m => ({
        ...m,
        [record.url]: ex instanceof Error ? ex.message : "Generation failed.",
      }));
    } finally {
      setGeneratingUrl(null);
    }
  }

  async function generateEnhancedVersion(record: PersistedBlogAudit) {
    if (!projectId) return;
    const url = record.url;
    setEnhancingUrl(url);
    try {
      const { repairBlogFromAudit } = await import("@/app/actions/repair-actions");
      const res = await repairBlogFromAudit(projectId, url);
      if (res.success && res.data.blogId) {
        setRepairBlogIdByAuditUrl(m => ({ ...m, [url]: res.data.blogId }));
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: qk.analyzeCalendarLinks(projectId) }),
          queryClient.invalidateQueries({ queryKey: qk.calendarWithBlogs(projectId) }),
          queryClient.invalidateQueries({ queryKey: qk.calendar(projectId) }),
          queryClient.invalidateQueries({ queryKey: qk.projectStats(projectId) }),
          refetchHistory(),
        ]);
        dispatch(contentHealthAuditMarkStale({ projectId }));
        toast.success("Enhanced version ready — opening blog viewer.");
        router.push(`/projects/${projectId}/blogs/${res.data.blogId}${BLOG_QUERY_FROM_ANALYZE_CONTENT}`);
      } else {
        toast.error(!res.success ? res.error : "Could not generate enhanced version.");
      }
    } catch (ex) {
      toast.error(ex instanceof Error ? ex.message : "Could not generate enhanced version.");
    } finally {
      setEnhancingUrl(null);
    }
  }

  const rescheduleAnalyzeEntry = useCallback(
    async (auditUrl: string, entryId: string, date: string) => {
      if (!projectId) return;
      const dateNorm = normalizeCalendarDay(date);
      setRescheduleSaving(true);
      try {
        const res = await calendarApi.rescheduleEntry(projectId, { entryId, date: dateNorm });
        if (res.success) {
          await markAnalyzePageAuditCalendarScheduled(projectId, auditUrl, dateNorm);
          await queryClient.invalidateQueries({ queryKey: qk.calendar(projectId) });
          await queryClient.invalidateQueries({ queryKey: qk.calendarWithBlogs(projectId) });
          await queryClient.invalidateQueries({ queryKey: qk.analyzeCalendarLinks(projectId) });
          await refetchHistory();
          toast.success(`Rescheduled for ${fmtScheduleDay(dateNorm)}`);
          setPickingDateForAuditUrl(null);
        } else {
          toast.error(res.error ?? "Could not change date");
        }
      } catch {
        toast.error("Could not change date");
      } finally {
        setRescheduleSaving(false);
      }
    },
    [projectId, queryClient, refetchHistory]
  );

  const tabSwitcher = (
    <div
      className="flex w-full min-w-[min(100%,280px)] max-w-sm rounded-full border border-border-subtle p-0.5 bg-surface-elevated shrink-0"
      role="tablist"
      aria-label="Analyze mode"
    >
      {(["url", "upload"] as AnalyzeTab[]).map(t => (
        <button
          key={t}
          type="button"
          role="tab"
          aria-selected={tab === t}
          onClick={() => setTab(t)}
          className={`flex-1 rounded-full py-2.5 px-2 text-[13px] font-semibold transition-all duration-150 ${
            tab === t
              ? "bg-text-primary text-surface-primary shadow-sm"
              : "text-text-secondary hover:text-text-primary"
          }`}
        >
          {t === "upload" ? "Upload article" : "Analyze URL"}
        </button>
      ))}
    </div>
  );

  return (
    <CHPageShell
      title="Content Analyzer"
      subtitle="Upload a draft to open it in the blog workspace, or analyze any public article URL through the full Content Health pipeline and optionally schedule the inferred keyword."
      actions={tabSwitcher}
    >
      {/* ── upload tab ─────────────────────────────────────────────────── */}
      <div hidden={tab !== "upload"}>
        <p className="text-[14px] text-text-secondary leading-relaxed mb-5">
          Markdown (.md), plain text (.txt), Word (.docx), or paste article text below. We normalize links, infer keyword and meta description with Gemini, then open the blog workspace.
        </p>
        <form
          ref={formRef}
          onSubmit={onUploadSubmit}
          className="max-w-2xl rounded-[16px] border border-border-subtle bg-surface-elevated p-6 space-y-4"
        >
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-widest text-text-tertiary mb-2">
              Paste article text
            </label>
            <textarea
              name="pasted_text"
              rows={10}
              disabled={uploadBusy}
              placeholder="Paste markdown or plain text (optional if you upload a file instead)…"
              className="w-full rounded-[12px] border border-border-subtle bg-surface-primary px-3.5 py-3 text-[13px] text-text-primary placeholder:text-text-tertiary/50 focus:outline-none focus:border-brand-action/50 transition-colors resize-y min-h-[160px] font-mono leading-relaxed"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-widest text-text-tertiary mb-2">Or choose file</label>
            <input
              name="file"
              type="file"
              disabled={uploadBusy}
              accept=".md,.markdown,.txt,.text,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/markdown,text/plain"
              className="block w-full text-[13px] text-text-secondary file:mr-3 file:rounded-lg file:border file:border-border-subtle file:bg-surface-secondary file:px-3 file:py-2 file:text-[12px] file:font-medium file:text-text-secondary hover:file:text-text-primary file:cursor-pointer file:transition-colors"
            />
          </div>
          <button
            type="submit"
            disabled={uploadBusy}
            className="w-full rounded-full py-2.5 text-[13px] font-semibold bg-text-primary text-surface-primary disabled:opacity-50 transition-opacity"
          >
            {uploadBusy ? "Importing…" : "Import & open preview"}
          </button>
          {uploadErr && <ErrorBanner message={uploadErr} />}
        </form>

        {/* ── Upload history ──────────────────────────────────────────── */}
        <div className="mt-6 space-y-3">
          <div className="flex items-center gap-2">
            <p className="text-[13px] font-semibold text-text-primary">
              Recent uploads
            </p>
            <span className="text-[12px] font-normal text-text-tertiary">
              ({uploadHistory.length} saved)
            </span>
          </div>
          {uploadHistory.length === 0 ? (
            <p className="text-[13px] text-text-tertiary py-4">
              No uploads yet. Import an article above — it will appear here.
            </p>
          ) : (
            <div className="space-y-2">
              {uploadHistory.map(entry => (
                <div
                  key={entry.blogId}
                  className="flex items-center justify-between gap-3 rounded-[12px] border border-border-subtle bg-surface-elevated px-4 py-3 hover:border-border-strong transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-medium text-text-primary truncate">{entry.title}</p>
                    <div className="flex items-center gap-3 mt-0.5">
                      {entry.keyword && (
                        <span className="text-[11px] text-text-tertiary">
                          <span className="text-text-secondary font-medium">KW:</span> {entry.keyword}
                        </span>
                      )}
                      <span className="text-[11px] text-text-tertiary/60">
                        {new Date(entry.uploadedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                  </div>
                  <ProjectNavLink
                    href={`/projects/${projectId}/blogs/${entry.blogId}${BLOG_QUERY_FROM_ANALYZE_CONTENT}`}
                    className="shrink-0 inline-flex h-8 items-center gap-1.5 rounded-full border border-border-subtle bg-surface-secondary px-3 text-[11px] font-semibold text-text-secondary hover:text-text-primary hover:border-border-strong transition-colors"
                  >
                    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z"/><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"/></svg>
                    Open
                  </ProjectNavLink>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── url tab ────────────────────────────────────────────────────── */}
      <div hidden={tab !== "url"} className="space-y-6">
        <p className="text-[14px] text-text-secondary leading-relaxed">
          Paste any public article URL. We scrape the live page, attach vendor signals, run Gemini diagnosis, and save the result to your project.
        </p>

        {/* form */}
        <form
          onSubmit={onAnalyzeUrl}
          className="max-w-2xl flex flex-col sm:flex-row items-stretch gap-3"
        >
          <div className="flex-1 relative">
            <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244" /></svg>
            <input
              id="external-blog-url"
              type="url"
              inputMode="url"
              placeholder="https://example.com/blog/your-article"
              value={urlInput ?? ""}
              onChange={e => setUrlInput(e.target.value)}
              disabled={urlBusy}
              className="w-full rounded-[12px] border border-border-subtle bg-surface-elevated pl-10 pr-4 py-3 text-[14px] text-text-primary placeholder:text-text-tertiary/50 focus:outline-none focus:border-brand-action/50 transition-colors"
            />
          </div>
          <button
            type="submit"
            disabled={urlBusy || !urlInput.trim()}
            className="inline-flex h-12 items-center gap-2 rounded-full bg-brand-primary px-6 text-[13px] font-semibold text-brand-on-primary transition-opacity hover:opacity-90 disabled:opacity-50 shrink-0"
          >
            {urlBusy
              ? <><Spinner size={14} className="border-brand-on-primary/30 border-t-brand-on-primary" /> Analyzing…</>
              : <>
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 15.803a7.5 7.5 0 0 0 10.607 0z" /></svg>
                  Analyze & score
                </>
            }
          </button>
        </form>

        {urlErr && <ErrorBanner message={urlErr} />}

        {developerMode && lastRawScrape ? (
          <RawScrapePanel
            url={lastRawScrape.url}
            markdown={lastRawScrape.markdown}
            heading="Latest analyze — raw scrape"
          />
        ) : null}

        {/* ── history list ──────────────────────────────────────────────── */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setHistoryOpen(o => !o)}
              className="flex items-center gap-2 text-[13px] font-semibold text-text-primary hover:text-brand-action transition-colors"
            >
              <svg className={`w-4 h-4 text-text-tertiary transition-transform duration-200 ${historyOpen ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
              </svg>
              Recent analyses
              <span className="text-[12px] font-normal text-text-tertiary">
                ({historyRows.length} saved)
              </span>
            </button>
            {historyQuery.isFetching && <Spinner size={14} />}
          </div>

          {historyOpen && (
            <div className="space-y-2">
              {historyQuery.isLoading ? (
                <SkeletonRows count={4} />
              ) : historyRows.length === 0 ? (
                <p className="text-[13px] text-text-tertiary py-4">
                  No external URL audits yet. Analyze a blog link above — it will appear here.
                </p>
              ) : (
                historyRows.map(row => {
                  const entryId = linksByUrl[row.url]?.entryId;
                  return (
                  <HistoryRow
                    key={row.url}
                    record={row}
                    open={expandedUrl === row.url}
                    onToggle={() => setExpandedUrl(prev => prev === row.url ? null : row.url)}
                    projectId={projectId!}
                    link={linksByUrl[row.url]}
                    scheduleBusy={schedulingUrl === row.url}
                    generateBusy={generatingUrl === row.url}
                    enhanceBusy={enhancingUrl === row.url}
                    repairSessionBlogId={repairBlogIdByAuditUrl[row.url]}
                    onSchedule={() => void scheduleKeyword(row)}
                    onGenerate={() => void generateFromAnalyze(row)}
                    onGenerateEnhanced={() => void generateEnhancedVersion(row)}
                    scheduleMsg={scheduleMessages[row.url]}
                    scheduledDatesSet={scheduledDatesSet}
                    datePickerOpen={pickingDateForAuditUrl === row.url}
                    onDatePickerOpenChange={open => {
                      if (open && !entryId) return;
                      setPickingDateForAuditUrl(open ? row.url : null);
                    }}
                    onRescheduleConfirm={date => {
                      if (entryId) void rescheduleAnalyzeEntry(row.url, entryId, date);
                    }}
                    rescheduleSaving={rescheduleSaving}
                    developerMode={developerMode}
                  />
                  );
                })
              )}
            </div>
          )}
        </div>
      </div>
    </CHPageShell>
  );
}
