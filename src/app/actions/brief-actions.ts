'use server';

import { supabaseAdmin } from '@/lib/supabase';
import { currentUser } from '@clerk/nextjs/server';
import {
  buildBusinessBrief,
  type BusinessBrief,
  type BriefTraceEntry,
} from '@/lib/business-brief';

export interface BriefRow {
  project_id: string;
  brief: BusinessBrief;
  scraped_urls: string[];
  scraped_chars: number;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface BriefResult {
  success: boolean;
  error?: string;
  brief?: BusinessBrief;
  trace?: BriefTraceEntry[];
  /** True when we actually scraped + LLM'd (vs. returned the cache). */
  regenerated?: boolean;
}

/**
 * Load the current brief from Supabase. Returns `success: true, brief: null`
 * when there's no brief yet — caller should decide whether to generate one.
 */
export async function getBusinessBrief(projectId: string): Promise<{
  success: boolean;
  error?: string;
  brief: BusinessBrief | null;
  updated_at?: string;
}> {
  const user = await currentUser();
  if (!user) return { success: false, error: 'Not authenticated', brief: null };

  // Verify ownership via the parent project row.
  const { data: project, error: pErr } = await supabaseAdmin
    .from('projects')
    .select('id')
    .eq('id', projectId)
    .eq('user_id', user.id)
    .single();
  if (pErr || !project) return { success: false, error: 'Project not found', brief: null };

  const { data, error } = await supabaseAdmin
    .from('project_briefs')
    .select('brief, updated_at')
    .eq('project_id', projectId)
    .maybeSingle();

  if (error) return { success: false, error: error.message, brief: null };
  if (!data) return { success: true, brief: null };
  return {
    success: true,
    brief: data.brief as BusinessBrief,
    updated_at: data.updated_at as string,
  };
}

/**
 * Scrape the user's domain + competitors, run the LLM extractor, and persist.
 * When `force=false` (default) and a cached brief already exists, we return
 * the cache without re-billing scrape/LLM calls.
 */
export async function generateBusinessBrief(
  projectId: string,
  opts: { force?: boolean } = {}
): Promise<BriefResult> {
  const user = await currentUser();
  if (!user) return { success: false, error: 'Not authenticated' };

  const { data: project, error: pErr } = await supabaseAdmin
    .from('projects')
    .select('*, project_competitors(*)')
    .eq('id', projectId)
    .eq('user_id', user.id)
    .single();

  if (pErr || !project) return { success: false, error: 'Project not found' };

  // Fast path: cached brief exists, and caller hasn't asked for a refresh.
  if (!opts.force) {
    const { data: cached } = await supabaseAdmin
      .from('project_briefs')
      .select('brief')
      .eq('project_id', projectId)
      .maybeSingle();
    if (cached?.brief) {
      return {
        success: true,
        brief: cached.brief as BusinessBrief,
        regenerated: false,
      };
    }
  }

  // Slow path: scrape + LLM.
  const { brief, trace } = await buildBusinessBrief({
    domain: project.domain,
    company: project.company,
    niche: project.niche,
    target_audience: project.target_audience,
    description: project.description,
    competitors: (project.project_competitors ?? [])
      .map((c: { domain: string }) => c.domain)
      .filter(Boolean),
  });

  const { error: upsertErr } = await supabaseAdmin.from('project_briefs').upsert(
    {
      project_id: projectId,
      brief,
      scraped_urls: brief.source_urls,
      scraped_chars: brief.scraped_chars,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'project_id' }
  );

  if (upsertErr) {
    return { success: false, error: upsertErr.message, trace };
  }

  return { success: true, brief, trace, regenerated: true };
}
