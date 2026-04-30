/**
 * Keyword modal data layer.
 *
 * Lazy-loaded payload for the per-keyword drilldown modal. Implements the
 * 7-day cache + parallel Ahrefs fan-out specified in the product brief.
 *
 *   GET /api/projects/:projectId/keywords/:keywordId/details
 *     → keyword_details cache hit (≤ 7 days)  → return cached
 *     → cache miss / stale / forceRefresh    → fan out 8 Ahrefs calls in
 *       parallel, persist to keyword_details + keyword_ideas, return shape
 *
 * The same orchestrator (`getOrFetchKeywordModalDetails`) is used by the
 * route handler for live requests AND by `enrichKeywordInBackground` —
 * fired-and-forgotten when a keyword is approved so blog-generation has
 * matching/questions/related ideas already cached.
 *
 * All Ahrefs calls already return `[]` / `null` when AHREFS_API_KEY is
 * missing or the request fails (see `ahrefs.ts#ahrefsGet`), so this module
 * never has to wrap individual fetches in try/catch — it just degrades to
 * empty payloads gracefully.
 */

import { supabaseAdmin } from './supabase';
import {
  ahrefsKeywordOverview,
  ahrefsKeywordOverviewDetail,
  ahrefsMatchingTermsAll,
  ahrefsMatchingTermsQuestions,
  ahrefsRelatedAlsoRankFor,
  ahrefsRelatedAlsoTalkAbout,
  ahrefsSerpOverview,
  ahrefsVolumeByCountry,
  ahrefsVolumeHistory,
  isAhrefsConfigured,
  type AhrefsKeywordIdea,
  type AhrefsKeywordOverviewDetailRow,
  type AhrefsSerpFeature,
  type AhrefsSerpPosition,
} from './ahrefs';
import type {
  KeywordIdeaType,
  KeywordIntents,
  KeywordSerpFeature,
  KeywordSerpResult,
  KeywordVolumeByCountry,
  KeywordVolumeHistoryPoint,
} from './types';

// ─────────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────────

/** A single idea row returned to the UI. CPC is in **dollars** (already converted). */
export interface KeywordIdeaPayload {
  keyword: string;
  volume: number;
  difficulty: number | null;
  cpc: number | null;
  trafficPotential: number | null;
  intents: KeywordIntents | null;
  parentTopic: string | null;
}

export interface KeywordModalOverview {
  volume: number;
  globalVolume: number | null;
  difficulty: number | null;
  /** **Dollars**, converted from Ahrefs cents. UI renders as-is. */
  cpc: number | null;
  parentTopic: string | null;
  parentVolume: number | null;
  trafficPotential: number | null;
  intents: KeywordIntents | null;
  serpFeatures: KeywordSerpFeature[];
}

export interface KeywordModalResponse {
  keyword: string;
  overview: KeywordModalOverview;
  volumeHistory: KeywordVolumeHistoryPoint[];
  volumeByCountry: KeywordVolumeByCountry[];
  topRankingResult: KeywordSerpResult | null;
  serpTopResults: KeywordSerpResult[];
  ideas: {
    termsMatch: KeywordIdeaPayload[];
    questions: KeywordIdeaPayload[];
    alsoRankFor: KeywordIdeaPayload[];
    alsoTalkAbout: KeywordIdeaPayload[];
  };
  /** True when this response was served from `keyword_details` cache. */
  fromCache: boolean;
  lastFetchedAt: string;
}

