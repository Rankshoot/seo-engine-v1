'use server';

import { after } from 'next/server';
import { currentUser } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabase';
import { enqueueJob } from '@/lib/jobs/enqueue';
import { getActiveJobs, getJob, requeueStale } from '@/lib/jobs/service';
import { runJob } from '@/lib/jobs/runner';
import type { BlogGenerateJobPayload } from '@/lib/jobs/types';

async function ensureOwner(projectId: string): Promise<{ ok: boolean; userId?: string }> {
  const user = await currentUser();
  if (!user) return { ok: false };
  const { data } = await supabaseAdmin
    .from('projects')
    .select('id')
    .eq('id', projectId)
    .eq('user_id', user.id)
    .maybeSingle();
  return data ? { ok: true, userId: user.id } : { ok: false };
}

export interface StartBlogGenerationResult {
  success: boolean;
  jobId?: string;
  deduped?: boolean;
  error?: string;
}

/**
 * Enqueue a durable blog-generation job. The job runs server-side (reusing the
 * generation route under internal auth), so it survives the user refreshing or
 * navigating away. Idempotency keyed per calendar entry (or per keyword) means a
 * double-click / accidental re-submit won't spend credits twice.
 */
export async function startBlogGeneration(
  projectId: string,
  input: Omit<BlogGenerateJobPayload, 'projectId' | 'userId'>
): Promise<StartBlogGenerationResult> {
  const owner = await ensureOwner(projectId);
  if (!owner.ok || !owner.userId) return { success: false, error: 'Not authorized for this project' };

  const idempotencyKey = input.entryId
    ? `blog:${projectId}:entry:${input.entryId}`
    : `blog:${projectId}:kw:${(input.keyword || '').trim().toLowerCase()}`;

  const payload: BlogGenerateJobPayload = { ...input, projectId, userId: owner.userId };

  try {
    const { job } = await enqueueJob({
      type: 'blog_generate',
      projectId,
      userId: owner.userId,
      payload: payload as unknown as Record<string, unknown>,
      idempotencyKey,
      maxAttempts: 2,
    });
    return { success: true, jobId: job.id, deduped: job.status !== 'pending' };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Could not start generation' };
  }
}

export interface ActiveBlogJob {
  jobId: string;
  status: string;
  label: string;
  entryId?: string;
}

/**
 * Active (pending/running) blog-generation jobs for a project. Drives the
 * skeleton rows in Content History and the resume-on-refresh behaviour. Also
 * self-heals without a cron: each poll nudges pending jobs / recovers stale ones.
 */
export async function getActiveBlogGenerationJobs(
  projectId: string
): Promise<{ success: boolean; jobs: ActiveBlogJob[] }> {
  const owner = await ensureOwner(projectId);
  if (!owner.ok) return { success: false, jobs: [] };

  const jobs = await getActiveJobs(projectId, ['blog_generate']);
  if (jobs.length > 0) {
    try {
      after(async () => {
        try {
          await requeueStale();
          for (const j of jobs) {
            if (j.status === 'pending') {
              try { await runJob(j.id); } catch { /* retried on next poll */ }
            }
          }
        } catch { /* best-effort backstop */ }
      });
    } catch { /* not in a request scope */ }
  }

  return {
    success: true,
    jobs: jobs.map(j => {
      const pl = j.payload as Partial<BlogGenerateJobPayload>;
      return {
        jobId: j.id,
        status: j.status,
        label: pl.label || pl.topic || pl.keyword || 'Generating…',
        entryId: pl.entryId,
      };
    }),
  };
}

export interface BlogJobOutcome {
  success: boolean;
  status: 'pending' | 'running' | 'done' | 'failed' | 'unknown';
  blogId?: string;
  error?: string;
  entryId?: string;
}

/** Read a blog-generation job's outcome (status + resulting blogId). */
export async function getBlogGenerationOutcome(projectId: string, jobId: string): Promise<BlogJobOutcome> {
  const owner = await ensureOwner(projectId);
  if (!owner.ok) return { success: false, status: 'unknown' };
  const job = await getJob(jobId);
  if (!job || job.project_id !== projectId) return { success: false, status: 'unknown' };
  const result = (job.result ?? {}) as Record<string, unknown>;
  const pl = job.payload as Partial<BlogGenerateJobPayload>;
  return {
    success: true,
    status: job.status as BlogJobOutcome['status'],
    blogId: typeof result.blogId === 'string' ? (result.blogId as string) : undefined,
    error: job.error || undefined,
    entryId: pl.entryId,
  };
}
