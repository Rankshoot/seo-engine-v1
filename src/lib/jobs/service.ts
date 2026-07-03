/**
 * Durable background-job data layer (Supabase, service role).
 *
 * Concurrency model without raw SQL / SKIP LOCKED: every claim is an atomic
 * conditional UPDATE (`... WHERE id = ? AND status = 'pending'`) so only one
 * worker can transition a given job pending → running, even if the immediate
 * self-dispatch and the cron drainer race.
 */

import { supabaseAdmin } from '@/lib/supabase';
import { JOB_SELECT, type JobRecord, type JobStatus } from './types';

export interface CreateJobParams {
  type: string;
  projectId?: string | null;
  userId?: string;
  payload?: Record<string, unknown>;
  idempotencyKey?: string | null;
  maxAttempts?: number;
}

/**
 * Create a job. If an ACTIVE (pending/running) job with the same
 * idempotency_key already exists, return it instead of creating a duplicate —
 * this is what prevents duplicate paid API calls.
 */
export async function createJob(
  params: CreateJobParams
): Promise<{ job: JobRecord; created: boolean }> {
  const row = {
    type: params.type,
    project_id: params.projectId ?? null,
    user_id: params.userId ?? '',
    payload: params.payload ?? {},
    idempotency_key: params.idempotencyKey ?? null,
    max_attempts: params.maxAttempts ?? 3,
    status: 'pending' as JobStatus,
  };

  const { data, error } = await supabaseAdmin
    .from('background_jobs')
    .insert(row)
    .select(JOB_SELECT)
    .single();

  if (!error && data) return { job: data as JobRecord, created: true };

  // Unique-violation on the active-idempotency index → reuse the live job.
  if (error && (error.code === '23505' || /duplicate key|unique/i.test(error.message)) && params.idempotencyKey) {
    const existing = await findActiveByIdempotency(params.idempotencyKey);
    if (existing) return { job: existing, created: false };
  }
  throw new Error(`createJob failed: ${error?.message ?? 'unknown'}`);
}

export async function findActiveByIdempotency(key: string): Promise<JobRecord | null> {
  const { data } = await supabaseAdmin
    .from('background_jobs')
    .select(JOB_SELECT)
    .eq('idempotency_key', key)
    .in('status', ['pending', 'running'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as JobRecord | null) ?? null;
}

export async function getJob(id: string): Promise<JobRecord | null> {
  const { data } = await supabaseAdmin.from('background_jobs').select(JOB_SELECT).eq('id', id).maybeSingle();
  return (data as JobRecord | null) ?? null;
}

export async function getJobsByIds(ids: string[]): Promise<JobRecord[]> {
  if (!ids.length) return [];
  const { data } = await supabaseAdmin.from('background_jobs').select(JOB_SELECT).in('id', ids);
  return (data as JobRecord[] | null) ?? [];
}

/** Active (pending/running) jobs for a project, optionally filtered by type. */
export async function getActiveJobs(projectId: string, types?: string[]): Promise<JobRecord[]> {
  let q = supabaseAdmin
    .from('background_jobs')
    .select(JOB_SELECT)
    .eq('project_id', projectId)
    .in('status', ['pending', 'running']);
  if (types?.length) q = q.in('type', types);
  const { data } = await q.order('created_at', { ascending: true }).limit(200);
  return (data as JobRecord[] | null) ?? [];
}

/**
 * Atomically claim a specific pending job → running. Returns the claimed job,
 * or null if it was already claimed/finished by someone else.
 */
export async function claimJob(id: string): Promise<JobRecord | null> {
  // Read current attempts so we can increment without a race-prone RPC.
  const current = await getJob(id);
  if (!current || current.status !== 'pending') return null;

  const { data, error } = await supabaseAdmin
    .from('background_jobs')
    .update({
      status: 'running',
      locked_at: new Date().toISOString(),
      attempts: current.attempts + 1,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('status', 'pending') // guard: only succeeds if still pending
    .select(JOB_SELECT)
    .maybeSingle();

  if (error || !data) return null;
  return data as JobRecord;
}

/** Claim up to `limit` runnable pending jobs (best-effort, race-safe per row). */
export async function claimNextPending(limit = 5): Promise<JobRecord[]> {
  const { data: candidates } = await supabaseAdmin
    .from('background_jobs')
    .select('id')
    .eq('status', 'pending')
    .lte('run_after', new Date().toISOString())
    .order('run_after', { ascending: true })
    .limit(limit * 3); // over-fetch; some may be claimed by a racing drainer

  const claimed: JobRecord[] = [];
  for (const c of candidates ?? []) {
    const job = await claimJob((c as { id: string }).id);
    if (job) claimed.push(job);
    if (claimed.length >= limit) break;
  }
  return claimed;
}

export async function completeJob(id: string, result: Record<string, unknown>): Promise<void> {
  await supabaseAdmin
    .from('background_jobs')
    .update({
      status: 'done',
      result,
      error: '',
      finished_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);
}

/** Fail a job — retry with backoff while attempts remain, else mark failed. */
export async function failJob(job: JobRecord, message: string): Promise<void> {
  const willRetry = job.attempts < job.max_attempts;
  const backoffSec = Math.min(300, 15 * 2 ** Math.max(0, job.attempts - 1)); // 15s, 30s, 60s…
  await supabaseAdmin
    .from('background_jobs')
    .update(
      willRetry
        ? {
            status: 'pending',
            error: message.slice(0, 2000),
            locked_at: null,
            run_after: new Date(Date.now() + backoffSec * 1000).toISOString(),
            updated_at: new Date().toISOString(),
          }
        : {
            status: 'failed',
            error: message.slice(0, 2000),
            finished_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }
    )
    .eq('id', job.id);
}

/**
 * Requeue jobs stuck in 'running' (worker crashed / instance reclaimed mid-job)
 * so the drainer can pick them up again. Called at the top of each drain tick.
 */
export async function requeueStale(thresholdMs = 2 * 60 * 1000): Promise<number> {
  const cutoffDefault = new Date(Date.now() - thresholdMs).toISOString();
  const cutoffBlog = new Date(Date.now() - 10 * 60 * 1000).toISOString(); // 10 minutes for blog generate

  // 1. Requeue standard stale running jobs (non-blog_generate)
  const { data: standardStale } = await supabaseAdmin
    .from('background_jobs')
    .update({ status: 'pending', locked_at: null, updated_at: new Date().toISOString() })
    .eq('status', 'running')
    .neq('type', 'blog_generate')
    .lt('locked_at', cutoffDefault)
    .select('id');

  // 2. Requeue blog_generate stale running jobs (10 mins threshold)
  const { data: blogStale } = await supabaseAdmin
    .from('background_jobs')
    .update({ status: 'pending', locked_at: null, updated_at: new Date().toISOString() })
    .eq('status', 'running')
    .eq('type', 'blog_generate')
    .lt('locked_at', cutoffBlog)
    .select('id');

  return (standardStale?.length ?? 0) + (blogStale?.length ?? 0);
}
