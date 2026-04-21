import { TARGET_REGIONS } from './types';

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

    console.log('DataForSEO URL:', url);
    console.log('DataForSEO request body:', JSON.stringify(body, null, 2));
    console.log('DataForSEO HTTP status:', entry.httpStatus);

    const parsed = entry.parsed as { cost?: number } | null;
    if (parsed && typeof parsed.cost === 'number') entry.cost = parsed.cost;
  } catch (e) {
    entry.fetchError = e instanceof Error ? e.message : String(e);
  } finally {
    trace.push(entry);
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

function parseTrendPct(trend: string | null | undefined): number {
  if (!trend) return 0;
  const m = String(trend).match(/-?\d+(\.\d+)?/);
  return m ? Number(m[0]) : 0;
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

async function fetchKeywordsForSite(
  targetDomain: string,
  locationCode: number,
  languageCode: string,
  auth: string,
  trace: DataForSEOTraceEntry[]
): Promise<DiscoveredKeyword[]> {
  if (!targetDomain) return [];
  const body = [
    {
      target: targetDomain,
      location_code: locationCode,
      language_code: languageCode,
      include_serp_info: true,
      limit: 50,
      order_by: ['keyword_info.search_volume,desc'],
    },
  ];
  const parsed = (await dfsPost(
    'dataforseo_labs/google/keywords_for_site/live',
    body,
    auth,
    trace
  )) as {
    tasks?: Array<{ result?: Array<{ items?: DfsIdeaItem[] }> }>;
  } | null;
  const items = parsed?.tasks?.[0]?.result?.[0]?.items ?? [];
  return items
    .map(it => itemToKeyword(it, 'keywords_for_site'))
    .filter((x): x is DiscoveredKeyword => x !== null);
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
      // Dropped from 200 → 100 to keep credits in check now that we fan out
      // across several additional endpoints downstream.
      limit: 100,
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
    tasks?: Array<{ result?: Array<{ items?: DfsIdeaItem[] }> }>;
  } | null;

  const items = parsed?.tasks?.[0]?.result?.[0]?.items ?? [];
  return items
    .map(it => itemToKeyword(it, 'keyword_ideas'))
    .filter((x): x is DiscoveredKeyword => x !== null);
}

async function fetchRelatedKeywords(
  seedKeywords: string[],
  locationCode: number,
  languageCode: string,
  auth: string,
  trace: DataForSEOTraceEntry[]
): Promise<DiscoveredKeyword[]> {
  const out: DiscoveredKeyword[] = [];
  // Cost control: only expand the top 5 seeds.
  for (const seed of seedKeywords.slice(0, 5)) {
    if (!seed || !seed.trim()) continue;
    const body = [
      {
        keyword: seed.trim(),
        location_code: locationCode,
        language_code: languageCode,
        include_seed_keyword: true,
        include_serp_info: true,
        depth: 1,
        limit: 25,
      },
    ];
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

async function fetchRankedKeywords(
  targetDomain: string,
  locationCode: number,
  languageCode: string,
  auth: string,
  trace: DataForSEOTraceEntry[],
  limit: number = 50
): Promise<DiscoveredKeyword[]> {
  if (!targetDomain) return [];
  const body = [
    {
      target: targetDomain,
      location_code: locationCode,
      language_code: languageCode,
      ignore_synonyms: true,
      item_types: ['organic', 'featured_snippet'],
      limit,
      order_by: ['keyword_data.keyword_info.search_volume,desc'],
    },
  ];
  const parsed = (await dfsPost(
    'dataforseo_labs/google/ranked_keywords/live',
    body,
    auth,
    trace
  )) as {
    tasks?: Array<{ result?: Array<{ items?: DfsIdeaItem[] }> }>;
  } | null;
  const items = parsed?.tasks?.[0]?.result?.[0]?.items ?? [];
  return items
    .map(it => itemToKeyword(it, 'ranked_keywords'))
    .filter((x): x is DiscoveredKeyword => x !== null);
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
      keywords: clean.slice(0, 150),
      location_code: locationCode,
      language_code: languageCode,
      include_serp_info: true,
      include_clickstream_data: true,
    },
  ];
  const parsed = (await dfsPost(
    'dataforseo_labs/google/keyword_overview/live',
    body,
    auth,
    trace
  )) as {
    tasks?: Array<{ result?: Array<{ items?: DfsIdeaItem[] }> }>;
  } | null;
  const items = parsed?.tasks?.[0]?.result?.[0]?.items ?? [];
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
      keywords: clean.slice(0, 150),
      location_code: locationCode,
      language_code: languageCode,
    },
  ];
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

