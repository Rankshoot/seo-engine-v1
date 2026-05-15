"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { BlogDeepAnalysisResult } from "@/lib/blog-deep-analysis";
import {
  DEEP_ANALYSIS_SCORE_PARAMETER_DEFS,
  formatDeepAnalysisRecommendations,
} from "@/lib/blog-deep-analysis";

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

export function BlogDeepAnalysisModal({
  open,
  analysis,
  loading,
  loadingStage,
  error,
  onClose,
  onRunAgain,
  runningAgain,
}: {
  open: boolean;
  analysis: BlogDeepAnalysisResult | null;
  loading: boolean;
  loadingStage: number;
  error: string;
  onClose: () => void;
  onRunAgain: () => void;
  runningAgain: boolean;
}) {
  const [copied, setCopied] = useState(false);

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

  const busy = loading || runningAgain;

  const copyText = useMemo(
    () => (analysis ? formatDeepAnalysisRecommendations(analysis) : ""),
    [analysis]
  );

  if (!open) return null;

  const handleCopy = async () => {
    if (!copyText) return;
    try {
      await navigator.clipboard.writeText(copyText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-80 flex items-start justify-center overflow-y-auto bg-surface-primary/85 p-3 backdrop-blur-sm sm:p-6 animate-fade-in"
      onClick={onClose}
    >
      <ModalPanel onClick={e => e.stopPropagation()}>
        <header className="flex items-start justify-between gap-3 border-b border-border-subtle p-5">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-wider text-text-tertiary">
              SERP competitor gap analysis
            </p>
            <h2 className="mt-1 text-lg font-bold text-text-primary">Deep Analysis</h2>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {analysis && (
              <button
                type="button"
                onClick={() => void handleCopy()}
                disabled={busy}
                className="rounded-xl border border-border-subtle bg-surface-elevated px-3 py-2 text-[11px] font-semibold text-text-secondary transition-all hover:border-border-strong hover:text-text-primary disabled:opacity-40"
              >
                {copied ? "Copied" : "Copy Recommendations"}
              </button>
            )}
            {analysis && (
              <button
                type="button"
                onClick={onRunAgain}
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-xl border border-border-subtle bg-surface-elevated px-3 py-2 text-[11px] font-semibold text-text-secondary transition-all hover:text-text-primary disabled:opacity-40"
              >
                <RefreshIcon spinning={busy} />
                {busy ? "Running…" : "Run Again"}
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-border-subtle bg-surface-elevated p-2 text-text-tertiary hover:bg-rose-500/10 hover:text-rose-300"
              aria-label="Close"
            >
              <CloseIcon />
            </button>
          </div>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {busy && <LoadingStages stageIndex={loadingStage} />}
          {error && !busy && <ErrorBanner message={error} />}
          {analysis && !busy && <ResultsBody analysis={analysis} />}
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
      className="relative my-4 flex w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-border-default bg-surface-secondary shadow-2xl shadow-black/60 animate-scale-in"
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

function RefreshIcon({ spinning }: { spinning: boolean }) {
  return (
    <svg
      className={`h-3.5 w-3.5 ${spinning ? "animate-spin" : ""}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99"
      />
    </svg>
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
  return <StageSpinnerDot />;
}

function StageSpinnerDot() {
  return (
    <div className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-border-subtle border-t-brand-action" />
  );
}

function LoadingStages({ stageIndex }: { stageIndex: number }) {
  return (
    <div className="space-y-4 py-4">
      <div className="flex justify-center">
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
                <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
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

function ScoreBreakdownCard({ analysis }: { analysis: BlogDeepAnalysisResult }) {
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
    <div className="overflow-hidden rounded-xl border border-border-subtle bg-surface-tertiary/50">
      <div className="flex flex-col items-center border-b border-border-subtle bg-surface-elevated/40 px-4 pt-5 pb-4">
        <p className={`text-5xl font-black tabular-nums leading-none ${scoreColor(analysis.deepAnalysisScore)}`}>
          {analysis.deepAnalysisScore}
        </p>
        <p className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">
          out of 100
        </p>
      </div>
      <div className="divide-y divide-border-subtle/80">
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
              <div className={`h-full rounded-full transition-all ${paramBarColor(p.score)}`} style={{ width: `${Math.max(4, p.score)}%` }} />
            </div>
            {p.detail ? (
              <p className="mt-1 text-[10px] leading-relaxed text-text-tertiary">{p.detail}</p>
            ) : null}
            <p className="mt-0.5 text-[9px] text-text-tertiary/80">Weight {p.weight}%</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function ResultsBody({ analysis }: { analysis: BlogDeepAnalysisResult }) {
  const hasMore =
    analysis.missingEntities.length > 0 ||
    analysis.missingSemanticKeywords.length > 0 ||
    analysis.faqSuggestions.length > 0 ||
    analysis.tableSuggestions.length > 0 ||
    analysis.eeatSuggestions.length > 0 ||
    analysis.linkingSuggestions.length > 0;
  const sectionGaps = analysis.sectionGaps ?? [];
  return (
    <div className="space-y-4">
      <ScoreBreakdownCard analysis={analysis} />
      {analysis.summary ? (
        <p className="text-[13px] leading-relaxed text-text-secondary">{analysis.summary}</p>
      ) : null}
      {sectionGaps.length > 0 && (
        <Section title="Your blog vs competitor sections">
          <ul className="max-h-[min(42vh,380px)] space-y-2 overflow-y-auto pr-1">
            {sectionGaps.map((gap, i) => (
              <li
                key={`${gap.competitorUrl}-${gap.blogSection}-${i}`}
                className="rounded-lg border border-border-subtle bg-surface-elevated/80 p-3"
              >
                <div className="mb-2 flex flex-wrap items-center gap-2">
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
                  <p className="mb-2 line-clamp-2 text-[11px] italic text-text-tertiary">
                    &ldquo;{gap.blogExcerpt}&rdquo;
                  </p>
                ) : null}
                <p className="mb-1 text-[11px] text-text-tertiary">
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
                <p className="text-[12px] leading-relaxed text-text-secondary">{gap.gap}</p>
              </li>
            ))}
          </ul>
        </Section>
      )}
      {analysis.competitorUrls.length > 0 && (
        <Section title="Top 5 competitor URLs">
          <ul className="space-y-1">
            {analysis.competitorUrls.map(url => (
              <li key={url}>
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
      <Section title="Missing topics" items={analysis.missingTopics} />
      <Section title="Competitors have (we don't)" items={analysis.competitorAdvantages} />
      <Section title="Recommended additions" items={analysis.recommendedAdditions} />
      <Section title="Priority fixes">
        {analysis.priorityFixes.length === 0 ? (
          <p className="text-[12px] text-text-tertiary">None identified.</p>
        ) : (
          <ul className="space-y-2">
            {analysis.priorityFixes.map((fix, i) => (
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
                  <span className="text-[12px] font-semibold text-text-primary">{fix.issue}</span>
                </div>
                <p className="text-[12px] leading-relaxed text-text-secondary">{fix.recommendation}</p>
              </li>
            ))}
          </ul>
        )}
      </Section>
      {hasMore && (
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
  );
}

function Section({
  title,
  items,
  children,
}: {
  title: string;
  items?: string[];
  children?: ReactNode;
}) {
    return (
    <div>
      <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-text-tertiary">{title}</p>
      {children ?? <BulletList items={items ?? []} />}
    </div>
  );
}

function BulletList({ title, items }: { title?: string; items: string[] }) {
  if (!items.length) {
    return title ? null : <p className="text-[12px] text-text-tertiary">None identified.</p>;
  }
  return (
    <div>
      {title && <p className="mb-1 text-[10px] font-semibold text-text-tertiary">{title}</p>}
      <ul className="list-inside list-disc space-y-0.5 text-[12px] text-text-secondary">
        {items.map((item, i) => (
          <li key={`${item.slice(0, 40)}-${i}`}>{item}</li>
        ))}
      </ul>
    </div>
  );
}
