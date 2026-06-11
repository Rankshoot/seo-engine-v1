/**
 * Provider-routed keyword research service.
 *
 * Front door for "give me a list of keyword ideas + their volume / KD / CPC
 * for these seeds in this region". The same call shape works regardless of
 * which upstream API actually answered:
 *
 *   import { getKeywordResearchData } from '@/lib/keyword-research';
 *
 *   const result = await getKeywordResearchData({
 *     seeds: ['software engineering hiring', 'tech recruitment'],
 *     region: 'us',
 *     limit: 100,
 *   });
 *   //  result.provider           = 'ahrefs' | 'dataforseo'
 *   //  result.keywords           = NormalizedKeyword[] (same shape both ways)
 *   //  result.fellBackToDataForSEO = true if Ahrefs failed/empty
 *
 * Routing:
 *   1. Try Ahrefs (primary). matching-terms + related-terms +
 *      search-suggestions fan out in parallel; results merged.
 *   2. If Ahrefs is misconfigured, returns a transport error (auth /
 *      rate-limit / quota / network), or yields an empty merged set, we
 *      log the reason and call DataForSEO (`keyword_ideas/live` +
 *      `related_keywords/live`).
 *   3. Final result is returned with a `provider` discriminator + `trace`
 *      array describing every upstream call we made (mirrors the existing
 *      `discoveryTrace` pattern exposed to the keywords page so the
 *      browser's DevTools can `console.log` exactly what happened).
 *
 * Both branches normalise into the same `NormalizedKeyword` shape:
 *   - `volume`         monthly search volume (0 when unknown)
 *   - `difficulty`     0–100 KD (null when unknown)
 *   - `cpc`            USD dollars (already converted from Ahrefs cents)
 *   - `intent`         single-string dominant intent
 *   - `intents`        multi-flag bag (Ahrefs only; null for DataForSEO)
 *   - `monthlySearches` last-12-months breakdown (DataForSEO only; [] for Ahrefs)
 *
 * NOTE on scope: this module focuses on the **research** flow used by the
 * keywords page (`discoverKeywordsForProject`). Site-Explorer competitor
 * mining (`runKeywordDiscovery`) and the per-keyword modal still use Ahrefs
 * directly — they're different products with different data shapes.
 */

import { locationCodeFromTargetRegion, type KeywordIntents } from './types';
import {
  ahrefsGetVerbose,
  isAhrefsConfigured,
  type AhrefsCallResult,
  type AhrefsErrorReason,
  type AhrefsIntentObject,
  type AhrefsKeywordIdea,
} from './ahrefs';
import { fetchGoogleAdsKeywordsForSite } from './dataforseo';

// ─────────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────────

export type KeywordIntent =
  | 'informational'
  | 'commercial'
  | 'navigational'
  | 'transactional'
  | '';

export type KeywordResearchProvider = 'ahrefs' | 'dataforseo';

export interface KeywordResearchInput {
  /** Seed phrases (lower-case, untrimmed input is OK — we clean up). */
  seeds: string[];
  /** Internal region code, e.g. `us`, `uk`, `in`. Forwarded to both providers. */
  region: string;
  /** Per-endpoint cap. Defaults to 100. Total returned can be higher (merged). */
  limit?: number;
  /** Soft cap on the merged result returned to the caller. Defaults to 200. */
  maxResults?: number;
  /** Forwarded to DataForSEO; Ahrefs ignores it. Defaults to `en`. */
  language?: string;
  /** Last volume for matching terms keyset pagination */
  matchingLastVolume?: number;
  /** Last volume for related terms keyset pagination */
  relatedLastVolume?: number;
  /** Whether to query matching terms */
  queryMatching?: boolean;
  /** Whether to query related terms */
  queryRelated?: boolean;
  /** When provided (DataForSEO path only), domain keywords are fetched live and merged with industry keywords. */
  targetDomain?: string;
}

/**
 * Single keyword in the unified research response. Both Ahrefs and DataForSEO
 * branches populate the same fields; provider-specific extras (intents bag,
 * monthly_searches, …) are populated when available and left empty otherwise.
 */
