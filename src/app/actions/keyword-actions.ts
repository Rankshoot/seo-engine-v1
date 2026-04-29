'use server';

import { supabaseAdmin } from '@/lib/supabase';
import { currentUser } from '@clerk/nextjs/server';
import { discoverKeywordsForProject } from '@/lib/dataforseo';
import { Keyword, KeywordStatus } from '@/lib/types';
import { generateBusinessBrief } from './brief-actions';
import type { BusinessBrief } from '@/lib/business-brief';
import { crawlWebsite, type WebsiteCrawlResult } from '@/lib/websiteCrawler';

type KeywordCalendarSeed = {
  id: string;
  project_id: string;
  keyword: string;
  secondary_keywords: string[] | null;
};

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

  // 1. In parallel: ensure a Business Brief exists (Jina scrape — cached in
  //    `project_briefs`) and run the lightweight SEO crawler against the
  //    user's domain. `crawlWebsite` NEVER throws — it always resolves to a
  //    WebsiteCrawlResult, even when the domain is empty or the target is
  //    down (the returned object then carries an `error` field). We use that
  //    guarantee to always forward a real object into `discoverKeywordsForProject`
  //    so the `(crawled_website_context)` trace can never read "skipped".
  const [briefRes, crawlRaw] = await Promise.all([
    generateBusinessBrief(projectId, { force: false }),
    crawlWebsite(websiteDomain).catch(
      (e): WebsiteCrawlResult => ({
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
        error: e instanceof Error ? e.message : String(e),
      })
    ),
  ]);
  const crawl: WebsiteCrawlResult = crawlRaw;
  const brief = briefRes.brief;

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

  const { keywords: rawKeywords, trace: discoveryTrace } = await discoverKeywordsForProject(
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
    const firstIdeas = discoveryTrace.find(t => t.label.includes('keyword_ideas'));
    const parsed = firstIdeas?.parsed as
      | { status_code?: number; status_message?: string; tasks?: Array<{ status_code?: number; status_message?: string }> }
      | null
      | undefined;
    const apiStatus =
      parsed?.tasks?.[0]?.status_message ||
      parsed?.status_message ||
      (firstIdeas && `HTTP ${firstIdeas.httpStatus}`) ||
      'no response';
    return {
      success: false,
      error: `No keywords returned by DataForSEO (${apiStatus}). Open DevTools console for the full trace.`,
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
    trend: kw.trend,
    competition_level: kw.competition_level || null,
    intent: kw.intent || null,
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
  const { data, error } = await supabaseAdmin
    .from('keywords')
    .upsert(rows, { onConflict: 'project_id,keyword', ignoreDuplicates: true })
    .select();

  if (error)
    return {
      success: false,
      error: error.message,
      discoveryTrace,
      briefSummary: briefSummary(brief),
      relevance: relevanceSummary,
    };
  return {
    success: true,
    data,
    count: data?.length ?? 0,
    discoveryTrace,
    briefSummary: briefSummary(brief),
    relevance: relevanceSummary,
  };
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

export async function getKeywords(projectId: string) {
  const user = await currentUser();
  if (!user) return { success: false, error: 'Not authenticated', data: [] as Keyword[] };

  const { data, error } = await supabaseAdmin
    .from('keywords')
    .select('*')
    .eq('project_id', projectId)
    // Sort by the new composite analysis score; rows that were written before
    // the new column existed will have 0 and simply fall to the bottom.
    .order('keyword_analysis_score', { ascending: false, nullsFirst: false })
    .order('volume', { ascending: false });

  if (error) return { success: false, error: error.message, data: [] as Keyword[] };
  return { success: true, data: data as Keyword[] };
}

export async function updateKeywordStatus(keywordId: string, status: KeywordStatus) {
  const user = await currentUser();
  if (!user) return { success: false, error: 'Not authenticated' };

  const { data: keyword, error: kwErr } = await supabaseAdmin
    .from('keywords')
    .select('id, project_id, keyword, secondary_keywords, projects!inner(user_id)')
    .eq('id', keywordId)
    .eq('projects.user_id', user.id)
    .single();

  if (kwErr || !keyword) return { success: false, error: 'Keyword not found or unauthorized' };

  const { error } = await supabaseAdmin
    .from('keywords')
    .update({ status })
    .eq('id', keywordId);

  if (error) return { success: false, error: error.message };
  if (status === 'approved') {
    const placed = await ensureCalendarEntryForKeyword(keyword as KeywordCalendarSeed);
    if (!placed.success) return placed;
  }
  return { success: true };
}

export async function bulkUpdateKeywordStatus(keywordIds: string[], status: KeywordStatus) {
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

  const { error } = await supabaseAdmin
    .from('keywords')
    .update({ status })
    .in('id', keywordIds);

  if (error) return { success: false, error: error.message };
  if (status === 'approved') {
    const placed = await ensureCalendarEntriesForKeywords((keywords ?? []) as KeywordCalendarSeed[]);
    if (!placed.success) return placed;
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
  const { data: approvedRows, error: approvedFetchErr } = await supabaseAdmin
    .from('keywords')
    .select('id, project_id, keyword, secondary_keywords')
    .eq('project_id', projectId)
    .in('keyword', [...matched]);

  if (approvedFetchErr) return { success: false, error: approvedFetchErr.message, updated: 0 };
  const placed = await ensureCalendarEntriesForKeywords((approvedRows ?? []) as KeywordCalendarSeed[]);
  if (!placed.success) return { success: false, error: placed.error, updated: 0 };
  return { success: true, updated: matched.size };
}

async function ensureCalendarEntriesForKeywords(keywords: KeywordCalendarSeed[]) {
  for (const keyword of keywords) {
    const res = await ensureCalendarEntryForKeyword(keyword);
    if (!res.success) return res;
  }
  return { success: true };
}

async function ensureCalendarEntryForKeyword(keyword: KeywordCalendarSeed) {
  const { data: existing, error: existingErr } = await supabaseAdmin
    .from('calendar_entries')
    .select('id')
    .eq('project_id', keyword.project_id)
    .eq('keyword_id', keyword.id)
    .maybeSingle();

  if (existingErr) return { success: false, error: existingErr.message };
  if (existing) return { success: true };

  const scheduledDate = await nextCalendarSlot(keyword.project_id);
  const title = titleFromKeyword(keyword.keyword);
  const { error } = await supabaseAdmin.from('calendar_entries').insert({
    project_id: keyword.project_id,
    keyword_id: keyword.id,
    scheduled_date: scheduledDate,
    title,
    article_type: 'Blog Post',
    slug: slugify(title),
    focus_keyword: keyword.keyword,
    secondary_keywords: keyword.secondary_keywords ?? [],
    status: 'scheduled',
  });

  if (error) return { success: false, error: error.message };
  return { success: true };
}

async function nextCalendarSlot(projectId: string): Promise<string> {
  const { data } = await supabaseAdmin
    .from('calendar_entries')
    .select('scheduled_date')
    .eq('project_id', projectId)
    .order('scheduled_date', { ascending: true });

  const used = new Set((data ?? []).map(row => row.scheduled_date));
  const today = toDateOnly(new Date());
  const start = data?.[0]?.scheduled_date && data[0].scheduled_date < today ? data[0].scheduled_date : today;

  let cursor = parseLocalDate(start);
  for (let i = 0; i < Math.max((data?.length ?? 0) + 2, 32); i++) {
    const candidate = toDateOnly(cursor);
    if (!used.has(candidate)) return candidate;
    cursor.setDate(cursor.getDate() + 1);
  }

  return toDateOnly(cursor);
}

function titleFromKeyword(keyword: string): string {
  const cleaned = keyword.trim().replace(/\s+/g, ' ');
  const title = cleaned
    .split(' ')
    .map(word => (word.length <= 3 ? word : word.charAt(0).toUpperCase() + word.slice(1)))
    .join(' ');
  return `${title}: Complete Guide`;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function toDateOnly(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseLocalDate(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, (month || 1) - 1, day || 1);
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
