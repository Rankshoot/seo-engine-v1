/**
 * Keywords Agent — chatbot decision-maker for the Keywords page.
 *
 * INPUTS
 *   - context.keywords        → DB-cached "Industry" tab keywords
 *   - context.domainKeywords  → live "Domain" tab keywords (Google Ads For Site)
 *   - context.businessContext → niche, audience, brief, projectDomain, competitorDomains
 *
 * SCORING
 *   Raw opportunity score (volume × difficulty × intent) is multiplied by a
 *   brand-fit penalty:
 *     - Competitor brand keywords  → 0.15× (almost always irrelevant for blogs)
 *     - Navigational intent        → 0.35× (low blog upside)
 *     - Company-lookup phrasing    → 0.30× (e.g. "<Company> Pvt Ltd")
 *     - Own brand                  → 1×  (kept; useful for branded landing pages)
 *     - Plain content keyword      → 1×
 *
 * OUTPUT
 *   The top-N suggestions are pre-sorted, then `addReasoningWithLLM` enforces
 *   a summary that names them in order so the chat text and the cards match.
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

interface KeywordRow extends CandidateRow {
  /** Source pool — for transparency in summaries. */
  pool: "industry" | "domain";
  /** Brand-fit category from `evaluateBrandFit`. */
  brandCategory: string;
  /** Brand-fit reason — also used in the LLM prompt extra context. */
  brandReason: string;
}

/** Up-rank topics a CHRO / TA leader / HRBP would read for thought leadership. */
function thoughtLeadershipBoost(keyword: string, niche: string): number {
  const k = keyword.toLowerCase();
  const n = niche.toLowerCase();
  let b = 0;
  if (
    /\b(chro|chief human resources|c-suite|cxo|ta leader|talent acquisition|hr leadership|vp hr|hrbp|people leader|future of work|workforce planning|workforce transformation|ai in (hr|recruitment|hiring)|emerging roles)\b/.test(
      k
    )
  ) {
    b += 14;
  }
  if (/\b(hr|recruit|talent|hiring|workforce|people ops|employer|rpo)\b/.test(n)) {
    if (/\b(strategy|transformation|trend|challenge|guide|how to|benchmark|survey|report|forecast)\b/.test(k)) b += 7;
  }
  return Math.min(b, 22);
}

function actions(): ContextualAction[] {
  return [
    { type: "ANALYZE_KEYWORDS", label: "Re-analyze", description: "Re-rank keyword opportunities for this page." },
    { type: "FILTER_LOW_COMPETITION", label: "Easy to rank", description: "Focus on low-difficulty wins." },
    { type: "SUGGEST_LONG_TAIL", label: "Long-tail picks", description: "Specific high-intent long-tail terms." },
  ];
}

/** Build the merged candidate pool (Industry DB + live Domain). */
function buildRows(context: AIContext): KeywordRow[] {
  const projectDomain = context.businessContext.projectDomain ?? "";
  const competitorDomains = context.businessContext.competitorDomains ?? [];
  const niche = context.businessContext.niche ?? "";
  const seen = new Set<string>();
  const rows: KeywordRow[] = [];

  const addRow = (
    row: Omit<KeywordRow, "score" | "brandCategory" | "brandReason"> & {
      rawBoost: number;
    }
  ) => {
    const key = row.keyword.toLowerCase().trim();
    if (!key || seen.has(key)) return;
    seen.add(key);

    const fit = evaluateBrandFit(row.keyword, row.intent, projectDomain, competitorDomains);
    const baseScore = scoreRow(row.volume, row.kd, row.intent, row.keyword, row.rawBoost);
    const adjusted = Math.max(1, Math.round(baseScore * fit.penaltyFactor));

    rows.push({
      id: row.id,
      keyword: row.keyword,
      source: row.source,
      volume: row.volume,
      kd: row.kd,
      cpc: row.cpc,
      intent: row.intent,
      longTail: row.longTail,
      lowCompetition: row.lowCompetition,
      pool: row.pool,
      brandCategory: fit.category,
      brandReason: fit.reason,
      score: adjusted,
    });
  };

  // ── Industry pool (DB) ────────────────────────────────────────────────────
  for (const k of context.keywords) {
    addRow({
      id: k.id,
      keyword: k.keyword,
      source: "keyword",
      volume: k.volume ?? 0,
      kd: k.kd ?? 0,
      cpc: k.cpc ?? 0,
      intent: k.intent ?? "",
      longTail: k.keyword.trim().split(/\s+/).length >= 4,
      lowCompetition: (k.kd ?? 0) > 0 && (k.kd ?? 0) <= 35,
      pool: "industry",
      rawBoost: thoughtLeadershipBoost(k.keyword, niche),
    });
  }

  // ── Domain pool (live) ────────────────────────────────────────────────────
  for (const d of context.domainKeywords ?? []) {
    addRow({
      id: undefined,
      keyword: d.keyword,
      source: "keyword",
      volume: d.volume ?? 0,
      kd: d.kd ?? 0,
      cpc: d.cpc ?? 0,
      intent: d.intent ?? "",
      longTail: d.keyword.trim().split(/\s+/).length >= 4,
      lowCompetition: (d.kd ?? 0) > 0 && (d.kd ?? 0) <= 35,
      pool: "domain",
      rawBoost: 6 + thoughtLeadershipBoost(d.keyword, niche), // domain-tab queries already match the user's footprint
    });
  }

  return rows;
}

