"use client";

import type { KeywordGap } from "@/lib/types";
import { Tooltip } from "@/components/Tooltip";

type GapAiEvalData = NonNullable<KeywordGap['ai_eval_data']>;

export function AI_GAP_SCORE_CATEGORY(score: number): { icon: string; colorClass: string; label: string } {
  if (score >= 75) return { icon: "★", colorClass: "text-status-success border-status-success/25 bg-status-success/10", label: "High opportunity" };
  if (score >= 55) return { icon: "◆", colorClass: "text-status-warning border-status-warning/25 bg-status-warning/10", label: "Good fit" };
  if (score >= 35) return { icon: "▸", colorClass: "text-brand-action border-brand-action/25 bg-brand-action/10", label: "Moderate" };
  return { icon: "▾", colorClass: "text-text-tertiary border-border-subtle bg-surface-elevated", label: "Low priority" };
}

function GapAiScoreTooltipContent({ data, score }: { data: GapAiEvalData; score: number }) {
  const cat = AI_GAP_SCORE_CATEGORY(score);
  const analysis = data.analysis as GapAiEvalData["analysis"] & {
    blogPotential?: number;
    competitiveTakeover?: number;
    audienceFit?: number;
  };
  const dims = [
    { label: "Biz Relevance", val: data.analysis.businessRelevance ?? 0 },
    { label: "Blog Potential", val: analysis.blogPotential ?? 0 },
    { label: "Competitive", val: analysis.competitiveTakeover ?? 0 },
    { label: "Intent Quality", val: analysis.intentQuality ?? data.analysis.intentQuality ?? 0 },
    { label: "Traffic Potential", val: data.analysis.trafficPotential ?? 0 },
    { label: "Trend/Growth", val: data.analysis.trendGrowth ?? 0 },
    { label: "Audience Fit", val: analysis.audienceFit ?? 0 },
    { label: "Content Depth", val: data.analysis.contentDepth ?? 0 },
  ].filter(d => d.val > 0);

  return (
    <div className="w-[340px] space-y-3 p-1">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center gap-1 rounded-[6px] border px-2.5 py-1 text-[13px] font-bold tabular-nums ${cat.colorClass}`}>
            {cat.icon} {score}
          </span>
          <span className="text-[12px] font-semibold text-text-primary">{cat.label}</span>
        </div>
        <span className="rounded-full border border-border-subtle bg-surface-secondary px-2 py-0.5 text-[10px] uppercase tracking-wide text-text-tertiary">
          {data.category?.replace(/_/g, ' ')}
        </span>
      </div>

      {dims.length > 0 && (
        <div className="space-y-1.5">
          {dims.map(d => (
            <div key={d.label} className="flex items-center gap-2">
              <span className="w-[100px] shrink-0 text-[10px] text-text-tertiary">{d.label}</span>
              <div className="flex-1 h-1 rounded-full bg-surface-tertiary overflow-hidden">
                <div
                  className={`h-full rounded-full ${d.val >= 7 ? 'bg-status-success' : d.val >= 4 ? 'bg-status-warning' : 'bg-brand-coral'}`}
                  style={{ width: `${d.val * 10}%` }}
                />
              </div>
              <span className="w-4 text-right text-[10px] font-mono text-text-tertiary">{d.val}</span>
            </div>
          ))}
        </div>
      )}

      {data.reasoning.summary && (
        <p className="text-[12px] leading-relaxed text-text-secondary">{data.reasoning.summary}</p>
      )}

      {data.reasoning.strengths?.length > 0 && (
        <div>
          <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-status-success">Strengths</p>
          <ul className="space-y-0.5">
            {data.reasoning.strengths.slice(0, 2).map((s, i) => (
              <li key={i} className="text-[11px] text-text-secondary leading-snug">+ {s}</li>
            ))}
          </ul>
        </div>
      )}

      {data.reasoning.weaknesses?.length > 0 && (
        <div>
          <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-brand-coral">Weaknesses</p>
          <ul className="space-y-0.5">
            {data.reasoning.weaknesses.slice(0, 2).map((w, i) => (
              <li key={i} className="text-[11px] text-text-secondary leading-snug">- {w}</li>
            ))}
          </ul>
        </div>
      )}

      {(data.reasoning.rankingOpportunity || data.reasoning.contentOpportunity) && (
        <div className="space-y-1.5 rounded-[8px] bg-surface-secondary border border-border-subtle/60 p-2.5">
          {data.reasoning.rankingOpportunity && (
            <p className="text-[11px] text-text-secondary"><span className="font-semibold text-text-primary">Ranking: </span>{data.reasoning.rankingOpportunity}</p>
          )}
          {data.reasoning.contentOpportunity && (
            <p className="text-[11px] text-text-secondary"><span className="font-semibold text-text-primary">Content: </span>{data.reasoning.contentOpportunity}</p>
          )}
        </div>
      )}
    </div>
  );
}

export function GapAiScoreCell({ gap }: { gap: KeywordGap }) {
  if (!gap.ai_eval_score || !gap.ai_eval_data) {
    return <span className="text-[12px] text-text-tertiary">—</span>;
  }
  const cat = AI_GAP_SCORE_CATEGORY(gap.ai_eval_score);
  return (
    <Tooltip placement="above" content={<GapAiScoreTooltipContent data={gap.ai_eval_data} score={gap.ai_eval_score} />}>
      <span className={`inline-flex cursor-default items-center gap-1 rounded-[6px] border px-2.5 py-1 text-[12px] font-bold tabular-nums ${cat.colorClass}`}>
        {cat.icon} {gap.ai_eval_score}
      </span>
    </Tooltip>
  );
}
