import { TARGET_REGIONS, locationCodeFromTargetRegion } from './types';
import type { WebsiteCrawlResult } from './websiteCrawler';
import {
  ahrefsKeywordOverview,
  ahrefsOrganicCompetitors,
  ahrefsOrganicKeywords,
  isAhrefsConfigured,
  type AhrefsKeywordIdea,
  type AhrefsKeywordOverviewRow,
} from './ahrefs';
import {
  getKeywordResearchData,
  type KeywordResearchTraceEntry,
  type NormalizedKeyword,
} from './keyword-research';
import { recordDataForSeoCall } from '@/lib/admin/logging/record-provider-call';

export type Intent = 'informational' | 'commercial' | 'navigational' | 'transactional' | '';
export type CompetitionLevel = 'LOW' | 'MEDIUM' | 'HIGH' | '';

/** Single SERP item attached to a discovered keyword. */
export interface DiscoveredSerpResult {
  position: number;
  title: string;
  url: string;
  domain: string;
  type?: string;
}

/** Keyword row shape stored in Supabase after discovery. */
export interface DiscoveredKeyword {
  keyword: string;
  /** Exact monthly search volume from Google Ads (0 when unknown). */
  volume: number;
  /** DataForSEO keyword difficulty 0–100 (0 when unknown). */
  kd: number;
  /** Average CPC in USD (0 when unknown). */
  cpc: number;
  /** Monthly YoY/MoM trend string, e.g. "+12%" or "-4%" (empty when unknown). */
  trend: string;
  /** Google Ads competition bucket. */
  competition_level: CompetitionLevel;
  /** Dominant search intent of the top-10 SERP. */
  intent: Intent;
  monthly_searches: { month: string; volume: number }[];
  secondary_keywords: string[];
  /**
   * Composite score 0–100 produced by `calculateKeywordAnalysisScore`.
   * Higher = better SEO opportunity for this project.
   */
  keyword_analysis_score: number;
  /** Which DataForSEO endpoints contributed this keyword. */
  source?: string[];
  /** Top organic + featured-snippet SERP items (only set for the final top N). */
  serp_results?: DiscoveredSerpResult[];
  /** Non-own domains seen in this keyword's SERP, ranked by frequency. */
  competitor_domains?: string[];
  /**
   * Subset of competitor ranked_keywords that look thematically related —
   * useful as blog ideas the competitor already ranks for.
   */
  competitor_ranking_keywords?: string[];
  /** DataForSEO `traffic_potential` / `etv`-style hint when available. */
  traffic_potential?: number;
  /** Heuristic content format hint: 'tool' | 'listicle' | 'practice' | 'guide' | 'blog'. */
  suggested_content_type?: string;
  /**
   * How syntactically tied the keyword is to the project context (niche +
   * commercial modifiers + phrase anchors). 0–100. A keyword must be ≥45 to
   * survive the relevance filter.
   */
  relevance_score?: number;
  /**
   * How well the keyword maps to the actual product/service + audience. 0–100.
   * A keyword must be ≥35 to survive the business-fit filter. Tiered:
   * 100 = exact phrase match, 95 = niche+commercial overlap, 70 = niche only,
   * 30 = commercial only, 0 = unrelated / negative-pattern hit.
   */
  business_fit_score?: number;
}

/** Single upstream call captured so the browser can `console.log` it. */
export interface DataForSEOTraceEntry {
  label: string;
  url: string;
  requestBody: unknown;
  httpStatus: number;
  ok: boolean;
  rawText: string;
  parsed: unknown | null;
  /** DataForSEO returns cost (in credits) on the response root. */
  cost?: number;
  parseError?: string;
  fetchError?: string;
}

export interface DiscoverKeywordsForProjectResult {
  keywords: DiscoveredKeyword[];
  trace: DataForSEOTraceEntry[];
  ahrefsDiscoveryState?: {
    matching_last_volume: number | null;
    matching_has_more: boolean;
    related_last_volume: number | null;
    related_has_more: boolean;
  };
}

function getAuthHeader(): string | null {
  const login = process.env.DATAFORSEO_LOGIN;
  const password = process.env.DATAFORSEO_PASSWORD;
  if (!login || !password) return null;
  return `Basic ${Buffer.from(`${login}:${password}`).toString('base64')}`;
}

/**
 * Resolves a project's `target_region` to a DataForSEO `location_code`.
 *
 * Projects can store the region as a code (`in`, `us`), display name
 * (`"India"`, `"United States"`) or already-resolved numeric code (`2356`).
 * We use the shared helper so all three are accepted — otherwise saved names
 * fall through to the US default and DataForSEO silently returns US data.
 */
function getLocationCode(regionCode: string): number {
  return locationCodeFromTargetRegion(regionCode);
}
void TARGET_REGIONS;

interface DfsMonthly {
  year: number;
  month: number;
  search_volume?: number | null;
}

async function dfsPost(
  endpoint: string,
  body: unknown,
  auth: string,
  trace: DataForSEOTraceEntry[]
): Promise<unknown | null> {
  const { assertProviderEnabled } = await import('@/lib/admin/platform-settings-runtime');
  await assertProviderEnabled('dataforseo');

  const url = `https://api.dataforseo.com/v3/${endpoint}`;
  const started = Date.now();
  const entry: DataForSEOTraceEntry = {
    label: endpoint,
    url,
    requestBody: body,
    httpStatus: 0,
    ok: false,
    rawText: '',
    parsed: null,
  };

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: auth, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    entry.httpStatus = res.status;
    entry.ok = res.ok;
    entry.rawText = await res.text();
    try {
      entry.parsed = entry.rawText ? JSON.parse(entry.rawText) : null;
    } catch (e) {
      entry.parseError = e instanceof Error ? e.message : 'JSON parse failed';
    }

    const parsed = entry.parsed as { cost?: number } | null;
    if (parsed && typeof parsed.cost === 'number') entry.cost = parsed.cost;
  } catch (e) {
    entry.fetchError = e instanceof Error ? e.message : String(e);
  } finally {
    const root = entry.parsed as {
      status_code?: number;
      status_message?: string;
      cost?: number;
      tasks_count?: number;
      tasks_error?: number;
      tasks?: Array<{ status_code?: number; status_message?: string; cost?: number }>;
    } | null;

    const task0 = root?.tasks?.[0];
    console.groupCollapsed(
      `[dataforseo] POST v3/${endpoint} → HTTP ${entry.httpStatus} ${entry.ok ? 'ok' : 'FAIL'}${typeof root?.status_code === 'number' ? ` · API ${root.status_code}` : ''}`
    );
    console.log('url:', url);
    console.log('request body:', body);
    if (root && typeof root === 'object') {
      console.log('response summary:', {
        status_code: root.status_code,
        status_message: root.status_message,
        cost: entry.cost ?? root.cost,
        tasks_count: root.tasks_count,
        tasks_error: root.tasks_error,
        task0_status: task0?.status_code,
        task0_message: task0?.status_message,
        task0_cost: task0?.cost,
      });
    } else if (entry.rawText) {
      console.log('response (unparsed / raw prefix):', entry.rawText.slice(0, 500));
    }
    if (entry.fetchError) console.warn('fetchError:', entry.fetchError);
    if (entry.parseError) console.warn('parseError:', entry.parseError);
    console.groupEnd();

    trace.push(entry);
    recordDataForSeoCall(endpoint, entry, Date.now() - started);
  }
  return entry.parsed;
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared helpers / normalizers
// ─────────────────────────────────────────────────────────────────────────────

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

interface DfsIdeaItem {
  keyword?: string;
  keyword_info?: DfsKeywordInfo | null;
  keyword_properties?: {
    keyword_difficulty?: number | null;
  } | null;
  search_intent_info?: {
    main_intent?: string | null;
  } | null;
  /** `related_keywords` / `ranked_keywords` / `keywords_for_site` nest this. */
  keyword_data?: {
    keyword?: string;
    keyword_info?: DfsKeywordInfo | null;
    keyword_properties?: { keyword_difficulty?: number | null } | null;
    search_intent_info?: { main_intent?: string | null } | null;
  } | null;
  /** Ranked-keywords specific: SERP position snapshot. */
  ranked_serp_element?: {
    serp_item?: {
      type?: string;
      rank_absolute?: number | null;
      etv?: number | null;
    } | null;
  } | null;
}

function formatTrend(pct: number | null | undefined): string {
  if (pct === null || pct === undefined || Number.isNaN(pct)) return '';
  const n = Math.round(pct);
  return n >= 0 ? `+${n}%` : `${n}%`;
}

function normalizeIntent(raw: string | null | undefined): Intent {
  const v = (raw ?? '').toLowerCase();
  if (v === 'informational' || v === 'commercial' || v === 'navigational' || v === 'transactional') {
    return v;
  }
  return '';
}

function normalizeCompetition(raw: string | null | undefined): CompetitionLevel {
  const v = (raw ?? '').toUpperCase();
  if (v === 'LOW' || v === 'MEDIUM' || v === 'HIGH') return v;
  return '';
}

/**
 * Accepts anything from a full URL (`https://www.themlhub.ai/blog/x`) down to
 * a bare host (`themlhub.ai`) and returns a normalized, lowercase, no-`www.`
 * hostname suitable for DataForSEO's `target` parameter.
 */
