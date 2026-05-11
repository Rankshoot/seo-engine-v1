"use client";

import { useParams, useRouter } from "next/navigation";
import { useState, useRef, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { importUploadedArticle } from "@/app/actions/import-content-actions";
import {
  auditExternalBlogUrl,
  getExternalBlogAuditsForAnalyzePage,
  markAnalyzePageAuditCalendarScheduled,
} from "@/app/actions/audit-actions";
import { ProjectNavLink } from "@/components/ProjectNavLink";
import { qk } from "@/lib/query";
import type { PersistedBlogAudit } from "@/app/actions/audit-actions";
import {
  CHPageShell,
  ScoreRing,
  SeverityChip,
  DemandChip,
  FunnelChip,
  ErrorBanner,
  SuccessBanner,
  SkeletonRows,
  Spinner,
  healthScoreColor,
  SectionLabel,
} from "../_shared/ch-ui";

type AnalyzeTab = "upload" | "url";

function fmtWhen(iso?: string) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch { return iso; }
}

// ─── inline expanded analysis ─────────────────────────────────────────────

function AnalysisPanel({
  record,
  projectId,
  scheduleBusy,
  onSchedule,
  scheduleMsg,
}: {
  record: PersistedBlogAudit;
  projectId: string;
  scheduleBusy: boolean;
  onSchedule: () => void;
  scheduleMsg?: string;
}) {
  const a = record.analysis;
  const meta = a.analyze_page_meta;
  const alreadyScheduled = meta?.calendar_scheduled && meta.calendar_scheduled_date;
  const { text } = healthScoreColor(record.health_score);
  const rubric = a.quality_rubric ?? [];
  const rcPass = rubric.filter(r => r.status === "pass").length;
  const rcWarn = rubric.filter(r => r.status === "warn").length;
  const rcFail = rubric.filter(r => r.status === "fail").length;

  return (
    <div className="mt-4 space-y-6 border-t border-border-subtle pt-5">
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

      {/* schedule action */}
      <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-border-subtle">
        {alreadyScheduled ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-[13px] font-medium text-emerald-400">
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="m5 13 4 4L19 7"/></svg>
            On calendar · {meta.calendar_scheduled_date}
          </span>
        ) : (
          <button
            type="button"
            disabled={scheduleBusy || !record.primary_keyword?.trim()}
            onClick={onSchedule}
            className="inline-flex h-9 items-center gap-2 rounded-full bg-brand-primary px-5 text-[13px] font-semibold text-brand-on-primary transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {scheduleBusy ? <><Spinner size={14} className="border-brand-on-primary/30 border-t-brand-on-primary" /> Scheduling…</> : <>
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
              Schedule keyword on calendar
            </>}
          </button>
        )}
        <ProjectNavLink
          href={`/projects/${projectId}/audit`}
          className="text-[13px] text-text-tertiary underline-offset-2 hover:text-text-primary hover:underline transition-colors"
        >
          Open Site audit →
        </ProjectNavLink>
        {scheduleMsg && (
          <span className={`text-[12px] font-medium ${scheduleMsg.startsWith("Scheduled") || scheduleMsg.startsWith("On calendar") ? "text-emerald-400" : "text-rose-400"}`}>
            {scheduleMsg}
          </span>
        )}
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
  scheduleBusy,
  onSchedule,
  scheduleMsg,
}: {
  record: PersistedBlogAudit;
  open: boolean;
  onToggle: () => void;
  projectId: string;
  scheduleBusy: boolean;
  onSchedule: () => void;
  scheduleMsg?: string;
}) {
  const a = record.analysis;
  const meta = a.analyze_page_meta;
  const scheduled = meta?.calendar_scheduled && meta.calendar_scheduled_date;
  const { text } = healthScoreColor(record.health_score);

  let host = record.url;
  try { host = new URL(record.url).hostname.replace(/^www\./, ""); } catch { /**/ }

  return (
    <div className={`rounded-[14px] border transition-all ${open ? "border-brand-action/30 bg-surface-elevated" : "border-border-subtle bg-surface-elevated hover:border-border-strong"}`}>
      {/* summary row */}
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-4 px-4 py-3.5 text-left"
      >
        <ScoreRing score={record.health_score} size={44} />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-text-primary truncate" title={record.title}>{record.title || host}</p>
          <p className="text-[11px] text-text-tertiary truncate">{host} · {fmtWhen(record.updated_at)}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {scheduled && (
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-400">
              <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="m5 13 4 4L19 7"/></svg>
              Scheduled
            </span>
          )}
          {a.issues?.some(i => i.severity === "high") && !scheduled && (
            <span className="w-2 h-2 rounded-full bg-rose-400 shrink-0" title="High-severity issues" />
          )}
          <svg
            className={`w-4 h-4 text-text-tertiary transition-transform duration-200 ${open ? "rotate-180" : ""}`}
            viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
          </svg>
        </div>
      </button>

      {/* expanded panel */}
      {open && (
        <div className="px-4 pb-5">
          <AnalysisPanel
            record={record}
            projectId={projectId}
            scheduleBusy={scheduleBusy}
            onSchedule={onSchedule}
            scheduleMsg={scheduleMsg}
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
  const [tab, setTab] = useState<AnalyzeTab>("upload");

  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadErr, setUploadErr] = useState("");
  const formRef = useRef<HTMLFormElement>(null);

  const [urlInput, setUrlInput] = useState("");
  const [urlBusy, setUrlBusy] = useState(false);
  const [urlErr, setUrlErr] = useState("");

  const [schedulingUrl, setSchedulingUrl] = useState<string | null>(null);
  const [scheduleMessages, setScheduleMessages] = useState<Record<string, string>>({});
  const [expandedUrl, setExpandedUrl] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(true);

  const historyQuery = useQuery({
    queryKey: [...qk.audits(projectId!), "external-analyze-history"],
    queryFn: () => getExternalBlogAuditsForAnalyzePage(projectId!, 40),
    enabled: Boolean(projectId),
  });
  const historyRows = historyQuery.data?.success ? historyQuery.data.data : [];

  const refetchHistory = useCallback(async () => {
    if (!projectId) return;
    await queryClient.refetchQueries({ queryKey: [...qk.audits(projectId), "external-analyze-history"] });
  }, [queryClient, projectId]);

  async function onUploadSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!projectId) return;
    const fd = new FormData(e.currentTarget);
    const file = fd.get("file");
    if (!file || !(file instanceof File) || file.size === 0) { setUploadErr("Choose a file to upload."); return; }
    setUploadBusy(true); setUploadErr("");
    try {
      const res = await importUploadedArticle(projectId, fd);
      if (res.trace?.length) console.log("[import-content] trace", res.trace);
      if (res.success && res.blogId) { router.push(`/projects/${projectId}/blogs/${res.blogId}`); return; }
      setUploadErr(res.error ?? "Import failed.");
    } catch (ex) { setUploadErr(ex instanceof Error ? ex.message : "Import failed."); }
    finally { setUploadBusy(false); }
  }

  async function onAnalyzeUrl(e: React.FormEvent) {
    e.preventDefault();
    if (!projectId) return;
    setUrlBusy(true); setUrlErr("");
    try {
      const res = await auditExternalBlogUrl(projectId, urlInput);
      if (res.trace?.length) console.log("[content-health external URL] trace", res.trace);
      if (res.success && res.record) {
        setExpandedUrl(res.record.url);
        await queryClient.invalidateQueries({ queryKey: qk.audits(projectId) });
        await refetchHistory();
        return;
      }
      setUrlErr(res.error ?? "Could not analyze that URL.");
    } catch (ex) { setUrlErr(ex instanceof Error ? ex.message : "Could not analyze that URL."); }
    finally { setUrlBusy(false); }
  }

  async function scheduleKeyword(record: PersistedBlogAudit) {
    if (!projectId || !record.primary_keyword?.trim()) return;
    const url = record.url;
    setSchedulingUrl(url);
    try {
      const kw = record.primary_keyword.trim();
      const res = await fetch(`/api/v1/projects/${projectId}/calendar/add-custom`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyword: kw, title: record.title?.trim() || kw, articleType: "Blog Post", writerNotes: `Scheduled from external reference audit.\nSource: ${url}` }),
      });
      const data = (await res.json()) as { success?: boolean; error?: string; scheduled_date?: string };
      if (data.success && data.scheduled_date) {
        await markAnalyzePageAuditCalendarScheduled(projectId, url, data.scheduled_date);
        setScheduleMessages(m => ({ ...m, [url]: `Scheduled for ${data.scheduled_date!.slice(0, 10)}.` }));
        await queryClient.invalidateQueries({ queryKey: qk.calendar(projectId) });
        await queryClient.invalidateQueries({ queryKey: qk.calendarWithBlogs(projectId) });
        await queryClient.invalidateQueries({ queryKey: qk.keywords(projectId) });
        await refetchHistory();
      } else {
        setScheduleMessages(m => ({ ...m, [url]: data.error ?? "Could not add to calendar." }));
      }
    } catch { setScheduleMessages(m => ({ ...m, [record.url]: "Could not add to calendar." })); }
    finally { setSchedulingUrl(null); }
  }

  return (
    <CHPageShell
      backHref={`/projects/${projectId}/audit`}
      backLabel="← Site audit"
      title="Analyze content"
      subtitle="Upload a draft to open it in the blog workspace, or analyze any public article URL through the full Content Health pipeline and optionally schedule the inferred keyword."
    >
      {/* ── tab switch ─────────────────────────────────────────────────── */}
      <div
        className="flex max-w-sm rounded-full border border-border-subtle p-0.5 bg-surface-elevated"
        role="tablist"
        aria-label="Analyze mode"
      >
        {(["upload", "url"] as AnalyzeTab[]).map(t => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`flex-1 rounded-full py-2.5 text-[13px] font-semibold transition-all duration-150 ${
              tab === t
                ? "bg-text-primary text-surface-primary shadow-sm"
                : "text-text-secondary hover:text-text-primary"
            }`}
          >
            {t === "upload" ? "Upload file" : "Blog link"}
          </button>
        ))}
      </div>

      {/* ── upload tab ─────────────────────────────────────────────────── */}
      <div hidden={tab !== "upload"}>
        <p className="text-[14px] text-text-secondary leading-relaxed mb-5">
          Markdown (.md), plain text (.txt), or Word (.docx). We normalize links, infer keyword and meta description with Gemini, then open the blog workspace.
        </p>
        <form
          ref={formRef}
          onSubmit={onUploadSubmit}
          className="max-w-lg rounded-[16px] border border-border-subtle bg-surface-elevated p-6 space-y-4"
        >
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-widest text-text-tertiary mb-2">File</label>
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
                historyRows.map(row => (
                  <HistoryRow
                    key={row.url}
                    record={row}
                    open={expandedUrl === row.url}
                    onToggle={() => setExpandedUrl(prev => prev === row.url ? null : row.url)}
                    projectId={projectId!}
                    scheduleBusy={schedulingUrl === row.url}
                    onSchedule={() => void scheduleKeyword(row)}
                    scheduleMsg={scheduleMessages[row.url]}
                  />
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </CHPageShell>
  );
}
