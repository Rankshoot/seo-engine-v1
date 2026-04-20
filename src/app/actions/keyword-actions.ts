'use server';

import { supabaseAdmin } from '@/lib/supabase';
import { currentUser } from '@clerk/nextjs/server';
import { discoverKeywordsForProject, type DiscoveredKeyword } from '@/lib/dataforseo';
import { Keyword, KeywordStatus } from '@/lib/types';
import { generateBusinessBrief } from './brief-actions';
import type { BusinessBrief } from '@/lib/business-brief';
import { filterByRelevance } from '@/lib/relevance';

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

  // 1. Ensure a Business Brief exists — this scrapes the user's own domain
  //    once and caches it. On refresh we reuse the cached brief, so the cost
  //    only hits on the first "Discover" for a project (or a manual refresh).
  const briefRes = await generateBusinessBrief(projectId, { force: false });
  const brief = briefRes.brief;

  // 2. Seeds. Prefer the brief's business-specific phrases; fall back to
  //    niche-template strings only when the brief is empty / failed.
  const seeds = buildSeedsFromBrief(brief, {
    niche: project.niche,
    audience: project.target_audience,
    competitors: (project.project_competitors ?? []).map((c: { domain: string }) => c.domain),
  });

  const { keywords: rawKeywords, trace: discoveryTrace } = await discoverKeywordsForProject(
    seeds.slice(0, 12),
    project.target_region,
    project.target_language
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

  // 3. Filter raw DataForSEO ideas against the brief so off-topic suggestions
  //    (e.g. random company names Google thinks are "creator industry")
  //    are dropped before we hit the DB.
  let filtered: DiscoveredKeyword[] = rawKeywords;
  let relevanceSummary: { kept: number; dropped: number; threshold: number; reason?: string } | null = null;
  if (brief) {
    const result = await filterByRelevance(brief, rawKeywords, { threshold: 0.55, minKept: 25 });
    filtered = result.kept;
    relevanceSummary = {
      kept: result.kept.length,
      dropped: result.dropped.length,
      threshold: result.threshold,
      reason: result.reason,
    };
  }

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
    ai_score: aiScore(kw.volume, kw.kd, kw.intent),
    status: 'pending',
  }));

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

function buildSeedsFromBrief(
  brief: BusinessBrief | undefined,
  fallback: { niche: string; audience: string; competitors: string[] }
): string[] {
  const seeds: string[] = [];
  if (brief?.seed_phrases?.length) {
    seeds.push(...brief.seed_phrases);
  }
  // Top up with niche/competitor derivatives if the brief came back short.
  if (seeds.length < 8) {
    seeds.push(
      fallback.niche,
      `best ${fallback.niche}`,
      `${fallback.niche} tools`,
      `${fallback.niche} software`,
      `${fallback.niche} for ${fallback.audience}`,
      `how to ${fallback.niche}`
    );
    for (const c of fallback.competitors.slice(0, 2)) {
      seeds.push(c.replace(/\.(com|io|net|org|co)$/, '').replace(/-/g, ' '));
    }
  }
  // Dedupe, lowercase, drop empties.
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of seeds) {
    const norm = (s || '').trim().toLowerCase();
    if (!norm || seen.has(norm)) continue;
    seen.add(norm);
    out.push(norm);
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
    .order('volume', { ascending: false });

  if (error) return { success: false, error: error.message, data: [] as Keyword[] };
  return { success: true, data: data as Keyword[] };
}

export async function updateKeywordStatus(keywordId: string, status: KeywordStatus) {
  const user = await currentUser();
  if (!user) return { success: false, error: 'Not authenticated' };

  const { error } = await supabaseAdmin
    .from('keywords')
    .update({ status })
    .eq('id', keywordId);

  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function bulkUpdateKeywordStatus(keywordIds: string[], status: KeywordStatus) {
  const user = await currentUser();
  if (!user) return { success: false, error: 'Not authenticated' };

  const { error } = await supabaseAdmin
    .from('keywords')
    .update({ status })
    .in('id', keywordIds);

  if (error) return { success: false, error: error.message };
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
  return { success: true, updated: matched.size };
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
