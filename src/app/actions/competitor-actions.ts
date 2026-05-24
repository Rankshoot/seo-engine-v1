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
  benchmarkContentQuality,
  classifyGap,
  competitorWeaknessFromSnapshot,
  extractCompetitorContent,
  scoreOpportunity,
  type BenchmarkTraceEntry,
} from '@/lib/competitor-benchmark';
import { fetchKeywordVitals, fetchGoogleAdsKeywordsForSite } from '@/lib/dataforseo';
import {
  ahrefsOrganicCompetitors,
  ahrefsOrganicKeywords,
  ahrefsTopPages,
  isAhrefsConfigured,
  type AhrefsOrganicKeyword,
  type AhrefsTopPage,
} from '@/lib/ahrefs';
import { isProviderEnabled } from '@/lib/admin/platform-settings-runtime';
import { getBusinessBrief } from '@/app/actions/brief-actions';
import { addKeywordToCalendarOnDate, collectEarliestVacantDates } from '@/app/actions/calendar-actions';
import { bestMatchingBlogUrl } from '@/lib/competitor-sitemap-match';
import { fetchBlogUrls } from '@/lib/jina';
import type {
  BenchmarkAverages,
  Competitor,
  CompetitorKeyword,
  CompetitorPageSnapshot,
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

/** Max blog-style URLs to load per competitor sitemap for keyword ↔ URL matching. */
const COMPETITOR_SITEMAP_BLOG_CAP = 3000;

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
}

