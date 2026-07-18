'use server';

import { auth } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabase';
import { enqueueJob } from '@/lib/jobs/enqueue';
import type { BlogGenerateJobPayload } from '@/lib/jobs/types';

// Active-job polling + outcome now live in the generic `task-actions.ts`
// (TaskNotificationWatcher), so this file only owns starting a generation.

async function ensureOwner(
  projectId: string,
): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
  const { userId } = await auth();
  if (!userId) return { ok: false, error: 'Not authenticated' };
  const { data, error } = await supabaseAdmin
    .from('projects')
    .select('id')
    .eq('id', projectId)
    .eq('user_id', userId)
    .single();
  if (error || !data) return { ok: false, error: 'Project not found' };
  return { ok: true, userId };
}

export interface StartBlogGenerationResult {
  success: boolean;
  error?: string;
  jobId?: string;
  /** True when an identical in-flight generation already existed (no new paid work). */
  deduped?: boolean;
}

/**
 * Start a durable blog generation. Returns immediately with a jobId; the worker
 * (kicked now + guaranteed by the cron drain) runs it to completion regardless
 * of whether the client stays on the page — so the blog survives a refresh or
 * closed tab. The TaskNotificationWatcher polls status and notifies on finish.
 */
export async function startBlogGeneration(
  projectId: string,
  payload: Omit<BlogGenerateJobPayload, 'userId' | 'projectId'>,
  idempotencyKey: string,
): Promise<StartBlogGenerationResult> {
  const owner = await ensureOwner(projectId);
  if (!owner.ok) return { success: false, error: owner.error };

  if (!payload.entryId && !payload.keyword) {
    return { success: false, error: 'A keyword or a calendar entry is required.' };
  }

  const jobPayload: BlogGenerateJobPayload = {
    ...payload,
    projectId,
    userId: owner.userId,
  };

  try {
    const { job, created } = await enqueueJob({
      type: 'blog_generate',
      projectId,
      userId: owner.userId,
      payload: jobPayload as unknown as Record<string, unknown>,
      idempotencyKey,
    });
    return { success: true, jobId: job.id, deduped: !created };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Could not start generation' };
  }
}
