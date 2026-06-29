/**
 * Job handlers. A handler runs the actual work for a job type and returns a
 * small JSON result summary. It must be idempotent-friendly: re-running a job
 * (after a crash/retry) should converge to the same persisted state.
 *
 * Audit is the first handler; keyword/content/image handlers register here next.
 */

import { supabaseAdmin } from '@/lib/supabase';
import type { ContentAuditJobPayload, JobRecord } from './types';

export type JobHandler = (job: JobRecord) => Promise<Record<string, unknown>>;

const handlers: Record<string, JobHandler> = {
  content_audit: runContentAuditJob,
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
