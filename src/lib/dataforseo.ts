import { TARGET_REGIONS } from './types';

export type Intent = 'informational' | 'commercial' | 'navigational' | 'transactional' | '';
export type CompetitionLevel = 'LOW' | 'MEDIUM' | 'HIGH' | '';

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
}

function getAuthHeader(): string | null {
  const login = process.env.DATAFORSEO_LOGIN;
  const password = process.env.DATAFORSEO_PASSWORD;
  if (!login || !password) return null;
  return `Basic ${Buffer.from(`${login}:${password}`).toString('base64')}`;
}

function getLocationCode(regionCode: string): number {
  const region = TARGET_REGIONS.find(r => r.code === regionCode);
  return region?.locationCode ?? 2840;
}

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
  const url = `https://api.dataforseo.com/v3/${endpoint}`;
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
    trace.push(entry);
  }
  return entry.parsed;
}

interface DfsIdeaItem {
  keyword?: string;
  keyword_info?: {
    search_volume?: number | null;
    cpc?: number | string | null;
    competition_level?: string | null;
    search_volume_trend?: {
      monthly?: number | null;
      quarterly?: number | null;
      yearly?: number | null;
    } | null;
    monthly_searches?: DfsMonthly[] | null;
  } | null;
  keyword_properties?: {
    keyword_difficulty?: number | null;
  } | null;
  search_intent_info?: {
    main_intent?: string | null;
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
      limit: 200,
      include_seed_keyword: true,
      // Keep results tightly related to the seed phrases — prevents the API
      // from drifting into unrelated entities (e.g. random company names) for
      // generic seeds.
      closely_variants: true,
      order_by: ['keyword_info.search_volume,desc'],
    },
  ];

  const parsed = (await dfsPost(
    'dataforseo_labs/google/keyword_ideas/live',
    body,
    auth,
    trace
  )) as {
    tasks?: Array<{
      result?: Array<{
        items?: DfsIdeaItem[];
      }>;
    }>;
  } | null;

  const items = parsed?.tasks?.[0]?.result?.[0]?.items ?? [];
  if (!items.length) return [];

  return items
    .filter(it => typeof it.keyword === 'string' && it.keyword.trim().length > 0)
    .map((it): DiscoveredKeyword => {
      const info = it.keyword_info ?? {};
      const props = it.keyword_properties ?? {};
      const intentInfo = it.search_intent_info ?? {};
      const monthly = info.monthly_searches ?? [];
      return {
        keyword: (it.keyword as string).trim(),
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
      };
    });
}

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
 * Look up current search demand for a list of keywords. Cheap (one
 * `keyword_overview/live` call covers up to ~700 keywords). Used by the
 * Content Health audit to answer: "is the keyword this blog targets still
 * trending, or is demand dying?".
 *
 * Returns a Map keyed by the lower-cased keyword. Returns an empty Map if
 * DataForSEO credentials are missing — caller should treat this as optional.
 */
export async function fetchKeywordVitals(
  keywords: string[],
  region: string,
  language: string = 'en'
): Promise<Map<string, KeywordVitals>> {
  const out = new Map<string, KeywordVitals>();
  const clean = [...new Set(keywords.map(k => k.trim()).filter(Boolean))];
  if (!clean.length) return out;

  const auth = getAuthHeader();
  if (!auth) return out;

  const locationCode = getLocationCode(region);
  const languageCode = language || 'en';
  const trace: DataForSEOTraceEntry[] = [];

  const body = [
    {
      keywords: clean.slice(0, 700),
      location_code: locationCode,
      language_code: languageCode,
    },
  ];

  const parsed = (await dfsPost(
    'dataforseo_labs/google/keyword_overview/live',
    body,
    auth,
    trace
  )) as {
    tasks?: Array<{
      result?: Array<{
        items?: DfsIdeaItem[];
      }>;
    }>;
  } | null;

  const items = parsed?.tasks?.[0]?.result?.[0]?.items ?? [];
  for (const it of items) {
    const kw = typeof it.keyword === 'string' ? it.keyword.trim() : '';
    if (!kw) continue;
    const info = it.keyword_info ?? {};
    const trendPct = Number(info.search_volume_trend?.monthly ?? 0) || 0;
    out.set(kw.toLowerCase(), {
      keyword: kw,
      volume: Number(info.search_volume ?? 0) || 0,
      trend: formatTrend(info.search_volume_trend?.monthly),
      trend_pct: trendPct,
      monthly_searches: (info.monthly_searches ?? []).slice(0, 12).map(m => ({
        month: `${m.year}-${String(m.month).padStart(2, '0')}`,
        volume: Number(m.search_volume ?? 0) || 0,
      })),
    });
  }

  return out;
}

export async function discoverKeywordsForProject(
  seedKeywords: string[],
  region: string,
  language: string = 'en'
): Promise<DiscoverKeywordsForProjectResult> {
  const trace: DataForSEOTraceEntry[] = [];
  const auth = getAuthHeader();
  if (!auth) {
    trace.push({
      label: '(config)',
      url: '',
      requestBody: null,
      httpStatus: 0,
      ok: false,
      rawText: '',
      parsed: null,
      fetchError: 'DATAFORSEO_LOGIN / DATAFORSEO_PASSWORD missing in server env',
    });
    return { keywords: [], trace };
  }

  const locationCode = getLocationCode(region);
  const languageCode = language || 'en';

  // `keyword_ideas/live` already returns keyword_difficulty, intent, trend,
  // competition_level, monthly_searches — so one call is enough.
  const ideas = await fetchKeywordIdeas(
    seedKeywords,
    locationCode,
    languageCode,
    auth,
    trace
  );

  return { keywords: ideas, trace };
}