export function extractDomainFromUrl(input: string): string {
  const raw = (input || '').trim();
  if (!raw) return '';
  try {
    const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    const u = new URL(withScheme);
    return u.hostname.replace(/^www\./i, '').toLowerCase();
  } catch {
    return raw
      .replace(/^https?:\/\//i, '')
      .replace(/^www\./i, '')
      .split('/')[0]
      .toLowerCase();
  }
}

/** Build a `DiscoveredKeyword` from a generic DataForSEO item. */
function itemToKeyword(it: DfsIdeaItem, source: string): DiscoveredKeyword | null {
  const nested = it.keyword_data ?? null;
  const keyword = (it.keyword ?? nested?.keyword ?? '').toString().trim();
  if (!keyword) return null;
  const info = (it.keyword_info ?? nested?.keyword_info ?? {}) as DfsKeywordInfo;
  const props = it.keyword_properties ?? nested?.keyword_properties ?? {};
  const intentInfo = it.search_intent_info ?? nested?.search_intent_info ?? {};
  const monthly = info.monthly_searches ?? [];
  const kw: DiscoveredKeyword = {
    keyword,
    volume: Number(info.search_volume ?? 0) || 0,
    kd: Math.round(Number(props.keyword_difficulty ?? 0) || 0),
    cpc: Number(info.cpc ?? 0) || 0,
    trend: formatTrend(info.search_volume_trend?.monthly),
    competition_level: normalizeCompetition(info.competition_level),
    intent: normalizeIntent(intentInfo.main_intent),
    monthly_searches: monthly.slice(0, 12).map(m => ({
      month: `${m.year}-${String(m.month).padStart(2, '0')}`,
      volume: Number(m.search_volume ?? 0) || 0,
    })),
    secondary_keywords: [],
    keyword_analysis_score: 0,
    source: [source],
  };
  // Ranked-keywords rows carry an estimated-traffic value; useful as a signal.
  const etv = it.ranked_serp_element?.serp_item?.etv;
  if (typeof etv === 'number' && etv > 0) kw.traffic_potential = etv;
  return kw;
}

// ─────────────────────────────────────────────────────────────────────────────
// Endpoint wrappers (all use `dfsPost`, all push into `trace`)
// ─────────────────────────────────────────────────────────────────────────────

// NOTE: `fetchKeywordsForSite` (dataforseo_labs/google/keywords_for_site/live)
// and `fetchRankedKeywords` (dataforseo_labs/google/ranked_keywords/live) were
// removed because their output is dominated by whatever tangential traffic the
// target domain already ranks for — "ecr filing", "sarkari resume", random
// customer-care queries, etc. — which poisoned the relevance scorer. The
// pipeline now relies on keyword_ideas + related_keywords only.

/**
 * Convert Ahrefs Keywords Explorer ideas → our internal `DiscoveredKeyword`
 * shape. Volume + KD + CPC + intent come straight from Ahrefs; missing
 * fields are left at sensible defaults so the downstream merge/scorer keeps
 * working.
 */
function ahrefsIdeasToDiscovered(rows: AhrefsKeywordIdea[]): DiscoveredKeyword[] {
  const map = new Map<string, DiscoveredKeyword>();
  for (const row of rows) {
    const keyword = (row.keyword ?? '').trim().toLowerCase();
    if (!keyword) continue;
    const intent = inferIntentFromAhrefs(row.intents);
    const existing = map.get(keyword);
    const next: DiscoveredKeyword = {
      keyword,
      volume: Number(row.volume ?? 0) || 0,
      kd: row.difficulty != null ? Math.round(Number(row.difficulty)) : 0,
      cpc: row.cpc != null ? Number(row.cpc) / 100 : 0, // Ahrefs CPC is in USD cents
      trend: '',
      competition_level: '',
      intent,
      monthly_searches: [],
      secondary_keywords: [],
      keyword_analysis_score: 0,
      source: ['ahrefs_keywords_explorer'],
    };
    if (!existing) {
      map.set(keyword, next);
      continue;
    }
    if (next.volume > existing.volume) existing.volume = next.volume;
    if (!existing.kd && next.kd) existing.kd = next.kd;
    if (!existing.cpc && next.cpc) existing.cpc = next.cpc;
    if (!existing.intent && next.intent) existing.intent = next.intent;
  }
  return [...map.values()].sort((a, b) => b.volume - a.volume);
}

function inferIntentFromAhrefs(intents: AhrefsKeywordIdea['intents']): Intent {
  if (!intents) return '';
  if (intents.transactional) return 'transactional';
  if (intents.commercial) return 'commercial';
  if (intents.informational) return 'informational';
  if (intents.navigational) return 'navigational';
  return '';
}

async function fetchKeywordIdeas(
  seeds: string[],
  locationCode: number,
  languageCode: string,
  auth: string,
  trace: DataForSEOTraceEntry[]
): Promise<DiscoveredKeyword[]> {
  if (!seeds.length) return [];

  const body = [
    {
      keywords: seeds.slice(0, 200),
      location_code: locationCode,
      language_code: languageCode,
      // User-facing contract: exactly 100 ideas for the seed set. The UI
      // then pairs these with ~10 related_keywords results for ~110 rows,
      // plus whatever `include_seed_keyword` echoes back.
      limit: 100,
      include_seed_keyword: true,
      // Keep results tightly related to the seed phrases — prevents the API
      // from drifting into unrelated entities (e.g. random company names) for
      // generic seeds.
      closely_variants: true,
      order_by: ['keyword_info.search_volume,desc'],
    },
  ];

  // console.log(
  //   '[DataForSEO] → keyword_ideas/live body:',
  //   JSON.stringify(body, null, 2)
  // );

  const parsed = (await dfsPost(
    'dataforseo_labs/google/keyword_ideas/live',
    body,
    auth,
    trace
  )) as {
    tasks?: Array<{ result?: Array<{ items?: DfsIdeaItem[] }> }>;
  } | null;

  const items = parsed?.tasks?.[0]?.result?.[0]?.items ?? [];
  return items
    .map(it => itemToKeyword(it, 'keyword_ideas'))
    .filter((x): x is DiscoveredKeyword => x !== null);
}

export async function fetchKeywordIdeasForSeeds(
  seeds: string[],
  regionCode: string,
  languageCode: string,
  limit = 120
): Promise<DiscoveredKeyword[]> {
  const cleanSeeds = [...new Set(seeds.map(s => s.trim().toLowerCase()).filter(Boolean))].slice(0, 80);
  if (!cleanSeeds.length) return [];
  // Routes through the unified provider service: Ahrefs first, DataForSEO
  // fallback. Returns [] only when *both* providers fail.
  try {
    const research = await getKeywordResearchData({
      seeds: cleanSeeds,
      region: regionCode,
      language: languageCode,
      limit: Math.max(limit, 80),
      maxResults: limit,
    });
    const merged = research.keywords.map<DiscoveredKeyword>(k => ({
      keyword: k.keyword,
      volume: k.volume,
      kd: k.difficulty ?? 0,
      cpc: k.cpc ?? 0,
      trend: k.trend,
      competition_level: k.competitionLevel,
      intent: k.intent,
      monthly_searches: k.monthlySearches,
      secondary_keywords: [],
      keyword_analysis_score: 0,
      source: [`${k.source}_${k.endpoint}`],
    }));
    console.log(
      `[keyword-research] fetchKeywordIdeasForSeeds provider=${research.provider} ` +
        `fellBack=${research.fellBackToDataForSEO} merged=${merged.length}`
    );
    return merged.slice(0, limit);
  } catch (e) {
    console.warn('[keyword-research] fetchKeywordIdeasForSeeds failed:', e);
    return [];
  }
}

async function fetchRelatedKeywords(
  seedKeywords: string[],
  locationCode: number,
  languageCode: string,
  auth: string,
  trace: DataForSEOTraceEntry[]
): Promise<DiscoveredKeyword[]> {
  const out: DiscoveredKeyword[] = [];
  // One call per seed, 2 related keywords per seed. Safety cap at 20 seeds
  // so an accidentally-huge seed list can't blow the DataForSEO budget.
  for (const seed of seedKeywords.slice(0, 20)) {
    if (!seed || !seed.trim()) continue;
    const body = [
      {
        keyword: seed.trim(),
        location_code: locationCode,
        language_code: languageCode,
        include_seed_keyword: true,
        include_serp_info: true,
        depth: 1,
        limit: 2,
      },
    ];
    // console.log(
    //   '[DataForSEO] → related_keywords/live body:',
    //   JSON.stringify(body, null, 2)
    // );
    const parsed = (await dfsPost(
      'dataforseo_labs/google/related_keywords/live',
      body,
      auth,
      trace
    )) as {
      tasks?: Array<{ result?: Array<{ items?: DfsIdeaItem[] }> }>;
    } | null;
    const items = parsed?.tasks?.[0]?.result?.[0]?.items ?? [];
    for (const it of items) {
      const kw = itemToKeyword(it, 'related_keywords');
      if (kw) out.push(kw);
    }
  }
  return out;
}

async function fetchKeywordOverview(
  keywords: string[],
  locationCode: number,
  languageCode: string,
  auth: string,
  trace: DataForSEOTraceEntry[]
): Promise<Map<string, DiscoveredKeyword>> {
  const out = new Map<string, DiscoveredKeyword>();
  const clean = [...new Set(keywords.map(k => k.trim()).filter(Boolean))];
  if (!clean.length) return out;
  const body = [
    {
      // API max is 700 — we rely on the caller to pass the already-truncated
      // top-N slice (currently 250). This cap is a safety net only.
      keywords: clean.slice(0, 700),
      location_code: locationCode,
      language_code: languageCode,
      include_serp_info: true,
      include_clickstream_data: true,
    },
  ];
  // console.log(
  //   '[DataForSEO] → keyword_overview/live body:',
  //   JSON.stringify(body, null, 2)
  // );
  const parsed = (await dfsPost(
    'dataforseo_labs/google/keyword_overview/live',
    body,
    auth,
    trace
  )) as {
    tasks?: Array<{ result?: DfsIdeaItem[] }>;
  } | null;
  const items = parsed?.tasks?.[0]?.result ?? [];
  for (const it of items) {
    const kw = itemToKeyword(it, 'keyword_overview');
    if (kw) out.set(kw.keyword.toLowerCase(), kw);
  }
  return out;
}

async function fetchBulkKeywordDifficulty(
  keywords: string[],
  locationCode: number,
  languageCode: string,
  auth: string,
  trace: DataForSEOTraceEntry[]
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const clean = [...new Set(keywords.map(k => k.trim()).filter(Boolean))];
  if (!clean.length) return out;
  const body = [
    {
      // Safety cap only — caller already slices to 250.
      keywords: clean.slice(0, 700),
      location_code: locationCode,
      language_code: languageCode,
    },
  ];
  // console.log(
  //   '[DataForSEO] → bulk_keyword_difficulty/live body:',
  //   JSON.stringify(body, null, 2)
  // );
  const parsed = (await dfsPost(
    'dataforseo_labs/google/bulk_keyword_difficulty/live',
    body,
    auth,
    trace
  )) as {
    tasks?: Array<{
      result?: Array<{
        items?: Array<{ keyword?: string; keyword_difficulty?: number | null }>;
      }>;
    }>;
  } | null;
  const items = parsed?.tasks?.[0]?.result?.[0]?.items ?? [];
  for (const it of items) {
    const k = (it.keyword ?? '').toString().trim().toLowerCase();
    if (!k) continue;
    const kd = Math.round(Number(it.keyword_difficulty ?? 0) || 0);
    out.set(k, kd);
  }
  return out;
}

interface DfsSerpItem {
  type?: string;
  rank_absolute?: number | null;
  title?: string | null;
  url?: string | null;
  domain?: string | null;
}

const SERP_BOILERPLATE_HOSTS = new Set([
  'google.com',
  'youtube.com',
  'facebook.com',
  'instagram.com',
  'linkedin.com',
  'wikipedia.org',
  'en.wikipedia.org',
  'twitter.com',
  'x.com',
  'pinterest.com',
  'tiktok.com',
  'reddit.com',
  'quora.com',
  'amazon.com',
  'bing.com',
  'duckduckgo.com',
]);

function serpHostFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
}