export interface NormalizedKeyword {
  keyword: string;
  volume: number;
  /** 0–100; `null` when the upstream did not return KD. */
  difficulty: number | null;
  /** USD dollars. Ahrefs CPC arrives in cents and is converted here. */
  cpc: number | null;
  intent: KeywordIntent;
  /** Multi-intent flag bag — Ahrefs only; `null` for DataForSEO. */
  intents: KeywordIntents | null;
  trafficPotential: number | null;
  parentTopic: string | null;
  /** Signed % string e.g. `+12%` / `-4%`. DataForSEO only. */
  trend: string;
  monthlySearches: { month: string; volume: number }[];
  /** Google Ads competition bucket. DataForSEO only. */
  competitionLevel: 'LOW' | 'MEDIUM' | 'HIGH' | '';
  source: KeywordResearchProvider;
  /** Which upstream endpoint produced this row (e.g. `matching_terms`). */
  endpoint: string;
}

/**
 * One upstream call captured for the trace. The browser's DevTools console
 * can log this and you'll see exactly which provider answered, in what time,
 * and why we fell back if we did.
 */
export interface KeywordResearchTraceEntry {
  ts: string;
  provider: KeywordResearchProvider;
  endpoint: string;
  ok: boolean;
  ms: number;
  rows: number;
  status?: number;
  errorReason?: string;
  errorMessage?: string;
  /** Set on the synthetic "falling back" entry. */
  fallbackReason?: string;
  query?: any;
  response?: any;
}

export interface KeywordResearchResult {
  /** Whichever provider's data we ended up returning. */
  provider: KeywordResearchProvider;
  /** True when we tried Ahrefs first and ended up with DataForSEO data. */
  fellBackToDataForSEO: boolean;
  /** Set when `fellBackToDataForSEO=true`. e.g. `quota_exhausted`, `empty`, `auth`. */
  fallbackReason?: string;
  keywords: NormalizedKeyword[];
  trace: KeywordResearchTraceEntry[];
  /** Pagination state for Ahrefs discovery */
  ahrefsDiscoveryState?: {
    matching_last_volume: number | null;
    matching_has_more: boolean;
    related_last_volume: number | null;
    related_has_more: boolean;
  };
}

/**
 * Thrown by `fetchKeywordsFromAhrefs` / `fetchKeywordsFromDataForSEO` when
 * the provider could not produce usable data. `getKeywordResearchData`
 * catches this and decides whether to fall back.
 */
export class KeywordProviderError extends Error {
  constructor(
    public provider: KeywordResearchProvider,
    public reason: string,
    message: string,
    public trace: KeywordResearchTraceEntry[] = []
  ) {
    super(message);
    this.name = 'KeywordProviderError';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared helpers
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_LIMIT = 100;
const DEFAULT_MAX_RESULTS = 200;

function nowISO(): string {
  return new Date().toISOString();
}

function cleanSeeds(seeds: string[]): string[] {
  return [
    ...new Set(
      seeds
        .map(s => (s ?? '').toString().trim().toLowerCase())
        .filter(Boolean)
    ),
  ].slice(0, 80);
}

function ahrefsCountry(regionCode: string): string {
  const code = (regionCode || 'us').toLowerCase();
  return code === 'uk' ? 'gb' : code;
}

function inferIntentFromAhrefs(intents: AhrefsIntentObject | null | undefined): KeywordIntent {
  if (!intents) return '';
  if (intents.transactional) return 'transactional';
  if (intents.commercial) return 'commercial';
  if (intents.informational) return 'informational';
  if (intents.navigational) return 'navigational';
  return '';
}

function normalizeIntentString(raw: string | null | undefined): KeywordIntent {
  const v = (raw ?? '').toLowerCase();
  if (
    v === 'informational' ||
    v === 'commercial' ||
    v === 'navigational' ||
    v === 'transactional'
  ) {
    return v;
  }
  return '';
}

function normalizeCompetitionLevel(raw: string | null | undefined): NormalizedKeyword['competitionLevel'] {
  const v = (raw ?? '').toUpperCase();
  if (v === 'LOW' || v === 'MEDIUM' || v === 'HIGH') return v;
  return '';
}

function formatTrend(pct: number | null | undefined): string {
  if (pct === null || pct === undefined || Number.isNaN(pct)) return '';
  const n = Math.round(pct);
  return n >= 0 ? `+${n}%` : `${n}%`;
}

function mergeKeywords(rows: NormalizedKeyword[]): NormalizedKeyword[] {
  const map = new Map<string, NormalizedKeyword>();
  for (const row of rows) {
    const key = row.keyword.toLowerCase();
    if (!key) continue;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, { ...row });
      continue;
    }
    if (row.volume > existing.volume) existing.volume = row.volume;
    if (existing.difficulty == null && row.difficulty != null) existing.difficulty = row.difficulty;
    if ((existing.cpc == null || existing.cpc === 0) && row.cpc != null) existing.cpc = row.cpc;
    if (!existing.intent && row.intent) existing.intent = row.intent;
    if (!existing.intents && row.intents) existing.intents = row.intents;
    if (existing.trafficPotential == null && row.trafficPotential != null) {
      existing.trafficPotential = row.trafficPotential;
    }
    if (!existing.parentTopic && row.parentTopic) existing.parentTopic = row.parentTopic;
    if (!existing.trend && row.trend) existing.trend = row.trend;
    if (!existing.monthlySearches.length && row.monthlySearches.length) {
      existing.monthlySearches = row.monthlySearches;
    }
    if (!existing.competitionLevel && row.competitionLevel) {
      existing.competitionLevel = row.competitionLevel;
    }
  }
  return [...map.values()].sort((a, b) => b.volume - a.volume);
}

