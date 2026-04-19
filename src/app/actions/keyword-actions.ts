'use server';

import { supabaseAdmin } from '@/lib/supabase';
import { currentUser } from '@clerk/nextjs/server';
import { discoverKeywordsForProject } from '@/lib/dataforseo';
import { Keyword, KeywordStatus } from '@/lib/types';

function aiScore(volume: number, kd: number): number {
  const volScore = Math.min((volume / 10000) * 50, 50);
  const kdScore = ((100 - kd) / 100) * 50;
  return Math.round(volScore + kdScore);
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

  const seeds = [
    project.niche,
    `best ${project.niche}`,
    `${project.niche} tools`,
    `${project.niche} software`,
    `${project.niche} guide`,
    `how to ${project.niche}`,
    `${project.niche} tips`,
    `${project.niche} for ${project.target_audience}`,
  ];

  const competitors = project.project_competitors ?? [];
  for (const c of competitors.slice(0, 3)) {
    seeds.push(c.domain.replace(/\.(com|io|net|org|co)$/, '').replace(/-/g, ' '));
  }

  const rawKeywords = await discoverKeywordsForProject(seeds.slice(0, 10), project.target_region);

  if (!rawKeywords.length) {
    return { success: false, error: 'No keywords found. Try adjusting your niche description.' };
  }

  const rows = rawKeywords.map(kw => ({
    project_id: projectId,
    keyword: kw.keyword,
    volume: kw.volume,
    kd: kw.kd,
    cpc: kw.cpc,
    trend: kw.trend,
    monthly_searches: kw.monthly_searches,
    secondary_keywords: kw.secondary_keywords,
    ai_score: aiScore(kw.volume, kw.kd),
    status: 'pending',
  }));

  const { data, error } = await supabaseAdmin
    .from('keywords')
    .upsert(rows, { onConflict: 'project_id,keyword', ignoreDuplicates: true })
    .select();

  if (error) return { success: false, error: error.message };
  return { success: true, data, count: data?.length ?? 0 };
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
