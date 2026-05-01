/**
 * Ahrefs API v3 client.
 *
 * This is the primary SEO data source for the platform. It powers:
 *   â€¢ Competitor discovery (Site Explorer / organic-competitors)
 *   â€¢ Per-competitor ranking pages with exact URL + keyword + volume
 *     (Site Explorer / organic-keywords + top-pages)
 *   â€¢ Keyword research (Keywords Explorer / overview + matching-terms +
 *     related-terms)
 *
 * Falls back to the existing DataForSEO + Serper code paths when AHREFS_API_KEY
 * is missing or an Ahrefs request fails. Every call prints a single-line
 * status to the server terminal:
 *
 *   [ahrefs] organic-competitors taggd.in (in) -> 200 18 rows in 720ms
 *   [ahrefs] keywords-explorer/overview "human resources" (in) -> 429 rate-limited
 *
 * Costs: many Ahrefs columns are billed per row (see "(N units)" notes in the
 * docs). We always send a tight `select=` list so we only pay for what we use.
 */
import { TARGET_REGIONS } from './types';

const AHREFS_BASE_URL = 'https://api.ahrefs.com/v3';

function getApiKey(): string | null {
  const key = process.env.AHREFS_API_KEY;
  return key && key.trim() ? key.trim() : null;
}

/**
 * Map our internal region code (e.g. `us`, `uk`, `in`) to an Ahrefs ISO
 * `country` parameter. Ahrefs uses lowercase 2-letter codes; `uk` must be
 * sent as `gb` to match Google's official code.
 */
function ahrefsCountry(regionCode: string): string {
  const known = TARGET_REGIONS.find(r => r.code === regionCode);
  const code = (known?.code ?? regionCode ?? 'us').toLowerCase();
  return code === 'uk' ? 'gb' : code;
}

/**
 * Returns today's date in UTC as YYYY-MM-DD.
 * The Ahrefs Site Explorer UI sends today's UTC date â€” verified by comparing
 * the browser Network tab against our server requests.
 */
function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

interface AhrefsRequestOptions {
  endpoint: string;
  query: Record<string, string | number | boolean | undefined>;
  /** Friendly label shown in terminal logs. */
  label?: string;
  /** Manual timeout in ms (defaults to 25_000). */
  timeoutMs?: number;
}

/**
 * Generic Ahrefs GET. Returns the parsed JSON body when the response is 2xx,
 * otherwise returns null and prints a clear log line.
 */
