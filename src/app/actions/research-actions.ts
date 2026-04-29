'use server';

import { supabaseAdmin } from '@/lib/supabase';
import { currentUser } from '@clerk/nextjs/server';
import type { CompetitorGapKeyword } from '@/lib/research';
import { analyzeKeywordGapStrategy } from '@/lib/gemini';
import { fetchKeywordVitals } from '@/lib/dataforseo';
import {
  ahrefsOrganicCompetitors,
  ahrefsOrganicKeywords,
  isAhrefsConfigured,
} from '@/lib/ahrefs';
import type { BenchmarkTraceEntry } from '@/lib/competitor-benchmark';
import type { Project, ProjectCompetitor } from '@/lib/types';

export interface FindCompetitorGapsResult {
  success: boolean;
  error?: string;
  data: CompetitorGapKeyword[];
  /** Domains we auto-discovered from SERP because the user hadn't added any. */
  autoDiscoveredCompetitors?: string[];
}

/**
 * When the project has no competitors on file, ask Ahrefs Site Explorer for
 * the user's organic competitors and persist them into `project_competitors`
 * so the rest of the gap-analysis pipeline has something to chew on.
 */
async function autoDiscoverProjectCompetitors(
  project: Project,
): Promise<ProjectCompetitor[]> {
  if (!isAhrefsConfigured()) {
    console.warn('[auto-discover-competitors] AHREFS_API_KEY missing — cannot discover competitors.');
    return [];
  }

  const ownDomain = (project.domain || '').trim();
  if (!ownDomain) return [];

  const trace: BenchmarkTraceEntry[] = [];
  const discovered = await ahrefsOrganicCompetitors(
    ownDomain,
    project.target_region,
    8
  );
  trace.push({
    label: 'ahrefs_organic_competitors',
    ok: true,
    info: { domain: ownDomain, returned: discovered.length },
  });

  console.log(
    '[auto-discover-competitors]',
    JSON.stringify(
      {
        project_id: project.id,
        ownDomain,
        region: project.target_region,
        ahrefs_configured: true,
        found: discovered.length,
        domains: discovered.map(c => c.competitor_domain),
        trace,
      },
      null,
      0
    )
  );

  if (!discovered.length) return [];

  const rows = discovered.map(c => ({
    project_id: project.id,
    domain: c.competitor_domain,
  }));
  const { data: inserted, error } = await supabaseAdmin
    .from('project_competitors')
    .upsert(rows, { onConflict: 'project_id,domain', ignoreDuplicates: true })
    .select();

  if (error || !inserted?.length) {
    const { data: existing } = await supabaseAdmin
      .from('project_competitors')
      .select('*')
      .eq('project_id', project.id);
    return (existing ?? []) as ProjectCompetitor[];
  }
  return inserted as ProjectCompetitor[];
}

export async function findCompetitorGaps(projectId: string): Promise<FindCompetitorGapsResult> {
  const user = await currentUser();
  if (!user) return { success: false, error: 'Not authenticated', data: [] };

  const { data: projectRow, error: pErr } = await supabaseAdmin
    .from('projects')
    .select('*, project_competitors(*)')
    .eq('id', projectId)
    .eq('user_id', user.id)
    .single();

  if (pErr || !projectRow) return { success: false, error: 'Project not found', data: [] };
  const project = projectRow as Project & { project_competitors?: ProjectCompetitor[] };

  let competitors = (project.project_competitors ?? []) as ProjectCompetitor[];
  let autoDiscoveredCompetitors: string[] | undefined;

  if (!competitors.length) {
    // No competitors on file — discover them via Ahrefs organic-competitors.
    const discovered = await autoDiscoverProjectCompetitors(project);
    if (!discovered.length) {
      return {
        success: false,
        error:
          "Ahrefs returned 0 organic competitors for this domain. Add a couple of known competitors on the project overview and re-run.",
        data: [],
      };
    }
    competitors = discovered;
    autoDiscoveredCompetitors = discovered.map(c => c.domain);
  }

  if (!isAhrefsConfigured()) {
    return {
      success: false,
      error: 'AHREFS_API_KEY is not configured — Ahrefs is now the only data source for gap analysis.',
      data: [],
    };
  }

  const { data: existingKws } = await supabaseAdmin
    .from('keywords')
    .select('keyword')
    .eq('project_id', projectId);

  const existingSet = new Set(
    (existingKws ?? []).map(k => (k.keyword || '').toLowerCase().trim())
  );

  // Mine each competitor's top organic keywords + ranking URLs directly from
  // Ahrefs Site Explorer — this is what powers the "Ranking page" link the
  // gap dashboard now shows for every keyword.
  const gaps: CompetitorGapKeyword[] = [];
  const seen = new Set<string>();
  for (const competitor of competitors.slice(0, 5)) {
    try {
      const rows = await ahrefsOrganicKeywords(
        competitor.domain,
        project.target_region,
        50
      );
      for (const row of rows) {
        const kwLower = row.keyword.toLowerCase().trim();
        if (!kwLower || seen.has(kwLower) || existingSet.has(kwLower)) continue;
        seen.add(kwLower);
        gaps.push({
          keyword: row.keyword,
          competitorDomain: competitor.domain,
          sourceTitle: `${competitor.domain} ranks #${row.best_position ?? '?'} for "${row.keyword}"`,
          sourceUrl: row.best_position_url || `https://${competitor.domain}`,
          estimatedVolume: row.volume || 0,
        });
      }
    } catch (e) {
      console.warn(`[gaps] ahrefs organic-keywords for ${competitor.domain} failed:`, e);
    }
  }

  // Volume already comes back from organic-keywords; no second call needed.
  const finalGaps = gaps
    .sort((a, b) => b.estimatedVolume - a.estimatedVolume)
    .slice(0, 60);

  void fetchKeywordVitals;
  return { success: true, data: finalGaps, autoDiscoveredCompetitors };
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
