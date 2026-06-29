'use server';

import { after } from 'next/server';
import { currentUser } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabase';
import { enqueueJob } from '@/lib/jobs/enqueue';
import { getActiveJobs, getJob, requeueStale } from '@/lib/jobs/service';
import { runJob } from '@/lib/jobs/runner';
import type { ContentAuditJobPayload } from '@/lib/jobs/types';

interface OwnedProject {
  id: string;
  domain: string;
  target_region?: string;
  target_language?: string;
}

async function ensureOwner(
  projectId: string
): Promise<{ ok: true; userId: string; project: OwnedProject } | { ok: false; error: string }> {
  const user = await currentUser();
  if (!user) return { ok: false, error: 'Not authenticated' };
  const { data, error } = await supabaseAdmin
    .from('projects')
    .select('id, domain, target_region, target_language')
    .eq('id', projectId)
    .eq('user_id', user.id)
    .single();
  if (error || !data) return { ok: false, error: 'Project not found' };
  return { ok: true, userId: user.id, project: data as OwnedProject };
}

/** Canonical URL form for the idempotency key (drop hash + trailing slash). */
function normalizeAuditUrl(raw: string): string {
  let s = raw.trim().replace(/#.*$/, '');
  s = s.replace(/\/+$/, '');
  return s;
}

export interface StartAuditResult {
  success: boolean;
  error?: string;
  jobId?: string;
  url?: string;
  /** True when an in-flight audit for this URL already existed (no new paid work). */
  deduped?: boolean;
}

/**
 * Start a resilient single-URL audit. Returns immediately with a jobId; the
 * worker runs the audit to completion regardless of whether the client stays
 * on the page. Idempotent per (project, url) so double-clicks / quick re-runs
 * reuse the in-flight job instead of paying twice.
 */
export async function startUrlAudit(
  projectId: string,
  rawUrl: string,
  opts?: { focusKeyword?: string }
): Promise<StartAuditResult> {
  const owner = await ensureOwner(projectId);
  if (!owner.ok) return { success: false, error: owner.error };

  const url = normalizeAuditUrl(rawUrl);
  if (!/^https?:\/\/.+/i.test(url)) {
    return { success: false, error: 'Please provide a valid URL starting with http:// or https://' };
  }

  const payload: ContentAuditJobPayload = {
    url,
    projectId,
    projectDomain: owner.project.domain,
    region: owner.project.target_region ?? 'us',
    language: owner.project.target_language ?? 'en',
    focusKeyword: opts?.focusKeyword,
    origin: 'url',
  };

  try {
    const { job, created } = await enqueueJob({
      type: 'content_audit',
      projectId,
      userId: owner.userId,
      payload: payload as unknown as Record<string, unknown>,
      idempotencyKey: `audit:${projectId}:${url}`,
    });
    return { success: true, jobId: job.id, url, deduped: !created };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Could not start audit' };
  }
}

export interface ActiveAuditJob {
  jobId: string;
  url: string;
  status: string;
}

/**
 * Active (pending/running) audit jobs for a project — drives the in-progress
 * skeletons and lets the page resume polling after a refresh/tab-switch.
 */
export async function getActiveAuditJobs(projectId: string): Promise<{
  success: boolean;
  jobs: ActiveAuditJob[];
}> {
  const owner = await ensureOwner(projectId);
  if (!owner.ok) return { success: false, jobs: [] };
  const jobs = await getActiveJobs(projectId, ['content_audit']);

  // Self-heal without a cron drain: while the client is polling (which it does
  // whenever audits are active), nudge this project's pending jobs and recover
  // any whose worker invocation was cut short. Runs AFTER the response so it
  // never slows the poll, and atomic claiming means no duplicate paid work.
  if (jobs.length > 0) {
    try {
      after(async () => {
        try {
          await requeueStale();
          for (const j of jobs) {
            if (j.status === 'pending') {
              try { await runJob(j.id); } catch { /* retried on the next poll */ }
            }
          }
        } catch { /* best-effort backstop */ }
      });
    } catch { /* not inside a request scope */ }
  }

  return {
    success: true,
    jobs: jobs.map(j => ({
      jobId: j.id,
      url: typeof j.payload?.url === 'string' ? (j.payload.url as string) : '',
      status: j.status,
    })),
  };
}

export interface AuditJobOutcome {
  success: boolean;
  status: 'pending' | 'running' | 'done' | 'failed' | 'unknown';
  url: string;
  /** 'ok' | 'non_content' | 'broken' | 'empty' | 'redirected' — present once finished. */
  pageStatus?: string;
  /** Human-readable note for non-audited results (non-article page, unreachable, …). */
  warning?: string;
  /** Whether a real audit row was written to history (only true for 'ok'). */
  persisted?: boolean;
  error?: string;
}

/**
 * Read the final outcome of an audit job. Works even when the result was NOT
 * saved to history (e.g. a non-article page we deliberately skip) — the verdict
 * lives in the durable job's `result`, so the page can show the right warning
 * without us having to persist a junk audit row.
 */
export async function getAuditJobOutcome(projectId: string, jobId: string): Promise<AuditJobOutcome> {
  const owner = await ensureOwner(projectId);
  if (!owner.ok) return { success: false, status: 'unknown', url: '' };
  const job = await getJob(jobId);
  if (!job || job.project_id !== projectId) return { success: false, status: 'unknown', url: '' };

  const result = (job.result ?? {}) as Record<string, unknown>;
  return {
    success: true,
    status: job.status as AuditJobOutcome['status'],
    url: typeof job.payload?.url === 'string' ? (job.payload.url as string) : '',
    pageStatus: typeof result.page_status === 'string' ? (result.page_status as string) : undefined,
    warning: typeof result.warning === 'string' && result.warning ? (result.warning as string) : undefined,
    persisted: typeof result.persisted === 'boolean' ? (result.persisted as boolean) : undefined,
    error: job.error || undefined,
  };
}