async function ahrefsGet<T = unknown>(opts: AhrefsRequestOptions): Promise<T | null> {
  const tag = opts.label ?? opts.endpoint;
  const key = getApiKey();
  if (!key) {
    console.warn(`[ahrefs] ${tag} skipped â€” AHREFS_API_KEY missing`);
    console.log('[ahrefs:request]', {
      endpoint: opts.endpoint,
      label: opts.label,
      query: opts.query,
      skipped: 'no_api_key',
    });
    return null;
  }

  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(opts.query)) {
    if (v === undefined || v === null || v === '') continue;
    params.set(k, String(v));
  }
  const url = `${AHREFS_BASE_URL}${opts.endpoint}?${params.toString()}`;

  console.log('[ahrefs:request]', {
    endpoint: opts.endpoint,
    label: opts.label,
    query: opts.query,
    url,
  });

  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 25_000);

  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${key}`,
        Accept: 'application/json',
      },
      signal: controller.signal,
    });

    const ms = Date.now() - started;

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.warn(
        `[ahrefs] ${tag} -> ${res.status} ${res.statusText} in ${ms}ms ${body.slice(0, 200)}`
      );
      console.log('[ahrefs:response:error]', {
        endpoint: opts.endpoint,
        label: opts.label,
        status: res.status,
        statusText: res.statusText,
        ms,
        bodyText: body,
      });
      return null;
    }

    const json = (await res.json()) as Record<string, unknown>;
    const rowCount = primaryArrayLength(json);
    console.log(`[ahrefs] ${tag} -> ${res.status} ${rowCount} rows in ${ms}ms`);
    console.log('[ahrefs:response]', {
      endpoint: opts.endpoint,
      label: opts.label,
      status: res.status,
      ms,
      rowCount,
      body: json,
    });
    console.log(`[ahrefs-raw] ${opts.label ?? opts.endpoint}`, JSON.stringify(json, null, 2));
    return json as T;
  } catch (error) {
    const ms = Date.now() - started;
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[ahrefs] ${tag} ERROR in ${ms}ms ${message}`);
    console.log('[ahrefs:response:network_error]', {
      endpoint: opts.endpoint,
      label: opts.label,
      ms,
      error: message,
    });
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function primaryArrayLength(json: Record<string, unknown>): number {
  for (const key of Object.keys(json)) {
    const value = json[key];
    if (Array.isArray(value)) return value.length;
  }
  return 0;
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Site Explorer
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export interface AhrefsCompetitor {
  competitor_domain: string;
  domain_rating: number | null;
  /** Keywords both you and the competitor rank for (Ahrefs â€œCommon keywordsâ€). */
  keywords_common: number;
  /**
   * Keywords the competitor ranks for that **you do not** â€” not their total
   * organic keyword count. See `ahrefsCompetitorOrganicTotal`.
   */
  keywords_competitor: number;
  /** Keywords you rank for that the competitor does not. */
  keywords_target: number;
  /** Ahrefs â€œShareâ€ % (same as Site Explorer table). */
  share: number | null;
  traffic: number | null;
  /** Estimated monthly value of organic traffic, USD cents. */
  value: number | null;
  pages: number | null;
}

interface AhrefsCompetitorRow {
  competitor_domain?: string | null;
  competitor_url?: string | null;
  domain_rating?: number | null;
  keywords_common?: number | null;
  keywords_competitor?: number | null;
  keywords_target?: number | null;
  share?: number | null;
  traffic?: number | null;
  value?: number | null;
  pages?: number | null;
}

/** Ahrefs UI column â€œCompetitorâ€™s keywordsâ€ = common + competitor-only. */
export function ahrefsCompetitorOrganicTotal(c: AhrefsCompetitor): number {
  return Math.max(0, (c.keywords_common ?? 0) + (c.keywords_competitor ?? 0));
}

/** Ahrefs UI column â€œTargetâ€™s keywordsâ€ = common + target-only. */
export function ahrefsTargetOrganicTotal(c: AhrefsCompetitor): number {
  return Math.max(0, (c.keywords_common ?? 0) + (c.keywords_target ?? 0));
}

/**
 * Returns competitor domains for a target site, sorted by `traffic_merged`.
 * Uses the live Ahrefs SERP overlap index â€” much more accurate than seed-based
 * Serper SERP scraping.
 */
export async function ahrefsOrganicCompetitors(
  target: string,
  region: string,
  limit = 12
): Promise<AhrefsCompetitor[]> {
  if (!target) return [];
  const json = await ahrefsGet<{ competitors?: AhrefsCompetitorRow[] }>({
    endpoint: '/site-explorer/organic-competitors',
    label: `organic-competitors ${target} (${region})`,
    query: {
      target,
      country: ahrefsCountry(region),
      // No mode param -> Ahrefs defaults to subdomains (same as Site Explorer UI).
      date: todayISO(),
      volume_mode: 'monthly',
      limit,
      order_by: 'traffic:desc',
      // select matches Ahrefs Site Explorer UI Network tab exactly.
      select:
        'keywords_competitor,keywords_common,keywords_target,share,domain_rating,traffic,value,pages,group_mode,competitor_domain,competitor_url',

    },
  });
  if (!json?.competitors) return [];
  return json.competitors
    .filter(row => Boolean(row.competitor_domain))
    .map(row => ({
      competitor_domain: row.competitor_domain ?? '',
      domain_rating: row.domain_rating ?? null,
      keywords_common: Number(row.keywords_common ?? 0),
      keywords_competitor: Number(row.keywords_competitor ?? 0),
      keywords_target: Number(row.keywords_target ?? 0),
      share: row.share != null && Number.isFinite(Number(row.share)) ? Number(row.share) : null,
      traffic: row.traffic ?? null,
      value: row.value != null && Number.isFinite(Number(row.value)) ? Number(row.value) : null,
      pages: row.pages != null && Number.isFinite(Number(row.pages)) ? Number(row.pages) : null,
    }))
    .filter(row => row.competitor_domain);
}

export interface AhrefsTopPage {
  url: string;
  top_keyword: string | null;
  top_keyword_volume: number | null;
  top_keyword_best_position: number | null;
  sum_traffic: number;
  /** Ahrefs estimated paid traffic value in **cents** â€” convert at UI/format layer. */
  value: number | null;
}

interface AhrefsTopPageRow {
  url?: string | null;
  top_keyword?: string | null;
  top_keyword_volume?: number | null;
  top_keyword_best_position?: number | null;
  sum_traffic?: number | null;
  value?: number | null;
}

/**
 * Returns the highest-traffic pages for a domain, ordered by sum_traffic desc.
 * Each row includes the page's "top keyword" and the position it ranks in.
 */
export async function ahrefsTopPages(
  target: string,
  region: string,
  limit = 30
): Promise<AhrefsTopPage[]> {
  if (!target) return [];
  const json = await ahrefsGet<{ pages?: AhrefsTopPageRow[] }>({
    endpoint: '/site-explorer/top-pages',
    label: `top-pages ${target} (${region})`,
    query: {
      target,
      country: ahrefsCountry(region),
      protocol: 'both',
      mode: 'subdomains',
      date: todayISO(),
      volume_mode: 'monthly',
      limit,
      // Available columns exclude sum_traffic_*; use UR as a proxy for importance.
      order_by: 'ur:desc',
      select: 'url,top_keyword,top_keyword_volume,top_keyword_best_position,sum_traffic,value',
    },
  });
  if (!json?.pages) return [];
  return json.pages
    .filter(row => Boolean(row.url))
    .map(row => ({
      url: row.url ?? '',
      top_keyword: row.top_keyword ?? null,
      top_keyword_volume: row.top_keyword_volume ?? null,
      top_keyword_best_position: row.top_keyword_best_position ?? null,
      sum_traffic: Number(row.sum_traffic ?? 0),
      value: row.value ?? null,
    }))
    .filter(row => row.url);
}

export interface AhrefsOrganicKeyword {
  keyword: string;
  volume: number;
  /** Site Explorer / organic-keywords exposes KD as `keyword_difficulty`. */
  keyword_difficulty: number | null;
  /** CPC is returned in **cents** by Ahrefs â€” convert at the UI/format layer. */
  cpc: number | null;
  best_position: number | null;
  best_position_url: string;
  sum_traffic: number;
}

interface AhrefsOrganicKeywordRow {
  keyword?: string | null;
  volume?: number | null;
  keyword_difficulty?: number | null;
  keyword_keyword_difficulty?: number | null;
  cpc?: number | null;
  best_position?: number | null;
  best_position_url?: string | null;
  sum_traffic?: number | null;
}

/**
 * Every keyword the target domain ranks for in the top 50 organic results,
 * sorted by traffic. Each row already includes the exact ranking page URL â€”
 * this is what we use for "Ranking page" links in the gap dashboard.
 */
export async function ahrefsOrganicKeywords(
  target: string,
  region: string,
  limit = 80
): Promise<AhrefsOrganicKeyword[]> {
  if (!target) return [];
  const json = await ahrefsGet<{ keywords?: AhrefsOrganicKeywordRow[] }>({
    endpoint: '/site-explorer/organic-keywords',
    label: `organic-keywords ${target} (${region})`,
    query: {
      target,
      country: ahrefsCountry(region),
      protocol: 'both',
      mode: 'subdomains',
      date: todayISO(),
      volume_mode: 'monthly',
      limit,
      order_by: 'sum_traffic:desc',
      where: 'best_position<=20,volume>=50',
      select: 'keyword,volume,keyword_keyword_difficulty,best_position_url',
    },
  });
  if (!json?.keywords) return [];
  return json.keywords
    .filter(row => Boolean(row.keyword) && Boolean(row.best_position_url))
    .map(row => ({
      keyword: (row.keyword ?? '').trim(),
      volume: Number(row.volume ?? 0),
      keyword_difficulty: row.keyword_keyword_difficulty ?? row.keyword_difficulty ?? null,
      cpc: row.cpc ?? null,
      best_position: row.best_position ?? null,
      best_position_url: row.best_position_url ?? '',
      sum_traffic: Number(row.sum_traffic ?? 0),
    }))
    .filter(row => row.keyword && row.best_position_url);
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Keywords Explorer
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export interface AhrefsKeywordOverviewRow {
  keyword: string;
  volume: number;
  /** Keywords-Explorer / overview exposes KD as `difficulty`. */
  difficulty: number | null;
  /** Ahrefs returns CPC in **cents** â€” convert at UI/format layer. */
  cpc: number | null;
  intents: AhrefsIntentObject | null;
  parent_topic: string | null;
  traffic_potential: number | null;
}

/**
 * One SERP feature surfaced by Ahrefs Keywords-Explorer / overview for a
 * keyword (featured snippet, PAA, video carousel, image pack, â€¦). Extra
 * Ahrefs-specific keys are tolerated via the index signature.
 */
export interface AhrefsSerpFeature {
  type: string;
  position?: number | null;
  url?: string | null;
  title?: string | null;
  [key: string]: unknown;
}

/** Detailed overview row â€” the bulk variant doesn't request these to keep cost down. */
export interface AhrefsKeywordOverviewDetailRow extends AhrefsKeywordOverviewRow {
  global_volume: number | null;
  serp_features: AhrefsSerpFeature[] | null;
}

export interface AhrefsIntentObject {
  informational?: boolean;
  navigational?: boolean;
  commercial?: boolean;
  transactional?: boolean;
  branded?: boolean;
  local?: boolean;
}

interface AhrefsOverviewRow {
  keyword?: string | null;
  volume?: number | null;
  difficulty?: number | null;
  cpc?: number | null;
  intents?: AhrefsIntentObject | null;
  parent_topic?: string | null;
  traffic_potential?: number | null;
}

/**
 * Bulk keyword stats. Send up to ~700 keywords in one call (Ahrefs allows
 * comma-separated `keywords=`). We chunk the input list to stay under the URL
 * length limit.
 */
export type AhrefsKeywordOverviewVariant = 'full' | 'lean';

export async function ahrefsKeywordOverview(
  keywords: string[],
  region: string,
  variant: AhrefsKeywordOverviewVariant = 'full'
): Promise<Map<string, AhrefsKeywordOverviewRow>> {
  const out = new Map<string, AhrefsKeywordOverviewRow>();
  if (!keywords.length) return out;

  const cleaned = [...new Set(keywords.map(k => k.trim().toLowerCase()).filter(Boolean))];
  const chunks: string[][] = [];
  for (let i = 0; i < cleaned.length; i += 80) chunks.push(cleaned.slice(i, i + 80));

  const select =
    variant === 'lean'
      ? 'keyword,volume,difficulty,cpc,intents'
      : 'keyword,volume,difficulty,cpc,intents,parent_topic,traffic_potential';

  for (const chunk of chunks) {
    const json = await ahrefsGet<{ keywords?: AhrefsOverviewRow[] }>({
      endpoint: '/keywords-explorer/overview',
      label: `keywords-explorer/overview (${variant}) x${chunk.length} (${region})`,
      query: {
        country: ahrefsCountry(region),
        keywords: chunk.join(','),
        select,
        limit: chunk.length,
      },
    });
    for (const row of json?.keywords ?? []) {
      const kw = (row.keyword ?? '').trim().toLowerCase();
      if (!kw) continue;
      out.set(kw, {
        keyword: kw,
        volume: Number(row.volume ?? 0),
        difficulty: row.difficulty ?? null,
        cpc: row.cpc ?? null,
        intents: row.intents ?? null,
        parent_topic: variant === 'lean' ? null : row.parent_topic ?? null,
        traffic_potential: variant === 'lean' ? null : row.traffic_potential ?? null,
      });
    }
  }
  return out;
}

/**
 * Single-keyword overview with the richer select list â€” adds `global_volume`
 * and `serp_features` on top of the bulk function. Used by the keyword-modal
 * route, where one extra column or two is fine; the bulk function stays lean.
 */
export async function ahrefsKeywordOverviewDetail(
  keyword: string,
  region: string
): Promise<AhrefsKeywordOverviewDetailRow | null> {
  const cleaned = keyword.trim().toLowerCase();
  if (!cleaned) return null;
  const json = await ahrefsGet<{
    keywords?: Array<{
      keyword?: string | null;
      volume?: number | null;
      global_volume?: number | null;
      difficulty?: number | null;
      cpc?: number | null;
      intents?: AhrefsIntentObject | null;
      parent_topic?: string | null;
      traffic_potential?: number | null;
      serp_features?: AhrefsSerpFeature[] | null;
    }>;
  }>({
    endpoint: '/keywords-explorer/overview',
    label: `keywords-explorer/overview/detail "${cleaned}" (${region})`,
    query: {
      country: ahrefsCountry(region),
      keywords: cleaned,
      select:
        'keyword,volume,global_volume,difficulty,cpc,intents,parent_topic,traffic_potential,serp_features',
      limit: 1,
    },
  });
  const row = json?.keywords?.[0];
  if (!row) return null;
  return {
    keyword: (row.keyword ?? cleaned).toLowerCase(),
    volume: Number(row.volume ?? 0),
    global_volume: row.global_volume ?? null,
    difficulty: row.difficulty ?? null,
    cpc: row.cpc ?? null,
    intents: row.intents ?? null,
    parent_topic: row.parent_topic ?? null,
    traffic_potential: row.traffic_potential ?? null,
    serp_features: row.serp_features ?? null,
  };
}

export interface AhrefsKeywordIdea {
  keyword: string;
  volume: number;
  /** Keywords-Explorer endpoints expose KD as `difficulty`. */
  difficulty: number | null;
  /** Ahrefs returns CPC in **cents** â€” convert at UI/format layer. */
  cpc: number | null;
  intents: AhrefsIntentObject | null;
}

interface AhrefsIdeaRow {
  keyword?: string | null;
  volume?: number | null;
  difficulty?: number | null;
  cpc?: number | null;
  intents?: AhrefsIntentObject | null;
}

/**
 * Keyword variations that contain the seed terms. `match_mode=terms` returns
 * any combination, `phrase` requires the exact phrase. We use `terms` to cast
 * a wider net and let the relevance filter narrow it down later.
 */
export async function ahrefsMatchingTerms(
  seeds: string[],
  region: string,
  limit = 100
): Promise<AhrefsKeywordIdea[]> {
  const cleaned = [...new Set(seeds.map(s => s.trim().toLowerCase()).filter(Boolean))].slice(0, 80);
  if (!cleaned.length) return [];
  const json = await ahrefsGet<{ keywords?: AhrefsIdeaRow[] }>({
    endpoint: '/keywords-explorer/matching-terms',
    label: `matching-terms x${cleaned.length} (${region})`,
    query: {
      country: ahrefsCountry(region),
      keywords: cleaned.join(','),
      select: 'keyword,volume,difficulty,intents',
      limit,
      match_mode: 'terms',
      terms: 'all',
      order_by: 'volume:desc',
    },
  });
  return mapIdeas(json?.keywords);
}

/**
 * Keywords that the top-ranking pages for `seeds` also rank for, plus
 * keywords those pages talk about. Great for content briefs and topical
 * coverage.
 */
export async function ahrefsRelatedTerms(
  seeds: string[],
  region: string,
  limit = 100
): Promise<AhrefsKeywordIdea[]> {
  const cleaned = [...new Set(seeds.map(s => s.trim().toLowerCase()).filter(Boolean))].slice(0, 80);
  if (!cleaned.length) return [];
  const json = await ahrefsGet<{ keywords?: AhrefsIdeaRow[] }>({
    endpoint: '/keywords-explorer/related-terms',
    label: `related-terms x${cleaned.length} (${region})`,
    query: {
      country: ahrefsCountry(region),
      keywords: cleaned.join(','),
      select: 'keyword,volume,difficulty,intents',
      limit,
      view_for: 'top_10',
      terms: 'all',
      order_by: 'volume:desc',
    },
  });
  return mapIdeas(json?.keywords);
}

/**
 * Auto-complete-style search suggestions Ahrefs collects from Google's
 * suggestion API. Useful for surfacing the natural variations real users type.
 */
export async function ahrefsSearchSuggestions(
  seeds: string[],
  region: string,
  limit = 100
): Promise<AhrefsKeywordIdea[]> {
  const cleaned = [...new Set(seeds.map(s => s.trim().toLowerCase()).filter(Boolean))].slice(0, 80);
  if (!cleaned.length) return [];
  const json = await ahrefsGet<{ keywords?: AhrefsIdeaRow[] }>({
    endpoint: '/keywords-explorer/search-suggestions',
    label: `search-suggestions x${cleaned.length} (${region})`,
    query: {
      country: ahrefsCountry(region),
      keywords: cleaned.join(','),
      select: 'keyword,volume,difficulty,intents',
      limit,
      order_by: 'volume:desc',
    },
  });
  return mapIdeas(json?.keywords);
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Single-seed Keywords Explorer variants â€” used by blog generation.
//
// These return their own arrays (one per Ahrefs UI tab). They are NOT merged
// into a single ideas pool because each tab carries different editorial
// signal: "matching" terms drive H2 outline, "questions" drive FAQ JSON-LD,
// "also rank for" drives entity coverage, "also talk about" drives related
// concepts. The blog pipeline stores each list separately.
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * Matching terms â€” every keyword that contains the seed phrase. Maps to the
 * "Matching terms â†’ All" tab in Ahrefs Keywords Explorer.
 */
export async function ahrefsMatchingTermsAll(
  seed: string,
  region: string,
  limit = 100
): Promise<AhrefsKeywordIdea[]> {
  const cleaned = seed.trim().toLowerCase();
  if (!cleaned) return [];
  const json = await ahrefsGet<{ keywords?: AhrefsIdeaRow[] }>({
    endpoint: '/keywords-explorer/matching-terms',
    label: `matching-terms/all "${cleaned}" (${region})`,
    query: {
      country: ahrefsCountry(region),
      keywords: cleaned,
      select: 'keyword,volume,difficulty,cpc,intents',
      limit,
      match_mode: 'terms',
      terms: 'all',
      order_by: 'volume:desc',
    },
  });
  return mapIdeas(json?.keywords);
}

/**
 * Matching terms filtered to question-style keywords ("how / what / why /
 * when / where / who / which / can / should / does"). Maps to the
 * "Matching terms â†’ Questions" tab. Drives FAQ blocks + FAQPage JSON-LD.
 */
export async function ahrefsMatchingTermsQuestions(
  seed: string,
  region: string,
  limit = 100
): Promise<AhrefsKeywordIdea[]> {
  const cleaned = seed.trim().toLowerCase();
  if (!cleaned) return [];
  const json = await ahrefsGet<{ keywords?: AhrefsIdeaRow[] }>({
    endpoint: '/keywords-explorer/matching-terms',
    label: `matching-terms/questions "${cleaned}" (${region})`,
    query: {
      country: ahrefsCountry(region),
      keywords: cleaned,
      select: 'keyword,volume,difficulty,cpc,intents',
      limit,
      match_mode: 'terms',
      terms: 'questions',
      order_by: 'volume:desc',
    },
  });
  return mapIdeas(json?.keywords);
}

/**
 * "Also rank for" â€” keywords that the top-10 SERP pages for the seed also
 * rank for. Maps to the "Related terms â†’ Also rank for" tab. Best signal
 * for the entities/topics a competing article must cover to compete.
 */
export async function ahrefsRelatedAlsoRankFor(
  seed: string,
  region: string,
  limit = 100
): Promise<AhrefsKeywordIdea[]> {
  const cleaned = seed.trim().toLowerCase();
  if (!cleaned) return [];
  const json = await ahrefsGet<{ keywords?: AhrefsIdeaRow[] }>({
    endpoint: '/keywords-explorer/related-terms',
    label: `related-terms/also-rank-for "${cleaned}" (${region})`,
    query: {
      country: ahrefsCountry(region),
      keywords: cleaned,
      select: 'keyword,volume,difficulty,cpc,intents',
      limit,
      view_for: 'top_10',
      match_against: 'also-rank-for',
      order_by: 'volume:desc',
    },
  });
  return mapIdeas(json?.keywords);
}

/**
 * "Also talk about" â€” keywords those top-10 SERP pages mention in their body
 * copy (vs. rank for). Maps to "Related terms â†’ Also talk about". Best
 * signal for the secondary keywords / synonyms an article should weave in.
 */
export async function ahrefsRelatedAlsoTalkAbout(
  seed: string,
  region: string,
  limit = 100
): Promise<AhrefsKeywordIdea[]> {
  const cleaned = seed.trim().toLowerCase();
  if (!cleaned) return [];
  const json = await ahrefsGet<{ keywords?: AhrefsIdeaRow[] }>({
    endpoint: '/keywords-explorer/related-terms',
    label: `related-terms/also-talk-about "${cleaned}" (${region})`,
    query: {
      country: ahrefsCountry(region),
      keywords: cleaned,
      select: 'keyword,volume,difficulty,cpc,intents',
      limit,
      view_for: 'top_10',
      match_against: 'also-talk-about',
      order_by: 'volume:desc',
    },
  });
  return mapIdeas(json?.keywords);
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Volume history + volume by country â€” historical and geographic demand.
// Both return their own typed arrays; they are NEVER merged into the ideas
// pool. Stored separately to power "demand is rising / dying" + region maps.
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export interface AhrefsVolumeHistoryPoint {
  /** ISO date string (Ahrefs returns month-anchored values, e.g. `2026-01-01`). */
  date: string;
  volume: number;
}

interface AhrefsVolumeHistoryRow {
  date?: string | null;
  volume?: number | null;
}

/**
 * Per-month historical search volume for one keyword. `dateFrom` / `dateTo`
 * are optional ISO `YYYY-MM-DD` strings; when omitted the Ahrefs API returns
 * its full available history.
 */
export async function ahrefsVolumeHistory(
  keyword: string,
  region: string,
  dateFrom?: string,
  dateTo?: string
): Promise<AhrefsVolumeHistoryPoint[]> {
  const cleaned = keyword.trim().toLowerCase();
  if (!cleaned) return [];
  const json = await ahrefsGet<{ metrics?: AhrefsVolumeHistoryRow[] }>({
    endpoint: '/keywords-explorer/volume-history',
    label: `volume-history "${cleaned}" (${region})`,
    query: {
      country: ahrefsCountry(region),
      keyword: cleaned,
      date_from: dateFrom,
      date_to: dateTo,
      select: 'date,volume',
    },
  });
  if (!json?.metrics) return [];
  return json.metrics
    .filter(row => Boolean(row.date))
    .map(row => ({
      date: (row.date ?? '').slice(0, 10),
      volume: Number(row.volume ?? 0),
    }));
}

export interface AhrefsVolumeByCountryRow {
  /** Lowercase ISO-2 country code, e.g. `us`, `gb`, `in`. */
  country: string;
  volume: number;
}

interface AhrefsVolumeByCountryRawRow {
  country?: string | null;
  volume?: number | null;
}

/**
 * Country-by-country search volume for one keyword. Useful for telling the
 * user "this term gets X searches in the US, Y in the UK" before they pick
 * a target region.
 */
export async function ahrefsVolumeByCountry(
  keyword: string,
  limit = 25
): Promise<AhrefsVolumeByCountryRow[]> {
  const cleaned = keyword.trim().toLowerCase();
  if (!cleaned) return [];
  const json = await ahrefsGet<{ metrics?: AhrefsVolumeByCountryRawRow[] }>({
    endpoint: '/keywords-explorer/volume-by-country',
    label: `volume-by-country "${cleaned}"`,
    query: {
      keyword: cleaned,
      select: 'country,volume',
      limit,
      order_by: 'volume:desc',
    },
  });
  if (!json?.metrics) return [];
  return json.metrics
    .filter(row => Boolean(row.country))
    .map(row => ({
      country: (row.country ?? '').toLowerCase(),
      volume: Number(row.volume ?? 0),
    }));
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// SERP Overview
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export interface AhrefsSerpPosition {
  position: number;
  url: string;
  title: string;
  domain: string;
  domain_rating: number | null;
  url_rating: number | null;
  traffic: number | null;
  refdomains: number | null;
}

interface AhrefsSerpRow {
  position?: number | null;
  url?: string | null;
  title?: string | null;
  domain?: string | null;
  domain_rating?: number | null;
  url_rating?: number | null;
  traffic?: number | null;
  refdomains?: number | null;
}

/**
 * Top-N Ahrefs-tracked SERP positions for one keyword. Replaces Serper-based
 * SERP lookups everywhere we used to call `serperSearch`. Each row carries DR,
 * UR, traffic and referring-domain count so we can score competition without
 * a second roundtrip.
 *
 * The Ahrefs API uses `top_positions` (not `limit`) to control how many
 * SERP rows come back. The `limit` argument name is preserved for backward
 * compatibility with existing callers but is sent as `top_positions`.
 */
export async function ahrefsSerpOverview(
  keyword: string,
  region: string,
  limit = 10
): Promise<AhrefsSerpPosition[]> {
  if (!keyword.trim()) return [];
  const json = await ahrefsGet<{ positions?: AhrefsSerpRow[] }>({
    endpoint: '/serp-overview/serp-overview',
    label: `serp-overview "${keyword}" (${region})`,
    query: {
      country: ahrefsCountry(region),
      keyword: keyword.trim(),
      date: todayISO(),
      select: 'position,url,title,domain,domain_rating,url_rating,traffic,refdomains',
      top_positions: limit,
    },
  });
  if (!json?.positions) return [];
  return json.positions
    .filter(row => Boolean(row.url))
    .map(row => ({
      position: Number(row.position ?? 0),
      url: row.url ?? '',
      title: row.title ?? '',
      domain: row.domain ?? '',
      domain_rating: row.domain_rating ?? null,
      url_rating: row.url_rating ?? null,
      traffic: row.traffic ?? null,
      refdomains: row.refdomains ?? null,
    }));
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Site Explorer: extra page-quality signals
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export interface AhrefsInternalLinkPage {
  url: string;
  title: string;
  links_to_target: number;
  url_rating: number | null;
}

interface AhrefsInternalLinkRow {
  url_to?: string | null;
  title_target?: string | null;
  links_to_target?: number | null;
  url_rating_target?: number | null;
}

/**
 * Pages on a domain that have the most internal links pointing TO them.
 * Used to discover the user's own pillar pages â€” perfect anchors for new
 * blog internal-link suggestions.
 */
export async function ahrefsPagesByInternalLinks(
  target: string,
  limit = 25
): Promise<AhrefsInternalLinkPage[]> {
  if (!target) return [];
  const json = await ahrefsGet<{ pages?: AhrefsInternalLinkRow[] }>({
    endpoint: '/site-explorer/pages-by-internal-links',
    label: `pages-by-internal-links ${target}`,
    query: {
      target,
      protocol: 'both',
      mode: 'subdomains',
      select: 'url_to,title_target,links_to_target,url_rating_target',
      order_by: 'links_to_target:desc',
      limit,
    },
  });
  if (!json?.pages) return [];
  return json.pages
    .filter(row => Boolean(row.url_to))
    .map(row => ({
      url: row.url_to ?? '',
      title: row.title_target ?? '',
      links_to_target: Number(row.links_to_target ?? 0),
      url_rating: row.url_rating_target ?? null,
    }));
}

/** Site Explorer overview â€” domain-rating + organic-keywords + traffic snapshot. */
export interface AhrefsDomainOverview {
  domain_rating: number | null;
  organic_traffic: number | null;
  organic_keywords: number | null;
  refdomains: number | null;
}

export async function ahrefsDomainOverview(
  target: string,
  region: string
): Promise<AhrefsDomainOverview | null> {
  if (!target) return null;
  // The /site-explorer/metrics response returns `metrics` as a plain object,
  // not an array. Correct field names: org_traffic, org_keywords (not
  // organic_traffic / organic_keywords which the API does not recognise).
  const json = await ahrefsGet<{
    metrics?: {
      domain_rating?: number | null;
      org_traffic?: number | null;
      org_keywords?: number | null;
      refdomains?: number | null;
    };
  }>({
    endpoint: '/site-explorer/metrics',
    label: `metrics ${target} (${region})`,
    query: {
      target,
      country: ahrefsCountry(region),
      protocol: 'both',
      mode: 'subdomains',
      date: todayISO(),
      volume_mode: 'monthly',
      select: 'domain_rating,org_traffic,org_keywords,refdomains',
    },
  });
  const row = json?.metrics;
  if (!row) return null;
  return {
    domain_rating: row.domain_rating ?? null,
    organic_traffic: row.org_traffic ?? null,
    organic_keywords: row.org_keywords ?? null,
    refdomains: row.refdomains ?? null,
  };
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Coverage helper â€” used by blog generation. Returns the union of matching,
// related and search-suggestion results for a single focus keyword, deduped
// and sorted by volume. The blog prompt uses this list to know which adjacent
// queries the article should cover.
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export interface AhrefsKeywordCoverage {
  /** All candidate keywords found via matching/related/suggestions, sorted desc by volume. */
  ideas: AhrefsKeywordIdea[];
  /** Live SERP top-10 for the focus keyword. */
  serp: AhrefsSerpPosition[];
}

export async function buildKeywordCoverage(
  focusKeyword: string,
  region: string
): Promise<AhrefsKeywordCoverage> {
  const seeds = [focusKeyword];
  const [matching, related, suggestions, serp] = await Promise.all([
    ahrefsMatchingTerms(seeds, region, 30),
    ahrefsRelatedTerms(seeds, region, 30),
    ahrefsSearchSuggestions(seeds, region, 30),
    ahrefsSerpOverview(focusKeyword, region, 10),
  ]);

  // Dedupe by keyword, keep the highest volume row.
  const map = new Map<string, AhrefsKeywordIdea>();
  for (const idea of [...matching, ...related, ...suggestions]) {
    const key = idea.keyword.toLowerCase();
    if (!key || key === focusKeyword.toLowerCase()) continue;
    const existing = map.get(key);
    if (!existing || idea.volume > existing.volume) map.set(key, idea);
  }
  const ideas = [...map.values()].sort((a, b) => b.volume - a.volume);

  console.log(
    `[ahrefs] coverage "${focusKeyword}" (${region}) -> ideas=${ideas.length} serp=${serp.length}`
  );
  return { ideas, serp };
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// URL-level technical + ranking signals (used by Content Audit)
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export interface AhrefsCrawledPage {
  url: string;
  http_code: number | null;
  last_visited: string | null;
  redirects_to_target: number | null;
  canonical_to_target: number | null;
  url_rating: number | null;
  links_to_target: number | null;
  nofollow_to_target: number | null;
}

interface AhrefsCrawledRow {
  url_to?: string | null;
  http_code_target?: number | null;
  last_visited_target?: string | null;
  redirects_to_target?: number | null;
  canonical_to_target?: number | null;
  url_rating_target?: number | null;
  links_to_target?: number | null;
  nofollow_to_target?: number | null;
}

export async function ahrefsCrawledPages(target: string): Promise<AhrefsCrawledPage | null> {
  if (!target) return null;
  const json = await ahrefsGet<{ pages?: AhrefsCrawledRow[] }>({
    endpoint: '/site-explorer/crawled-pages',
    label: `crawled-pages ${target}`,
    query: {
      target,
      protocol: 'both',
      mode: 'exact',
      select:
        'url_to,http_code_target,last_visited_target,redirects_to_target,canonical_to_target,url_rating_target,links_to_target,nofollow_to_target',
      limit: 1,
    },
  });
  const row = json?.pages?.[0];
  if (!row) return null;
  return {
    url: row.url_to ?? target,
    http_code: row.http_code_target ?? null,
    last_visited: row.last_visited_target ?? null,
    redirects_to_target: row.redirects_to_target ?? null,
    canonical_to_target: row.canonical_to_target ?? null,
    url_rating: row.url_rating_target ?? null,
    links_to_target: row.links_to_target ?? null,
    nofollow_to_target: row.nofollow_to_target ?? null,
  };
}

export interface AhrefsUrlKeyword {
  keyword: string;
  volume: number;
  difficulty: number | null;
  cpc: number | null;
  position: number | null;
  best_position_url: string;
  traffic: number | null;
}

interface AhrefsUrlKeywordRow {
  keyword?: string | null;
  volume?: number | null;
  keyword_difficulty?: number | null;
  cpc?: number | null;
  position?: number | null;
  best_position_url?: string | null;
  traffic?: number | null;
}

export async function ahrefsUrlOrganicKeywords(
  target: string,
  region: string,
  limit = 30
): Promise<AhrefsUrlKeyword[]> {
  if (!target) return [];
  const json = await ahrefsGet<{ keywords?: AhrefsUrlKeywordRow[] }>({
    endpoint: '/site-explorer/organic-keywords',
    label: `organic-keywords (url) ${target}`,
    query: {
      target,
      country: ahrefsCountry(region),
      protocol: 'both',
      mode: 'exact',
      date: todayISO(),
      volume_mode: 'monthly',
      limit,
      order_by: 'traffic:desc',
      select: 'keyword,volume,keyword_difficulty,cpc,position,best_position_url,traffic',
    },
  });
  if (!json?.keywords) return [];
  return json.keywords
    .filter(row => Boolean(row.keyword))
    .map(row => ({
      keyword: (row.keyword ?? '').trim(),
      volume: Number(row.volume ?? 0),
      difficulty: row.keyword_difficulty ?? null,
      cpc: row.cpc ?? null,
      position: row.position ?? null,
      best_position_url: row.best_position_url ?? target,
      traffic: row.traffic ?? null,
    }))
    .filter(row => row.keyword);
}

export interface AhrefsAnchor {
  anchor: string;
  refdomains: number;
  links: number;
}

interface AhrefsAnchorRow {
  anchor?: string | null;
  refdomains?: number | null;
  links?: number | null;
}

export async function ahrefsAnchors(
  target: string,
  limit = 20
): Promise<AhrefsAnchor[]> {
  if (!target) return [];
  const json = await ahrefsGet<{ anchors?: AhrefsAnchorRow[] }>({
    endpoint: '/site-explorer/anchors',
    label: `anchors ${target}`,
    query: {
      target,
      protocol: 'both',
      mode: 'exact',
      select: 'anchor,refdomains,links',
      order_by: 'links:desc',
      limit,
    },
  });
  if (!json?.anchors) return [];
  return json.anchors
    .filter(a => Boolean(a.anchor))
    .map(a => ({
      anchor: a.anchor ?? '',
      refdomains: Number(a.refdomains ?? 0),
      links: Number(a.links ?? 0),
    }))
    .filter(a => a.anchor);
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Rank Tracker (free) â€” competitors overview/pages/stats
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export interface AhrefsRankTrackerCompetitorKeyword {
  keyword: string;
  volume: number | null;
  competitors: Array<{
    url: string;
    position: number | null;
    traffic: number | null;
  }>;
}

export async function ahrefsRankTrackerCompetitorsOverview(params: {
  projectId: number;
  date: string;
  device: 'desktop' | 'mobile';
  limit?: number;
}): Promise<AhrefsRankTrackerCompetitorKeyword[]> {
  const { projectId, date, device, limit = 200 } = params;
  const json = await ahrefsGet<{
    keywords?: Array<{
      keyword?: string | null;
      volume?: number | null;
      competitors_list?: Array<{
        url?: string | null;
        position?: number | null;
        traffic?: number | null;
      }>;
    }>;
  }>({
    endpoint: '/rank-tracker/competitors-overview',
    label: `rt-competitors-overview ${projectId}`,
    query: {
      project_id: projectId,
      date,
      device,
      volume_mode: 'monthly',
      select: 'keyword,volume,competitors_list.url,competitors_list.position,competitors_list.traffic',
      limit,
      order_by: 'volume:desc',
    },
  });
  return (
    json?.keywords?.map(k => ({
      keyword: (k.keyword ?? '').trim(),
      volume: k.volume ?? null,
      competitors:
        k.competitors_list?.map(c => ({
          url: c.url ?? '',
          position: c.position ?? null,
          traffic: c.traffic ?? null,
        })) ?? [],
    })) ?? []
  ).filter(k => k.keyword);
}

export interface AhrefsRankTrackerCompetitorPage {
  url: string;
  title: string;
  traffic: number | null;
}

export async function ahrefsRankTrackerCompetitorsPages(params: {
  projectId: number;
  date: string;
  device: 'desktop' | 'mobile';
  limit?: number;
}): Promise<AhrefsRankTrackerCompetitorPage[]> {
  const { projectId, date, device, limit = 200 } = params;
  const json = await ahrefsGet<{
    ['competitors-pages']?: Array<{
      url?: string | null;
      title?: string | null;
      traffic?: number | null;
    }>;
  }>({
    endpoint: '/rank-tracker/competitors-pages',
    label: `rt-competitors-pages ${projectId}`,
    query: {
      project_id: projectId,
      date,
      device,
      volume_mode: 'monthly',
      select: 'url,title,traffic',
      limit,
      order_by: 'traffic:desc',
    },
  });
  return (
    json?.['competitors-pages']?.map(p => ({
      url: p.url ?? '',
      title: p.title ?? '',
      traffic: p.traffic ?? null,
    })) ?? []
  ).filter(p => p.url);
}

function mapIdeas(rows: AhrefsIdeaRow[] | undefined): AhrefsKeywordIdea[] {
  if (!rows?.length) return [];
  return rows
    .filter(row => Boolean(row.keyword))
    .map(row => ({
      keyword: (row.keyword ?? '').trim().toLowerCase(),
      volume: Number(row.volume ?? 0),
      difficulty: row.difficulty ?? null,
      cpc: row.cpc ?? null,
      intents: row.intents ?? null,
    }))
    .filter(row => row.keyword);
}

export function isAhrefsConfigured(): boolean {
  return Boolean(getApiKey());
}

/**
 * UI/formatting helper. Ahrefs returns monetary fields (CPC, page `value`,
 * etc.) as integer cents. We deliberately keep the **raw** cents value on
 * every type/storage row so we never lose precision, and we convert to
 * dollars only when rendering. Returns `null` for missing / non-finite input.
 */
export function ahrefsCentsToDollars(cents: number | null | undefined): number | null {
  if (cents === null || cents === undefined) return null;
  const n = Number(cents);
  if (!Number.isFinite(n)) return null;
  return Math.round(n) / 100;
}