export interface ModalFetchOptions {
  keywordId: string;
  /** Used for project-row → region lookup; required for cache-miss path. */
  projectId: string;
  /** Force a fresh Ahrefs fetch even when the cache is < 7 days old. */
  forceRefresh?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tunables
// ─────────────────────────────────────────────────────────────────────────────

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const VOLUME_HISTORY_MONTHS = 24;
const VOLUME_BY_COUNTRY_LIMIT = 10;
const IDEAS_PER_TYPE_LIMIT = 20;
const SERP_TOP_POSITIONS = 10;

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns the modal payload for a keyword. Does NOT validate ownership —
 * that is the route handler's job.
 *
 * Uses the cache when:
 *   • `keyword_details` row exists for the keyword AND
 *   • `last_fetched_at` is within the last 7 days AND
 *   • `forceRefresh` is not set.
 *
 * On a miss/stale/forced run, fans out 8 Ahrefs calls in parallel, persists
 * the result, then returns the shaped response.
 */
export async function getOrFetchKeywordModalDetails(
  opts: ModalFetchOptions
): Promise<KeywordModalResponse> {
  const { keywordId, projectId, forceRefresh = false } = opts;
  console.log('[keyword-modal] start', { keywordId, projectId, forceRefresh });

  // Load the keyword row + the project's target_region.
  const { data: keywordRow, error: kwErr } = await supabaseAdmin
    .from('keywords')
    .select('id, project_id, keyword, projects!inner(target_region)')
    .eq('id', keywordId)
    .eq('project_id', projectId)
    .single();
  if (kwErr || !keywordRow) {
    throw new Error(kwErr?.message ?? 'Keyword not found');
  }
  const keyword: string = (keywordRow.keyword as string).trim();
  // Supabase's typed inner-join returns the related row as either a single
  // object or an array depending on the codegen path. Treat both shapes.
  const projectsRel = (keywordRow as { projects?: { target_region?: string } | { target_region?: string }[] }).projects;
  const region: string =
    Array.isArray(projectsRel)
      ? projectsRel[0]?.target_region ?? 'us'
      : projectsRel?.target_region ?? 'us';

  // Cache lookup.
  if (!forceRefresh) {
    const cached = await readCachedDetails(keywordId);
    if (cached && isFresh(cached.last_fetched_at)) {
      console.log('[keyword-modal] cache hit', {
        keywordId,
        last_fetched_at: cached.last_fetched_at,
      });
      const ideas = await readIdeas(keywordId);
      return shapeFromCache(keyword, cached, ideas);
    }
  }

  if (!isAhrefsConfigured()) {
    console.warn('[keyword-modal] AHREFS_API_KEY missing — returning empty payload (no persist).');
    return emptyResponse(keyword);
  }

  // Cache miss / stale / forced — fan out.
  console.log('[keyword-modal] fetching fresh', { keywordId, region });
  const fresh = await fetchFresh(keyword, region);

  // Persist (best-effort; failures here are logged but never thrown back to the
  // user — a partial cache is better than none, and the client got its data).
  await persistFresh({ keywordId, projectId, keyword, fresh }).catch(e => {
    console.error('[keyword-modal] persist failed:', e);
  });

  return shapeFromFresh(keyword, fresh);
}

/**
 * Fire-and-forget enrichment. Called from `updateKeywordStatus` /
 * `bulkUpdateKeywordStatus` when a keyword is approved so the modal
 * + blog-generation has cached ideas before the user clicks anything.
 *
 * Errors are swallowed — this is best-effort warming; never blocks the user
 * action that triggered it.
 */
export async function enrichKeywordInBackground(
  keywordId: string
): Promise<void> {
  try {
    const { data: row, error } = await supabaseAdmin
      .from('keywords')
      .select('id, project_id')
      .eq('id', keywordId)
      .single();
    if (error || !row) {
      console.warn('[keyword-modal:bg] keyword not found, skipping', keywordId);
      return;
    }
    await getOrFetchKeywordModalDetails({
      keywordId: row.id,
      projectId: row.project_id,
      forceRefresh: false,
    });
    console.log('[keyword-modal:bg] enrichment done', { keywordId });
  } catch (e) {
    console.warn('[keyword-modal:bg] enrichment failed:', e);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Cache I/O
// ─────────────────────────────────────────────────────────────────────────────

interface CachedDetail {
  overview: AhrefsKeywordOverviewDetailRow | null;
  volume_history: KeywordVolumeHistoryPoint[];
  volume_by_country: KeywordVolumeByCountry[];
  serp_top_results: KeywordSerpResult[];
  top_ranking_result: KeywordSerpResult | null;
  parent_volume: number | null;
  last_fetched_at: string;
}

async function readCachedDetails(keywordId: string): Promise<CachedDetail | null> {
  const { data, error } = await supabaseAdmin
    .from('keyword_details')
    .select(
      'overview, volume_history, volume_by_country, serp_top_results, top_ranking_result, last_fetched_at'
    )
    .eq('keyword_id', keywordId)
    .maybeSingle();
  if (error) {
    console.warn('[keyword-modal] readCachedDetails error:', error.message);
    return null;
  }
  if (!data) return null;
  // `parent_volume` is a column on `keywords`, not `keyword_details`; we treat
  // it as a join-time enrichment further down. Read it lazily from `keywords`
  // when we have time, but the cached path doesn't need it for correctness.
  return {
    overview: (data.overview as AhrefsKeywordOverviewDetailRow | null) ?? null,
    volume_history: (data.volume_history as KeywordVolumeHistoryPoint[] | null) ?? [],
    volume_by_country: (data.volume_by_country as KeywordVolumeByCountry[] | null) ?? [],
    serp_top_results: (data.serp_top_results as KeywordSerpResult[] | null) ?? [],
    top_ranking_result: (data.top_ranking_result as KeywordSerpResult | null) ?? null,
    parent_volume: null,
    last_fetched_at: data.last_fetched_at as string,
  };
}

function isFresh(lastFetchedAt: string): boolean {
  const ts = new Date(lastFetchedAt).getTime();
  if (!Number.isFinite(ts)) return false;
  return Date.now() - ts < CACHE_TTL_MS;
}

interface IdeasByType {
  termsMatch: KeywordIdeaPayload[];
  questions: KeywordIdeaPayload[];
  alsoRankFor: KeywordIdeaPayload[];
  alsoTalkAbout: KeywordIdeaPayload[];
}

async function readIdeas(keywordId: string): Promise<IdeasByType> {
  const empty: IdeasByType = {
    termsMatch: [],
    questions: [],
    alsoRankFor: [],
    alsoTalkAbout: [],
  };
  const { data, error } = await supabaseAdmin
    .from('keyword_ideas')
    .select('type, keyword, volume, difficulty, cpc, traffic_potential, intents, parent_topic')
    .eq('keyword_id', keywordId)
    .order('volume', { ascending: false });
  if (error) {
    console.warn('[keyword-modal] readIdeas error:', error.message);
    return empty;
  }
  for (const row of data ?? []) {
    const payload: KeywordIdeaPayload = {
      keyword: (row.keyword as string) || '',
      volume: Number(row.volume ?? 0),
      difficulty: row.difficulty != null ? Number(row.difficulty) : null,
      cpc: row.cpc != null ? Number(row.cpc) : null,
      trafficPotential: row.traffic_potential != null ? Number(row.traffic_potential) : null,
      intents: (row.intents as KeywordIntents | null) ?? null,
      parentTopic: (row.parent_topic as string | null) ?? null,
    };
    const t = row.type as KeywordIdeaType;
    if (t === 'terms_match') empty.termsMatch.push(payload);
    else if (t === 'questions') empty.questions.push(payload);
    else if (t === 'also_rank_for') empty.alsoRankFor.push(payload);
    else if (t === 'also_talk_about') empty.alsoTalkAbout.push(payload);
    // `search_suggestion` rows are persisted but not returned in the modal
    // response per the spec; the blog pipeline reads them separately.
  }
  return empty;
}

// ─────────────────────────────────────────────────────────────────────────────
// Fresh fetch
// ─────────────────────────────────────────────────────────────────────────────

interface FreshBundle {
  overview: AhrefsKeywordOverviewDetailRow | null;
  parentVolume: number | null;
  volumeHistory: KeywordVolumeHistoryPoint[];
  volumeByCountry: KeywordVolumeByCountry[];
  serpTopResults: KeywordSerpResult[];
  topRankingResult: KeywordSerpResult | null;
  termsMatch: AhrefsKeywordIdea[];
  questions: AhrefsKeywordIdea[];
  alsoRankFor: AhrefsKeywordIdea[];
  alsoTalkAbout: AhrefsKeywordIdea[];
}

async function fetchFresh(keyword: string, region: string): Promise<FreshBundle> {
  const { dateFrom, dateTo } = monthRange(VOLUME_HISTORY_MONTHS);

  const started = Date.now();

  // 8 parallel Ahrefs calls. Each returns `[]` / `null` on failure (already
  // handled inside `ahrefsGet`), so any individual failure degrades the
  // bundle but never throws.
  const [
    overview,
    volumeHistory,
    volumeByCountry,
    termsMatch,
    questions,
    alsoRankFor,
    alsoTalkAbout,
    serpPositions,
  ] = await Promise.all([
    ahrefsKeywordOverviewDetail(keyword, region),
    ahrefsVolumeHistory(keyword, region, dateFrom, dateTo),
    ahrefsVolumeByCountry(keyword, VOLUME_BY_COUNTRY_LIMIT),
    ahrefsMatchingTermsAll(keyword, region, IDEAS_PER_TYPE_LIMIT),
    ahrefsMatchingTermsQuestions(keyword, region, IDEAS_PER_TYPE_LIMIT),
    ahrefsRelatedAlsoRankFor(keyword, region, IDEAS_PER_TYPE_LIMIT),
    ahrefsRelatedAlsoTalkAbout(keyword, region, IDEAS_PER_TYPE_LIMIT),
    ahrefsSerpOverview(keyword, region, SERP_TOP_POSITIONS),
  ]);

  // Optional 9th call: parent_topic's own search volume — only when the
  // overview tells us about a parent we can look up cheaply. Skipped when the
  // parent is empty or identical to the keyword (avoids a wasted unit).
  let parentVolume: number | null = null;
  const parent = (overview?.parent_topic ?? '').trim().toLowerCase();
  if (parent && parent !== keyword.trim().toLowerCase()) {
    try {
      const parentMap = await ahrefsKeywordOverview([parent], region);
      const row = parentMap.get(parent);
      parentVolume = row?.volume ?? null;
    } catch (e) {
      console.warn('[keyword-modal] parent-topic lookup failed:', e);
    }
  }

  const serpTopResults = serpPositions.map(serpToResult);
  const topRankingResult = serpTopResults.length
    ? [...serpTopResults].sort((a, b) => a.position - b.position)[0]
    : null;

  console.log('[keyword-modal] fresh bundle', {
    keyword,
    region,
    ms: Date.now() - started,
    overview_present: Boolean(overview),
    parent_volume: parentVolume,
    volume_history: volumeHistory.length,
    volume_by_country: volumeByCountry.length,
    serp_top: serpTopResults.length,
    ideas: {
      terms_match: termsMatch.length,
      questions: questions.length,
      also_rank_for: alsoRankFor.length,
      also_talk_about: alsoTalkAbout.length,
    },
  });

  return {
    overview,
    parentVolume,
    volumeHistory,
    volumeByCountry,
    serpTopResults,
    topRankingResult,
    termsMatch,
    questions,
    alsoRankFor,
    alsoTalkAbout,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Persistence
// ─────────────────────────────────────────────────────────────────────────────

interface PersistArgs {
  keywordId: string;
  projectId: string;
  keyword: string;
  fresh: FreshBundle;
}

async function persistFresh(args: PersistArgs): Promise<void> {
  const { keywordId, keyword, fresh } = args;

  const hasAnything =
    fresh.overview ||
    fresh.volumeHistory.length ||
    fresh.volumeByCountry.length ||
    fresh.serpTopResults.length ||
    fresh.termsMatch.length ||
    fresh.questions.length ||
    fresh.alsoRankFor.length ||
    fresh.alsoTalkAbout.length;
  if (!hasAnything) {
    // Don't stamp last_fetched_at — let the next page load retry, since
    // we got literally nothing back.
    console.log('[keyword-modal] empty bundle — skipping persist for', keywordId);
    return;
  }

  // 1. Upsert the modal payload.
  const detailRow = {
    keyword_id: keywordId,
    overview: fresh.overview ?? {},
    volume_history: fresh.volumeHistory,
    volume_by_country: fresh.volumeByCountry,
    serp_top_results: fresh.serpTopResults,
    top_ranking_result: fresh.topRankingResult ?? null,
    last_fetched_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  const { error: detailErr } = await supabaseAdmin
    .from('keyword_details')
    .upsert(detailRow, { onConflict: 'keyword_id' });
  if (detailErr) {
    console.warn('[keyword-modal] keyword_details upsert error:', detailErr.message);
  }

  // 2. Replace `keyword_ideas` for this keyword. Simpler than diffing, and
  //    exactly what blog generation wants: the latest snapshot, no leftovers.
  const { error: delErr } = await supabaseAdmin
    .from('keyword_ideas')
    .delete()
    .eq('keyword_id', keywordId);
  if (delErr) {
    console.warn('[keyword-modal] keyword_ideas delete error:', delErr.message);
  }

  const ideaRows = [
    ...fresh.termsMatch.map(i => ideaToRow(keywordId, i, 'terms_match')),
    ...fresh.questions.map(i => ideaToRow(keywordId, i, 'questions')),
    ...fresh.alsoRankFor.map(i => ideaToRow(keywordId, i, 'also_rank_for')),
    ...fresh.alsoTalkAbout.map(i => ideaToRow(keywordId, i, 'also_talk_about')),
  ];
  if (ideaRows.length) {
    const { error: insErr } = await supabaseAdmin.from('keyword_ideas').insert(ideaRows);
    if (insErr) {
      console.warn('[keyword-modal] keyword_ideas insert error:', insErr.message);
    }
  }

  // 3. Update the `keywords` row with anything the overview clarified — but
  //    only for fields currently empty/zero, so we never overwrite a manual
  //    correction or a more accurate value from another pipeline pass.
  const ov = fresh.overview;
  if (ov) {
    const patch: Record<string, unknown> = {};
    const { data: current } = await supabaseAdmin
      .from('keywords')
      .select(
        'volume, kd, cpc, intent, intents, parent_topic, traffic_potential, global_volume, parent_volume, serp_features'
      )
      .eq('id', keywordId)
      .single();
    if (current) {
      if (!current.volume && ov.volume) patch.volume = Math.round(ov.volume);
      if (!current.kd && ov.difficulty != null) patch.kd = Math.round(ov.difficulty);
      if (!current.cpc && ov.cpc != null) patch.cpc = centsToDollars(ov.cpc);
      if (!current.intent && ov.intents) patch.intent = inferDominantIntent(ov.intents);
      if (
        (!current.intents || Object.keys(current.intents as object).length === 0) &&
        ov.intents
      ) {
        patch.intents = ov.intents;
      }
      if (!current.parent_topic && ov.parent_topic) patch.parent_topic = ov.parent_topic;
      if (!current.traffic_potential && ov.traffic_potential != null) {
        patch.traffic_potential = Math.round(ov.traffic_potential);
      }
      if (!current.global_volume && ov.global_volume != null) {
        patch.global_volume = Math.round(ov.global_volume);
      }
      if (!current.parent_volume && fresh.parentVolume != null) {
        patch.parent_volume = Math.round(fresh.parentVolume);
      }
      const existingFeatures = (current.serp_features as unknown[] | null) ?? [];
      if (existingFeatures.length === 0 && ov.serp_features?.length) {
        patch.serp_features = ov.serp_features;
      }
    }
    if (Object.keys(patch).length) {
      patch.updated_at = new Date().toISOString();
      const { error: kwErr } = await supabaseAdmin
        .from('keywords')
        .update(patch)
        .eq('id', keywordId);
      if (kwErr) {
        console.warn('[keyword-modal] keywords update error:', kwErr.message);
      } else {
        console.log('[keyword-modal] backfilled keyword fields', {
          keyword,
          fields: Object.keys(patch),
        });
      }
    }
  }
}

function ideaToRow(keywordId: string, i: AhrefsKeywordIdea, type: KeywordIdeaType) {
  return {
    keyword_id: keywordId,
    type,
    keyword: i.keyword,
    volume: Math.max(0, Math.round(i.volume || 0)),
    difficulty: i.difficulty != null ? Math.round(i.difficulty) : 0,
    // Ahrefs CPC is cents → store as dollars for app-wide consistency
    // (`keywords.cpc` is also dollars).
    cpc: i.cpc != null ? centsToDollars(i.cpc) : 0,
    traffic_potential: 0, // not exposed on the matching/related rows; left at 0
    intents: i.intents ?? {},
    parent_topic: '',
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Shaping
// ─────────────────────────────────────────────────────────────────────────────

function shapeFromCache(
  keyword: string,
  cached: CachedDetail,
  ideas: IdeasByType
): KeywordModalResponse {
  const ov = cached.overview;
  const overview: KeywordModalOverview = {
    volume: ov ? Math.round(ov.volume || 0) : 0,
    globalVolume: ov?.global_volume ?? null,
    difficulty: ov?.difficulty ?? null,
    cpc: ov?.cpc != null ? centsToDollars(ov.cpc) : null,
    parentTopic: ov?.parent_topic ?? null,
    parentVolume: cached.parent_volume,
    trafficPotential: ov?.traffic_potential ?? null,
    intents: (ov?.intents as KeywordIntents | null) ?? null,
    serpFeatures: (ov?.serp_features as KeywordSerpFeature[] | null) ?? [],
  };
  return {
    keyword,
    overview,
    volumeHistory: cached.volume_history,
    volumeByCountry: cached.volume_by_country,
    topRankingResult: cached.top_ranking_result,
    serpTopResults: cached.serp_top_results,
    ideas,
    fromCache: true,
    lastFetchedAt: cached.last_fetched_at,
  };
}

function shapeFromFresh(keyword: string, fresh: FreshBundle): KeywordModalResponse {
  const ov = fresh.overview;
  const overview: KeywordModalOverview = {
    volume: ov ? Math.round(ov.volume || 0) : 0,
    globalVolume: ov?.global_volume ?? null,
    difficulty: ov?.difficulty ?? null,
    cpc: ov?.cpc != null ? centsToDollars(ov.cpc) : null,
    parentTopic: ov?.parent_topic ?? null,
    parentVolume: fresh.parentVolume,
    trafficPotential: ov?.traffic_potential ?? null,
    intents: (ov?.intents as KeywordIntents | null) ?? null,
    serpFeatures: (ov?.serp_features as KeywordSerpFeature[] | null) ?? [],
  };
  return {
    keyword,
    overview,
    volumeHistory: fresh.volumeHistory,
    volumeByCountry: fresh.volumeByCountry,
    topRankingResult: fresh.topRankingResult,
    serpTopResults: fresh.serpTopResults,
    ideas: {
      termsMatch: fresh.termsMatch.map(ideaToPayload),
      questions: fresh.questions.map(ideaToPayload),
      alsoRankFor: fresh.alsoRankFor.map(ideaToPayload),
      alsoTalkAbout: fresh.alsoTalkAbout.map(ideaToPayload),
    },
    fromCache: false,
    lastFetchedAt: new Date().toISOString(),
  };
}

function ideaToPayload(i: AhrefsKeywordIdea): KeywordIdeaPayload {
  return {
    keyword: i.keyword,
    volume: Math.round(i.volume || 0),
    difficulty: i.difficulty,
    cpc: i.cpc != null ? centsToDollars(i.cpc) : null,
    trafficPotential: null,
    intents: (i.intents as KeywordIntents | null) ?? null,
    parentTopic: null,
  };
}

function emptyResponse(keyword: string): KeywordModalResponse {
  return {
    keyword,
    overview: {
      volume: 0,
      globalVolume: null,
      difficulty: null,
      cpc: null,
      parentTopic: null,
      parentVolume: null,
      trafficPotential: null,
      intents: null,
      serpFeatures: [],
    },
    volumeHistory: [],
    volumeByCountry: [],
    topRankingResult: null,
    serpTopResults: [],
    ideas: { termsMatch: [], questions: [], alsoRankFor: [], alsoTalkAbout: [] },
    fromCache: false,
    lastFetchedAt: new Date().toISOString(),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Pure helpers
// ─────────────────────────────────────────────────────────────────────────────

function monthRange(months: number): { dateFrom: string; dateTo: string } {
  const today = new Date();
  const to = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const from = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - months, today.getUTCDate())
  );
  return {
    dateFrom: from.toISOString().slice(0, 10),
    dateTo: to.toISOString().slice(0, 10),
  };
}

function serpToResult(p: AhrefsSerpPosition): KeywordSerpResult {
  return {
    position: p.position,
    url: p.url,
    title: p.title,
    domain: p.domain,
    domain_rating: p.domain_rating,
    url_rating: p.url_rating,
    traffic: p.traffic,
    refdomains: p.refdomains,
  };
}

function inferDominantIntent(intents: KeywordIntents | null | undefined): string {
  if (!intents) return '';
  if (intents.transactional) return 'transactional';
  if (intents.commercial) return 'commercial';
  if (intents.informational) return 'informational';
  if (intents.navigational) return 'navigational';
  return '';
}

function centsToDollars(cents: number | null | undefined): number {
  if (cents == null || !Number.isFinite(Number(cents))) return 0;
  return Math.round(Number(cents)) / 100;
}

// Re-export type so route handlers can `import { type AhrefsSerpFeature }` if
// they need it without reaching into ahrefs.ts.
export type { AhrefsSerpFeature };
