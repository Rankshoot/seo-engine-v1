'use server';

import { supabaseAdmin } from '@/lib/supabase';
import { currentUser } from '@clerk/nextjs/server';
import { discoverKeywordsForProject } from '@/lib/dataforseo';
import { Keyword, KeywordStatus } from '@/lib/types';
import { generateBusinessBrief } from './brief-actions';
import type { BusinessBrief } from '@/lib/business-brief';
import { crawlWebsite, type WebsiteCrawlResult } from '@/lib/websiteCrawler';
import {
  runKeywordDiscovery,
  type DiscoveryResult,
  type KeywordCandidate,
} from '@/lib/keyword-discovery';
import { enrichKeywordInBackground } from '@/lib/keyword-modal';

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

  const rows = fresh.map(c => candidateToRow(projectId, c));

  const { data: inserted, error: insErr } = await supabaseAdmin
    .from('keywords')
    .upsert(rows, { onConflict: 'project_id,keyword', ignoreDuplicates: true })
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
    intents: c.intents ?? {},
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
    const ahrefsErr = discoveryTrace.find(
      t => t.label.includes('ahrefs') && t.label.includes('error')
    );
    const cfgErr = discoveryTrace.find(t => t.label === '(config)');
    const detail =
      cfgErr?.fetchError ||
      ahrefsErr?.fetchError ||
      'Ahrefs returned 0 rows for these seeds.';
    return {
      success: false,
      error: `No keywords returned by Ahrefs (${detail}). Open DevTools console for the full trace.`,
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
  // state survives. The `limit/offset` only paginates pending rows.
  const includeApproved = opts.includeApproved !== false;
  const limit = Math.max(1, Math.min(opts.limit ?? 20, 200));
  const offset = Math.max(0, opts.offset ?? 0);

  // Total pending count — drives the "Load more" affordance in the UI.
  const { count } = await supabaseAdmin
    .from('keywords')
    .select('id', { count: 'exact', head: true })
    .eq('project_id', projectId);

  const pendingPromise = supabaseAdmin
    .from('keywords')
    .select('*')
    .eq('project_id', projectId)
    .eq('status', 'pending')
    .order('keyword_analysis_score', { ascending: false, nullsFirst: false })
    .order('volume', { ascending: false })
    .range(offset, offset + limit - 1);

  const lockedPromise = includeApproved
    ? supabaseAdmin
        .from('keywords')
        .select('*')
        .eq('project_id', projectId)
        .neq('status', 'pending')
        .order('keyword_analysis_score', { ascending: false, nullsFirst: false })
        .order('volume', { ascending: false })
    : Promise.resolve({ data: [], error: null } as { data: unknown[]; error: { message: string } | null });

  const [pendingRes, lockedRes] = await Promise.all([pendingPromise, lockedPromise]);
  if (pendingRes.error)
    return { success: false, error: pendingRes.error.message, data: [] as Keyword[], total: 0 };
  if (lockedRes.error)
    return { success: false, error: lockedRes.error.message, data: [] as Keyword[], total: 0 };

  const data = [...(lockedRes.data as Keyword[] ?? []), ...(pendingRes.data as Keyword[] ?? [])];
  return { success: true, data, total: count ?? data.length };
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
    // Fire-and-forget: warm the modal cache so the blog pipeline + the
    // keyword drilldown both have ideas/overview ready when the user clicks.
    // Calendar entries are created manually on the Calendar page — not here.
    void enrichKeywordInBackground(keywordId);
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
    // Fire-and-forget warming for every newly approved keyword.
    // Calendar entries are created manually on the Calendar page — not here.
    for (const id of keywordIds) {
      void enrichKeywordInBackground(id);
    }
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
  // Calendar entries are created manually on the Calendar page — not auto-assigned here.
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
