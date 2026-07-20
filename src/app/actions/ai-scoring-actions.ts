'use server';

import { supabaseAdmin } from '@/lib/supabase';
import { currentUser } from '@clerk/nextjs/server';

export type AiScoringScope = 'organic' | 'competitor';

export interface AiScoringRunStatus {
  status: 'running' | 'done' | 'error' | 'idle';
  total: number;
  completed: number;
  error?: string | null;
}

const IDLE_STATUS: AiScoringRunStatus = { status: 'idle', total: 0, completed: 0 };

export async function startAiScoringRun(projectId: string, scope: AiScoringScope, total: number): Promise<void> {
  await supabaseAdmin.from('keyword_ai_scoring_runs').upsert(
    {
      project_id: projectId,
      scope,
      status: 'running',
      total,
      completed: 0,
      error: null,
      started_at: new Date().toISOString(),
      finished_at: null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'project_id,scope' }
  );
}

export async function updateAiScoringRunProgress(
  projectId: string,
  scope: AiScoringScope,
  completed: number
): Promise<void> {
  await supabaseAdmin
    .from('keyword_ai_scoring_runs')
    .update({ completed, updated_at: new Date().toISOString() })
    .eq('project_id', projectId)
    .eq('scope', scope);
}

export async function finishAiScoringRun(
  projectId: string,
  scope: AiScoringScope,
  status: 'done' | 'error',
  error?: string
): Promise<void> {
  await supabaseAdmin
    .from('keyword_ai_scoring_runs')
    .update({ status, error: error ?? null, finished_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('project_id', projectId)
    .eq('scope', scope);
}

/** Polled by the client to restore/track scoring progress across refreshes and pages. */
export async function getAiScoringRunStatus(projectId: string, scope: AiScoringScope): Promise<AiScoringRunStatus> {
  const user = await currentUser();
  if (!user) return IDLE_STATUS;

  const { data: project } = await supabaseAdmin
    .from('projects')
    .select('id')
    .eq('id', projectId)
    .eq('user_id', user.id)
    .single();
  if (!project) return IDLE_STATUS;

  const { data } = await supabaseAdmin
    .from('keyword_ai_scoring_runs')
    .select('status, total, completed, error')
    .eq('project_id', projectId)
    .eq('scope', scope)
    .maybeSingle();

  if (!data) return IDLE_STATUS;
  return {
    status: data.status as AiScoringRunStatus['status'],
    total: data.total as number,
    completed: data.completed as number,
    error: data.error as string | null,
  };
}