export async function runCompetitorBenchmark(projectId: string): Promise<RunBenchmarkResult> {
  const user = await currentUser();
  if (!user) return { success: false, error: 'Not authenticated' };

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

  // 1a. Seeds come from the Business Brief.
  const briefRes = await getBusinessBrief(projectId);
  const seeds = briefRes.brief?.seed_phrases?.length
    ? briefRes.brief.seed_phrases
    : [project.niche, `best ${project.niche}`, `${project.niche} for ${project.target_audience}`];

  trace.push({
    label: 'seeds',
    ok: true,
    info: { seed_count: seeds.length, source: briefRes.brief ? 'business_brief' : 'fallback' },
  });

  const ownDomain = normalizeDomainInput(project.domain);
  const knownDomains = (project.project_competitors ?? []).map(c => c.domain);
  const userSuppliedHosts = [
    ...new Set(
      knownDomains.map(d => normalizeDomainInput(d)).filter((h): h is string => Boolean(h))
    ),
  ];
  let competitorList: Array<{
    domain: string;
    rank_score: number;
    top_url: string;
    top_title: string;
  }> = [];
  const rankingOpportunities: RankingOpportunity[] = [];

  // ───────────────────────────────────────────────────────────────────────
  // 1b. Competitor discovery
  //
  // If the user added competitors on the project, we **only** use DataForSEO
  // Google Ads `keywords_for_site/live` for keyword gaps (per competitor).
  // Otherwise Ahrefs discovers competitors + organic keywords (DataForSEO
  // is still the fallback when Ahrefs is off or returns nothing useful).
  // ───────────────────────────────────────────────────────────────────────
  let benchmarkSource: 'ahrefs' | 'dataforseo' = ahrefsAvailable ? 'ahrefs' : 'dataforseo';

  if (userSuppliedHosts.length > 0) {
    competitorList = userSuppliedHosts.map(host => ({
      domain: host,
      rank_score: 1,
      top_url: `https://${host}`,
      top_title: host,
    }));
    // Route to Ahrefs when admin panel has it enabled; otherwise fall back to DataForSEO.
    if (!ahrefsAvailable) {
      benchmarkSource = 'dataforseo';
    }
    trace.push({
      label: 'benchmark_keyword_source',
      ok: true,
      info: {
        source: ahrefsAvailable
          ? '/site-explorer/organic-keywords'
          : 'keywords_data/google_ads/keywords_for_site/live',
        reason: ahrefsAvailable
          ? 'Project has manual competitors — Ahrefs organic keywords enabled in admin panel.'
          : 'Project has manual competitors — Ahrefs disabled, using DataForSEO Google Ads Keywords For Site.',
        competitors: userSuppliedHosts,
        own_domain: ownDomain,
        target_region: project.target_region,
        target_language: (project as { target_language?: string }).target_language ?? 'en',
        limit_per_competitor: ahrefsAvailable ? AHREFS_KEYWORDS_PER_COMPETITOR : KEYWORDS_FOR_SITE_LIMIT,
      },
    });
  } else if (ahrefsAvailable && ownDomain) {
    const ahrefsCompetitors = await ahrefsOrganicCompetitors(
      ownDomain,
      project.target_region,
      12
    );
    if (ahrefsCompetitors.length) {
      competitorList = ahrefsCompetitors.map((c, i) => ({
        domain: normalizeDomainInput(c.competitor_domain),
        rank_score: c.keywords_common || ahrefsCompetitors.length - i,
        top_url: `https://${c.competitor_domain}`,
        top_title: c.competitor_domain,
      }));
      trace.push({
        label: 'ahrefs_organic_competitors',
        ok: true,
        info: {
          domain: ownDomain,
          returned: ahrefsCompetitors.length,
          merged_with_user: competitorList.length,
        },
      });
    } else {
      trace.push({
        label: 'ahrefs_organic_competitors',
        ok: false,
        error: 'no rows returned by Ahrefs',
      });
      benchmarkSource = 'dataforseo';
    }
  }

  if (!competitorList.length) {
    return {
      success: false,
      error:
        'No competitors found. Add competitor domains on the project overview and try again.',
      trace,
    };
  }

  console.log(
    `[benchmark] competitors=${competitorList.length} via=${benchmarkSource} domains=${competitorList
      .slice(0, 5)
      .map(c => c.domain)
      .join(',')}${competitorList.length > 5 ? ',…' : ''}`
  );

  // Pull user's existing keywords up-front (used by every gap classification).
  const { data: userKwRows } = await supabaseAdmin
    .from('keywords')
    .select('keyword, status')
    .eq('project_id', projectId);
  const userKwIndex = new Map<string, { status: string }>(
    (userKwRows ?? []).map(r => [r.keyword.toLowerCase(), { status: r.status as string }])
  );

  // ───────────────────────────────────────────────────────────────────────
  // 1c. Build ranking opportunities.
  //
  // Ahrefs path: organic-keywords + top-pages per competitor.
  // DataForSEO path: keywords_data/google_ads/keywords_for_site/live (limit
  // KEYWORDS_FOR_SITE_LIMIT per competitor domain).
  // ───────────────────────────────────────────────────────────────────────
  if (benchmarkSource === 'ahrefs') {
    // Use a smaller limit for manual competitors (cost-optimised: 10 per competitor).
    // For auto-discovered competitors (no userSuppliedHosts) we allow more.
    const kwLimit = userSuppliedHosts.length > 0 ? AHREFS_KEYWORDS_PER_COMPETITOR : 60;
    const fetchTopPages = userSuppliedHosts.length === 0; // skip top-pages for manual competitors

    for (const competitor of competitorList.slice(0, 8)) {
      const organicKeywords = await ahrefsOrganicKeywords(competitor.domain, project.target_region, 60);
      const topPages: AhrefsTopPage[] = [];

      const topPageUrls = new Set<string>();
      const topPageByUrl = new Map(topPages.map(p => [p.url, p]));
      const seenKeywords = new Set<string>();

      for (const row of organicKeywords) {
        const keyword = row.keyword.trim().toLowerCase();
        if (!keyword || seenKeywords.has(keyword)) continue;
        seenKeywords.add(keyword);

        const enrichment = pageBoost(row, topPageByUrl, topPageUrls);
        rankingOpportunities.push({
          keyword,
          volume: row.volume || 0,
          kd: row.keyword_difficulty ?? 0,
          trend: '+0%',
          trend_pct: 0,
          gap_type: classifyGap(keyword, userKwIndex),
          top_competitor_domain: competitor.domain,
          top_competitor_url: row.best_position_url,
          source_title: enrichment.title || competitor.top_title || competitor.domain,
          position: row.best_position ?? 0,
          is_informational: row.is_informational,
          is_navigational: row.is_navigational,
          is_commercial: row.is_commercial,
          is_transactional: row.is_transactional,
          is_branded: row.is_branded,
        });
      }

      for (const page of topPages.slice(0, 6)) {
        const keyword = (page.top_keyword ?? '').trim().toLowerCase();
        if (!keyword || seenKeywords.has(keyword) || !page.url) continue;
        seenKeywords.add(keyword);
        rankingOpportunities.push({
          keyword,
          volume: page.top_keyword_volume ?? 0,
          kd: 0,
          trend: '+0%',
          trend_pct: 0,
          gap_type: classifyGap(keyword, userKwIndex),
          top_competitor_domain: competitor.domain,
          top_competitor_url: page.url,
          source_title: competitor.top_title || competitor.domain,
          position: page.top_keyword_best_position ?? 0,
        });
      }
    }

    trace.push({
      label: 'ahrefs_ranking_opportunities',
      ok: true,
      info: { competitors_scanned: competitorList.length, opportunities: rankingOpportunities.length, kw_limit: kwLimit },
    });

    // Fallback: if Ahrefs returned 0 results and DataForSEO creds exist, switch over.
    if (rankingOpportunities.length === 0 && userSuppliedHosts.length > 0) {
      trace.push({
        label: 'ahrefs_to_dataforseo_fallback',
        ok: true,
        info: {
          reason:
            'Ahrefs returned 0 keyword opportunities — falling back to DataForSEO keywords_for_site/live',
        },
      });
      benchmarkSource = 'dataforseo';
      competitorList = userSuppliedHosts.map(host => ({
        domain: host,
        rank_score: 1,
        top_url: `https://${host}`,
        top_title: host,
      }));
    }
  }

  if (benchmarkSource === 'dataforseo') {
    // DataForSEO Google Ads Keywords For Site — one call per competitor domain.
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
          gap_type: classifyGap(row.keyword, userKwIndex),
          top_competitor_domain: competitor.domain,
          top_competitor_url: row.competitor_url,
          source_title: competitor.top_title || competitor.domain,
          position: row.competitor_position,
        });
      }
    }

    trace.push({
      label: 'dataforseo_keywords_for_site',
      ok: true,
      info: {
        competitors_scanned: competitorList.length,
        opportunities: rankingOpportunities.length,
        source: 'keywords_data/google_ads/keywords_for_site/live',
      },
    });
  }

  // Dedupe per (keyword, competitor) — KEEPS all competitors that rank for
  // the same keyword as separate rows. With N competitors × limit rows each,
  // competitor_keywords can hold up to N × KEYWORDS_FOR_SITE_LIMIT rows.
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
      error: 'No keyword ranking pages found. Try refreshing the business brief or adding more competitor domains.',
      trace,
    };
  }

  await enrichRankingUrlsFromCompetitorSitemaps(dedupedOpportunities, competitorList, trace);

  // ───────────────────────────────────────────────────────────────────────
  // 1d. Selectively scrape ranking pages for structural signals.
  // ───────────────────────────────────────────────────────────────────────
  const persistedCompetitors: Array<{
    id: string;
    domain: string;
    pages: CompetitorPageSnapshot[];
  }> = [];

  const allPages: CompetitorPageSnapshot[] = [];
  const pagesByDomain = new Map<string, CompetitorPageSnapshot[]>();
  const scrapedByUrl = new Map<string, CompetitorPageSnapshot>();
  let pagesScraped = 0;

  for (const opportunity of dedupedOpportunities.slice(0, 30)) {
    if (scrapedByUrl.has(opportunity.top_competitor_url)) continue;
    const { snapshot } = await extractCompetitorContent(opportunity.top_competitor_url, { trace });
    if (!snapshot) continue;
    scrapedByUrl.set(opportunity.top_competitor_url, snapshot);
    allPages.push(snapshot);
    pagesScraped += 1;
    const domainPages = pagesByDomain.get(opportunity.top_competitor_domain) ?? [];
    domainPages.push(snapshot);
    pagesByDomain.set(opportunity.top_competitor_domain, domainPages);
  }

  // Sample a couple of pages for any discovered competitor that didn't show
  // up in the top opportunity slice — keeps the competitor list complete.
  // Pulls from Ahrefs top-pages so we use a single data source.
  for (const comp of competitorList) {
    if (pagesByDomain.has(comp.domain)) continue;
    const sampledPages = [{ url: comp.top_url, title: comp.top_title }];
    for (const p of sampledPages.slice(0, 2)) {
      if (!p.url || scrapedByUrl.has(p.url)) continue;
      const { snapshot } = await extractCompetitorContent(p.url, { trace });
      if (!snapshot) continue;
      scrapedByUrl.set(p.url, snapshot);
      allPages.push(snapshot);
      pagesScraped += 1;
      const domainPages = pagesByDomain.get(comp.domain) ?? [];
      domainPages.push(snapshot);
      pagesByDomain.set(comp.domain, domainPages);
    }
  }

  const allBenchmarkDomains = [
    ...new Set([
      ...competitorList.map(c => c.domain),
      ...dedupedOpportunities.map(o => o.top_competitor_domain),
    ]),
  ];

  for (const domain of allBenchmarkDomains) {
    const comp = competitorList.find(c => c.domain === domain);
    const scraped = pagesByDomain.get(domain) ?? [];
    if (!scraped.length) {
      scraped.push({
        url: comp?.top_url ?? `https://${domain}`,
        title: comp?.top_title ?? domain,
        h1: '',
        h2_count: 0,
        h3_count: 0,
        word_count: 0,
        image_count: 0,
        internal_link_count: 0,
        external_link_count: 0,
        has_faq: false,
      });
    }

    const compAverages = benchmarkContentQuality(scraped.filter(p => p.word_count > 0));
    const compRow = {
      project_id: projectId,
      domain,
      title: (comp?.top_title ?? scraped[0]?.title ?? domain).slice(0, 300),
      rank_score:
        comp?.rank_score ?? dedupedOpportunities.filter(o => o.top_competitor_domain === domain).length,
      pages_scraped: scraped.filter(p => p.word_count > 0).length,
      avg_word_count: compAverages.avg_word_count,
      avg_h2: compAverages.avg_h2,
      avg_h3: compAverages.avg_h3,
      avg_images: compAverages.avg_images,
      avg_internal_links: compAverages.avg_internal_links,
      avg_external_links: compAverages.avg_external_links,
      faq_pages_pct: compAverages.faq_pages_pct,
      top_pages: scraped,
      recommendations: compAverages.recommendations,
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
      pages: scraped,
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

  // 1f. Hydrate volumes/trends for any rows that came back from Ahrefs / SERP
  // without a usable volume. Keeps DataForSEO as a fallback enrichment layer.
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
  //     `keyword_gaps` has UNIQUE(project_id, keyword), so collapse all rows
  //     for the same keyword down to the best-ranking competitor.
  await supabaseAdmin.from('keyword_gaps').delete().eq('project_id', projectId);
  const bestCompetitorPerKeyword = pickBestCompetitorPerKeyword(dedupedOpportunities);
  const gapRows = bestCompetitorPerKeyword.map(opportunity => {
    const v = vitals.get(opportunity.keyword);
    const volume = opportunity.volume || v?.volume || 0;
    const trend = opportunity.trend || v?.trend || '+0%';
    const trend_pct = opportunity.trend_pct || v?.trend_pct || 0;
    const kd = opportunity.kd || 0;
    const pageSnapshot = scrapedByUrl.get(opportunity.top_competitor_url);
    const weakness = pageSnapshot ? competitorWeaknessFromSnapshot(pageSnapshot) : 50;
    const opportunity_score = scoreOpportunity({
      volume,
      kd,
      trend_pct,
      competitor_weakness: weakness,
      gap_type: opportunity.gap_type,
    });
    const reasoning = buildGapReasoning(opportunity.gap_type, volume, weakness, trend_pct);
    return {
      project_id: projectId,
      keyword: opportunity.keyword,
      gap_type: opportunity.gap_type,
      opportunity_score,
      volume,
      kd,
      trend,
      trend_pct,
      competitor_weakness: weakness,
      top_competitor_domain: opportunity.top_competitor_domain,
      top_competitor_url: opportunity.top_competitor_url,
      reasoning,
      updated_at: new Date().toISOString(),
    };
  });

  gapRows.sort((a, b) => b.volume - a.volume || b.opportunity_score - a.opportunity_score);
  const topGapRows = gapRows.slice(0, BENCHMARK_KEYWORD_CAP);

  if (topGapRows.length) {
    const { error: gapErr } = await supabaseAdmin
      .from('keyword_gaps')
      .upsert(topGapRows, { onConflict: 'project_id,keyword' });
    if (gapErr) trace.push({ label: 'keyword_gaps_upsert', ok: false, error: gapErr.message });
  }

  const averages = benchmarkContentQuality(allPages);

  console.log(
    `[benchmark] done project=${projectId} via=${String(benchmarkSource)} competitors=${persistedCompetitors.length} pages=${pagesScraped} keywords=${dedupedOpportunities.length} gaps=${topGapRows.length}`
  );

  return {
    success: true,
    competitorsFound: persistedCompetitors.length,
    pagesScraped,
    keywordsExtracted: dedupedOpportunities.length,
    gapsFound: topGapRows.length,
    averages,
    trace,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

/** True when URL is the competitor site root (or subdomain root) with no path — not a specific page. */
function isLikelyHomepageOnlyUrl(url: string, competitorDomain: string): boolean {
  const comp = normalizeDomainInput(competitorDomain);
  if (!comp || !url.trim()) return false;
  let u: URL;
  try {
    u = new URL(url.trim().startsWith('http') ? url.trim() : `https://${url.trim()}`);
  } catch {
    return false;
  }
  const host = safeHostFromUrl(u.href);
  if (!host) return false;
  if (host !== comp && !host.endsWith(`.${comp}`)) return false;
  const path = u.pathname.replace(/\/+$/, '') || '';
  return path === '';
}

/**
 * For rows that only have the site homepage (typical for DataForSEO keywords
 * for site), pick the best-matching blog URL from each competitor’s sitemap.
 */
async function enrichRankingUrlsFromCompetitorSitemaps(
  opportunities: RankingOpportunity[],
  competitors: Array<{ domain: string }>,
  trace: BenchmarkTraceEntry[]
): Promise<void> {
  const domains = [
    ...new Set(
      [
        ...competitors.map(c => normalizeDomainInput(c.domain)),
        ...opportunities.map(o => normalizeDomainInput(o.top_competitor_domain)),
      ].filter(Boolean)
    ),
  ];
  if (!domains.length) return;

  const blogUrlsByDomain = new Map<string, string[]>();
  await Promise.all(
    domains.map(async d => {
      try {
        const urls = await fetchBlogUrls(d, COMPETITOR_SITEMAP_BLOG_CAP);
        blogUrlsByDomain.set(d, urls);
        trace.push({
          label: `competitor_sitemap_blogs:${d}`,
          ok: true,
          info: { blog_urls: urls.length, cap: COMPETITOR_SITEMAP_BLOG_CAP },
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        trace.push({ label: `competitor_sitemap_blogs:${d}`, ok: false, error: msg });
        blogUrlsByDomain.set(d, []);
      }
    })
  );

  let candidates = 0;
  let matched = 0;
  for (const opp of opportunities) {
    if (!isLikelyHomepageOnlyUrl(opp.top_competitor_url, opp.top_competitor_domain)) continue;
    candidates += 1;
    const blogs = blogUrlsByDomain.get(opp.top_competitor_domain) ?? [];
    const hit = bestMatchingBlogUrl(opp.keyword, blogs);
    if (hit) {
      opp.top_competitor_url = hit.url;
      opp.source_title = hit.titleHint;
      matched += 1;
    }
  }

  trace.push({
    label: 'competitor_sitemap_keyword_match',
    ok: true,
    info: {
      competitors_with_sitemap: domains.length,
      homepage_placeholder_rows: candidates,
      matched_to_blog_url: matched,
    },
  });
}

function pageBoost(
  row: AhrefsOrganicKeyword,
  topPageByUrl: Map<string, { url: string; top_keyword: string | null; sum_traffic: number }>,
  topPageUrls: Set<string>
): { isTopPage: boolean; title: string } {
  const isTopPage = topPageUrls.has(row.best_position_url);
  const page = topPageByUrl.get(row.best_position_url);
  return {
    isTopPage,
    title: page?.top_keyword ?? '',
  };
}

/**
 * Dedupe only within (keyword, competitor) pairs. If both Ahrefs organic-keywords
 * and top-pages surface the same keyword for the same competitor we keep the
 * better row, but DIFFERENT competitors that rank for the same keyword each
 * keep their own row. This is what lets N competitors × M keywords each
 * persist N×M rows into `competitor_keywords` instead of collapsing to M.
 */
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

/**
 * For `keyword_gaps` (UNIQUE project_id + keyword) we need exactly one row per
 * keyword — pick the competitor with the biggest volume / best ranking.
 */
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

function buildGapReasoning(
  gapType: 'missing' | 'weak' | 'untapped',
  volume: number,
  weakness: number,
  trendPct: number
): string {
  const bits: string[] = [];
  if (gapType === 'missing') bits.push("You don't cover this keyword yet.");
  else if (gapType === 'weak') bits.push('You have this keyword in your list but it is not approved yet.');
  else bits.push("You're approved for this but competitors still out-rank.");

  if (weakness >= 60) bits.push('Competitor content is thin — an easy one to beat.');
  else if (weakness >= 35) bits.push('Competitor content is moderate — beatable with depth.');
  else bits.push('Competitor content is strong — plan a deeper, more original piece.');
  if (trendPct > 20) bits.push('Demand trending up.');
  else if (trendPct < -20) bits.push('Demand trending down.');

  return bits.join(' ');
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
      .order('opportunity_score', { ascending: false })
      .limit(BENCHMARK_KEYWORD_CAP),
  ]);

  const competitors = (competitorsRows ?? []) as Competitor[];
  const allPages = competitors.flatMap(c => (c.top_pages ?? []).filter(p => p.word_count > 0));
  const averages = benchmarkContentQuality(allPages);

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

  // Reuse an existing `keywords` row when the normalized phrase already exists (e.g. discovery
  // saved "HR Software" and the gap row says "hr software"). Upsert on `(project_id, keyword)`
  // alone would try to INSERT a second row and hit `idx_keywords_project_normalized`.
  const { data: existingKw, error: kwLookupErr } = await supabaseAdmin
    .from('keywords')
    .select('id, keyword')
    .eq('project_id', projectId)
    .eq('normalized_keyword', normalized)
    .maybeSingle();
  if (kwLookupErr) return { success: false as const, error: kwLookupErr.message };

  const statusPatch: Record<string, unknown> = {
    status: 'approved',
    source_type: 'competitor_benchmark',
    funnel_stage: deterministicFunnelStage('', normalized),
  };
  if (gap) {
    statusPatch.volume = gap.volume;
    statusPatch.kd = gap.kd;
    statusPatch.trend = gap.trend;
    statusPatch.source_url = gap.top_competitor_url ?? '';
    statusPatch.gap_competitor = gap.top_competitor_domain ?? '';
    statusPatch.ai_score = gap.opportunity_score ?? 0;
    statusPatch.keyword_analysis_score = gap.opportunity_score ?? 0;
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
      ai_score: gap?.opportunity_score ?? 0,
      keyword_analysis_score: gap?.opportunity_score ?? 0,
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