/**
 * Live Google organic SERP for one keyword — top N URLs (DataForSEO advanced).
 */
export async function fetchGoogleOrganicSerpTopUrls(
  keyword: string,
  opts: {
    locationCode?: number;
    languageCode?: string;
    limit?: number;
    excludeHosts?: string[];
    trace?: DataForSEOTraceEntry[];
  } = {}
): Promise<{ urls: DiscoveredSerpResult[]; trace: DataForSEOTraceEntry[] }> {
  const trace = opts.trace ?? [];
  const clean = (keyword || '').trim();
  const limit = Math.max(1, Math.min(opts.limit ?? 5, 10));
  const locationCode = opts.locationCode ?? 2840;
  const languageCode = (opts.languageCode ?? 'en').toLowerCase();
  const exclude = new Set((opts.excludeHosts ?? []).map(h => h.replace(/^www\./, '').toLowerCase()));

  if (!clean) {
    return { urls: [], trace };
  }

  const auth = getAuthHeader();
  if (!auth) {
    trace.push({
      label: 'serp/google/organic/live/advanced',
      url: 'https://api.dataforseo.com/v3/serp/google/organic/live/advanced',
      requestBody: null,
      httpStatus: 0,
      ok: false,
      rawText: '',
      parsed: null,
      fetchError: 'DATAFORSEO_LOGIN / DATAFORSEO_PASSWORD missing',
    });
    return { urls: [], trace };
  }

  const body = [
    {
      keyword: clean,
      location_code: locationCode,
      language_code: languageCode,
      device: 'desktop',
      os: 'windows',
      depth: 10,
    },
  ];

  const parsed = (await dfsPost('serp/google/organic/live/advanced', body, auth, trace)) as {
    tasks?: Array<{ result?: Array<{ items?: DfsSerpItem[] }> }>;
  } | null;

  const items = parsed?.tasks?.[0]?.result?.[0]?.items ?? [];
  const rows: DiscoveredSerpResult[] = [];
  for (const it of items) {
    const t = (it.type ?? '').toLowerCase();
    if (t !== 'organic' && t !== 'featured_snippet') continue;
    const url = (it.url ?? '').toString();
    if (!url) continue;
    const host = serpHostFromUrl(url);
    if (!host || SERP_BOILERPLATE_HOSTS.has(host)) continue;
    if (exclude.has(host)) continue;
    rows.push({
      position: Number(it.rank_absolute ?? 0) || rows.length + 1,
      title: (it.title ?? '').toString(),
      url,
      domain: (it.domain ?? extractDomainFromUrl(url)).toString(),
      type: t,
    });
    if (rows.length >= limit) break;
  }

  return { urls: rows, trace };
}

/**
 * Fetch live Google organic SERPs for N keywords. Previously this ran
 * sequentially (≈1 req/s × 100 keywords ≈ 1.5 minutes). We now fan out with a
 * bounded concurrency so the caller sees a few-seconds response even for the
 * full 100-keyword top slice.
 */
async function fetchSerpForKeywords(
  topKeywords: string[],
  locationCode: number,
  languageCode: string,
  auth: string,
  trace: DataForSEOTraceEntry[]
): Promise<Map<string, DiscoveredSerpResult[]>> {
  const out = new Map<string, DiscoveredSerpResult[]>();
  const clean = topKeywords
    .map(k => (k || '').trim())
    .filter(Boolean);
  if (!clean.length) return out;

  const CONCURRENCY = 8;
  let cursor = 0;

  async function worker() {
    while (cursor < clean.length) {
      const idx = cursor++;
      const kw = clean[idx];
      const body = [
        {
          keyword: kw,
          location_code: locationCode,
          language_code: languageCode,
          device: 'desktop',
          os: 'windows',
          depth: 10,
        },
      ];
      // console.log(
      //   '[DataForSEO] → serp/google/organic/live/advanced body:',
      //   JSON.stringify(body, null, 2)
      // );
      const parsed = (await dfsPost(
        'serp/google/organic/live/advanced',
        body,
        auth,
        trace
      )) as {
        tasks?: Array<{ result?: Array<{ items?: DfsSerpItem[] }> }>;
      } | null;
      const items = parsed?.tasks?.[0]?.result?.[0]?.items ?? [];
      const rows: DiscoveredSerpResult[] = [];
      for (const it of items) {
        const t = (it.type ?? '').toLowerCase();
        if (t !== 'organic' && t !== 'featured_snippet') continue;
        const url = (it.url ?? '').toString();
        if (!url) continue;
        rows.push({
          position: Number(it.rank_absolute ?? 0) || 0,
          title: (it.title ?? '').toString(),
          url,
          domain: (it.domain ?? extractDomainFromUrl(url)).toString(),
          type: t,
        });
      }
      out.set(kw.toLowerCase(), rows);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, clean.length) }, () => worker())
  );
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Keyword clustering / near-duplicate dedup
// ─────────────────────────────────────────────────────────────────────────────

/** Stopwords stripped before comparing keyword token sets. Different from the
 *  relevance-scorer stopword list — here we also want to drop pure commercial
 *  qualifiers ("best", "top") so "best SEO tool" and "SEO tool" cluster. */
const CLUSTER_STOPWORDS = new Set([
  'the', 'a', 'an', 'of', 'for', 'and', 'or', 'to', 'in', 'on', 'is', 'are',
  'with', 'your', 'you', 'our', 'my', 'me', 'we', 'they', 'their', 'that',
  'this', 'best', 'top', 'how', 'what', 'why', 'when', 'where',
]);

/** Synonym → canonical token. Keeps the clusterer from treating "engineer" and
 *  "developer" as different keywords. Kept small and domain-specific; expand
 *  as new niches show up in the top-100. */
const CLUSTER_SYNONYMS: Record<string, string> = {
  engineer: 'developer', engineers: 'developer', developers: 'developer',
  developer: 'developer', programmer: 'developer', programmers: 'developer',
  coder: 'developer', coders: 'developer', swe: 'developer', sde: 'developer',
  coding: 'developer', programming: 'developer', dev: 'developer',
  devs: 'developer',

  hire: 'hire', hiring: 'hire', hires: 'hire', hired: 'hire',

  recruit: 'recruit', recruiting: 'recruit', recruitment: 'recruit',
  recruiter: 'recruit', recruiters: 'recruit',

  staff: 'staff', staffing: 'staff',

  tech: 'software', technology: 'software', technologies: 'software',
  technical: 'software', software: 'software', it: 'software',

  talent: 'talent', talents: 'talent', talented: 'talent',

  agency: 'agency', agencies: 'agency',
  company: 'company', companies: 'company',
  service: 'service', services: 'service',
  platform: 'platform', platforms: 'platform',

  course: 'course', courses: 'course', tutorial: 'course', tutorials: 'course',
  guide: 'course', guides: 'course',
};

