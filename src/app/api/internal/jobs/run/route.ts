import { runJob } from '@/lib/jobs/runner';

export const runtime = 'nodejs';
// Cloud Run has no per-request cap; this hint is for Vercel-compat only.
export const maxDuration = 300;

/** True when the caller presents the internal secret (or none is configured). */
function authorized(req: Request): boolean {
  const expected = process.env.INTERNAL_JOBS_SECRET?.trim();
  if (!expected) return true; // not configured → allow (dev / single-tenant)
  const header = req.headers.get('x-internal-secret')?.trim();
  const url = new URL(req.url);
  const query = url.searchParams.get('key')?.trim();
  return header === expected || query === expected;
}

/**
 * Worker endpoint — runs ONE job to completion. Invoked by the immediate
 * self-dispatch in enqueueJob(). Safe to call repeatedly: claiming is atomic,
 * so a job already running/done is a no-op.
 */
export async function POST(req: Request): Promise<Response> {
  if (!authorized(req)) {
    return new Response(JSON.stringify({ success: false, error: 'unauthorized' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    });
  }

  let jobId = '';
  try {
    const body = (await req.json()) as { jobId?: unknown };
    jobId = typeof body.jobId === 'string' ? body.jobId : '';
  } catch {
    /* fallthrough */
  }
  if (!jobId) {
    return new Response(JSON.stringify({ success: false, error: 'jobId required' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });
  }

  try {
    const res = await runJob(jobId);
    return new Response(JSON.stringify({ success: true, ...res }), {
      headers: { 'content-type': 'application/json' },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('[jobs/run] failed:', message);
    return new Response(JSON.stringify({ success: false, error: message }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }
}
