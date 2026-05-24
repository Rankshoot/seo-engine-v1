/**
 * Keyword discovery pipeline.
 *
 * Given a project domain + target region, returns the top-50 keyword
 * opportunities, blending three sources:
 *
 *   1. competitor_gap — keywords competitors rank for and we don't
 *   2. quick_win      — own organic keywords sitting at positions 4–20
 *   3. industry       — broad seed-derived ideas (reserved for the legacy
 *                        Keywords-Explorer pipeline; this module focuses on
 *                        the Site-Explorer-driven gap+quick-win flow).
 *
 * The module is **pure data orchestration** — no DB writes, no Clerk auth,
 * no UI. The caller (`runKeywordDiscoveryPipeline` in `keyword-actions.ts`)
 * is responsible for persistence and dedupe.
 *
 * Every call funnels through `src/lib/ahrefs.ts`, which already:
 *   • returns `[]` / `null` when AHREFS_API_KEY is missing or any request
 *     fails (so the caller never has to try/catch each step), and
 *   • emits structured `[ahrefs:request]` / `[ahrefs:response]` logs.
 *
 * On top of that, every step here logs a one-line `[discovery]` summary so
 * the Next.js server terminal makes the funnel obvious.
 */

import {
  ahrefsKeywordOverview,
  ahrefsOrganicCompetitors,
  ahrefsOrganicKeywords,
  isAhrefsConfigured,
  type AhrefsCompetitor,
  type AhrefsIntentObject,
  type AhrefsKeywordOverviewRow,
  type AhrefsOrganicKeyword,
} from './ahrefs';
import type { KeywordIntents, KeywordSourceType } from './types';

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

export interface DiscoveryInput {
  /** Raw user input — anything the project record stored as `domain`. */
  domain: string;
  /** Lowercase region code (us / uk / in / …). Forwarded to Ahrefs as `country`. */
  region: string;
  /** Project niche / industry — used for the relevance score. Optional. */
  niche?: string;
  /** Project target audience — also used for relevance. Optional. */
  audience?: string;
  /** Brand / company name. Used to whitelist own-brand keywords from the
   *  branded-keyword penalty. Optional. */
  brand?: string;
  /** Hard cap on returned candidates. Defaults to 50 per spec. */
  topN?: number;
}

export interface KeywordCandidate {
  keyword: string;
  source_type: KeywordSourceType;
  /** Ordered (highest-traffic first) competitor domains that rank for this term. */
  source_competitors: string[];
  /** Ranking page URLs, positionally aligned with `source_competitors`. */
  source_urls: string[];
  volume: number;
  /** Ahrefs KD (0–100) when known. */
  difficulty: number | null;
  /** Cents-encoded CPC, raw from Ahrefs. UI converts via `ahrefsCentsToDollars`. */
  cpc: number | null;
  parent_topic: string | null;
  traffic_potential: number | null;
  intents: KeywordIntents | null;
  /** Single-string dominant intent, for the legacy `keywords.intent` column. */
  intent: string;
  /** Legacy AI score (0–100). Volume × KD × intent. */
  ai_score: number;
  /** Composite analysis score (0–100). The number we sort + display. */
  analysis_score: number;
  /** 0–100 syntactic relevance to the project niche / audience / brand. */
  relevance_score: number;
}

export interface DiscoveryTraceStep {
  step: string;
  ts: string;
  detail: Record<string, unknown>;
}

