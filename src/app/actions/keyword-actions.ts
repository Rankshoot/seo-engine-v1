'use server';

import { supabaseAdmin } from '@/lib/supabase';
import { currentUser } from '@clerk/nextjs/server';
import { aiGenerate } from '@/services/ai/providers';
import {
  discoverKeywordsForProject,
  fetchGoogleAdsKeywordsForSite,
  type CompetitorKeywordsForSiteRow,
  type DataForSEOTraceEntry,
} from '@/lib/dataforseo';
import { Keyword, KeywordStatus, CONTENT_TYPE_ARTICLE_TYPE, TARGET_REGIONS } from '@/lib/types';
import { generateBusinessBrief, getBusinessBrief } from './brief-actions';
import type { BusinessBrief } from '@/lib/business-brief';
import {
  classifyKeywordIntentsForBusinessChunk,
  type BusinessContextForIntent,
} from '@/lib/gemini';
import { deterministicFunnelStage } from '@/lib/keyword-funnel';
import { crawlWebsite, type WebsiteCrawlResult } from '@/lib/websiteCrawler';
import {
  runKeywordDiscovery,
  type DiscoveryResult,
  type KeywordCandidate,
} from '@/lib/keyword-discovery';
import { enrichKeywordInBackground } from '@/lib/keyword-modal';
import { scheduleKeywordOnFirstVacantIfNeeded, scheduleKeywordsOnVacantDates, collectEarliestVacantDates } from './calendar-actions';
import { runWithUsageLogContext } from '@/lib/admin/logging/log-context';
import { canUseMatchingTermsApi } from '@/lib/plan-api-access';
import {
  startAiScoringRun,
  updateAiScoringRunProgress,
  finishAiScoringRun,
  type AiScoringScope,
} from './ai-scoring-actions';

// ─── AI Evaluation types (mirrors Keyword.ai_eval_data) ──────────────────────
export type AiEvalData = {
  category: string;
  analysis: {
    businessRelevance: number;
    intentQuality: number;
    trafficPotential: number;
    keywordDifficulty: number;
    serpWeakness: number;
    contentDepth: number;
    trendGrowth: number;
    conversionPotential: number;
    [key: string]: number;
  };
  reasoning: {
    summary: string;
    strengths: string[];
    weaknesses: string[];
    rankingOpportunity: string;
    contentOpportunity: string;
  };
  recommended_content_type?: string;
  duplicate_of?: string | null;
};

const INTENT_REFRESH_CHUNK_SIZE = 28;

function buildBriefContextForIntent(brief: BusinessBrief | null): string {
  if (!brief) return '';
  const chunks: string[] = [];
  if (brief.summary) chunks.push(brief.summary.slice(0, 1200));
  if (brief.products?.length) {
    chunks.push(`Products/services: ${brief.products.slice(0, 14).join('; ')}`);
  }
  if (brief.entities?.length) {
    chunks.push(`Key entities: ${brief.entities.slice(0, 18).join('; ')}`);
  }
  if (brief.audiences?.length) {
    chunks.push(`Audiences: ${brief.audiences.slice(0, 8).join('; ')}`);
  }
  return chunks.join('\n').slice(0, 4000);
}

export interface KeywordIntentRefreshTraceEntry {
  ts: string;
  batch_index: number;
  batch_size: number;
  ok: boolean;
  ms: number;
  updated_in_batch: number;
  error?: string;
}

/**
 * Re-label every saved industry keyword's `intent` and `funnel_stage` with Gemini
 * using project fields + cached business brief. Updates `ai_score` to match the new intent.
 * Client should `console.log` `intentTrace` for production debugging.
 */
