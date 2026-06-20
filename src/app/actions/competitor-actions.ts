'use server';

/**
 * Server actions for the Competitor Benchmarking Engine.
 *
 *   • `runCompetitorBenchmark` — When the user lists competitors on the project,
 *     keyword gaps come from **DataForSEO
 *     `keywords_data/google_ads/keywords_for_site/live`** (per competitor
 *     domain, `location_code` + `language_code` from project, `search_partners:
 *     true`, `sort_by: search_volume`, limit 10). That API does not return
 *     landing URLs, so we match each keyword to the closest **blog URL from the
 *     competitor’s public sitemap** (see `competitor-sitemap-match.ts`). Ahrefs
 *     is used only when **no** manual competitors exist. DataForSEO is also the
 *     fallback when Ahrefs returns no opportunities (for manual competitors only).
 *
 *   • `getCompetitorBenchmark` — hydrate all three tables for the project.
 *
 *   • `generateBlogFromOpportunity` — one-click "Generate blog" from a gap row.
 */

import { supabaseAdmin } from '@/lib/supabase';
import { deterministicFunnelStage } from '@/lib/keyword-funnel';
import { currentUser } from '@clerk/nextjs/server';
import {
  type BenchmarkTraceEntry,
} from '@/lib/competitor-benchmark';
import { fetchKeywordVitals, fetchGoogleAdsKeywordsForSite } from '@/lib/dataforseo';
import {
  ahrefsOrganicKeywords,
  isAhrefsConfigured,
} from '@/lib/ahrefs';
import { isProviderEnabled } from '@/lib/admin/platform-settings-runtime';
import { canUseOrganicCompetitorsApi } from '@/lib/plan-api-access';
import { addKeywordToCalendarOnDate, collectEarliestVacantDates } from '@/app/actions/calendar-actions';
import type {
  BenchmarkAverages,
  Competitor,
  CompetitorKeyword,
  KeywordGap,
  Project,
  ProjectCompetitor,
} from '@/lib/types';

// ─────────────────────────────────────────────────────────────────────────────
// Small helpers
// ─────────────────────────────────────────────────────────────────────────────

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function toTitleCase(text: string): string {
  return text
    .split(' ')
    .map(w => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ')
    .trim();
}

function trendPctFromString(trend: string | null | undefined): number {
  if (!trend) return 0;
  const match = trend.match(/-?\d+(\.\d+)?/);
  return match ? Number(match[0]) : 0;
}

function safeHostFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
}

function normalizeDomainInput(raw: string): string {
  return (raw || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/.*$/, '');
}

/** Rows per competitor from Google Ads Keywords For Site (DataForSEO). */
const KEYWORDS_FOR_SITE_LIMIT = 100;

/** Rows per competitor fetched from Ahrefs organic keywords (cost-optimised). */
const AHREFS_KEYWORDS_PER_COMPETITOR = 10;

/** Max rows written to `competitor_keywords` and `keyword_gaps`; must match `getCompetitorBenchmark` read limit. */
const BENCHMARK_KEYWORD_CAP = 200;

// ─────────────────────────────────────────────────────────────────────────────
// 1. Run the full benchmark pipeline
// ─────────────────────────────────────────────────────────────────────────────

export interface RunBenchmarkResult {
  success: boolean;
  error?: string;
  competitorsFound?: number;
  pagesScraped?: number;
  keywordsExtracted?: number;
  gapsFound?: number;
  averages?: BenchmarkAverages | null;
  trace?: BenchmarkTraceEntry[];
}

interface RankingOpportunity {
  keyword: string;
  volume: number;
  kd: number;
  trend: string;
  trend_pct: number;
  gap_type: 'missing' | 'weak' | 'untapped';
  top_competitor_domain: string;
  top_competitor_url: string;
  source_title: string;
  position: number;
  is_informational?: boolean;
  is_navigational?: boolean;
  is_commercial?: boolean;
  is_transactional?: boolean;
  is_branded?: boolean;
}

