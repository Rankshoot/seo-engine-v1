/**
 * Enqueue a job and (best-effort) kick it off immediately.
 *
 * Trigger strategy (low-cost, no required infra, Cloud Run friendly):
 *   1. Persist the job (durable source of truth).
 *   2. Best-effort fire-and-forget POST to the worker route so it starts now.
 *      On Cloud Run a post-response fetch isn't guaranteed to flush, so…
 *   3. …a Cloud Scheduler cron hits /api/internal/jobs/drain every ~1 min and
 *      guarantees the job runs even if (2) didn't land.
 *
 * Set INTERNAL_BASE_URL (and optionally INTERNAL_JOBS_SECRET) in prod for the
 * immediate kick; without it, the cron drainer still processes everything.
 */

import { createJob, type CreateJobParams } from './service';
import type { JobRecord } from './types';

/**
 * Resolve the base URL to call our own worker route. Prefer explicit env, then
 * Vercel's URL, and finally derive it from the current request's host header so
 * immediate dispatch works out-of-the-box (incl. Cloud Run) with zero config.
 */
async function resolveBaseUrl(): Promise<string> {
  const env =
    process.env.INTERNAL_BASE_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '');
  if (env) return env.replace(/\/+$/, '');
  try {
    const { headers } = await import('next/headers');
    const h = await headers();
    const host = h.get('host');
    if (host) {
      const proto = h.get('x-forwarded-proto') || 'https';
      return `${proto}://${host}`;
    }
  } catch {
    /* not in a request scope — fall back to the cron drainer */
  }
  return '';
}

async function dispatch(jobId: string): Promise<void> {
  const base = await resolveBaseUrl();
  if (!base) return; // no resolvable URL → cron drainer will pick it up
  const secret = process.env.INTERNAL_JOBS_SECRET ?? '';
  try {
    // Fire-and-forget. Errors are swallowed; the cron drain is the guarantee.
    // keepalive improves the chance the request flushes after the response.
    void fetch(`${base}/api/internal/jobs/run`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-internal-secret': secret },
      body: JSON.stringify({ jobId }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* ignore — cron drain backstop */
  }
}

export async function enqueueJob(params: CreateJobParams): Promise<{ job: JobRecord; created: boolean }> {
  const { job, created } = await createJob(params);
  if (created && job.status === 'pending') await dispatch(job.id);
  return { job, created };
}
