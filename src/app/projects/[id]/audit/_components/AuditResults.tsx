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

  return (
    <div className="space-y-6">
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
                  Generate Enhanced Blog
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
              label={scheduleSaving ? "Scheduling…" : "Schedule to Calendar"}
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
