/**
 * Job execution: claim → run handler → complete/fail. Used by both the
 * immediate worker route (single job) and the cron drain route (batch).
 *
 * Safe on Cloud Run: there is no per-request timeout, so a handler can run the
 * full 30–90s audit (or longer generations) inside the worker/drain request.
 */

import { claimJob, claimNextPending, completeJob, failJob, requeueStale } from './service';
import { getJobHandler } from './handlers';
import type { JobRecord } from './types';

/** Run an already-claimed job through its handler and record the outcome. */
async function executeClaimedJob(job: JobRecord): Promise<{ ok: boolean; error?: string }> {
  const handler = getJobHandler(job.type);
  if (!handler) {
    // Retry like any other error instead of forcing an immediate permanent fail:
    // in dev (Turbopack lazy compilation) the handler registry can be transiently
    // unresolved on the very first claim after a server (re)start even though it's
    // correctly registered — a retry a few seconds later self-heals. A genuinely
    // unregistered job type still fails fast, bounded by max_attempts.
    await failJob(job, `No handler for job type "${job.type}"`);
    return { ok: false, error: 'no_handler' };
  }
  try {
    const result = await handler(job);
    await completeJob(job.id, result);
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await failJob(job, msg);
    return { ok: false, error: msg };
  }
}

/** Claim + run a specific job by id (immediate self-dispatch path). */
export async function runJob(jobId: string): Promise<{ claimed: boolean; ok?: boolean; error?: string }> {
  const job = await claimJob(jobId);
  if (!job) return { claimed: false };
  const res = await executeClaimedJob(job);
  return { claimed: true, ...res };
}

/** Drain pending jobs (cron safety-net). Requeues stale 'running' jobs first. */
export async function drainJobs(limit = 5): Promise<{ requeued: number; processed: number; failed: number }> {
  const requeued = await requeueStale();
  const jobs = await claimNextPending(limit);
  let processed = 0;
  let failed = 0;
  for (const job of jobs) {
    const res = await executeClaimedJob(job);
    if (res.ok) processed++;
    else failed++;
  }
  return { requeued, processed, failed };
}