async function fetchSerpForKeywords(
  topKeywords: string[],
  locationCode: number,
  languageCode: string,
  auth: string,
  trace: DataForSEOTraceEntry[]
): Promise<Map<string, DiscoveredSerpResult[]>> {
  const out = new Map<string, DiscoveredSerpResult[]>();
  for (const keyword of topKeywords) {
    const clean = (keyword || '').trim();
    if (!clean) continue;
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
    out.set(clean.toLowerCase(), rows);
  }
  return out;
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
      // Keep monthly_searches if the new one has more data
      if (kw.monthly_searches?.length && kw.monthly_searches.length > existing.monthly_searches.length) {
        existing.monthly_searches = kw.monthly_searches;
      }
      // Keep trend if missing
      if (!existing.trend && kw.trend) existing.trend = kw.trend;
      // Keep intent if missing
      if (!existing.intent && kw.intent) existing.intent = kw.intent;
      // Keep competition_level if missing
      if (!existing.competition_level && kw.competition_level) {
        existing.competition_level = kw.competition_level;
      }
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

function competitionScore(level: CompetitionLevel): number {
  switch (level) {
    case 'HIGH': return 90;
    case 'MEDIUM': return 75;
    case 'LOW': return 55;
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

function trendScore(trend: string): number {
  const pct = clamp(parseTrendPct(trend), -50, 100);
  return clamp(50 + pct / 2, 0, 100);
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

export function buildProjectContext(
  seedKeywords: string[],
  businessDomain?: string,
  targetUrl?: string
): ProjectContext {
  const seeds = (seedKeywords || []).map(s => s.trim()).filter(Boolean);
  const niche = (businessDomain || '').trim() || seeds.slice(0, 3).join(' ');
  const domainOnly = extractDomainFromUrl(targetUrl || '');
  const rawContext = [niche, ...seeds, domainOnly].join(' ').toLowerCase();

  const bizCats = detectNicheCategories(niche);
  const seedCats = detectNicheCategories(seeds.join(' '));

  const primaryCats = bizCats.length ? bizCats : [...seedCats];
  const secondaryCats = [...seedCats].filter(c => !bizCats.includes(c));

  const coreTokens = new Set<string>();
  for (const c of primaryCats) {
    for (const t of NICHE_VOCABULARY[c] ?? []) coreTokens.add(t);
  }
  for (const t of tokenize(niche)) coreTokens.add(t);

  const mustHaveAnyTokens = new Set<string>();
  for (const c of secondaryCats) {
    for (const t of NICHE_VOCABULARY[c] ?? []) mustHaveAnyTokens.add(t);
  }

  const phraseBoosts = buildPhraseBoosts(primaryCats, secondaryCats);

  const commercialModifiers = [...DEFAULT_COMMERCIAL_MODIFIERS];
  if (secondaryCats.includes('recruitment') || primaryCats.includes('recruitment')) {
    commercialModifiers.push('staffing agency', 'talent acquisition', 'rpo');
  }

  const negativePatterns = buildNegativePatterns(primaryCats, secondaryCats, rawContext);

  return {
    raw: rawContext,
    nichePhrase: niche,
    coreTokens,
    phraseBoosts,
    mustHaveAnyTokens,
    negativePatterns,
    commercialModifiers,
    syntheticSeeds: [...phraseBoosts],
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

function isRelevantKeyword(kw: DiscoveredKeyword, ctx: ProjectContext): boolean {
  if (matchesNegativePattern(kw.keyword, ctx)) {
    kw.relevance_score = 0;
    kw.business_fit_score = 0;
    return false;
  }
  const relevance = calculateRelevanceScore(kw.keyword, ctx);
  const fit = calculateBusinessFitScore(kw.keyword, ctx);
  kw.relevance_score = relevance;
  kw.business_fit_score = fit;

  if (relevance < 45) return false;
  if (fit < 35) return false;

  const sources = kw.source ?? [];
  // Keywords that came *only* from site-attribution endpoints (so we'd never
  // have found them via semantic seed expansion) must clear a higher bar —
  // these are the rows that in the old pipeline caused "ecr filing" to leak
  // through just because taggd.in happened to rank for it.
  if (
    (sources.includes('keywords_for_site') || sources.includes('ranked_keywords')) &&
    !sources.includes('keyword_ideas') &&
    !sources.includes('related_keywords')
  ) {
    return relevance >= 55;
  }
  return true;
}

/**
 * Composite SEO-opportunity score. Relevance and business-fit carry the
 * majority of the weight now, and if either of them is below the gate the
 * overall score collapses to 0 — so the final sort can never re-surface a
 * high-volume-but-off-topic keyword.
 */
export function calculateKeywordAnalysisScore(kw: DiscoveredKeyword): number {
  const fit = kw.business_fit_score ?? 0;
  const rel = kw.relevance_score ?? 0;
  // Hard gates — mirrors the filter so the stored score matches the filter.
  if (fit < 35) return 0;
  if (rel < 45) return 0;

  const intent = intentScore(kw.intent);
  const kd = lowDifficultyScore(kw.kd);
  const vol = volumeScore(kw.volume);
  const cpc = cpcScore(kw.cpc);
  const comp = competitionScore(kw.competition_level);
  const trend = trendScore(kw.trend);
  const serp = serpOpportunityScore(kw.serp_results);

  const score =
    0.30 * fit +
    0.22 * rel +
    0.12 * intent +
    0.10 * kd +
    0.08 * vol +
    0.06 * cpc +
    0.04 * comp +
    0.04 * trend +
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

// ─────────────────────────────────────────────────────────────────────────────
// Full keyword-analysis pipeline
// ─────────────────────────────────────────────────────────────────────────────

const SERP_BOILERPLATE_DOMAINS = new Set([
  'google.com', 'youtube.com', 'facebook.com', 'instagram.com',
  'linkedin.com', 'wikipedia.org', 'en.wikipedia.org', 'twitter.com', 'x.com',
  'pinterest.com', 'tiktok.com',
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
  businessDomain?: string
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
  const ownDomain = extractDomainFromUrl(targetUrl ?? '');
  const seeds = seedKeywords.map(s => s.trim()).filter(Boolean);

  // 1. Build the project context — this is the single source of truth for
  //    every relevance / business-fit / negative-pattern decision below.
  const context = buildProjectContext(seeds, businessDomain, targetUrl);
  pushDebugTrace(trace, '(project_context)', {
    nichePhrase: context.nichePhrase,
    coreTokens: [...context.coreTokens].slice(0, 40),
    mustHaveAnyTokens: [...context.mustHaveAnyTokens].slice(0, 40),
    phraseBoosts: context.phraseBoosts,
    negativePatterns: context.negativePatterns.map(p => p.toString()),
    commercialModifiers: context.commercialModifiers,
    syntheticSeedCount: context.syntheticSeeds.length,
  });

  // 2. Compose enriched seeds — synthetic cross-product phrases go first so
  //    `keyword_ideas` and `related_keywords` are anchored on them rather
  //    than on the generic user input.
  const mergedSeeds: string[] = [];
  const seenSeed = new Set<string>();
  for (const s of [...context.syntheticSeeds, ...seeds]) {
    const norm = s.toLowerCase().trim();
    if (!norm || seenSeed.has(norm)) continue;
    seenSeed.add(norm);
    mergedSeeds.push(s);
  }

  // 3. Fire off discovery endpoints in parallel, guarding each so one
  //    failure never sinks the whole run.
  const siteKwPromise = ownDomain
    ? fetchKeywordsForSite(ownDomain, locationCode, languageCode, auth, trace).catch(e => {
        trace.push(errEntry('keywords_for_site', e));
        return [] as DiscoveredKeyword[];
      })
    : Promise.resolve([] as DiscoveredKeyword[]);

  const ideasPromise = fetchKeywordIdeas(mergedSeeds, locationCode, languageCode, auth, trace).catch(e => {
    trace.push(errEntry('keyword_ideas', e));
    return [] as DiscoveredKeyword[];
  });

  const relatedPromise = fetchRelatedKeywords(mergedSeeds, locationCode, languageCode, auth, trace).catch(e => {
    trace.push(errEntry('related_keywords', e));
    return [] as DiscoveredKeyword[];
  });

  const rankedOwnPromise = ownDomain
    ? fetchRankedKeywords(ownDomain, locationCode, languageCode, auth, trace, 50).catch(e => {
        trace.push(errEntry('ranked_keywords(own)', e));
        return [] as DiscoveredKeyword[];
      })
    : Promise.resolve([] as DiscoveredKeyword[]);

  const [siteKw, ideas, related, rankedOwn] = await Promise.all([
    siteKwPromise,
    ideasPromise,
    relatedPromise,
    rankedOwnPromise,
  ]);

  // 4. Merge + dedupe all candidates.
  let merged = mergeKeywordCandidates(siteKw, ideas, related, rankedOwn);

  // 5. RELEVANCE-FIRST filter (before any enrichment). This is the critical
  //    change vs. the previous pipeline — we never let an off-topic keyword
  //    into the top-150 enrichment slice just because its volume is high.
  const rejected: Array<{
    keyword: string;
    source: string[];
    volume: number;
    relevance_score: number;
    business_fit_score: number;
    reason: string;
  }> = [];

  const kept: DiscoveredKeyword[] = [];
  for (const kw of merged) {
    if (!kw.keyword) continue;
    // Compute scores first so we can log them even on rejection.
    const neg = matchesNegativePattern(kw.keyword, context);
    const relevance = neg ? 0 : calculateRelevanceScore(kw.keyword, context);
    const fit = neg ? 0 : calculateBusinessFitScore(kw.keyword, context);
    kw.relevance_score = relevance;
    kw.business_fit_score = fit;

    const sources = kw.source ?? [];
    const onlySiteOrRanked =
      (sources.includes('keywords_for_site') || sources.includes('ranked_keywords')) &&
      !sources.includes('keyword_ideas') &&
      !sources.includes('related_keywords');

    let reason = '';
    if (neg) reason = 'negative_pattern';
    else if (fit < 35) reason = `business_fit<${35} (${fit})`;
    else if (relevance < 45) reason = `relevance<${45} (${relevance})`;
    else if (onlySiteOrRanked && relevance < 55) reason = `site/ranked-only but relevance<${55} (${relevance})`;

    if (reason) {
      rejected.push({
        keyword: kw.keyword,
        source: sources,
        volume: kw.volume ?? 0,
        relevance_score: relevance,
        business_fit_score: fit,
        reason,
      });
      continue;
    }
    kept.push(kw);
  }
  merged = kept;

  // Expose rejected keywords so the devtools trace can explain *why* the
  // final list looks the way it does.
  pushDebugTrace(trace, '(rejected_keywords)', {
    total: rejected.length,
    sample: rejected.slice(0, 40),
  });

  // 6. Sort by fit → relevance → volume → source count, then send the top
  //    150 to the enrichment endpoints (not by volume!).
  merged.sort((a, b) => {
    const fa = a.business_fit_score ?? 0;
    const fb = b.business_fit_score ?? 0;
    if (fb !== fa) return fb - fa;
    const ra = a.relevance_score ?? 0;
    const rb = b.relevance_score ?? 0;
    if (rb !== ra) return rb - ra;
    if ((b.volume || 0) !== (a.volume || 0)) return (b.volume || 0) - (a.volume || 0);
    return (b.source?.length ?? 0) - (a.source?.length ?? 0);
  });

  const top150 = merged.slice(0, 150).map(k => k.keyword);

  // 7. Keyword overview (volume / cpc / competition / intent / trend / monthly).
  let overviewMap = new Map<string, DiscoveredKeyword>();
  if (top150.length) {
    try {
      overviewMap = await fetchKeywordOverview(top150, locationCode, languageCode, auth, trace);
    } catch (e) {
      trace.push(errEntry('keyword_overview', e));
    }
  }

  // 8. Bulk KD.
  let kdMap = new Map<string, number>();
  if (top150.length) {
    try {
      kdMap = await fetchBulkKeywordDifficulty(top150, locationCode, languageCode, auth, trace);
    } catch (e) {
      trace.push(errEntry('bulk_keyword_difficulty', e));
    }
  }

  for (const kw of merged) {
    const key = kw.keyword.toLowerCase();
    const ov = overviewMap.get(key);
    if (ov) {
      if (ov.volume > 0) kw.volume = Math.max(kw.volume, ov.volume);
      if (ov.cpc > 0) kw.cpc = ov.cpc;
      if (ov.competition_level) kw.competition_level = ov.competition_level;
      if (ov.intent) kw.intent = ov.intent;
      if (ov.trend) kw.trend = ov.trend;
      if (ov.monthly_searches?.length) kw.monthly_searches = ov.monthly_searches;
      if (typeof ov.traffic_potential === 'number') {
        kw.traffic_potential = Math.max(kw.traffic_potential ?? 0, ov.traffic_potential);
      }
    }
    const kd = kdMap.get(key);
    if (typeof kd === 'number' && kd > 0) kw.kd = kd;
  }

  // 9. Preliminary analysis score + pick top 20.
  for (const kw of merged) {
    kw.suggested_content_type = suggestedContentType(kw.keyword);
    kw.keyword_analysis_score = calculateKeywordAnalysisScore(kw);
  }
  merged.sort((a, b) => b.keyword_analysis_score - a.keyword_analysis_score);
  const top20 = merged.slice(0, 20);

  // 10. Live SERP for the top 20.
  let serpMap = new Map<string, DiscoveredSerpResult[]>();
  if (top20.length) {
    try {
      serpMap = await fetchSerpForKeywords(
        top20.map(k => k.keyword),
        locationCode,
        languageCode,
        auth,
        trace
      );
    } catch (e) {
      trace.push(errEntry('serp/google/organic', e));
    }
  }

  // 11. Attach SERP, recompute score.
  const globalCompetitorFreq = new Map<string, number>();
  for (const kw of top20) {
    const rows = serpMap.get(kw.keyword.toLowerCase()) ?? [];
    if (rows.length) {
      kw.serp_results = rows;
      kw.competitor_domains = pickCompetitorDomains(rows, ownDomain, 5);
      for (const d of kw.competitor_domains) {
        globalCompetitorFreq.set(d, (globalCompetitorFreq.get(d) ?? 0) + 1);
      }
    }
    kw.keyword_analysis_score = calculateKeywordAnalysisScore(kw);
  }

  // 12. Top-3 global competitor domains → ranked_keywords for each, then
  //     attach only the relevant ones to the matching final keyword.
  const topCompetitors = [...globalCompetitorFreq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([d]) => d);

  const competitorRanked: DiscoveredKeyword[] = [];
  for (const domain of topCompetitors) {
    try {
      const rows = await fetchRankedKeywords(domain, locationCode, languageCode, auth, trace, 20);
      for (const r of rows) competitorRanked.push(r);
    } catch (e) {
      trace.push(errEntry(`ranked_keywords(${domain})`, e));
    }
  }

  if (competitorRanked.length) {
    for (const kw of top20) {
      const primaryTokens = new Set(tokenize(kw.keyword));
      const matches: string[] = [];
      for (const c of competitorRanked) {
        if (matchesNegativePattern(c.keyword, context)) continue;
        const tokens = tokenize(c.keyword);
        const overlap =
          tokens.some(t => primaryTokens.has(t)) ||
          tokens.some(t => context.coreTokens.has(t));
        if (overlap) matches.push(c.keyword);
        if (matches.length >= 5) break;
      }
      if (matches.length) kw.competitor_ranking_keywords = matches;
    }
  }

  // 13. Final recompute + sort by analysis score descending.
  for (const kw of top20) {
    kw.keyword_analysis_score = calculateKeywordAnalysisScore(kw);
  }
  top20.sort(
    (a, b) => (b.keyword_analysis_score ?? 0) - (a.keyword_analysis_score ?? 0)
  );

  return { keywords: top20.slice(0, 20), trace };
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
