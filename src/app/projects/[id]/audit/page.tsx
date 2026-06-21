"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useParams } from "next/navigation";
import { contentAuditApi, type ContentAuditHistoryItem } from "@/frontend/api/content-audit";
import type { ContentAuditReport, ContentAuditScores } from "@/lib/content-audit-studio";
import {
  ScoreRing, ScoreCard, SeverityChip, CategoryBadge, RubricStatus,
  StepIndicator, EmptyState, Spinner, KeywordVerdictChip, scoreGrade, scoreColor,
} from "./_shared/ch-ui";

// ─── Analysis steps ───────────────────────────────────────────────────────────

const STEPS = [
  { label: "Scraping page" },
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

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ContentAuditStudioPage() {
  const { id: projectId } = useParams<{ id: string }>();

  const [url, setUrl] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisStep, setAnalysisStep] = useState(-1);
  const [error, setError] = useState("");
  const [report, setReport] = useState<ContentAuditReport | null>(null);
  const [history, setHistory] = useState<ContentAuditHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"issues" | "rubric" | "competitors" | "brief">("issues");
  const [expandedBrief, setExpandedBrief] = useState(false);

  const stepTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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

  useEffect(() => { void loadHistory(); }, [loadHistory]);

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

  const handleAnalyze = async (targetUrl?: string) => {
    const auditUrl = (targetUrl ?? url).trim();
    if (!auditUrl) { setError("Please enter a URL to audit."); inputRef.current?.focus(); return; }
    if (!/^https?:\/\//i.test(auditUrl)) { setError("Please include https:// in the URL."); return; }

    setError("");
    setReport(null);
    setAnalyzing(true);
    startStepAnimation();

    try {
      const res = await contentAuditApi.analyze(projectId, auditUrl);
      if (!res.success || !res.report) {
        setError(res.error ?? "Analysis failed. Please try again.");
        return;
      }
      setReport(res.report);
      setActiveTab("issues");
      void loadHistory();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unexpected error. Please try again.");
    } finally {
      setAnalyzing(false);
      stopStepAnimation();
    }
  };

  return (
    <div className="relative space-y-6 pb-20 pl-4 pr-4 -mt-6 lg:-mt-8">

      {/* ── Header ── */}
      <div className="sticky -top-6 lg:-top-8 z-20 -mx-4 border-b border-border-subtle bg-surface-primary/95 px-4 pb-6 pt-6 lg:pt-8 backdrop-blur-sm">
        <div className="max-w-3xl">
          <h1 className="text-[26px] font-bold tracking-tight text-text-primary">Content Audit Studio</h1>
          <p className="mt-1 text-[14px] text-text-tertiary leading-relaxed">
            Enter any blog URL to get a full AI-powered audit — SEO, GEO, AEO scores, competitor insights, and a complete revamp brief.
          </p>
        </div>
      </div>

      {/* ── URL Input ── */}
      <div className="max-w-3xl">
        <div className="rounded-[20px] border border-border-subtle bg-surface-elevated p-6 shadow-sm">
          <label className="block text-[13px] font-semibold text-text-secondary mb-3">
            Blog or article URL to audit
          </label>
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

          {error && (
            <div className="mt-3 flex items-start gap-2 text-[13px] text-rose-400 bg-rose-500/8 border border-rose-500/20 rounded-[10px] px-3 py-2.5">
              <svg className="w-4 h-4 shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0zm-9 3.75h.008v.008H12v-.008z" />
              </svg>
              {error}
            </div>
          )}

          {/* Step progress */}
          {analyzing && (
            <div className="mt-4 pt-4 border-t border-border-subtle">
              <p className="text-[11px] font-semibold text-text-tertiary uppercase tracking-wide mb-3">Analyzing your content…</p>
              <StepIndicator steps={STEPS} currentStep={analysisStep} />
              <p className="mt-3 text-[12px] text-text-tertiary">This takes 30–90 seconds. Please wait while we scrape the page, check competitors, and run AI analysis.</p>
            </div>
          )}
        </div>
      </div>

      {/* ── Results ── */}
      {report && <AuditResults report={report} activeTab={activeTab} setActiveTab={setActiveTab} expandedBrief={expandedBrief} setExpandedBrief={setExpandedBrief} />}

      {/* ── History ── */}
      {!analyzing && !report && (
        <AuditHistory
          items={history}
          loading={historyLoading}
          onRerun={u => { setUrl(u); void handleAnalyze(u); }}
        />
      )}

      {/* History below results too */}
      {report && history.length > 0 && (
        <div className="max-w-4xl">
          <AuditHistory
            items={history}
            loading={false}
            onRerun={u => { setUrl(u); void handleAnalyze(u); }}
            compact
          />
        </div>
      )}
    </div>
  );
}

// ─── Audit Results ─────────────────────────────────────────────────────────

function AuditResults({
  report, activeTab, setActiveTab, expandedBrief, setExpandedBrief,
}: {
  report: ContentAuditReport;
  activeTab: "issues" | "rubric" | "competitors" | "brief";
  setActiveTab: (t: "issues" | "rubric" | "competitors" | "brief") => void;
  expandedBrief: boolean;
  setExpandedBrief: (v: boolean) => void;
}) {
  const overall = report.scores.overall;
  const grade = scoreGrade(overall);
  const color = scoreColor(overall);

  return (
    <div className="max-w-4xl space-y-6">

      {/* ── Overall score hero ── */}
      <div className="rounded-[20px] border border-border-subtle bg-surface-elevated p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row gap-6 items-start">
          {/* Big score ring */}
          <div className="flex items-center gap-5 shrink-0">
            <ScoreRing score={overall} size={96} strokeWidth={7} />
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[32px] font-bold" style={{ color }}>{grade}</span>
                <span className="text-[13px] text-text-tertiary font-medium">Grade</span>
              </div>
              <p className="text-[13px] font-semibold text-text-secondary">Overall Audit Score</p>
              <a
                href={report.url}
                target="_blank" rel="noopener noreferrer"
                className="mt-1 block text-[12px] text-text-tertiary hover:text-brand-violet transition-colors truncate max-w-[260px]"
              >
                {report.url}
              </a>
            </div>
          </div>

          {/* Verdict */}
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
              {report.keyword_data && (
                <KeywordVerdictChip verdict={report.keyword_data.verdict} volume={report.keyword_data.volume} />
              )}
              {report.word_count > 0 && (
                <span className="text-[11px] text-text-tertiary">{report.word_count.toLocaleString()} words</span>
              )}
              {report.publish_date_detected && (
                <span className="text-[11px] text-text-tertiary">Published ~{report.publish_date_detected}</span>
              )}
            </div>
            <p className="text-[14px] text-text-primary leading-relaxed font-medium">{report.plain_language_verdict}</p>
          </div>
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
          />
        ))}
      </div>

      {/* ── Tab navigation ── */}
      <div className="border-b border-border-subtle">
        <nav className="flex gap-1 -mb-px">
          {(["issues", "rubric", "competitors", "brief"] as const).map(tab => {
            const labels: Record<string, string> = {
              issues: `Issues (${report.issues.length})`,
              rubric: `Quality Checklist`,
              competitors: `Competitors (${report.competitor_insights.length})`,
              brief: "Revamp Brief",
            };
            return (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2.5 text-[13px] font-medium border-b-2 transition-all whitespace-nowrap ${
                  activeTab === tab
                    ? "border-brand-violet text-brand-violet"
                    : "border-transparent text-text-tertiary hover:text-text-primary"
                }`}
              >
                {labels[tab]}
              </button>
            );
          })}
        </nav>
      </div>

      {/* ── Tab content ── */}
      {activeTab === "issues" && <IssuesPanel issues={report.issues} />}
      {activeTab === "rubric" && <RubricPanel rows={report.quality_rubric} />}
      {activeTab === "competitors" && <CompetitorsPanel insights={report.competitor_insights} />}
      {activeTab === "brief" && (
        <RevampBriefPanel
          brief={report.revamp_brief}
          expanded={expandedBrief}
          setExpanded={setExpandedBrief}
        />
      )}
    </div>
  );
}

// ─── Issues panel ─────────────────────────────────────────────────────────────

const SEVERITY_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };

function IssuesPanel({ issues }: { issues: ContentAuditReport["issues"] }) {
  const sorted = [...issues].sort((a, b) =>
    (SEVERITY_ORDER[a.severity] ?? 99) - (SEVERITY_ORDER[b.severity] ?? 99)
  );

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
      {sorted.map((issue, i) => (
        <IssueCard key={issue.id || i} issue={issue} />
      ))}
    </div>
  );
}

function IssueCard({ issue }: { issue: ContentAuditReport["issues"][0] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-[14px] border border-border-subtle bg-surface-elevated overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-start gap-3 p-4 text-left hover:bg-surface-hover transition-colors"
      >
        <div className="flex items-center gap-2 flex-wrap flex-1 min-w-0">
          <SeverityChip severity={issue.severity} />
          <CategoryBadge category={issue.category} />
          <span className="text-[13px] font-semibold text-text-primary leading-snug">{issue.title}</span>
        </div>
        <svg
          className={`w-4 h-4 text-text-tertiary shrink-0 transition-transform mt-0.5 ${open ? "rotate-180" : ""}`}
          viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}
        >
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
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${pct}%`, background: scoreColor(pct) }}
          />
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
      <p className="text-[13px] text-text-tertiary">
        These are the pages currently outranking you for your primary keyword. Here&apos;s what they&apos;re doing differently.
      </p>
      {insights.map((c, i) => (
        <div key={c.url} className="rounded-[14px] border border-border-subtle bg-surface-elevated p-4">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-surface-tertiary text-text-tertiary text-[11px] font-bold flex items-center justify-center shrink-0">
                #{i + 1}
              </span>
              <div className="min-w-0">
                <p className="text-[13px] font-semibold text-text-primary leading-snug line-clamp-1">{c.title}</p>
                <a href={c.url} target="_blank" rel="noopener noreferrer" className="text-[11px] text-text-tertiary hover:text-brand-violet transition-colors truncate block">
                  {c.url}
                </a>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-3 text-[11px] text-text-tertiary mb-3">
            <span className="flex items-center gap-1">
              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25" /></svg>
              {c.word_count.toLocaleString()} words
            </span>
            <span className="flex items-center gap-1">
              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><path d="M4 6h16M4 12h8M4 18h4" strokeLinecap="round" /></svg>
              {c.h2_count} H2 sections
            </span>
            {c.has_faq && <span className="text-emerald-400">✓ FAQ section</span>}
            {c.has_schema && <span className="text-emerald-400">✓ Schema markup</span>}
          </div>
          {c.advantages.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[10px] font-bold uppercase tracking-wide text-text-tertiary">What they do better:</p>
              {c.advantages.map((adv, j) => (
                <div key={j} className="flex items-start gap-2 text-[12px] text-text-secondary">
                  <span className="text-rose-400 shrink-0 mt-0.5">→</span>
                  {adv}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Revamp brief ─────────────────────────────────────────────────────────────

function RevampBriefPanel({
  brief, expanded, setExpanded,
}: {
  brief: ContentAuditReport["revamp_brief"];
  expanded: boolean;
  setExpanded: (v: boolean) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-[14px] border border-brand-violet/20 bg-brand-violet/5 p-4">
        <div className="flex items-start gap-3 mb-3">
          <svg className="w-5 h-5 text-brand-violet shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09z" />
          </svg>
          <div>
            <p className="text-[14px] font-semibold text-text-primary">Content Revamp Brief</p>
            <p className="text-[12px] text-text-tertiary mt-0.5">
              A complete brief for regenerating this blog with AI. Copy this to your content generator.
            </p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-3">
            <BriefField label="Target keyword" value={brief.target_keyword} />
            <BriefField label="Suggested title" value={brief.suggested_title} />
            <BriefField label="Meta description" value={brief.suggested_meta} />
            <BriefField label="Content angle" value={brief.content_angle} />
            <BriefField label="Recommended length" value={`${brief.recommended_word_count.toLocaleString()}+ words`} />
          </div>
          <div className="space-y-3">
            <BriefListField label="Schema types to add" items={brief.schema_types} color="blue" />
            <BriefListField label="Key H2 sections" items={brief.key_sections} color="violet" />
          </div>
        </div>

        {expanded && (
          <div className="mt-4 pt-4 border-t border-brand-violet/15 grid gap-4 sm:grid-cols-2">
            <BriefListField label="Missing topics to cover" items={brief.missing_topics} color="amber" />
            <BriefListField label="Competitor gaps to fill" items={brief.competitor_gaps} color="rose" />
            <div className="sm:col-span-2">
              <BriefListField label="FAQ questions to answer" items={brief.faq_questions} color="emerald" numbered />
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="mt-4 text-[12px] font-medium text-brand-violet hover:text-brand-violet/80 transition-colors flex items-center gap-1"
        >
          {expanded ? "Show less" : "Show full brief (gaps, FAQ questions)"}
          <svg className={`w-3 h-3 transition-transform ${expanded ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
          </svg>
        </button>
      </div>
    </div>
  );
}

function BriefField({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wide text-text-tertiary mb-1">{label}</p>
      <p className="text-[13px] text-text-primary leading-relaxed">{value}</p>
    </div>
  );
}

function BriefListField({
  label, items, color, numbered,
}: {
  label: string;
  items: string[];
  color: string;
  numbered?: boolean;
}) {
  if (!items.length) return null;
  const colorCls: Record<string, string> = {
    blue: "text-blue-400",
    violet: "text-violet-400",
    amber: "text-amber-400",
    rose: "text-rose-400",
    emerald: "text-emerald-400",
  };
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wide text-text-tertiary mb-1.5">{label}</p>
      <ul className="space-y-1">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-2 text-[12px] text-text-secondary">
            <span className={`${colorCls[color] ?? "text-brand-violet"} shrink-0 font-semibold`}>{numbered ? `${i + 1}.` : "→"}</span>
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── Audit History ────────────────────────────────────────────────────────────

function AuditHistory({
  items, loading, onRerun, compact,
}: {
  items: ContentAuditHistoryItem[];
  loading: boolean;
  onRerun: (url: string) => void;
  compact?: boolean;
}) {
  if (loading) {
    return (
      <div className="max-w-3xl space-y-2">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-16 rounded-[12px] bg-surface-elevated border border-border-subtle animate-pulse" />
        ))}
      </div>
    );
  }

  if (!items.length) {
    return compact ? null : (
      <div className="max-w-3xl">
        <EmptyState
          icon={
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />
            </svg>
          }
          title="No audits yet"
          body="Enter a blog URL above to run your first content audit. Results are saved here for quick reference."
        />
      </div>
    );
  }

  return (
    <div className="max-w-3xl">
      <h2 className="text-[14px] font-semibold text-text-secondary mb-3 flex items-center gap-2">
        <svg className="w-4 h-4 text-text-tertiary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />
        </svg>
        Recent audits
      </h2>
      <div className="space-y-2">
        {items.slice(0, compact ? 5 : 10).map(item => {
          const score = item.overall_score || item.health_score;
          const color = scoreColor(score);
          return (
            <div key={item.url} className="flex items-center gap-3 rounded-[12px] border border-border-subtle bg-surface-elevated px-4 py-3 hover:border-border-strong transition-all">
              <div className="shrink-0">
                <span
                  className="text-[16px] font-bold tabular-nums"
                  style={{ color }}
                >
                  {score}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-semibold text-text-primary leading-snug truncate">{item.title || item.url}</p>
                <p className="text-[11px] text-text-tertiary truncate">{item.url}</p>
                {item.primary_keyword && (
                  <p className="text-[10px] text-text-tertiary/60 mt-0.5">Keyword: {item.primary_keyword}</p>
                )}
              </div>
              <div className="shrink-0 flex items-center gap-2">
                <span className="text-[10px] text-text-tertiary">
                  {new Date(item.updated_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </span>
                <button
                  type="button"
                  onClick={() => onRerun(item.url)}
                  className="inline-flex items-center gap-1 h-7 px-2.5 rounded-[8px] border border-border-subtle bg-surface-secondary text-[11px] font-medium text-text-secondary hover:text-text-primary hover:border-border-strong transition-all"
                >
                  <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
                  </svg>
                  Re-audit
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

