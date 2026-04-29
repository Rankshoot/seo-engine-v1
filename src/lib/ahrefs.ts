/**
 * Ahrefs API v3 client.
 *
 * This is the primary SEO data source for the platform. It powers:
 *   • Competitor discovery (Site Explorer / organic-competitors)
 *   • Per-competitor ranking pages with exact URL + keyword + volume
 *     (Site Explorer / organic-keywords + top-pages)
 *   • Keyword research (Keywords Explorer / overview + matching-terms +
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
  const key = getApiKey();
  if (!key) {
    console.warn(`[ahrefs] ${opts.label ?? opts.endpoint} skipped — AHREFS_API_KEY missing`);
    return null;
  }

  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(opts.query)) {
    if (v === undefined || v === null || v === '') continue;
    params.set(k, String(v));
  }
  const url = `${AHREFS_BASE_URL}${opts.endpoint}?${params.toString()}`;

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
        `[ahrefs] ${opts.label ?? opts.endpoint} -> ${res.status} ${res.statusText} in ${ms}ms ${body.slice(0, 200)}`
      );
      return null;
    }

    const json = (await res.json()) as Record<string, unknown>;
    const rowCount = primaryArrayLength(json);
    console.log(
      `[ahrefs] ${opts.label ?? opts.endpoint} -> ${res.status} ${rowCount} rows in ${ms}ms`
    );
    return json as T;
  } catch (error) {
    const ms = Date.now() - started;
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[ahrefs] ${opts.label ?? opts.endpoint} ERROR in ${ms}ms ${message}`);
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

// ─────────────────────────────────────────────────────────────────────────────
// Site Explorer
// ─────────────────────────────────────────────────────────────────────────────

export interface AhrefsCompetitor {
  competitor_domain: string;
  domain_rating: number | null;
  keywords_common: number;
  keywords_competitor: number;
  traffic: number | null;
}

interface AhrefsCompetitorRow {
  competitor_domain?: string | null;
  competitor_url?: string | null;
  domain_rating?: number | null;
  keywords_common?: number | null;
  keywords_competitor?: number | null;
  traffic?: number | null;
  traffic_merged?: number | null;
}

/**
 * Returns competitor domains for a target site, sorted by `traffic_merged`.
 * Uses the live Ahrefs SERP overlap index — much more accurate than seed-based
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
      protocol: 'both',
      mode: 'subdomains',
      date: todayISO(),
      volume_mode: 'monthly',
      limit,
      order_by: 'traffic_merged:desc',
      select: 'competitor_domain,domain_rating,keywords_common,keywords_competitor,traffic,traffic_merged',
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
      traffic: row.traffic ?? row.traffic_merged ?? null,
    }))
    .filter(row => row.competitor_domain);
}

export interface AhrefsTopPage {
  url: string;
  top_keyword: string | null;
  top_keyword_volume: number | null;
  top_keyword_best_position: number | null;
  sum_traffic: number;
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
      order_by: 'sum_traffic_merged:desc',
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
  difficulty: number | null;
  cpc: number | null;
  best_position: number | null;
  best_position_url: string;
  sum_traffic: number;
}

interface AhrefsOrganicKeywordRow {
  keyword?: string | null;
  volume?: number | null;
  difficulty?: number | null;
  cpc?: number | null;
  best_position?: number | null;
  best_position_url?: string | null;
  sum_traffic?: number | null;
}

/**
 * Every keyword the target domain ranks for in the top 50 organic results,
 * sorted by traffic. Each row already includes the exact ranking page URL —
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
      select: 'keyword,volume,difficulty,cpc,best_position,best_position_url,sum_traffic',
    },
  });
  if (!json?.keywords) return [];
  return json.keywords
    .filter(row => Boolean(row.keyword) && Boolean(row.best_position_url))
    .map(row => ({
      keyword: (row.keyword ?? '').trim(),
      volume: Number(row.volume ?? 0),
      difficulty: row.difficulty ?? null,
      cpc: row.cpc ?? null,
      best_position: row.best_position ?? null,
      best_position_url: row.best_position_url ?? '',
      sum_traffic: Number(row.sum_traffic ?? 0),
    }))
    .filter(row => row.keyword && row.best_position_url);
}

// ─────────────────────────────────────────────────────────────────────────────
// Keywords Explorer
// ─────────────────────────────────────────────────────────────────────────────

export interface AhrefsKeywordOverviewRow {
  keyword: string;
  volume: number;
  difficulty: number | null;
  cpc: number | null;
  intents: AhrefsIntentObject | null;
  parent_topic: string | null;
  traffic_potential: number | null;
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
export async function ahrefsKeywordOverview(
  keywords: string[],
  region: string
): Promise<Map<string, AhrefsKeywordOverviewRow>> {
  const out = new Map<string, AhrefsKeywordOverviewRow>();
  if (!keywords.length) return out;

  const cleaned = [...new Set(keywords.map(k => k.trim().toLowerCase()).filter(Boolean))];
  const chunks: string[][] = [];
  for (let i = 0; i < cleaned.length; i += 80) chunks.push(cleaned.slice(i, i + 80));

  for (const chunk of chunks) {
    const json = await ahrefsGet<{ keywords?: AhrefsOverviewRow[] }>({
      endpoint: '/keywords-explorer/overview',
      label: `keywords-explorer/overview x${chunk.length} (${region})`,
      query: {
        country: ahrefsCountry(region),
        keywords: chunk.join(','),
        select: 'keyword,volume,difficulty,cpc,intents,parent_topic,traffic_potential',
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
        parent_topic: row.parent_topic ?? null,
        traffic_potential: row.traffic_potential ?? null,
      });
    }
  }
  return out;
}

export interface AhrefsKeywordIdea {
  keyword: string;
  volume: number;
  difficulty: number | null;
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
      select: 'keyword,volume,difficulty,cpc,intents',
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
      select: 'keyword,volume,difficulty,cpc,intents',
      limit,
      order_by: 'volume:desc',
    },
  });
  return mapIdeas(json?.keywords);
}

// ─────────────────────────────────────────────────────────────────────────────
// SERP Overview
// ─────────────────────────────────────────────────────────────────────────────

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
 * Top 10 Ahrefs-tracked SERP positions for one keyword. Replaces Serper-based
 * SERP lookups everywhere we used to call `serperSearch`. Each row carries DR,
 * UR, traffic and referring-domain count so we can score competition without
 * a second roundtrip.
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
      limit,
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

// ─────────────────────────────────────────────────────────────────────────────
// Site Explorer: extra page-quality signals
// ─────────────────────────────────────────────────────────────────────────────

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
 * Used to discover the user's own pillar pages — perfect anchors for new
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

/** Site Explorer overview — domain-rating + organic-keywords + traffic snapshot. */
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
  const json = await ahrefsGet<{ metrics?: { domain_rating?: number | null; organic_traffic?: number | null; organic_keywords?: number | null; refdomains?: number | null }[] }>({
    endpoint: '/site-explorer/metrics',
    label: `metrics ${target} (${region})`,
    query: {
      target,
      country: ahrefsCountry(region),
      protocol: 'both',
      mode: 'subdomains',
      date: todayISO(),
      volume_mode: 'monthly',
      select: 'domain_rating,organic_traffic,organic_keywords,refdomains',
    },
  });
  const row = json?.metrics?.[0];
  if (!row) return null;
  return {
    domain_rating: row.domain_rating ?? null,
    organic_traffic: row.organic_traffic ?? null,
    organic_keywords: row.organic_keywords ?? null,
    refdomains: row.refdomains ?? null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Coverage helper — used by blog generation. Returns the union of matching,
// related and search-suggestion results for a single focus keyword, deduped
// and sorted by volume. The blog prompt uses this list to know which adjacent
// queries the article should cover.
// ─────────────────────────────────────────────────────────────────────────────

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