function normalizeForClustering(keyword: string): string[] {
  const raw = (keyword || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  const out: string[] = [];
  for (const tok of raw) {
    if (CLUSTER_STOPWORDS.has(tok)) continue;
    const mapped = CLUSTER_SYNONYMS[tok];
    if (mapped) { out.push(mapped); continue; }
    // Cheap singulariser for unknown words — good enough to cluster
    // "developers"/"developer" even when they're not in the synonym map.
    let root = tok;
    if (/ies$/.test(root) && root.length > 4) root = root.replace(/ies$/, 'y');
    else if (/sses$/.test(root)) root = root.replace(/sses$/, 'ss');
    else if (/s$/.test(root) && !/(ss|us|is)$/.test(root) && root.length > 3) {
      root = root.slice(0, -1);
    }
    out.push(root);
  }
  return out;
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  const union = a.size + b.size - inter;
  return union ? inter / union : 0;
}

/**
 * Collapse near-duplicate keywords — we keep the one with the highest
 * `keyword_analysis_score` as the primary and fold every sibling keyword into
 * its `secondary_keywords`. Grouping is a greedy Jaccard pass using the
 * normalised-synonym-aware token set; threshold 0.7 keeps tight dupes (e.g.
 * "software developer hiring" vs "software engineer hiring") while leaving
 * meaningfully different intents separate ("software developer recruitment"
 * vs "tech recruitment agency" share ~50% tokens → stay as two rows).
 */
function clusterKeywords(keywords: DiscoveredKeyword[]): {
  kept: DiscoveredKeyword[];
  merges: Array<{ primary: string; secondary: string[] }>;
} {
  const SIMILARITY = 0.7;
  // Sort by analysis score desc so the best keyword in each cluster wins.
  const sorted = [...keywords].sort(
    (a, b) => (b.keyword_analysis_score ?? 0) - (a.keyword_analysis_score ?? 0)
  );
  const tokensOf = new Map<DiscoveredKeyword, Set<string>>();
  for (const kw of sorted) {
    tokensOf.set(kw, new Set(normalizeForClustering(kw.keyword)));
  }

  const kept: DiscoveredKeyword[] = [];
  const claimed = new Set<DiscoveredKeyword>();
  const merges: Array<{ primary: string; secondary: string[] }> = [];

  for (const primary of sorted) {
    if (claimed.has(primary)) continue;
    claimed.add(primary);
    const pTokens = tokensOf.get(primary) ?? new Set<string>();
    const similar: string[] = [];

    for (const other of sorted) {
      if (claimed.has(other)) continue;
      const oTokens = tokensOf.get(other) ?? new Set<string>();
      if (!pTokens.size || !oTokens.size) continue;
      if (jaccardSimilarity(pTokens, oTokens) >= SIMILARITY) {
        claimed.add(other);
        similar.push(other.keyword);
      }
    }

    if (similar.length) {
      const prev = primary.secondary_keywords ?? [];
      primary.secondary_keywords = [...new Set([...prev, ...similar])];
      merges.push({ primary: primary.keyword, secondary: similar });
    }
    kept.push(primary);
  }

  return { kept, merges };
}

// ─────────────────────────────────────────────────────────────────────────────
// Merge / scoring utilities
// ─────────────────────────────────────────────────────────────────────────────

function mergeKeywordCandidates(...arrays: DiscoveredKeyword[][]): DiscoveredKeyword[] {
  const map = new Map<string, DiscoveredKeyword>();
  for (const arr of arrays) {
    for (const kw of arr) {
      const key = kw.keyword.toLowerCase().trim();
      if (!key) continue;
      const existing = map.get(key);
      if (!existing) {
        map.set(key, { ...kw, source: [...(kw.source ?? [])] });
        continue;
      }
      // Merge sources
      const srcSet = new Set<string>([...(existing.source ?? []), ...(kw.source ?? [])]);
      existing.source = [...srcSet];
      // Keep max volume
      if (kw.volume > existing.volume) existing.volume = kw.volume;
      // Keep non-zero cpc
      if (kw.cpc && !existing.cpc) existing.cpc = kw.cpc;
      else if (kw.cpc && existing.cpc && kw.cpc > existing.cpc) existing.cpc = kw.cpc;
      // Keep lower kd if both known, else whichever is non-zero
      if (kw.kd > 0) {
        if (existing.kd === 0) existing.kd = kw.kd;
        else if (kw.kd < existing.kd) existing.kd = kw.kd;
      }
      if (kw.monthly_searches?.length && kw.monthly_searches.length > existing.monthly_searches.length) {
        existing.monthly_searches = kw.monthly_searches;
      }
      // Keep intent if missing
      if (!existing.intent && kw.intent) existing.intent = kw.intent;
      // Merge secondary_keywords
      if (kw.secondary_keywords?.length) {
        const merged = new Set([...(existing.secondary_keywords ?? []), ...kw.secondary_keywords]);
        existing.secondary_keywords = [...merged];
      }
      // Keep traffic_potential (max)
      if (typeof kw.traffic_potential === 'number') {
        existing.traffic_potential = Math.max(existing.traffic_potential ?? 0, kw.traffic_potential);
      }
    }
  }
  return [...map.values()];
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function normalizeLog(value: number, min: number, max: number): number {
  if (!value || value <= 0) return 0;
  const v = Math.log10(Math.max(value, min));
  const mn = Math.log10(min);
  const mx = Math.log10(max);
  if (mx === mn) return 0;
  return clamp(((v - mn) / (mx - mn)) * 100, 0, 100);
}

const WEAK_DOMAINS = new Set([
  'reddit.com', 'quora.com', 'medium.com', 'stackoverflow.com',
  'wordpress.com', 'blogspot.com',
]);

function isWeak(domain: string): boolean {
  const d = domain.toLowerCase();
  if (WEAK_DOMAINS.has(d)) return true;
  if (d.includes('forum')) return true;
  if (d.endsWith('.wordpress.com') || d.endsWith('.blogspot.com')) return true;
  return false;
}

const STRONG_DOMAINS = new Set([
  'wikipedia.org', 'en.wikipedia.org',
  'youtube.com', 'amazon.com', 'linkedin.com',
  'nytimes.com', 'bbc.com', 'bbc.co.uk', 'cnn.com', 'forbes.com',
  'theguardian.com', 'reuters.com', 'bloomberg.com', 'wsj.com',
]);

function isStrong(domain: string): boolean {
  const d = domain.toLowerCase();
  if (STRONG_DOMAINS.has(d)) return true;
  if (d.endsWith('.gov') || d.includes('.gov.')) return true;
  if (d.endsWith('.edu') || d.includes('.edu.')) return true;
  return false;
}

function serpOpportunityScore(results: DiscoveredSerpResult[] | undefined): number {
  if (!results || !results.length) return 50;
  let score = 50;
  for (const r of results) {
    const d = (r.domain || extractDomainFromUrl(r.url)).toLowerCase();
    if (isWeak(d)) score += 8;
    else if (isStrong(d)) score -= 6;
  }
  return clamp(score, 0, 100);
}

function intentScore(intent: Intent): number {
  switch (intent) {
    case 'transactional': return 100;
    case 'commercial': return 90;
    case 'informational': return 65;
    case 'navigational': return 35;
    default: return 50;
  }
}

function cpcScore(cpc: number): number {
  if (!cpc || cpc <= 0) return 30;
  return normalizeLog(cpc, 0.1, 100);
}

function volumeScore(vol: number): number {
  if (!vol || vol <= 0) return 0;
  return normalizeLog(vol, 10, 100000);
}

function lowDifficultyScore(kd: number): number {
  if (!kd || kd <= 0) return 50;
  return clamp(100 - kd, 0, 100);
}

function suggestedContentType(keyword: string): string {
  const k = keyword.toLowerCase();
  if (/rank predictor|calculator|analyzer|score calculator/.test(k)) return 'tool';
  if (/\b(course|test series|mock test|best)\b/.test(k)) return 'listicle';
  if (/\b(pyq|previous year|questions|practice)\b/.test(k)) return 'practice';
  if (/\b(roadmap|strategy|study plan|preparation)\b/.test(k)) return 'guide';
  return 'blog';
}

// ─────────────────────────────────────────────────────────────────────────────
// Project context: niche vocabulary + phrase boosts + hard negatives
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Structured view of "what this project is actually about". Everything the
 * relevance and business-fit scorers do is driven off this object — there is
 * no implicit whitelisting of keywords based on the DataForSEO endpoint that
 * returned them.
 */
export interface ProjectContext {
  /** Raw input (niche phrase + sample seeds) kept so negative patterns can be
   * disabled when the context itself genuinely contains that word. */
  raw: string;
  /** The niche phrase as entered by the user (e.g. "software engineering"). */
  nichePhrase: string;
  /**
   * Single-word vocabulary representing the niche, expanded via
   * `NICHE_VOCABULARY`. A keyword must hit at least one of these to count as
   * "on topic".
   */
  coreTokens: Set<string>;
  /**
   * Multi-word anchor phrases. If a keyword literally contains one of these,
   * it is treated as a near-perfect match (business_fit = 100).
   */
  phraseBoosts: string[];
  /**
   * Secondary-category tokens — things the keyword must also mention for a
   * 100 fit score in dual-context mode (e.g. recruitment terms when the
   * niche is software engineering but the site sells hiring services).
   * Empty set = single-context mode.
   */
  mustHaveAnyTokens: Set<string>;
  /** Regexes that disqualify a keyword regardless of other signals. */
  negativePatterns: RegExp[];
  /** Buying-intent modifiers: "agency", "hire", "recruitment", "best", etc. */
  commercialModifiers: string[];
  /** Cross-product phrases to feed into keyword_ideas / related_keywords as extra seeds. */
  syntheticSeeds: string[];
}

/** Global blocklist — applies to every project unless the user's own context
 * genuinely contains the word (e.g. "download" would be kept if the niche is
 * "software downloads"). */
const GLOBAL_NEGATIVE_KEYWORD_PATTERNS: RegExp[] = [
  /customer care/i,
  /phone number/i,
  /contact number/i,
  /helpline/i,
  /toll[-\s]?free/i,
  /complaint/i,
  /sarkari/i,
  /\bgovt\b/i,
  /\bgovernment\b/i,
  /\bform\s+[a-z0-9]\b/i,
  /full form/i,
  /\bmeaning\b/i,
  /\bdefinition\b/i,
  /\blogin\b/i,
  /status check/i,
  /\bcertificate\b/i,
  /\bchallan\b/i,
  /\bepfo\b/i,
  /\buan\b/i,
  /pf balance/i,
  /air india/i,
  /\bp\s*v\s*r\b/i,
];

const DEFAULT_COMMERCIAL_MODIFIERS = [
  'best', 'services', 'agency', 'company', 'platform', 'tool', 'software',
  'course', 'test series', 'mock test', 'pricing', 'hire', 'recruitment',
  'solution', 'provider', 'staffing', 'hiring', 'consultant', 'consulting',
];

/**
 * Keyed by a recognised category, each entry is the single-token vocabulary
 * that "belongs" to that category. Match is substring-free — we only ever
 * check tokenised (whole-word) overlaps.
 */
const NICHE_VOCABULARY: Record<string, string[]> = {
  software: [
    'software', 'engineer', 'engineers', 'engineering', 'developer', 'developers',
    'development', 'programming', 'programmer', 'programmers', 'coding', 'coder',
    'coders', 'tech', 'technical', 'technology', 'technologies', 'it',
    'backend', 'frontend', 'fullstack', 'devops', 'qa',
    'javascript', 'typescript', 'python', 'java', 'react', 'node', 'nodejs',
    'api', 'microservices', 'architecture', 'framework', 'algorithm',
    'sde', 'swe',
  ],
  recruitment: [
    'recruitment', 'recruit', 'recruiter', 'recruiters', 'recruiting',
    'hiring', 'hire', 'hires', 'staffing', 'staff', 'talent', 'acquisition',
    'workforce', 'employer', 'employers', 'employee', 'employees',
    'rpo', 'jobs', 'job', 'careers', 'placement', 'placements', 'outsourcing',
  ],
  education: [
    'exam', 'exams', 'test', 'tests', 'mock', 'preparation', 'prep', 'syllabus',
    'pyq', 'questions', 'question', 'study', 'course', 'courses', 'tutorial',
    'tutorials', 'guide', 'guides', 'rank', 'ranking', 'score', 'scores',
    'marks', 'gate', 'jee', 'neet', 'upsc', 'cat',
  ],
  fitness: [
    'fitness', 'workout', 'workouts', 'exercise', 'exercises', 'training',
    'trainer', 'gym', 'weight', 'diet', 'nutrition', 'health', 'yoga',
    'cardio', 'strength',
  ],
  marketing: [
    'marketing', 'seo', 'sem', 'ads', 'ppc', 'advertising', 'campaign',
    'campaigns', 'content', 'social', 'brand', 'branding', 'outreach',
    'backlinks', 'backlink', 'keyword', 'keywords',
  ],
  ai: [
    'ai', 'ml', 'machine', 'learning', 'llm', 'gpt', 'chatbot', 'chatbots',
    'automation', 'automated', 'model', 'models', 'neural', 'deep', 'nlp',
    'embedding', 'embeddings',
  ],
  finance: [
    'finance', 'financial', 'investing', 'investment', 'stocks', 'stock',
    'crypto', 'trading', 'trader', 'portfolio', 'banking', 'loans', 'loan',
    'insurance',
  ],
  design: [
    'design', 'designer', 'designers', 'ui', 'ux', 'graphic', 'illustration',
    'logo', 'branding', 'typography', 'layout', 'wireframe', 'figma',
  ],
  ecommerce: [
    'ecommerce', 'e-commerce', 'shop', 'shopping', 'store', 'retail',
    'merchant', 'cart', 'checkout',
  ],
};

/** Detect which categories a block of text falls into (can return multiple). */
function detectNicheCategories(text: string): string[] {
  const t = (text || '').toLowerCase();
  const out: string[] = [];
  if (/software|engineer|develop|coding|program|\btech\b|\bit\b|backend|frontend|\bapi\b|microservice/.test(t)) out.push('software');
  if (/recruit|hiring|hire\b|staff|talent|workforce|\brpo\b|\bhr\b|\bjobs?\b|employer|placement|outsourc/.test(t)) out.push('recruitment');
  if (/\bexam\b|\bcourse\b|\btest\b|prep\b|\bpyq\b|syllab|\bstudy\b|tutorial|\bgate\b|\bjee\b|\bneet\b/.test(t)) out.push('education');
  if (/fitness|workout|exercise|training\b|\bgym\b|\bdiet\b|nutrition|\byoga\b/.test(t)) out.push('fitness');
  if (/\bseo\b|\bsem\b|\bppc\b|advertising|campaign|marketing|branding|backlink/.test(t)) out.push('marketing');
  if (/\bai\b|\bml\b|machine learning|\bllm\b|\bgpt\b|chatbot|neural|deep learning|\bnlp\b/.test(t)) out.push('ai');
  if (/finance|investing|\bstock\b|crypto|trading|banking|\bloan\b/.test(t)) out.push('finance');
  if (/\bdesign\b|\bui\b|\bux\b|graphic|illustration|logo|typography/.test(t)) out.push('design');
  if (/ecommerce|e-commerce|\bshop\b|retail|merchant|checkout/.test(t)) out.push('ecommerce');
  return out;
}

/**
 * Produce anchor phrases that match the intersection of a primary niche and a
 * secondary category — these are the terms we explicitly *want* the final
 * result set to contain (e.g. "software engineer hiring" for software ×
 * recruitment).
 */
function buildPhraseBoosts(primaryCats: string[], secondaryCats: string[]): string[] {
  const out: string[] = [];
  const has = (arr: string[], v: string) => arr.includes(v);
  if (has(primaryCats, 'software') && has(secondaryCats, 'recruitment')) {
    out.push(
      'software engineer hiring',
      'software engineer recruitment',
      'software developer hiring',
      'software developer recruitment',
      'software developer staffing',
      'software engineering recruitment',
      'software engineering hiring',
      'software engineering talent acquisition',
      'hire software developers',
      'hire software engineers',
      'hire remote software developers',
      'tech recruitment agency',
      'tech talent acquisition',
      'tech hiring platform',
      'it staffing company',
      'it recruitment services',
      'it recruitment agency',
      'technical recruitment agency',
      'technical recruitment',
      'engineering hiring solutions',
      'recruitment process outsourcing',
      'recruitment process outsourcing for it',
    );
  }
  if (has(primaryCats, 'recruitment') && has(secondaryCats, 'software')) {
    // Same intersection, just reversed primary/secondary.
    out.push(
      'software engineer recruitment',
      'tech recruitment agency',
      'it recruitment services',
      'software developer staffing',
      'hire software engineers',
    );
  }
  if (has(primaryCats, 'education') && has(secondaryCats, 'software')) {
    out.push(
      'software engineering course',
      'coding bootcamp',
      'programming tutorial',
      'learn software engineering',
    );
  }
  return [...new Set(out)];
}

/** Context-aware negative patterns for common junk clusters. */
function buildNegativePatterns(
  primaryCats: string[],
  secondaryCats: string[],
  rawContext: string
): RegExp[] {
  const out: RegExp[] = [...GLOBAL_NEGATIVE_KEYWORD_PATTERNS];
  const cats = new Set([...primaryCats, ...secondaryCats]);
  // Recruitment / software clusters should drop payroll-admin / sales-admin
  // noise that often co-appears in India-region ranked keywords.
  if (cats.has('recruitment') || cats.has('software')) {
    if (!/payroll/i.test(rawContext)) out.push(/\bpayroll\b/i);
    if (!/compliance/i.test(rawContext)) out.push(/statutory compliance/i);
    if (!/account manager/i.test(rawContext)) out.push(/\baccount manager\b/i);
    if (!/\becr\b/i.test(rawContext)) out.push(/\becr\b/i);
    if (!/download/i.test(rawContext)) out.push(/\bdownload\b/i);
  }
  return out;
}

const STOPWORDS = new Set([
  'the', 'a', 'an', 'of', 'for', 'and', 'or', 'to', 'in', 'on', 'is', 'are',
  'best', 'top', 'how', 'what', 'why', 'when', 'with', 'your', 'you', 'our',
]);

function tokenize(s: string): string[] {
  return (s || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length >= 2 && !STOPWORDS.has(t));
}

/**
 * Optional side-context the Create Project form can provide. When present,
 * these fields are folded into the ProjectContext so relevance scoring and
 * synthetic-seed generation reason over the *whole* business, not just the
 * niche phrase.
 */
export interface ProjectContextExtras {
  /** Target audience as entered in the form (e.g. "HR managers at mid-size companies"). */
  targetAudience?: string;
  /** Free-form project description. */
  description?: string;
  /** Company name — helps disable negative patterns that would otherwise kill
   *  brand-adjacent keywords. */
  companyName?: string;
  /** Output of `crawlWebsite(domain)`. Title / meta / headings / top phrases
   *  / URL slugs all feed into coreTokens, phraseBoosts and syntheticSeeds. */
  crawl?: WebsiteCrawlResult;
  matchingLastVolume?: number;
  relatedLastVolume?: number;
  queryMatching?: boolean;
  queryRelated?: boolean;
}

export function buildProjectContext(
  seedKeywords: string[],
  businessDomain?: string,
  targetUrl?: string,
  extras?: ProjectContextExtras
): ProjectContext {
  const seeds = (seedKeywords || []).map(s => s.trim()).filter(Boolean);
  const niche = (businessDomain || '').trim() || seeds.slice(0, 3).join(' ');
  const domainOnly = extractDomainFromUrl(targetUrl || '');

  const audience = (extras?.targetAudience || '').trim();
  const description = (extras?.description || '').trim();
  const companyName = (extras?.companyName || '').trim();
  const crawl = extras?.crawl;

  // Distilled copy of the crawl result — we deliberately keep paragraph text
  // out of the raw string (too noisy) but pull in every strong SEO signal:
  // title, meta, H1/H2/H3, nav/link labels, URL slugs, top phrases.
  const crawlSignals: string[] = [];
  if (crawl) {
    crawlSignals.push(crawl.title, crawl.metaDescription);
    crawlSignals.push(...crawl.headings.h1);
    crawlSignals.push(...crawl.headings.h2.slice(0, 20));
    crawlSignals.push(...crawl.headings.h3.slice(0, 20));
    crawlSignals.push(...crawl.linkTexts.slice(0, 30));
    crawlSignals.push(...crawl.urlSlugs.slice(0, 40));
    crawlSignals.push(...crawl.topPhrases.slice(0, 30));
  }
  const crawlBlob = crawlSignals.join(' ');

  const rawContext = [
    niche,
    audience,
    description,
    companyName,
    domainOnly,
    ...seeds,
    crawlBlob,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  // Primary categories come from the user-declared niche + description + company
  // name. Secondary categories come from the audience + seeds + everything the
  // website itself advertises (nav / headings / slugs). That split is what lets
  // us detect e.g. "niche=software, site=recruitment" intersections.
  const bizCats = [
    ...new Set([
      ...detectNicheCategories(niche),
      ...detectNicheCategories(description),
      ...detectNicheCategories(companyName),
    ]),
  ];
  const seedCats = [
    ...new Set([
      ...detectNicheCategories(seeds.join(' ')),
      ...detectNicheCategories(audience),
      ...detectNicheCategories(crawlBlob),
    ]),
  ];

  const primaryCats = bizCats.length ? bizCats : [...seedCats];
  const secondaryCats = [...seedCats].filter(c => !primaryCats.includes(c));

  const coreTokens = new Set<string>();
  for (const c of primaryCats) {
    for (const t of NICHE_VOCABULARY[c] ?? []) coreTokens.add(t);
  }
  for (const t of tokenize(niche)) coreTokens.add(t);
  // Audience/description-derived single tokens also belong to the core —
  // e.g. "HR" from "HR managers" is a core brand token.
  for (const t of tokenize(audience)) coreTokens.add(t);
  for (const t of tokenize(description)) coreTokens.add(t);

  const mustHaveAnyTokens = new Set<string>();
  for (const c of secondaryCats) {
    for (const t of NICHE_VOCABULARY[c] ?? []) mustHaveAnyTokens.add(t);
  }
  // When the audience text itself references recruitment/hiring/etc., promote
  // those niche-vocabulary words into must-have territory too.
  const audienceCats = detectNicheCategories(audience);
  for (const c of audienceCats) {
    if (primaryCats.includes(c)) continue;
    for (const t of NICHE_VOCABULARY[c] ?? []) mustHaveAnyTokens.add(t);
  }

  let phraseBoosts = buildPhraseBoosts(primaryCats, secondaryCats);

  // Augment phrase boosts with crawl-derived 2–3-word phrases that contain at
  // least one core token AND one must-have (or commercial) token. This is how
  // we surface business-specific anchors like "tech hiring platform" or
  // "software developer staffing" when the user only typed "software engineering".
  if (crawl) {
    const commercial = DEFAULT_COMMERCIAL_MODIFIERS.map(m => m.toLowerCase());
    for (const phrase of crawl.topPhrases.slice(0, 40)) {
      const tokens = tokenize(phrase);
      if (!tokens.length) continue;
      const coreHit = tokens.some(t => coreTokens.has(t));
      const mustHit = mustHaveAnyTokens.size
        ? tokens.some(t => mustHaveAnyTokens.has(t))
        : false;
      const commercialHit = commercial.some(m => phrase.includes(m));
      if ((coreHit && mustHit) || (coreHit && commercialHit)) {
        phraseBoosts.push(phrase);
      }
    }
    phraseBoosts = [...new Set(phraseBoosts)];
  }

  const commercialModifiers = [...DEFAULT_COMMERCIAL_MODIFIERS];
  if (secondaryCats.includes('recruitment') || primaryCats.includes('recruitment')) {
    commercialModifiers.push('staffing agency', 'talent acquisition', 'rpo');
  }

  const negativePatterns = buildNegativePatterns(primaryCats, secondaryCats, rawContext);

  // Synthetic seeds = phrase boosts (template + crawl-derived). We dedupe
  // and order with the strongest intersection phrases first so the top N
  // passed to keyword_ideas / related_keywords are the best anchors.
  const syntheticSeeds = [...new Set(phraseBoosts)];

  return {
    raw: rawContext,
    nichePhrase: niche,
    coreTokens,
    phraseBoosts,
    mustHaveAnyTokens,
    negativePatterns,
    commercialModifiers,
    syntheticSeeds,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Relevance / business-fit / negative-pattern gates
// ─────────────────────────────────────────────────────────────────────────────

function matchesNegativePattern(keyword: string, ctx: ProjectContext): boolean {
  for (const p of ctx.negativePatterns) {
    if (!p.test(keyword)) continue;
    // If the user's own niche/context also contains this word, the pattern
    // isn't "negative" here — e.g. a project about "payroll software" must
    // not blacklist "payroll".
    if (p.test(ctx.raw)) continue;
    return true;
  }
  return false;
}

/**
 * Additive relevance scorer: awards points for niche tokens, must-have tokens,
 * phrase anchors, and commercial modifiers, and penalises missing overlap,
 * over-generic 1–2 word queries, navigational-style queries, and negative
 * patterns. Returns a number clamped to 0–100.
 */
export function calculateRelevanceScore(keyword: string, ctx: ProjectContext): number {
  const kwLower = keyword.toLowerCase();
  const tokens = tokenize(kwLower);
  const wordCount = kwLower.split(/\s+/).filter(Boolean).length;

  let score = 0;

  const phraseHit = ctx.phraseBoosts.some(p => kwLower.includes(p.toLowerCase()));
  if (phraseHit) score += 35;

  const coreHits = tokens.filter(t => ctx.coreTokens.has(t)).length;
  if (coreHits >= 1) score += 20;
  if (coreHits >= 2) score += 10;

  const mustHits = ctx.mustHaveAnyTokens.size
    ? tokens.filter(t => ctx.mustHaveAnyTokens.has(t)).length
    : 0;
  if (mustHits >= 1) score += 20;

  if (ctx.commercialModifiers.some(m => kwLower.includes(m.toLowerCase()))) score += 10;

  if (wordCount >= 3 && wordCount <= 7) score += 5;

  if (matchesNegativePattern(keyword, ctx)) score -= 50;
  if (coreHits === 0 && mustHits === 0 && !phraseHit) score -= 25;
  if (wordCount <= 2) score -= 20;
  if (/\bfull form\b|\bmeaning\b|\blogin\b|\bstatus\b/i.test(kwLower)) score -= 20;

  return Math.round(clamp(score, 0, 100));
}

/**
 * Tiered business-fit scorer. Returns 100 only when the keyword is a near-
 * perfect match (exact phrase or niche + commercial intersection); 70–85 for
 * niche-only; 30 for commercial-only; 0 when a negative pattern hits or
 * nothing overlaps.
 */
export function calculateBusinessFitScore(keyword: string, ctx: ProjectContext): number {
  if (matchesNegativePattern(keyword, ctx)) return 0;

  const kwLower = keyword.toLowerCase();
  const tokens = new Set(tokenize(kwLower));
  const coreHits = [...tokens].filter(t => ctx.coreTokens.has(t)).length;
  const mustHit = ctx.mustHaveAnyTokens.size > 0
    && [...tokens].some(t => ctx.mustHaveAnyTokens.has(t));
  const phraseHit = ctx.phraseBoosts.some(p => kwLower.includes(p.toLowerCase()));
  const commercialHit = ctx.commercialModifiers.some(m => kwLower.includes(m.toLowerCase()));

  if (phraseHit) return 100;

  // Dual-context: a secondary category exists, so the highest tier requires
  // an intersection of both niche and must-have tokens.
  if (ctx.mustHaveAnyTokens.size > 0) {
    if (coreHits >= 2 && mustHit) return 95;
    if (coreHits >= 1 && mustHit) return commercialHit ? 90 : 85;
    if (coreHits >= 2) return 60;
    if (coreHits >= 1) return 50;
    if (mustHit) return 30;
    return 0;
  }

  // Single-context: no secondary category detected, niche hits alone drive
  // the score.
  if (coreHits >= 2) return 85;
  if (coreHits >= 1) return commercialHit ? 75 : 70;
  return 25;
}

/**
 * Composite SEO-opportunity score. Relevance and business-fit still carry
 * the majority of the weight so on-topic keywords sort to the top, but we
 * no longer zero-gate on low relevance / fit — the pipeline no longer
 * filters upstream, so every keyword we return must produce a displayable
 * score (otherwise the UI shows "—" for dozens of rows).
 */
export function calculateKeywordAnalysisScore(kw: DiscoveredKeyword): number {
  const fit = kw.business_fit_score ?? 0;
  const rel = kw.relevance_score ?? 0;

  const intent = intentScore(kw.intent);
  const kd = lowDifficultyScore(kw.kd);
  const vol = volumeScore(kw.volume);
  const cpc = cpcScore(kw.cpc);
  const serp = serpOpportunityScore(kw.serp_results);

  const score =
    0.32 * fit +
    0.24 * rel +
    0.13 * intent +
    0.11 * kd +
    0.09 * vol +
    0.07 * cpc +
    0.04 * serp;

  return Math.round(clamp(score, 0, 100));
}

// ─────────────────────────────────────────────────────────────────────────────
// Existing lightweight vitals lookup (unchanged shape, used by Content Health)
// ─────────────────────────────────────────────────────────────────────────────

export interface KeywordVitals {
  keyword: string;
  /** Monthly search volume (0 when unknown). */
  volume: number;
  /** Percent change vs prior period, signed. Empty string when unknown. */
  trend: string;
  /** Numeric trend pct for sorting/filtering. */
  trend_pct: number;
  /** Last ~12 months of search volume for sparkline rendering. */
  monthly_searches: { month: string; volume: number }[];
}

/**
 * Look up current search demand for a list of keywords. Used by the Content
 * Health audit to answer: "is the keyword this blog targets still trending,
 * or is demand dying?".
 *
 * AHREFS-FIRST: tries Ahrefs Keywords Explorer `overview` first (richer data,
 * includes parent topic + intents + traffic potential). Falls back to
 * DataForSEO `keyword_overview/live` for any keywords Ahrefs didn't return.
 *
 * Returns a Map keyed by the lower-cased keyword. May be empty if neither
 * provider is reachable — callers should treat this as optional.
 */
function discoveredKeywordToVitals(kw: DiscoveredKeyword): KeywordVitals {
  let trend_pct = 0;
  const t = kw.trend?.trim();
  if (t) {
    const m = t.match(/^([+-]?\d+)/);
    if (m) trend_pct = parseInt(m[1], 10);
  }
  const ms = kw.monthly_searches;
  if (!trend_pct && ms.length >= 2) {
    const a = ms[ms.length - 1]?.volume ?? 0;
    const b = ms[ms.length - 2]?.volume ?? 0;
    if (b > 0) trend_pct = Math.round(((a - b) / b) * 100);
  }
  return {
    keyword: kw.keyword,
    volume: kw.volume,
    trend: kw.trend,
    trend_pct,
    monthly_searches: ms ?? [],
  };
}

export async function fetchKeywordVitals(
  keywords: string[],
  region: string,
  language: string = 'en'
): Promise<Map<string, KeywordVitals>> {
  const out = new Map<string, KeywordVitals>();
  const clean = [...new Set(keywords.map(k => k.trim()).filter(Boolean))];
  if (!clean.length) return out;

  if (isAhrefsConfigured()) {
    try {
      const overview = await ahrefsKeywordOverview(clean, region);
      for (const [k, row] of overview.entries()) {
        out.set(k, ahrefsRowToVitals(row));
      }
    } catch (e) {
      console.warn('[ahrefs] fetchKeywordVitals failed:', e);
    }
  }

  const missing = [...new Set(clean.map(k => k.trim().toLowerCase()))].filter(k => !out.has(k));
  const auth = getAuthHeader();
  if (!missing.length || !auth) return out;

  const locationCode = getLocationCode(region);
  const languageCode = (language || 'en').trim().slice(0, 2).toLowerCase() || 'en';
  const trace: DataForSEOTraceEntry[] = [];
  const dfsMap = await fetchKeywordOverview(missing, locationCode, languageCode, auth, trace);
  for (const [k, dk] of dfsMap.entries()) {
    if (!out.has(k)) out.set(k, discoveredKeywordToVitals(dk));
  }
  return out;
}

/**
 * Like `fetchKeywordVitals` but returns the full DataForSEO record — adds
 * keyword difficulty + CPC, which `KeywordVitals` drops. Used where the
 * caller needs KD/CPC alongside volume (e.g. scoring freshly AI-suggested
 * keyword ideas before the user schedules them).
 */
export async function fetchKeywordMetrics(
  keywords: string[],
  region: string,
  language: string = 'en'
): Promise<Map<string, DiscoveredKeyword>> {
  const clean = [...new Set(keywords.map(k => k.trim()).filter(Boolean))];
  const out = new Map<string, DiscoveredKeyword>();
  if (!clean.length) return out;
  const auth = getAuthHeader();
  if (!auth) return out;
  const locationCode = getLocationCode(region);
  const languageCode = (language || 'en').trim().slice(0, 2).toLowerCase() || 'en';
  const trace: DataForSEOTraceEntry[] = [];
  return fetchKeywordOverview(clean, locationCode, languageCode, auth, trace);
}

/** Convert an Ahrefs keyword overview row into our common KeywordVitals shape. */
function ahrefsRowToVitals(row: AhrefsKeywordOverviewRow): KeywordVitals {
  return {
    keyword: row.keyword,
    volume: row.volume || 0,
    // Ahrefs Overview doesn't expose a monthly trend percentage in the same
    // way DataForSEO does — we leave trend empty and let the UI fall back to
    // the DataForSEO-sourced value when present.
    trend: '',
    trend_pct: 0,
    monthly_searches: [],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Google Ads Keywords For Site — competitor benchmark keyword list
// ─────────────────────────────────────────────────────────────────────────────

/**
 * One keyword row from `keywords_data/google_ads/keywords_for_site/live`,
 * normalized to the shape the competitor benchmark pipeline expects.
 */
export interface CompetitorKeywordsForSiteRow {
  keyword: string;
  volume: number;
  kd: number;
  cpc: number;
  intent: Intent;
  /** Populated when the upstream payload includes an ETV-style estimate. */
  estimated_monthly_traffic?: number | null;
  /** Keywords For Site does not return SERP rank — always 0. */
  competitor_position: number;
  /** Site-level landing URL for the competitor (no per-keyword URL from API). */
  competitor_url: string;
  /** Set server-side when this phrase matches `keywords` for the project. */
  matched_keyword_id?: string | null;
  matched_status?: 'pending' | 'approved' | 'rejected' | null;
  keyword_analysis_score?: number | null;
  /** True when `keyword_analysis_score` comes from the matched industry row; false when it is an AI estimate. */
  analysis_score_is_industry?: boolean;
}

interface DfsGoogleAdsKeywordForSiteItem {
  keyword?: string;
  search_volume?: number | null;
  cpc?: number | string | null;
  competition?: string | null;
  competition_index?: number | null;
  /** Some responses include organic traffic estimates (field name varies). */
  etv?: number | null;
  estimated_traffic?: number | null;
  monthly_traffic?: number | null;
}

function competitionLevelToKdHint(level: string | null | undefined): number {
  const v = (level ?? '').toUpperCase();
  if (v === 'LOW') return 25;
  if (v === 'MEDIUM') return 55;
  if (v === 'HIGH') return 80;
  return 0;
}

/**
 * Calls DataForSEO `keywords_data/google_ads/keywords_for_site/live` for a
 * single competitor domain (or URL). Uses the project region for
 * `location_code` and sorts by `search_volume` descending server-side.
 *
 * @see https://docs.dataforseo.com/v3/keywords_data-google_ads-keywords_for_site-live/
 */
export type GoogleAdsKeywordsForSiteFetchResult = {
  rows: CompetitorKeywordsForSiteRow[];
  trace: DataForSEOTraceEntry[];
};

export async function fetchGoogleAdsKeywordsForSite(
  competitorTarget: string,
  regionCode: string,
  languageCode: string = 'en',
  limit: number = 100
): Promise<GoogleAdsKeywordsForSiteFetchResult> {
  const auth = getAuthHeader();
  if (!auth) {
    console.warn('[dataforseo] fetchGoogleAdsKeywordsForSite: credentials missing');
    return { rows: [], trace: [] };
  }

  const target = extractDomainFromUrl(competitorTarget) || competitorTarget.trim().toLowerCase();
  if (!target) return { rows: [], trace: [] };

  const locationCode = getLocationCode(regionCode);
  const trace: DataForSEOTraceEntry[] = [];

  const body = [
    {
      target,
      target_type: 'site' as const,
      location_code: locationCode,
      language_code: languageCode,
      search_partners: true,
      limit,
      sort_by: 'search_volume',
    },
  ];

  console.log(
    `[dataforseo] keywords_for_site → target="${target}" location_code=${locationCode} language_code=${languageCode} limit=${limit}`
  );

  const parsed = (await dfsPost(
    'keywords_data/google_ads/keywords_for_site/live',
    body,
    auth,
    trace
  )) as {
    tasks?: Array<{
      result?: DfsGoogleAdsKeywordForSiteItem[];
    }>;
  } | null;

  const rawItems: DfsGoogleAdsKeywordForSiteItem[] = parsed?.tasks?.[0]?.result ?? [];
  const baseUrl = `https://${target.replace(/^www\./, '')}`;

  const keywords = rawItems
    .slice(0, limit)
    .map((it): CompetitorKeywordsForSiteRow | null => {
      const keyword = (it.keyword ?? '').trim().toLowerCase();
      if (!keyword) return null;

      const volume = Number(it.search_volume ?? 0) || 0;
      const rawCpc = it.cpc;
      const cpc = rawCpc != null ? Number(rawCpc) || 0 : 0;
      const idx = it.competition_index;
      const kd =
        typeof idx === 'number' && Number.isFinite(idx)
          ? Math.max(0, Math.min(100, Math.round(idx)))
          : competitionLevelToKdHint(it.competition ?? null);

      const etvRaw = it.etv ?? it.estimated_traffic ?? it.monthly_traffic;
      const estimated_monthly_traffic =
        typeof etvRaw === 'number' && Number.isFinite(etvRaw) && etvRaw > 0 ? Math.round(etvRaw) : null;

      return {
        keyword,
        volume,
        kd,
        cpc,
        intent: '',
        estimated_monthly_traffic,
        competitor_position: 0,
        competitor_url: baseUrl,
      };
    })
    .filter((x): x is CompetitorKeywordsForSiteRow => x !== null);

  console.log(
    `[dataforseo] keywords_for_site parsed → ${keywords.length} keywords for ${target}`,
    keywords.slice(0, 10)
  );

  return { rows: keywords, trace };
}

// ─────────────────────────────────────────────────────────────────────────────
// Full keyword-analysis pipeline
// ─────────────────────────────────────────────────────────────────────────────

const SERP_BOILERPLATE_DOMAINS = new Set([
  'google.com', 'youtube.com', 'facebook.com', 'instagram.com',
  'linkedin.com', 'wikipedia.org', 'en.wikipedia.org', 'twitter.com', 'x.com',
  'pinterest.com', 'tiktok.com', 'reddit.com', 'quora.com', 'medium.com',
  'amazon.com', 'amazon.in',
]);

function pickCompetitorDomains(
  results: DiscoveredSerpResult[],
  ownDomain: string,
  max: number = 5
): string[] {
  const own = (ownDomain || '').toLowerCase();
  const seen = new Map<string, number>();
  for (const r of results) {
    const d = (r.domain || extractDomainFromUrl(r.url)).toLowerCase();
    if (!d) continue;
    if (own && (d === own || d.endsWith('.' + own))) continue;
    if (SERP_BOILERPLATE_DOMAINS.has(d)) continue;
    seen.set(d, (seen.get(d) ?? 0) + 1);
  }
  return [...seen.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
    .map(([d]) => d);
}

/** Push a synthetic trace entry so failures / rejections appear in the
 * DevTools discoveryTrace without needing extra state. */
function pushDebugTrace(
  trace: DataForSEOTraceEntry[],
  label: string,
  payload: unknown
): void {
  trace.push({
    label,
    url: '',
    requestBody: null,
    httpStatus: 0,
    ok: true,
    rawText: '',
    parsed: payload,
  });
}

export async function discoverKeywordsForProject(
  seedKeywords: string[],
  region: string,
  language: string = 'en',
  targetUrl?: string,
  businessDomain?: string,
  extras: ProjectContextExtras = {}
): Promise<DiscoverKeywordsForProjectResult> {
  const trace: DataForSEOTraceEntry[] = [];
  // Provider routing now happens inside `getKeywordResearchData` — Ahrefs is
  // tried first and DataForSEO is the fallback. We deliberately do NOT
  // short-circuit on a missing Ahrefs key here so users with only DataForSEO
  // configured still get keyword data through the fallback path.

  const ownDomain = extractDomainFromUrl(targetUrl ?? '');
  const seeds = seedKeywords.map(s => s.trim()).filter(Boolean);

  // 1a. Log the raw form inputs exactly as they reached the server action —
  //     makes it trivial to verify in DevTools that the niche / audience /
  //     description / company name were actually threaded through.
  pushDebugTrace(trace, '(project_input)', {
    seedKeywords: seeds,
    region,
    language,
    targetUrl: targetUrl ?? '',
    businessDomain: businessDomain ?? '',
    targetAudience: extras.targetAudience ?? '',
    description: extras.description ?? '',
    companyName: extras.companyName ?? '',
  });

  // 1b. Echo what the crawler saw on the live domain so the relevance scorer's
  //     decisions can be reasoned about offline from the trace alone. We
  //     deliberately DO NOT emit a "skipped" placeholder — the caller is
  //     contract-bound to pass a real WebsiteCrawlResult (the crawler never
  //     throws; on empty/invalid URLs it returns a stub with `error` set), so
  //     if this trace is ever missing fields it means a bug in the caller.
  const c = extras.crawl;
  pushDebugTrace(
    trace,
    '(crawled_website_context)',
    c
      ? {
          url: c.finalUrl || c.url,
          status: c.status,
          title: c.title,
          metaDescription: c.metaDescription,
          h1: c.headings.h1,
          h2: c.headings.h2.slice(0, 20),
          h3: c.headings.h3.slice(0, 20),
          navText: c.navText.slice(0, 3),
          linkTexts: c.linkTexts.slice(0, 40),
          urlSlugs: c.urlSlugs.slice(0, 40),
          topPhrases: c.topPhrases.slice(0, 40),
          wordCount: c.wordCount,
          error: c.error ?? null,
        }
      : {
          url: '',
          status: 0,
          title: '',
          metaDescription: '',
          h1: [],
          h2: [],
          h3: [],
          navText: [],
          linkTexts: [],
          urlSlugs: [],
          topPhrases: [],
          wordCount: 0,
          error: 'caller did not pass extras.crawl — upgrade the caller',
        }
  );

  // 1c. Build the project context — the single source of truth for every
  //     relevance / business-fit / negative-pattern decision below.
  const context = buildProjectContext(seeds, businessDomain, targetUrl, extras);
  pushDebugTrace(trace, '(project_context)', {
    nichePhrase: context.nichePhrase,
    coreTokens: [...context.coreTokens].slice(0, 60),
    mustHaveAnyTokens: [...context.mustHaveAnyTokens].slice(0, 60),
    phraseBoosts: context.phraseBoosts,
    negativePatterns: context.negativePatterns.map(p => p.toString()),
    commercialModifiers: context.commercialModifiers,
  });

  // 2. Seeds go to Ahrefs VERBATIM — we no longer merge in synthetic
  //    cross-product phrases. The user's raw form input is the source of truth.
  const userSeeds = seeds.slice(0, 20);

  pushDebugTrace(trace, '(synthetic_seeds)', {
    fromTemplatesAndCrawl: context.syntheticSeeds,
    userSeeds: seeds,
    actuallySentToAhrefs: userSeeds,
    note: 'synthetic seeds are computed for context/scoring only; the request body uses the raw user inputs',
    count: userSeeds.length,
  });

  // Echo the seeds we're about to send to the keyword-research provider.
  pushDebugTrace(trace, '(keyword_research_request)', {
    primary_provider: 'ahrefs',
    fallback_provider: 'dataforseo',
    body: {
      seeds: userSeeds,
      region,
      language,
      per_endpoint_limit: 100,
    },
    note:
      'Ahrefs is tried first; on any failure (missing key, 401/403, 429, quota exhausted, network timeout, or empty result) the orchestrator automatically falls back to DataForSEO and returns the same normalized shape.',
  });

  // 3. Discovery — primary path is Ahrefs (matching + related + search-
  //    suggestions). If Ahrefs is misconfigured, returns an error, or yields
  //    zero keywords, the orchestrator falls back to DataForSEO
  //    (keyword_ideas/live + related_keywords/live). Both branches return
  //    `NormalizedKeyword[]` so the relevance / business-fit / scoring
  //    pipeline below stays provider-agnostic.
  let researchKeywords: NormalizedKeyword[] = [];
  let researchTrace: KeywordResearchTraceEntry[] = [];
  let researchProvider: 'ahrefs' | 'dataforseo' = 'ahrefs';
  let researchFellBack = false;
  let researchFallbackReason: string | undefined;
  let ahrefsDiscoveryState: DiscoverKeywordsForProjectResult["ahrefsDiscoveryState"] = undefined;
  try {
    const research = await getKeywordResearchData({
      seeds: userSeeds,
      region,
      language,
      limit: 40,
      maxResults: 150,
      matchingLastVolume: extras.matchingLastVolume,
      relatedLastVolume: extras.relatedLastVolume,
      queryMatching: extras.queryMatching,
      queryRelated: extras.queryRelated,
      targetDomain: ownDomain || undefined,
    });
    researchKeywords = research.keywords;
    researchTrace = research.trace;
    researchProvider = research.provider;
    researchFellBack = research.fellBackToDataForSEO;
    researchFallbackReason = research.fallbackReason;
    ahrefsDiscoveryState = research.ahrefsDiscoveryState;
  } catch (e) {
    // Both providers failed — push the error to the trace and continue with
    // an empty keyword set. Competitor mining below may still yield rows.
    const message = e instanceof Error ? e.message : String(e);
    const traceFromError =
      e && typeof e === 'object' && 'trace' in e
        ? ((e as { trace?: KeywordResearchTraceEntry[] }).trace ?? [])
        : [];
    researchTrace = traceFromError;
    pushDebugTrace(trace, '(keyword_research_failure)', {
      error: message,
      note: 'Both Ahrefs and DataForSEO failed; continuing with empty research result.',
    });
  }

  // Forward each upstream call into the existing DataForSEO-shaped trace so
  // the keywords page's DevTools logger keeps working without changes.
  for (const entry of researchTrace) {
    trace.push({
      label: `[${entry.provider}] ${entry.endpoint}${entry.fallbackReason ? ` → fallback (${entry.fallbackReason})` : ''}`,
      url: '',
      requestBody: entry.query || null,
      httpStatus: entry.status ?? 0,
      ok: entry.ok,
      rawText: '',
      parsed: {
        ms: entry.ms,
        rows: entry.rows,
        errorReason: entry.errorReason,
        fallbackReason: entry.fallbackReason,
        query: entry.query,
        response: entry.response,
      },
      fetchError: entry.errorMessage,
    });
  }

  pushDebugTrace(trace, '(keyword_research_result)', {
    provider: researchProvider,
    fellBackToDataForSEO: researchFellBack,
    fallbackReason: researchFallbackReason,
    keyword_count: researchKeywords.length,
  });

  // Competitor mining: organic-competitors gives us up to 5 domains the user
  // really competes against; organic-keywords on each surfaces real ranking
  // gaps with verified search volume + KD. Best-effort — returns [] when
  // Ahrefs is unavailable, since DataForSEO has no comparable endpoint.
  const competitorMined = await (async (): Promise<{
    keywords: AhrefsKeywordIdea[];
    competitors: string[];
  }> => {
    if (researchProvider === 'ahrefs') {
      return { keywords: [], competitors: [] };
    }
    if (!isAhrefsConfigured()) {
      pushDebugTrace(trace, '(ahrefs_competitor_mining_skipped)', {
        reason: 'AHREFS_API_KEY missing — competitor mining requires Ahrefs Site Explorer.',
      });
      return { keywords: [], competitors: [] };
    }
    const targetForSiteExplorer = ownDomain || extractDomainFromUrl(businessDomain ?? '');
    if (!targetForSiteExplorer) return { keywords: [], competitors: [] };
    try {
      const competitors = await ahrefsOrganicCompetitors(targetForSiteExplorer, region, 5);
      const competitorDomains = competitors.map(c => c.competitor_domain).filter(Boolean);
      pushDebugTrace(trace, '(ahrefs_organic_competitors)', {
        target: targetForSiteExplorer,
        count: competitorDomains.length,
        competitors: competitorDomains,
      });
      if (!competitorDomains.length) return { keywords: [], competitors: [] };
      const perCompetitor = await Promise.all(
        competitorDomains.slice(0, 5).map(c =>
          ahrefsOrganicKeywords(c, region, 30).then(rows =>
            rows.map<AhrefsKeywordIdea>(r => ({
              keyword: r.keyword,
              volume: r.volume,
              cpc: r.cpc,
              difficulty: r.keyword_difficulty,
              intents: null,
              parent_topic: null,
              traffic_potential: null,
              global_volume: null,
            }))
          ).catch(e => {
            pushDebugTrace(trace, '(ahrefs_organic_keywords_error)', {
              competitor: c,
              error: e instanceof Error ? e.message : String(e),
            });
            return [] as AhrefsKeywordIdea[];
          })
        )
      );
      const flat = perCompetitor.flat();
      pushDebugTrace(trace, '(ahrefs_competitor_mined_keywords)', {
        competitors: competitorDomains,
        rows: flat.length,
      });
      return { keywords: flat, competitors: competitorDomains };
    } catch (e) {
      pushDebugTrace(trace, '(ahrefs_organic_competitors_error)', {
        error: e instanceof Error ? e.message : String(e),
      });
      return { keywords: [], competitors: [] };
    }
  })();

  // Convert NormalizedKeyword[] (provider-agnostic) → DiscoveredKeyword[]
  // (the shape used by the relevance / business-fit / scoring pipeline).
  const researchAsDiscovered: DiscoveredKeyword[] = researchKeywords.map(k => ({
    keyword: k.keyword,
    volume: k.volume,
    kd: k.difficulty ?? 0,
    cpc: k.cpc ?? 0,
    trend: k.trend,
    competition_level: k.competitionLevel,
    intent: k.intent,
    monthly_searches: k.monthlySearches,
    secondary_keywords: [],
    keyword_analysis_score: 0,
    source: [`${k.source}_${k.endpoint}`],
  }));

  const ahrefsIdeas: DiscoveredKeyword[] = mergeKeywordCandidates(
    researchAsDiscovered,
    ahrefsIdeasToDiscovered(competitorMined.keywords)
  );

  // 4. Score relevance + business-fit using the project context (niche,
  //    audience, crawl, etc.). Negative patterns zero out off-topic noise.
  const merged = mergeKeywordCandidates(ahrefsIdeas);

  for (const kw of merged) {
    if (!kw.keyword) continue;
    const neg = matchesNegativePattern(kw.keyword, context);
    kw.relevance_score = neg ? 0 : calculateRelevanceScore(kw.keyword, context);
    kw.business_fit_score = neg ? 0 : calculateBusinessFitScore(kw.keyword, context);
    kw.suggested_content_type = suggestedContentType(kw.keyword);
  }

  // 5. Enrichment — bulk Keywords Explorer Overview for any rows that came
  //    from competitor mining (where `intents`/`parent_topic`/`traffic_potential`
  //    aren't populated by organic-keywords). We chunk by 700 to respect the
  //    Ahrefs `keywords` limit and skip rows that already have full data.
  //    For paginated discovery via Ahrefs, we skip this to avoid extra calls/costs.
  //    For paginated discovery via Ahrefs, we skip this to avoid extra calls/costs.
  const needsOverview = researchProvider === 'ahrefs' ? [] : merged.filter(
    k => !k.kd || !k.volume
  );
  if (needsOverview.length) {
    try {
      const overviewMap = await ahrefsKeywordOverview(
        needsOverview.map(k => k.keyword),
        region,
        'lean'
      );
      pushDebugTrace(trace, '(ahrefs_keywords_overview_enrich)', {
        requested: needsOverview.length,
        returned: overviewMap.size,
      });
      for (const kw of merged) {
        const o = overviewMap.get(kw.keyword.toLowerCase());
        if (!o) continue;
        if (!kw.volume && o.volume) kw.volume = o.volume;
        if (!kw.kd && o.difficulty) kw.kd = o.difficulty;
        if (!kw.cpc && o.cpc != null) {
          const cents = Number(o.cpc);
          if (Number.isFinite(cents) && cents > 0) kw.cpc = cents / 100;
        }
        if (!kw.intent && o.intents) {
          kw.intent = inferIntentFromAhrefs(o.intents);
        }
      }
    } catch (e) {
      pushDebugTrace(trace, '(ahrefs_keywords_overview_error)', {
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  // 6. Final composite score — used only for ordering in the UI.
  for (const kw of merged) {
    kw.keyword_analysis_score = calculateKeywordAnalysisScore(kw);
  }
  merged.sort(
    (a, b) => (b.keyword_analysis_score ?? 0) - (a.keyword_analysis_score ?? 0)
  );

  // Legacy helpers kept around for /keywords/new flow but not called here.
  void fetchKeywordOverview;
  void fetchSerpForKeywords;
  void clusterKeywords;
  void pickCompetitorDomains;
  void fetchKeywordIdeas;
  void fetchRelatedKeywords;
  void fetchBulkKeywordDifficulty;
  void getLocationCode;
  void getAuthHeader;
  void errEntry;

  return { keywords: merged, trace, ahrefsDiscoveryState };
}

function errEntry(label: string, e: unknown): DataForSEOTraceEntry {
  return {
    label: `${label} (exception)`,
    url: '',
    requestBody: null,
    httpStatus: 0,
    ok: false,
    rawText: '',
    parsed: null,
    fetchError: e instanceof Error ? e.message : String(e),
  };
}
