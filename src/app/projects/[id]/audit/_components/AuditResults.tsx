"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import type { ContentAuditReport } from "@/lib/content-audit-studio";
import { CalendarDatePicker } from "@/components/CalendarDatePicker";
import {
  ScoreRing, ScoreCard, Spinner, KeywordVerdictChip, scoreGrade, scoreColor,
} from "../_shared/ch-ui";
import { SCORE_DIMS, type ScoreDim } from "./audit-config";
import { IssuesPanel } from "./IssuesPanel";
import { RubricPanel } from "./RubricPanel";
import { CompetitorsPanel } from "./CompetitorsPanel";

export function AuditResults({
  report, reportSource, projectId, activeTab, setActiveTab,
  generating, generatedBlogId, generateError, onGenerate,
  scheduleSaving, scheduledDate, onSchedule, scheduleOpen, setScheduleOpen, onReschedule, scheduledDates,
  onClose,
}: {
  report: ContentAuditReport;
  reportSource: "url" | "upload";
  projectId: string;
  activeTab: "issues" | "rubric" | "competitors";
  setActiveTab: (t: "issues" | "rubric" | "competitors") => void;
  generating: boolean;
  generatedBlogId: string | null;
  generateError: string;
  onGenerate: () => void;
  scheduleSaving: boolean;
  scheduledDate: string | null;
  onSchedule: (date: string) => void;
  scheduleOpen: boolean;
  setScheduleOpen: (v: boolean) => void;
  onReschedule: (date: string) => void;
  scheduledDates: Set<string>;
  onClose?: () => void;
}) {
  const overall = report.scores.overall;
  const grade = scoreGrade(overall);
  const color = scoreColor(overall);
  const router = useRouter();

  const nextVacantDate = useMemo(() => {
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    for (let i = 0; i < 500; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      if (!scheduledDates.has(key)) return key;
    }
    return null;
  }, [scheduledDates]);

  const getMetricValue = (key: ScoreDim["key"]) => {
    const getRubricRow = (id: string) => report.quality_rubric.find(r => r.id === id);
    if (key === "seo") {
      const linkRow = getRubricRow("internal_links");
      const count = linkRow?.detail.match(/^\d+/)?.[0] || "0";
      return `${count} Int. Links`;
    }
    if (key === "geo") {
      const citeRow = getRubricRow("external_citations");
      const count = citeRow?.detail.match(/^\d+/)?.[0] || "0";
      return `${count} Citations`;
    }
    if (key === "aeo") {
      const faqRow = getRubricRow("faq_section");
      return faqRow?.status === "pass" ? "FAQ Schema OK" : "No FAQ Schema";
    }
    if (key === "content_quality") {
      return `${report.word_count.toLocaleString()} Words`;
    }
    if (key === "keyword_relevance") {
      if (report.keyword_data) {
        const vol = report.keyword_data.volume;
        return vol >= 1000 ? `${(vol / 1000).toFixed(1)}k/mo Vol` : `${vol}/mo Vol`;
      }
      return "No Keyword";
    }
    if (key === "freshness") {
      return report.publish_date_detected || "No Publish Date";
    }
    return undefined;
  };

  const getDimensionExplanation = (key: ScoreDim["key"], score: number) => {
    const categoryIssues = report.issues.filter(issue => {
      const cat = issue.category.toLowerCase();
      if (key === "seo") return cat === "seo" || cat === "technical";
      if (key === "geo") return cat === "geo";
      if (key === "aeo") return cat === "aeo";
      if (key === "content_quality") return cat === "content" || cat === "quality";
      if (key === "keyword_relevance") return cat === "keyword";
      if (key === "freshness") return cat === "freshness";
      return false;
    });

    const rubricWarnings = report.quality_rubric.filter(row => {
      const rowId = row.id;
      const status = row.status;
      if (status === "pass") return false;
      if (key === "seo") return rowId === "heading_structure" || rowId === "article_schema" || rowId === "internal_links";
      if (key === "geo") return rowId === "direct_answer" || rowId === "external_citations";
      if (key === "aeo") return rowId === "faq_section" || rowId === "question_headings";
      if (key === "content_quality") return rowId === "content_depth";
      return false;
    });

    if (score >= 90) {
      if (categoryIssues.length === 0) {
        if (key === "seo") return "Fully optimized: headings, internal links, and schemas are perfect.";
        if (key === "geo") return "Perfect for AI Search: has direct answers and citation opportunities.";
        if (key === "aeo") return "Perfect for Answer Engines: features FAQs and question-style headers.";
        if (key === "content_quality") return "Exceptional depth: comprehensive coverage, high readability, and word count.";
        if (key === "keyword_relevance") return "Strong targeting: aligned with highly active, stable/trending search demand.";
        if (key === "freshness") return "Fresh content: current information and up-to-date publishing signals.";
        return "Excellent score! Fully optimized for this criteria.";
      }
    }

    if (categoryIssues.length > 0) {
      const topIssue = categoryIssues.find(i => i.severity === "critical") || 
                       categoryIssues.find(i => i.severity === "high") || 
                       categoryIssues[0];
      const restCount = categoryIssues.length - 1;
      const restText = restCount > 0 ? ` (+${restCount} more)` : "";
      return `Fix: ${topIssue.title}${restText}`;
    }

    if (rubricWarnings.length > 0) {
      const firstWarn = rubricWarnings[0];
      return `Improvement: ${firstWarn.label.replace(/\s*\(AEO\)|\s*\(GEO\)/g, "")}`;
    }

    if (key === "seo") {
      if (score < 60) return "Needs heading structure, schemas, and more internal linking.";
      if (score < 80) return "Good schema tags, but heading structure or link counts can be improved.";
      return "Optimized SEO: basic heading hierarchy and metadata are in order.";
    }
    if (key === "geo") {
      if (score < 60) return "Needs direct answers at the top and source citations.";
      if (score < 80) return "Add concise introductory answers to target AI Overviews.";
      return "Optimized GEO: clear structuring with source references.";
    }
    if (key === "aeo") {
      if (score < 60) return "Add an FAQ section and question-based H2/H3 headings.";
      if (score < 80) return "Consider adding an FAQ schema to improve search visibility.";
      return "Optimized AEO: ready for voice searches and featured snippets.";
    }
    if (key === "content_quality") {
      if (score < 60) return "Lacks comprehensive depth. Expand length and readability.";
      if (score < 80) return "Good content base, but needs more detailed subheadings and depth.";
      return "Solid content quality with adequate formatting and length.";
    }
    if (key === "keyword_relevance") {
      if (score < 60) return "Target keyword has very low volume or poor alignment.";
      if (score < 80) return "Check keyword target; relevance could be improved for search volume.";
      return "Good keyword relevance and current search intent matching.";
    }
    if (key === "freshness") {
      if (score < 60) return "Content appears outdated. Update statistics and references.";
      if (score < 80) return "Publish date is older. Consider refreshing the copy.";
      return "Freshly published or timeless content format.";
    }

    return "Meets general standards for this category.";
  };

  const tooltipFor = (key: ScoreDim["key"]) => {
    const getRubricRow = (id: string) => report.quality_rubric.find(r => r.id === id);

    if (key === "seo") {
      const headingRow = getRubricRow("heading_structure");
      const schemaRow = getRubricRow("article_schema");
      const linkRow = getRubricRow("internal_links");

      return (
        <div className="space-y-2 text-[11px]">
          <p className="text-[12px] font-semibold text-text-primary">SEO Metrics (Scraped)</p>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1">
            <span className="text-text-tertiary font-medium">Schema Types:</span>
            <span className="text-text-primary text-right truncate max-w-[120px]" title={schemaRow?.detail}>
              {schemaRow?.status === "pass" ? "Detected" : "Missing / Warning"}
            </span>
            <span className="text-text-tertiary font-medium">Internal Links:</span>
            <span className="text-text-primary text-right">
              {linkRow?.detail.match(/^\d+/)?.[0] || "0"} links
            </span>
            <span className="text-text-tertiary font-medium">H2 / H3 Count:</span>
            <span className="text-text-primary text-right font-mono">
              {headingRow?.detail.split(".")[0] || "N/A"}
            </span>
          </div>
        </div>
      );
    }

    if (key === "geo") {
      const answerRow = getRubricRow("direct_answer");
      const citeRow = getRubricRow("external_citations");

      return (
        <div className="space-y-2 text-[11px]">
          <p className="text-[12px] font-semibold text-text-primary">GEO Metrics (Generative Engines)</p>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1">
            <span className="text-text-tertiary font-medium">Direct Answer:</span>
            <span className={`text-right font-medium ${answerRow?.status === "pass" ? "text-status-success" : "text-status-danger"}`}>
              {answerRow?.status === "pass" ? "Present" : "Missing"}
            </span>
            <span className="text-text-tertiary font-medium">Outbound Citations:</span>
            <span className="text-text-primary text-right">
              {citeRow?.detail.match(/^\d+/)?.[0] || "0"} links
            </span>
            <span className="text-text-tertiary font-medium">Competitors Scanned:</span>
            <span className="text-text-primary text-right">
              {report.competitor_insights.length} domains
            </span>
          </div>
        </div>
      );
    }

    if (key === "aeo") {
      const faqRow = getRubricRow("faq_section");
      const questRow = getRubricRow("question_headings");

      return (
        <div className="space-y-2 text-[11px]">
          <p className="text-[12px] font-semibold text-text-primary">AEO Metrics (Answer Engines)</p>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1">
            <span className="text-text-tertiary font-medium">FAQ Section:</span>
            <span className={`text-right font-medium ${faqRow?.status === "pass" ? "text-status-success" : faqRow?.status === "warn" ? "text-status-warning" : "text-status-danger"}`}>
              {faqRow?.status === "pass" ? "Pass" : faqRow?.status === "warn" ? "Needs Schema" : "Missing"}
            </span>
            <span className="text-text-tertiary font-medium">Question Headings:</span>
            <span className={`text-right font-medium ${questRow?.status === "pass" ? "text-status-success" : "text-status-danger"}`}>
              {questRow?.status === "pass" ? "Detected" : "Missing"}
            </span>
            <span className="text-text-tertiary font-medium">FAQ Questions:</span>
            <span className="text-text-primary text-right">
              {report.revamp_brief?.faq_questions.length || 0} suggested
            </span>
          </div>
        </div>
      );
    }

    if (key === "content_quality") {
      return (
        <div className="space-y-2 text-[11px]">
          <p className="text-[12px] font-semibold text-text-primary">Content Quality Metrics</p>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1">
            <span className="text-text-tertiary font-medium">Word Count:</span>
            <span className="text-text-primary text-right font-medium">
              {report.word_count.toLocaleString()} words
            </span>
            <span className="text-text-tertiary font-medium">Recommended:</span>
            <span className="text-text-primary text-right">
              {report.revamp_brief?.recommended_word_count || 1500} words
            </span>
            <span className="text-text-tertiary font-medium">Gap Topics:</span>
            <span className="text-text-primary text-right">
              {report.revamp_brief?.missing_topics.length || 0} identified
            </span>
          </div>
        </div>
      );
    }

    if (key === "keyword_relevance" && report.keyword_data) {
      const k = report.keyword_data;
      return (
        <div className="space-y-1.5 text-[11px]">
          <p className="text-[12px] font-semibold text-text-primary">{k.keyword}</p>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1">
            <span className="text-text-tertiary font-medium">Search Volume (API)</span>
            <span className="text-text-primary text-right tabular-nums">{k.volume ? `${k.volume.toLocaleString()}/mo` : "—"}</span>
            <span className="text-text-tertiary font-medium">Trend (12-mo)</span>
            <span className={`text-right tabular-nums ${k.trend_pct >= 0 ? "text-status-success" : "text-status-danger"}`}>{k.trend_pct >= 0 ? "+" : ""}{k.trend_pct}%</span>
            <span className="text-text-tertiary font-medium">Demand Verdict</span>
            <span className="text-text-primary text-right capitalize">{k.verdict}</span>
          </div>
          {k.monthly_searches?.length > 1 && (
            <p className="text-[10px] text-text-tertiary pt-1 border-t border-border-subtle/50 mt-1">12-month search trend from DataForSEO.</p>
          )}
        </div>
      );
    }

    if (key === "freshness") {
      return (
        <div className="space-y-2 text-[11px]">
          <p className="text-[12px] font-semibold text-text-primary">Freshness & Stale Signals</p>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1">
            <span className="text-text-tertiary font-medium">Detected Date:</span>
            <span className="text-text-primary text-right font-medium">
              {report.publish_date_detected || "Not detected"}
            </span>
            <span className="text-text-tertiary font-medium">Timeliness Check:</span>
            <span className="text-text-primary text-right">
              {report.publish_date_detected ? "Checks metadata" : "No publish date tag"}
            </span>
          </div>
        </div>
      );
    }

    return null;
  };

  if (report.is_blog_post === false) {
    return (
      <div className="rounded-[12px] border border-amber-500/20 bg-amber-500/10 p-4 flex items-start gap-3 text-left relative">
        <svg className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
        </svg>
        <div className="flex-1 min-w-0">
          <h4 className="text-[13px] font-semibold text-text-primary">Content type warning: Not classified as a blog post</h4>
          <p className="text-[12px] text-text-tertiary mt-1 leading-relaxed">
            {report.non_blog_warning || `We detected that this page is a ${report.content_type_verdict || 'non-blog page'}. Content Audit Studio is optimized specifically for blog posts and article structures. Some metrics might not align correctly with this content type.`}
          </p>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="text-amber-500 hover:text-amber-600 transition-colors shrink-0 p-1 rounded-lg"
            aria-label="Close warning banner"
          >
            <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-[20px] border border-border-subtle bg-surface-elevated p-6 shadow-sm relative">
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="absolute top-4 right-4 text-text-tertiary hover:text-text-primary transition-colors p-1 rounded-lg hover:bg-surface-secondary/80"
            aria-label="Close audit results"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
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

        <div className="mt-5 pt-5 border-t border-border-subtle flex flex-wrap items-center gap-3">
          {!generatedBlogId ? (
            <button
              type="button"
              onClick={onGenerate}
              disabled={generating}
              className="h-9 px-4 rounded-[10px] bg-brand-violet text-white text-[13px] font-semibold hover:bg-brand-violet/90 disabled:opacity-60 transition-all flex items-center gap-2"
            >
              {generating ? (
                <><Spinner size={13} /> Generating…</>
              ) : (
                <>
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09z" />
                  </svg>
                  Generate Blog
                </>
              )}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => router.push(`/projects/${projectId}/content-history/${generatedBlogId}`)}
              className="h-9 px-4 rounded-[10px] bg-status-success text-white text-[13px] font-semibold hover:opacity-90 transition-all flex items-center gap-2"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0z" />
              </svg>
              View Blog
            </button>
          )}

          {!scheduledDate ? (
            <CalendarDatePicker
              open={scheduleOpen}
              onOpenChange={setScheduleOpen}
              currentDate={nextVacantDate}
              onConfirm={onSchedule}
              saving={scheduleSaving}
              scheduledDates={scheduledDates}
              variant="pick"
              label={scheduleSaving ? "Scheduling…" : "Schedule"}
              className="h-9 px-4 rounded-[10px] border border-border-subtle bg-surface-secondary text-[13px] font-medium text-text-secondary hover:text-text-primary hover:border-border-strong disabled:opacity-50 transition-all flex items-center gap-2"
            />
          ) : (
            <div className="flex items-center gap-2 px-3 h-9 rounded-[10px] bg-status-success/10 border border-status-success/20 text-[12px] font-medium text-status-success">
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

          <button
            type="button"
            onClick={() => exportAuditToPdf(report)}
            className="h-9 px-4 rounded-[10px] border border-border-subtle bg-surface-secondary text-[13px] font-semibold text-text-secondary hover:text-text-primary hover:border-border-strong transition-all flex items-center gap-2"
          >
            <svg className="w-4 h-4 text-text-tertiary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
            </svg>
            Download PDF
          </button>

          {generateError && <span className="text-[12px] text-status-danger">{generateError}</span>}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {SCORE_DIMS.map(dim => (
          <ScoreCard
            key={dim.key}
            label={dim.label}
            score={report.scores[dim.key]}
            description={getDimensionExplanation(dim.key, report.scores[dim.key])}
            icon={dim.icon}
            tooltip={tooltipFor(dim.key)}
            metricValue={getMetricValue(dim.key)}
          />
        ))}
      </div>

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

export function exportAuditToPdf(report: ContentAuditReport) {
  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    alert("Please allow popups to download the PDF report.");
    return;
  }

  const issuesList = report.issues
    .map(
      (issue, index) => `
    <div class="issue-item">
      <div class="issue-header">
        <span class="issue-num">#${index + 1}</span>
        <span class="issue-title">${issue.title}</span>
        <span class="severity-badge ${issue.severity}">${issue.severity.toUpperCase()}</span>
        <span class="category-badge">${issue.category.toUpperCase()}</span>
      </div>
      <div class="issue-body">
        <p><strong>Observation:</strong> ${issue.detail}</p>
        <p><strong>Impact:</strong> ${issue.impact}</p>
        <p><strong>Recommendation/Fix:</strong> ${issue.fix}</p>
      </div>
    </div>
  `
    )
    .join("");

  const competitorList = report.competitor_insights
    .map(
      c => `
    <div class="competitor-item">
      <p class="competitor-url"><strong>${c.url}</strong></p>
      <ul>
        ${c.advantages.map(a => `<li>${a}</li>`).join("")}
      </ul>
    </div>
  `
    )
    .join("");

  const rubricRows = report.quality_rubric
    .map(
      r => `
    <div class="rubric-item">
      <span class="rubric-status status-${r.status}">${r.status.toUpperCase()}</span>
      <span class="rubric-label"><strong>${r.label}</strong>: ${r.detail}</span>
    </div>
  `
    )
    .join("");

  const htmlContent = `
    <html>
      <head>
        <title>Rankshoot - Content Audit Report - ${report.title}</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            color: #1f2937;
            line-height: 1.5;
            padding: 40px;
            max-width: 800px;
            margin: 0 auto;
          }
          h1 {
            font-size: 28px;
            color: #111827;
            margin-bottom: 5px;
          }
          h2 {
            font-size: 20px;
            color: #111827;
            border-bottom: 2px solid #e5e7eb;
            padding-bottom: 8px;
            margin-top: 40px;
            margin-bottom: 20px;
          }
          .meta-info {
            color: #6b7280;
            font-size: 13px;
            margin-bottom: 30px;
          }
          .scores-grid {
            display: grid;
            grid-template-cols: repeat(3, 1fr);
            gap: 15px;
            margin-bottom: 30px;
          }
          .score-card {
            border: 1px solid #e5e7eb;
            border-radius: 8px;
            padding: 15px;
            text-align: center;
          }
          .score-card .score-num {
            font-size: 24px;
            font-weight: bold;
          }
          .score-card .score-label {
            font-size: 12px;
            color: #4b5563;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            margin-top: 5px;
          }
          .verdict-box {
            background-color: #f3f4f6;
            border-left: 4px solid #6366f1;
            padding: 15px 20px;
            border-radius: 4px;
            margin-bottom: 30px;
            font-style: italic;
          }
          .issue-item {
            border: 1px solid #e5e7eb;
            border-radius: 8px;
            margin-bottom: 15px;
            overflow: hidden;
          }
          .issue-header {
            background-color: #f9fafb;
            padding: 10px 15px;
            border-bottom: 1px solid #e5e7eb;
            display: flex;
            align-items: center;
            gap: 10px;
          }
          .issue-num {
            font-weight: bold;
            color: #6b7280;
          }
          .issue-title {
            font-weight: bold;
            flex-grow: 1;
            color: #111827;
          }
          .severity-badge {
            font-size: 10px;
            font-weight: bold;
            padding: 2px 6px;
            border-radius: 9999px;
          }
          .severity-badge.critical { background-color: #fee2e2; color: #991b1b; }
          .severity-badge.high { background-color: #ffedd5; color: #9a3412; }
          .severity-badge.medium { background-color: #fef3c7; color: #92400e; }
          .severity-badge.low { background-color: #d1fae5; color: #065f46; }
          .category-badge {
            font-size: 10px;
            background-color: #e0e7ff;
            color: #3730a3;
            padding: 2px 6px;
            border-radius: 9999px;
            font-weight: bold;
          }
          .issue-body {
            padding: 15px;
            font-size: 14px;
          }
          .issue-body p {
            margin: 5px 0;
          }
          .competitor-item {
            border-bottom: 1px dashed #e5e7eb;
            padding: 15px 0;
          }
          .competitor-item:last-child {
            border-bottom: none;
          }
          .competitor-url {
            color: #4f46e5;
            font-size: 14px;
            margin-bottom: 5px;
          }
          ul {
            margin: 5px 0;
            padding-left: 20px;
            font-size: 14px;
          }
          .rubric-item {
            display: flex;
            align-items: start;
            gap: 10px;
            padding: 8px 0;
            font-size: 13px;
            border-bottom: 1px solid #f3f4f6;
          }
          .rubric-status {
            font-size: 9px;
            font-weight: bold;
            padding: 1px 5px;
            border-radius: 4px;
            text-transform: uppercase;
          }
          .rubric-status.status-pass { background-color: #d1fae5; color: #065f46; }
          .rubric-status.status-warn { background-color: #fef3c7; color: #92400e; }
          .rubric-status.status-fail { background-color: #fee2e2; color: #991b1b; }
          @media print {
            body { padding: 20px; }
            h2 { page-break-before: always; }
          }
        </style>
      </head>
      <body>
        <h1>Content Audit Report</h1>
        <div class="meta-info">
          URL: <strong>${report.url}</strong><br/>
          Title: <strong>${report.title}</strong><br/>
          Audit Date: ${new Date(report.analyzed_at).toLocaleDateString()}<br/>
          Focus Keyword: <strong>${report.primary_keyword}</strong> · Word Count: <strong>${report.word_count.toLocaleString()} words</strong>
        </div>

        <div class="verdict-box">
          <strong>Summary Verdict:</strong> ${report.plain_language_verdict}
        </div>

        <h2>Audit Scores</h2>
        <div class="scores-grid">
          <div class="score-card" style="border-color: #6366f1; background-color: #f5f3ff;">
            <div class="score-num" style="color: #4f46e5;">${report.scores.overall}</div>
            <div class="score-label">Overall Score</div>
          </div>
          <div class="score-card">
            <div class="score-num">${report.scores.seo}</div>
            <div class="score-label">SEO Score</div>
          </div>
          <div class="score-card">
            <div class="score-num">${report.scores.geo}</div>
            <div class="score-label">GEO Score</div>
          </div>
          <div class="score-card">
            <div class="score-num">${report.scores.aeo}</div>
            <div class="score-label">AEO Score</div>
          </div>
          <div class="score-card">
            <div class="score-num">${report.scores.content_quality}</div>
            <div class="score-label">Content Quality</div>
          </div>
          <div class="score-card">
            <div class="score-num">${report.scores.freshness}</div>
            <div class="score-label">Freshness</div>
          </div>
        </div>

        <h2>Audit Issues & Recommendations</h2>
        <div class="issues-list">
          ${issuesList}
        </div>

        <h2>Quality Checklist</h2>
        <div class="rubric-list">
          ${rubricRows}
        </div>

        <h2>Competitor Gap Analysis</h2>
        <div class="competitor-list">
          ${competitorList}
        </div>

        <script>
          window.onload = function() {
            window.print();
          }
        </script>
      </body>
    </html>
  `;

  printWindow.document.open();
  printWindow.document.write(htmlContent);
  printWindow.document.close();
}
