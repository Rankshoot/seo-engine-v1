"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { BlogDeepAnalysisResult } from "@/lib/blog-deep-analysis";
import { DEEP_ANALYSIS_SCORE_PARAMETER_DEFS } from "@/lib/blog-deep-analysis";

const STAGES = [
  "Fetching top competitors",
  "Scraping competitor pages",
  "Comparing content",
  "Generating analysis",
] as const;

const IMPACT_COLORS: Record<string, string> = {
  High: "border-rose-500/40 bg-rose-500/10 text-rose-400",
  Medium: "border-amber-500/40 bg-amber-500/10 text-amber-400",
  Low: "border-border-subtle bg-surface-elevated text-text-tertiary",
};

function scoreColor(score: number): string {
  if (score >= 80) return "text-emerald-400";
  if (score >= 60) return "text-amber-400";
  return "text-rose-400";
}

function paramBarColor(score: number): string {
  if (score >= 80) return "bg-emerald-500";
  if (score >= 60) return "bg-amber-500";
  return "bg-rose-500";
}

function hostLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function formatAnalysisValue(value: any): ReactNode {
  if (value === null || value === undefined) {
    return <span className="text-[12px] text-text-tertiary">Not available</span>;
  }

  if (typeof value === "string") {
    return <span className="text-[12px] text-text-secondary leading-relaxed">{value}</span>;
  }

  if (typeof value === "number") {
    return <span className="text-[12px] text-text-secondary leading-relaxed">{value}</span>;
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return <p className="text-[12px] text-text-tertiary">None identified.</p>;
    }

    const isAllSimple = value.every(
      item =>
        typeof item === "string" ||
        typeof item === "number" ||
        item === null ||
        item === undefined
    );

    if (isAllSimple) {
      return (
        <ul className="list-inside list-disc space-y-1 text-[12px] text-text-secondary">
          {value.map((item, i) => (
            <li key={i}>{item === null || item === undefined ? "" : String(item)}</li>
          ))}
        </ul>
      );
    }

    return (
      <div className="space-y-2">
        {value.map((item, i) => {
          if (typeof item !== "object" || item === null) {
            return (
              <div key={i} className="text-[12px] text-text-secondary">
                {String(item)}
              </div>
            );
          }

          const title = item.title || item.heading || item.name;
          const url = item.url;
          const heading = item.heading;
          const snippet = item.snippet || item.text || item.excerpt;
          const reason = item.reason || item.why;
          const recommendation = item.recommendation || item.fix || item.action;
          const score = item.score;

          return (
            <div
              key={i}
              className="rounded-lg border border-border-subtle bg-surface-elevated/40 p-3 text-[12px] space-y-1.5"
            >
              {title && <div className="font-semibold text-text-primary">{title}</div>}
              {url && (
                <div>
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-brand-action hover:underline break-all text-[11px] font-medium"
                  >
                    {url}
                  </a>
                </div>
              )}
              {heading && (
                <div className="text-[11px] font-medium text-text-secondary">
                  Heading: {heading}
                </div>
              )}
              {snippet && <div className="italic text-text-tertiary">&ldquo;{snippet}&rdquo;</div>}
              {reason && (
                <div className="text-text-secondary">
                  <span className="font-medium text-text-primary">Reason:</span> {reason}
                </div>
              )}
              {recommendation && (
                <div className="text-text-secondary">
                  <span className="font-medium text-text-primary">Recommendation:</span>{" "}
                  {recommendation}
                </div>
              )}
              {score !== undefined && (
                <div className="text-text-secondary font-medium">
                  Score: <span className="font-bold">{score}</span>
                </div>
              )}

              {Object.entries(item).map(([k, v]) => {
                if (
                  [
                    "title",
                    "heading",
                    "name",
                    "url",
                    "snippet",
                    "text",
                    "excerpt",
                    "reason",
                    "why",
                    "recommendation",
                    "fix",
                    "action",
                    "score",
                  ].includes(k)
                ) {
                  return null;
                }
                if (typeof v === "object") return null;
                return (
                  <div key={k} className="text-[10px] text-text-tertiary">
                    <span className="font-medium uppercase tracking-wider">{k}:</span> {String(v)}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    );
  }

  if (typeof value === "object") {
    const keys = Object.keys(value);
    if (keys.length === 0) {
      return <span className="text-[12px] text-text-tertiary">Not available</span>;
    }

    const title = value.title || value.name;
    const url = value.url;
    const snippet = value.snippet || value.text;
    const reason = value.reason;
    const recommendation = value.recommendation;
    const score = value.score;

    if (title || url || snippet || reason || recommendation || score) {
      return (
        <div className="rounded-lg border border-border-subtle bg-surface-elevated/40 p-3 text-[12px] space-y-1.5">
          {title && <div className="font-semibold text-text-primary">{title}</div>}
          {url && (
            <div>
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand-action hover:underline break-all text-[11px] font-medium"
              >
                {url}
              </a>
            </div>
          )}
          {snippet && <div className="italic text-text-tertiary">&ldquo;{snippet}&rdquo;</div>}
          {reason && (
            <div className="text-text-secondary">
              <span className="font-medium text-text-primary">Reason:</span> {reason}
            </div>
          )}
          {recommendation && (
            <div className="text-text-secondary">
              <span className="font-medium text-text-primary">Recommendation:</span>{" "}
              {recommendation}
            </div>
          )}
          {score !== undefined && (
            <div className="text-text-secondary font-medium">
              Score: <span className="font-bold">{score}</span>
            </div>
          )}
        </div>
      );
    }

    return (
      <div className="space-y-1 text-[11px] text-text-secondary">
        {Object.entries(value).map(([k, v]) => (
          <div key={k}>
            <span className="font-semibold text-text-primary">{k}:</span>{" "}
            {typeof v === "object" ? JSON.stringify(v) : String(v)}
          </div>
        ))}
      </div>
    );
  }

  return <span className="text-[12px] text-text-secondary leading-relaxed">{String(value)}</span>;
}

export function BlogDeepAnalysisModal({
  open,
  analysis,
  loading,
  loadingStage,
  error,
  onClose,
  onGenerateEnhanced,
  enhancing,
}: {
  open: boolean;
  analysis: BlogDeepAnalysisResult | null;
  loading: boolean;
  loadingStage: number;
  error: string;
  onClose: () => void;
  onGenerateEnhanced?: () => void;
  enhancing?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const busy = loading || enhancing;

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-80 flex items-start justify-center overflow-y-auto bg-surface-primary/85 p-3 backdrop-blur-sm sm:p-6 animate-fade-in"
      onClick={onClose}
    >
      <ModalPanel onClick={e => e.stopPropagation()}>
        <header className="flex items-center justify-between gap-3 border-b border-border-subtle p-5 shrink-0">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-wider text-text-tertiary">
              SERP competitor gap analysis
            </p>
            <h2 className="mt-1 text-lg font-bold text-text-primary">Deep Analysis</h2>
          </div>
          <div className="flex shrink-0 items-center gap-2.5">
            {analysis && onGenerateEnhanced && (
              <button
                type="button"
                onClick={onGenerateEnhanced}
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-xl bg-brand-action px-4 py-2 text-xs font-bold text-white shadow-sm hover:opacity-90 active:scale-95 transition-all disabled:opacity-40 disabled:pointer-events-none"
              >
                {enhancing ? "Enhancing..." : "Generate Enhanced Version"}
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-border-subtle bg-surface-elevated p-2 text-text-tertiary hover:bg-rose-500/10 hover:text-rose-300 transition-colors"
              aria-label="Close"
            >
              <CloseIcon />
            </button>
          </div>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {loading && <LoadingStages stageIndex={loadingStage} />}
          {error && !loading && <ErrorBanner message={error} />}
          {analysis && !loading && (
            <ResultsBody
              analysis={analysis}
              onGenerateEnhanced={onGenerateEnhanced}
              enhancing={enhancing}
              busy={busy}
            />
          )}
        </div>
      </ModalPanel>
    </div>
  );
}

function ModalPanel({
  children,
  onClick,
}: {
  children: ReactNode;
  onClick: (e: React.MouseEvent) => void;
}) {
  return (
    <div
      className="relative my-4 flex w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-border-default bg-surface-secondary shadow-2xl shadow-black/60 animate-scale-in"
      style={{ maxHeight: "calc(100vh - 3rem)" }}
      onClick={onClick}
    >
      {children}
    </div>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-[13px] text-rose-400">
      {message}
    </div>
  );
}

function CloseIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
    </svg>
  );
}

function StageSpinner() {
  return (
    <div className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-border-subtle border-t-brand-action" />
  );
}

function LoadingStages({ stageIndex }: { stageIndex: number }) {
  return (
    <div className="space-y-4 py-4 max-w-md mx-auto">
      <div className="flex justify-center mb-4">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-border-subtle border-t-brand-action" />
      </div>
      <ul className="space-y-2">
        {STAGES.map((label, i) => {
          const active = i === stageIndex;
          const done = i < stageIndex;
          return (
            <li
              key={label}
              className={`flex items-center gap-2.5 rounded-lg border px-3 py-2 text-[12px] ${
                active
                  ? "border-brand-action/40 bg-brand-action/10 text-text-primary"
                  : done
                    ? "border-emerald-500/25 bg-emerald-500/5 text-emerald-400"
                    : "border-border-subtle text-text-tertiary"
              }`}
            >
              {done ? (
                <svg
                  className="h-4 w-4 shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2.5}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                </svg>
              ) : active ? (
                <StageSpinner />
              ) : (
                <span className="h-4 w-4 shrink-0 rounded-full border border-border-subtle" />
              )}
              {label}
              {active && "…"}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function SubScoresCard({ analysis }: { analysis: BlogDeepAnalysisResult }) {
  const params =
    analysis.scoreParameters?.length > 0
      ? analysis.scoreParameters
      : DEEP_ANALYSIS_SCORE_PARAMETER_DEFS.map(d => ({
          id: d.id,
          label: d.label,
          weight: d.weight,
          score: 0,
          detail: "Re-run analysis for parameter scores",
        }));

  return (
    <div className="overflow-hidden rounded-xl border border-border-subtle bg-surface-tertiary/50 divide-y divide-border-subtle/80">
      {params.map(p => (
        <div key={p.id} className="px-4 py-2.5">
          <div className="mb-1 flex items-center justify-between gap-2">
            <span className="min-w-0 flex-1 text-[11px] font-medium text-text-primary leading-snug">
              {p.label}
            </span>
            <span className="shrink-0 text-[11px] font-bold tabular-nums text-text-secondary">
              {p.score}
              <span className="font-normal text-text-tertiary">/100</span>
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-primary">
            <div
              className={`h-full rounded-full transition-all ${paramBarColor(p.score)}`}
              style={{ width: `${Math.max(4, p.score)}%` }}
            />
          </div>
          {p.detail ? (
            <p className="mt-1 text-[10px] leading-relaxed text-text-tertiary">{p.detail}</p>
          ) : null}
          <p className="mt-0.5 text-[9px] text-text-tertiary/80">Weight {p.weight}%</p>
        </div>
      ))}
    </div>
  );
}

function MainScoreCard({ score }: { score: number }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border-subtle bg-surface-tertiary/50">
      <div className="flex flex-col items-center justify-center py-4 bg-surface-elevated/40">
        <p className={`text-6xl font-black tabular-nums leading-none ${scoreColor(score)}`}>
          {score}
        </p>
        <p className="mt-1.5 text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">
          out of 100 deep analysis score
        </p>
      </div>
    </div>
  );
}

function hasMoreRecommendations(analysis: BlogDeepAnalysisResult) {
  return (
    (analysis.missingEntities && analysis.missingEntities.length > 0) ||
    (analysis.missingSemanticKeywords && analysis.missingSemanticKeywords.length > 0) ||
    (analysis.faqSuggestions && analysis.faqSuggestions.length > 0) ||
    (analysis.tableSuggestions && analysis.tableSuggestions.length > 0) ||
    (analysis.eeatSuggestions && analysis.eeatSuggestions.length > 0) ||
    (analysis.linkingSuggestions && analysis.linkingSuggestions.length > 0)
  );
}

function ResultsBody({
  analysis,
  onGenerateEnhanced,
  enhancing,
  busy,
}: {
  analysis: BlogDeepAnalysisResult;
  onGenerateEnhanced?: () => void;
  enhancing?: boolean;
  busy: boolean;
}) {
  const sectionGaps = analysis.sectionGaps ?? [];
  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-12">
      {/* LEFT COLUMN: detailed sub-scores */}
      <div className="md:col-span-5 space-y-4">
        <div>
          <p className="mb-2.5 text-[10px] font-bold uppercase tracking-wider text-text-tertiary">
            Detailed Rubric Scores
          </p>
          <SubScoresCard analysis={analysis} />
        </div>

        {analysis.competitorUrls && analysis.competitorUrls.length > 0 && (
          <Section title="Top 5 competitor URLs">
            <ul className="space-y-1 bg-surface-elevated/40 rounded-xl p-3 border border-border-subtle">
              {analysis.competitorUrls.map(url => (
                <li key={url} className="truncate">
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="break-all text-[11px] text-brand-action hover:underline"
                  >
                    {url}
                  </a>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {sectionGaps.length > 0 && (
          <Section title="Your blog vs competitor sections">
            <ul className="max-h-[min(38vh,300px)] space-y-2 overflow-y-auto pr-1">
              {sectionGaps.map((gap, i) => (
                <li
                  key={`${gap.competitorUrl}-${gap.blogSection}-${i}`}
                  className="rounded-lg border border-border-subtle bg-surface-elevated/80 p-3"
                >
                  <div className="mb-1.5 flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase ${
                        IMPACT_COLORS[gap.impact] ?? IMPACT_COLORS.Medium
                      }`}
                    >
                      {gap.impact}
                    </span>
                    <span className="text-[11px] font-semibold text-text-primary">
                      Our: {gap.blogSection}
                    </span>
                  </div>
                  {gap.blogExcerpt ? (
                    <p className="mb-1.5 line-clamp-2 text-[11px] italic text-text-tertiary">
                      &ldquo;{gap.blogExcerpt}&rdquo;
                    </p>
                  ) : null}
                  <p className="mb-1 text-[10px] text-text-tertiary">
                    vs{" "}
                    <a
                      href={gap.competitorUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="break-all text-brand-action hover:underline"
                    >
                      {hostLabel(gap.competitorUrl)}
                    </a>
                    {gap.competitorSection ? (
                      <span className="text-text-secondary">
                        {" "}
                        &mdash; &ldquo;{gap.competitorSection}&rdquo;
                      </span>
                    ) : null}
                  </p>
                  <p className="text-[11px] leading-relaxed text-text-secondary">{gap.gap}</p>
                </li>
              ))}
            </ul>
          </Section>
        )}
      </div>

      {/* RIGHT COLUMN: main score, conclusion, priority fixes, missing topics, recommended additions */}
      <div className="md:col-span-7 space-y-6">
        <MainScoreCard score={analysis.deepAnalysisScore} />

        {analysis.summary ? (
          <div className="rounded-xl border border-border-subtle bg-surface-elevated/50 p-4">
            <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-text-tertiary">
              Conclusion
            </p>
            <p className="text-[13px] leading-relaxed text-text-secondary">{analysis.summary}</p>
          </div>
        ) : null}

        <Section title="Priority fixes">
          {analysis.priorityFixes && analysis.priorityFixes.length === 0 ? (
            <p className="text-[12px] text-text-tertiary">None identified.</p>
          ) : (
            <ul className="space-y-2">
              {analysis.priorityFixes?.map((fix, i) => (
                <li
                  key={`${fix.issue}-${i}`}
                  className="rounded-lg border border-border-subtle bg-surface-elevated/80 p-3"
                >
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase ${
                        IMPACT_COLORS[fix.impact] ?? IMPACT_COLORS.Medium
                      }`}
                    >
                      {fix.impact}
                    </span>
                    <span className="text-[12px] font-semibold text-text-primary">
                      {fix.issue}
                    </span>
                  </div>
                  <p className="text-[12px] leading-relaxed text-text-secondary">
                    {fix.recommendation}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Missing topics" value={analysis.missingTopics} />
        <Section title="Competitors have (we don't)" value={analysis.competitorAdvantages} />
        <Section title="Recommended additions" value={analysis.recommendedAdditions} />

        {hasMoreRecommendations(analysis) && (
          <details className="rounded-xl border border-border-subtle bg-surface-tertiary/30 p-3">
            <summary className="cursor-pointer text-[11px] font-semibold text-text-secondary">
              More recommendations
            </summary>
            <div className="mt-3 space-y-3">
              <BulletList title="Missing entities" items={analysis.missingEntities} />
              <BulletList title="Semantic keywords" items={analysis.missingSemanticKeywords} />
              <BulletList title="FAQ suggestions" items={analysis.faqSuggestions} />
              <BulletList title="Table suggestions" items={analysis.tableSuggestions} />
              <BulletList title="E-E-A-T" items={analysis.eeatSuggestions} />
              <BulletList title="Linking" items={analysis.linkingSuggestions} />
            </div>
          </details>
        )}
      </div>
    </div>
  );
}

function Section({
  title,
  value,
  children,
}: {
  title: string;
  value?: any;
  children?: ReactNode;
}) {
  return (
    <div>
      <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-text-tertiary">
        {title}
      </p>
      {children ?? formatAnalysisValue(value)}
    </div>
  );
}

function BulletList({ title, items }: { title?: string; items: any }) {
  if (!items || (Array.isArray(items) && !items.length)) {
    return title ? null : <p className="text-[12px] text-text-tertiary">None identified.</p>;
  }
  return (
    <div>
      {title && <p className="mb-1.5 text-[10px] font-semibold text-text-tertiary">{title}</p>}
      {formatAnalysisValue(items)}
    </div>
  );
}
