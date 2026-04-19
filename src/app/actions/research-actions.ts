'use server';

import { supabaseAdmin } from '@/lib/supabase';
import { currentUser } from '@clerk/nextjs/server';
import { discoverCompetitorGapKeywords, type CompetitorGapKeyword } from '@/lib/research';
import { analyzeKeywordGapStrategy } from '@/lib/gemini';
import type { Project, ProjectCompetitor } from '@/lib/types';

export async function findCompetitorGaps(projectId: string) {
  const user = await currentUser();
  if (!user) return { success: false, error: 'Not authenticated', data: [] };

  const { data: project, error: pErr } = await supabaseAdmin
    .from('projects')
    .select('*, project_competitors(*)')
    .eq('id', projectId)
    .eq('user_id', user.id)
    .single();

  if (pErr || !project) return { success: false, error: 'Project not found', data: [] };

  const competitors = (project.project_competitors ?? []) as ProjectCompetitor[];
  if (!competitors.length) {
    return { success: false, error: 'No competitors added to this project. Edit the project to add competitor domains.', data: [] };
  }

  // Get existing keywords to avoid duplicates
  const { data: existingKws } = await supabaseAdmin
    .from('keywords')
    .select('keyword')
    .eq('project_id', projectId);

  const existingKeywords = (existingKws ?? []).map(k => k.keyword);
  const competitorDomains = competitors.map(c => c.domain);

  const gaps = await discoverCompetitorGapKeywords(
    competitorDomains,
    project.niche,
    existingKeywords
  );

  return { success: true, data: gaps };
}

export async function analyzeKeywordGapsAction(projectId: string, gaps: CompetitorGapKeyword[]) {
  const user = await currentUser();
  if (!user) {
    return { success: false as const, error: 'Not authenticated', analysisMarkdown: '', clusterKeywords: [] as string[] };
  }

  try {
    const { data: project, error: pErr } = await supabaseAdmin
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .eq('user_id', user.id)
      .single();

    if (pErr || !project) {
      return { success: false as const, error: 'Project not found', analysisMarkdown: '', clusterKeywords: [] as string[] };
    }

    const { data: kws } = await supabaseAdmin
      .from('keywords')
      .select('keyword, volume, kd, status, ai_score')
      .eq('project_id', projectId);

    const industry = (kws ?? []) as Array<{
      keyword: string;
      volume: number;
      kd: number;
      status: string;
      ai_score: number;
    }>;

    const result = await analyzeKeywordGapStrategy(project as Project, industry, gaps);

    return {
      success: true as const,
      analysisMarkdown: result.analysisMarkdown,
      clusterKeywords: result.clusterKeywords,
    };
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Analysis failed';
    return { success: false as const, error: message, analysisMarkdown: '', clusterKeywords: [] as string[] };
  }
}

export async function importGapKeywords(projectId: string, gaps: CompetitorGapKeyword[]) {
  const user = await currentUser();
  if (!user) return { success: false, error: 'Not authenticated' };

  const rows = gaps.map(g => ({
    project_id: projectId,
    keyword: g.keyword,
    volume: g.estimatedVolume,
    kd: 0,
    cpc: 0,
    trend: '+0%',
    monthly_searches: [],
    secondary_keywords: [] as string[],
    ai_score: 35,
    status: 'pending',
    source_url: g.sourceUrl || '',
    gap_competitor: g.competitorDomain || '',
  }));

  const { data, error } = await supabaseAdmin
    .from('keywords')
    .upsert(rows, { onConflict: 'project_id,keyword', ignoreDuplicates: true })
    .select();

  if (error) return { success: false, error: error.message };
  return { success: true, count: data?.length ?? 0 };
}