function pushTrace(
  trace: KeywordResearchTraceEntry[],
  entry: Omit<KeywordResearchTraceEntry, 'ts'>
): void {
  trace.push({ ts: nowISO(), ...entry });
}

// ─────────────────────────────────────────────────────────────────────────────
// Ahrefs branch
// ─────────────────────────────────────────────────────────────────────────────

interface AhrefsIdeaRow {
  keyword?: string | null;
  volume?: number | null;
  difficulty?: number | null;
  cpc?: number | null;
  intents?: AhrefsIntentObject | null;
  parent_topic?: string | null;
  traffic_potential?: number | null;
}

const AHREFS_IDEA_SELECT = 'keyword,volume,difficulty,cpc,intents';

interface AhrefsResearchCall {
  endpoint: string;
  label: string;
  query: Record<string, string | number | boolean | undefined>;
}

function ahrefsResearchCalls(
  seeds: string[],
  region: string,
  limit: number,
  matchingLastVolume?: number,
  relatedLastVolume?: number,
  queryMatching = true,
  queryRelated = true
): AhrefsResearchCall[] {
  const country = ahrefsCountry(region);
  const keywordsParam = seeds.join(',');
  const calls: AhrefsResearchCall[] = [];

  if (queryMatching) {
    calls.push({
      endpoint: '/keywords-explorer/matching-terms',
      label: 'matching-terms',
      query: {
        country,
        keywords: keywordsParam,
        select: AHREFS_IDEA_SELECT,
        limit,
        where: matchingLastVolume != null ? JSON.stringify({ field: 'volume', is: ['lt', matchingLastVolume] }) : undefined,
        match_mode: 'terms',
        terms: 'all',
        order_by: 'volume:desc',
      },
    });
  }

  if (queryRelated) {
    calls.push({
      endpoint: '/keywords-explorer/related-terms',
      label: 'related-terms',
      query: {
        country,
        keywords: keywordsParam,
        select: AHREFS_IDEA_SELECT,
        limit,
        where: relatedLastVolume != null ? JSON.stringify({ field: 'volume', is: ['lt', relatedLastVolume] }) : undefined,
        view_for: 'top_10',
        terms: 'all',
        order_by: 'volume:desc',
      },
    });
  }

  return calls;
}

function ahrefsRowToNormalized(
  row: AhrefsIdeaRow | AhrefsKeywordIdea,
  endpoint: string
): NormalizedKeyword | null {
  const keyword = ((row.keyword ?? '') as string).trim().toLowerCase();
  if (!keyword) return null;
  const intents = (row.intents ?? null) as AhrefsIntentObject | null;
  const cpcCents = (row as AhrefsIdeaRow).cpc ?? null;
  const cpcDollars =
    cpcCents != null && Number.isFinite(Number(cpcCents))
      ? Math.round(Number(cpcCents)) / 100
      : null;
  return {
    keyword,
    volume: Number(row.volume ?? 0) || 0,
    difficulty: row.difficulty != null ? Math.round(Number(row.difficulty)) : null,
    cpc: cpcDollars,
    intent: inferIntentFromAhrefs(intents),
    intents,
    trafficPotential:
      (row as AhrefsIdeaRow).traffic_potential != null
        ? Math.round(Number((row as AhrefsIdeaRow).traffic_potential))
        : null,
    parentTopic: (row as AhrefsIdeaRow).parent_topic ?? null,
    trend: '',
    monthlySearches: [],
    competitionLevel: '',
    source: 'ahrefs',
    endpoint,
  };
}