export async function refreshKeywordIntentsWithGemini(projectId: string): Promise<{
  success: boolean;
  error?: string;
  updated: number;
  total: number;
  intentTrace: KeywordIntentRefreshTraceEntry[];
}> {
  const user = await currentUser();
  if (!user) {
    return { success: false, error: 'Not authenticated', updated: 0, total: 0, intentTrace: [] };
  }

  const { data: project, error: pErr } = await supabaseAdmin
    .from('projects')
    .select(
      'id, domain, company, niche, target_audience, target_region'
    )
    .eq('id', projectId)
    .eq('user_id', user.id)
    .single();

  if (pErr || !project) {
    return { success: false, error: 'Project not found', updated: 0, total: 0, intentTrace: [] };
  }

  const briefRes = await getBusinessBrief(projectId);
  if (!briefRes.success) {
    return {
      success: false,
      error: briefRes.error ?? 'Could not load business brief',
      updated: 0,
      total: 0,
      intentTrace: [],
    };
  }

  const { data: kwRows, error: kwErr } = await supabaseAdmin
    .from('keywords')
    .select('id, keyword, volume, kd')
    .eq('project_id', projectId);

  if (kwErr) {
    return { success: false, error: kwErr.message, updated: 0, total: 0, intentTrace: [] };
  }

  const list = (kwRows ?? []).filter(
    (r): r is { id: string; keyword: string; volume: number | null; kd: number | null } =>
      Boolean(r?.id && r.keyword)
  );

  if (!list.length) {
    return { success: true, updated: 0, total: 0, intentTrace: [] };
  }

  const ctx: BusinessContextForIntent = {
    company: project.company ?? '',
    domain: project.domain ?? '',
    niche: project.niche ?? '',
    targetAudience: project.target_audience ?? '',
    targetRegion: project.target_region ?? '',
    briefContext: buildBriefContextForIntent(briefRes.brief),
  };

  const intentTrace: KeywordIntentRefreshTraceEntry[] = [];
  const intentById = new Map<string, string>();
  const funnelById = new Map<string, string>();

  for (let i = 0; i < list.length; i += INTENT_REFRESH_CHUNK_SIZE) {
    const batch = list.slice(i, i + INTENT_REFRESH_CHUNK_SIZE);
    const batchIndex = Math.floor(i / INTENT_REFRESH_CHUNK_SIZE) + 1;
    const t0 = Date.now();
    try {
      const classified = await classifyKeywordIntentsForBusinessChunk(
        ctx,
        batch.map(r => ({ id: r.id, keyword: r.keyword }))
      );
      for (const c of classified) {
        intentById.set(c.id, c.intent);
        funnelById.set(c.id, c.funnel_stage);
      }
      intentTrace.push({
        ts: new Date().toISOString(),
        batch_index: batchIndex,
        batch_size: batch.length,
        ok: true,
        ms: Date.now() - t0,
        updated_in_batch: classified.length,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      intentTrace.push({
        ts: new Date().toISOString(),
        batch_index: batchIndex,
        batch_size: batch.length,
        ok: false,
        ms: Date.now() - t0,
        updated_in_batch: 0,
        error: msg,
      });
      return {
        success: false,
        error: msg,
        updated: 0,
        total: list.length,
        intentTrace,
      };
    }
  }

  let updated = 0;
  for (const row of list) {
    const intent = intentById.get(row.id);
    const funnel_stage = funnelById.get(row.id);
    if (!intent || !funnel_stage) continue;
    const volume = Math.max(0, Math.round(Number(row.volume) || 0));
    const kd = Math.max(0, Math.round(Number(row.kd) || 0));
    const ai = aiScore(volume, kd, intent);
    let { error: upErr } = await supabaseAdmin
      .from('keywords')
      .update({ intent, ai_score: ai, funnel_stage })
      .eq('id', row.id)
      .eq('project_id', projectId);
    if (upErr && upErr.message.includes('funnel_stage') && upErr.message.includes('schema cache')) {
      ({ error: upErr } = await supabaseAdmin
        .from('keywords')
        .update({ intent, ai_score: ai })
        .eq('id', row.id)
        .eq('project_id', projectId));
    }
    if (!upErr) updated += 1;
    else console.error('[intent-refresh] update failed', row.id, upErr.message);
  }

  return { success: true, updated, total: list.length, intentTrace };
}

function aiScore(volume: number, kd: number, intent: string = ''): number {
  // Require both volume and KD to be known, otherwise the score misleads.
  if (!volume || !kd) return 0;
  // Volume: 0–50 points (capped at 10k searches/mo).
  const volScore = Math.min((volume / 10000) * 50, 50);
  // Difficulty: 0–40 points (easier keyword = more points).
  const kdScore = ((100 - kd) / 100) * 40;
  // Intent bonus: commercial / transactional queries convert best for SEO.
  const intentBonus =
    intent === 'commercial' || intent === 'transactional' ? 10 :
    intent === 'informational' ? 6 :
    intent === 'navigational' ? 2 : 0;
  return Math.round(volScore + kdScore + intentBonus);
}

// ─────────────────────────────────────────────────────────────────────────────
// runKeywordDiscoveryPipeline
//
// Site-Explorer-driven discovery (own organic + competitor gap + quick wins),
// scored deterministically and persisted to `keywords`. Caps output at 50.
//
// This is **independent** from the legacy seed-driven `discoverKeywords` flow
// above — both can coexist. The wiring decision (which one the keywords page
// calls) is a follow-up; this action is intentionally additive so we don't
// destabilise the production keywords page in a single PR.
// ─────────────────────────────────────────────────────────────────────────────

export interface RunDiscoveryResponse {
  success: boolean;
  error?: string;
  /** How many rows we just inserted into `keywords`. */
  inserted: number;
  /** Keywords that were already in the project and got skipped. */
  duplicates_skipped: number;
  /** Total candidates the pipeline returned (before duplicate filtering). */
  candidates_returned: number;
  /** Per-step trace — `console.log` it from the client for debugging. */
  trace?: DiscoveryResult['trace'];
  /** Funnel summary metadata. */
  meta?: DiscoveryResult['meta'];
}

export async function runKeywordDiscoveryPipeline(
  projectId: string,
  opts: { topN?: number } = {}
): Promise<RunDiscoveryResponse> {
  const user = await currentUser();
  if (!user) {
    return {
      success: false,
      error: 'Not authenticated',
      inserted: 0,
      duplicates_skipped: 0,
      candidates_returned: 0,
    };
  }

  try {
    const { QuotaService } = await import("@/services/quota");
    await QuotaService.checkQuota(user.id, "keywords_fetched");
  } catch (qErr: any) {
    return {
      success: false,
      error: "You have reached your keyword limit. Please upgrade your plan or contact the administrator to fetch more keywords.",
      inserted: 0,
      duplicates_skipped: 0,
      candidates_returned: 0,
    };
  }

  const { data: project, error: pErr } = await supabaseAdmin
    .from('projects')
    .select('id, domain, company, niche, target_audience, target_region, target_language')
    .eq('id', projectId)
    .eq('user_id', user.id)
    .single();

  if (pErr || !project) {
    return {
      success: false,
      error: 'Project not found',
      inserted: 0,
      duplicates_skipped: 0,
      candidates_returned: 0,
    };
  }

  console.log('[discovery] pipeline start', {
    projectId,
    domain: project.domain,
    region: project.target_region,
    niche: project.niche,
  });

  let result: DiscoveryResult;
  try {
    result = await runKeywordDiscovery({
      domain: project.domain ?? '',
      region: project.target_region ?? 'us',
      niche: project.niche ?? '',
      audience: project.target_audience ?? '',
      brand: project.company ?? '',
      topN: opts.topN ?? 50,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('[discovery] pipeline crashed:', message);
    return {
      success: false,
      error: `Pipeline crashed: ${message}`,
      inserted: 0,
      duplicates_skipped: 0,
      candidates_returned: 0,
    };
  }

  if (result.fatal_error) {
    return {
      success: false,
      error: result.fatal_error,
      inserted: 0,
      duplicates_skipped: 0,
      candidates_returned: 0,
      trace: result.trace,
      meta: result.meta,
    };
  }

  if (!result.candidates.length) {
    console.warn('[discovery] pipeline returned 0 candidates');
    return {
      success: true,
      inserted: 0,
      duplicates_skipped: 0,
      candidates_returned: 0,
      trace: result.trace,
      meta: result.meta,
    };
  }

  // 12. Avoid duplicates already on this project. We pre-filter in JS so the
  //     trace stays accurate, AND rely on the unique (project_id, keyword)
  //     constraint as a belt-and-braces safety net.
  const { data: existingRows, error: existingErr } = await supabaseAdmin
    .from('keywords')
    .select('keyword')
    .eq('project_id', projectId);
  if (existingErr) {
    console.error('[discovery] failed to load existing keywords:', existingErr.message);
    return {
      success: false,
      error: existingErr.message,
      inserted: 0,
      duplicates_skipped: 0,
      candidates_returned: result.candidates.length,
      trace: result.trace,
      meta: result.meta,
    };
  }

  const existingSet = new Set(
    (existingRows ?? []).map(r => (r.keyword ?? '').trim().toLowerCase())
  );

  const fresh = result.candidates.filter(c => !existingSet.has(c.keyword));
  const duplicatesSkipped = result.candidates.length - fresh.length;
  console.log('[discovery] dedupe', {
    candidates_returned: result.candidates.length,
    duplicates_skipped: duplicatesSkipped,
    fresh: fresh.length,
  });

  if (!fresh.length) {
    return {
      success: true,
      inserted: 0,
      duplicates_skipped: duplicatesSkipped,
      candidates_returned: result.candidates.length,
      trace: result.trace,
      meta: result.meta,
    };
  }

  const rows = fresh.map(c => ({ ...candidateToRow(projectId, c), source: 'organic' }));

  const { data: inserted, error: insErr } = await supabaseAdmin
    .from('keywords')
    .upsert(rows, { onConflict: 'project_id,keyword,source', ignoreDuplicates: true })
    .select('id');

  if (insErr) {
    console.error('[discovery] insert failed:', insErr.message);
    return {
      success: false,
      error: insErr.message,
      inserted: 0,
      duplicates_skipped: duplicatesSkipped,
      candidates_returned: result.candidates.length,
      trace: result.trace,
      meta: result.meta,
    };
  }

  const insertedCount = inserted?.length ?? 0;
  console.log('[discovery] pipeline done', {
    inserted: insertedCount,
    duplicates_skipped: duplicatesSkipped,
    final_count: result.meta.final_count,
  });

  return {
    success: true,
    inserted: insertedCount,
    duplicates_skipped: duplicatesSkipped,
    candidates_returned: result.candidates.length,
    trace: result.trace,
    meta: result.meta,
  };
}

function candidateToRow(projectId: string, c: KeywordCandidate) {
  // CPC arrives in cents from Ahrefs. The product convention is to keep raw
  // Ahrefs values where possible, but the existing `keywords.cpc NUMERIC(10,2)`
  // column has historically stored DOLLARS (legacy DataForSEO path). Convert
  // here to keep the column's meaning consistent across both pipelines.
  const cpcDollars = c.cpc != null ? Math.round(c.cpc) / 100 : 0;
  return {
    project_id: projectId,
    keyword: c.keyword,
    volume: Math.max(0, Math.round(c.volume || 0)),
    kd: c.difficulty != null ? Math.round(c.difficulty) : 0,
    cpc: cpcDollars,
    intent: c.intent || null,
    funnel_stage: deterministicFunnelStage(c.intent || '', c.keyword),
    parent_topic: c.parent_topic ?? '',
    traffic_potential: c.traffic_potential != null ? Math.round(c.traffic_potential) : 0,
    source_type: c.source_type,
    source_competitors: c.source_competitors,
    source_urls: c.source_urls,
    // Backfill the legacy single-string columns so the existing keywords UI
    // (which reads `gap_competitor` + `source_url`) stays meaningful.
    gap_competitor: c.source_type === 'competitor_gap' ? (c.source_competitors[0] ?? '') : '',
    source_url: c.source_type === 'competitor_gap' ? (c.source_urls[0] ?? '') : '',
    ai_score: c.ai_score,
    keyword_analysis_score: c.analysis_score,
    relevance_score: c.relevance_score,
    business_fit_score: 0,
    source: 'organic',
    status: 'pending' as const,
  };
}

export async function discoverKeywords(projectId: string) {
  const user = await currentUser();
  if (!user) return { success: false, error: 'Not authenticated' };

  const { data: project, error: pErr } = await supabaseAdmin
    .from('projects')
    .select('*, project_competitors(*)')
    .eq('id', projectId)
    .eq('user_id', user.id)
    .single();

  if (pErr || !project) return { success: false, error: 'Project not found' };

  // Unpack the form fields once, so the rest of the action — and the dev-time
  // console.log below — reads naturally.
  const websiteDomain: string = project.domain ?? '';
  const nicheIndustry: string = project.niche ?? '';
  const targetAudience: string = project.target_audience ?? '';
  const description: string = project.description ?? '';
  const companyName: string = project.company ?? '';
  const region: string = project.target_region ?? '';
  const language: string = project.target_language ?? 'en';

  return runWithUsageLogContext(
    { userId: user.id, projectId, feature: 'keyword_discovery' },
    async () => {
  try {
    const { QuotaService } = await import("@/services/quota");
    await QuotaService.checkQuota(user.id, "keywords_fetched");
    const { assertProjectKeywordCapacity } = await import('@/lib/admin/platform-settings-runtime');
    await assertProjectKeywordCapacity(projectId);
  } catch (e: any) {
    const isQuotaError = e?.name === 'QuotaExhaustedError' || e?.message?.includes('Quota exceeded');
    return {
      success: false,
      error: isQuotaError
        ? "You have reached your keyword limit. Please upgrade your plan or contact the administrator to fetch more keywords."
        : (e instanceof Error ? e.message : 'Keyword limit reached'),
    };
  }

  // 1. Load the current brief if one exists, but do not generate/scrape a new one.
  //    Also bypass the lightweight SEO crawler to avoid any hybrid scraping or Jina queries.
  const briefRes = await getBusinessBrief(projectId);
  const brief = briefRes.success && briefRes.brief ? briefRes.brief : undefined;

  const crawl: WebsiteCrawlResult = {
    url: websiteDomain,
    finalUrl: websiteDomain,
    status: 0,
    title: '',
    metaDescription: '',
    headings: { h1: [], h2: [], h3: [] },
    navText: [],
    paragraphs: [],
    urlSlugs: [],
    linkTexts: [],
    topPhrases: [],
    wordCount: 0,
    error: 'Crawling disabled on keyword discovery',
  };

  // 2. Seeds. We DO NOT use the brief's AI-generated seed_phrases here —
  //    they're inferred from the website scrape and were drifting into
  //    phrases the user never typed (e.g. "leadership hiring consulting"
  //    for a project whose niche was "Software engineering"). Instead we
  //    split the user's raw Niche / Industry + Target Audience fields on
  //    commas / semicolons / " and " / "&" / "/" — so what the user typed
  //    is literally what DataForSEO receives.
  const seedKeywords = buildSeedsFromInputs(nicheIndustry, targetAudience);

  // Dev-time sanity log so the Next.js server terminal makes it obvious which
  // form fields actually reached the pipeline. This fires on every Discover
  // click — it's cheap, and we've been bitten before by fields silently
  // dropping at the action boundary.
  console.log('Keyword discovery input', {
    seedKeywords,
    region,
    language,
    websiteDomain,
    nicheIndustry,
    targetAudience,
    description,
    companyName,
    crawlTitle: crawl.title,
    crawlTopPhrases: crawl.topPhrases.slice(0, 20),
    crawlStatus: crawl.status,
    crawlError: crawl.error ?? null,
  });

  const { keywords: rawKeywords, trace: discoveryTrace, ahrefsDiscoveryState } = await discoverKeywordsForProject(
    seedKeywords,
    region,
    language,
    // 1. Website Domain → targetUrl
    websiteDomain || undefined,
    // 2. Niche / Industry → businessDomain (anchors the relevance + fit scorers)
    nicheIndustry || undefined,
    // 3-6. Target Audience, Description, Company Name, and the live crawl
    //      all go through the extras bag.
    {
      targetAudience: targetAudience || undefined,
      description: description || undefined,
      companyName: companyName || undefined,
      crawl,
    }
  );

  if (!rawKeywords.length) {
    const cfgErr = discoveryTrace.find(t => t.label === '(config)');
    const fetchErr = discoveryTrace.find(t => t.fetchError);
    const detail =
      cfgErr?.fetchError ||
      fetchErr?.fetchError ||
      'No rows returned for these seeds.';
    return {
      success: false,
      error: `No keywords returned (${detail}). Open DevTools console for the full trace.`,
      discoveryTrace,
      briefSummary: briefSummary(brief),
    };
  }

  // 3. The DataForSEO pipeline (relevance_score ≥ 45 + business_fit_score ≥ 35
  //    + context-aware negative patterns + cluster-dedupe) already enforces
  //    strict topical relevance. The old Gemini-embedding post-filter used to
  //    run here on top, but it was cutting the final 100 keywords down to
  //    ~13 at the default 0.55 threshold — the two filters were fighting each
  //    other. We trust the pipeline gates now and let the full result through.
  const filtered = rawKeywords;
  const relevanceSummary = {
    kept: rawKeywords.length,
    dropped: 0,
    threshold: 0,
    reason: 'pipeline_gates_only',
  };

  const rows = filtered.map(kw => ({
    project_id: projectId,
    keyword: kw.keyword,
    volume: kw.volume,
    kd: kw.kd,
    cpc: kw.cpc,
    trend: '',
    competition_level: '',
    intent: kw.intent || null,
    funnel_stage: deterministicFunnelStage(kw.intent || '', kw.keyword),
    monthly_searches: kw.monthly_searches,
    secondary_keywords: kw.secondary_keywords,
    // Legacy simple scalar — kept for backwards compatibility with the
    // existing calendar/cluster logic that sorts on `ai_score`.
    ai_score: aiScore(kw.volume, kw.kd, kw.intent),
    // New composite score produced by `calculateKeywordAnalysisScore`. Falls
    // back to `ai_score` so rows stay sortable even if the pipeline ever
    // returns it as 0 (e.g. SERP-only failure path).
    keyword_analysis_score:
      kw.keyword_analysis_score || aiScore(kw.volume, kw.kd, kw.intent),
    // Persist the two upstream scores so the keywords page can render
    // "Rel/Fit" micro-badges without recomputing.
    relevance_score: kw.relevance_score ?? null,
    business_fit_score: kw.business_fit_score ?? null,
    status: 'pending',
  }));

  // Fresh-start replace: wipe the existing `pending` keywords for this project
  // before inserting the fresh 100. Approved/rejected rows are preserved so the
  // calendar and existing content don't lose their anchors.
  //
  // Important: the previous pipeline used `upsert(..., { ignoreDuplicates: true })`,
  // which made re-runs silently no-op for any keyword the project had seen
  // before. That's why earlier refactors looked like "nothing changed".
  const { error: delErr } = await supabaseAdmin
    .from('keywords')
    .delete()
    .eq('project_id', projectId)
    .eq('status', 'pending');

  if (delErr) {
    return {
      success: false,
      error: `Failed to clear stale keywords before re-discovery: ${delErr.message}`,
      discoveryTrace,
      briefSummary: briefSummary(brief),
      relevance: relevanceSummary,
    };
  }

  // Use upsert with `ignoreDuplicates: true` only to skip rows whose keyword
  // is already approved/rejected (still in the table). All other rows insert.
  let { data, error } = await supabaseAdmin
    .from('keywords')
    .upsert(rows, { onConflict: 'project_id,keyword,source', ignoreDuplicates: true })
    .select();

  if (error && error.message.includes('funnel_stage') && error.message.includes('schema cache')) {
    const rowsNoFunnel = rows.map(({ funnel_stage: _, ...rest }) => rest);
    ({ data, error } = await supabaseAdmin
      .from('keywords')
      .upsert(rowsNoFunnel, { onConflict: 'project_id,keyword,source', ignoreDuplicates: true })
      .select());
  }

  if (error)
    return {
      success: false,
      error: error.message,
      discoveryTrace,
      briefSummary: briefSummary(brief),
      relevance: relevanceSummary,
    };

  await supabaseAdmin
    .from('projects')
    .update({
      ahrefs_discovery_state: ahrefsDiscoveryState || {},
      // Server-side baseline for the "Project details have changed" warning —
      // replaces the old client-only localStorage hash, which false-positived
      // on any new browser/device that had never written it.
      discovery_params_snapshot: {
        domain: websiteDomain,
        niche: nicheIndustry,
        target_region: region,
        target_language: language,
      },
    })
    .eq('id', projectId);

  return {
    success: true,
    data,
    count: data?.length ?? 0,
    discoveryTrace,
    briefSummary: briefSummary(brief),
    relevance: relevanceSummary,
  };
  });
}

export type SuggestedContentType = 'blog' | 'ebook' | 'whitepaper' | 'linkedin';

export interface TrendingKeywordSuggestion {
  keyword: string;
  rationale: string;
  /** AI's recommended content type for this keyword (drives the modal's dropdown default). */
  recommendedType: SuggestedContentType;
  /** Marketing funnel stage this keyword targets — informational, shown as a badge in the modal. */
  funnelStage?: 'TOFU' | 'MOFU' | 'BOFU';
}

/**
 * Claude-generated keyword ideas for the "Generate Keywords" content-calendar
 * modal — 5 trending, diversified blog-keyword ideas grounded in the project's
 * business brief, enriched with DataForSEO metrics. When `userPrompt` is
 * given, it is weighted ABOVE the general business brief (explicit user intent
 * wins over the passive brief context whenever they'd otherwise conflict).
 */
export async function generateTrendingKeywordsAction(
  projectId: string,
  opts: { userPrompt?: string } = {}
): Promise<
  | { success: true; keywords: TrendingKeywordSuggestion[] }
  | { success: false; error: string }
> {
  const user = await currentUser();
  if (!user) return { success: false, error: 'Not authenticated' };

  try {
    const { QuotaService } = await import('@/services/quota');
    await QuotaService.checkQuota(user.id, 'ai_credits');
  } catch (e: any) {
    const isQuotaError = e?.name === 'QuotaExhaustedError' || e?.message?.includes('Quota exceeded');
    return {
      success: false,
      error: isQuotaError
        ? 'QUOTA_EXCEEDED:ai_credits — You have reached your AI credit limit. Upgrade your plan to generate more keyword ideas.'
        : (e instanceof Error ? e.message : 'AI credit check failed'),
    };
  }

  const { data: project, error: pErr } = await supabaseAdmin
    .from('projects')
    .select('*')
    .eq('id', projectId)
    .eq('user_id', user.id)
    .single();
  if (pErr || !project) return { success: false, error: 'Project not found' };

  const briefRes = await getBusinessBrief(projectId);
  const brief = briefRes.success ? briefRes.brief : null;

  const { data: existingRows } = await supabaseAdmin
    .from('keywords')
    .select('keyword')
    .eq('project_id', projectId)
    .limit(200);
  const existingKeywords = (existingRows ?? [])
    .map(r => String(r.keyword ?? '').trim())
    .filter(Boolean);

  // Keywords already scheduled on the calendar. A keyword can be scheduled
  // without ever having a row in `keywords` (e.g. ad-hoc / repair / content-health
  // entries), so this is a separate source of truth from existingKeywords above —
  // both must be excluded, or the button can re-suggest something already queued.
  let calendarKeywords: string[] = [];
  try {
    const { data: calendarRows } = await supabaseAdmin
      .from('calendar_entries')
      .select('focus_keyword, secondary_keywords')
      .eq('project_id', projectId)
      .limit(500);
    calendarKeywords = (calendarRows ?? []).flatMap(r => [
      String((r as { focus_keyword?: string }).focus_keyword ?? '').trim(),
      ...(((r as { secondary_keywords?: string[] }).secondary_keywords ?? []).map(k => String(k ?? '').trim())),
    ]).filter(Boolean);
  } catch { /* no-op */ }

  // Titles of content already published on the site (from the sitemap the user
  // configures in Settings). Feeding these lets the AI see what already exists
  // so it proposes genuinely NEW, complementary topics instead of re-suggesting
  // things the site already ranks for. Best-effort — degrade silently if the
  // sitemap table isn't populated yet.
  let postedTitles: string[] = [];
  try {
    const { data: sitemapRows } = await supabaseAdmin
      .from('project_sitemap_urls')
      .select('title, path, kind')
      .eq('project_id', projectId)
      .eq('kind', 'blog')
      .limit(400);
    postedTitles = (sitemapRows ?? [])
      .map(r => String((r as { title?: string }).title ?? '').trim())
      .filter(t => t.length > 3);
  } catch { /* sitemap not configured / table absent — no-op */ }

  // What this project's AI has learned from previous work here — style,
  // preferences, audience insights, and (most relevant here) topics already
  // covered, so new suggestions extend the site's existing content strategy
  // instead of drifting into unrelated territory.
  const { loadProjectMemory, formatProjectMemoryForPrompt } = await import('@/lib/ai-memory');
  const memoryEntries = await loadProjectMemory(projectId);
  const memoryBlock = formatProjectMemoryForPrompt(memoryEntries);

  // Deterministic, case/whitespace-insensitive exclusion set — the prompt asks
  // the model to avoid these too, but we never rely on the LLM alone to honor
  // "never repeat": every suggestion is hard-filtered against this set below.
  const normKw = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
  const excludedNormalized = new Set(
    [...existingKeywords, ...calendarKeywords, ...postedTitles].map(normKw).filter(Boolean)
  );

  const userPrompt = (opts.userPrompt || '').trim();
  const regionName = TARGET_REGIONS.find(r => r.code === project.target_region)?.name || project.target_region || 'unspecified';

  const businessContext = [
    `Company: ${project.company || project.name || ''}`,
    `Domain: ${project.domain || ''}`,
    `Niche/industry: ${project.niche || 'unspecified'}`,
    `Target region: ${regionName}`,
    `Target audience: ${project.target_audience || 'unspecified'}`,
    brief?.summary ? `Business summary: ${brief.summary}` : '',
    brief?.products?.length ? `Products/offerings: ${brief.products.join(', ')}` : '',
    brief?.usps?.length ? `Differentiators: ${brief.usps.join(', ')}` : '',
    brief?.audiences?.length ? `Audience segments: ${brief.audiences.join(', ')}` : '',
  ].filter(Boolean).join('\n');

  const prompt = `You are an expert SEO strategist generating NEW, TRENDING blog keyword ideas for a content calendar. You have live web search — use it.
${userPrompt ? `\nPRIMARY INSTRUCTION — follow this first and most closely. It overrides the general business context below whenever they conflict:\n"${userPrompt}"\n` : ''}
BUSINESS CONTEXT (background${userPrompt ? " — keep ideas relevant to this business, but the instruction above takes priority" : ''}):
${businessContext || 'No business brief available yet.'}
${memoryBlock}
${postedTitles.length ? `\nContent ALREADY PUBLISHED on this site (from its sitemap) — do NOT suggest keywords that overlap these topics. Instead, propose fresh, complementary angles that expand the same themes the site clearly invests in:\n${postedTitles.slice(0, 150).join(' | ')}` : ''}
${excludedNormalized.size ? `\nKEYWORDS TO NEVER SUGGEST — already covered in this project's keyword list, already scheduled on the calendar, or already published (do NOT repeat these or a close variant of any of them):\n${[...excludedNormalized].slice(0, 250).join(', ')}` : ''}

STEP 1 — RESEARCH FIRST: search the web for what's actually trending RIGHT NOW (recent news, industry reports, product launches, regulatory changes, seasonal moments) in this niche, specific to ${regionName}. Ground every keyword in something genuinely current — not a generic evergreen topic restated.

STEP 2 — Generate exactly 8 NEW, DIVERSE keyword ideas from that research. Requirements:
- KEYWORD LENGTH: Mix it up naturally — include short head terms (2 words), mid-tail phrases (3-5 words), AND long-tail phrases (6+ words, close to a natural search query). Do NOT force every keyword to the same length, and do NOT cap every keyword at 2-3 words. At the same time, avoid full sentences or awkwardly long strings — a long-tail keyword should still read like something a real person would type into a search bar, not a full question with filler words.
- Every keyword must have realistic HIGH SEARCH-VOLUME potential for ${regionName} — favour terms with clear existing demand over obscure/no-volume phrasing. Prioritise terms people actually search on Google and AI assistants (ChatGPT, Perplexity, Google AI Overviews) — high AEO/GEO potential (clear, entity-rich, directly answerable).
- Stay in the same topical territory the site already publishes in (so they fit the brand and what has worked before, per the project memory above), but NEVER suggest anything in the "never suggest" list above or a close variant of it — always something newer and tied to what's currently trending.
- FUNNEL STAGE: using the business's products/offerings above, deliberately spread the 8 keywords across the marketing funnel — include a mix of TOFU (broad awareness/education, e.g. "what is X"), MOFU (comparison/consideration, e.g. "X vs Y", "best X for Z"), and BOFU (ready-to-buy/high commercial intent, tied directly to a specific product/offering) — not all 8 from the same stage.
- Diversify across search intent (informational/commercial/navigational), funnel stage, and keyword length — never near-duplicates.
- For each keyword, recommend the best content format: "blog" (most topics), "ebook" or "whitepaper" (deep, download-worthy or data-heavy topics), or "linkedin" (short opinion/thought-leadership angles).

Respond with ONLY this JSON on its own, no markdown fences, no commentary, no text before or after it:
{"keywords":[{"keyword":"...","rationale":"one short sentence on why this is trending/a good target right now","recommendedType":"blog|ebook|whitepaper|linkedin","funnelStage":"TOFU|MOFU|BOFU"}]}`;

  let raw: string;
  try {
    raw = await aiGenerate('keyword-ideation', prompt, {
      temperature: 0.9,
      maxOutputTokens: 2048,
      useGoogleSearch: true,
      // Search-grounded calls (real web search + synthesis) run noticeably
      // slower than a plain completion — 45s was tuned for the old non-grounded
      // call and was aborting real grounded requests mid-flight. This is a
      // foreground, user-awaited action (spinner + "Thinking…"), so bounded but
      // generous beats both "too short" and fully unbounded.
      timeoutMs: 90000,
      userId: user.id,
      projectId,
    });
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'AI generation failed. Please try again.' };
  }

  const SUPPORTED_TYPES: SuggestedContentType[] = ['blog', 'ebook', 'whitepaper', 'linkedin'];
  const normalizeType = (t: unknown): SuggestedContentType => {
    const v = String(t ?? '').trim().toLowerCase();
    return (SUPPORTED_TYPES as string[]).includes(v) ? (v as SuggestedContentType) : 'blog';
  };
  const SUPPORTED_FUNNEL_STAGES = ['TOFU', 'MOFU', 'BOFU'] as const;
  const normalizeFunnel = (t: unknown): 'TOFU' | 'MOFU' | 'BOFU' | undefined => {
    const v = String(t ?? '').trim().toUpperCase();
    return (SUPPORTED_FUNNEL_STAGES as readonly string[]).includes(v) ? (v as 'TOFU' | 'MOFU' | 'BOFU') : undefined;
  };

  const { parseLooseJson } = await import('@/services/ai/providers/base');
  const parsed = parseLooseJson<{
    keywords?: Array<{ keyword?: string; rationale?: string; recommendedType?: string; funnelStage?: string }>;
  }>(raw);
  const candidates: TrendingKeywordSuggestion[] = (parsed?.keywords ?? [])
    .map(k => ({
      keyword: (k.keyword || '').trim(),
      rationale: (k.rationale || '').trim(),
      recommendedType: normalizeType(k.recommendedType),
      funnelStage: normalizeFunnel(k.funnelStage),
    }))
    .filter(k => k.keyword);

  // Deterministic hard filter — never trust the prompt alone to honor "don't
  // repeat": drop anything that exact-matches (normalized) a keyword already in
  // this project's list, already scheduled on the calendar, or already
  // published, and drop near-duplicates within this same batch too.
  const seenInBatch = new Set<string>();
  const keywords: TrendingKeywordSuggestion[] = [];
  for (const k of candidates) {
    const norm = normKw(k.keyword);
    if (excludedNormalized.has(norm) || seenInBatch.has(norm)) continue;
    seenInBatch.add(norm);
    keywords.push(k);
    if (keywords.length >= 8) break;
  }

  if (!keywords.length) {
    return { success: false, error: 'The AI did not return usable keyword ideas. Please try again.' };
  }

  // No paid keyword-metrics lookup here by design — the suggestion step shows
  // the keyword + its rationale + a recommended content type only. Volume/KD are
  // deliberately omitted so we don't spend DataForSEO credits at ideation time.
  return { success: true, keywords };
}

/**
 * Parse the raw Niche / Industry and Target Audience fields from the Create
 * Project form into a clean list of seed phrases — in the exact wording the
 * user typed. Splits on commas, semicolons, pipes, slashes, ampersands, and
 * the word " and " so multi-topic projects (e.g. "Software engineering, HR,
 * RPO services") yield one seed per topic.
 *
 * The brief's AI-generated `seed_phrases` are intentionally NOT consulted
 * here — they drift into phrases the user never typed. We still build the
 * brief (it's what the UI brief card reads) but we don't mine it for seeds.
 */
function buildSeedsFromInputs(niche: string, audience: string): string[] {
  const raw = `${niche ?? ''}, ${audience ?? ''}`;
  const parts = raw
    .split(/[,;|/&]|\s+and\s+/i)
    .map(s => s.trim())
    .filter(Boolean);

  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of parts) {
    const key = p.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }
  return out;
}

function briefSummary(brief: BusinessBrief | undefined) {
  if (!brief) return null;
  return {
    summary: brief.summary,
    seed_count: brief.seed_phrases.length,
    scraped_urls: brief.source_urls,
    scraped_chars: brief.scraped_chars,
    generated_at: brief.generated_at,
  };
}

export async function getKeywords(
  projectId: string,
  opts: { limit?: number; offset?: number; includeApproved?: boolean } = {}
) {
  const user = await currentUser();
  if (!user)
    return {
      success: false,
      error: 'Not authenticated',
      data: [] as Keyword[],
      total: 0,
    };

  // Approved/rejected rows are always returned so the existing UI selection
  // state survives. The `limit/offset` only paginates pending rows if limit is defined.
  const includeApproved = opts.includeApproved !== false;
  const limit = opts.limit !== undefined ? Math.max(1, Math.min(opts.limit, 10000)) : undefined;
  const offset = Math.max(0, opts.offset ?? 0);

  // Total pending count — drives the "Load more" affordance in the UI.
  const { count } = await supabaseAdmin
    .from('keywords')
    .select('id', { count: 'exact', head: true })
    .eq('project_id', projectId)
    .or('source.eq.organic,source.is.null');

  const pendingQuery = supabaseAdmin
    .from('keywords')
    .select('*')
    .eq('project_id', projectId)
    .eq('status', 'pending')
    .or('source.eq.organic,source.is.null')
    .order('keyword_analysis_score', { ascending: false, nullsFirst: false })
    .order('volume', { ascending: false });

  const pendingPromise = limit !== undefined
    ? pendingQuery.range(offset, offset + limit - 1)
    : pendingQuery;


  const lockedPromise = includeApproved
    ? supabaseAdmin
        .from('keywords')
        .select('*')
        .eq('project_id', projectId)
        .neq('status', 'pending')
        .or('source.eq.organic,source.is.null')
        .order('keyword_analysis_score', { ascending: false, nullsFirst: false })
        .order('volume', { ascending: false })
    : Promise.resolve({ data: [], error: null } as { data: unknown[]; error: { message: string } | null });

  const projectPromise = supabaseAdmin
    .from('projects')
    .select('ahrefs_discovery_state')
    .eq('id', projectId)
    .single();

  const [pendingRes, lockedRes, projectRes] = await Promise.all([
    pendingPromise,
    lockedPromise,
    projectPromise,
  ]);

  if (pendingRes.error)
    return { success: false, error: pendingRes.error.message, data: [] as Keyword[], total: 0 };
  if (lockedRes.error)
    return { success: false, error: lockedRes.error.message, data: [] as Keyword[], total: 0 };

  const data = [...(lockedRes.data as Keyword[] ?? []), ...(pendingRes.data as Keyword[] ?? [])];
  return {
    success: true,
    data,
    total: count ?? data.length,
    ahrefsDiscoveryState: projectRes.data?.ahrefs_discovery_state || null,
  };
}

export async function loadMoreFromAhrefsAction(projectId: string) {
  const user = await currentUser();
  if (!user) {
    return { success: false, error: 'Not authenticated' };
  }

  // Check if user's plan allows the matching terms API
  const canUseApi = await canUseMatchingTermsApi(user.id);
  if (!canUseApi) {
    return {
      success: false,
      error: 'The Ahrefs keyword discovery feature is not available on your current plan. Please upgrade to access this feature.',
    };
  }

  try {
    const { QuotaService } = await import("@/services/quota");
    await QuotaService.checkQuota(user.id, "keywords_fetched");
  } catch (qErr: any) {
    return {
      success: false,
      error: "You have reached your keyword limit. Please upgrade your plan or contact the administrator to fetch more keywords.",
    };
  }

  // 1. Get the project details and its current ahrefs_discovery_state
  const { data: project, error: pErr } = await supabaseAdmin
    .from('projects')
    .select('domain, niche, target_audience, target_region, target_language, ahrefs_discovery_state')
    .eq('id', projectId)
    .single();

  if (pErr || !project) {
    return { success: false, error: pErr?.message ?? 'Project not found' };
  }

  const state = (project.ahrefs_discovery_state ?? {}) as {
    matching_last_volume?: number | null;
    matching_has_more?: boolean;
    related_last_volume?: number | null;
    related_has_more?: boolean;
  };

  const matchingLastVolume = state.matching_last_volume ?? undefined;
  const matchingHasMore = state.matching_has_more !== false;
  const relatedLastVolume = state.related_last_volume ?? undefined;
  const relatedHasMore = state.related_has_more !== false;

  console.log('[loadMoreFromAhrefsAction] Request inputs:', {
    projectId,
    domain: project.domain,
    niche: project.niche,
    region: project.target_region,
    state,
    matchingLastVolume,
    matchingHasMore,
    relatedLastVolume,
    relatedHasMore,
  });

  if (!matchingHasMore && !relatedHasMore) {
    console.log('[loadMoreFromAhrefsAction] Bypassing Ahrefs call: matching_has_more and related_has_more are both false.');
    return { 
      success: true, 
      count: 0, 
      message: 'All keywords already loaded from Ahrefs',
      ahrefsDiscoveryState: state,
    };
  }

  // 2. Build seed keywords using same logic
  const seedKeywords = buildSeedsFromInputs(project.niche ?? '', project.target_audience ?? '');

  // 3. Fetch from Ahrefs using last volume
  // Fetch via discoverKeywordsForProject to reuse the full scoring and normalization pipeline!
  console.log('[loadMoreFromAhrefsAction] Triggering discoverKeywordsForProject with seeds:', seedKeywords);
  const research = await discoverKeywordsForProject(
    seedKeywords,
    project.target_region ?? 'us',
    project.target_language ?? 'en',
    project.domain ?? undefined,
    project.niche ?? undefined,
    {
      targetAudience: project.target_audience ?? undefined,
      matchingLastVolume,
      relatedLastVolume,
      queryMatching: matchingHasMore,
      queryRelated: relatedHasMore,
    }
  );

  const rawKeywords = research.keywords;
  console.log(`[loadMoreFromAhrefsAction] Received ${rawKeywords.length} raw keywords.`);
  console.log('[loadMoreFromAhrefsAction] Trace entries:', JSON.stringify(research.trace, null, 2));

  if (!rawKeywords.length) {
    if (research.ahrefsDiscoveryState) {
      console.log('[loadMoreFromAhrefsAction] Ahrefs responded successfully with 0 keywords. Setting matching_has_more to false.');
      await supabaseAdmin
        .from('projects')
        .update({ ahrefs_discovery_state: research.ahrefsDiscoveryState })
        .eq('id', projectId);
      return { 
        success: true, 
        count: 0,
        discoveryTrace: research.trace,
        ahrefsDiscoveryState: research.ahrefsDiscoveryState,
      };
    } else {
      console.warn('[loadMoreFromAhrefsAction] Ahrefs request failed (transient error / fallback triggered). Retaining current database state.');
      const errEntry = research.trace?.find(t => !t.ok && t.label.includes('ahrefs'));
      const errorMsg = errEntry?.fetchError || 'Ahrefs request failed';
      return {
        success: false,
        error: `Ahrefs call failed: ${errorMsg}`,
        discoveryTrace: research.trace,
        ahrefsDiscoveryState: state,
      };
    }
  }

  // 4. Map keywords to DB schema (relevance and fit are already calculated by discoverKeywordsForProject!)
  const rows = rawKeywords.map(kw => ({
    project_id: projectId,
    keyword: kw.keyword,
    volume: kw.volume,
    kd: kw.kd,
    cpc: kw.cpc,
    trend: '',
    competition_level: '',
    intent: kw.intent || null,
    funnel_stage: deterministicFunnelStage(kw.intent || '', kw.keyword),
    monthly_searches: kw.monthly_searches || [],
    secondary_keywords: kw.secondary_keywords || [],
    ai_score: aiScore(kw.volume, kw.kd, kw.intent),
    keyword_analysis_score:
      kw.keyword_analysis_score || aiScore(kw.volume, kw.kd, kw.intent),
    relevance_score: kw.relevance_score ?? null,
    business_fit_score: kw.business_fit_score ?? null,
    source: 'organic',
    status: 'pending' as const,
  }));

  // 5. Upsert new keywords (ignore duplicate keywords already approved/rejected/pending)
  let { data: inserted, error: insErr } = await supabaseAdmin
    .from('keywords')
    .upsert(rows, { onConflict: 'project_id,keyword,source', ignoreDuplicates: true })
    .select();

  if (insErr && insErr.message.includes('funnel_stage') && insErr.message.includes('schema cache')) {
    const rowsNoFunnel = rows.map(({ funnel_stage: _, ...rest }) => rest);
    ({ data: inserted, error: insErr } = await supabaseAdmin
      .from('keywords')
      .upsert(rowsNoFunnel, { onConflict: 'project_id,keyword,source', ignoreDuplicates: true })
      .select());
  }

  if (insErr) {
    console.error('[loadMoreFromAhrefsAction] DB Insertion error:', insErr.message);
    return { success: false, error: insErr.message, discoveryTrace: research.trace };
  }

  // 6. Update project's `ahrefs_discovery_state`
  let finalState = state;
  if (research.ahrefsDiscoveryState) {
    finalState = research.ahrefsDiscoveryState;
    console.log('[loadMoreFromAhrefsAction] Updating database discovery state to:', finalState);
    await supabaseAdmin
      .from('projects')
      .update({ ahrefs_discovery_state: research.ahrefsDiscoveryState })
      .eq('id', projectId);
  }

  return {
    success: true,
    count: inserted?.length ?? 0,
    discoveryTrace: research.trace,
    ahrefsDiscoveryState: finalState,
  };
}

/**
 * Pagination helper for the "Load more" button on the keywords screen. Returns
 * the next N pending keywords past `offset`, sorted by analysis score.
 */
export async function loadMoreKeywords(
  projectId: string,
  offset: number,
  limit: number = 20
) {
  const user = await currentUser();
  if (!user) return { success: false, error: 'Not authenticated', data: [] as Keyword[], total: 0 };

  const safeLimit = Math.max(1, Math.min(limit, 100));
  const safeOffset = Math.max(0, offset);

  const { count } = await supabaseAdmin
    .from('keywords')
    .select('id', { count: 'exact', head: true })
    .eq('project_id', projectId)
    .eq('status', 'pending');

  const { data, error } = await supabaseAdmin
    .from('keywords')
    .select('*')
    .eq('project_id', projectId)
    .eq('status', 'pending')
    .order('keyword_analysis_score', { ascending: false, nullsFirst: false })
    .order('volume', { ascending: false })
    .range(safeOffset, safeOffset + safeLimit - 1);

  if (error) return { success: false, error: error.message, data: [] as Keyword[], total: 0 };
  return { success: true, data: (data ?? []) as Keyword[], total: count ?? 0 };
}

export async function updateKeywordStatus(
  keywordId: string,
  status: KeywordStatus,
  expectedProjectId?: string
) {
  const user = await currentUser();
  if (!user) return { success: false, error: 'Not authenticated' };

  const { data: keyword, error: kwErr } = await supabaseAdmin
    .from('keywords')
    .select('id, project_id, keyword, secondary_keywords, projects!inner(user_id)')
    .eq('id', keywordId)
    .eq('projects.user_id', user.id)
    .single();

  if (kwErr || !keyword) return { success: false, error: 'Keyword not found or unauthorized' };
  if (expectedProjectId && String(keyword.project_id) !== String(expectedProjectId)) {
    return { success: false, error: 'Keyword not found or unauthorized' };
  }

  const { error } = await supabaseAdmin
    .from('keywords')
    .update({ status })
    .eq('id', keywordId);

  if (error) return { success: false, error: error.message };

  if (status === 'approved') {
    void enrichKeywordInBackground(keywordId);
    const projectId = keyword.project_id as string;
    const cal = await scheduleKeywordOnFirstVacantIfNeeded(projectId, keywordId);
    if (!cal.ok) {
      return {
        success: true,
        calendarError: cal.error,
      };
    }
    if (cal.skipped) {
      return {
        success: true,
        calendarSkipped: true,
        scheduledDate: cal.scheduledDate,
      };
    }
    return { success: true, scheduledDate: cal.scheduledDate };
  }
  return { success: true };
}

export async function bulkUpdateKeywordStatus(
  keywordIds: string[],
  status: KeywordStatus,
  expectedProjectId?: string,
  /** Optional keywordId -> ContentType, so bulk scheduling uses the content type picked per row. */
  contentTypes?: Record<string, string>
) {
  const user = await currentUser();
  if (!user) return { success: false, error: 'Not authenticated' };

  const { data: keywords, error: kwErr } = await supabaseAdmin
    .from('keywords')
    .select('id, project_id, keyword, secondary_keywords, projects!inner(user_id)')
    .in('id', keywordIds)
    .eq('projects.user_id', user.id);

  if (kwErr) return { success: false, error: kwErr.message };
  if ((keywords ?? []).length !== keywordIds.length) {
    return { success: false, error: 'Some keywords were not found or unauthorized' };
  }
  if (expectedProjectId && (keywords ?? []).some(k => String(k.project_id) !== String(expectedProjectId))) {
    return { success: false, error: 'Some keywords were not found or unauthorized' };
  }

  const { error } = await supabaseAdmin
    .from('keywords')
    .update({ status })
    .in('id', keywordIds);

  if (error) return { success: false, error: error.message };
  if (status === 'approved') {
    for (const id of keywordIds) {
      void enrichKeywordInBackground(id);
    }
    const projectId = (keywords![0] as { project_id: string }).project_id;
    const batch = await scheduleKeywordsOnVacantDates(projectId, keywordIds, contentTypes);
    return {
      success: true,
      calendarScheduled: batch.scheduled.length,
      calendarSkipped: batch.skipped.length,
      ...(batch.error ? { calendarError: batch.error } : {}),
      ...(batch.scheduled[0] ? { firstScheduledDate: batch.scheduled[0].date } : {}),
    };
  }
  return { success: true };
}

export async function approveKeywordCluster(projectId: string, phrases: string[]) {
  const user = await currentUser();
  if (!user) return { success: false, error: 'Not authenticated', updated: 0 };

  const trimmed = phrases.map(p => p.trim()).filter(Boolean);
  if (!trimmed.length) {
    return { success: false, error: 'Pick at least one keyword in the cluster.', updated: 0 };
  }

  const { data: rows, error: fetchErr } = await supabaseAdmin
    .from('keywords')
    .select('keyword')
    .eq('project_id', projectId);

  if (fetchErr) return { success: false, error: fetchErr.message, updated: 0 };

  const saved = (rows ?? []).map(r => r.keyword);
  const lowerToCanonical = new Map(saved.map(k => [k.toLowerCase(), k]));

  const matched = new Set<string>();
  for (const phrase of trimmed) {
    const exact = saved.find(k => k === phrase);
    if (exact) {
      matched.add(exact);
      continue;
    }
    const fold = phrase.toLowerCase();
    const canon = lowerToCanonical.get(fold);
    if (canon) matched.add(canon);
  }

  if (matched.size === 0) {
    return {
      success: false,
      error: 'No cluster phrases matched your saved keywords. Run discovery, import gaps, then try again.',
      updated: 0,
    };
  }

  const { error } = await supabaseAdmin
    .from('keywords')
    .update({ status: 'approved' })
    .eq('project_id', projectId)
    .in('keyword', [...matched]);

  if (error) return { success: false, error: error.message, updated: 0 };

  const { data: idRows } = await supabaseAdmin
    .from('keywords')
    .select('id')
    .eq('project_id', projectId)
    .in('keyword', [...matched]);
  const ids = (idRows ?? []).map(r => r.id as string);
  if (ids.length) {
    const batch = await scheduleKeywordsOnVacantDates(projectId, ids);
    return {
      success: true,
      updated: matched.size,
      calendarScheduled: batch.scheduled.length,
      calendarSkipped: batch.skipped.length,
      ...(batch.error ? { calendarError: batch.error } : {}),
    };
  }
  return { success: true, updated: matched.size };
}

export async function deleteKeyword(keywordId: string) {
  const user = await currentUser();
  if (!user) return { success: false as const, error: 'Not authenticated' };

  const { data: row, error: fetchErr } = await supabaseAdmin
    .from('keywords')
    .select('id, projects!inner(user_id)')
    .eq('id', keywordId)
    .eq('projects.user_id', user.id)
    .single();

  if (fetchErr || !row) return { success: false as const, error: 'Keyword not found or unauthorized' };

  const { error } = await supabaseAdmin.from('keywords').delete().eq('id', keywordId);

  if (error) return { success: false as const, error: error.message };
  return { success: true as const };
}

export async function deleteAllKeywords(projectId: string) {
  const user = await currentUser();
  if (!user) return { success: false, error: 'Not authenticated' };

  const { error } = await supabaseAdmin
    .from('keywords')
    .delete()
    .eq('project_id', projectId);

  if (error) return { success: false, error: error.message };
  return { success: true };
}

/**
 * Google Ads "keywords for site" list for the project's domain.
 *
 * Caching: raw DataForSEO rows live in `project_domain_ads_keywords`. Reads merge
 * against `keywords` for saved status / analysis scores. DataForSEO is only
 * called when `force: true` (Re-discover / Refresh) or via `refreshDomainKeywordsFromDataForSEO`.
 */
const KEYWORD_STATUS_SET = new Set<KeywordStatus>(['pending', 'approved', 'rejected']);

function parseKeywordStatus(v: unknown): KeywordStatus | null {
  if (typeof v !== 'string') return null;
  return KEYWORD_STATUS_SET.has(v as KeywordStatus) ? (v as KeywordStatus) : null;
}

function parseCachedDomainAdsRows(raw: unknown): CompetitorKeywordsForSiteRow[] {
  if (!Array.isArray(raw)) return [];
  const out: CompetitorKeywordsForSiteRow[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const keyword = typeof o.keyword === 'string' ? o.keyword.trim().toLowerCase() : '';
    if (!keyword) continue;
    const volume = Math.max(0, Math.round(Number(o.volume) || 0));
    const kd = Math.max(0, Math.min(100, Math.round(Number(o.kd) || 0)));
    const cpc = Math.max(0, Number(o.cpc) || 0);
    const intent = typeof o.intent === 'string' ? o.intent : '';
    let estimated_monthly_traffic: number | null = null;
    if (o.estimated_monthly_traffic != null) {
      const etv = Math.round(Number(o.estimated_monthly_traffic) || 0);
      estimated_monthly_traffic = etv > 0 ? etv : null;
    }
    out.push({
      keyword,
      volume,
      kd,
      cpc,
      intent: intent as CompetitorKeywordsForSiteRow['intent'],
      estimated_monthly_traffic,
      competitor_position: Math.round(Number(o.competitor_position) || 0),
      competitor_url: typeof o.competitor_url === 'string' ? o.competitor_url : '',
    });
  }
  return out;
}

async function mergeDomainSiteRowsWithProjectKeywords(
  projectId: string,
  keywords: CompetitorKeywordsForSiteRow[]
): Promise<CompetitorKeywordsForSiteRow[]> {
  if (keywords.length === 0) return [];

  const norm = (s: string) => (s ?? '').trim().toLowerCase();
  const normalized = [...new Set(keywords.map(k => norm(k.keyword)))];
  const dbRows: {
    id: unknown;
    normalized_keyword: unknown;
    keyword_analysis_score: unknown;
    status: unknown;
  }[] = [];
  const chunkSize = 200;
  for (let i = 0; i < normalized.length; i += chunkSize) {
    const slice = normalized.slice(i, i + chunkSize);
    const { data: part, error: dbErr } = await supabaseAdmin
      .from('keywords')
      .select('id, normalized_keyword, keyword_analysis_score, status')
      .eq('project_id', projectId)
      .in('normalized_keyword', slice);
    if (dbErr) {
      console.warn('[mergeDomainSiteRowsWithProjectKeywords] keyword join failed', dbErr.message);
      break;
    }
    dbRows.push(...(part ?? []));
  }

  const map = new Map(
    dbRows.map(r => [
      norm(r.normalized_keyword as string),
      {
        id: r.id as string,
        keyword_analysis_score: r.keyword_analysis_score as number | null,
        status: parseKeywordStatus(r.status),
      },
    ])
  );

  return keywords.map(k => {
    const key = norm(k.keyword);
    const hit = map.get(key);
    const dbScore = typeof hit?.keyword_analysis_score === 'number' ? hit.keyword_analysis_score : null;
    const fallback = aiScore(k.volume, k.kd, k.intent || '');
    const fromIndustry = dbScore != null && dbScore > 0;
    const keyword_analysis_score =
      fromIndustry ? dbScore : fallback > 0 ? fallback : dbScore;
    return {
      ...k,
      matched_keyword_id: hit?.id ?? null,
      keyword_analysis_score,
      matched_status: hit?.status ?? null,
      analysis_score_is_industry: fromIndustry,
    };
  });
}

export type GetDomainKeywordsResult =
  | {
      success: true;
      data: CompetitorKeywordsForSiteRow[];
      fromCache: boolean;
      lastFetchedAt: string | null;
      discoveryTrace?: DataForSEOTraceEntry[];
    }
  | {
      success: false;
      error: string;
      data: CompetitorKeywordsForSiteRow[];
      fromCache: boolean;
      lastFetchedAt: string | null;
      discoveryTrace?: DataForSEOTraceEntry[];
    };

export async function getDomainKeywords(
  projectId: string,
  opts: { force?: boolean } = {}
): Promise<GetDomainKeywordsResult> {
  const user = await currentUser();
  if (!user)
    return {
      success: false,
      error: 'Not authenticated',
      data: [],
      fromCache: false,
      lastFetchedAt: null,
    };

  const { data: project, error: pErr } = await supabaseAdmin
    .from('projects')
    .select('domain, target_region, target_language')
    .eq('id', projectId)
    .eq('user_id', user.id)
    .single();

  if (pErr || !project)
    return { success: false, error: 'Project not found', data: [], fromCache: false, lastFetchedAt: null };

  const domain: string = (project as { domain?: string | null }).domain ?? '';
  const region: string = (project as { target_region?: string | null }).target_region ?? 'us';
  const language: string = (project as { target_language?: string | null }).target_language ?? 'en';

  if (!domain)
    return { success: false, error: 'No domain configured for this project', data: [], fromCache: false, lastFetchedAt: null };

  if (!opts.force) {
    const { data: cached, error: cErr } = await supabaseAdmin
      .from('project_domain_ads_keywords')
      .select('rows, last_fetched_at')
      .eq('project_id', projectId)
      .maybeSingle();

    if (cErr) {
      console.warn('[getDomainKeywords] cache read failed', cErr.message);
    }

    if (cached?.rows != null) {
      const rawRows = parseCachedDomainAdsRows(cached.rows);
      const merged = await mergeDomainSiteRowsWithProjectKeywords(projectId, rawRows);
      return {
        success: true,
        data: merged,
        fromCache: true,
        lastFetchedAt: (cached.last_fetched_at as string) ?? null,
      };
    }

    return {
      success: true,
      data: [],
      fromCache: false,
      lastFetchedAt: null,
    };
  }

  try {
    const { rows: keywords, trace } = await fetchGoogleAdsKeywordsForSite(domain, region, language, 1000);
    const nowIso = new Date().toISOString();

    const { error: upsertErr } = await supabaseAdmin.from('project_domain_ads_keywords').upsert(
      {
        project_id: projectId,
        target_domain: domain.trim().toLowerCase(),
        region,
        language,
        rows: keywords,
        last_fetched_at: nowIso,
        updated_at: nowIso,
      },
      { onConflict: 'project_id' }
    );

    if (upsertErr) {
      console.warn('[getDomainKeywords] cache upsert failed', upsertErr.message);
    }

    const merged = await mergeDomainSiteRowsWithProjectKeywords(projectId, keywords);
    return {
      success: true,
      data: merged,
      fromCache: false,
      lastFetchedAt: nowIso,
      discoveryTrace: trace,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      success: false,
      error: `API error: ${msg}`,
      data: [],
      fromCache: false,
      lastFetchedAt: null,
    };
  }
}

/** Explicit DataForSEO refresh for the domain tab — same as `getDomainKeywords(..., { force: true })`. */
export async function refreshDomainKeywordsFromDataForSEO(projectId: string): Promise<GetDomainKeywordsResult> {
  return getDomainKeywords(projectId, { force: true });
}

type DomainSiteKeywordPayload = Pick<
  CompetitorKeywordsForSiteRow,
  'keyword' | 'volume' | 'kd' | 'cpc' | 'intent' | 'estimated_monthly_traffic'
>;

/**
 * Creates or updates a `keywords` row from a Google Ads keywords-for-site row so
 * approve / reject in the Domain tab persists like the industry list.
 */
export async function upsertKeywordFromDomainSite(
  projectId: string,
  row: DomainSiteKeywordPayload,
  status: KeywordStatus
): Promise<
  | {
      success: true;
      id: string;
      scheduledDate?: string;
      calendarSkipped?: boolean;
      calendarError?: string;
    }
  | { success: false; error: string }
> {
  const user = await currentUser();
  if (!user) return { success: false, error: 'Not authenticated' };

  const phrase = (row.keyword ?? '').trim().toLowerCase();
  if (!phrase || phrase.length > 512) return { success: false, error: 'Invalid keyword' };

  const { data: project, error: pErr } = await supabaseAdmin
    .from('projects')
    .select('id')
    .eq('id', projectId)
    .eq('user_id', user.id)
    .single();

  if (pErr || !project) return { success: false, error: 'Project not found' };

  const volume = Math.max(0, Math.round(Number(row.volume) || 0));
  const kd = Math.max(0, Math.min(100, Math.round(Number(row.kd) || 0)));
  const cpc = Math.max(0, Number(row.cpc) || 0);
  const intentStr = row.intent || '';

  const { data: existing, error: exErr } = await supabaseAdmin
    .from('keywords')
    .select('id')
    .eq('project_id', projectId)
    .eq('normalized_keyword', phrase)
    .eq('source', 'organic')
    .maybeSingle();

  if (exErr) return { success: false, error: exErr.message };

  const ai = aiScore(volume, kd, intentStr);

  let id: string | undefined = existing?.id as string | undefined;

  if (!id) {
    try {
      const { QuotaService } = await import("@/services/quota");
      await QuotaService.checkQuota(user.id, "keywords_fetched");
    } catch (qErr: any) {
      return {
        success: false,
        error: "You have reached your keyword limit. Please upgrade your plan or contact the administrator to fetch more keywords.",
      };
    }
    // Same column set as `discoverKeywords` — never reference columns missing from this Supabase project.
    // `ignoreDuplicates: true` matches discovery: do not overwrite an existing approved/rejected row on conflict.
    let { error: insErr } = await supabaseAdmin.from('keywords').upsert(
      {
        project_id: projectId,
        keyword: phrase,
        volume,
        kd,
        cpc,
        trend: '',
        competition_level: '',
        intent: intentStr || null,
        funnel_stage: deterministicFunnelStage(intentStr, phrase),
        monthly_searches: [],
        secondary_keywords: [],
        ai_score: ai,
        keyword_analysis_score: ai,
        relevance_score: null,
        business_fit_score: null,
        source: 'organic',
        status: 'pending',
      },
      { onConflict: 'project_id,keyword,source', ignoreDuplicates: true }
    );

    if (insErr && insErr.message.includes('funnel_stage') && insErr.message.includes('schema cache')) {
      ({ error: insErr } = await supabaseAdmin.from('keywords').upsert(
        {
          project_id: projectId,
          keyword: phrase,
          volume,
          kd,
          cpc,
          trend: '',
          competition_level: '',
          intent: intentStr || null,
          monthly_searches: [],
          secondary_keywords: [],
          ai_score: ai,
          keyword_analysis_score: ai,
          relevance_score: null,
          business_fit_score: null,
          source: 'organic',
          status: 'pending',
        },
        { onConflict: 'project_id,keyword,source', ignoreDuplicates: true }
      ));
    }

    if (insErr) return { success: false, error: insErr.message };

    const { data: got, error: selErr } = await supabaseAdmin
      .from('keywords')
      .select('id')
      .eq('project_id', projectId)
      .eq('normalized_keyword', phrase)
      .maybeSingle();

    if (selErr || !got?.id) {
      return { success: false, error: selErr?.message ?? 'Could not resolve keyword after save' };
    }
    id = got.id as string;
  }

  // Same metrics industry discovery updates — omit `traffic_potential`, `updated_at`, etc. when missing from schema.
  let { error: metErr } = await supabaseAdmin
    .from('keywords')
    .update({
      volume,
      kd,
      cpc,
      intent: intentStr,
      funnel_stage: deterministicFunnelStage(intentStr, phrase),
    })
    .eq('id', id);

  if (metErr && metErr.message.includes('funnel_stage') && metErr.message.includes('schema cache')) {
    ({ error: metErr } = await supabaseAdmin
      .from('keywords')
      .update({
        volume,
        kd,
        cpc,
        intent: intentStr,
      })
      .eq('id', id));
  }

  if (metErr) return { success: false, error: metErr.message };

  // Industry tab Action column → `updateKeywordStatus` only. Domain tab uses the same path for calendar + enrich.
  const stRes = await updateKeywordStatus(id, status, projectId);
  if (!stRes.success) return { success: false, error: stRes.error ?? 'Could not update keyword status' };

  return {
    success: true,
    id,
    ...(stRes.scheduledDate ? { scheduledDate: stRes.scheduledDate } : {}),
    ...(stRes.calendarSkipped ? { calendarSkipped: true as const } : {}),
    ...(stRes.calendarError ? { calendarError: stRes.calendarError } : {}),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// scoreKeywordsWithAI
//
// Runs a comprehensive Gemini evaluation across all industry keywords for a
// project. Batches in groups of 25 to stay within token limits. Writes
// ai_eval_score + ai_eval_data + ai_eval_at back to each keyword row.
// Results are cached; re-running only re-evaluates keywords not yet scored
// unless `force` is true.
// ─────────────────────────────────────────────────────────────────────────────

// Smaller batches = shorter output = less risk of truncation / malformed JSON.
const AI_EVAL_BATCH = 10;
// Max parallel batch calls — keeps wall-clock time low without hammering the API.
const AI_EVAL_CONCURRENCY = 5;

/**
 * Extracts the first valid JSON array from raw text.
 * If the array is truncated (common when maxOutputTokens cuts mid-JSON) we try
 * to recover partial entries by walking back from the last complete object.
 */
function extractJsonArray(raw: string): string {
  // Strip any markdown fences
  const s = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
  const start = s.indexOf('[');
  if (start === -1) throw new Error('No JSON array found in response');

  // Happy path — find a closing bracket
  const end = s.lastIndexOf(']');
  if (end !== -1 && end > start) {
    try {
      // Validate it actually parses
      JSON.parse(s.slice(start, end + 1));
      return s.slice(start, end + 1);
    } catch {
      // fall through to repair
    }
  }

  // Repair path — the array was truncated. Find the last complete object by
  // scanning back for `}` then trying to close the array.
  const partial = s.slice(start);
  const lastClose = partial.lastIndexOf('}');
  if (lastClose === -1) throw new Error('No complete JSON object found in truncated response');
  try {
    const repaired = partial.slice(0, lastClose + 1) + ']';
    JSON.parse(repaired);
    return repaired;
  } catch {
    throw new Error('Could not repair truncated JSON array');
  }
}

async function callGeminiForEval(prompt: string, projectId: string): Promise<string> {
  return aiGenerate("keyword-eval", prompt, {
    projectId,
    jsonMode: true,
    temperature: 0.2,
    retries: 2,
    // Enough tokens for 10 keywords × ~200 tokens each of dense JSON output
    maxOutputTokens: 8192,
    timeoutMs: 120000,
  });
}

function buildEvalPrompt(
  project: {
    name: string;
    domain: string;
    niche: string;
    target_audience: string;
    target_region: string;
    brand_voice?: string;
    brand_values?: string;
    brand_description?: string;
  },
  brief: BusinessBrief | null,
  competitors: string[],
  keywords: Array<{ keyword: string; volume: number; kd: number; cpc: number; intent: string | null; trend: string }>
): string {
  const briefSnippet = brief
    ? [
        brief.summary?.slice(0, 600),
        brief.products?.length ? `Core offerings: ${brief.products.slice(0, 10).join(', ')}` : '',
        brief.audiences?.length ? `Audience: ${brief.audiences.slice(0, 3).join('; ')}` : '',
        brief.usps?.length ? `USPs: ${brief.usps.slice(0, 4).join('; ')}` : '',
      ].filter(Boolean).join('\n')
    : `Company: ${project.name}, Niche: ${project.niche}, Audience: ${project.target_audience}`;

  const brandPersonaSnippet = (project.brand_voice || project.brand_values || project.brand_description)
    ? `\n## BRAND PERSONA & IDENTITY\n${project.brand_voice ? `- Brand Voice/Tone: ${project.brand_voice}\n` : ""}${project.brand_values ? `- Core Values/Messaging: ${project.brand_values}\n` : ""}${project.brand_description ? `- Personality Description: ${project.brand_description}\n` : ""}`
    : "";

  const kwList = keywords
    .map((k, i) =>
      `${i + 1}. "${k.keyword}" | vol=${k.volume} | KD=${k.kd} | CPC=$${k.cpc.toFixed(2)} | intent=${k.intent ?? 'unknown'} | trend=${k.trend}`
    )
    .join('\n');

  return `You are a senior SEO strategist, content marketer, and business growth consultant evaluating keywords for a production SEO platform.

## BUSINESS CONTEXT
Company: ${project.name}
Domain: ${project.domain}
Niche: ${project.niche}
Target audience: ${project.target_audience}
Region: ${project.target_region}
Competitors: ${competitors.slice(0, 6).join(', ') || 'unknown'}

## BUSINESS BRIEF
${briefSnippet}
${brandPersonaSnippet}

## EVALUATION FRAMEWORK (weighted scoring)
- Business Relevance (25%): Does keyword align with company services, audience, goals, and brand voice/values?
- Intent Match (15%): Is intent commercial/transactional > informational > navigational?
- Traffic Potential (15%): Organic CTR opportunity, SERP type, ad density
- Search Volume (10%): Volume appropriate for niche (B2B 500–5k can beat B2C 100k)
- Keyword Difficulty (10%): Competitor strength, SERP weakness, outdated pages
- SERP Weakness (10%): Can quality content realistically outrank current results?
- Content Depth (5%): Rich subtopics, FAQs, use cases, 1500+ word article potential
- Trend Growth (5%): Rising vs declining demand
- Brand Safety (5%): Not a competitor brand / navigational / celebrity query

## CATEGORY DEFINITIONS
- high_opportunity: score ≥ 75, strong business fit + rankable + good intent
- good_fit: score 55–74, solid alignment, worth targeting
- moderate: score 35–54, some value but gaps in relevance or difficulty
- low_priority: score < 35, too broad / irrelevant / impossible to rank
- avoid: brand-only, navigational, spam, or zero business relevance

## KEYWORDS TO EVALUATE
${kwList}

## CRITICAL RULES
1. A 500 vol / KD 20 keyword beating a competitor's thin page = high score for B2B.
2. A 50k vol generic keyword with no buying intent = low score even with high volume.
3. Reject / heavily penalise competitor brand names, navigational queries, celebrity terms.
4. High KD is NOT an automatic rejection — weak SERP content creates opportunity.
5. All string values must use plain ASCII quotes — do NOT use curly/smart quotes.
6. Semantic Deduplication: Analyze the batch of keywords for semantic similarity/repetition (e.g. variations or minor variants of the same topic). If a keyword is a repetitive variant of another primary keyword in this list, set "duplicate_of" to the primary keyword's phrase, lower its score (to avoid cannibalization), and state this cannibalization risk in its weaknesses list.
7. Content Type: For each keyword, recommend exactly one system-supported content type: "blog", "ebook", "whitepaper", or "linkedin" (do not suggest any other type). Suggest the best format for generating content on this query.
8. Brand Persona Alignment: Evaluate whether the keyword and its search intent align with the brand persona, values, tone, and character. Penalize or lower scores for keywords that mismatch the brand's identity or messaging guidelines.

Return a JSON array. Each element must have exactly these fields:
- keyword (string — exact match from input)
- score (integer 0-100)
- category (one of: high_opportunity, good_fit, moderate, low_priority, avoid)
- analysis (object with integer fields 1-10: businessRelevance, intentQuality, trafficPotential, keywordDifficulty, serpWeakness, contentDepth, trendGrowth, conversionPotential)
- reasoning (object with: summary string, strengths string array, weaknesses string array, rankingOpportunity string, contentOpportunity string)
- recommended_content_type (string — one of: blog, ebook, whitepaper, linkedin)
- duplicate_of (string or null — if this keyword is a semantic duplicate of a primary keyword in the list, set to the primary keyword phrase, otherwise null)

Keep all string values short (summary ≤ 120 chars, each strength/weakness ≤ 80 chars) to avoid truncation.`;
}

type ParsedEval = {
  keyword: string;
  score: number;
  category: string;
  analysis: AiEvalData['analysis'];
  reasoning: AiEvalData['reasoning'];
  recommended_content_type?: string;
  duplicate_of?: string | null;
};

/**
 * Runs the batch/window Gemini scoring loop in the background (not awaited by the
 * caller), writing scores incrementally per window and keeping a
 * `keyword_ai_scoring_runs` status row up to date so the client can poll progress
 * and recover the "running" state across a refresh instead of only knowing about
 * it while the triggering request is still in flight.
 */
async function runAiScoringBatches<T extends { id: string; keyword: string }>(
  projectId: string,
  scope: AiScoringScope,
  table: 'keywords' | 'keyword_gaps',
  rows: T[],
  buildPrompt: (batch: T[]) => string,
  logLabel: string
): Promise<void> {
  let completed = 0;
  const now = new Date().toISOString();

  const batches: T[][] = [];
  for (let i = 0; i < rows.length; i += AI_EVAL_BATCH) {
    batches.push(rows.slice(i, i + AI_EVAL_BATCH));
  }

  try {
    for (let i = 0; i < batches.length; i += AI_EVAL_CONCURRENCY) {
      const window = batches.slice(i, i + AI_EVAL_CONCURRENCY);
      const results = await Promise.allSettled(
        window.map(async (batch) => {
          const prompt = buildPrompt(batch);
          const raw = await callGeminiForEval(prompt, projectId);
          return { batch, parsed: JSON.parse(extractJsonArray(raw)) as ParsedEval[] };
        })
      );

      for (const result of results) {
        if (result.status === 'rejected') {
          console.error(`[${logLabel}] batch parse error`, result.reason instanceof Error ? result.reason.message : result.reason);
          continue;
        }

        const { batch, parsed } = result.value;
        const lookup = new Map(parsed.map(r => [r.keyword.toLowerCase().trim(), r]));

        const updates = batch.flatMap(row => {
          const hit = lookup.get(row.keyword.toLowerCase().trim());
          if (!hit) return [];
          const evalData: AiEvalData = {
            category: hit.category,
            analysis: hit.analysis,
            reasoning: hit.reasoning,
            recommended_content_type: hit.recommended_content_type,
            duplicate_of: hit.duplicate_of,
          };
          return [{ id: row.id, keyword: row.keyword, ai_eval_score: hit.score, ai_eval_data: evalData, ai_eval_at: now }];
        });

        if (updates.length) {
          // Bulk upsert all updates in one DB round-trip
          await supabaseAdmin
            .from(table)
            .upsert(
              updates.map(u => ({ id: u.id, project_id: projectId, keyword: u.keyword, ai_eval_score: u.ai_eval_score, ai_eval_data: u.ai_eval_data, ai_eval_at: u.ai_eval_at })),
              { onConflict: 'id', ignoreDuplicates: false }
            );
          completed += updates.length;
        }
      }

      await updateAiScoringRunProgress(projectId, scope, completed);
    }
    await finishAiScoringRun(projectId, scope, 'done');
  } catch (err) {
    console.error(`[${logLabel}] scoring run failed`, err);
    await finishAiScoringRun(projectId, scope, 'error', err instanceof Error ? err.message : String(err));
  }
}

export async function scoreKeywordsWithAI(
  projectId: string,
  opts?: { force?: boolean; keywordIds?: string[] }
): Promise<{
  success: boolean;
  total: number;
  error?: string;
}> {
  const user = await currentUser();
  if (!user) return { success: false, total: 0, error: 'Not authenticated' };

  // Ownership check
  const { data: project } = await supabaseAdmin
    .from('projects')
    .select('id, name, domain, niche, target_audience, target_region, brand_voice, brand_values, brand_description')
    .eq('id', projectId)
    .eq('user_id', user.id)
    .single();
  if (!project) return { success: false, total: 0, error: 'Project not found' };

  // Load competitors
  const { data: compRows } = await supabaseAdmin
    .from('project_competitors')
    .select('domain')
    .eq('project_id', projectId);
  const competitors = (compRows ?? []).map(c => c.domain);

  // Load brief (optional — degrades gracefully)
  const briefRes = await getBusinessBrief(projectId);
  const brief = briefRes.brief;

  // Fetch keywords to score
  let query = supabaseAdmin
    .from('keywords')
    .select('id, keyword, volume, kd, cpc, intent, trend, ai_eval_score, ai_eval_at')
    .eq('project_id', projectId)
    .or('source.eq.organic,source.is.null')
    .order('volume', { ascending: false })
    .limit(200);

  if (opts?.keywordIds?.length) {
    query = query.in('id', opts.keywordIds);
  }
  if (!opts?.force) {
    query = query.is('ai_eval_score', null);
  }

  const { data: rows, error: fetchErr } = await query;
  if (fetchErr) return { success: false, total: 0, error: fetchErr.message };
  if (!rows?.length) return { success: true, total: 0 };

  await startAiScoringRun(projectId, 'organic', rows.length);
  void runAiScoringBatches(
    projectId,
    'organic',
    'keywords',
    rows as Array<{ id: string; keyword: string; volume: number; kd: number; cpc: number; intent: string | null; trend: string }>,
    (batch) => buildEvalPrompt(project, brief, competitors, batch),
    'scoreKeywordsWithAI'
  );

  return { success: true, total: rows.length };
}

// ─────────────────────────────────────────────────────────────────────────────
// scoreCompetitorKeywordsWithAI
//
// Same Gemini evaluation pipeline but targeted at keyword_gaps rows (competitor
// keyword gaps on the Competitor Insights page). Prompt is tuned for competitor
// research and blog-writing opportunity signals rather than pure industry intent.
// ─────────────────────────────────────────────────────────────────────────────

function buildCompetitorEvalPrompt(
  project: {
    name: string;
    domain: string;
    niche: string;
    target_audience: string;
    target_region: string;
    brand_voice?: string;
    brand_values?: string;
    brand_description?: string;
  },
  brief: BusinessBrief | null,
  competitors: string[],
  gaps: Array<{ keyword: string; volume: number; kd: number; gap_type: string; competitor_weakness: number; top_competitor_domain: string }>
): string {
  const briefSnippet = brief
    ? [
        brief.summary?.slice(0, 500),
        brief.products?.length ? `Core offerings: ${brief.products.slice(0, 8).join(', ')}` : '',
        brief.audiences?.length ? `Audience: ${brief.audiences.slice(0, 3).join('; ')}` : '',
        brief.usps?.length ? `USPs: ${brief.usps.slice(0, 3).join('; ')}` : '',
      ].filter(Boolean).join('\n')
    : `Company: ${project.name}, Niche: ${project.niche}, Audience: ${project.target_audience}`;

  const brandPersonaSnippet = (project.brand_voice || project.brand_values || project.brand_description)
    ? `\n## BRAND PERSONA & IDENTITY\n${project.brand_voice ? `- Brand Voice/Tone: ${project.brand_voice}\n` : ""}${project.brand_values ? `- Core Values/Messaging: ${project.brand_values}\n` : ""}${project.brand_description ? `- Personality Description: ${project.brand_description}\n` : ""}`
    : "";

  const kwList = gaps
    .map((g, i) =>
      `${i + 1}. "${g.keyword}" | vol=${g.volume} | KD=${g.kd} | gap=${g.gap_type} | competitor_weakness=${g.competitor_weakness} | top_competitor=${g.top_competitor_domain}`
    )
    .join('\n');

  return `You are a senior content strategist and competitive SEO expert evaluating competitor keyword gaps for a production content platform.

## BUSINESS CONTEXT
Company: ${project.name}
Domain: ${project.domain}
Niche: ${project.niche}
Target audience: ${project.target_audience}
Region: ${project.target_region}
Main competitors: ${competitors.slice(0, 6).join(', ') || 'unknown'}

## BUSINESS BRIEF
${briefSnippet}
${brandPersonaSnippet}

## GAP TYPE DEFINITIONS
- missing: You have no content for this keyword — competitor ranks, you don't
- weak: You have content but it underperforms competitor content
- untapped: High-value keyword neither you nor competitors dominate yet

## EVALUATION FRAMEWORK (weighted scoring for competitor gap keywords)
- Business Relevance (20%): Does this keyword align with company services / audience goals / brand persona?
- Blog Writing Potential (20%): Can a high-quality 1500+ word article be written on this topic? Rich subtopics, FAQs, use cases?
- Competitive Takeover Opportunity (20%): Gap type + competitor weakness score — how realistic is outranking the current result?
- Search Intent Quality (15%): Informational / commercial intent that drives discovery and consideration. Avoid pure transactional or navigational.
- Traffic Potential (10%): Organic volume and CTR opportunity in the niche context
- Trend & Freshness (10%): Rising demand or evergreen; avoid declining or seasonal-only terms
- Audience Fit (5%): Does the audience searching this match the company's ideal customer profile?

## CATEGORY DEFINITIONS
- high_opportunity: score ≥ 75 — strong blog angle, realistic to outrank, business-relevant
- good_fit: score 55–74 — solid topic, worth writing, some competition
- moderate: score 35–54 — borderline value or hard to rank
- low_priority: score < 35 — too generic, irrelevant, or impossible gap
- avoid: competitor brand, navigational, spam, no writing angle

## COMPETITOR KEYWORDS TO EVALUATE
${kwList}

## CRITICAL RULES
1. A missing/untapped keyword with competitor_weakness > 60 is a prime blog target — score high.
2. A weak gap with competitor_weakness > 40 is still a rewrite/upgrade opportunity.
3. Prioritise keywords with clear article angles (how-to, comparison, guide, list, case study).
4. Reject / heavily penalise competitor brand names, pure navigational queries, product-only transactional queries.
5. B2B niche: 300 vol / KD 25 beating a thin competitor page = high score.
6. All string values must use plain ASCII quotes.
7. Semantic Deduplication: Analyze the batch of keywords for semantic similarity/repetition (e.g. variations or minor variants of the same topic). If a keyword is a repetitive variant of another primary keyword in this list, set "duplicate_of" to the primary keyword's phrase, lower its score (to avoid cannibalization), and state this cannibalization risk in its weaknesses list.
8. Content Type: For each keyword, recommend exactly one system-supported content type: "blog", "ebook", "whitepaper", or "linkedin" (do not suggest any other type). Suggest the best format for generating content on this query.
9. Brand Persona Alignment: Verify if the keyword fits the brand's core values, brand voice, and personality. Penalize keywords that mismatch the brand's identity or messaging guidelines.

Return a JSON array. Each element must have exactly these fields:
- keyword (string — exact match from input)
- score (integer 0-100)
- category (one of: high_opportunity, good_fit, moderate, low_priority, avoid)
- analysis (object with integer fields 1-10: businessRelevance, blogPotential, competitiveTakeover, intentQuality, trafficPotential, trendGrowth, audienceFit, contentDepth)
- reasoning (object with: summary string, strengths string array, weaknesses string array, rankingOpportunity string, contentOpportunity string)
- recommended_content_type (string — one of: blog, ebook, whitepaper, linkedin)
- duplicate_of (string or null — if this keyword is a semantic duplicate of a primary keyword in the list, set to the primary keyword phrase, otherwise null)

Keep all strings short (summary ≤ 120 chars, each strength/weakness ≤ 80 chars, rankingOpportunity ≤ 100 chars, contentOpportunity ≤ 100 chars) to avoid truncation.`;
}

export async function scoreCompetitorKeywordsWithAI(
  projectId: string,
  opts?: { force?: boolean }
): Promise<{
  success: boolean;
  total: number;
  error?: string;
}> {
  const user = await currentUser();
  if (!user) return { success: false, total: 0, error: 'Not authenticated' };

  const { data: project } = await supabaseAdmin
    .from('projects')
    .select('id, name, domain, niche, target_audience, target_region, brand_voice, brand_values, brand_description')
    .eq('id', projectId)
    .eq('user_id', user.id)
    .single();
  if (!project) return { success: false, total: 0, error: 'Project not found' };

  const { data: compRows } = await supabaseAdmin
    .from('project_competitors')
    .select('domain')
    .eq('project_id', projectId);
  const competitors = (compRows ?? []).map(c => c.domain);

  const briefRes = await getBusinessBrief(projectId);
  const brief = briefRes.brief;

  let query = supabaseAdmin
    .from('keyword_gaps')
    .select('id, keyword, volume, kd, gap_type, competitor_weakness, top_competitor_domain, ai_eval_score')
    .eq('project_id', projectId)
    .order('volume', { ascending: false })
    .limit(300);

  if (!opts?.force) {
    query = query.is('ai_eval_score', null);
  }

  const { data: rows, error: fetchErr } = await query;
  if (fetchErr) return { success: false, total: 0, error: fetchErr.message };
  if (!rows?.length) return { success: true, total: 0 };

  await startAiScoringRun(projectId, 'competitor', rows.length);
  void runAiScoringBatches(
    projectId,
    'competitor',
    'keyword_gaps',
    rows as Array<{ id: string; keyword: string; volume: number; kd: number; gap_type: string; competitor_weakness: number; top_competitor_domain: string }>,
    (batch) => buildCompetitorEvalPrompt(project, brief, competitors, batch),
    'scoreCompetitorKeywordsWithAI'
  );

  return { success: true, total: rows.length };
}

function buildKeywordUpsertPayload(
  projectId: string,
  payload: {
    keyword?: string;
    volume?: number;
    kd?: number;
    cpc?: number;
    intent?: string;
    source?: string;
    competitorDomain?: string;
    rankingUrl?: string;
    rank?: number;
  },
  schemaSafe: boolean = true
) {
  const volume = Math.max(0, Math.round(Number(payload.volume) || 0));
  const kd = Math.max(0, Math.min(100, Math.round(Number(payload.kd) || 0)));
  const cpc = Math.max(0, Number(payload.cpc) || 0);
  const intentStr = payload.intent || '';
  const ai = aiScore(volume, kd, intentStr);
  const phrase = (payload.keyword ?? '').trim().toLowerCase();

  const data: Record<string, any> = {
    project_id: projectId,
    keyword: payload.keyword!.trim(),
    volume,
    kd,
    cpc,
    trend: '',
    competition_level: '',
    intent: intentStr || null,
    monthly_searches: [],
    secondary_keywords: [],
    ai_score: ai,
    keyword_analysis_score: ai,
    relevance_score: null,
    business_fit_score: null,
    gap_competitor: payload.competitorDomain || '',
    source_url: payload.rankingUrl || '',
    source_type: payload.source || 'competitor',
    source: payload.source || 'competitor',
    status: 'approved',
  };

  if (!schemaSafe) {
    data.funnel_stage = deterministicFunnelStage(intentStr, phrase);
  }

  return data;
}

export async function scheduleKeyword(
  projectId: string,
  keywordId: string,
  payload: {
    contentType: string;
    keyword?: string;
    volume?: number;
    kd?: number;
    cpc?: number;
    intent?: string;
    source?: string;
    competitorDomain?: string;
    rankingUrl?: string;
    rank?: number;
  }
): Promise<{
  success: boolean;
  error?: string;
  scheduledDate?: string;
  keywordId?: string;
  keywordStatus?: string;
  keyword?: any;
  calendarEntry?: any;
}> {
  const user = await currentUser();
  if (!user) return { success: false, error: 'Not authenticated' };

  let finalKeywordId = keywordId;
  let keywordText = '';
  let secondaryKeywords: string[] = [];
  const phrase = (payload.keyword ?? '').trim().toLowerCase();
  const reqSource = payload.source === 'competitor' ? 'competitor' : 'organic';

  // If keywordId === "new", check if it exists first
  if (finalKeywordId === 'new') {
    if (!phrase) return { success: false, error: 'Keyword text is required' };

    const { data: existing, error: exErr } = await supabaseAdmin
      .from('keywords')
      .select('id, keyword, secondary_keywords')
      .eq('project_id', projectId)
      .eq('normalized_keyword', phrase)
      .eq('source', reqSource)
      .maybeSingle();

    if (exErr) return { success: false, error: exErr.message };

    if (existing) {
      finalKeywordId = existing.id;
      keywordText = existing.keyword;
      secondaryKeywords = existing.secondary_keywords ?? [];
    } else {
      if (reqSource !== 'competitor') {
        try {
          const { QuotaService } = await import("@/services/quota");
          await QuotaService.checkQuota(user.id, "keywords_fetched");
        } catch (qErr: any) {
          return {
            success: false,
            error: "You have reached your keyword limit. Please upgrade your plan or contact the administrator to fetch more keywords.",
          };
        }
      }

      const { data: project, error: pErr } = await supabaseAdmin
        .from('projects')
        .select('id')
        .eq('id', projectId)
        .eq('user_id', user.id)
        .single();

      if (pErr || !project) return { success: false, error: 'Project not found or unauthorized' };

      let insertPayload = buildKeywordUpsertPayload(projectId, payload, false);
      let { data: newKw, error: insErr } = await supabaseAdmin
        .from('keywords')
        .insert(insertPayload)
        .select('id, keyword, secondary_keywords')
        .single();

      if (insErr && insErr.message.includes('funnel_stage') && insErr.message.includes('schema cache')) {
        console.warn('[scheduleKeyword] funnel_stage schema cache error caught, retrying with schemaSafe=true');
        insertPayload = buildKeywordUpsertPayload(projectId, payload, true);
        ({ data: newKw, error: insErr } = await supabaseAdmin
          .from('keywords')
          .insert(insertPayload)
          .select('id, keyword, secondary_keywords')
          .single());
      }

      if (insErr || !newKw) {
        console.error('[scheduleKeyword] upsert competitor keyword failed:', insErr?.message);
        return { success: false, error: insErr?.message ?? 'Failed to save keyword' };
      }

      finalKeywordId = newKw.id;
      keywordText = newKw.keyword;
      secondaryKeywords = newKw.secondary_keywords ?? [];
    }
  } else {
    // keywordId exists
    const { data: keyword, error: kwErr } = await supabaseAdmin
      .from('keywords')
      .select('id, project_id, keyword, secondary_keywords, projects!inner(user_id)')
      .eq('id', finalKeywordId)
      .eq('projects.user_id', user.id)
      .single();

    if (kwErr || !keyword) {
      return { success: false, error: 'Keyword not found or unauthorized' };
    }
    if (projectId && String(keyword.project_id) !== String(projectId)) {
      return { success: false, error: 'Keyword not found or unauthorized' };
    }

    keywordText = keyword.keyword;
    secondaryKeywords = keyword.secondary_keywords ?? [];

    // Ensure status is marked as approved in DB and source matches correctly
    const { error: updateErr } = await supabaseAdmin
      .from('keywords')
      .update({ status: 'approved', source: reqSource })
      .eq('id', finalKeywordId);

    if (updateErr) {
      console.error('[scheduleKeyword] failed to approve existing keyword:', updateErr.message);
      return { success: false, error: updateErr.message };
    }
  }

  const isCompetitor = payload.source === 'competitor';
  const aiSource = isCompetitor ? 'competitor keyword' : 'organic keyword';

  // Avoid duplicates: check if this keyword or its normalized form is already scheduled with the same source
  const { data: existingEntry } = await supabaseAdmin
    .from('calendar_entries')
    .select('id, scheduled_date')
    .eq('project_id', projectId)
    .eq('keyword_id', finalKeywordId)
    .eq('ai_source', aiSource)
    .maybeSingle();

  if (existingEntry) {
    return {
      success: false,
      error: 'Keyword already scheduled',
      scheduledDate: String(existingEntry.scheduled_date).slice(0, 10),
    };
  }

  // Trigger background enrichment as usual
  void enrichKeywordInBackground(finalKeywordId);

  // Find next available empty calendar date
  const dates = await collectEarliestVacantDates(projectId, 1);
  const scheduledDate = dates[0];
  if (!scheduledDate) {
    return { success: false, error: 'No free calendar day found in the next 500 days.' };
  }

  const articleType = CONTENT_TYPE_ARTICLE_TYPE[payload.contentType as keyof typeof CONTENT_TYPE_ARTICLE_TYPE] || 'Blog article';
  const title = keywordText.trim() || 'Scheduled topic';
  const slug = keywordText
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);

  const { data: calendarEntry, error: insertErr } = await supabaseAdmin
    .from('calendar_entries')
    .insert({
      project_id: projectId,
      keyword_id: finalKeywordId,
      scheduled_date: scheduledDate,
      title: title,
      article_type: articleType,
      slug: slug,
      focus_keyword: keywordText,
      secondary_keywords: secondaryKeywords,
      status: 'scheduled',
      ai_source: aiSource,
    })
    .select()
    .single();

  if (insertErr) {
    console.error('[scheduleKeyword] failed to create calendar entry:', insertErr.message);
    return { success: false, error: insertErr.message };
  }

  const { data: keywordRow } = await supabaseAdmin
    .from('keywords')
    .select('*')
    .eq('id', finalKeywordId)
    .single();

  return {
    success: true,
    scheduledDate,
    keywordId: finalKeywordId,
    keywordStatus: 'approved',
    keyword: keywordRow,
    calendarEntry,
  };
}
