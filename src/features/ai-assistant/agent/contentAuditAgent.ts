import type { AIContext, ContextualAction, ContextualAgentOutput } from "@/features/ai-assistant/types";
import { addReasoningWithLLM, buildOutput, scoreRow, type CandidateRow } from "@/features/ai-assistant/agent/common";

function actions(): ContextualAction[] {
  return [
    { type: "IMPROVE_BLOG", label: "Fix High Severity", description: "Prioritize highest-severity content issues first." },
    { type: "UPDATE_OLD_BLOG", label: "Refresh Content", description: "Refresh decaying or stale content with demand." },
    { type: "GENERATE_BLOG", label: "Generate Replacement", description: "Generate new pieces where quality is too low." },
  ];
}

function selectRows(context: AIContext, prompt: string): CandidateRow[] {
  const rows = context.audits
    .map(audit => {
      const keyword = audit.primary_keyword?.trim() || audit.title || audit.url;
      const severityBoost = audit.severity === "high" ? 28 : audit.severity === "medium" ? 18 : 8;
      const syntheticVolume = Math.max(10, (100 - Math.min(100, audit.health_score)) * 120);
      const syntheticKd = Math.min(85, Math.max(10, Math.round(30 + audit.health_score * 0.4)));
      return {
        keyword,
        source: "audit" as const,
        volume: syntheticVolume,
        kd: syntheticKd,
        cpc: 0,
        intent: "informational",
        longTail: keyword.split(/\s+/).length >= 4,
        lowCompetition: syntheticKd <= 35,
        score: scoreRow(syntheticVolume, syntheticKd, "informational", keyword, severityBoost),
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 80);
  const p = prompt.toLowerCase().trim();
  if (p.length >= 4) {
    const exact = rows.filter(r => p.includes(r.keyword.toLowerCase()) || r.keyword.toLowerCase().includes(p));
    if (exact.length) {
      const rest = rows.filter(r => !exact.includes(r));
      return [...exact, ...rest].slice(0, 50);
    }
  }
  return rows.slice(0, 50);
}

export async function runContentAuditAgent(context: AIContext, prompt: string): Promise<ContextualAgentOutput> {
  const rows = selectRows(context, prompt);
  if (!rows.length) {
    return buildOutput(context, "No content audit records are available for this project yet.", [], actions());
  }
  const fallbackSummary = `Analyzed ${rows.length} audited URLs and prioritized highest-impact fixes.`;
  const enriched = await addReasoningWithLLM(context, prompt, rows, fallbackSummary);
  return buildOutput(context, enriched.summary, enriched.suggestions, actions());
}
