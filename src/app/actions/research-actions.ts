'use server';

import { supabaseAdmin } from '@/lib/supabase';
import { currentUser } from '@clerk/nextjs/server';
import { discoverCompetitorGapKeywords, type CompetitorGapKeyword } from '@/lib/research';
import { analyzeKeywordGapStrategy } from '@/lib/gemini';
import { fetchKeywordVitals } from '@/lib/dataforseo';
import { discoverCompetitors, type BenchmarkTraceEntry } from '@/lib/competitor-benchmark';
import { getBusinessBrief } from '@/app/actions/brief-actions';
import type { Project, ProjectCompetitor } from '@/lib/types';

export interface FindCompetitorGapsResult {
  success: boolean;
  error?: string;
  data: CompetitorGapKeyword[];
  /** Domains we auto-discovered from SERP because the user hadn't added any. */
  autoDiscoveredCompetitors?: string[];
}

/**
 * When the project has no competitors on file, rank the top-of-SERP domains
 * for the project's seed keywords (business-brief seeds if we have them, else
 * niche-based fallbacks) and persist them into `project_competitors` so the
 * rest of the gap-analysis + benchmarking pipeline has something to chew on.
 *
 * Returns the freshly-persisted ProjectCompetitor rows.
 */
async function autoDiscoverProjectCompetitors(
  project: Project,
): Promise<ProjectCompetitor[]> {
  const briefRes = await getBusinessBrief(project.id);

  // Stack multiple seed sources so we have real coverage even when the
  // business brief is missing or the niche is a single narrow phrase.
  const niche = (project.niche || '').trim();
  const audience = (project.target_audience || '').trim();
  const seedSet = new Set<string>();
  for (const phrase of briefRes.brief?.seed_phrases ?? []) {
    const p = (phrase || '').trim();
    if (p) seedSet.add(p);
  }
  if (niche) {
    seedSet.add(niche);
    seedSet.add(`best ${niche}`);
    seedSet.add(`top ${niche}`);
    seedSet.add(`${niche} tools`);
    seedSet.add(`${niche} platform`);
    seedSet.add(`${niche} software`);
    if (audience) seedSet.add(`${niche} for ${audience}`);
  }
  const seeds = [...seedSet].filter(Boolean);

  const trace: BenchmarkTraceEntry[] = [];

  const discovered = await discoverCompetitors(seeds, {
    region: project.target_region,
    language: project.target_language,
    ownDomain: project.domain,
    maxSeeds: 8,
    maxCompetitors: 5,
    trace,
  });

  // Surface the full Serper trace in server logs so we can diagnose empty
  // discovery runs (missing API key, zero organic results, all-boilerplate
  // SERP, etc.) without requiring a fresh deploy.
  console.log(
    '[auto-discover-competitors]',
    JSON.stringify(
      {
        project_id: project.id,
        niche,
        region: project.target_region,
        language: project.target_language,
        serper_key_present: Boolean(process.env.SERPER_API_KEY),
        seed_count: seeds.length,
        seeds,
        found: discovered.length,
        domains: discovered.map(d => d.domain),
        trace,
      },
      null,
      0
    )
  );

  if (!discovered.length) return [];

  // Insert-or-ignore: a stray duplicate (from a race with the full benchmark
  // run) shouldn't fail the gap lookup, so we swallow that specific case.
  const rows = discovered.map(d => ({ project_id: project.id, domain: d.domain }));
  const { data: inserted, error } = await supabaseAdmin
    .from('project_competitors')
    .upsert(rows, { onConflict: 'project_id,domain', ignoreDuplicates: true })
    .select();

  if (error || !inserted?.length) {
    // Fall back to a plain read — duplicates mean rows already exist.
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
    // No competitors on file — mine real SERP competitors from Serper based on
    // the project's niche/business-brief seeds and persist them, so the rest
    // of the gap pipeline (and every future run) has something to work with.
    const discovered = await autoDiscoverProjectCompetitors(project);
    if (!discovered.length) {
      return {
        success: false,
        error:
          "We couldn't auto-discover competitors from search for this niche. Try adding a couple of known competitors on the project overview and re-run.",
        data: [],
      };
    }
    competitors = discovered;
    autoDiscoveredCompetitors = discovered.map(c => c.domain);
  }

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

  // AGENTS.md rule: never fake metrics. Hydrate real monthly volume for every
  // mined gap via DataForSEO `keyword_overview/live` (one call covers up to
  // 700 phrases). Rows where DataForSEO has no match keep volume 0 so the UI
  // renders an honest "—" instead of a random placeholder.
  if (gaps.length) {
    const vitals = await fetchKeywordVitals(
      gaps.map(g => g.keyword),
      project.target_region,
      project.target_language
    );
    for (const g of gaps) {
      const v = vitals.get(g.keyword.toLowerCase());
      if (v) g.estimatedVolume = v.volume;
    }
  }

  return { success: true, data: gaps, autoDiscoveredCompetitors };
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