/**
 * Primary provider. Calls Ahrefs Keywords Explorer's matching-terms and
 * related-terms endpoints in parallel and merges the results.
 * Emits pagination state `ahrefsDiscoveryState`.
 */
export async function fetchKeywordsFromAhrefs(
  input: KeywordResearchInput
): Promise<KeywordResearchResult> {
  const trace: KeywordResearchTraceEntry[] = [];
  const seeds = cleanSeeds(input.seeds);
  const limit = 20;
  const region = (input.region || 'us').toLowerCase();

  if (!seeds.length) {
    throw new KeywordProviderError('ahrefs', 'no_seeds', 'No seeds provided.', trace);
  }

  if (!isAhrefsConfigured()) {
    pushTrace(trace, {
      provider: 'ahrefs',
      endpoint: '(config)',
      ok: false,
      ms: 0,
      rows: 0,
      errorReason: 'no_api_key',
      errorMessage: 'AHREFS_API_KEY is not set',
    });
    throw new KeywordProviderError(
      'ahrefs',
      'no_api_key',
      'AHREFS_API_KEY is not configured.',
      trace
    );
  }

  const queryMatching = input.queryMatching !== false;
  const queryRelated = false; // Refrain from using related-terms

  const calls = ahrefsResearchCalls(
    seeds,
    region,
    limit,
    input.matchingLastVolume,
    input.relatedLastVolume,
    queryMatching,
    queryRelated
  );

  if (!calls.length) {
    return {
      provider: 'ahrefs',
      fellBackToDataForSEO: false,
      keywords: [],
      trace,
      ahrefsDiscoveryState: {
        matching_last_volume: input.matchingLastVolume ?? null,
        matching_has_more: false,
        related_last_volume: input.relatedLastVolume ?? null,
        related_has_more: false,
      },
    };
  }

  const results = await Promise.all(
    calls.map(call =>
      ahrefsGetVerbose<{ keywords?: AhrefsIdeaRow[] }>(call).then(
        (res): { call: AhrefsResearchCall; res: AhrefsCallResult<{ keywords?: AhrefsIdeaRow[] }> } => ({
          call,
          res,
        })
      )
    )
  );

  const merged: NormalizedKeyword[] = [];
  let anySuccess = false;
  /** First non-recoverable failure reason — used as the fallback signal. */
  let firstHardFailure: AhrefsErrorReason | undefined;

  let matchingLastVolume: number | null = input.matchingLastVolume ?? null;
  let relatedLastVolume: number | null = input.relatedLastVolume ?? null;
  let matchingHasMore = false;
  let relatedHasMore = false;

  for (const { call, res } of results) {
    pushTrace(trace, {
      provider: 'ahrefs',
      endpoint: `${call.endpoint} ${call.label}`,
      ok: res.ok,
      ms: res.ms,
      rows: res.rows,
      status: res.status,
      errorReason: res.errorReason,
      errorMessage: res.errorMessage,
      query: call.query,
      response: res.data,
    });
    if (!res.ok) {
      if (!firstHardFailure && res.errorReason) firstHardFailure = res.errorReason;
      continue;
    }
    anySuccess = true;
    const rows = res.data?.keywords ?? [];
    if (call.label === 'matching-terms') {
      matchingHasMore = rows.length === limit;
      if (rows.length > 0) {
        const lastRow = rows[rows.length - 1];
        matchingLastVolume = lastRow && lastRow.volume != null ? Number(lastRow.volume) : null;
        if (matchingLastVolume === 0 || matchingLastVolume === null) {
          matchingHasMore = false;
        }
      } else {
        matchingHasMore = false;
      }
    } else if (call.label === 'related-terms') {
      relatedHasMore = rows.length === limit;
      if (rows.length > 0) {
        const lastRow = rows[rows.length - 1];
        relatedLastVolume = lastRow && lastRow.volume != null ? Number(lastRow.volume) : null;
        if (relatedLastVolume === 0 || relatedLastVolume === null) {
          relatedHasMore = false;
        }
      } else {
        relatedHasMore = false;
      }
    }
    for (const row of rows) {
      const normalized = ahrefsRowToNormalized(row, call.label);
      if (normalized) merged.push(normalized);
    }
  }

  const finalMatchingHasMore = queryMatching ? matchingHasMore : false;
  const finalRelatedHasMore = queryRelated ? relatedHasMore : false;

  const ahrefsDiscoveryState = {
    matching_last_volume: finalMatchingHasMore ? matchingLastVolume : null,
    matching_has_more: finalMatchingHasMore,
    related_last_volume: finalRelatedHasMore ? relatedLastVolume : null,
    related_has_more: finalRelatedHasMore,
  };

  const keywords = mergeKeywords(merged);

  if (!anySuccess) {
    const reason = firstHardFailure ?? 'http_error';
    throw new KeywordProviderError(
      'ahrefs',
      reason,
      `Ahrefs returned no usable response (reason=${reason}).`,
      trace
    );
  }

  if (queryMatching && !keywords.length) {
    throw new KeywordProviderError(
      'ahrefs',
      'empty',
      'Ahrefs answered but yielded zero keywords.',
      trace
    );
  }

  console.log(
    `[keyword-research] ahrefs ok seeds=${seeds.length} keywords=${keywords.length} region=${region}`
  );

  return {
    provider: 'ahrefs',
    fellBackToDataForSEO: false,
    keywords: keywords.slice(0, input.maxResults ?? DEFAULT_MAX_RESULTS),
    trace,
    ahrefsDiscoveryState,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// DataForSEO branch
// ─────────────────────────────────────────────────────────────────────────────

function getDataForSEOAuth(): string | null {
  const login = process.env.DATAFORSEO_LOGIN;
  const password = process.env.DATAFORSEO_PASSWORD;
  if (!login || !password) return null;
  return `Basic ${Buffer.from(`${login}:${password}`).toString('base64')}`;
}

interface DfsMonthly {
  year: number;
  month: number;
  search_volume?: number | null;
}

interface DfsKeywordInfo {
  search_volume?: number | null;
  cpc?: number | string | null;
  competition_level?: string | null;
  search_volume_trend?: {
    monthly?: number | null;
    quarterly?: number | null;
    yearly?: number | null;
  } | null;
  monthly_searches?: DfsMonthly[] | null;
}

interface DfsItem {
  keyword?: string;
  keyword_info?: DfsKeywordInfo | null;
  keyword_properties?: { keyword_difficulty?: number | null } | null;
  search_intent_info?: { main_intent?: string | null } | null;
  keyword_data?: {
    keyword?: string;
    keyword_info?: DfsKeywordInfo | null;
    keyword_properties?: { keyword_difficulty?: number | null } | null;
    search_intent_info?: { main_intent?: string | null } | null;
  } | null;
}

function dfsItemToNormalized(item: DfsItem, endpoint: string): NormalizedKeyword | null {
  const nested = item.keyword_data ?? null;
  const keyword = ((item.keyword ?? nested?.keyword ?? '') as string).trim().toLowerCase();
  if (!keyword) return null;
  const info = (item.keyword_info ?? nested?.keyword_info ?? {}) as DfsKeywordInfo;
  const props = item.keyword_properties ?? nested?.keyword_properties ?? {};
  const intentInfo = item.search_intent_info ?? nested?.search_intent_info ?? {};
  const monthly = info.monthly_searches ?? [];
  const cpc = Number(info.cpc ?? 0);
  return {
    keyword,
    volume: Number(info.search_volume ?? 0) || 0,
    difficulty:
      props.keyword_difficulty != null
        ? Math.round(Number(props.keyword_difficulty))
        : null,
    cpc: Number.isFinite(cpc) && cpc > 0 ? cpc : null,
    intent: normalizeIntentString(intentInfo.main_intent),
    intents: null,
    trafficPotential: null,
    parentTopic: null,
    trend: formatTrend(info.search_volume_trend?.monthly),
    monthlySearches: monthly.slice(0, 12).map(m => ({
      month: `${m.year}-${String(m.month).padStart(2, '0')}`,
      volume: Number(m.search_volume ?? 0) || 0,
    })),
    competitionLevel: normalizeCompetitionLevel(info.competition_level),
    source: 'dataforseo',
    endpoint,
  };
}

interface DfsCallResult {
  ok: boolean;
  status: number;
  ms: number;
  rows: number;
  items: DfsItem[];
  errorMessage?: string;
}

async function dfsPostJson(
  endpoint: string,
  body: unknown,
  auth: string
): Promise<DfsCallResult> {
  const url = `https://api.dataforseo.com/v3/${endpoint}`;
  const started = Date.now();
  console.log('[dataforseo:request]', { endpoint, body });
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: auth, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const ms = Date.now() - started;
    const text = await res.text().catch(() => '');
    if (!res.ok) {
      console.warn(`[dataforseo] ${endpoint} -> ${res.status} in ${ms}ms ${text.slice(0, 200)}`);
      return {
        ok: false,
        status: res.status,
        ms,
        rows: 0,
        items: [],
        errorMessage: `${res.status} ${res.statusText} ${text.slice(0, 200)}`.trim(),
      };
    }
    type DfsResponse = { tasks?: Array<{ result?: Array<{ items?: DfsItem[] }> }> };
    let parsed: DfsResponse | null = null;
    try {
      parsed = text ? (JSON.parse(text) as DfsResponse) : null;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return { ok: false, status: res.status, ms, rows: 0, items: [], errorMessage: message };
    }
    const items = parsed?.tasks?.[0]?.result?.[0]?.items ?? [];
    console.log(`[dataforseo] ${endpoint} -> ${res.status} ${items.length} rows in ${ms}ms`);
    return { ok: true, status: res.status, ms, rows: items.length, items };
  } catch (e) {
    const ms = Date.now() - started;
    const message = e instanceof Error ? e.message : String(e);
    console.warn(`[dataforseo] ${endpoint} ERROR in ${ms}ms ${message}`);
    return { ok: false, status: 0, ms, rows: 0, items: [], errorMessage: message };
  }
}

/**
 * Fallback provider. Calls DataForSEO Labs `keyword_ideas/live` and
 * `related_keywords/live` and normalises both into the same shape Ahrefs
 * returns. Throws `KeywordProviderError` when DataForSEO is not configured
 * or both calls fail / return zero keywords.
 */
export async function fetchKeywordsFromDataForSEO(
  input: KeywordResearchInput
): Promise<KeywordResearchResult> {
  const trace: KeywordResearchTraceEntry[] = [];
  const seeds = cleanSeeds(input.seeds);
  const limit = Math.max(1, Math.min(input.limit ?? DEFAULT_LIMIT, 200));
  const region = (input.region || 'us').toLowerCase();
  const language = (input.language || 'en').toLowerCase();

  if (!seeds.length) {
    throw new KeywordProviderError('dataforseo', 'no_seeds', 'No seeds provided.', trace);
  }

  const auth = getDataForSEOAuth();
  if (!auth) {
    pushTrace(trace, {
      provider: 'dataforseo',
      endpoint: '(config)',
      ok: false,
      ms: 0,
      rows: 0,
      errorReason: 'no_api_key',
      errorMessage: 'DATAFORSEO_LOGIN / DATAFORSEO_PASSWORD missing',
    });
    throw new KeywordProviderError(
      'dataforseo',
      'no_api_key',
      'DataForSEO credentials are not configured.',
      trace
    );
  }

  const locationCode = locationCodeFromTargetRegion(region);

  // 1. Bulk seed → ideas (keyword_ideas/live).
  const ideasBody = [
    {
      keywords: seeds.slice(0, 200),
      location_code: locationCode,
      language_code: language,
      limit,
      include_seed_keyword: true,
      closely_variants: true,
      order_by: ['keyword_info.search_volume,desc'],
    },
  ];
  const ideasResult = await dfsPostJson(
    'dataforseo_labs/google/keyword_ideas/live',
    ideasBody,
    auth
  );
  pushTrace(trace, {
    provider: 'dataforseo',
    endpoint: 'dataforseo_labs/google/keyword_ideas/live',
    ok: ideasResult.ok,
    ms: ideasResult.ms,
    rows: ideasResult.rows,
    status: ideasResult.status,
    errorMessage: ideasResult.errorMessage,
  });

  // 2. Per-seed related keywords (related_keywords/live). Cap depth + limit
  //    so a large seed list cannot blow the credit budget.
  const relatedItems: DfsItem[] = [];
  for (const seed of seeds.slice(0, 10)) {
    const body = [
      {
        keyword: seed,
        location_code: locationCode,
        language_code: language,
        include_seed_keyword: true,
        depth: 1,
        limit: Math.min(20, limit),
      },
    ];
    const r = await dfsPostJson(
      'dataforseo_labs/google/related_keywords/live',
      body,
      auth
    );
    pushTrace(trace, {
      provider: 'dataforseo',
      endpoint: `dataforseo_labs/google/related_keywords/live (${seed})`,
      ok: r.ok,
      ms: r.ms,
      rows: r.rows,
      status: r.status,
      errorMessage: r.errorMessage,
    });
    if (r.ok) relatedItems.push(...r.items);
  }

  const allItems = [...ideasResult.items, ...relatedItems];
  const normalized: NormalizedKeyword[] = [];
  for (const item of ideasResult.items) {
    const n = dfsItemToNormalized(item, 'keyword_ideas');
    if (n) normalized.push(n);
  }
  for (const item of relatedItems) {
    const n = dfsItemToNormalized(item, 'related_keywords');
    if (n) normalized.push(n);
  }

  // If neither idea nor related had usable items AND every call hard-failed,
  // surface the error so the orchestrator returns a useful message.
  if (!ideasResult.ok && !relatedItems.length) {
    throw new KeywordProviderError(
      'dataforseo',
      ideasResult.status === 401 || ideasResult.status === 403 ? 'auth' : 'http_error',
      `DataForSEO failed: ${ideasResult.errorMessage ?? 'unknown error'}`,
      trace
    );
  }

  // Domain keywords: fetch live via keywords_for_site and merge in (half-and-half).
  if (input.targetDomain) {
    try {
      const domainResult = await fetchGoogleAdsKeywordsForSite(
        input.targetDomain,
        region,
        language,
        limit
      );
      pushTrace(trace, {
        provider: 'dataforseo',
        endpoint: 'keywords_data/google_ads/keywords_for_site/live (domain merge)',
        ok: domainResult.rows.length > 0,
        ms: 0,
        rows: domainResult.rows.length,
      });
      for (const row of domainResult.rows) {
        normalized.push({
          keyword: row.keyword,
          volume: row.volume,
          difficulty: row.kd > 0 ? row.kd : null,
          cpc: row.cpc > 0 ? row.cpc : null,
          intent: (row.intent as NormalizedKeyword['intent']) || '',
          intents: null,
          trafficPotential: row.estimated_monthly_traffic ?? null,
          parentTopic: null,
          trend: '',
          monthlySearches: [],
          competitionLevel: '',
          source: 'dataforseo',
          endpoint: 'keywords_for_site',
        });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn('[keyword-research] domain keywords merge failed (non-fatal):', msg);
      pushTrace(trace, {
        provider: 'dataforseo',
        endpoint: 'keywords_data/google_ads/keywords_for_site/live (domain merge)',
        ok: false,
        ms: 0,
        rows: 0,
        errorMessage: msg,
      });
    }
  }

  const keywords = mergeKeywords(normalized);

  if (!keywords.length) {
    throw new KeywordProviderError(
      'dataforseo',
      'empty',
      `DataForSEO returned no usable keywords (raw_items=${allItems.length}).`,
      trace
    );
  }

  console.log(
    `[keyword-research] dataforseo ok seeds=${seeds.length} keywords=${keywords.length} region=${region}`
  );

  return {
    provider: 'dataforseo',
    fellBackToDataForSEO: false,
    keywords: keywords.slice(0, input.maxResults ?? DEFAULT_MAX_RESULTS),
    trace,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Orchestrator
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns keyword research data using whichever provider has data for the
 * given seeds. Ahrefs is tried first; on any failure mode (no key, 401/403,
 * 429, quota exhausted, network error, empty response) we log the reason
 * and call DataForSEO. If DataForSEO also fails, the *last* error is thrown
 * so the caller can surface a meaningful message.
 *
 * The returned `trace` always contains every upstream call we made, in
 * order — Ahrefs entries first, then the synthetic "fallback" entry, then
 * DataForSEO entries.
 */
export async function getKeywordResearchData(
  input: KeywordResearchInput
): Promise<KeywordResearchResult> {
  const trace: KeywordResearchTraceEntry[] = [];
  const { getPlatformProviders } = await import('@/lib/admin/platform-settings-runtime');
  const providers = await getPlatformProviders();

  let ahrefsFailed: KeywordProviderError | null = null;

  if (providers.ahrefs_enabled) {
    try {
      const result = await fetchKeywordsFromAhrefs(input);
      trace.push(...result.trace);
      return { ...result, trace };
    } catch (err) {
      ahrefsFailed =
        err instanceof KeywordProviderError
          ? err
          : new KeywordProviderError('ahrefs', 'unknown', err instanceof Error ? err.message : String(err));
      trace.push(...ahrefsFailed.trace);
      pushTrace(trace, {
        provider: 'ahrefs',
        endpoint: '(fallback_decision)',
        ok: false,
        ms: 0,
        rows: 0,
        errorReason: ahrefsFailed.reason,
        errorMessage: ahrefsFailed.message,
        fallbackReason: ahrefsFailed.reason,
      });
      console.warn(
        `[keyword-research] ahrefs failed (${ahrefsFailed.reason}): ${ahrefsFailed.message}`
      );
    }
  } else {
    pushTrace(trace, {
      provider: 'ahrefs',
      endpoint: '(skipped)',
      ok: false,
      ms: 0,
      rows: 0,
      errorReason: 'disabled',
      errorMessage: 'Ahrefs disabled in platform settings',
    });
  }

  const mayUseDataForSeo =
    providers.dataforseo_enabled &&
    (!ahrefsFailed || providers.dataforseo_fallback_enabled);

  if (mayUseDataForSeo) {
    if (ahrefsFailed) {
      console.warn('[keyword-research] falling back to DataForSEO.');
    }
    try {
      const result = await fetchKeywordsFromDataForSEO(input);
      trace.push(...result.trace);
      return {
        provider: 'dataforseo',
        fellBackToDataForSEO: Boolean(ahrefsFailed),
        fallbackReason: ahrefsFailed?.reason,
        keywords: result.keywords,
        trace,
      };
    } catch (fallbackErr) {
      const dfsErr =
        fallbackErr instanceof KeywordProviderError
          ? fallbackErr
          : new KeywordProviderError(
              'dataforseo',
              'unknown',
              fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr)
            );
      trace.push(...dfsErr.trace);
      pushTrace(trace, {
        provider: 'dataforseo',
        endpoint: '(fallback_failed)',
        ok: false,
        ms: 0,
        rows: 0,
        errorReason: dfsErr.reason,
        errorMessage: dfsErr.message,
      });
      console.error(
        `[keyword-research] both providers failed. ahrefs=${ahrefsFailed?.reason ?? 'n/a'} dataforseo=${dfsErr.reason}`
      );
      // Throw a synthesised error that carries the merged trace so the caller
      // (typically a server action) can hand it to the client for debugging.
      const ahrefsPart = ahrefsFailed
        ? `Ahrefs failed (${ahrefsFailed.reason}: ${ahrefsFailed.message}) and `
        : '';
      throw new KeywordProviderError(
        'dataforseo',
        dfsErr.reason,
        `${ahrefsPart}DataForSEO failed (${dfsErr.reason}: ${dfsErr.message}).`,
        trace
      );
    }
  }

  if (!providers.ahrefs_enabled && !providers.dataforseo_enabled) {
    throw new KeywordProviderError(
      'dataforseo',
      'disabled',
      'Keyword providers are disabled in platform settings.',
      trace
    );
  }

  throw new KeywordProviderError(
    'ahrefs',
    ahrefsFailed?.reason ?? 'disabled',
    ahrefsFailed?.message ??
      'Ahrefs is unavailable and DataForSEO fallback is disabled in platform settings.',
    trace
  );
}
