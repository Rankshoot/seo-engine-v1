/**
 * Competitor Agent — chatbot decision-maker for the Competitors page.
 *
 * INPUTS
 *   - context.contentGaps          → resolved gap rows (missing/weak/untapped)
 *   - context.competitorKeywords   → raw keywords scraped from competitor pages
 *   - context.businessContext      → niche, audience, brief, projectDomain, competitorDomains
 *
 * SAFETY
 *   The user explicitly asked: "if my competitor is randstad.in, the top
 *   trending keyword for it is its own name — we can't write a blog about
 *   the competitor's name". We enforce this by:
 *     1. Down-weighting keywords whose text contains a competitor brand token.
 *     2. Excluding the lowest-fit competitor-brand keywords from the
 *        candidate list passed to the LLM.
 *
 * OUTPUT
 *   `addReasoningWithLLM` is called with a strict instruction to reference
 *   the exact cards in order, so the summary text always matches the cards.
 */

import type { AIContext, ContextualAction, ContextualAgentOutput } from "@/features/ai-assistant/types";
import {
  addReasoningWithLLM,
  buildOutput,
  evaluateBrandFit,
  extractQueryFilters,
  scoreRow,
  type CandidateRow,
} from "@/features/ai-assistant/agent/common";

interface GapRow extends CandidateRow {
  brandCategory: string;
  brandReason: string;
  /** Which competitor surfaced this keyword (if known). */
  topCompetitor: string;
}

function actions(): ContextualAction[] {
  return [
    { type: "FIND_GAPS", label: "Find Gaps", description: "Show competitor terms you don't yet target." },
    { type: "ADD_OPPORTUNITIES", label: "Add to Plan", description: "Move top blog-worthy gaps into your keyword plan." },
    { type: "COMPARE_KEYWORDS", label: "Compare", description: "Compare your keyword coverage vs competitors." },
  ];
}

function selectRows(context: AIContext, prompt: string): { rows: GapRow[]; mismatch: string | null; skippedBrandCount: number } {
  const { intent } = extractQueryFilters(prompt);
  const projectDomain = context.businessContext.projectDomain ?? "";
  const competitorDomains = context.businessContext.competitorDomains ?? [];

  let rows: GapRow[] = context.contentGaps
    .map(g => {
      const fit = evaluateBrandFit(g.keyword, "commercial", projectDomain, competitorDomains);
      const boost = g.gap_type === "missing" ? 30 : g.gap_type === "untapped" ? 22 : 15;
      const longTail = g.keyword.trim().split(/\s+/).length >= 4;
      const lowCompetition = (g.kd ?? 0) > 0 && (g.kd ?? 0) <= 35;
      const baseScore = scoreRow(g.volume ?? 0, g.kd ?? 0, "commercial", g.keyword, boost);
      const adjusted = Math.max(1, Math.round(baseScore * fit.penaltyFactor));
      return {
        keyword: g.keyword,
        source: "competitor_gap" as const,
        volume: g.volume ?? 0,
        kd: g.kd ?? 0,
        cpc: 0,
        intent: "commercial",
        longTail,
        lowCompetition,
        score: adjusted,
        brandCategory: fit.category,
        brandReason: fit.reason,
        topCompetitor: g.top_competitor_domain ?? "",
      };
    })
    // Hard-drop competitor-brand searches — they cannot drive blog traffic.
    .filter(r => r.brandCategory !== "competitor_brand");

  const skippedBrandCount = context.contentGaps.length - rows.length;

  // ── Augment with raw competitor_keywords if gaps are sparse ──────────────
  if (rows.length < 8 && context.competitorKeywords.length > 0) {
    const seen = new Set(rows.map(r => r.keyword.toLowerCase()));
    for (const ck of context.competitorKeywords) {
      const k = ck.keyword.toLowerCase().trim();
      if (seen.has(k)) continue;
      const fit = evaluateBrandFit(ck.keyword, "commercial", projectDomain, competitorDomains);
      if (fit.category === "competitor_brand") continue;
      const longTail = ck.keyword.trim().split(/\s+/).length >= 4;
      // Frequency stands in for "how often this term appears across competitor pages".
      const baseScore = scoreRow(0, 0, "commercial", ck.keyword, Math.min(20, ck.freq * 2));
      rows.push({
        keyword: ck.keyword,
        source: "competitor_gap",
        volume: 0,
        kd: 0,
        cpc: 0,
        intent: "commercial",
        longTail,
        lowCompetition: false,
        score: Math.max(1, Math.round(baseScore * fit.penaltyFactor)),
        brandCategory: fit.category,
        brandReason: fit.reason,
        topCompetitor: "",
      });
      seen.add(k);
      if (rows.length >= 80) break;
    }
  }

  rows = rows.sort((a, b) => b.score - a.score).slice(0, 80);

  let mismatch: string | null = null;

  if (intent && intent !== "commercial") {
    const intentMatches = rows.filter(r => r.intent.toLowerCase().includes(intent));
    if (intentMatches.length > 0) {
      rows = intentMatches;
    } else {
      mismatch = `Competitor gap keywords are typically commercial-intent. None match "${intent}" intent — showing the most blog-worthy gaps instead.`;
    }
  }

  // Exact prompt mention boost
  const p = prompt.toLowerCase().trim();
  if (p.length >= 4) {
    const exact = rows.filter(r => p.includes(r.keyword.toLowerCase()) || r.keyword.toLowerCase().includes(p));
    if (exact.length) {
      const rest = rows.filter(r => !exact.includes(r));
      rows = [...exact, ...rest];
    }
  }

  return { rows: rows.slice(0, 50), mismatch, skippedBrandCount };
}

export async function runCompetitorAgent(context: AIContext, prompt: string): Promise<ContextualAgentOutput> {
  const { rows, mismatch, skippedBrandCount } = selectRows(context, prompt);

  if (!rows.length) {
    return buildOutput(
      context,
      "I don't see any blog-worthy competitor gaps yet. Run a benchmark on the Competitors page first, then I'll be able to suggest which competitor terms are worth writing about.",
      [],
      actions()
    );
  }

  const competitorList = (context.businessContext.competitorDomains ?? []).slice(0, 4).join(", ");

  const extraContext = [
    `Comparing project domain "${context.businessContext.projectDomain || "(unknown)"}" against competitors: ${competitorList || "(none configured)"}.`,
    skippedBrandCount > 0
      ? `${skippedBrandCount} keyword(s) were SKIPPED because they were brand-navigational queries for competitor sites — those cannot drive blog traffic to your domain.`
      : "",
    `Top-card brand-fit reasons (in order): ${rows
      .slice(0, 8)
      .map((r, i) => `#${i + 1} ${r.brandReason}`)
      .join(" | ")}`,
    `Pick angle for each: prefer terms where you can write a genuine informational/comparison post and out-rank the competitor on depth, not branded queries.`,
  ]
    .filter(Boolean)
    .join("\n");

  const fallbackSummary = `Found ${rows.length} blog-worthy competitor gaps${
    skippedBrandCount > 0 ? ` (${skippedBrandCount} brand-navigational queries filtered out)` : ""
  } and ranked them by opportunity for ${context.businessContext.niche || "your niche"}.`;

  const enriched = await addReasoningWithLLM(context, prompt, rows, fallbackSummary, extraContext);

  const finalSummary = mismatch ? `${mismatch}\n\n${enriched.summary}` : enriched.summary;

  return buildOutput(context, finalSummary, enriched.suggestions, actions());
}
