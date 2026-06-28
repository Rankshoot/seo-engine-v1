import { drainJobs } from '@/lib/jobs/runner';

export const runtime = 'nodejs';
export const maxDuration = 300;

function authorized(req: Request): boolean {
  const expected = process.env.INTERNAL_JOBS_SECRET?.trim();
  if (!expected) return true;
  const header = req.headers.get('x-internal-secret')?.trim();
  const url = new URL(req.url);
  const query = url.searchParams.get('key')?.trim();
  return header === expected || query === expected;
}

/**
 * Cron drain — the guaranteed processor. Point Google Cloud Scheduler at this
 * (every 1–2 min, e.g. POST https://<host>/api/internal/jobs/drain?key=<secret>).
 * Requeues stale 'running' jobs (crash recovery), then claims + runs a bounded
 * batch of pending jobs. Each tick processes a few; the next tick continues.
 */
async function handle(req: Request): Promise<Response> {
  if (!authorized(req)) {
    return new Response(JSON.stringify({ success: false, error: 'unauthorized' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    });
  }
  const url = new URL(req.url);
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit') ?? '3') || 3, 1), 10);
  try {
    const res = await drainJobs(limit);
    return new Response(JSON.stringify({ success: true, ...res }), {
      headers: { 'content-type': 'application/json' },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('[jobs/drain] failed:', message);
    return new Response(JSON.stringify({ success: false, error: message }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }
}

export const POST = handle;
export const GET = handle;