function applyFilters(
  rows: KeywordRow[],
  prompt: string
): { rows: KeywordRow[]; mismatch: string | null } {
  const { intent, lowCompetitionOnly, longTailOnly } = extractQueryFilters(prompt);
  let filtered = [...rows];
  let mismatch: string | null = null;

  // Intent filter
  if (intent) {
    const intentMatches = filtered.filter(r => {
      const kIntent = (r.intent ?? "").toLowerCase();
      return kIntent === intent || kIntent.includes(intent);
    });
    if (intentMatches.length > 0) {
      filtered = intentMatches;
    } else {
      mismatch = `None of your current keywords have **${intent}** intent — your dataset is mostly ${
        rows[0]?.intent || "unlabelled"
      }. Showing the highest-scoring blog-suitable keywords instead.`;
      filtered = rows;
    }
  }

  if (lowCompetitionOnly) {
    const lowComp = filtered.filter(r => r.lowCompetition);
    if (lowComp.length > 0) filtered = lowComp;
  }

  if (longTailOnly) {
    const longTail = filtered.filter(r => r.longTail);
    if (longTail.length > 0) filtered = longTail;
  }

  // Exact-keyword mention boost
  const p = prompt.toLowerCase().trim();
  if (p.length >= 4 && !intent) {
    const exact = filtered.filter(
      r => p.includes(r.keyword.toLowerCase()) || r.keyword.toLowerCase().includes(p)
    );
    if (exact.length) {
      const rest = filtered.filter(r => !exact.includes(r));
      filtered = [...exact, ...rest];
    }
  }

  return {
    rows: filtered.sort((a, b) => b.score - a.score).slice(0, 50),
    mismatch,
  };
}

export async function runKeywordsAgent(context: AIContext, prompt: string): Promise<ContextualAgentOutput> {
  const allRows = buildRows(context);

  if (!allRows.length) {
    return buildOutput(
      context,
      "No keyword data is loaded yet. Run keyword discovery on the Keywords page (Industry tab) or open the Domain tab to fetch live ranking keywords for your site, then ask me again.",
      [],
      actions()
    );
  }

  const { rows: filteredRows, mismatch } = applyFilters(allRows, prompt);

  // Build extra context the LLM uses to write smart, brand-aware reasoning.
  const totalIndustry = allRows.filter(r => r.pool === "industry").length;
  const totalDomain = allRows.filter(r => r.pool === "domain").length;
  const skippedBrand = allRows.filter(r => r.brandCategory === "competitor_brand").length;
  const extraContext = [
    `POOL SIZE — industry: ${totalIndustry}, domain: ${totalDomain}.`,
    skippedBrand > 0
      ? `${skippedBrand} keyword(s) were down-weighted as competitor-brand searches (bad blog targets).`
      : "",
    `Each card includes a brand-fit category: ${[...new Set(filteredRows.slice(0, 8).map(r => r.brandCategory))].join(", ")}.`,
    `Pool of each shown card (in card order): ${filteredRows
      .slice(0, 10)
      .map((r, i) => `#${i + 1}=${r.pool}`)
      .join(", ")}.`,
    `Brand-fit notes (in card order): ${filteredRows
      .slice(0, 10)
      .map((r, i) => `#${i + 1} ${r.brandReason}`)
      .join(" | ")}`,
  ]
    .filter(Boolean)
    .join("\n");

  const fallbackSummary =
    mismatch ??
    `Analysed ${allRows.length} keywords (${totalIndustry} industry + ${totalDomain} domain) and ranked the most blog-suitable picks for ${
      context.businessContext.niche || "your niche"
    }.`;

  const enriched = await addReasoningWithLLM(context, prompt, filteredRows, fallbackSummary, extraContext);

  const finalSummary = mismatch ? `${mismatch}\n\n${enriched.summary}` : enriched.summary;

  return buildOutput(context, finalSummary, enriched.suggestions, actions());
}