export async function runCompetitorBenchmark(projectId: string): Promise<RunBenchmarkResult> {
  const user = await currentUser();
  if (!user) return { success: false, error: 'Not authenticated' };

  // Check if user's plan allows the organic competitors API
  const canUseApi = await canUseOrganicCompetitorsApi(user.id);
  if (!canUseApi) {
    return {
      success: false,
      error: 'The competitor benchmark feature is not available on your current plan. Please upgrade to access this feature.',
    };
  }

  const { data: projectRow, error: pErr } = await supabaseAdmin
    .from('projects')
    .select('*, project_competitors(*)')
    .eq('id', projectId)
    .eq('user_id', user.id)
    .single();

  if (pErr || !projectRow) return { success: false, error: 'Project not found' };
  const project = projectRow as Project & { project_competitors?: ProjectCompetitor[] };

  const trace: BenchmarkTraceEntry[] = [];
  const ahrefsKeyConfigured = isAhrefsConfigured();
  const ahrefsAdminEnabled = ahrefsKeyConfigured ? await isProviderEnabled('ahrefs') : false;
  const ahrefsAvailable = ahrefsKeyConfigured && ahrefsAdminEnabled;
  console.log(
    `[benchmark] start project=${projectId} domain=${project.domain} region=${project.target_region} ahrefs=${ahrefsAvailable ? 'on' : 'off'} (key=${ahrefsKeyConfigured} admin=${ahrefsAdminEnabled})`
  );

  const ownDomain = normalizeDomainInput(project.domain);
  const knownDomains = (project.project_competitors ?? []).map(c => c.domain);
  const userSuppliedHosts = [
    ...new Set(
      knownDomains.map(d => normalizeDomainInput(d)).filter((h): h is string => Boolean(h))
    ),
  ];

  if (userSuppliedHosts.length === 0) {
    return {
      success: false,
      error: 'Please add competitor domains on the project overview page to show competitor keywords.',
      trace,
    };
  }

  const competitorList = userSuppliedHosts.map(host => ({
    domain: host,
    rank_score: 1,
    top_url: `https://${host}`,
    top_title: host,
  }));

  let benchmarkSource: 'ahrefs' | 'dataforseo' = ahrefsAvailable ? 'ahrefs' : 'dataforseo';

  trace.push({
    label: 'benchmark_keyword_source',
    ok: true,
    info: {
      source: ahrefsAvailable
        ? '/site-explorer/organic-keywords'
        : 'keywords_data/google_ads/keywords_for_site/live',
      reason: ahrefsAvailable
        ? 'Project has manual competitors — Ahrefs organic keywords enabled.'
        : 'Project has manual competitors — Ahrefs disabled, using DataForSEO Google Ads Keywords For Site.',
      competitors: userSuppliedHosts,
      own_domain: ownDomain,
      target_region: project.target_region,
      target_language: (project as { target_language?: string }).target_language ?? 'en',
      limit_per_competitor: ahrefsAvailable ? AHREFS_KEYWORDS_PER_COMPETITOR : KEYWORDS_FOR_SITE_LIMIT,
    },
  });

  const rankingOpportunities: RankingOpportunity[] = [];

  // ───────────────────────────────────────────────────────────────────────
  // 1c. Build ranking opportunities.
  // ───────────────────────────────────────────────────────────────────────
  if (benchmarkSource === 'ahrefs') {
    const kwLimit = AHREFS_KEYWORDS_PER_COMPETITOR;

    for (const competitor of competitorList.slice(0, 8)) {
      const organicKeywords = await ahrefsOrganicKeywords(competitor.domain, project.target_region, kwLimit);

      const seenKeywords = new Set<string>();

      for (const row of organicKeywords) {
        const keyword = row.keyword.trim().toLowerCase();
        if (!keyword || seenKeywords.has(keyword)) continue;
        seenKeywords.add(keyword);

        rankingOpportunities.push({
          keyword,
          volume: row.volume || 0,
          kd: row.keyword_difficulty ?? 0,
          trend: '+0%',
          trend_pct: 0,
          gap_type: 'missing',
          top_competitor_domain: competitor.domain,
          top_competitor_url: row.best_position_url || `https://${competitor.domain}`,
          source_title: competitor.top_title || competitor.domain,
          position: row.best_position ?? 0,
          is_informational: row.is_informational,
          is_navigational: row.is_navigational,
          is_commercial: row.is_commercial,
          is_transactional: row.is_transactional,
          is_branded: row.is_branded,
        });
      }
    }

    trace.push({
      label: 'ahrefs_ranking_opportunities',
      ok: true,
      info: { competitors_scanned: competitorList.length, opportunities: rankingOpportunities.length, kw_limit: kwLimit },
    });
  }

  if (benchmarkSource === 'dataforseo') {
    const languageCode = (project as { target_language?: string }).target_language ?? 'en';
    console.log(
      `[benchmark] dataforseo keywords_for_site × ${competitorList.length} competitor(s), ${KEYWORDS_FOR_SITE_LIMIT} keywords each`
    );
    const intersectionResults = await Promise.all(
      competitorList.map(async competitor => {
        const { rows: items } = await fetchGoogleAdsKeywordsForSite(
          competitor.domain,
          project.target_region,
          languageCode,
          KEYWORDS_FOR_SITE_LIMIT
        );
        return { competitor, items };
      })
    );

    for (const { competitor, items } of intersectionResults) {
      console.log(
        `[benchmark] keywords_for_site ${competitor.domain} → ${items.length} keywords`
      );
      trace.push({
        label: `dataforseo_keywords_for_site: ${competitor.domain}`,
        ok: true,
        info: { keywords_returned: items.length, limit: KEYWORDS_FOR_SITE_LIMIT },
      });
      for (const row of items) {
        rankingOpportunities.push({
          keyword: row.keyword,
          volume: row.volume,
          kd: row.kd,
          trend: '+0%',
          trend_pct: 0,
          gap_type: 'missing',
          top_competitor_domain: competitor.domain,
          top_competitor_url: `https://${competitor.domain}`,
          source_title: competitor.domain,
          position: 0,
        });
      }
    }
  }

  const dedupedOpportunities = dedupeOpportunities(rankingOpportunities);
  dedupedOpportunities.sort(
    (a, b) => b.volume - a.volume || a.position - b.position
  );

  console.log(
    `[benchmark] raw=${rankingOpportunities.length} deduped=${dedupedOpportunities.length} unique_keywords=${new Set(dedupedOpportunities.map(o => o.keyword)).size}`
  );

  if (!dedupedOpportunities.length) {
    return {
      success: false,
      error: 'No competitor keywords found. Please check competitor domains or try again later.',
      trace,
    };
  }

  // ───────────────────────────────────────────────────────────────────────
  // 1d. Persist basic competitors
  // ───────────────────────────────────────────────────────────────────────
  const persistedCompetitors: Array<{
    id: string;
    domain: string;
    pages: any[];
  }> = [];

  const allBenchmarkDomains = [
    ...new Set([
      ...competitorList.map(c => c.domain),
      ...dedupedOpportunities.map(o => o.top_competitor_domain),
    ]),
  ];

  for (const domain of allBenchmarkDomains) {
    const comp = competitorList.find(c => c.domain === domain);
    const compRow = {
      project_id: projectId,
      domain,
      title: (comp?.top_title ?? domain).slice(0, 300),
      rank_score:
        comp?.rank_score ?? dedupedOpportunities.filter(o => o.top_competitor_domain === domain).length,
      pages_scraped: 0,
      avg_word_count: 0,
      avg_h2: 0,
      avg_h3: 0,
      avg_images: 0,
      avg_internal_links: 0,
      avg_external_links: 0,
      faq_pages_pct: 0,
      top_pages: [],
      recommendations: [],
      last_benchmarked_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { data: upserted, error: upErr } = await supabaseAdmin
      .from('competitors')
      .upsert(compRow, { onConflict: 'project_id,domain' })
      .select('id, domain')
      .single();

    if (upErr || !upserted) {
      trace.push({ label: `competitor_upsert: ${domain}`, ok: false, error: upErr?.message ?? 'no row' });
      continue;
    }

    persistedCompetitors.push({
      id: upserted.id as string,
      domain,
      pages: [],
    });
  }

  // 1e. Replace competitor_keywords rows for this project atomically.
  await supabaseAdmin.from('competitor_keywords').delete().eq('project_id', projectId);
  const ckRows: Array<Record<string, unknown>> = [];
  const competitorIdByDomain = new Map(persistedCompetitors.map(c => [c.domain, c.id]));
  for (const opportunity of dedupedOpportunities.slice(0, BENCHMARK_KEYWORD_CAP)) {
    const competitorId = competitorIdByDomain.get(opportunity.top_competitor_domain);
    if (!competitorId) continue;
    ckRows.push({
      competitor_id: competitorId,
      project_id: projectId,
      keyword: opportunity.keyword,
      kind: 'primary',
      freq: 1,
      source_url: opportunity.top_competitor_url,
      source_title: opportunity.source_title,
    });
  }
  if (ckRows.length) {
    const { error: ckErr } = await supabaseAdmin.from('competitor_keywords').insert(ckRows);
    if (ckErr) trace.push({ label: 'competitor_keywords_insert', ok: false, error: ckErr.message });
  }

  // 1f. Hydrate volumes/trends for any rows that came back from Ahrefs / SERP without volume.
  const missingVolume = dedupedOpportunities
    .filter(o => o.volume <= 0)
    .map(o => o.keyword);
  const vitals = missingVolume.length
    ? await fetchKeywordVitals(missingVolume, project.target_region, project.target_language)
    : new Map();
  trace.push({
    label: 'dataforseo_vitals',
    ok: true,
    info: { requested: missingVolume.length, hydrated: vitals.size },
  });

  // 1g. Score + persist keyword_gaps.
  await supabaseAdmin.from('keyword_gaps').delete().eq('project_id', projectId);
  const bestCompetitorPerKeyword = pickBestCompetitorPerKeyword(dedupedOpportunities);
  const gapRows = bestCompetitorPerKeyword.map(opportunity => {
    const v = vitals.get(opportunity.keyword);
    const volume = opportunity.volume || v?.volume || 0;
    const trend = opportunity.trend || v?.trend || '+0%';
    const trend_pct = opportunity.trend_pct || v?.trend_pct || 0;
    const kd = opportunity.kd || 0;
    return {
      project_id: projectId,
      keyword: opportunity.keyword,
      gap_type: 'missing',
      opportunity_score: 0,
      volume,
      kd,
      trend,
      trend_pct,
      competitor_weakness: 0,
      top_competitor_domain: opportunity.top_competitor_domain,
      top_competitor_url: opportunity.top_competitor_url,
      reasoning: '',
      position: opportunity.position ?? null,
      is_informational: opportunity.is_informational ?? false,
      is_navigational: opportunity.is_navigational ?? false,
      is_commercial: opportunity.is_commercial ?? false,
      is_transactional: opportunity.is_transactional ?? false,
      is_branded: opportunity.is_branded ?? false,
      updated_at: new Date().toISOString(),
    };
  });

  gapRows.sort((a, b) => b.volume - a.volume);
  const topGapRows = gapRows.slice(0, BENCHMARK_KEYWORD_CAP);

  if (topGapRows.length) {
    const { error: gapErr } = await supabaseAdmin
      .from('keyword_gaps')
      .upsert(topGapRows, { onConflict: 'project_id,keyword' });
    if (gapErr) trace.push({ label: 'keyword_gaps_upsert', ok: false, error: gapErr.message });
  }

  const averages: BenchmarkAverages = {
    avg_word_count: 0,
    avg_h2: 0,
    avg_h3: 0,
    avg_images: 0,
    avg_internal_links: 0,
    avg_external_links: 0,
    faq_pages_pct: 0,
    pages_analyzed: 0,
    recommendations: [],
  };

  const benchmarkedSnapshot = userSuppliedHosts.slice().sort().join('|');
  await supabaseAdmin
    .from('projects')
    .update({ last_benchmarked_competitor_snapshot: benchmarkedSnapshot })
    .eq('id', projectId);

  console.log(
    `[benchmark] done project=${projectId} via=${String(benchmarkSource)} competitors=${persistedCompetitors.length} keywords=${dedupedOpportunities.length} gaps=${topGapRows.length}`
  );

  return {
    success: true,
    competitorsFound: persistedCompetitors.length,
    pagesScraped: 0,
    keywordsExtracted: dedupedOpportunities.length,
    gapsFound: topGapRows.length,
    averages,
    trace,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

function dedupeOpportunities(rows: RankingOpportunity[]): RankingOpportunity[] {
  const map = new Map<string, RankingOpportunity>();
  for (const row of rows) {
    const key = `${row.keyword}|${row.top_competitor_domain}`;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, row);
      continue;
    }
    if (row.volume > existing.volume) map.set(key, row);
    else if (row.volume === existing.volume && row.position > 0 && row.position < existing.position) {
      map.set(key, row);
    }
  }
  return [...map.values()];
}

function pickBestCompetitorPerKeyword(rows: RankingOpportunity[]): RankingOpportunity[] {
  const byKeyword = new Map<string, RankingOpportunity>();
  for (const row of rows) {
    const existing = byKeyword.get(row.keyword);
    if (!existing) {
      byKeyword.set(row.keyword, row);
      continue;
    }
    if (row.volume > existing.volume) byKeyword.set(row.keyword, row);
    else if (
      row.volume === existing.volume &&
      row.position > 0 &&
      (existing.position === 0 || row.position < existing.position)
    ) {
      byKeyword.set(row.keyword, row);
    }
  }
  return [...byKeyword.values()];
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Hydrate benchmark state for the UI
// ─────────────────────────────────────────────────────────────────────────────

export interface BenchmarkState {
  success: boolean;
  error?: string;
  competitors: Competitor[];
  competitorKeywords: CompetitorKeyword[];
  gaps: KeywordGap[];
  averages: BenchmarkAverages;
  lastBenchmarkedAt: string | null;
}

export async function getCompetitorBenchmark(projectId: string): Promise<BenchmarkState> {
  const empty: BenchmarkState = {
    success: false,
    competitors: [],
    competitorKeywords: [],
    gaps: [],
    averages: {
      avg_word_count: 0,
      avg_h2: 0,
      avg_h3: 0,
      avg_images: 0,
      avg_internal_links: 0,
      avg_external_links: 0,
      faq_pages_pct: 0,
      pages_analyzed: 0,
      recommendations: [],
    },
    lastBenchmarkedAt: null,
  };

  const user = await currentUser();
  if (!user) return { ...empty, error: 'Not authenticated' };

  const { data: project, error: pErr } = await supabaseAdmin
    .from('projects')
    .select('id')
    .eq('id', projectId)
    .eq('user_id', user.id)
    .single();
  if (pErr || !project) return { ...empty, error: 'Project not found' };

  const [
    { data: competitorsRows },
    { data: ckRows },
    { data: gapRows },
  ] = await Promise.all([
    supabaseAdmin
      .from('competitors')
      .select('*')
      .eq('project_id', projectId)
      .order('rank_score', { ascending: false }),
    supabaseAdmin
      .from('competitor_keywords')
      .select('*')
      .eq('project_id', projectId)
      .limit(1000),
    supabaseAdmin
      .from('keyword_gaps')
      .select('*')
      .eq('project_id', projectId)
      .order('volume', { ascending: false })
      .limit(BENCHMARK_KEYWORD_CAP),
  ]);

  const competitors = (competitorsRows ?? []) as Competitor[];
  const averages: BenchmarkAverages = {
    avg_word_count: 0,
    avg_h2: 0,
    avg_h3: 0,
    avg_images: 0,
    avg_internal_links: 0,
    avg_external_links: 0,
    faq_pages_pct: 0,
    pages_analyzed: 0,
    recommendations: [],
  };

  const lastBenchmarkedAt = competitors.length
    ? competitors
      .map(c => c.last_benchmarked_at)
      .filter(Boolean)
      .sort()
      .at(-1) ?? null
    : null;

  return {
    success: true,
    competitors,
    competitorKeywords: (ckRows ?? []) as CompetitorKeyword[],
    gaps: (gapRows ?? []) as KeywordGap[],
    averages,
    lastBenchmarkedAt,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. One-click "Generate blog" from an opportunity row
// ─────────────────────────────────────────────────────────────────────────────

/** PostgREST when `keywords.funnel_stage` exists in app code but not yet in DB / schema cache. */
function isMissingKeywordsFunnelStageError(message: string | undefined): boolean {
  if (!message) return false;
  return message.includes('funnel_stage') && message.includes('schema cache');
}

function stripFunnelStageFromPatch(patch: Record<string, unknown>): Record<string, unknown> {
  const { funnel_stage: _fs, ...rest } = patch;
  return rest;
}

export async function generateBlogFromOpportunity(projectId: string, keyword: string) {
  const user = await currentUser();
  if (!user) return { success: false as const, error: 'Not authenticated' };

  const normalized = keyword.trim().toLowerCase();
  if (!normalized) return { success: false as const, error: 'Missing keyword.' };

  const { data: project, error: pErr } = await supabaseAdmin
    .from('projects')
    .select('id')
    .eq('id', projectId)
    .eq('user_id', user.id)
    .single();
  if (pErr || !project) return { success: false as const, error: 'Project not found' };

  // `keyword_gaps.keyword` keeps provider casing; never match with a lowercased string.
  const { data: gapRows, error: gapErr } = await supabaseAdmin
    .from('keyword_gaps')
    .select('*')
    .eq('project_id', projectId);
  if (gapErr) return { success: false as const, error: gapErr.message };

  const gap =
    (gapRows ?? []).find(r => (r.keyword as string).trim().toLowerCase() === normalized) ?? null;

  const { data: existingKw, error: kwLookupErr } = await supabaseAdmin
    .from('keywords')
    .select('id, keyword')
    .eq('project_id', projectId)
    .eq('normalized_keyword', normalized)
    .eq('source', 'competitor')
    .maybeSingle();
  if (kwLookupErr) return { success: false as const, error: kwLookupErr.message };

  const statusPatch: Record<string, unknown> = {
    status: 'approved',
    source_type: 'competitor_benchmark',
    source: 'competitor',
    funnel_stage: deterministicFunnelStage('', normalized),
  };
  if (gap) {
    statusPatch.volume = gap.volume;
    statusPatch.kd = gap.kd;
    statusPatch.trend = gap.trend;
    statusPatch.source_url = gap.top_competitor_url ?? '';
    statusPatch.gap_competitor = gap.top_competitor_domain ?? '';
    statusPatch.ai_score = 0;
    statusPatch.keyword_analysis_score = 0;
  }

  let keywordId: string;
  let canonicalKeyword: string;

  if (existingKw) {
    let upErr = (
      await supabaseAdmin.from('keywords').update(statusPatch).eq('id', existingKw.id as string)
    ).error;
    if (upErr && isMissingKeywordsFunnelStageError(upErr.message)) {
      upErr = (
        await supabaseAdmin
          .from('keywords')
          .update(stripFunnelStageFromPatch(statusPatch))
          .eq('id', existingKw.id as string)
      ).error;
    }
    if (upErr) return { success: false as const, error: upErr.message };
    keywordId = existingKw.id as string;
    canonicalKeyword = String(existingKw.keyword);
  } else {
    const displayKeyword = (gap?.keyword as string | undefined)?.trim() || keyword.trim();
    const insertPayload = {
      project_id: projectId,
      keyword: displayKeyword,
      volume: gap?.volume ?? 0,
      kd: gap?.kd ?? 0,
      trend: gap?.trend ?? '+0%',
      source_url: gap?.top_competitor_url ?? '',
      gap_competitor: gap?.top_competitor_domain ?? '',
      ai_score: 0,
      keyword_analysis_score: 0,
      ...statusPatch,
    };
    let { data: insRow, error: insErr } = await supabaseAdmin
      .from('keywords')
      .insert(insertPayload)
      .select('id')
      .single();
    if (insErr && isMissingKeywordsFunnelStageError(insErr.message)) {
      const { funnel_stage: _ignored, ...payloadNoFunnel } = insertPayload as Record<string, unknown>;
      ({ data: insRow, error: insErr } = await supabaseAdmin
        .from('keywords')
        .insert(payloadNoFunnel)
        .select('id')
        .single());
    }
    if (insErr || !insRow) {
      return { success: false as const, error: insErr?.message ?? 'Failed to save keyword.' };
    }
    keywordId = insRow.id as string;
    canonicalKeyword = displayKeyword;
  }

  const { data: existingEntry } = await supabaseAdmin
    .from('calendar_entries')
    .select('id, scheduled_date')
    .eq('project_id', projectId)
    .eq('keyword_id', keywordId)
    .eq('ai_source', 'competitor keyword')
    .maybeSingle();

  if (existingEntry) {
    return {
      success: true as const,
      entryId: existingEntry.id as string,
      keywordId,
      scheduledDate: String(existingEntry.scheduled_date).slice(0, 10),
      alreadyOnCalendar: true as const,
    };
  }

  const vacant = await collectEarliestVacantDates(projectId, 1);
  const dateStr = vacant[0];
  if (!dateStr) {
    return { success: false as const, error: 'No free calendar day found in the next 500 days.' };
  }

  const slugBase = slugify(normalized) || `opportunity-${Date.now().toString(36)}`;
  const calRes = await addKeywordToCalendarOnDate(keywordId, projectId, dateStr, {
    title: toTitleCase(canonicalKeyword),
    article_type: 'How-to Guide',
    slug: `${slugBase}-${Date.now().toString(36)}`,
    ai_source: 'competitor keyword',
  });

  if (!calRes.success || !calRes.data) {
    return { success: false as const, error: 'Failed to create calendar entry.' };
  }

  return {
    success: true as const,
    entryId: calRes.data.id as string,
    keywordId,
    scheduledDate: dateStr,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Load more competitor keyword gaps from Ahrefs
// ─────────────────────────────────────────────────────────────────────────────

/** How many additional keywords to fetch per competitor on "load more". */
const LOAD_MORE_LIMIT = 30;

export interface LoadMoreCompetitorGapsResult {
  success: boolean;
  error?: string;
  added: number;
  hasMore: boolean;
}

export async function loadMoreCompetitorGapsFromAhrefs(
  projectId: string
): Promise<LoadMoreCompetitorGapsResult> {
  const user = await currentUser();
  if (!user) return { success: false, error: 'Not authenticated', added: 0, hasMore: false };

  // Check if user's plan allows the organic competitors API
  const canUseApi = await canUseOrganicCompetitorsApi(user.id);
  if (!canUseApi) {
    return {
      success: false,
      error: 'The competitor keyword loading feature is not available on your current plan. Please upgrade to access this feature.',
      added: 0,
      hasMore: false,
    };
  }

  const { data: project, error: pErr } = await supabaseAdmin
    .from('projects')
    .select('id, domain, target_region, target_language')
    .eq('id', projectId)
    .eq('user_id', user.id)
    .single();
  if (pErr || !project) return { success: false, error: 'Project not found', added: 0, hasMore: false };

  // Get competitors already benchmarked for this project.
  const { data: competitorRows } = await supabaseAdmin
    .from('competitors')
    .select('id, domain')
    .eq('project_id', projectId)
    .order('rank_score', { ascending: false })
    .limit(8);

  if (!competitorRows?.length) {
    return { success: false, error: 'No competitors benchmarked yet. Run a benchmark first.', added: 0, hasMore: false };
  }

  // Count existing gaps per competitor domain so we can use it as offset.
  const { data: existingGaps } = await supabaseAdmin
    .from('keyword_gaps')
    .select('keyword, top_competitor_domain')
    .eq('project_id', projectId);

  const gapCountByDomain = new Map<string, number>();
  const existingKeywords = new Set<string>();
  for (const g of existingGaps ?? []) {
    existingKeywords.add((g.keyword as string).toLowerCase());
    const d = g.top_competitor_domain as string;
    gapCountByDomain.set(d, (gapCountByDomain.get(d) ?? 0) + 1);
  }

  const newGapRows: Array<Record<string, unknown>> = [];
  let hasMore = false;

  for (const competitor of competitorRows) {
    const domain = competitor.domain as string;
    const currentCount = gapCountByDomain.get(domain) ?? 0;
    const fetchLimit = currentCount + LOAD_MORE_LIMIT;
    const organicKeywords = await ahrefsOrganicKeywords(
      domain,
      project.target_region as string,
      fetchLimit
    );

    if (organicKeywords.length >= fetchLimit) hasMore = true;

    for (const row of organicKeywords) {
      const keyword = row.keyword.trim().toLowerCase();
      if (!keyword || existingKeywords.has(keyword)) continue;

      newGapRows.push({
        project_id: projectId,
        keyword,
        gap_type: 'missing',
        opportunity_score: 0,
        volume: row.volume || 0,
        kd: row.keyword_difficulty ?? 0,
        trend: '+0%',
        trend_pct: 0,
        competitor_weakness: 0,
        top_competitor_domain: domain,
        top_competitor_url: row.best_position_url || `https://${domain}`,
        reasoning: '',
        position: row.best_position ?? null,
        is_informational: row.is_informational ?? false,
        is_navigational: row.is_navigational ?? false,
        is_commercial: row.is_commercial ?? false,
        is_transactional: row.is_transactional ?? false,
        is_branded: row.is_branded ?? false,
        updated_at: new Date().toISOString(),
      });

      existingKeywords.add(keyword);
    }
  }

  if (!newGapRows.length) {
    return { success: true, added: 0, hasMore };
  }

  newGapRows.sort((a, b) => (b.volume as number) - (a.volume as number));
  const toInsert = newGapRows.slice(0, LOAD_MORE_LIMIT);

  const { error: upsertErr } = await supabaseAdmin
    .from('keyword_gaps')
    .upsert(toInsert, { onConflict: 'project_id,keyword' });

  if (upsertErr) {
    return { success: false, error: upsertErr.message, added: 0, hasMore };
  }

  return { success: true, added: toInsert.length, hasMore };
}

