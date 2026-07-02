/**
 * Job handlers. A handler runs the actual work for a job type and returns a
 * small JSON result summary. It must be idempotent-friendly: re-running a job
 * (after a crash/retry) should converge to the same persisted state.
 *
 * Audit is the first handler; keyword/content/image handlers register here next.
 */

import { supabaseAdmin } from '@/lib/supabase';
import type { BlogGenerateJobPayload, ContentAuditJobPayload, JobRecord } from './types';

export type JobHandler = (job: JobRecord) => Promise<Record<string, unknown>>;

const handlers: Record<string, JobHandler> = {
  content_audit: runContentAuditJob,
  blog_generate: runBlogGenerateJob,
};

export function getJobHandler(type: string): JobHandler | null {
  return handlers[type] ?? null;
}

async function runContentAuditJob(job: JobRecord): Promise<Record<string, unknown>> {
  const p = job.payload as unknown as ContentAuditJobPayload;
  if (!p?.url || !p?.projectId) throw new Error('content_audit job missing url/projectId');

  const { auditContentUrl } = await import('@/lib/content-audit-studio');
  const { record } = await auditContentUrl({
    url: p.url,
    projectId: p.projectId,
    projectDomain: p.projectDomain,
    region: p.region ?? 'us',
    language: p.language ?? 'en',
    uploadedContent: p.uploadedContent,
    uploadedTitle: p.uploadedTitle,
    focusKeyword: p.focusKeyword || undefined,
  });

  const pageStatus = record.analysis.page_status ?? 'ok';
  // Only a real, completed audit ('ok') is worth keeping. Non-article pages,
  // unreachable/redirected/empty URLs etc. are NOT saved to history — the user
  // explicitly asked us not to store (or show) results for pages we deliberately
  // didn't audit. The warning still reaches the UI via this job's `result`.
  const isRealAudit = pageStatus === 'ok';
  const warning =
    record.analysis.plain_language_verdict || record.analysis.summary || record.error || '';

  if (isRealAudit) {
    const source = p.origin === 'upload' ? 'upload' : 'url';
    const analysis = { ...(record.analysis as unknown as Record<string, unknown>), _source: source };

    const { error } = await supabaseAdmin.from('blog_audits').upsert(
      {
        project_id: p.projectId,
        url: record.url,
        title: record.title,
        primary_keyword: record.primary_keyword,
        word_count: record.word_count,
        health_score: record.health_score,
        severity: record.severity,
        analysis,
        scraped_markdown: record.scraped_markdown ?? null,
        page_status: pageStatus,
        job_status: 'done',
        job_id: job.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'project_id,url' }
    );
    if (error) throw new Error(`persist audit failed: ${error.message}`);
  } else {
    // Remove any stale row from a previous run (e.g. a homepage that was audited
    // before the gate was tightened) so it stops showing up in Audit History.
    await supabaseAdmin.from('blog_audits').delete().eq('project_id', p.projectId).eq('url', record.url);
  }

  return {
    url: record.url,
    health_score: record.health_score,
    page_status: pageStatus,
    persisted: isRealAudit,
    warning: isRealAudit ? '' : warning,
    severity: record.severity,
  };
}

/**
 * Resolve a base URL to reach our own generation route from the worker.
 * Prefer explicit env, then Vercel's URL, then the current request's host.
 */
async function resolveInternalBaseUrl(): Promise<string> {
  const env =
    process.env.INTERNAL_BASE_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '');
  if (env) return env.replace(/\/+$/, '');
  try {
    const { headers } = await import('next/headers');
    const h = await headers();
    const host = h.get('host');
    if (host) return `${h.get('x-forwarded-proto') || 'https'}://${host}`;
  } catch {
    /* not in a request scope */
  }
  return '';
}

/**
 * blog_generate handler. Rather than duplicating the ~400-line generation
 * pipeline, the worker calls the existing SSE generation route SERVER-SIDE
 * (internal auth) and consumes the stream to completion. Because it runs in the
 * durable job — not the browser — generation survives client refresh/navigation.
 * On retry it first checks whether the entry's blog already landed, so a cut-off
 * attempt never double-generates.
 */
async function runBlogGenerateJob(job: JobRecord): Promise<Record<string, unknown>> {
  const p = job.payload as unknown as BlogGenerateJobPayload;
  if (!p?.projectId || !p?.userId) throw new Error('blog_generate job missing projectId/userId');
  if (!p.entryId && !p.keyword) throw new Error('blog_generate job missing entryId/keyword');

  // Idempotency on retry: if a blog already exists for this calendar slot, reuse it.
  if (p.entryId) {
    const { data: existing } = await supabaseAdmin
      .from('blogs')
      .select('id')
      .eq('project_id', p.projectId)
      .eq('entry_id', p.entryId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existing?.id) return { blogId: existing.id as string, reused: true };
  }

  const base = await resolveInternalBaseUrl();
  if (!base) throw new Error('No base URL available to reach the generation route');
  const secret = process.env.INTERNAL_JOBS_SECRET ?? '';

  const res = await fetch(`${base}/api/v1/blogs/generate/stream`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-internal-secret': secret },
    body: JSON.stringify({ ...p }),
  });
  if (!res.ok || !res.body) throw new Error(`generation route returned HTTP ${res.status}`);

  // Consume the SSE stream to completion; capture the terminal done/error event.
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let blogId = '';
  let errorMsg = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let sep: number;
    while ((sep = buffer.indexOf('\n\n')) !== -1) {
      const frame = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      const dataLine = frame.split('\n').find(l => l.startsWith('data: '));
      if (!dataLine) continue;
      try {
        const ev = JSON.parse(dataLine.slice(6)) as { event?: string; blogId?: string; message?: string };
        if (ev.event === 'done' && ev.blogId) blogId = ev.blogId;
        else if (ev.event === 'error') errorMsg = ev.message || 'Generation failed';
      } catch {
        /* ignore partial/non-JSON frames */
      }
    }
  }

  if (errorMsg) throw new Error(errorMsg);
  if (!blogId) throw new Error('Generation finished without returning a blogId');
  return { blogId };
}
