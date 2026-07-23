/**
 * Job handlers. A handler runs the actual work for a job type and returns a
 * small JSON result summary. It must be idempotent-friendly: re-running a job
 * (after a crash/retry) should converge to the same persisted state.
 *
 * Audit is the first handler; keyword/content/image handlers register here next.
 */

import { supabaseAdmin } from '@/lib/supabase';
import type {
  ContentAuditJobPayload,
  SiteAuditScanJobPayload,
  BlogGenerateJobPayload,
  ContentSourceIngestJobPayload,
  JobRecord,
} from './types';

export type JobHandler = (job: JobRecord) => Promise<Record<string, unknown>>;

const handlers: Record<string, JobHandler> = {
  content_audit: runContentAuditJob,
  site_audit_scan: runSiteAuditScanJob,
  blog_generate: runBlogGenerateJob,
  content_source_ingest: runContentSourceIngestJob,
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
 * Site-wide LLM-free scan of one chunk of URLs. Quick-scans each page (no
 * Claude / DataForSEO / competitor scraping) and upserts a lightweight audit
 * row. Re-running converges to the same state (upsert on project_id,url), so a
 * crashed/retried job is safe. Broken/thin/non-article pages are skipped.
 */
async function runSiteAuditScanJob(job: JobRecord): Promise<Record<string, unknown>> {
  const p = job.payload as unknown as SiteAuditScanJobPayload;
  if (!p?.projectId || !Array.isArray(p.urls) || !p.urls.length) {
    throw new Error('site_audit_scan job missing projectId/urls');
  }

  const { quickScanUrl } = await import('@/lib/content-audit-studio');
  let scanned = 0;
  let skipped = 0;

  for (const url of p.urls) {
    let record;
    try {
      record = await quickScanUrl(url);
    } catch {
      skipped++;
      continue;
    }
    // Skip pages we deliberately don't store (thin, root, unreadable). We DO
    // store 'broken' rows so the user sees dead URLs in Audit History.
    if (!record) { skipped++; continue; }

    // Never downgrade an existing DEEP (full LLM) audit to a quick scan.
    const { data: existing } = await supabaseAdmin
      .from('blog_audits')
      .select('analysis')
      .eq('project_id', p.projectId)
      .eq('url', record.url)
      .maybeSingle();
    const existingTier = (existing?.analysis as { tier?: string } | null)?.tier;
    if (existing && existingTier !== 'quick') { skipped++; continue; }

    const analysis = { ...(record.analysis as unknown as Record<string, unknown>), _source: 'site_scan' };
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
        page_status: record.analysis.page_status ?? 'ok',
        job_status: 'done',
        job_id: job.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'project_id,url' }
    );
    if (error) { skipped++; continue; }
    scanned++;
  }

  return { scanned, skipped, total: p.urls.length };
}

/**
 * Durable blog generation. Runs the shared `runBlogGeneration` core to
 * completion server-side — independent of the client — so the blog is produced
 * and saved even if the user refreshes or closes the tab. The resolved blog id
 * is stored in the job `result` so the client poller can link to it.
 *
 * Idempotency: the pipeline upserts the blog by entry_id (calendar-linked) so a
 * retried job converges; the enqueue idempotency_key prevents duplicate paid
 * runs for the same request.
 */
async function runBlogGenerateJob(job: JobRecord): Promise<Record<string, unknown>> {
  const p = job.payload as unknown as BlogGenerateJobPayload;
  const userId = p.userId || job.user_id;
  if (!userId) throw new Error('blog_generate job missing userId');
  if (!p.entryId && (!p.projectId || !p.keyword)) {
    throw new Error('blog_generate job needs entryId OR { projectId, keyword }');
  }

  const { runBlogGeneration } = await import('@/lib/blog-generation/generate-blog');
  const { blogId } = await runBlogGeneration({ ...p, userId });

  // Closed-tab OS notification: reaches the user even if the app/browser is
  // closed. The client watcher handles the app-open case; the service worker
  // suppresses this push when a tab is already focused, so no double-notify.
  try {
    const { sendPushToUser } = await import('@/lib/server/web-push-server');
    const url = p.projectId
      ? `/projects/${p.projectId}/content-generator/blogs/${blogId}`
      : '/';
    await sendPushToUser(userId, {
      title: 'Blog ready',
      body: p.label ? `“${p.label}” has finished generating.` : 'Your blog has finished generating.',
      url,
      tag: `blogjob:${job.id}`,
    });
  } catch {
    /* push is best-effort — never fail the job over a notification */
  }

  return { blogId, label: p.label ?? '' };
}

/**
 * Durable ingestion of an uploaded knowledge source: extract → chunk → embed →
 * persist chunks, flipping the source row to 'ready' (or 'failed'). Runs here so
 * a large report (up to 100 MB) survives request timeouts. Idempotent — the
 * ingest core clears prior chunks first, so a retried job converges.
 */
async function runContentSourceIngestJob(job: JobRecord): Promise<Record<string, unknown>> {
  const p = job.payload as unknown as ContentSourceIngestJobPayload;
  if (!p?.sourceId) throw new Error('content_source_ingest job missing sourceId');

  const { ingestContentSource } = await import('@/lib/content-sources/ingest');
  const { chunkCount, charCount } = await ingestContentSource(p.sourceId);
  return { sourceId: p.sourceId, chunkCount, charCount };
}