export interface DiscoveryResult {
  candidates: KeywordCandidate[];
  trace: DiscoveryTraceStep[];
  meta: {
    target: string;
    region: string;
    own_keyword_count: number;
    competitors_returned: number;
    competitors_picked: string[];
    candidate_pool_size: number;
    candidate_pool_after_dedupe: number;
    enriched_with_overview: number;
    final_count: number;
  };
  /** When set, no Ahrefs calls were made and an empty result is being returned. */
  fatal_error?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tunables
// ─────────────────────────────────────────────────────────────────────────────

const TOP_COMPETITOR_COUNT = 5;
const OWN_LIMIT = 150;
const PER_COMP_LIMIT = 100;
const QUICK_WIN_MIN_POSITION = 4;
const QUICK_WIN_MAX_POSITION = 20;
const QUICK_WIN_MIN_VOLUME = 50;
const QUICK_WIN_MAX_COUNT = 15;
/** DR floor — competitors below this are heavily penalized in the picker. */
const COMPETITOR_DR_FLOOR = 10;
/** Domains that pollute organic-competitor lists; never picked as top-5. */
const COMPETITOR_BLOCKLIST = new Set<string>([
  'wikipedia.org',
  'youtube.com',
  'reddit.com',
  'pinterest.com',
  'quora.com',
  'medium.com',
  'facebook.com',
  'twitter.com',
  'x.com',
  'linkedin.com',
]);

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Strip protocol / `www.` / path / port — return bare host (lowercase). */
export function normalizeDomain(input: string): string {
  if (!input) return '';
  let s = String(input).trim().toLowerCase();
  s = s.replace(/^https?:\/\//, '');
  s = s.split('/')[0];
  s = s.split('?')[0];
  s = s.split('#')[0];
  s = s.split(':')[0];
  s = s.replace(/^www\./, '');
  return s;
}

function nowISO(): string {
  return new Date().toISOString();
}

function pushTrace(
  trace: DiscoveryTraceStep[],
  step: string,
  detail: Record<string, unknown>
) {
  trace.push({ step, ts: nowISO(), detail });
  console.log(`[discovery] ${step}`, detail);
}

function clamp(n: number, lo: number, hi: number): number {
  if (Number.isNaN(n) || !Number.isFinite(n)) return lo;
  return Math.min(hi, Math.max(lo, n));
}

function tokenize(s: string): string[] {
  return (s || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .filter(t => t.length >= 3);
}

function inferDominantIntent(intents: AhrefsIntentObject | KeywordIntents | null | undefined): string {
  if (!intents) return '';
  if (intents.transactional) return 'transactional';
  if (intents.commercial) return 'commercial';
  if (intents.informational) return 'informational';
  if (intents.navigational) return 'navigational';
  return '';
}

/** Strip the registered domain of a host for blocklist matching. */
function rootHost(host: string): string {
  const parts = host.split('.').filter(Boolean);
  if (parts.length <= 2) return host;
  return parts.slice(-2).join('.');
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 4: pick the top-5 competitors.
// Composite score:
//   keywords_common      ×  40%
//   log(traffic)         ×  25%
//   log(keywords_competitor) × 20%   // Ahrefs: keywords only THEY rank for (not their total)
//   domain-rating credit ×  15%   (DR<10 = 0, DR>=50 = full)
// Domains in COMPETITOR_BLOCKLIST and the target itself are dropped.
// ─────────────────────────────────────────────────────────────────────────────

interface CompetitorPick extends AhrefsCompetitor {
  pick_score: number;
}

export function pickTopCompetitors(
  competitors: AhrefsCompetitor[],
  target: string,
  limit = TOP_COMPETITOR_COUNT
): CompetitorPick[] {
  if (!competitors.length) return [];
  const targetRoot = rootHost(normalizeDomain(target));

  const filtered = competitors.filter(c => {
    const host = normalizeDomain(c.competitor_domain);
    if (!host) return false;
    if (host === targetRoot) return false;
    if (COMPETITOR_BLOCKLIST.has(rootHost(host))) return false;
    return true;
  });
  if (!filtered.length) return [];

  const maxCommon = Math.max(...filtered.map(c => c.keywords_common || 0), 1);
  const maxComp = Math.max(...filtered.map(c => Math.log10((c.keywords_competitor || 0) + 1)), 1);
  const maxTraffic = Math.max(...filtered.map(c => Math.log10((c.traffic || 0) + 1)), 1);

  const scored: CompetitorPick[] = filtered.map(c => {
    const commonNorm = (c.keywords_common || 0) / maxCommon;
    const compNorm = Math.log10((c.keywords_competitor || 0) + 1) / maxComp;
    const trafficNorm = Math.log10((c.traffic || 0) + 1) / maxTraffic;
    const drRaw = c.domain_rating ?? 0;
    const drCredit =
      drRaw >= 50 ? 1 :
      drRaw >= COMPETITOR_DR_FLOOR ? (drRaw - COMPETITOR_DR_FLOOR) / (50 - COMPETITOR_DR_FLOOR) :
      0;

    const score =
      commonNorm * 40 +
      trafficNorm * 25 +
      compNorm * 20 +
      drCredit * 15;
    return { ...c, pick_score: Math.round(score) };
  });

  scored.sort((a, b) => b.pick_score - a.pick_score);
  return scored.slice(0, limit);
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 6 / 7: build raw candidate pool from gaps + quick wins.
// ─────────────────────────────────────────────────────────────────────────────

interface RawCandidate {
  keyword: string;
  source_type: KeywordSourceType;
  /** competitorDomain → bestPositionUrl. Preserves traffic ordering. */
  competitor_pages: Map<string, string>;
  /** Initial signals before bulk-overview enrichment. */
  initial: {
    volume: number;
    difficulty: number | null;
    cpc: number | null;
    best_position: number | null;
    sum_traffic: number;
  };
}

function upsertCandidate(
  pool: Map<string, RawCandidate>,
  row: AhrefsOrganicKeyword,
  competitorDomain: string,
  source: KeywordSourceType
): RawCandidate {
  const key = row.keyword.trim().toLowerCase();
  const existing = pool.get(key);
  if (!existing) {
    const c: RawCandidate = {
      keyword: key,
      source_type: source,
      competitor_pages: new Map([[competitorDomain, row.best_position_url]]),
      initial: {
        volume: row.volume || 0,
        difficulty: row.keyword_difficulty,
        cpc: row.cpc,
        best_position: row.best_position,
        sum_traffic: row.sum_traffic || 0,
      },
    };
    pool.set(key, c);
    return c;
  }
  existing.competitor_pages.set(competitorDomain, row.best_position_url);
  // Promote from quick_win → competitor_gap if a competitor also ranks for
  // it, since competitor evidence is the stronger signal.
  if (existing.source_type === 'quick_win' && source === 'competitor_gap') {
    existing.source_type = 'competitor_gap';
  }
  if ((row.volume || 0) > existing.initial.volume) {
    existing.initial.volume = row.volume || 0;
  }
  if (existing.initial.difficulty == null && row.keyword_difficulty != null) {
    existing.initial.difficulty = row.keyword_difficulty;
  }
  if (existing.initial.cpc == null && row.cpc != null) {
    existing.initial.cpc = row.cpc;
  }
  return existing;
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 9: deterministic scoring.
//
//   analysis_score (0–100) =
//       volume_score   (0–40, log-scaled, cap at 10k vol)
//     + low_kd_bonus   (0–15)
//     + tp_bonus       (0–10, cap at 5k TP)
//     + intent_score   (0–10)
//     + relevance_part (0–15, scaled from 0–100 relevance)
//     + competitor_gap (0–10, +3 per source competitor, cap 10)
//     − branded_penalty   (−25 unless brand is target)
//     − navigational_penalty (−10 unless brand is target)
//
//   ai_score (legacy 0–100) = the simpler volume/KD/intent blend kept around
//   for backwards compatibility with the calendar/cluster code that still
//   sorts on `keywords.ai_score`.
// ─────────────────────────────────────────────────────────────────────────────

interface ScoringContext {
  brand: string;
  brandTokens: string[];
  nicheTokens: string[];
  audienceTokens: string[];
}

function buildScoringContext(input: DiscoveryInput): ScoringContext {
  const brand = (input.brand || '').trim().toLowerCase();
  return {
    brand,
    brandTokens: tokenize(brand),
    nicheTokens: tokenize(input.niche || ''),
    audienceTokens: tokenize(input.audience || ''),
  };
}

function relevanceScore(keyword: string, ctx: ScoringContext): number {
  const tokens = tokenize(keyword);
  if (!tokens.length) return 0;
  const target = new Set([...ctx.nicheTokens, ...ctx.audienceTokens, ...ctx.brandTokens]);
  if (!target.size) return 50;
  let hits = 0;
  for (const t of tokens) {
    if (target.has(t)) hits += 1;
  }
  // Reward density of niche tokens, penalize totally off-topic phrases.
  const ratio = hits / tokens.length;
  return clamp(Math.round(ratio * 100), 0, 100);
}

function intentScore(intents: AhrefsIntentObject | null | undefined): number {
  if (!intents) return 0;
  if (intents.transactional) return 10;
  if (intents.commercial) return 8;
  if (intents.informational) return 5;
  if (intents.navigational) return 2;
  return 0;
}

function keywordContainsBrand(keyword: string, ctx: ScoringContext): boolean {
  if (!ctx.brand) return false;
  const k = keyword.toLowerCase();
  if (ctx.brand && k.includes(ctx.brand)) return true;
  for (const t of ctx.brandTokens) {
    if (t.length >= 3 && k.includes(t)) return true;
  }
  return false;
}

interface ScoreResult {
  ai_score: number;
  analysis_score: number;
  relevance_score: number;
}

function scoreCandidate(
  candidate: KeywordCandidate,
  ctx: ScoringContext
): ScoreResult {
  const volume = candidate.volume;
  const kd = candidate.difficulty ?? 50;
  const tp = candidate.traffic_potential ?? 0;
  const intents = candidate.intents;

  const volScore = clamp((Math.log10(volume + 1) / Math.log10(10_001)) * 40, 0, 40);
  const kdBonus = clamp(((100 - kd) / 100) * 15, 0, 15);
  const tpBonus = clamp((Math.log10(tp + 1) / Math.log10(5_001)) * 10, 0, 10);
  const intentPart = intentScore(intents);
  const rel = relevanceScore(candidate.keyword, ctx);
  const relPart = (rel / 100) * 15;
  const gapBoost = clamp(candidate.source_competitors.length * 3, 0, 10);

  const isOwnBrand = keywordContainsBrand(candidate.keyword, ctx);
  const brandedPenalty = intents?.branded && !isOwnBrand ? -25 : 0;
  const navPenalty = intents?.navigational && !isOwnBrand ? -10 : 0;

  const analysis = clamp(
    volScore + kdBonus + tpBonus + intentPart + relPart + gapBoost + brandedPenalty + navPenalty,
    0,
    100
  );

  // Legacy AI score (matches the formula in `keyword-actions.ts#aiScore`).
  let aiVol = 0;
  let aiKd = 0;
  let aiIntent = 0;
  if (volume && kd) {
    aiVol = Math.min((volume / 10_000) * 50, 50);
    aiKd = ((100 - kd) / 100) * 40;
    aiIntent =
      intents?.commercial || intents?.transactional ? 10 :
      intents?.informational ? 6 :
      intents?.navigational ? 2 : 0;
  }
  const ai = Math.round(clamp(aiVol + aiKd + aiIntent, 0, 100));

  return {
    ai_score: ai,
    analysis_score: Math.round(analysis),
    relevance_score: rel,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Top-level pipeline
// ─────────────────────────────────────────────────────────────────────────────

export async function runKeywordDiscovery(
  input: DiscoveryInput
): Promise<DiscoveryResult> {
  const trace: DiscoveryTraceStep[] = [];
  const target = normalizeDomain(input.domain);
  const region = (input.region || 'us').toLowerCase();
  const topN = Math.max(1, Math.min(input.topN ?? 50, 100));

  const meta: DiscoveryResult['meta'] = {
    target,
    region,
    own_keyword_count: 0,
    competitors_returned: 0,
    competitors_picked: [],
    candidate_pool_size: 0,
    candidate_pool_after_dedupe: 0,
    enriched_with_overview: 0,
    final_count: 0,
  };

  pushTrace(trace, 'normalize_domain', { input: input.domain, target });

  if (!target) {
    return {
      candidates: [],
      trace,
      meta,
      fatal_error: 'Project domain is empty after normalization.',
    };
  }
  if (!isAhrefsConfigured()) {
    pushTrace(trace, 'config_error', { error: 'AHREFS_API_KEY missing' });
    return {
      candidates: [],
      trace,
      meta,
      fatal_error: 'AHREFS_API_KEY is not configured.',
    };
  }

  // 2 + 3. Fan out the two cheap site-explorer calls in parallel.
  pushTrace(trace, 'fetch_own_and_competitors_start', { target, region });
  const [ownKeywords, competitors] = await Promise.all([
    ahrefsOrganicKeywords(target, region, OWN_LIMIT).catch(e => {
      console.warn('[discovery] own organic-keywords failed:', e);
      return [] as AhrefsOrganicKeyword[];
    }),
    ahrefsOrganicCompetitors(target, region, 10).catch(e => {
      console.warn('[discovery] organic-competitors failed:', e);
      return [] as AhrefsCompetitor[];
    }),
  ]);
  meta.own_keyword_count = ownKeywords.length;
  meta.competitors_returned = competitors.length;
  pushTrace(trace, 'fetch_own_and_competitors_done', {
    own_keyword_count: ownKeywords.length,
    competitors_returned: competitors.length,
  });

  // 4. Pick the top-5 competitors.
  const picked = pickTopCompetitors(competitors, target, TOP_COMPETITOR_COUNT);
  meta.competitors_picked = picked.map(p => normalizeDomain(p.competitor_domain));
  pushTrace(trace, 'pick_top_competitors', {
    considered: competitors.length,
    picked: picked.map(p => ({
      domain: p.competitor_domain,
      pick_score: p.pick_score,
      domain_rating: p.domain_rating,
      keywords_common: p.keywords_common,
      keywords_competitor: p.keywords_competitor,
      traffic: p.traffic,
    })),
  });

  // 5. Pull each picked competitor's organic-keywords in parallel.
  const competitorKeywordSets = await Promise.all(
    picked.map(p =>
      ahrefsOrganicKeywords(normalizeDomain(p.competitor_domain), region, PER_COMP_LIMIT)
        .then(rows => ({ domain: normalizeDomain(p.competitor_domain), rows }))
        .catch(e => {
          console.warn(`[discovery] organic-keywords for ${p.competitor_domain} failed:`, e);
          return { domain: normalizeDomain(p.competitor_domain), rows: [] as AhrefsOrganicKeyword[] };
        })
    )
  );
  pushTrace(trace, 'fetch_competitor_keywords_done', {
    counts: competitorKeywordSets.map(c => ({ domain: c.domain, rows: c.rows.length })),
  });

  // 6. Build the gap pool. Strip own-ranking keywords + dedupe by lowercase
  //    keyword. Keep the full set of `competitor → best_position_url` so the
  //    UI can display "X competitors rank for this".
  const ownIndex = new Set(ownKeywords.map(k => k.keyword.trim().toLowerCase()));
  const pool = new Map<string, RawCandidate>();
  for (const { domain, rows } of competitorKeywordSets) {
    for (const row of rows) {
      const k = row.keyword.trim().toLowerCase();
      if (!k) continue;
      if (ownIndex.has(k)) continue;
      upsertCandidate(pool, row, domain, 'competitor_gap');
    }
  }
  pushTrace(trace, 'build_gap_pool', {
    competitor_rows_total: competitorKeywordSets.reduce((s, c) => s + c.rows.length, 0),
    own_keywords_excluded: ownIndex.size,
    pool_after_gap: pool.size,
  });

  // 7. Quick wins from our own organic-keywords. positions 4–20, sorted by
  //    sum_traffic so the most actionable rises first. Up to QUICK_WIN_MAX_COUNT.
  const quickWinSource = ownKeywords
    .filter(r => {
      const pos = r.best_position ?? 0;
      const v = r.volume ?? 0;
      return pos >= QUICK_WIN_MIN_POSITION && pos <= QUICK_WIN_MAX_POSITION && v >= QUICK_WIN_MIN_VOLUME;
    })
    .sort((a, b) => (b.sum_traffic || 0) - (a.sum_traffic || 0))
    .slice(0, QUICK_WIN_MAX_COUNT);

  for (const row of quickWinSource) {
    upsertCandidate(pool, row, target, 'quick_win');
  }
  meta.candidate_pool_size = pool.size;
  pushTrace(trace, 'add_quick_wins', {
    own_rows_considered: ownKeywords.length,
    quick_wins_added: quickWinSource.length,
    pool_after_quick_wins: pool.size,
  });

  if (!pool.size) {
    pushTrace(trace, 'empty_pool', { reason: 'no candidate keywords after gap+quick-win' });
    return { candidates: [], trace, meta };
  }

  // 8. Preliminary score to filter candidate pool down to top 100 before calling Ahrefs bulk overview.
  const ctx = buildScoringContext(input);
  const rawCandidates = [...pool.values()];

  const preScored = rawCandidates.map(raw => {
    const competitors = [...raw.competitor_pages.entries()]
      .filter(([dom]) => dom && dom !== target)
      .map(([dom, url]) => ({ dom, url }));

    const candidate: KeywordCandidate = {
      keyword: raw.keyword,
      source_type: raw.source_type,
      source_competitors: competitors.map(c => c.dom),
      source_urls: competitors.map(c => c.url),
      volume: raw.initial.volume ?? 0,
      difficulty: raw.initial.difficulty ?? 50,
      cpc: raw.initial.cpc ?? 0,
      parent_topic: null,
      traffic_potential: null,
      intents: null,
      intent: '',
      ai_score: 0,
      analysis_score: 0,
      relevance_score: 0,
    };

    const s = scoreCandidate(candidate, ctx);
    return {
      raw,
      preliminary_score: s.analysis_score,
      volume: candidate.volume,
    };
  });

  // Sort by preliminary score desc, volume desc
  preScored.sort((a, b) => {
    if (b.preliminary_score !== a.preliminary_score) return b.preliminary_score - a.preliminary_score;
    return b.volume - a.volume;
  });

  // Pick top 100 for overview enrichment
  const topCandidates = preScored.slice(0, 100).map(x => x.raw);
  const topKws = topCandidates.map(c => c.keyword);

  const overview = await ahrefsKeywordOverview(topKws, region).catch(e => {
    console.warn('[discovery] keyword-overview failed:', e);
    return new Map<string, AhrefsKeywordOverviewRow>();
  });

  meta.enriched_with_overview = overview.size;
  pushTrace(trace, 'enrich_overview', {
    requested: topKws.length,
    returned: overview.size,
    chunks_estimated: Math.ceil(topKws.length / 80),
    pool_size: rawCandidates.length,
  });

  // 9. Score each candidate.
  const scored: KeywordCandidate[] = [];
  for (const raw of topCandidates) {
    const ov = overview.get(raw.keyword) ?? null;
    const competitors = [...raw.competitor_pages.entries()]
      .filter(([dom]) => dom && dom !== target)
      .map(([dom, url]) => ({ dom, url }));
    const intents = ov?.intents ?? null;
    const candidate: KeywordCandidate = {
      keyword: raw.keyword,
      source_type: raw.source_type,
      source_competitors: competitors.map(c => c.dom),
      source_urls: competitors.map(c => c.url),
      volume: ov?.volume ?? raw.initial.volume ?? 0,
      difficulty: ov?.difficulty ?? raw.initial.difficulty ?? null,
      cpc: ov?.cpc ?? raw.initial.cpc ?? null,
      parent_topic: ov?.parent_topic ?? null,
      traffic_potential: ov?.traffic_potential ?? null,
      intents,
      intent: inferDominantIntent(intents),
      ai_score: 0,
      analysis_score: 0,
      relevance_score: 0,
    };
    const s = scoreCandidate(candidate, ctx);
    candidate.ai_score = s.ai_score;
    candidate.analysis_score = s.analysis_score;
    candidate.relevance_score = s.relevance_score;
    scored.push(candidate);
  }
  meta.candidate_pool_after_dedupe = scored.length;

  // 10. Top-N by analysis_score, with volume as tiebreaker.
  scored.sort((a, b) => {
    if (b.analysis_score !== a.analysis_score) return b.analysis_score - a.analysis_score;
    return (b.volume || 0) - (a.volume || 0);
  });
  const top = scored.slice(0, topN);
  meta.final_count = top.length;

  pushTrace(trace, 'final_top_n', {
    topN,
    final: top.length,
    by_source: {
      industry: top.filter(c => c.source_type === 'industry').length,
      competitor_gap: top.filter(c => c.source_type === 'competitor_gap').length,
      quick_win: top.filter(c => c.source_type === 'quick_win').length,
    },
    sample: top.slice(0, 3).map(c => ({
      keyword: c.keyword,
      source_type: c.source_type,
      analysis_score: c.analysis_score,
      volume: c.volume,
      difficulty: c.difficulty,
    })),
  });

  return { candidates: top, trace, meta };
}
